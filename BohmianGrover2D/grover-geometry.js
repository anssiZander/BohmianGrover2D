// Exact four-mode gate geometry, in a fixed rephased logical basis.
// If a_q is the numerical wave's logical amplitude, the displayed amplitude is
// b_q = i^(-popcount(q)) exp(i (E1+E2) t_signed / hbar + i phi_reference) a_q.
// This removes the common box-energy phase and makes A|00> = (1,1,1,1)/2.
// The reference-pulse overall phase chooses the usual reflection-about-s sign.
// No such phase changes are applied to the spatial wave or its renderer.

const clamp01 = value => Math.max(0, Math.min(1, value));
const norm2 = z => z[0] * z[0] + z[1] * z[1];

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
    real: [unmarked[0], marked[0]],
    imaginary: [unmarked[1], marked[1]],
    targetProbability: clamp01(targetProbability),
    outsideProbability: clamp01(1 - planeProbability),
  };
}

const gateNames = ['Input |00⟩', 'Prepare A', 'Oracle Oω', 'Inverse A†', 'Reference S₀₀', 'Forward A'];
const descriptions = [
  'Start in |00⟩. Preparation will create the balanced search state |s⟩.',
  'A spreads the input into four equal amplitudes. The state arrives at |s⟩, 30° above the unmarked axis.',
  'The oracle turns the marked amplitude through π. Its probability stays at 25% while its sign reverses.',
  'A† reverses the box mixing. The intermediate state can leave the marked/unmarked plane.',
  'S₀₀ phase-flips the |00⟩ amplitude. This is the central reflection of the three-part diffuser.',
  'A completes the diffuser. Interference cancels the unmarked amplitudes and builds the marked answer.',
];

export function createGroverGeometry(root) {
  const get = name => root.querySelector(`[data-geometry="${name}"]`);
  const nodes = Object.fromEntries([
    'real', 'imaginary', 'realDot', 'imaginaryDot', 'realTrace', 'imaginaryTrace',
    'startReal', 'startImaginary', 'status', 'target', 'description',
    'markedValue', 'markedBar', 'outsideValue', 'outsideBar', 'liveDescription',
  ].map(name => [name, get(name)]));
  const center = [170, 154], radius = 110;
  const point = vector => [center[0] + radius * vector[0], center[1] - radius * vector[1]];
  const coordinate = vector => point(vector).map(value => value.toFixed(3)).join(' ');
  const path = vectors => vectors.map((vector, i) => `${i ? 'L' : 'M'}${coordinate(vector)}`).join(' ');
  let lastKey = '', curveKey = '', samples = [];

  function arrow(node, vector, dot) {
    const [x, y] = point(vector), visible = Math.hypot(...vector) > 1e-7;
    node.setAttribute('d', `M${center.join(' ')} L${x.toFixed(3)} ${y.toFixed(3)}`);
    node.setAttribute('opacity', visible ? '1' : '0');
    if (dot) {
      dot.setAttribute('cx', x.toFixed(3));
      dot.setAttribute('cy', y.toFixed(3));
      dot.setAttribute('opacity', visible ? '1' : '0');
    }
  }

  return {
    update({ target, gate, progress = 1, running = false, paused = false, parallel = false }) {
      progress = clamp01(progress);
      const key = `${target}/${gate}/${progress}/${running}/${paused}/${parallel}`;
      if (key === lastKey) return;
      lastKey = key;
      const state = groverGeometryState(target, gate, progress);
      const start = groverGeometryState(target, gate, 0);
      const labels = ['00', '01', '10', '11'];
      const finished = gate === 5 && !running;
      const percent = value => `${(100 * value).toFixed(1)}%`;

      arrow(nodes.real, state.real, nodes.realDot);
      arrow(nodes.imaginary, state.imaginary, nodes.imaginaryDot);
      arrow(nodes.startReal, start.real);
      arrow(nodes.startImaginary, start.imaginary);

      // Draw the current gate's actual projected path, including its complex
      // component, rather than inventing a planar rotation for the subgates.
      const nextCurveKey = `${target}/${gate}`;
      if (nextCurveKey !== curveKey) {
        curveKey = nextCurveKey;
        samples = Array.from({ length: 65 }, (_, i) => groverGeometryState(target, gate, i / 64));
      }
      const prefix = samples.slice(0, Math.floor(progress * 64) + 1);
      prefix.push(state);
      nodes.realTrace.setAttribute('d', gate ? path(prefix.map(s => s.real)) : '');
      nodes.imaginaryTrace.setAttribute('d', gate ? path(prefix.map(s => s.imaginary)) : '');
      nodes.target.textContent = `${parallel ? 'Selected' : 'Target'} |${labels[target]}⟩`;
      nodes.status.textContent = finished ? 'Answer reached' : `${gateNames[gate]}${running ? ` · ${paused ? 'paused · ' : ''}${Math.round(100 * progress)}%` : gate ? ' · held' : ''}`;
      nodes.description.textContent = finished
        ? 'One oracle and one diffuser have carried |s⟩ to the marked state |ω⟩. The other three logical amplitudes cancel.'
        : descriptions[gate];
      nodes.markedValue.textContent = percent(state.targetProbability);
      nodes.outsideValue.textContent = percent(state.outsideProbability);
      nodes.markedBar.style.width = percent(state.targetProbability);
      nodes.outsideBar.style.width = percent(state.outsideProbability);
      nodes.liveDescription.textContent = `${gateNames[gate]}. Marked probability ${percent(state.targetProbability)}; outside the displayed plane ${percent(state.outsideProbability)}. Yellow is the real projection and violet is the imaginary projection.`;
      root.dataset.gate = String(gate);
      root.dataset.progress = String(progress);
      root.dataset.target = String(target);
      root.dataset.real = JSON.stringify(state.real);
      root.dataset.imaginary = JSON.stringify(state.imaginary);
      root.dataset.markedProbability = String(state.targetProbability);
      root.dataset.outsideProbability = String(state.outsideProbability);
    },
  };
}
