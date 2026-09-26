import { SearchSimulation, probabilities, sineCoefficients, boxProbability, expectedProbability, spinSummary } from './multiregion-core.js';
import { createGroverGeometry } from './grover-geometry.js';
import { FlowRenderer } from './flow-renderer.js';

const GRID = 512;
const simulation = new SearchSimulation(30);
const params = { speed: 1, visGain: .65, visGamma: .55, showGrid: true,
  showCurrent: true, showParticles: true, showTrails: true, particleCount: 4000,
  particleSize: 3.5, arrowGrid: 20, currentGain: 2.5, trailHalfLife: 1.5, waveView: 0, currentMode: 0, showSpin: true };
const byId = id => document.getElementById(id);
const dom = Object.fromEntries(['c', 'waveArea', 'waveLabels', 'stage', 'waveHeader', 'waveFooter',
  'goalGrid', 'targetSummary', 'next', 'full', 'gridSize', 'gridSizeValue', 'gridSummary', 'appTitle', 'stateCountLabel',
  'circuitXLabel', 'circuitYLabel', 'inverseCaption', 'circuitDescription', 'circuitTitle',
  'reset', 'pause', 'progressBar', 'stageStatus', 'speed', 'speedValue', 'brightness', 'brightnessValue',
  'gridToggle', 'ui', 'uibody', 'minui', 'circuitPanel', 'circuitToggle', 'circuitStatus',
  'circuitTarget', 'circuitReadout', 'iterationTrack', 'modeProbability', 'boxProbability', 'normValue',
  'waveTarget', 'waveProbability', 'gateDescription', 'error', 'loading', 'groverGeometry',
  'currentToggle', 'particlesToggle', 'trailsToggle', 'particleCount', 'particleCountValue',
  'particleSize', 'particleSizeValue', 'arrowGrid', 'arrowGridValue', 'currentGain', 'currentGainValue',
  'trailHalfLife', 'trailHalfLifeValue', 'waveView', 'currentMode', 'spinToggle',
  'spinUpProbability', 'spinDownProbability', 'spinPurity', 'waveLegend', 'phaseLegendPanel',
  'particleProbability', 'flowStatus'].map(id => [id, byId(id)]));
const geometry = createGroverGeometry(dom.groverGeometry);
const canvas = dom.c;
let gl, waveTexture, waveFbo, vao, reconstruction, renderer, flow, ready = false;
let waveDirty = true, renderDirty = true, frameRecordingActive = false, lastTime = null, glError = 0;
let lastUiKey = '', previousBusy = null, cachedBoxProbability = 0;
const targetButtons = [], waveCells = [];
const circuitGates = Array.from(document.querySelectorAll('[data-circuit-kind]'));

function formatProbability(p) { return `${(100 * Math.max(0, Math.min(1, p))).toFixed(1)}%`; }
function markChanged() { waveDirty = true; renderDirty = true; lastUiKey = ''; }

function makeTargetGrid() {
  const {side,spatialLabels:SPATIAL_LABELS,stateCount,iterations,inverseFactor}=simulation.model;
  targetButtons.length=0;waveCells.length=0;
  dom.goalGrid.replaceChildren();dom.waveLabels.replaceChildren();
  document.documentElement.style.setProperty('--grid-side',side);
  dom.gridSize.value=side;dom.gridSizeValue.textContent=side+'×'+side;
  dom.gridSize.setAttribute('aria-valuetext',side+' by '+side+', '+stateCount+' position-spin states');
  dom.gridSummary.textContent=(side*side)+' positions × 2 spin states = '+stateCount+' states. Changing size resets the search.';
  dom.appTitle.textContent='Grover '+side+'×'+side+' × spin';
  document.title='Grover with Spin — '+side+'×'+side+' · '+stateCount+' States';
  dom.stateCountLabel.textContent=(side*side)+' SPATIAL MODES × SPIN ½ · '+stateCount+' STATES';
  canvas.setAttribute('aria-label','Two-component spinor wave: '+(side*side)+' spatial regions, each with spin up and down');
  dom.circuitXLabel.textContent='x ('+side+')';dom.circuitYLabel.textContent='y ('+side+')';
  dom.inverseCaption.textContent='WAIT '+inverseFactor+'T';
  dom.circuitTitle.textContent='Grover circuit: two '+side+'-level position registers and spin';
  dom.circuitPanel.setAttribute('aria-label',dom.circuitTitle.textContent);
  dom.circuitDescription.textContent='Preparation runs once. Oracle, inverse mixer, reference phase, and forward mixer repeat '+iterations+' times.';
  dom.full.title='Prepare and run '+iterations+' Grover iterations';
  dom.iterationTrack.innerHTML=Array.from({length:iterations},(_,i)=>'<span data-iteration="'+(i+1)+'">Iteration '+(i+1)+'<b>—</b></span>').join('');
  for (let y = side-1; y >= 0; y--) for (let x = 0; x < side; x++) {
    const q = side * x + y, button = document.createElement('button');
    button.type = 'button'; button.dataset.target = q;
    button.setAttribute('aria-label', `Mark |${SPATIAL_LABELS[q]}⟩, column ${x + 1}, row ${y + 1} from bottom`);
    button.innerHTML = `<span>|${SPATIAL_LABELS[q]}⟩</span><b class="spinUp">↑ 0.0%</b><b class="spinDown">↓ 0.0%</b><i></i>`;
    button.addEventListener('click', () => chooseCell(q));
    dom.goalGrid.append(button); targetButtons[q] = button;
    const cell = document.createElement('div'); cell.className = 'waveCell'; cell.dataset.region = q;
    cell.innerHTML = `<span class="cellLabel">|${SPATIAL_LABELS[q]}⟩</span><b><span class="spinUp">↑ 0.0%</span><span class="spinDown">↓ 0.0%</span></b>`;
    dom.waveLabels.append(cell); waveCells[q] = cell;
  }
}

function chooseCell(region) {
  const spin = region === (simulation.target >> 1) ? 1 - (simulation.target & 1) : simulation.target & 1;
  return chooseTarget(2 * region + spin);
}
function displayGate() {
  return simulation.active || simulation.last || { kind: 'prepare', duration: simulation.model.mixTime, progress: 0, startAmplitudes: simulation.amplitudes };
}
function setGridSize(value) {
  if(!simulation.setGridSize(Number(value)))return false;
  flow?.reset(params.particleCount,simulation.model.side);
  makeTargetGrid();markChanged();syncUi();layout();return true;
}
function chooseTarget(q) {
  if (!simulation.setTarget(q)) return false;
  flow?.reset(params.particleCount,simulation.model.side);
  markChanged(); syncUi(); return true;
}
function reset() { simulation.reset(); flow?.reset(params.particleCount,simulation.model.side); markChanged(); syncUi(); }
function startNext() { if (simulation.startNext()) { markChanged(); syncUi(); return true; } return false; }
function runFull() { if (simulation.runFull()) { flow?.reset(params.particleCount,simulation.model.side); markChanged(); syncUi(); return true; } return false; }
function togglePause() { simulation.paused = !simulation.paused; lastUiKey = ''; syncUi(); }
function setParticleCount(value) {
  if (simulation.active) return false;
  params.particleCount = Math.max(256, Math.min(16000, Math.round(Number(value) || 4000)));
  dom.particleCount.value = params.particleCount; dom.particleCountValue.textContent = params.particleCount.toLocaleString();
  reset(); return true;
}

function syncUi() {
  const {side,spatialCount:SPATIAL_COUNT,spatialLabels:SPATIAL_LABELS,labels:LABELS,gates:GATES,iterations:ITERATIONS,stateCount,inverseFactor}=simulation.model;
  const gate = simulation.active || simulation.last;
  const kind = gate?.kind || 'input', progress = simulation.active?.progress ?? (simulation.last ? 1 : 0);
  const iteration = gate?.iteration || 0, busy = !!simulation.active, complete = simulation.completed === GATES.length;
  const key = `${simulation.revision}/${simulation.target}/${simulation.completed}/${kind}/${progress}/${busy}/${simulation.paused}`;
  if (key === lastUiKey) return;
  lastUiKey = key;
  const p = probabilities(simulation.amplitudes), target = simulation.target;
  cachedBoxProbability = boxProbability(simulation.amplitudes, target >> 1);
  for (let q = 0; q < SPATIAL_COUNT; q++) {
    const button=targetButtons[q],isTarget=q===(target>>1),spin=target&1;
    button.classList.toggle('selected',isTarget);button.dataset.spin=String(spin);
    button.setAttribute('aria-pressed',String(isTarget));button.disabled=busy;
    button.setAttribute('aria-label',isTarget ? 'Goal |'+LABELS[target]+'⟩. Click again to flip spin.' : 'Select |'+SPATIAL_LABELS[q]+','+(spin?'↓':'↑')+'⟩');
    for(const [channel,name,arrow] of [[0,'spinUp','↑'],[1,'spinDown','↓']]){
      const text=arrow+' '+formatProbability(p[2*q+channel]);
      button.querySelector('.'+name).textContent=text;
      button.querySelector('.'+name).classList.toggle('goalSpin',isTarget&&spin===channel);
      waveCells[q].querySelector('.'+name).textContent=text;
      waveCells[q].querySelector('.'+name).classList.toggle('goalSpin',isTarget&&spin===channel);
    }
    button.querySelector('i').style.width=formatProbability(p[2*q+spin]);
    button.dataset.probability=p[2*q+spin];
    waveCells[q].classList.toggle('marked',isTarget);
    waveCells[q].querySelector('.cellLabel').textContent='|'+SPATIAL_LABELS[q]+'⟩'+(isTarget?' '+(spin?'↓':'↑'):'');
  }
  const spin=spinSummary(simulation.amplitudes);
  dom.spinUpProbability.textContent=formatProbability(spin.up);
  dom.spinDownProbability.textContent=formatProbability(spin.down);
  dom.spinPurity.textContent=spin.purity.toFixed(3);
  const targetText = `|${LABELS[target]}⟩`;
  dom.targetSummary.textContent = `Goal ${targetText} · column ${Math.floor((target >> 1)/side) + 1}, row ${((target >> 1)%side) + 1} from bottom`;
  dom.waveTarget.textContent = `MARKED ${targetText}`;
  dom.waveProbability.textContent = formatProbability(p[target]);
  dom.modeProbability.textContent = formatProbability(p[target]);
  dom.boxProbability.textContent = formatProbability(cachedBoxProbability);
  dom.normValue.textContent = p.reduce((sum, value) => sum + value, 0).toFixed(6);
  dom.next.title=GATES[simulation.completed]?.name||'Search complete';
  dom.next.disabled = busy || complete;
  dom.full.disabled = busy;
  dom.pause.textContent = simulation.paused ? 'Resume' : 'Pause';
  dom.particleCount.disabled = busy;
  dom.progressBar.style.width = `${100 * progress}%`;
  const round = iteration ? `Round ${iteration}/${ITERATIONS} · ` : '';
  const status = complete ? 'Complete · '+ITERATIONS+' Grover iterations' : busy
    ? `${simulation.paused ? 'Paused' : 'Running'} · ${round}${gate.name} · ${Math.round(100 * progress)}%`
    : gate ? `${round}${gate.name} complete` : 'Ready · input |0,0,↑⟩';
  dom.stageStatus.textContent = status;
  dom.circuitStatus.textContent = status;
  dom.circuitTarget.textContent = `w = ${targetText}`;
  const order = ['prepare', 'oracle', 'inverse', 'reference', 'forward'];
  for (const element of circuitGates) {
    const ownKind = element.dataset.circuitKind;
    const active = busy && ownKind === kind;
    const done = ownKind === 'prepare' ? simulation.completed > 0 : iteration > 0 &&
      (order.indexOf(ownKind) < order.indexOf(kind) || (!busy && ownKind === kind));
    element.classList.toggle('active', active);
    element.classList.toggle('complete', done && !active);
    element.classList.toggle('future', !active && !done);
  }
  dom.circuitPanel.classList.toggle('paused', simulation.paused);
  dom.circuitReadout.classList.toggle('complete', complete);
  for (const marker of dom.iterationTrack.children) {
    const n = Number(marker.dataset.iteration);
    const result = simulation.checkpoints.find(checkpoint => checkpoint.kind === 'forward' && checkpoint.iteration === n);
    marker.classList.toggle('complete', !!result);
    marker.classList.toggle('active', iteration === n && !result);
    marker.querySelector('b').textContent = result ? formatProbability(result.targetProbability) : '—';
  }
  const descriptions = {
    input: 'Begin in one localized mode. Prepare the balanced state to start the search.',
    prepare: 'Free evolution and a spin rotation prepare '+stateCount+' joint states, each with probability '+(100/stateCount).toFixed(3)+'%.',
    oracle: 'Only the marked position–spin state changes phase. Its probability stays fixed while its contribution interferes differently in space.',
    inverse: 'Free motion continues forward for '+inverseFactor+'T while the spin rotation is undone. Together they implement A†.',
    reference: 'Only the |0,0,↑⟩ coefficient turns through π while every other logical coefficient stays fixed.',
    forward: 'Free evolution plus the forward spin rotation completes the reflection. Unmarked contributions cancel and the marked mode grows.',
  };
  dom.gateDescription.textContent = complete ? (100*expectedProbability(ITERATIONS,side)).toFixed(3)+'% in the marked position–spin state after '+ITERATIONS+' iterations.' : descriptions[kind];
  const stepKey = `${simulation.revision}/${target}/${gate?.index ?? -1}`;
  geometry.update({ target, kind, progress, running: busy, paused: simulation.paused, iteration, complete,
    amplitudes: simulation.amplitudes, startAmplitudes: gate?.startAmplitudes || simulation.amplitudes, stepKey });
  document.documentElement.dataset.stage = String(simulation.completed);
  document.documentElement.dataset.gate = kind;
  document.documentElement.dataset.progress = String(progress);
  document.documentElement.dataset.target = String(target);
  if (flow) {
    const stats = flow.statistics(target, progress, !busy || simulation.paused);
    dom.particleProbability.textContent = formatProbability(stats.boxProbability);
    const model = ['input','prepare','inverse','forward'].includes(kind) ? 'Pauli flow · full spin current' : 'spin current + conserved gate transport';
    dom.flowStatus.textContent = `${stats.count.toLocaleString()} particles · ${model}`;
    document.documentElement.dataset.particleFailures = String(stats.failures);
    document.documentElement.dataset.particleLag = String(stats.maxLag);
  }
  if (previousBusy !== busy) { previousBusy = busy; dom.waveArea.classList.toggle('busy', busy); }
}

function installEvents() {
  dom.gridSize.addEventListener('input',()=>setGridSize(dom.gridSize.value));
  dom.next.addEventListener('click', startNext); dom.full.addEventListener('click', runFull);
  dom.reset.addEventListener('click', reset); dom.pause.addEventListener('click', togglePause);
  dom.speed.addEventListener('input', () => { params.speed = Number(dom.speed.value); dom.speedValue.textContent = `${params.speed.toFixed(2)}×`; });
  dom.brightness.addEventListener('input', () => { params.visGain = Number(dom.brightness.value); dom.brightnessValue.textContent = params.visGain.toFixed(2); renderDirty = true; });
  dom.gridToggle.addEventListener('click', () => {
    params.showGrid = !params.showGrid; dom.gridToggle.textContent = params.showGrid ? 'ON' : 'OFF';
    dom.gridToggle.setAttribute('aria-pressed', String(params.showGrid));
    dom.waveLabels.hidden = !params.showGrid; renderDirty = true;
  });
  for (const [id, key] of [['currentToggle','showCurrent'],['particlesToggle','showParticles'],['trailsToggle','showTrails'],['spinToggle','showSpin']]) {
    dom[id].addEventListener('click', () => {
      params[key] = !params[key]; dom[id].setAttribute('aria-pressed', String(params[key]));
      if (key === 'showTrails') flow?.clearTrails();
      renderDirty = true;
    });
  }
  for (const key of ['particleSize','arrowGrid','currentGain']) {
    dom[key].addEventListener('input', () => {
      params[key] = Number(dom[key].value); dom[`${key}Value`].textContent = String(params[key]); renderDirty = true;
    });
  }
  dom.trailHalfLife.addEventListener('input', () => {
    params.trailHalfLife = Number(dom.trailHalfLife.value);
    dom.trailHalfLifeValue.textContent = `${params.trailHalfLife.toFixed(1)} s`;
  });
  dom.waveView.addEventListener('change', () => {
    params.waveView=Number(dom.waveView.value);
    dom.phaseLegendPanel.hidden=params.waveView===0;
    dom.waveLegend.textContent=params.waveView===0 ? 'Color = local spin: cyan ↑ · magenta ↓ · violet balanced. Gold dots follow the total current.' : 'Component hue = phase. Gold dots always sample total density and follow the full spinor current.';
    renderDirty=true;
  });
  dom.currentMode.addEventListener('change',()=>{params.currentMode=Number(dom.currentMode.value);renderDirty=true;});
  dom.particleCount.addEventListener('change', () => setParticleCount(dom.particleCount.value));
  dom.minui.addEventListener('click', () => {
    dom.uibody.hidden = !dom.uibody.hidden; dom.minui.textContent = dom.uibody.hidden ? '+' : '−';
    dom.minui.setAttribute('aria-expanded', String(!dom.uibody.hidden));
  });
  dom.circuitToggle.addEventListener('click', () => {
    const collapsed = dom.circuitPanel.classList.toggle('collapsed');
    dom.circuitToggle.textContent = collapsed ? '+' : '−'; dom.circuitToggle.setAttribute('aria-expanded', String(!collapsed));
  });
  canvas.addEventListener('click', event => {
    const bounds = canvas.getBoundingClientRect(),side=simulation.model.side;
    const x = Math.min(side-1, Math.max(0, Math.floor(side * (event.clientX - bounds.left) / bounds.width)));
    const y = Math.min(side-1, Math.max(0, Math.floor(side * (bounds.bottom - event.clientY) / bounds.height)));
    chooseCell(side * x + y);
  });
  window.addEventListener('keydown', event => {
    if (event.target.matches('input,button,select,summary,[contenteditable]')) return;
    if (event.code === 'Space') { event.preventDefault(); togglePause(); }
    if (event.key.toLowerCase() === 'r') reset();
  });
  new ResizeObserver(layout).observe(dom.stage);
  window.addEventListener('resize', layout);
}

function layout() {
  const side = Math.max(160, Math.floor(Math.min(dom.stage.clientWidth,
    dom.stage.clientHeight - dom.waveHeader.offsetHeight - dom.waveFooter.offsetHeight - 24)));
  dom.waveArea.style.width = `${side}px`; dom.waveArea.style.height = `${side}px`;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const pixels = Math.round(side * dpr);
  if (canvas.width !== pixels || canvas.height !== pixels) { canvas.width = pixels; canvas.height = pixels; renderDirty = true; }
}

function compileShader(type, source) {
  const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}
function createProgram(vertex, fragment, uniforms, varyings) {
  const program = gl.createProgram();
  const vs = compileShader(gl.VERTEX_SHADER, vertex), fs = compileShader(gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs); gl.attachShader(program, fs);
  if (varyings) gl.transformFeedbackVaryings(program, varyings, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(program);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return { program, uniforms: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, name)])) };
}
async function loadShader(name) {
  const response = await fetch(`./shaders/${name}`);
  if (!response.ok) throw new Error(`Unable to load ${name}: ${response.status}`);
  return response.text();
}

function reconstructWave() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, waveFbo); gl.viewport(0, 0, GRID, GRID);
  gl.useProgram(reconstruction.program);
  gl.uniform4fv(reconstruction.uniforms['uCoefficients[0]'], Float32Array.from(sineCoefficients(simulation.amplitudes)));
  gl.uniform1f(reconstruction.uniforms.uGridSize, GRID);
  gl.uniform1i(reconstruction.uniforms.uSide,simulation.model.side);
  gl.drawArrays(gl.TRIANGLES, 0, 3); waveDirty = false;
}
function render() {
  gl.bindVertexArray(vao);
  if (waveDirty) reconstructWave();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(renderer.program); const u = renderer.uniforms;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, waveTexture); gl.uniform1i(u.uWave, 0);
  gl.uniform1f(u.uVisGain, params.visGain); gl.uniform1f(u.uVisGamma, params.visGamma);
  gl.uniform1i(u.uSide,simulation.model.side); gl.uniform1i(u.uShowGrid, params.showGrid ? 1 : 0);
  gl.uniform1i(u.uTarget, simulation.target >> 1);gl.uniform1i(u.uWaveView, params.waveView);
  const gate = simulation.active;
  gl.uniform1i(u.uGateRegion, gate?.kind === 'oracle' ? simulation.target >> 1 : gate?.kind === 'reference' ? 0 : -1);
  gl.uniform1f(u.uGateFlash, gate ? Math.sin(Math.PI * gate.progress) : 0);
  gl.uniform1f(u.uPixelSize, 1 / canvas.width);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  flow.render(canvas, { ...params, target: simulation.target }, displayGate(), waveTexture);
  glError = gl.getError() || glError;
  document.documentElement.dataset.glError = String(glError);
  renderDirty = false;
}
function advance(seconds) {
  if (simulation.active && !simulation.paused && Number.isFinite(seconds) && seconds > 0) {
    let remaining = seconds;
    while (simulation.active && remaining > 1e-12) {
      const gate = simulation.active, dt = Math.min(.02, remaining, gate.duration-gate.elapsed);
      if (dt <= 1e-12) break;
      flow?.step(gate, simulation.target, Math.min(1,(gate.elapsed+dt)/gate.duration), dt, params);
      simulation.advance(dt); remaining -= dt;
    }
    markChanged();
  }
  syncUi();
  if (ready && (waveDirty || renderDirty)) render();
}

// Recording keeps the inherited bridge; the named API is also used by the
// reproducible browser verification page. Reads expose the actual GPU texture.
const api = {
  isReady: () => ready,
  state: () => ({ ...simulation.snapshot(), boxProbability: cachedBoxProbability, grid: GRID, speed: params.speed }),
  reset, setTarget: chooseTarget, selectCell: chooseCell, startNext, runFull, togglePause,
  setParticleCount, setGridSize,
  readParticles: () => flow.readParticles(),
  readFlow: () => { const gate=displayGate();flow.prepare(gate,simulation.target);return flow.readField(gate.progress); },
  particleStats: () => flow.statistics(simulation.target, simulation.active?.progress ?? (simulation.last ? 1 : 0), true),
  setSpeed(value) { params.speed = Math.max(.1, Math.min(3, Number(value) || 1)); dom.speed.value = params.speed; dom.speedValue.textContent = `${params.speed.toFixed(2)}×`; },
  advanceTime(seconds) { advance(seconds); return this.state(); },
  beginFrameRecording() { frameRecordingActive = true; },
  endFrameRecording() { frameRecordingActive = false; lastTime = null; },
  renderRecordingFrame({ fps = 60 } = {}) { advance(params.speed / fps); },
  readWave() {
    if (waveDirty) render();
    const pixels = new Float32Array(GRID * GRID * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, waveFbo); gl.readPixels(0, 0, GRID, GRID, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); return pixels;
  },
  gpuInfo() {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER), grid: GRID, error: gl.getError() || glError };
  },
};
window.GroverMultiRegion = api;
window.BohmianGrover2D = api;

async function main() {
  makeTargetGrid(); installEvents(); layout(); syncUi();
  gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('This wave view requires WebGL2 with floating-point render targets.');
  const linear = !!gl.getExtension('OES_texture_float_linear');
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.DITHER);
  vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const [vertex, waveSource, renderSource] = await Promise.all([
    loadShader('fullscreen.vert'), loadShader('mode_wave.frag'), loadShader('multiregion_render.frag'),
  ]);
  reconstruction = createProgram(vertex, waveSource, ['uCoefficients[0]', 'uGridSize','uSide']);
  renderer = createProgram(vertex, renderSource, ['uWave', 'uVisGain', 'uVisGamma', 'uSide', 'uShowGrid', 'uTarget', 'uGateRegion', 'uGateFlash', 'uPixelSize', 'uWaveView']);
  waveTexture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, waveTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, GRID, GRID, 0, gl.RGBA, gl.FLOAT, null);
  waveFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, waveFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, waveTexture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Could not create the floating-point wave texture.');
  const initializedFlow = new FlowRenderer(gl, GRID, loadShader, createProgram);
  await initializedFlow.init(vertex); flow = initializedFlow;
  flow.reset(params.particleCount,simulation.model.side);
  ready = true; lastUiKey = ''; syncUi(); dom.loading.hidden = true; document.documentElement.dataset.webgl2 = 'ready';
  document.documentElement.dataset.viewMode = 'single'; render();
  requestAnimationFrame(function loop(now) {
    const dt = lastTime === null ? 0 : Math.min(.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (!frameRecordingActive) advance(dt * params.speed);
    requestAnimationFrame(loop);
  });
}
main().catch(error => {
  console.error(error); dom.loading.hidden = true; dom.error.hidden = false;
  dom.error.textContent = error.message; document.documentElement.dataset.webgl2 = 'error';
});
