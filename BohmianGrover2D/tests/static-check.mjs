import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(root, relative), 'utf8');
const fail = message => { throw new Error(message); };

const [main, html, recording, waveRender, particleUpdate, arrowVertex] = await Promise.all([
  read('main.js'),
  read('index.html'),
  read('recording.js'),
  read('shaders/wave_render.frag'),
  read('shaders/particle_update.vert'),
  read('shaders/phase_arrows.vert'),
]);

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const requiredIds = new Set([...main.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1]));
for (const id of requiredIds) if (!htmlIds.has(id)) fail(`main.js references missing DOM id #${id}`);

const shaderReferences = new Set([...main.matchAll(/'([a-z0-9_]+\.(?:vert|frag))'/g)].map(match => match[1]));
const shaderFiles = new Set(await readdir(path.join(root, 'shaders')));
for (const shader of shaderReferences) if (!shaderFiles.has(shader)) fail(`Missing shader ${shader}`);
for (const shader of shaderReferences) {
  const source = await read(`shaders/${shader}`);
  if (!source.startsWith('#version 300 es')) fail(`${shader} is not GLSL ES 3.00`);
  const opens = [...source].filter(character => character === '{').length;
  const closes = [...source].filter(character => character === '}').length;
  if (opens !== closes) fail(`${shader} has unbalanced braces`);
}

const gridTargets = [...html.matchAll(/data-grid-target="([0-3])"/g)].map(match => Number(match[1]));
if (gridTargets.length !== 4 || new Set(gridTargets).size !== 4) fail('Parallel view must contain four distinct target mini-grids.');
for (const target of [0, 1, 2, 3]) if (!gridTargets.includes(target)) fail(`Parallel view is missing target ${target}.`);
if (!main.includes("let viewMode = 'multi'")) fail('Four-grid parallel view is not the default.');
if (!main.includes('const simulations = [0, 1, 2, 3].map')) fail('Runtime does not allocate one simulation context per target.');
for (const resource of ['wave: {}', 'particle: {}', 'trails: {}', 'diagnostics: null']) {
  if (!main.includes(resource)) fail(`Parallel simulation context is missing ${resource}.`);
}
if (!main.includes("quadrant:'target'")) fail('The parallel oracle is not resolved from each simulation target.');
if (!html.includes('id="viewToggle"') || !html.includes('id="singleTargetBar"')) fail('Single/multi view controls are incomplete.');
const uiMarkup = html.slice(html.indexOf('<div id="ui"'), html.indexOf('<div id="info"'));
if (uiMarkup.includes('data-target=')) fail('Marked-state buttons must live above the simulation, not in the left panel.');
if (!main.includes("button.closest('#singleTargetBar')")) fail('Blue target selection must be scoped to the single-grid target bar.');
if (!html.includes('id="stageStatus" hidden') || !html.includes('id="stats" hidden')) fail('Left-panel stage and statistics readouts must remain hidden.');
const multiGridMarkup = html.slice(html.indexOf('<div id="multiGrids"'), html.indexOf('<div id="singleTargetBar"'));
if (multiGridMarkup.includes('<button class="selected" data-target=')) fail('A multigrid target header is incorrectly initialized with blue selection styling.');
if (!html.includes('id="circuitPanel"') || !html.includes('id="circuitToggle"')) fail('The minimizable quantum circuit panel is missing.');
const circuitStages = [...html.matchAll(/data-circuit-stage="([1-5])"/g)].map(match => Number(match[1]));
if (circuitStages.length !== 5 || new Set(circuitStages).size !== 5) fail('The circuit must contain five distinct synchronized gate stages.');
for (const stage of [1, 2, 3, 4, 5]) {
  if (!main.includes(`circuitStage:${stage}`)) fail(`Operation ${stage} is not connected to its circuit gate.`);
}
if (!main.includes('function syncCircuitDiagram()') || !main.includes('function toggleCircuitDiagram()')) fail('Circuit highlighting or minimization logic is missing.');

if (!waveRender.includes('quadrantGlow') || !waveRender.includes('vec3(1.0,0.015,0.035)')) {
  fail('High-contrast crimson marked-quadrant glow is missing.');
}
for (const term of ['psi.x * dx.y - psi.y * dx.x', 'psi.x * dy.y - psi.y * dy.x']) {
  if (!particleUpdate.includes(term) || !arrowVertex.includes(term)) fail(`Guidance mismatch for ${term}`);
}
if (!recording.includes('window.BohmianGrover2D') || !recording.includes('bohmian-grover-2d-')) {
  fail('Grover recording bridge or filename is missing.');
}

console.log(`DOM references: ${requiredIds.size}/${requiredIds.size} present`);
console.log(`Shaders: ${shaderReferences.size} runtime shaders present, GLSL ES 3.00, and brace-balanced`);
console.log('Default four-grid view has independent wave, particle, trail, and diagnostics contexts for all targets.');
console.log('Multigrid target headers stay crimson; blue selection is scoped to single-grid mode; extra left-panel readouts are hidden.');
console.log('Five-stage Grover circuit is minimizable and wired to preparation, oracle, and diffuser checkpoints.');
console.log('Particle and arrow shaders retain the same phase-gradient numerator; recording remains Grover-specific.');
