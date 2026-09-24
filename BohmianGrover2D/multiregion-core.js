// Sixteen logical modes in one continuous 2D box. All gate evolution is exact
// within this explicitly defined subspace; no pixel or probability interpolation.
export const SIDE = 4;
export const STATE_COUNT = SIDE * SIDE;
export const ITERATIONS = 3;
export const LABELS = Array.from({ length: STATE_COUNT }, (_, q) => q.toString(2).padStart(4, '0'));
export const GATES = Object.freeze([
  { kind: 'prepare', name: 'Prepare balanced state', symbol: 'A', iteration: 0, duration: 2.4 },
  ...Array.from({ length: ITERATIONS }, (_, i) => [
    { kind: 'oracle', name: 'Oracle phase', symbol: 'Oω', iteration: i + 1, duration: 1.6 },
    { kind: 'inverse', name: 'Inverse mixer', symbol: 'A†', iteration: i + 1, duration: 2.4 },
    { kind: 'reference', name: 'Reference phase', symbol: 'S₀', iteration: i + 1, duration: 1.6 },
    { kind: 'forward', name: 'Forward mixer', symbol: 'A', iteration: i + 1, duration: 2.4 },
  ]).flat(),
].map(Object.freeze));

// An orthogonal, cell-centered discrete sine transform. The highest-frequency
// column has a different normalization. Rows are localized packets f_j, columns
// are normalized box eigenmodes u_n(x) = sqrt(2) sin(n pi x), n = 1..4.
// For two packets this construction reduces to (u_1 +/- u_2) / sqrt(2).
export const PACKET_TRANSFORM = Array.from({ length: SIDE }, (_, j) =>
  Float64Array.from({ length: SIDE }, (_, n) =>
    (n === SIDE - 1 ? 1 / Math.sqrt(SIDE) : Math.sqrt(2 / SIDE)) *
    Math.sin(Math.PI * (j + .5) * (n + 1) / SIDE)));

export function basisState(q = 0) {
  const state = new Float64Array(2 * STATE_COUNT);
  state[2 * q] = 1;
  return state;
}

// A = H_Had^(tensor 4), in the logical packet basis |x1 x0 y1 y0>.
export function hadamard(state) {
  const out = Float64Array.from(state);
  for (let stride = 1; stride < STATE_COUNT; stride *= 2) {
    for (let block = 0; block < STATE_COUNT; block += 2 * stride) {
      for (let i = 0; i < stride; i++) for (let part = 0; part < 2; part++) {
        const lo = 2 * (block + i) + part, hi = lo + 2 * stride;
        const a = out[lo], b = out[hi];
        out[lo] = a + b; out[hi] = a - b;
      }
    }
  }
  return out.map(value => value / Math.sqrt(STATE_COUNT));
}

// H_A = pi*hbar/(2*T) (I-A). Since A^2=I, the exact propagator is
// U(p) = (I+A)/2 + exp(-i*pi*p) (I-A)/2. p is signed gate time / T.
// The two terms are orthogonal eigenspace projections, not an image blend.
export function evolveMixer(state, p) {
  const transformed = hadamard(state), out = new Float64Array(state.length);
  const c = Math.cos(Math.PI * p), s = Math.sin(Math.PI * p);
  for (let q = 0; q < STATE_COUNT; q++) {
    const r = 2 * q, i = r + 1;
    const minusRe = .5 * (state[r] - transformed[r]);
    const minusIm = .5 * (state[i] - transformed[i]);
    out[r] = .5 * (state[r] + transformed[r]) + c * minusRe + s * minusIm;
    out[i] = .5 * (state[i] + transformed[i]) + c * minusIm - s * minusRe;
  }
  return out;
}

export function phasePulse(state, target, p) {
  const out = Float64Array.from(state), r = 2 * target, i = r + 1;
  const c = Math.cos(Math.PI * p), s = Math.sin(Math.PI * p);
  out[r] = c * state[r] + s * state[i];
  out[i] = c * state[i] - s * state[r];
  return out;
}

export function evolveGate(state, kind, progress, target) {
  if (kind === 'prepare' || kind === 'forward') return evolveMixer(state, progress);
  if (kind === 'inverse') return evolveMixer(state, -progress);
  if (kind === 'oracle') return phasePulse(state, target, progress);
  if (kind === 'reference') return phasePulse(state, 0, progress);
  throw new Error(`Unknown gate: ${kind}`);
}

export function probabilities(state) {
  return Float64Array.from({ length: STATE_COUNT }, (_, q) => state[2 * q] ** 2 + state[2 * q + 1] ** 2);
}
export function normSquared(state) { return state.reduce((sum, value) => sum + value * value, 0); }
export function expectedProbability(iterations) {
  return Math.sin((2 * iterations + 1) * Math.asin(1 / Math.sqrt(STATE_COUNT))) ** 2;
}

export function sineCoefficients(state) {
  const out = new Float64Array(state.length);
  for (let n = 0; n < SIDE; n++) for (let m = 0; m < SIDE; m++) {
    for (let x = 0; x < SIDE; x++) for (let y = 0; y < SIDE; y++) {
      const weight = PACKET_TRANSFORM[x][n] * PACKET_TRANSFORM[y][m];
      const q = 2 * (SIDE * x + y), k = 2 * (SIDE * n + m);
      out[k] += weight * state[q]; out[k + 1] += weight * state[q + 1];
    }
  }
  return out;
}
export function axisPacket(j, x) {
  return PACKET_TRANSFORM[j].reduce((sum, weight, n) => sum + weight * Math.SQRT2 * Math.sin((n + 1) * Math.PI * x), 0);
}
export function waveAt(state, x, y) {
  const fx = Array.from({ length: SIDE }, (_, j) => axisPacket(j, x));
  const fy = Array.from({ length: SIDE }, (_, j) => axisPacket(j, y));
  const out = [0, 0];
  for (let j = 0; j < SIDE; j++) for (let k = 0; k < SIDE; k++) {
    const q = 2 * (SIDE * j + k), weight = fx[j] * fy[k];
    out[0] += weight * state[q]; out[1] += weight * state[q + 1];
  }
  return out;
}

// Analytic integrals distinguish a mode's probability from probability inside
// its geometrical box. No density readback or numerical quadrature is needed.
function sineOverlap(n, m, a, b) {
  if (n === m) return b - a - (Math.sin(2 * n * Math.PI * b) - Math.sin(2 * n * Math.PI * a)) / (2 * n * Math.PI);
  const primitive = x => Math.sin((n - m) * Math.PI * x) / ((n - m) * Math.PI) - Math.sin((n + m) * Math.PI * x) / ((n + m) * Math.PI);
  return primitive(b) - primitive(a);
}
const CELL_OVERLAPS = Array.from({ length: SIDE }, (_, j) =>
  Array.from({ length: SIDE }, (_, n) =>
    Float64Array.from({ length: SIDE }, (_, m) => sineOverlap(n + 1, m + 1, j / SIDE, (j + 1) / SIDE))));

export function boxProbability(state, target) {
  const c = sineCoefficients(state), ix = CELL_OVERLAPS[target >> 2], iy = CELL_OVERLAPS[target & 3];
  let weight = 0;
  for (let q = 0; q < STATE_COUNT; q++) for (let r = 0; r < STATE_COUNT; r++) {
    weight += (c[2 * q] * c[2 * r] + c[2 * q + 1] * c[2 * r + 1]) * ix[q >> 2][r >> 2] * iy[q & 3][r & 3];
  }
  return Math.max(0, Math.min(1, weight));
}

export function effectiveBlochState(marked, unmarked) {
  const [mr, mi] = marked, [ur, ui] = unmarked;
  const m = mr * mr + mi * mi, u = ur * ur + ui * ui, weight = m + u;
  if (weight < 1e-12) return { vector: null, weight, conditionalMarked: null };
  return { vector: [2 * (mr * ur + mi * ui) / weight, 2 * (mr * ui - mi * ur) / weight, (m - u) / weight],
    weight: Math.min(1, weight), conditionalMarked: m / weight };
}
export function projectGroverState(state, target) {
  const marked = [state[2 * target], state[2 * target + 1]], unmarked = [0, 0];
  for (let q = 0; q < STATE_COUNT; q++) if (q !== target) {
    unmarked[0] += state[2 * q] / Math.sqrt(STATE_COUNT - 1);
    unmarked[1] += state[2 * q + 1] / Math.sqrt(STATE_COUNT - 1);
  }
  const bloch = effectiveBlochState(marked, unmarked);
  return { bloch, targetProbability: marked[0] ** 2 + marked[1] ** 2, outsideProbability: Math.max(0, 1 - bloch.weight) };
}

export class SearchSimulation {
  constructor(target = 15) { this.target = target; this.reset(); }
  reset() {
    this.amplitudes = basisState(); this.completed = 0; this.active = null; this.last = null;
    this.paused = false; this.autoplay = false; this.time = 0; this.revision = (this.revision || 0) + 1;
    this.checkpoints = [];
  }
  setTarget(target) {
    if (this.active || !Number.isInteger(target) || target < 0 || target >= STATE_COUNT) return false;
    this.target = target; this.reset(); return true;
  }
  startNext() {
    if (this.active || this.completed >= GATES.length) return false;
    this.active = { ...GATES[this.completed], index: this.completed, elapsed: 0, progress: 0,
      startAmplitudes: Float64Array.from(this.amplitudes) };
    return true;
  }
  runFull() { if (this.active) return false; this.reset(); this.autoplay = true; return this.startNext(); }
  advance(dt) {
    if (this.paused || !Number.isFinite(dt) || dt <= 0) return;
    let remaining = dt;
    while (this.active && remaining > 1e-12) {
      const gate = this.active, step = Math.min(remaining, gate.duration - gate.elapsed);
      gate.elapsed += step; this.time += step; remaining -= step;
      gate.progress = Math.min(1, gate.elapsed / gate.duration);
      if (gate.duration - gate.elapsed < 1e-10) gate.progress = 1;
      this.amplitudes = evolveGate(gate.startAmplitudes, gate.kind, gate.progress, this.target);
      if (gate.progress < 1) break;
      this.last = gate; this.active = null; this.completed++;
      this.checkpoints.push({ step: this.completed, kind: gate.kind, iteration: gate.iteration,
        targetProbability: probabilities(this.amplitudes)[this.target] });
      if (this.autoplay && this.completed < GATES.length) this.startNext();
      else this.autoplay = false;
    }
  }
  snapshot() {
    const gate = this.active || this.last;
    return { target: this.target, completed: this.completed, busy: !!this.active, paused: this.paused,
      time: this.time, kind: gate?.kind || 'input', iteration: gate?.iteration || 0,
      progress: this.active?.progress ?? (this.last ? 1 : 0), norm: normSquared(this.amplitudes),
      probabilities: Array.from(probabilities(this.amplitudes)), amplitudes: Array.from(this.amplitudes),
      checkpoints: this.checkpoints.map(item => ({ ...item })) };
  }
}
