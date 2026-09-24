import { FlowRenderer } from '../flow-renderer.js';

const panel=document.createElement('pre');panel.id='trailVerification';
panel.style.cssText='position:fixed;inset:12px;overflow:auto;white-space:pre-wrap;padding:24px;background:#061124;color:#d4e6ff;z-index:2000;font:13px monospace';
document.body.append(panel);
const checks=[],turn=()=>new Promise(resolve=>setTimeout(resolve,0));
const check=(name,pass,detail='')=>{checks.push({name,pass,detail});panel.textContent=JSON.stringify(checks,null,2);};
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const lengthSlider=document.getElementById('trailHalfLife');
function setLength(value) {lengthSlider.value=value;lengthSlider.dispatchEvent(new Event('input',{bubbles:true}));}
async function run() {
  for(let i=0;!window.GroverMultiRegion?.isReady();i++){if(i>2500)throw Error('Startup timeout');await turn();}
  const api=window.GroverMultiRegion;api.beginFrameRecording();
  // Observe the production renderer without adding a test-only public app API.
  let flow;
  const stamp=FlowRenderer.prototype.stampTrails;
  FlowRenderer.prototype.stampTrails=function(...args){flow=this;return stamp.apply(this,args);};
  api.startNext();api.advanceTime(.02);FlowRenderer.prototype.stampTrails=stamp;
  const gl=flow.gl;
  function density() {
    const pixels=new Float32Array(4*flow.trailSize**2);
    gl.bindFramebuffer(gl.FRAMEBUFFER,flow.trailFbos[flow.trailIndex]);
    gl.readPixels(0,0,flow.trailSize,flow.trailSize,gl.RGBA,gl.FLOAT,pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    let sum=0,max=0;
    for(let i=0;i<pixels.length;i+=4){sum+=pixels[i];max=Math.max(max,pixels[i]);}
    return {sum:sum*flow.trailScale,max:max*flow.trailScale};
  }
  async function advance(time) {
    let left=time;while(left>1e-10){let dt=Math.min(.08,left);api.advanceTime(dt);left-=dt;await turn();}
  }
  async function sample(halfLife) {
    api.reset();setLength(halfLife);api.startNext();await advance(1.2);
    return {density:density(),particles:api.readParticles(),wave:api.readWave()};
  }
  const short=await sample(.1),long=await sample(12);
  check('Long trails retain more history',long.density.sum>short.density.sum*2,JSON.stringify({short:short.density.sum,long:long.density.sum}));
  check('Length never changes particle trajectories',same(short.particles,long.particles));
  check('Length never changes wave evolution',same(short.wave,long.wave));
  check('Additive density remains unsaturated before exposure',long.density.max>1,`peak ${long.density.max}`);
  api.togglePause();const before=density().sum;setLength(3.7);api.advanceTime(.6);
  check('Changing length preserves paused history and state',before===density().sum&&same(long.particles,api.readParticles()));
  check('Slider readout updates',document.getElementById('trailHalfLifeValue').textContent==='3.7 s');
  // Isolate decay with zero new stamps, retaining the actual GPU history.
  const count=flow.count;flow.count=0;
  const settings={trailHalfLife:12,particleSize:3.5};
  for(let i=0;i<1200;i++)flow.stampTrails(0,.001,settings);
  const slowRatio=density().sum/before;
  check('Tiny steps still fade long trails',Math.abs(slowRatio-2**(-.1))<1e-6,`ratio ${slowRatio}`);
  for(let i=0;i<600;i++)flow.stampTrails(0,.02,settings);
  const halfRatio=density().sum/before;
  check('Half-life survives GPU rebaking',Math.abs(halfRatio-2**(-1.1))<.001,`ratio ${halfRatio}`);
  flow.count=count;
  api.reset();check('Reset clears trail history',density().sum===0);
  setLength(1.5);api.startNext();await advance(.6);const recorded=density().sum;
  api.reset();api.startNext();for(let i=0;i<36;i++){api.renderRecordingFrame({fps:60});await turn();}
  const ratio=density().sum/recorded;
  check('Recording and live time give comparable exposure',Math.abs(ratio-1)<.08,`ratio ${ratio}`);
  check('GPU pipeline has no WebGL errors',api.gpuInfo().error===0);
  const report={passed:checks.filter(c=>c.pass).length,total:checks.length,checks,gpu:api.gpuInfo()};
  panel.dataset.report=JSON.stringify(report);panel.dataset.done='true';panel.textContent=JSON.stringify(report,null,2);
  api.reset();api.endFrameRecording();
}
run().catch(error=>{panel.dataset.done='error';panel.textContent=error.stack;console.error(error);});
