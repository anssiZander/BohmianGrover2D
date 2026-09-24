// Independent dense-matrix reference. Production uses a fast Hadamard transform
// and a closed-form eigenspace propagator; this uses a matrix exponential series.
const N = 16;
export function generator(kind, target) {
  return Array.from({ length: N }, (_, row) => Float64Array.from({ length: N }, (_, col) => {
    if (kind === 'oracle' || kind === 'reference') return row === col && row === (kind === 'oracle' ? target : 0) ? Math.PI : 0;
    const parity = (row & col).toString(2).replaceAll('0', '').length % 2;
    return (kind === 'inverse' ? -1 : 1) * Math.PI / 2 * ((row === col ? 1 : 0) - (parity ? -1 : 1) / 4);
  }));
}
export function referenceStep(state, kind, p, target) {
  const matrix = generator(kind, target), sum = Float64Array.from(state);
  let term = Float64Array.from(state);
  for (let order = 1; order <= 48; order++) {
    const next = new Float64Array(2 * N);
    for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) {
      const k = matrix[row][col] * p / order;
      next[2 * row] += k * term[2 * col + 1];
      next[2 * row + 1] -= k * term[2 * col];
    }
    next.forEach((value, i) => { sum[i] += value; }); term = next;
    if (Math.max(...Array.from(term, Math.abs)) < 1e-18) break;
  }
  return sum;
}
export function referenceWave(state, x, y) {
  const packet = (j, z) => Array.from({ length: 4 }, (_, k) => {
    const n = k + 1, weight = (n === 4 ? .5 : 1 / Math.sqrt(2)) * Math.sin((j + .5) * n * Math.PI / 4);
    return weight * Math.sqrt(2) * Math.sin(n * Math.PI * z);
  }).reduce((a, b) => a + b, 0);
  const fx = [0, 1, 2, 3].map(j => packet(j, x)), fy = [0, 1, 2, 3].map(j => packet(j, y));
  const psi = [0, 0];
  for (let q = 0; q < N; q++) {
    psi[0] += fx[q >> 2] * fy[q & 3] * state[2 * q];
    psi[1] += fx[q >> 2] * fy[q & 3] * state[2 * q + 1];
  }
  return psi;
}
