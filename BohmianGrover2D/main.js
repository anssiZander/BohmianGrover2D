import { SearchSimulation, expectedProbability } from './multiregion-core.js?v=20261014-ordinary1';
import { HistogramRenderer, columnHeight } from './histogram-renderer.js?v=20261014-ordinary1';

// Reuse the non-free branch's exact logical gates and timing, unchanged.
const simulation = new SearchSimulation(15, 0, 4);
const dom = Object.fromEntries(['gridSize', 'gridSizeValue', 'gridSummary', 'stateCountLabel',
  'initialState', 'targetState', 'selectInitial', 'selectTarget', 'selectionHint', 'next', 'full',
  'pause', 'reset', 'gateProgress', 'progressBar', 'stageStatus', 'speed', 'speedValue',
  'phaseColors', 'valueLabels', 'phaseLegend', 'c', 'plotArea', 'plotBadge', 'error',
  'markedLabel', 'markedProbability', 'orbitLeft', 'orbitRight', 'zoomOut', 'zoomIn', 'topView',
  'resetView', 'gateDescription', 'inspectState', 'circuitStatus', 'circuitInput', 'circuitDiagram',
  'repeatCaption', 'prepareSymbol', 'inverseSymbol', 'forwardSymbol', 'iterationTrack', 'mixerNote',
  'resultState', 'successFill', 'successValue', 'expectedValue', 'normValue', 'iterationsNote', 'theoryMixer',
].map(id => [id, document.getElementById(id)]));
const gateNodes = [...document.querySelectorAll('[data-circuit-kind]')];
const options = { phaseColors: true, valueLabels: true, speed: 1 };
let renderer, ready = false, dirty = true, recording = false, lastTime = null, selection = null, hovered = -1;
const percent = p => `${(100 * Math.max(0, Math.min(1, p))).toFixed(2)}%`;
const ket = q => `|${simulation.model.labels[q]}⟩`;
const symbol = () => simulation.model.side % 2 ? 'B' : 'H';
const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const markDirty = () => { dirty = true; };
function error(message) { text(dom.error, message); dom.error.hidden = !message; }

function buildGridUI() {
  const { side, stateCount, labels, iterations } = simulation.model;
  dom.gridSize.value = side; text(dom.gridSizeValue, `${side} × ${side}`);
  dom.gridSize.setAttribute('aria-valuetext', `${side} by ${side}, ${stateCount} states`);
  text(dom.gridSummary, `${stateCount} computational basis states. Changing size resets the search.`);
  text(dom.stateCountLabel, `${stateCount} states · ${iterations} ${iterations === 1 ? 'iteration' : 'iterations'}`);
  document.title = `Ordinary Grover · ${side}×${side}`;
  for (const select of [dom.initialState, dom.targetState]) {
    select.replaceChildren(...labels.map((label, q) => {
      const option = document.createElement('option'); option.value = q;
      option.textContent = `|${label}⟩  ·  (${Math.floor(q / side)}, ${q % side})`; return option;
    }));
  }
  dom.iterationTrack.replaceChildren(...Array.from({length: iterations}, (_, i) => {
    const node = document.createElement('div'); node.dataset.iteration = i+1;
    const label = document.createElement('span'); label.textContent = `Round ${i+1}`;
    const value = document.createElement('b'); value.textContent = '—'; node.append(label, value); return node;
  }));
  text(dom.repeatCaption, `REPEAT ${iterations} ${iterations === 1 ? 'TIME' : 'TIMES'}`);
  text(dom.prepareSymbol, symbol()); text(dom.forwardSymbol, symbol());
  dom.inverseSymbol.replaceChildren(document.createTextNode(symbol()), Object.assign(document.createElement('sup'), { textContent: '†' }));
  const odd = side % 2;
  text(dom.mixerNote, odd ? `B is the balanced ${stateCount}-state mixer. B† is its inverse; this grid is not a qubit register.`
    : `H is the ${2*Math.log2(side)}-qubit Hadamard. H† is its inverse.`);
  text(dom.theoryMixer, odd ? `For ${side}×${side}, the original balanced mixer is B[(x,y),(u,v)] = exp[2πi(xv−yu)/${side}]/${side}. It is unitary, Hermitian, and prepares equal probabilities from any basis state. In the reflection formula below, replace H with B.`
    : 'On 2×2 and 4×4 grids, H is the tensor-product qubit Hadamard.');
  text(dom.expectedValue, percent(expectedProbability(iterations,side)));
  text(dom.iterationsNote, `The first Grover peak occurs after ${iterations} amplification ${iterations === 1 ? 'round' : 'rounds'} for ${stateCount} states.`);
  dom.circuitDiagram.setAttribute('aria-label', `Circuit for ${stateCount} states: ${symbol()} preparation, then ${iterations} repeats of oracle, inverse ${symbol()}, initial-state reference phase, and forward ${symbol()}.`);
}
function setGridSize(side) {
  if (!simulation.setGridSize(Number(side))) return false;
  selection = null; hovered = -1; if (renderer) renderer.hover = -1;
  buildGridUI(); refresh(); return true;
}
function choose(which, q) {
  const changed = which === 'initial' ? simulation.setInitial(Number(q)) : simulation.setTarget(Number(q));
  if (!changed) return false;
  selection = null; refresh(); return true;
}
function reset() { simulation.reset(); selection = null; refresh(); }
function startNext() {
  if (!simulation.startNext()) return false;
  selection = null; refresh(); return true;
}
function runFull() {
  if (!simulation.runFull()) return false;
  selection = null; refresh(); return true;
}
function togglePause() {
  if (!simulation.active) return false;
  simulation.paused = !simulation.paused; refresh(); return simulation.paused;
}
function setSelection(which) {
  if (simulation.active) return false;
  selection = selection === which ? null : which; refresh(); return true;
}
function setSpeed(value) {
  const speed = Number(value); if (!Number.isFinite(speed)) return false;
  options.speed = Math.max(.25, Math.min(3,speed)); dom.speed.value = options.speed;
  text(dom.speedValue, `${options.speed.toFixed(2).replace(/0$/, '')}×`); return true;
}
function description(kind) {
  const mixer = symbol();
  return {
    input: `All probability starts in ${ket(simulation.initial)}. Apply ${mixer} to prepare equal probabilities across the grid.`,
    prepare: `${mixer} takes the initial state into a balanced superposition: every column ends at ${(100/simulation.model.stateCount).toFixed(2)}%.`,
    oracle: `The oracle rotates the phase of the marked state ${ket(simulation.target)} by π. Its color changes; every column keeps the same height.`,
    inverse: `${mixer}† undoes the preparation transform. The oracle's phase change now produces different column heights.`,
    reference: `Sᵢ flips the phase of the initial state ${ket(simulation.initial)}. Again, the heights stay fixed.`,
    forward: `${mixer} completes the reflection about the prepared state. The marked column grows at each completed round.`,
  }[kind];
}
function nextLabel(gate) {
  if (!gate) return 'Search complete';
  return {prepare:`Apply ${symbol()} · prepare`,oracle:'Apply oracle · mark',inverse:`Apply ${symbol()}† · inverse`,reference:'Apply Sᵢ · reference',forward:`Apply ${symbol()} · forward`}[gate.kind];
}
function syncUI(state) {
  const {stateCount,iterations,gates} = simulation.model, gate = simulation.active, next = gates[state.completed];
  dom.initialState.value = state.initial; dom.targetState.value = state.target;
  for (const node of [dom.initialState,dom.targetState,dom.selectInitial,dom.selectTarget]) node.disabled = state.busy;
  dom.selectInitial.setAttribute('aria-pressed', selection === 'initial'); dom.selectTarget.setAttribute('aria-pressed', selection === 'target');
  dom.c.classList.toggle('picking',!!selection);
  text(dom.selectionHint, state.busy ? 'State selection is locked until this operation finishes.' : selection ? `Click a column or square to choose the ${selection === 'initial' ? 'initial' : 'marked'} state. Drag still orbits the camera.` : 'Choose states above, or pick a square on the histogram.');
  dom.next.disabled = state.busy || !next || !ready; dom.full.disabled = state.busy || !ready;
  dom.pause.disabled = !state.busy; text(dom.pause,state.paused ? 'Resume' : 'Pause');
  text(dom.next,nextLabel(next));
  const progress = state.busy ? state.progress : state.completed ? 1 : 0;
  dom.progressBar.style.width = `${progress*100}%`; dom.gateProgress.setAttribute('aria-valuenow',Math.round(progress*100));
  text(dom.stageStatus, gate ? `${state.paused ? 'Paused · ' : ''}${gate.name}${gate.iteration ? ` · round ${gate.iteration}/${iterations}` : ''}`
    : !next ? 'Search complete · inspect the result' : state.completed ? 'Checkpoint · apply the next operation' : 'Ready to prepare');
  text(dom.plotBadge,state.busy ? `${state.paused ? 'PAUSED · ' : ''}${state.kind.toUpperCase()}${state.iteration ? ` · ROUND ${state.iteration}` : ''}`
    : state.completed === gates.length ? 'SEARCH COMPLETE' : state.completed ? `${state.kind.toUpperCase()} · CHECKPOINT` : 'INPUT STATE');
  const probability = state.probabilities[state.target], formatted = percent(probability);
  text(dom.markedLabel,`Marked ${ket(state.target)}`);
  if (dom.markedProbability.dataset.value !== formatted) {
    dom.markedProbability.dataset.value = formatted;
    dom.markedProbability.replaceChildren(document.createTextNode(formatted.slice(0,-1)),Object.assign(document.createElement('span'),{textContent:'%'}));
  }
  text(dom.resultState,ket(state.target)); text(dom.successValue,formatted); text(dom.normValue,percent(state.norm));
  dom.successFill.style.width = `${Math.min(100,100*probability)}%`;
  text(dom.gateDescription,description(state.kind)); text(dom.circuitInput,ket(state.initial));
  text(dom.circuitStatus,`${state.completed} / ${gates.length} operations`);
  for (const node of gateNodes) {
    const kind = node.dataset.circuitKind;
    node.classList.toggle('active',state.busy && state.kind === kind);
    node.classList.toggle('done',!state.busy && state.kind === kind && state.completed > 0);
  }
  for (const node of dom.iterationTrack.children) {
    const checkpoint = state.checkpoints.find(item => item.iteration === Number(node.dataset.iteration) && item.kind === 'forward');
    node.classList.toggle('complete',!!checkpoint); text(node.lastElementChild,checkpoint ? percent(checkpoint.targetProbability) : '—');
  }
  const q = hovered >= 0 && hovered < stateCount ? hovered : state.target;
  const phase = state.probabilities[q] > 1e-12 ? `${(Math.atan2(state.amplitudes[2*q+1],state.amplitudes[2*q])/Math.PI).toFixed(2)}π` : 'undefined at zero';
  text(dom.inspectState,`${ket(q)} · ${percent(state.probabilities[q])}\nPhase ${phase}${q === state.target ? '\nMarked state' : q === state.initial ? '\nInitial state' : ''}`);
  dom.phaseLegend.hidden = !options.phaseColors;
}
function render() {
  const state = simulation.snapshot(); syncUI(state);
  renderer?.draw({...state, labels:simulation.model.labels},options); dirty = false;
}
function refresh() { dirty = true; if (renderer && ready) render(); }
function advance(seconds) { simulation.advance(seconds); refresh(); return simulation.snapshot(); }

dom.gridSize.addEventListener('input',()=>setGridSize(dom.gridSize.value));
dom.initialState.addEventListener('change',()=>choose('initial',dom.initialState.value));
dom.targetState.addEventListener('change',()=>choose('target',dom.targetState.value));
dom.selectInitial.addEventListener('click',()=>setSelection('initial'));
dom.selectTarget.addEventListener('click',()=>setSelection('target'));
dom.next.addEventListener('click',startNext); dom.full.addEventListener('click',runFull);
dom.reset.addEventListener('click',reset); dom.pause.addEventListener('click',togglePause);
dom.speed.addEventListener('input',()=>setSpeed(dom.speed.value));
for (const key of ['phaseColors','valueLabels']) dom[key].addEventListener('change',()=>{ options[key]=dom[key].checked; refresh(); });
dom.orbitLeft.addEventListener('click',()=>renderer?.orbit(-.25)); dom.orbitRight.addEventListener('click',()=>renderer?.orbit(.25));
dom.zoomIn.addEventListener('click',()=>renderer?.zoom(1.15)); dom.zoomOut.addEventListener('click',()=>renderer?.zoom(1/1.15));
dom.topView.addEventListener('click',()=>renderer?.setView({yaw:0,elevation:Math.PI/2-.015,zoom:1.15}));
dom.resetView.addEventListener('click',()=>renderer?.resetView());
window.addEventListener('keydown',event=>{
  if (event.target.closest('input,select,button,summary,textarea,[contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Space') { event.preventDefault(); togglePause(); }
  if (event.key.toLowerCase() === 'r') reset();
});

const api = {
  isReady:()=>ready && !renderer?.lost,
  state:()=>simulation.snapshot(), reset, setInitial:q=>choose('initial',q), setTarget:q=>choose('target',q),
  setGridSize, startNext, runFull, togglePause, setSpeed, advanceTime:advance,
  cameraState:()=>({...renderer.view}),
  setCamera:view=>{ renderer.setView(view); refresh(); return {...renderer.view}; },
  resetCamera:()=>{ renderer.resetView(); refresh(); },
  projectState:(q,top=true)=>renderer.projectState(q,top),
  pickAt:(x,y)=>renderer.hitTest(x,y),
  histogram:()=>({side:simulation.model.side,heights:simulation.snapshot().probabilities.map(p=>columnHeight(p,simulation.model.side)),maximum:columnHeight(1,simulation.model.side)}),
  beginFrameRecording:()=>{recording=true;lastTime=null;},
  endFrameRecording:()=>{recording=false;lastTime=null;},
  renderRecordingFrame:({fps=60}={})=>advance(options.speed/(Number.isFinite(fps) && fps>0 ? fps : 60)),
};
window.OrdinaryGrover = api;
// Keep the existing canvas recorder's deterministic-clock contract.
window.BohmianGrover2D = api;

buildGridUI();
try {
  renderer = new HistogramRenderer(dom.c, {onChange:markDirty,onError:error,
    onHover:q=>{hovered=q;markDirty();},
    onPick:q=>{hovered=q; if (selection) choose(selection,q); else refresh();},
  });
  ready = true; render();
  new ResizeObserver(markDirty).observe(dom.plotArea);
  window.addEventListener('resize',markDirty);
  function frame(time) {
    const dt = lastTime === null ? 0 : Math.min(.05,(time-lastTime)/1000); lastTime=time;
    if (!recording && simulation.active && !simulation.paused && !renderer.lost) {simulation.advance(dt*options.speed);dirty=true;}
    try {if (dirty) render();} catch (failure) {ready=false;error(failure.message);return;}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (failure) {ready=false;error(failure.message);syncUI(simulation.snapshot());console.error(failure);}
