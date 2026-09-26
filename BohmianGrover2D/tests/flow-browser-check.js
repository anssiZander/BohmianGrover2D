import { gridModel,boxProbability } from '../multiregion-core.js';
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
    const state=api.state(),stats=api.particleStats(),expected=Array.from({length:state.side*state.side},(_,q)=>boxProbability(state.amplitudes,q));
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
        truth[q]+=(wave[k]**2+wave[k+1]**2+wave[k+2]**2+wave[k+3]**2)/(grid-1)**2;
      }
      const tv=.5*bins.reduce((sum,n,q)=>sum+Math.abs(n/stats.count-truth[q]),0);maxHistogramTV=Math.max(maxHistogramTV,tv);
      check(`${name}: full 8×8 spatial histogram`,tv<.08,`TV ${(100*tv).toFixed(3)}%`);
    }
  }
  function field(reference,progress,name) {
    const data=api.readFlow();let currentError=0,densityError=0;
    for(let x=0;x<=12;x++)for(let y=0;y<=12;y++){
      const ix=Math.round(x*(data.grid-1)/12),iy=Math.round(y*(data.grid-1)/12),k=4*(iy*data.grid+ix);
      const at=flowAt(reference,ix/(data.grid-1),iy/(data.grid-1),progress),v=data.current,w=data.wave;
      currentError=Math.max(currentError,Math.abs(v[k]-at.current[0]),Math.abs(v[k+1]-at.current[1]),Math.abs(v[k+2]-at.spin[0]),Math.abs(v[k+3]-at.spin[1]));
      densityError=Math.max(densityError,Math.abs(w[k]**2+w[k+1]**2+w[k+2]**2+w[k+3]**2-at.rho));
    }
    maxCurrentError=Math.max(maxCurrentError,currentError);maxDensityError=Math.max(maxDensityError,densityError);
    check(`${name}: actual GPU current and density`,currentError<(data.side===5?1e-4:4e-5)&&densityError<(data.side===5?3e-4:1e-4),`j ${currentError.toExponential(2)}, rho ${densityError.toExponential(2)}`);
  }
  for(const side of [2,3,4,5]){
    api.setGridSize(side);
    const target=2*side*side-1,model=gridModel(side);
    api.setTarget(target);distribution(side+'x'+side+' initial',true);
    for(const [index,gate] of model.gates.entries()){
      const start=api.state().amplitudes,reference=gateFlow(start,gate.kind,target,gate.duration);
      api.startNext();let prior=0;
      for(const p of [.25,.5,1]){
        await advance((p-prior)*gate.duration);prior=p;
        const name=side+'x'+side+' gate '+(index+1)+' at '+p;
        field(reference,p,name);distribution(name,p===1);
        if(p===.5&&index<3){
          api.togglePause();const before=api.readParticles();await advance(.1);
          check(side+'x'+side+' gate '+index+': pause freezes particles',maxDiff(before,api.readParticles())===0);
          api.togglePause();
        }
      }
    }
  }
  api.setParticleCount(16000);api.setGridSize(5);api.setTarget(49);api.runFull();
  await advance(gridModel(5).gates.reduce((sum,g)=>sum+g.duration,0));
  check('Maximum 5x5 ensemble uses 16000 particles',api.particleStats().count===16000);
  distribution('5x5 maximum particle count, full search',true);
  api.setParticleCount(4000);api.setGridSize(2);api.setTarget(6);api.startNext();
  const first=gridModel(2).gates[0],smallReference=gateFlow(api.state().amplitudes,first.kind,6,first.duration);
  await advance(first.duration*.5);field(smallReference,.5,'5x5 to 2x2 resized GPU buffers');distribution('5x5 to 2x2 resized ensemble',true);
  api.reset();api.startNext();await advance(.6);const visible=api.readParticles();
  api.reset();document.getElementById('particlesToggle').click();document.getElementById('currentToggle').click();document.getElementById('spinToggle').click();
  const currentMode=document.getElementById('currentMode');currentMode.value='2';currentMode.dispatchEvent(new Event('change'));
  api.startNext();await advance(.6);
  check('Hiding layers and selecting spin-only arrows does not change total guidance',maxDiff(visible,api.readParticles())===0);
  document.getElementById('particlesToggle').click();document.getElementById('currentToggle').click();document.getElementById('spinToggle').click();
  currentMode.value='0';currentMode.dispatchEvent(new Event('change'));
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
