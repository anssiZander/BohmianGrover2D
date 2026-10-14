const report = document.createElement('pre'); report.id = 'histogram-test-report';
report.style.cssText = 'position:relative;margin:20px;padding:20px;background:#13293a;white-space:pre-wrap;color:#d3efeb;';
document.body.append(report);
let checks = 0;
const check = (condition,message) => { if (!condition) throw new Error(message); checks++; };
const close = (a,b,message,tolerance=1e-9) => check(Math.abs(a-b)<tolerance,`${message}: ${a} vs ${b}`);
const vector = (a,b,message) => check(a.length===b.length && a.every((v,i)=>Math.abs(v-b[i])<1e-9),message);
const byId = id => document.getElementById(id);
const frame = () => new Promise(resolve=>requestAnimationFrame(resolve));
try {
  for (let i=0;i<120 && !window.OrdinaryGrover?.isReady();i++) await frame();
  const app = window.OrdinaryGrover;
  check(app?.isReady(),'renderer ready'); app.beginFrameRecording();
  const canvas = byId('c'), ctx = canvas.getContext('2d');
  const pixels = () => ctx.getImageData(0,0,canvas.width,canvas.height).data;
  const checksum = () => {const data=pixels();let sum=0;for(let i=0;i<data.length;i+=28) sum=(sum+data[i]*17+data[i+1]*7+data[i+2])%2147483647;return sum;};
  check(checksum()>100000,'rendered nonempty image');
  check(document.querySelectorAll('canvas').length===1,'only the histogram canvas is mounted');
  check(!document.querySelector('#particlesToggle,#currentToggle,#waveArea,#groverGeometry'),'no physical visualizations in the page');

  for (const side of [2,3,4,5]) for (const pair of [[0,side*side-1],[side*side-1,side*side-1]]) {
    app.setGridSize(side); app.setInitial(pair[0]); app.setTarget(pair[1]); app.reset();
    const count = side*side, expectedIterations = {2:1,3:2,4:3,5:3}[side];
    check(byId('initialState').options.length===count,'initial selector follows size');
    check(byId('targetState').options.length===count,'marked selector follows size');
    check(app.state().probabilities.filter(p=>p>.999).length===1,'one initial column');
    close(app.state().probabilities[pair[0]],1,'selected initial has unit probability');
    check(app.state().iterations===expectedIterations,'correct stopping iteration');
    check(byId('prepareSymbol').textContent===(side%2?'B':'H'),'qubit versus odd-grid mixer labelled accurately');
    const kinds = ['prepare',...Array.from({length:expectedIterations},()=>['oracle','inverse','reference','forward']).flat()];
    for (const [index,kind] of kinds.entries()) {
      const before = app.state(), oldHeights=app.histogram().heights;
      check(app.startNext(),'next operation starts');
      check(app.state().kind===kind,`gate sequence ${index} is ${kind}`);
      check(byId('initialState').disabled && byId('targetState').disabled,'selection locks while running');
      const duration = ['oracle','reference'].includes(kind) ? 1.6 : 2.4;
      app.advanceTime(duration/2);
      close(app.state().norm,1,'norm at midpoint');
      if (['oracle','reference'].includes(kind)) {
        vector(app.histogram().heights,oldHeights,'phase pulse keeps column heights fixed at midpoint');
      }
      app.togglePause(); const paused=app.state();app.advanceTime(100);vector(app.state().amplitudes,paused.amplitudes,'pause freezes amplitudes');app.togglePause();
      app.advanceTime(duration/2);
      check(!app.state().busy && app.state().completed===index+1,'stops at exact checkpoint');
      close(app.state().norm,1,'norm at checkpoint');
      check(!byId('initialState').disabled,'selection unlocks at checkpoint');
      const state=app.state(), histogram=app.histogram();
      vector(histogram.heights.map(v=>v/histogram.maximum),state.probabilities,'column heights are probabilities');
      if (kind==='prepare') state.probabilities.forEach(p=>close(p,1/count,'balanced preparation'));
      if (['oracle','reference'].includes(kind)) {
        vector(histogram.heights,oldHeights,'phase pulse keeps heights fixed at endpoint');
        const q=kind==='oracle'?state.target:state.initial;
        close(state.amplitudes[2*q],-before.amplitudes[2*q],'phase gate reverses real component');
        close(state.amplitudes[2*q+1],-before.amplitudes[2*q+1],'phase gate reverses imaginary component');
      }
      if (kind==='forward') {
        const expected=Math.sin((2*state.iteration+1)*Math.asin(1/side))**2;
        close(state.probabilities[state.target],expected,'Grover iteration probability');
      }
    }
    check(byId('next').disabled,'next disables after the final operation');
    check(byId('iterationTrack').querySelectorAll('.complete').length===expectedIterations,'all round checkpoints displayed');
    const stepped=app.state();app.runFull();app.advanceTime(1000);
    vector(app.state().amplitudes,stepped.amplitudes,'autoplay matches stepping exactly');
  }

  app.setGridSize(4);app.setInitial(0);app.setTarget(15);app.reset();app.startNext();app.advanceTime(2.4);
  const preparedPixels=checksum();app.startNext();app.advanceTime(1.6);
  check(checksum()!==preparedPixels,'oracle phase change is visible in the rendered image');
  app.reset();app.startNext();app.advanceTime(2.4);
  const beforeView=app.state().amplitudes;
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]) {
    app.setCamera({yaw,elevation:1.1,zoom:1});
    for(let q=0;q<16;q++) {const p=app.projectState(q);check(app.pickAt(p.x,p.y)===q,`ray picks state ${q} at yaw ${yaw}`);}
  }
  vector(app.state().amplitudes,beforeView,'orbiting never changes the algorithm');
  app.resetCamera();const originalCamera=app.cameraState(), originalImage=checksum();
  byId('orbitRight').click();await frame();check(app.cameraState().yaw!==originalCamera.yaw,'orbit control moves camera');
  check(checksum()!==originalImage,'orbit changes actual rendering');
  byId('zoomIn').click();await frame();check(app.cameraState().zoom>originalCamera.zoom,'zoom control changes camera');
  byId('resetView').click();await frame();close(app.cameraState().yaw,originalCamera.yaw,'reset restores yaw');close(app.cameraState().zoom,1,'reset restores zoom');
  canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));check(app.cameraState().elevation>originalCamera.elevation,'keyboard orbit');
  canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));close(app.cameraState().elevation,originalCamera.elevation,'keyboard reset');
  canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:120,cancelable:true}));check(app.cameraState().zoom<1,'wheel zoom');

  const pointer=(type,x,y,id=1)=>{const b=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent(type,{pointerId:id,button:0,clientX:b.left+x,clientY:b.top+y,bubbles:true}));};
  app.setCamera({yaw:0,elevation:1.55,zoom:1});app.reset();byId('selectTarget').click();
  let p=app.projectState(6);pointer('pointerdown',p.x,p.y);pointer('pointerup',p.x,p.y);check(app.state().target===6,'click picks marked state');
  byId('selectInitial').click();p=app.projectState(5);pointer('pointerdown',p.x,p.y);pointer('pointerup',p.x,p.y);check(app.state().initial===5,'click picks initial state');
  byId('selectTarget').click();const prior=app.cameraState();pointer('pointerdown',150,150);pointer('pointermove',200,170);pointer('pointerup',200,170);
  check(app.cameraState().yaw!==prior.yaw,'drag orbits');check(app.state().target===6,'drag never selects a state');
  const beforePinch=app.cameraState().zoom;pointer('pointerdown',150,150,1);pointer('pointerdown',220,150,2);pointer('pointermove',260,150,2);pointer('pointerup',260,150,2);pointer('pointerup',150,150,1);
  check(app.cameraState().zoom>beforePinch,'two-pointer pinch zoom');check(app.state().target===6,'pinch never selects a state');

  app.reset();app.startNext();app.advanceTime(.6);app.togglePause();app.setGridSize(5);
  check(!app.state().busy && !app.state().paused && app.state().completed===0,'size change resets an in-progress paused search');
  check(app.state().checkpoints.length===0,'size change clears history');
  app.setGridSize(4);app.setInitial(0);app.setTarget(15);app.reset();app.setSpeed(2);app.startNext();app.renderRecordingFrame({fps:60});
  close(app.state().time,2/60,'recording advances by one deterministic frame at chosen speed');
  app.togglePause();const frozen=app.state();app.renderRecordingFrame({fps:60});vector(app.state().amplitudes,frozen.amplitudes,'recording respects pause');
  app.setSpeed(1);app.reset();app.resetCamera();app.startNext();app.advanceTime(2.4);
  check(byId('error').hidden,'no renderer error');
  check(!performance.getEntriesByType('resource').some(entry=>/flow-renderer|probability-flow|shaders\//.test(entry.name)),'physics resources never requested');
  report.textContent=`PASS · ${checks} checks\nAll 2×2–5×5 grids: preparation, phase pulses, exact step order, optimal success probabilities, pause/reset, autoplayer, 3D rendering, selection, orbit/zoom/pinch, and recording clock.`;
  report.dataset.status='passed';report.dataset.checks=checks;
} catch(error) {report.textContent=`FAIL after ${checks} checks\n${error.stack}`;report.dataset.status='failed';console.error(error);}
