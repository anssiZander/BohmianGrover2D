import { gridModel, evolveGate, boxProbability } from '../multiregion-core.js';
import { gateFlow, flowAt } from '../probability-flow.js';

const panel=document.createElement('pre');panel.id='gridVerification';
panel.style.cssText='position:fixed;inset:12px;overflow:auto;white-space:pre-wrap;padding:24px;background:#061124;color:#d4e6ff;z-index:2000;font:12px monospace';
document.body.append(panel);
const turn=()=>new Promise(resolve=>setTimeout(resolve,0)),checks=[];
const metrics={maxWaveError:0,maxNormError:0,maxCurrentError:0,maxDensityError:0,maxRegionError:0,maxLag:0,failures:0};
function check(name,pass,detail='') {
  checks.push({name,pass,detail});
  panel.textContent=`${checks.filter(c=>c.pass).length}/${checks.length} passed\n${name}: ${pass?'PASS':'FAIL'} ${detail}`;
}
const difference=(a,b)=>Math.max(...Array.from(a,(v,i)=>Math.abs(v-b[i])));
// Direct packet-basis reconstruction, independent of the GPU sine coefficients.
function referenceWave(state,side,x,y) {
  const packet=(j,t)=>Array.from({length:side},(_,n)=>(n===side-1?1/Math.sqrt(side):Math.sqrt(2/side))*Math.sin(Math.PI*(j+.5)*(n+1)/side)*Math.SQRT2*Math.sin((n+1)*Math.PI*t)).reduce((a,b)=>a+b,0);
  const fx=Array.from({length:side},(_,j)=>packet(j,x)),fy=Array.from({length:side},(_,j)=>packet(j,y));
  let re=0,im=0;
  for(let j=0;j<side;j++)for(let k=0;k<side;k++) {
    const q=2*(side*j+k),w=fx[j]*fy[k];re+=w*state[q];im+=w*state[q+1];
  }
  return [re,im];
}
async function run() {
  for(let i=0;!window.GroverMultiRegion?.isReady();i++) {if(i>2500)throw Error('Startup timeout');await turn();}
  const api=window.GroverMultiRegion,slider=document.getElementById('gridSize');
  api.beginFrameRecording();api.setParticleCount(1000);
  document.getElementById('trailsToggle').click();
  const free=!!document.getElementById('goalGrid');
  function resize(side) {slider.value=side;slider.dispatchEvent(new Event('input',{bubbles:true}));}
  async function advance(seconds) {
    let left=seconds;
    while(left>1e-9) {const dt=Math.min(.16,left);api.advanceTime(dt);left-=dt;await turn();}
  }
  function inspectWave(name) {
    const state=api.state(),wave=api.readWave(),g=state.grid;let fieldError=0,norm=0;
    for(let k=0;k<wave.length;k+=4)norm+=(wave[k]**2+wave[k+1]**2)/(g-1)**2;
    for(let x=0;x<=12;x++)for(let y=0;y<=12;y++) {
      const ix=Math.round(x*(g-1)/12),iy=Math.round(y*(g-1)/12),k=4*(g*iy+ix),psi=referenceWave(state.amplitudes,state.side,ix/(g-1),iy/(g-1));
      fieldError=Math.max(fieldError,Math.abs(wave[k]-psi[0]),Math.abs(wave[k+1]-psi[1]));
    }
    metrics.maxWaveError=Math.max(metrics.maxWaveError,fieldError);metrics.maxNormError=Math.max(metrics.maxNormError,Math.abs(norm-1));
    check(name+' GPU wave',fieldError<2e-5&&Math.abs(norm-1)<3e-6,`field ${fieldError.toExponential(2)}, norm ${Math.abs(norm-1).toExponential(2)}`);
  }
  function inspectFlow(reference,p,name) {
    const data=api.readFlow();let currentError=0,densityError=0;
    for(let x=1;x<8;x++)for(let y=1;y<8;y++) {
      const ix=Math.round(x*(data.grid-1)/8),iy=Math.round(y*(data.grid-1)/8),k=4*(iy*data.grid+ix);
      const at=flowAt(reference,ix/(data.grid-1),iy/(data.grid-1),p),v=data.current,w=data.wave;
      let j,rho;
      if(data.mode==='free') {j=[v[k],v[k+1]];rho=w[k]**2+w[k+1]**2;}
      else {
        const angle=data.direction*Math.PI*p,c=Math.cos(angle),s=Math.sin(angle),rate=data.direction*Math.PI/data.duration;
        j=[rate*(-s*v[k]+c*v[k+2]),rate*(-s*v[k+1]+c*v[k+3])];
        rho=(w[k]+c*w[k+2]+s*w[k+3])**2+(w[k+1]+c*w[k+3]-s*w[k+2])**2;
      }
      currentError=Math.max(currentError,Math.abs(j[0]-at.current[0]),Math.abs(j[1]-at.current[1]));
      densityError=Math.max(densityError,Math.abs(rho-at.rho));
    }
    metrics.maxCurrentError=Math.max(metrics.maxCurrentError,currentError);metrics.maxDensityError=Math.max(metrics.maxDensityError,densityError);
    check(name+' GPU current',currentError<5e-5&&densityError<3e-4,`j ${currentError.toExponential(2)}, rho ${densityError.toExponential(2)}`);
  }
  function inspectParticles(name) {
    const state=api.state(),stats=api.particleStats();
    const regionError=Math.max(...stats.bins.map((n,q)=>Math.abs(n/stats.count-boxProbability(state.amplitudes,q))));
    metrics.maxRegionError=Math.max(metrics.maxRegionError,regionError);metrics.maxLag=Math.max(metrics.maxLag,stats.maxLag);metrics.failures+=stats.failures;
    check(name+' particles',stats.invalid===0&&stats.failures===0&&stats.maxLag<2e-6&&regionError<.055,`region ${(regionError*100).toFixed(2)}pp, lag ${stats.maxLag.toExponential(2)}, failures ${stats.failures}`);
  }
  for(const side of [2,3,4,5]) {
    resize(side);const model=gridModel(side),count=side*side;
    if(api.setInitial)api.setInitial(count-2);
    // Exercise main-canvas coordinates in every supported grid.
    if(!free)document.getElementById('selectionNext').click();
    const canvas=document.getElementById('c'),r=canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.right-r.width/(2*side),clientY:r.top+r.height/(2*side)}));
    check(`${side}x${side} selection and labels`,api.state().target===count-1&&document.querySelectorAll('.waveCell').length===count&&document.getElementById('iterationTrack').children.length===model.iterations&&api.state().amplitudes.length===2*count);
    if(free) {
      const buttons=[...document.getElementById('goalGrid').children],rects=buttons.map(b=>b.getBoundingClientRect());
      const arranged=buttons.every((button,i)=>Number(button.dataset.target)===side*(i%side)+side-1-Math.floor(i/side)
        && Math.abs(rects[i].top-rects[side*Math.floor(i/side)].top)<1
        && Math.abs(rects[i].left-rects[i%side].left)<1);
      check(`${side}x${side} goal selector`,buttons.length===count&&arranged&&document.getElementById('inverse').textContent.includes((2*side-1)+'T'));
    }
    inspectWave(`${side}x${side} input`);inspectParticles(`${side}x${side} input`);
    let expected=Float64Array.from(api.state().amplitudes);
    for(const [index,gate] of model.gates.entries()) {
      document.getElementById('next').click();
      const initial=api.state().initial,target=api.state().target;
      await advance(gate.duration/2);
      const reference=gateFlow(expected,gate.kind,target,gate.duration,initial);
      inspectWave(`${side}x${side} ${index+1} ${gate.kind} half`);
      if(index<5)inspectFlow(reference,.5,`${side}x${side} ${gate.kind}`);
      api.togglePause();const paused=JSON.stringify(api.state());api.advanceTime(1);
      check(`${side}x${side} ${gate.kind} pause`,JSON.stringify(api.state())===paused);api.togglePause();
      await advance(gate.duration/2);
      expected=evolveGate(expected,gate.kind,1,target,initial);
      check(`${side}x${side} ${gate.kind} checkpoint`,difference(api.state().amplitudes,expected)<1e-11&&!api.state().busy);
      inspectParticles(`${side}x${side} ${gate.kind}`);
    }
    const expectedP=Math.sin((2*model.iterations+1)*Math.asin(1/side))**2;
    check(`${side}x${side} completed search`,Math.abs(api.state().probabilities[count-1]-expectedP)<1e-11&&document.getElementById('stageStatus').textContent.includes(model.iterations+' Grover iterations'));
    check(`${side}x${side} WebGL`,api.gpuInfo().error===0);
  }
  // A running resize must cancel the queued run, discard old buffers and reset pause.
  api.runFull();await advance(.1);api.togglePause();resize(2);
  check('running resize clears playback and checkpoints',!api.state().busy&&!api.state().paused&&api.state().completed===0&&api.state().time===0&&api.state().checkpoints.length===0);
  inspectWave('shrink after 5x5');inspectParticles('shrink after 5x5');
  resize(5);inspectWave('grow back to 5x5');inspectParticles('grow back to 5x5');
  check('final WebGL error',api.gpuInfo().error===0);
  const failed=checks.filter(c=>!c.pass);
  panel.textContent=JSON.stringify({passed:failed.length===0,checks:checks.length,failed,metrics},null,2);
  document.documentElement.dataset.gridVerification=failed.length?'failed':'passed';
}
run().catch(error=>{panel.textContent=error.stack;document.documentElement.dataset.gridVerification='error';console.error(error);});
