import { GATES,boxProbability } from '../multiregion-core.js';
import { gateFlow,flowAt } from '../probability-flow.js';

const panel=document.createElement('pre');panel.id='flowVerification';
panel.style.cssText='position:fixed;inset:12px;overflow:auto;white-space:pre-wrap;padding:24px;background:#061124;color:#d4e6ff;z-index:2000;font:12px monospace';
document.body.append(panel);
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));
const checks=[],snapshots=[];
let maxCurrentError=0,maxDensityError=0,maxRegionError=0,maxHistogramTV=0,maxLag=0,maxFailures=0,maxInvalid=0;
const check=(name,pass,detail='')=>{
  checks.push({name,pass,detail});
  panel.textContent=`${checks.filter(c=>c.pass).length}/${checks.length} passed\n${name}: ${pass?'PASS':'FAIL'} ${detail}`;
  panel.dataset.progress=name;
};
const maxDiff=(a,b)=>a.reduce((m,v,i)=>Math.max(m,Math.abs(v-b[i])),0);
async function run() {
  for(let i=0;!window.GroverMultiRegion?.isReady();i++) {if(i>2500)throw Error('Startup timeout');await turn();}
  const api=window.GroverMultiRegion;api.beginFrameRecording();api.setParticleCount(4000);
  document.getElementById('trailsToggle').click();
  async function advance(seconds) {
    let left=seconds;while(left>1e-10){const step=Math.min(.08,left);api.advanceTime(step);left-=step;await turn();}
  }
  function distribution(name,full=false) {
    const state=api.state(),stats=api.particleStats(),expected=Array.from({length:16},(_,q)=>boxProbability(state.amplitudes,q));
    const error=Math.max(...stats.bins.map((n,q)=>Math.abs(n/stats.count-expected[q])));
    maxRegionError=Math.max(maxRegionError,error);maxLag=Math.max(maxLag,stats.maxLag);
    maxFailures=Math.max(maxFailures,stats.failures);maxInvalid=Math.max(maxInvalid,stats.invalid);
    snapshots.push({name,target:state.target,progress:state.progress,error,lag:stats.maxLag,failures:stats.failures,lagging:stats.lagging,slowest:stats.slowest});
    check(`${name}: particle regions match Born density`,error<.03&&stats.invalid===0&&stats.maxLag<2e-6&&stats.failures===0,
      `max region ${(100*error).toFixed(3)}pp, lag ${stats.maxLag.toExponential(2)}, failures ${stats.failures}`);
    if(full) {
      const bins=new Float64Array(64),truth=new Float64Array(64),points=api.readParticles(),wave=api.readWave(),grid=state.grid;
      for(let i=0;i<stats.count;i++) bins[8*Math.min(7,Math.floor(points[4*i]*8))+Math.min(7,Math.floor(points[4*i+1]*8))]++;
      for(let y=0;y<grid;y++)for(let x=0;x<grid;x++) {
        const k=4*(y*grid+x),q=8*Math.min(7,Math.floor(8*x/(grid-1)))+Math.min(7,Math.floor(8*y/(grid-1)));
        truth[q]+=(wave[k]**2+wave[k+1]**2)/(grid-1)**2;
      }
      const tv=.5*bins.reduce((sum,n,q)=>sum+Math.abs(n/stats.count-truth[q]),0);maxHistogramTV=Math.max(maxHistogramTV,tv);
      check(`${name}: full 8×8 spatial histogram`,tv<.08,`TV ${(100*tv).toFixed(3)}%`);
    }
  }
  function field(reference,progress,name) {
    const data=api.readFlow(),rate=data.direction*Math.PI/data.duration,angle=data.direction*Math.PI*progress;
    const c=Math.cos(angle),s=Math.sin(angle);let currentError=0,densityError=0;
    for(let x=0;x<=12;x++)for(let y=0;y<=12;y++) {
      const ix=Math.round(x*(data.grid-1)/12),iy=Math.round(y*(data.grid-1)/12),k=4*(iy*data.grid+ix);
      const at=flowAt(reference,ix/(data.grid-1),iy/(data.grid-1),progress),v=data.current,w=data.wave;
      const j=[rate*(-s*v[k]+c*v[k+2]),rate*(-s*v[k+1]+c*v[k+3])];
      const re=w[k]+c*w[k+2]+s*w[k+3],im=w[k+1]+c*w[k+3]-s*w[k+2];
      currentError=Math.max(currentError,Math.abs(j[0]-at.current[0]),Math.abs(j[1]-at.current[1]));
      densityError=Math.max(densityError,Math.abs(re*re+im*im-at.rho));
    }
    maxCurrentError=Math.max(maxCurrentError,currentError);maxDensityError=Math.max(maxDensityError,densityError);
    check(`${name}: actual GPU current and density`,currentError<2e-5&&densityError<1e-4,`j ${currentError.toExponential(2)}, rho ${densityError.toExponential(2)}`);
  }
  api.setTarget(6);distribution('Initial',true);
  for(const [index,gate] of GATES.entries()) {
    const start=api.state().amplitudes,reference=gateFlow(start,gate.kind,6,gate.duration);
    api.startNext();let prior=0;
    for(const p of [.25,.5,.75,1]) {
      await advance((p-prior)*gate.duration);prior=p;
      field(reference,p,`Gate ${index+1} at ${p}`);distribution(`Gate ${index+1} at ${p}`,true);
      if(p===.5) {
        api.togglePause();const before=api.readParticles();await advance(.1);
        check(`Gate ${index+1}: pause freezes every particle`,maxDiff(before,api.readParticles())===0);
        api.togglePause();
      }
    }
  }
  // All target geometries, not just symmetry-equivalent corners.
  for(let target=0;target<16;target++) {
    api.setTarget(target);api.runFull();
    await advance(2.4);
    for(let round=1;round<=3;round++) {await advance(8);distribution(`Target ${target}, iteration ${round}`);}
  }
  api.setParticleCount(16000);api.setTarget(15);api.runFull();await advance(26.4);
  distribution('Maximum particle count, complete target 15',true);
  api.setParticleCount(4000);
  api.reset();api.startNext();await advance(.6);const visible=api.readParticles();
  api.reset();document.getElementById('particlesToggle').click();document.getElementById('currentToggle').click();
  api.startNext();await advance(.6);
  check('Hiding arrows and particles does not change their dynamics',maxDiff(visible,api.readParticles())===0);
  document.getElementById('particlesToggle').click();document.getElementById('currentToggle').click();
  api.reset();const before=api.readParticles();api.startNext();api.renderRecordingFrame({fps:60});
  check('Recording advances particles on the wave clock',maxDiff(before,api.readParticles())>1e-5&&Math.abs(api.state().time-1/60)<1e-12);
  api.reset();
  check('All GPU operations completed without WebGL errors',api.gpuInfo().error===0);
  const report={passed:checks.filter(c=>c.pass).length,total:checks.length,maxCurrentError,maxDensityError,maxRegionError,maxHistogramTV,maxLag,maxFailures,maxInvalid,
    gpu:api.gpuInfo(),failures:checks.filter(c=>!c.pass),snapshots};
  panel.dataset.report=JSON.stringify(report);panel.dataset.done='true';panel.textContent=JSON.stringify({...report,snapshots:undefined},null,2);
  api.endFrameRecording();
}
run().catch(error=>{panel.dataset.done='error';panel.textContent=error.stack;console.error(error);});
