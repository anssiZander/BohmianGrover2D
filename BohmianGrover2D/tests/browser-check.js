import { referenceStep, referenceWave } from './reference-math.js';

const panel = document.createElement('pre'); panel.id = 'verification';
panel.style.cssText = 'position:fixed;inset:12px;overflow:auto;white-space:pre-wrap;padding:24px;background:#061124;color:#d4e6ff;z-index:2000;font:12px monospace';
document.body.append(panel); panel.textContent = 'Loading the production app…';
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
const results = [];
let maxWaveError = 0, maxNormError = 0, maxAmplitudeError = 0, maxBlochError = 0, waveChecks = 0;
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  panel.textContent = `${results.filter(r => r.pass).length}/${results.length} passed\n${name}: ${pass ? 'PASS' : 'FAIL'} ${detail}`;
};
const difference = (a, b) => Math.max(...Array.from(a, (v, i) => Math.abs(v - b[i])));
const input = (initial = 0) => { const state = new Float64Array(32); state[2*initial] = 1; return state; };
const expectedP = rounds => Math.sin((2 * rounds + 1) * Math.asin(.25)) ** 2;
const plan = [{ kind: 'prepare', duration: 2.4 }, ...Array.from({ length: 3 }, () => [
  { kind: 'oracle', duration: 1.6 }, { kind: 'inverse', duration: 2.4 },
  { kind: 'reference', duration: 1.6 }, { kind: 'forward', duration: 2.4 },
]).flat()];

async function run() {
  let attempts = 0;
  while (!window.GroverMultiRegion?.isReady()) {
    if (++attempts > 2000) throw new Error('App startup timeout'); await turn();
  }
  const api = window.GroverMultiRegion, doc = document;
  api.beginFrameRecording();
  api.setParticleCount(512); // Dedicated flow fixture tests the full particle ensemble.
  const root = doc.getElementById('groverGeometry');
  const guide = doc.getElementById('selectionGuide'), nextSelection = doc.getElementById('selectionNext');
  function clickWave(q) {
    const canvas = doc.getElementById('c'), r = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:r.left+r.width*((q>>2)+.5)/4, clientY:r.bottom-r.height*((q&3)+.5)/4}));
  }
  check('Sidebar selector and individual gate buttons removed; fixed 4x4 wave remains',
    !doc.getElementById('goalGrid') && !doc.getElementById('gridSize') && doc.querySelectorAll('.ops button').length === 2 && doc.querySelectorAll('#waveLabels [data-region]').length === 16);
  const nextRect = doc.getElementById('next').getBoundingClientRect(), fullRect = doc.getElementById('full').getBoundingClientRect();
  check('Next and full search are side by side', Math.abs(nextRect.top-fullRect.top)<1 && fullRect.left>nextRect.left);
  check('Guide shares the title header without a separate row', guide.parentElement.id === 'waveHeader');
  check('Existing defaults start immediately without selection',api.state().initial===0 && api.state().target===15 && guide.dataset.step==='initial' && api.runFull());
  api.reset(); clickWave(6); nextSelection.click(); clickWave(9);
  check('Main wave selects initial and goal independently',api.state().initial===6 && api.state().target===9 && guide.dataset.step==='goal');
  doc.getElementById('selectionBack').click();
  check('Back returns to initial selection with both choices intact',guide.dataset.step==='initial' && api.state().initial===6 && api.state().target===9);
  nextSelection.click(); nextSelection.click();
  const held = JSON.stringify(api.state()); clickWave(0);
  check('Done prevents accidental canvas edits',guide.dataset.step==='ready' && JSON.stringify(api.state())===held);
  check('Chosen input appears in all circuit wires and both cell markers',
    [...doc.querySelectorAll('.circuitInput')].map(el=>el.textContent).join('')==='|0⟩|1⟩|1⟩|0⟩' &&
    doc.querySelector('.waveCell.initial').dataset.region==='6' && doc.querySelector('.waveCell.marked').dataset.region==='9');
  const expectedOrder = Array.from({ length: 16 }, (_, i) => 4 * (i % 4) + 3 - Math.floor(i / 4));
  check('Wave retains spatial ordering',difference([...doc.querySelectorAll('#waveLabels [data-region]')].map(el=>Number(el.dataset.region)),expectedOrder)===0);

  function inspect(expected, name, target) {
    const actual = api.state(), pixels = api.readWave(), grid = actual.grid, dx = 1 / (grid - 1);
    let norm = 0, fieldError = 0;
    for (let k = 0; k < grid * grid; k++) norm += pixels[4 * k] ** 2 + pixels[4 * k + 1] ** 2;
    norm *= dx * dx;
    for (let row = 0; row <= 16; row++) for (let col = 0; col <= 16; col++) {
      const x = Math.round(col * (grid - 1) / 16), y = Math.round(row * (grid - 1) / 16), offset = 4 * (y * grid + x);
      const psi = referenceWave(expected, x * dx, y * dx);
      fieldError = Math.max(fieldError, Math.abs(psi[0] - pixels[offset]), Math.abs(psi[1] - pixels[offset + 1]));
    }
    const modalError = difference(actual.amplitudes, expected);
    const sign = q => (q & actual.initial).toString(2).replaceAll('0','').length % 2 ? -1 : 1;
    const m = [sign(target)*expected[2 * target], sign(target)*expected[2 * target + 1]], u = [0, 0];
    for (let q = 0; q < 16; q++) if (q !== target) { u[0] += sign(q)*expected[2 * q] / Math.sqrt(15); u[1] += sign(q)*expected[2 * q + 1] / Math.sqrt(15); }
    const marked = m[0] ** 2 + m[1] ** 2, weight = marked + u[0] ** 2 + u[1] ** 2;
    let sphereError = Math.abs(weight - Number(root.dataset.subspaceProbability));
    if (weight > 1e-12) {
      const vector = [2 * (m[0] * u[0] + m[1] * u[1]) / weight, 2 * (m[0] * u[1] - m[1] * u[0]) / weight, 2 * marked / weight - 1];
      sphereError = Math.max(sphereError, difference(vector, JSON.parse(root.dataset.blochVector)));
    }
    maxWaveError = Math.max(maxWaveError, fieldError); maxNormError = Math.max(maxNormError, Math.abs(norm - 1));
    maxAmplitudeError = Math.max(maxAmplitudeError, modalError); maxBlochError = Math.max(maxBlochError, sphereError); waveChecks++;
    check(name, fieldError < 1e-5 && Math.abs(norm - 1) < 2e-6 && modalError < 1e-12 && sphereError < 1e-11,
      `wave ${fieldError.toExponential(2)}; norm ${Math.abs(norm - 1).toExponential(2)}`);
  }

  // Every gate's interior, including the three distinct diffuser inputs.
  api.setTarget(9); let expected = input(6);
  for (const [index, gate] of plan.entries()) {
    doc.getElementById('next').click();
    check(`Step ${index + 1} activates its circuit gate and locks targets`,
      doc.querySelector('.circuitGate.active')?.dataset.circuitKind === gate.kind &&
      nextSelection.disabled && api.setTarget(4) === false && api.setInitial(4) === false);
    let prior = 0;
    for (const p of [0, .25, .5, .75, 1]) {
      api.advanceTime((p - prior) * gate.duration); prior = p;
      inspect(referenceStep(expected, gate.kind, p, 9, 6), `Step ${index + 1} ${gate.kind} at ${p}`, 9);
      if (p === .5) {
        doc.getElementById('pause').click(); const before = JSON.stringify(api.state());
        api.advanceTime(3); api.renderRecordingFrame({ fps: 60 });
        check(`Step ${index + 1} pauses wave, sphere, circuit and recording clock`, before === JSON.stringify(api.state()) && root.querySelector('[data-geometry="status"]').textContent.includes('paused'));
        doc.getElementById('pause').click();
      }
      await turn();
    }
    expected = referenceStep(expected, gate.kind, 1, 9, 6);
    const held = JSON.stringify(api.state()); api.advanceTime(2);
    check(`Step ${index + 1} holds its checkpoint`, held === JSON.stringify(api.state()) && !api.state().busy);
  }

  // All targets run through the production queue and must be equivalent.
  for (let target = 0; target < 16; target++) {
    const initial = (7*target)%16; nextSelection.click(); clickWave(initial); nextSelection.click(); clickWave(target); nextSelection.click();
    check(`Selection ${target} resets the search`, api.state().target === target && api.state().completed === 0 &&
      doc.querySelector(`#waveLabels [data-region="${target}"]`).classList.contains('marked'));
    doc.getElementById('full').click(); api.advanceTime(100);
    let state = input(initial); for (const gate of plan) state = referenceStep(state, gate.kind, 1, target, initial);
    inspect(state, `Complete queued search target ${target}`, target);
    const checkpoints = api.state().checkpoints.filter(gate => gate.kind === 'forward');
    check(`Target ${target} amplifies for exactly three iterations`, checkpoints.length === 3 && checkpoints.every((gate, i) => Math.abs(gate.targetProbability - expectedP(i + 1)) < 1e-12) && api.state().completed === 13);
    await turn();
  }
  api.reset(); api.startNext(); api.renderRecordingFrame({ fps: 60 });
  check('Recording advances the same exact clock by one frame', Math.abs(api.state().time - 1 / 60) < 1e-14);
  api.reset();
  check('Reset restores input, norm, circuit and empty iteration history', api.state().completed === 0 && api.state().norm === 1 && api.state().checkpoints.length === 0 && !doc.querySelector('.circuitGate.active'));
  api.setInitial(5); api.setTarget(5);
  check('Coincident selections keep both labels',doc.querySelector('.waveCell.initial.marked .initialTag')?.textContent==='START' && doc.querySelector('.waveCell.initial.marked .goalTag')?.textContent==='GOAL');
  for (const id of ['currentToggle','particlesToggle','trailsToggle','gridToggle']) doc.getElementById(id).click();
  const canvas=doc.getElementById('c'),gl=canvas.getContext('webgl2');
  function border(inset) {
    api.advanceTime(0); const pixel = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.readPixels(Math.floor(.375*canvas.width),Math.floor(.25*canvas.height+inset),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return pixel;
  }
  function frame() {
    api.advanceTime(0); const pixels = new Uint8Array(canvas.width*canvas.height*4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
  }
  const green = border(8), red = border(2);
  check('Shared cell has green inner and red outer shader outlines',green[1]>green[0]+80 && red[0]>red[1]+80);
  const beforeView=JSON.stringify(api.state()),beforeParticles=api.readParticles();
  doc.getElementById('markersToggle').click();
  check('Marker toggle hides both outlines and all cell tags',difference(green,border(8))>80 && difference(red,border(2))>1 && !doc.querySelector('.waveCell.initial,.waveCell.marked') && [...doc.querySelectorAll('.initialTag,.goalTag')].every(el=>!el.textContent));
  check('Marker toggle preserves wave state, particles and time',JSON.stringify(api.state())===beforeView && difference(beforeParticles,api.readParticles())===0);
  const phaseFrame=frame();doc.getElementById('phaseToggle').click();const densityFrame=frame();
  check('Phase and amplitude/density palettes both render, without changing the state',phaseFrame.some((v,i)=>v!==densityFrame[i]) && JSON.stringify(api.state())===beforeView && difference(beforeParticles,api.readParticles())===0 && doc.getElementById('phaseLegendPanel').hidden);
  api.setTarget(0);
  const densityAfterTarget=frame();
  check('Hidden markers leave no target tint in either palette',densityAfterTarget.every((v,i)=>v===densityFrame[i]), `changed channels ${densityAfterTarget.reduce((n,v,i)=>n+(v!==densityFrame[i]),0)}; max byte error ${densityAfterTarget.reduce((n,v,i)=>Math.max(n,Math.abs(v-densityFrame[i])),0)}`);
  doc.getElementById('phaseToggle').click();
  const restoredPhase=frame();
  check('Phase palette restores exactly with markers hidden',restoredPhase.every((v,i)=>v===phaseFrame[i]) && !doc.getElementById('phaseLegendPanel').hidden, `changed channels ${restoredPhase.reduce((n,v,i)=>n+(v!==phaseFrame[i]),0)}; max byte error ${restoredPhase.reduce((n,v,i)=>Math.max(n,Math.abs(v-phaseFrame[i])),0)}`);
  api.setTarget(5);doc.getElementById('markersToggle').click();
  check('Markers restore independently of the grid toggle',difference(green,border(8))===0 && difference(red,border(2))===0 && doc.getElementById('waveLabels').hidden);
  for (const id of ['currentToggle','particlesToggle','trailsToggle','gridToggle']) doc.getElementById(id).click();
  const gpu = api.gpuInfo(); check('Production WebGL2 reports no errors', gpu.error === 0 && doc.documentElement.dataset.glError === '0');
  const report = { passed: results.filter(r => r.pass).length, total: results.length, waveChecks, maxWaveError, maxNormError, maxAmplitudeError, maxBlochError, gpu, failures: results.filter(r => !r.pass) };
  panel.dataset.report = JSON.stringify(report); panel.dataset.done = 'true';
  panel.textContent = JSON.stringify(report, null, 2); api.endFrameRecording();
}
run().catch(error => { panel.dataset.done = 'error'; panel.textContent = error.stack; console.error(error); });
