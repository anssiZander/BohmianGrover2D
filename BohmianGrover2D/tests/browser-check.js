import {referenceStep,referenceWave} from './reference-math.js';
const panel=document.createElement('pre');panel.id='verification';
panel.style.cssText='position:fixed;inset:12px;overflow:auto;white-space:pre-wrap;padding:24px;background:#061124;color:#d4e6ff;z-index:2000;font:12px monospace';
document.body.append(panel);panel.textContent='Loading production app…';
const turn=()=>new Promise(resolve=>setTimeout(resolve,0)),results=[];
let maxWaveError=0,maxNormError=0,maxAmplitudeError=0,maxBlochError=0,waveChecks=0;
const check=(name,pass,detail='')=>{results.push({name,pass,detail});panel.textContent=results.filter(r=>r.pass).length+'/'+results.length+' passed\n'+name+': '+(pass?'PASS':'FAIL')+' '+detail;};
const difference=(a,b)=>Math.max(...Array.from(a,(v,i)=>Math.abs(v-b[i])));
const input=side=>{const state=new Float64Array(4*side*side);state[0]=1;return state;};
const expectedP=(rounds,side)=>Math.sin((2*rounds+1)*Math.asin(1/Math.sqrt(2*side*side)))**2;
function planFor(side){
  const T=19.2/(2*side),rounds=Math.round(Math.PI/(4*Math.asin(1/Math.sqrt(2*side*side)))-.5);
  return [{kind:'prepare',duration:T},...Array.from({length:rounds},()=>[
    {kind:'oracle',duration:1.6},{kind:'inverse',duration:19.2-T},{kind:'reference',duration:1.6},{kind:'forward',duration:T},
  ]).flat()];
}
async function run(){
  for(let i=0;!window.GroverMultiRegion?.isReady();i++){if(i>2500)throw Error('Startup timeout');await turn();}
  const api=window.GroverMultiRegion,doc=document,root=doc.getElementById('groverGeometry');
  api.beginFrameRecording();api.setParticleCount(256);doc.getElementById('trailsToggle').click();
  check('Only next/full gate buttons remain; phase button is removed',doc.querySelectorAll('.ops button').length===2&&['prepare','oracle','inverse','reference','forward','phaseToggle'].every(id=>!doc.getElementById(id)));
  const nextRect=doc.getElementById('next').getBoundingClientRect(),fullRect=doc.getElementById('full').getBoundingClientRect();
  check('Next operation and full search are side by side',Math.abs(nextRect.top-fullRect.top)<1&&fullRect.left>nextRect.left);
  function size(side){
    const slider=doc.getElementById('gridSize');slider.value=side;slider.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function inspect(expected,name,target,side){
    const actual=api.state(),pixels=api.readWave(),grid=actual.grid,dx=1/(grid-1);
    let norm=0,fieldError=0;
    for(let k=0;k<pixels.length;k++)norm+=pixels[k]**2;
    norm*=dx*dx;
    for(let row=0;row<=12;row++)for(let col=0;col<=12;col++){
      const x=Math.round(col*(grid-1)/12),y=Math.round(row*(grid-1)/12),offset=4*(y*grid+x);
      const psi=referenceWave(expected,x*dx,y*dx);
      for(let s=0;s<4;s++)fieldError=Math.max(fieldError,Math.abs(psi[s]-pixels[offset+s]));
    }
    const count=2*side*side,prepared=referenceStep(input(side),'prepare',1,target),m=[0,0],u=[0,0];
    for(let q=0;q<count;q++){
      const r=Math.sqrt(count)*(prepared[2*q]*expected[2*q]+prepared[2*q+1]*expected[2*q+1]);
      const i=Math.sqrt(count)*(prepared[2*q]*expected[2*q+1]-prepared[2*q+1]*expected[2*q]);
      if(q===target){m[0]=r;m[1]=i;}else{u[0]+=r/Math.sqrt(count-1);u[1]+=i/Math.sqrt(count-1);}
    }
    const marked=m[0]**2+m[1]**2,weight=marked+u[0]**2+u[1]**2;
    let sphereError=Math.abs(weight-Number(root.dataset.subspaceProbability));
    if(weight>1e-12)sphereError=Math.max(sphereError,difference([2*(m[0]*u[0]+m[1]*u[1])/weight,2*(m[0]*u[1]-m[1]*u[0])/weight,2*marked/weight-1],JSON.parse(root.dataset.blochVector)));
    const modalError=difference(actual.amplitudes,expected);
    maxWaveError=Math.max(maxWaveError,fieldError);maxNormError=Math.max(maxNormError,Math.abs(norm-1));
    maxAmplitudeError=Math.max(maxAmplitudeError,modalError);maxBlochError=Math.max(maxBlochError,sphereError);waveChecks++;
    check(name,fieldError<1e-5&&Math.abs(norm-1)<2e-6&&modalError<2e-12&&sphereError<2e-11,
      'wave '+fieldError.toExponential(2)+'; norm '+Math.abs(norm-1).toExponential(2));
  }
  for(const side of [2,3,4,5]){
    size(side);const count=2*side*side,target=count-1,plan=planFor(side),rounds=(plan.length-1)/4;
    api.setTarget(target-1);
    check(side+'x'+side+': correct grid, dimensions, timing and iterations',
      api.state().side===side&&api.state().stateCount===count&&
      doc.querySelectorAll('#goalGrid button').length===side*side&&doc.querySelectorAll('#waveLabels [data-region]').length===side*side&&
      doc.getElementById('iterationTrack').children.length===rounds&&
      doc.getElementById('inverseCaption').textContent==='WAIT '+(2*side-1)+'T'&&
      doc.getElementById('circuitXLabel').textContent==='x ('+side+')');
    const expectedOrder=Array.from({length:side*side},(_,i)=>side*(i%side)+side-1-Math.floor(i/side));
    check(side+'x'+side+': both grids have the same coordinate order',
      difference([...doc.querySelectorAll('#goalGrid button')].map(b=>Number(b.dataset.target)),expectedOrder)===0&&
      getComputedStyle(doc.getElementById('goalGrid')).gridTemplateColumns.split(' ').length===side);
    const goal=doc.querySelector('#goalGrid [data-target="'+(side*side-1)+'"]');
    goal.click();check(side+'x'+side+': repeat click selects spin down',api.state().target===target);
    goal.click();check(side+'x'+side+': next repeat selects spin up',api.state().target===target-1);goal.click();
    let expected=input(side);
    for(const [index,gate] of plan.entries()){
      doc.getElementById('next').click();
      check(side+'x'+side+' gate '+index+': next starts the correct gate and locks target selection',
        api.state().kind===gate.kind&&[...doc.querySelectorAll('#goalGrid button')].every(b=>b.disabled)&&api.setTarget(0)===false);
      let prior=0;
      for(const p of [.25,.5,1]){
        api.advanceTime((p-prior)*gate.duration);prior=p;
        inspect(referenceStep(expected,gate.kind,p,target),side+'x'+side+' '+gate.kind+' '+index+' at '+p,target,side);
        if(p===.5&&index<3){
          doc.getElementById('pause').click();const held=JSON.stringify(api.state());
          api.advanceTime(2);api.renderRecordingFrame({fps:60});
          check(side+'x'+side+' gate '+index+': pause freezes state and recording clock',JSON.stringify(api.state())===held);
          doc.getElementById('pause').click();
        }
        await turn();
      }
      expected=referenceStep(expected,gate.kind,1,target);
      const held=JSON.stringify(api.state());api.advanceTime(.1);
      check(side+'x'+side+' gate '+index+': manual checkpoint holds',held===JSON.stringify(api.state())&&!api.state().busy);
    }
    check(side+'x'+side+': exact expected final probability and completed rounds',
      Math.abs(api.state().probabilities[target]-expectedP(rounds,side))<2e-12&&api.state().checkpoints.filter(g=>g.kind==='forward').length===rounds);
    api.setTarget(0);
    const canvas=doc.getElementById('c'),r=canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent('click',{clientX:r.left+r.width/(2*side),clientY:r.bottom-r.height/(2*side),bubbles:true}));
    check(side+'x'+side+': clicking the selected wave cell flips spin',api.state().target===1);
    api.setTarget(0);doc.getElementById('full').click();api.advanceTime(1000);
    expected=input(side);for(const gate of plan)expected=referenceStep(expected,gate.kind,1,0);
    inspect(expected,side+'x'+side+': queued full search, spin up',0,side);
    check(side+'x'+side+': full queue stops at its own final gate',api.state().completed===plan.length&&!api.state().busy);
    check(side+'x'+side+': GPU error code remains zero',api.gpuInfo().error===0);
    await turn();
  }
  api.reset();api.startNext();api.advanceTime(.3);api.togglePause();size(2);
  check('Resizing a paused gate resets state, particles, clock and history',
    api.state().side===2&&!api.state().busy&&!api.state().paused&&api.state().time===0&&api.state().completed===0&&
    api.state().amplitudes.length===16&&api.state().checkpoints.length===0&&api.readParticles().every((v,i)=>i%4<2||v===0));
  size(5);api.startNext();api.advanceTime(.2);size(3);
  check('Resizing a running gate resets safely',api.state().side===3&&!api.state().busy&&api.state().time===0);
  doc.getElementById('waveView').value='2';doc.getElementById('waveView').dispatchEvent(new Event('change'));
  check('Component phase view works without a separate phase button',!doc.getElementById('phaseToggle')&&!doc.getElementById('phaseLegendPanel').hidden);
  size(4);api.reset();api.startNext();api.renderRecordingFrame({fps:60});
  check('Recording shares the selected grid clock',Math.abs(api.state().time-1/60)<1e-14);
  api.reset();
  const gpu=api.gpuInfo();check('Production WebGL2 reports no errors',gpu.error===0);
  const report={passed:results.filter(r=>r.pass).length,total:results.length,waveChecks,maxWaveError,maxNormError,maxAmplitudeError,maxBlochError,gpu,failures:results.filter(r=>!r.pass)};
  panel.dataset.report=JSON.stringify(report);panel.dataset.done='true';panel.textContent=JSON.stringify(report,null,2);api.endFrameRecording();
}
run().catch(error=>{panel.dataset.done='error';panel.textContent=error.stack;console.error(error);});
