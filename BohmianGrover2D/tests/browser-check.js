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
const input = () => { const state = new Float64Array(32); state[0] = 1; return state; };
const expectedP = rounds => Math.sin((2 * rounds + 1) * Math.asin(.25)) ** 2;
const plan = [{ kind: 'prepare', duration: 2.4 }, ...Array.from({ length: 3 }, () => [
  { kind: 'oracle', duration: 1.6 }, { kind: 'inverse', duration: 16.8 },
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
  check('Single view with 16 choices and conserved-flow controls',
    doc.querySelectorAll('#goalGrid [data-target]').length === 16 &&
    doc.querySelectorAll('#waveLabels [data-region]').length === 16 &&
    !doc.getElementById('viewToggle') && !!doc.getElementById('currentToggle') && !!doc.getElementById('particlesToggle'));
  const expectedOrder = Array.from({ length: 16 }, (_, i) => 4 * (i % 4) + 3 - Math.floor(i / 4));
  check('Selection grid uses the same spatial ordering as the wave', difference(
    [...doc.querySelectorAll('#goalGrid [data-target]')].map(button => Number(button.dataset.target)), expectedOrder) === 0);

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
    const s=referenceStep(input(),'prepare',1,target),m=[0,0],u=[0,0];
    for(let q=0;q<16;q++) {
      const r=4*(s[2*q]*expected[2*q]+s[2*q+1]*expected[2*q+1]);
      const i=4*(s[2*q]*expected[2*q+1]-s[2*q+1]*expected[2*q]);
      if(q===target){m[0]=r;m[1]=i;}else{u[0]+=r/Math.sqrt(15);u[1]+=i/Math.sqrt(15);}
    }
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
  api.setTarget(9); let expected = input();
  for (const [index, gate] of plan.entries()) {
    doc.getElementById(gate.kind).click();
    check(`Step ${index + 1} activates its circuit gate and locks targets`,
      doc.querySelector('.circuitGate.active')?.dataset.circuitKind === gate.kind &&
      [...doc.querySelectorAll('#goalGrid button')].every(button => button.disabled) && api.setTarget(4) === false);
    let prior = 0;
    for (const p of [0, .25, .5, .75, 1]) {
      api.advanceTime((p - prior) * gate.duration); prior = p;
      inspect(referenceStep(expected, gate.kind, p, 9), `Step ${index + 1} ${gate.kind} at ${p}`, 9);
      if (p === .5) {
        doc.getElementById('pause').click(); const before = JSON.stringify(api.state());
        api.advanceTime(3); api.renderRecordingFrame({ fps: 60 });
        check(`Step ${index + 1} pauses wave, sphere, circuit and recording clock`, before === JSON.stringify(api.state()) && root.querySelector('[data-geometry="status"]').textContent.includes('paused'));
        doc.getElementById('pause').click();
      }
      await turn();
    }
    expected = referenceStep(expected, gate.kind, 1, 9);
    const held = JSON.stringify(api.state()); api.advanceTime(2);
    check(`Step ${index + 1} holds its checkpoint`, held === JSON.stringify(api.state()) && !api.state().busy);
  }

  // All targets run through the production queue and must be equivalent.
  for (let target = 0; target < 16; target++) {
    doc.querySelector(`#goalGrid [data-target="${target}"]`).click();
    check(`Selection ${target} resets the search`, api.state().target === target && api.state().completed === 0 &&
      doc.querySelector(`#waveLabels [data-region="${target}"]`).classList.contains('marked'));
    doc.getElementById('full').click(); api.advanceTime(100);
    let state = input(); for (const gate of plan) state = referenceStep(state, gate.kind, 1, target);
    inspect(state, `Complete queued search target ${target}`, target);
    const checkpoints = api.state().checkpoints.filter(gate => gate.kind === 'forward');
    check(`Target ${target} amplifies for exactly three iterations`, checkpoints.length === 3 && checkpoints.every((gate, i) => Math.abs(gate.targetProbability - expectedP(i + 1)) < 1e-12) && api.state().completed === 13);
    await turn();
  }
  api.reset(); api.startNext(); api.renderRecordingFrame({ fps: 60 });
  check('Recording advances the same exact clock by one frame', Math.abs(api.state().time - 1 / 60) < 1e-14);
  api.reset();
  check('Reset restores input, norm, circuit and empty iteration history', api.state().completed === 0 && api.state().norm === 1 && api.state().checkpoints.length === 0 && !doc.querySelector('.circuitGate.active'));
  const gpu = api.gpuInfo(); check('Production WebGL2 reports no errors', gpu.error === 0 && doc.documentElement.dataset.glError === '0');
  const report = { passed: results.filter(r => r.pass).length, total: results.length, waveChecks, maxWaveError, maxNormError, maxAmplitudeError, maxBlochError, gpu, failures: results.filter(r => !r.pass) };
  panel.dataset.report = JSON.stringify(report); panel.dataset.done = 'true';
  panel.textContent = JSON.stringify(report, null, 2); api.endFrameRecording();
}
run().catch(error => { panel.dataset.done = 'error'; panel.textContent = error.stack; console.error(error); });
