// Exact four-mode gate geometry, in a fixed rephased logical basis.
// If a_q is the numerical wave's logical amplitude, the displayed amplitude is
// b_q = i^(-popcount(q)) exp(i (E1+E2) t_signed / hbar + i phi_reference) a_q.
// This removes the common box-energy phase and makes A|00> = (1,1,1,1)/2.
// The reference-pulse overall phase chooses the usual reflection-about-s sign.
// No such phase changes are applied to the spatial wave or its renderer.

const clamp01 = value => Math.max(0, Math.min(1, value));
const norm2 = z => z[0] * z[0] + z[1] * z[1];

// Effective basis: |0> = marked, |1> = the equal unmarked superposition.
// Project first, then normalize. This is not a reduced single-qubit state.
export function effectiveBlochState(marked, unmarked) {
  const markedWeight = norm2(marked), unmarkedWeight = norm2(unmarked);
  const weight = markedWeight + unmarkedWeight;
  if (weight < 1e-12) return { vector: null, weight, conditionalMarked: null };
  const [mr, mi] = marked, [ur, ui] = unmarked;
  return {
    vector: [2 * (mr * ur + mi * ui) / weight,
      2 * (mr * ui - mi * ur) / weight, (markedWeight - unmarkedWeight) / weight],
    weight: clamp01(weight),
    conditionalMarked: clamp01(markedWeight / weight),
  };
}

function mix(state, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  for (const bit of [1, 2]) {
    for (let q = 0; q < 4; q++) {
      if (q & bit) continue;
      const a = state[q], b = state[q | bit];
      state[q] = [c * a[0] - s * b[0], c * a[1] - s * b[1]];
      state[q | bit] = [s * a[0] + c * b[0], s * a[1] + c * b[1]];
    }
  }
}

function phase(state, q, angle) {
  const [re, im] = state[q], c = Math.cos(angle), s = Math.sin(angle);
  state[q] = [c * re - s * im, s * re + c * im];
}

// Gate numbers match the circuit. Progress is the actual operation fraction,
// never wall-clock time or a tween between endpoint arrows.
export function groverGeometryState(target, gate = 0, progress = 1) {
  const state = [[1, 0], [0, 0], [0, 0], [0, 0]];
  gate = Math.max(0, Math.min(5, Math.floor(gate)));
  progress = clamp01(progress);
  for (let step = 1; step <= gate; step++) {
    const p = step === gate ? progress : 1;
    if (step === 1 || step === 5) mix(state, Math.PI * p / 4);
    else if (step === 2) phase(state, target, -Math.PI * p);
    else if (step === 3) mix(state, -Math.PI * p / 4);
    else if (step === 4) {
      // exp(+i phi) S_00(phi): same ray as the physical reference pulse.
      for (let q = 1; q < 4; q++) phase(state, q, Math.PI * p);
    }
  }
  const unmarked = [0, 0];
  for (let q = 0; q < 4; q++) if (q !== target) {
    unmarked[0] += state[q][0] / Math.sqrt(3);
    unmarked[1] += state[q][1] / Math.sqrt(3);
  }
  const marked = state[target];
  const targetProbability = norm2(marked);
  const planeProbability = norm2(unmarked) + targetProbability;
  return {
    amplitudes: state,
    bloch: effectiveBlochState(marked, unmarked),
    real: [unmarked[0], marked[0]],
    imaginary: [unmarked[1], marked[1]],
    targetProbability: clamp01(targetProbability),
    outsideProbability: clamp01(1 - planeProbability),
  };
}

const gateNames = ['Input |00⟩', 'Prepare A', 'Oracle Oω', 'Inverse A†', 'Reference S₀₀', 'Forward A'];
const descriptions = [
  'Start in |00⟩. Preparation will create the balanced search state |s⟩.',
  'A spreads the input into four equal amplitudes. The cyan point marks the prepared state |s⟩.',
  'The oracle rotates the relative phase by π around the vertical axis. Marked probability stays at 25%.',
  'A† reverses the box mixing. The unit vector shows the normalized projection; its subspace weight can change.',
  'S₀₀ phase-flips the |00⟩ amplitude. This is the central reflection of the three-part diffuser.',
  'A completes the diffuser. Interference cancels the unmarked amplitudes and builds the marked answer.',
];

export function createGroverGeometry(root) {
  const get = name => root.querySelector(`[data-geometry="${name}"]`);
  const nodes = Object.fromEntries([
    'sphere', 'backGrid', 'frontGrid', 'axes', 'xLabel', 'yLabel',
    'northLabel', 'southLabel', 'northDot', 'southDot',
    'vector', 'tip', 'tipHalo', 'frontTrace', 'backTrace', 'gateStart',
    'preparedDot', 'preparedLabel', 'status', 'target', 'description',
    'markedValue', 'markedBar', 'weightValue', 'weightBar', 'outsideValue',
    'conditionalValue', 'normValue', 'liveDescription', 'resetView',
  ].map(name => [name, get(name)]));
  const center = [180, 153], radius = 108;
  const defaultView = { yaw: .65, pitch: .26 };
  let yaw = defaultView.yaw, pitch = defaultView.pitch;
  let lastKey = '', curveKey = '', gridKey = '', samples = [], frame = null, drag = null;
  const labels = ['00', '01', '10', '11'];
  const percent = value => `${(100 * value).toFixed(1)}%`;
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  let right, up, eye;

  function camera() {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    right = [cy, -sy, 0]; up = [-sy * sp, -cy * sp, cp]; eye = [sy * cp, cy * cp, sp];
  }
  function project(v) {
    return [center[0] + radius * dot(v, right), center[1] - radius * dot(v, up), dot(v, eye)];
  }
  const xy = p => `${p[0].toFixed(3)} ${p[1].toFixed(3)}`;

  // Split paths at the sphere's front/back boundary. Null vectors break a path
  // if the normalized projection becomes undefined; no false connecting arc.
  function hemispherePaths(points) {
    const paths = { front: '', back: '' };
    for (let i = 1; i < points.length; i++) {
      if (!points[i - 1] || !points[i]) continue;
      const a = project(points[i - 1]), b = project(points[i]);
      const frontA = a[2] >= 0, frontB = b[2] >= 0;
      if (frontA === frontB) paths[frontA ? 'front' : 'back'] += `M${xy(a)}L${xy(b)}`;
      else {
        const t = a[2] / (a[2] - b[2]), cross = a.map((value, k) => value + t * (b[k] - value));
        paths[frontA ? 'front' : 'back'] += `M${xy(a)}L${xy(cross)}`;
        paths[frontB ? 'front' : 'back'] += `M${xy(cross)}L${xy(b)}`;
      }
    }
    return paths;
  }

  function positionDot(node, vector, size = 4) {
    node.setAttribute('visibility', vector ? 'visible' : 'hidden');
    if (!vector) return;
    const [x, y, depth] = project(vector);
    node.setAttribute('cx', x.toFixed(3)); node.setAttribute('cy', y.toFixed(3));
    node.setAttribute('r', size);
    node.setAttribute('opacity', depth < 0 ? '.55' : '1');
  }
  function label(node, vector, dx = 0, dy = 0) {
    const [x, y] = project(vector);
    node.setAttribute('x', (x + dx).toFixed(3)); node.setAttribute('y', (y + dy).toFixed(3));
  }

  function draw() {
    if (!frame || root.hidden) return;
    camera();
    const viewKey = `${yaw}/${pitch}`;
    if (viewKey !== gridKey) {
      gridKey = viewKey;
      const circles = [];
      for (const z of [-.5, 0, .5]) {
        const r = Math.sqrt(1 - z * z);
        circles.push(Array.from({ length: 129 }, (_, i) => {
          const t = i * Math.PI / 64; return [r * Math.cos(t), r * Math.sin(t), z];
        }));
      }
      for (let longitude = 0; longitude < 4; longitude++) {
        const phi = longitude * Math.PI / 4;
        circles.push(Array.from({ length: 129 }, (_, i) => {
          const t = i * Math.PI / 64; return [Math.sin(t) * Math.cos(phi), Math.sin(t) * Math.sin(phi), Math.cos(t)];
        }));
      }
      const paths = circles.map(hemispherePaths);
      nodes.frontGrid.setAttribute('d', paths.map(p => p.front).join(''));
      nodes.backGrid.setAttribute('d', paths.map(p => p.back).join(''));
      nodes.axes.setAttribute('d', [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(v =>
        `M${xy(project(v.map(x => -1.16 * x)))}L${xy(project(v.map(x => 1.16 * x)))}`).join(''));
      label(nodes.xLabel, [1.22, 0, 0], 0, 4); label(nodes.yLabel, [0, 1.22, 0], 0, 4);
      label(nodes.northLabel, [0, 0, 1.22], 0, -5); label(nodes.southLabel, [0, 0, -1.22], 0, 11);
      positionDot(nodes.northDot, [0, 0, 1], 2.6); positionDot(nodes.southDot, [0, 0, -1], 2.6);
      const prepared = [Math.sqrt(3) / 2, 0, -.5];
      positionDot(nodes.preparedDot, prepared, 5.5); label(nodes.preparedLabel, prepared, 12, 3);
    }

    const { target, gate, progress, state } = frame;
    const nextCurveKey = `${target}/${gate}`;
    if (nextCurveKey !== curveKey) {
      curveKey = nextCurveKey;
      samples = Array.from({ length: 129 }, (_, i) => groverGeometryState(target, gate, i / 128).bloch.vector);
    }
    const prefix = samples.slice(0, Math.floor(progress * 128) + 1);
    prefix.push(state.bloch.vector);
    const trace = gate ? hemispherePaths(prefix) : { front: '', back: '' };
    nodes.frontTrace.setAttribute('d', trace.front); nodes.backTrace.setAttribute('d', trace.back);
    positionDot(nodes.gateStart, samples[0], 4.2);
    const vector = state.bloch.vector;
    nodes.vector.setAttribute('visibility', vector ? 'visible' : 'hidden');
    if (vector) {
      const tip = project(vector);
      nodes.vector.setAttribute('d', `M${center.join(' ')}L${xy(tip)}`);
      nodes.vector.setAttribute('stroke-dasharray', tip[2] < 0 ? '5 3' : 'none');
      nodes.vector.setAttribute('opacity', tip[2] < 0 ? '.65' : '1');
    }
    positionDot(nodes.tipHalo, vector, 9); positionDot(nodes.tip, vector, 4.2);
    root.dataset.viewYaw = String(yaw); root.dataset.viewPitch = String(pitch);
  }

  function orbit(nextYaw, nextPitch) {
    yaw = nextYaw; pitch = Math.max(-1.15, Math.min(1.15, nextPitch)); draw();
  }
  nodes.sphere.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch };
    nodes.sphere.setPointerCapture(event.pointerId); nodes.sphere.focus();
  });
  nodes.sphere.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    orbit(drag.yaw + (event.clientX - drag.x) * .009, drag.pitch - (event.clientY - drag.y) * .009);
  });
  const stopDrag = () => { drag = null; };
  nodes.sphere.addEventListener('pointerup', stopDrag);
  nodes.sphere.addEventListener('pointercancel', stopDrag);
  nodes.sphere.addEventListener('lostpointercapture', stopDrag);
  nodes.sphere.addEventListener('keydown', event => {
    const turns = { ArrowLeft: [-.12, 0], ArrowRight: [.12, 0], ArrowUp: [0, .12], ArrowDown: [0, -.12] };
    if (turns[event.key]) { event.preventDefault(); orbit(yaw + turns[event.key][0], pitch + turns[event.key][1]); }
    else if (event.key === 'Home') { event.preventDefault(); orbit(defaultView.yaw, defaultView.pitch); }
  });
  nodes.resetView.addEventListener('click', () => orbit(defaultView.yaw, defaultView.pitch));

  return {
    update({ target, gate, progress = 1, running = false, paused = false, parallel = false }) {
      root.hidden = parallel;
      if (parallel) { lastKey = ''; drag = null; return; }
      progress = clamp01(progress);
      const key = `${target}/${gate}/${progress}/${running}/${paused}`;
      if (key === lastKey) return;
      lastKey = key;
      const state = groverGeometryState(target, gate, progress);
      frame = { target, gate, progress, state };
      draw();
      const finished = gate === 5 && !running;
      nodes.target.textContent = `Target |${labels[target]}⟩`;
      nodes.status.textContent = finished ? 'Answer reached' : `${gateNames[gate]}${running ? ` · ${paused ? 'paused · ' : ''}${Math.round(100 * progress)}%` : gate ? ' · held' : ''}`;
      nodes.description.textContent = !state.bloch.vector ? 'The projection has zero weight, so its direction is undefined.'
        : finished ? 'The state has reached the marked north pole. All probability is in the Grover subspace and in the marked answer.' : descriptions[gate];
      nodes.markedValue.textContent = percent(state.targetProbability);
      nodes.weightValue.textContent = percent(state.bloch.weight);
      nodes.outsideValue.textContent = percent(state.outsideProbability);
      nodes.conditionalValue.textContent = state.bloch.conditionalMarked === null ? '—' : percent(state.bloch.conditionalMarked);
      nodes.normValue.textContent = state.bloch.vector ? '|r| = 1' : 'r undefined';
      nodes.markedBar.style.width = percent(state.targetProbability);
      nodes.weightBar.style.width = percent(state.bloch.weight);
      nodes.liveDescription.textContent = `${gateNames[gate]}. The gold unit vector represents the normalized marked/unmarked projection. Subspace weight ${percent(state.bloch.weight)}; actual marked probability ${percent(state.targetProbability)}. Drag or use arrow keys to rotate the view.`;
      root.dataset.gate = String(gate);
      root.dataset.progress = String(progress);
      root.dataset.target = String(target);
      root.dataset.blochVector = JSON.stringify(state.bloch.vector);
      root.dataset.subspaceProbability = String(state.bloch.weight);
      root.dataset.conditionalMarked = String(state.bloch.conditionalMarked);
      root.dataset.markedProbability = String(state.targetProbability);
      root.dataset.outsideProbability = String(state.outsideProbability);
    },
  };
}
