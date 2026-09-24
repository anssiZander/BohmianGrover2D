import assert from 'node:assert/strict';
import { groverGeometryState } from '../grover-geometry.js';

const mul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
const phase = angle => [Math.cos(angle), Math.sin(angle)];
const popcount = q => (q >> 1) + (q & 1);
const transform = a => a.map((_, q) => a.reduce((sum, value, r) => {
  const sign = popcount(q & r) % 2 ? -1 : 1;
  return [sum[0] + sign * value[0] / 2, sum[1] + sign * value[1] / 2];
}, [0, 0]));
const error = (a, b) => Math.max(...a.flatMap((v, q) => v.map((x, c) => Math.abs(x - b[q][c]))));

// Independent reference: propagate the four discrete sine eigenmodes with
// their box energies, then transform into the diagram's stated phase frame.
const grid = 128, dx = 1 / (grid - 1);
const energy = n => (1 - Math.cos(n * Math.PI / (grid - 1))) / (dx * dx);
const meanEnergy = energy(1) + energy(2);
const tau = Math.PI / (2 * (energy(2) - energy(1)));
function physicalReference(target, gate, progress) {
  let a = [[1, 0], [0, 0], [0, 0], [0, 0]], signedTime = 0, referencePhase = 0;
  for (let step = 1; step <= gate; step++) {
    const p = step === gate ? progress : 1;
    if (step === 2 || step === 4) {
      const q = step === 2 ? target : 0;
      a[q] = mul(a[q], phase(-Math.PI * p));
      if (step === 4) referencePhase = Math.PI * p;
    } else {
      const time = (step === 3 ? -1 : 1) * tau * p;
      signedTime += time;
      a = transform(transform(a).map((value, q) =>
        mul(value, phase(-(energy(1 + (q >> 1)) + energy(1 + (q & 1))) * time))));
    }
  }
  return a.map((value, q) => mul(value,
    phase(meanEnergy * signedTime + referencePhase - popcount(q) * Math.PI / 2)));
}

let count = 0, maxError = 0;
for (let target = 0; target < 4; target++) {
  for (let gate = 1; gate <= 5; gate++) for (let sample = 0; sample <= 32; sample++) {
    const progress = sample / 32, state = groverGeometryState(target, gate, progress);
    const difference = error(state.amplitudes, physicalReference(target, gate, progress));
    maxError = Math.max(maxError, difference);
    assert.ok(difference < 1e-12, `Physical gate mismatch: target ${target}, gate ${gate}, progress ${progress}`);
    const total = [...state.real, ...state.imaginary].reduce((sum, value) => sum + value * value, 0) + state.outsideProbability;
    assert.ok(Math.abs(total - 1) < 1e-12, 'Projection and outside probability must sum to one');
    assert.ok(Math.abs(state.targetProbability - state.real[1] ** 2 - state.imaginary[1] ** 2) < 1e-12);
    count++;
  }
  for (let gate = 0; gate < 5; gate++) {
    assert.ok(error(groverGeometryState(target, gate, 1).amplitudes,
      groverGeometryState(target, gate + 1, 0).amplitudes) < 1e-12, 'Gate transition must be continuous');
  }
  const prepared = groverGeometryState(target, 1, 1);
  assert.ok(error([prepared.real], [[Math.sqrt(3) / 2, .5]]) < 1e-12);
  const halfOracle = groverGeometryState(target, 2, .5);
  assert.ok(Math.abs(halfOracle.real[1]) < 1e-12 && Math.abs(halfOracle.imaginary[1] + .5) < 1e-12);
  assert.ok(Math.abs(halfOracle.targetProbability - .25) < 1e-12, 'Phase turning must not change marked probability');
  const oracle = groverGeometryState(target, 2, 1);
  assert.ok(error([oracle.real], [[Math.sqrt(3) / 2, -.5]]) < 1e-12);
  const final = groverGeometryState(target, 5, 1);
  assert.ok(error([final.real], [[0, 1]]) < 1e-12 && final.outsideProbability < 1e-12);
}
assert.ok(groverGeometryState(3, 3, 1).outsideProbability > .66, 'Inverse subgate must expose the state outside the usual Grover plane');
console.log(`${count} intermediate states match independent box-spectrum evolution; max amplitude error ${maxError.toExponential(3)}.`);
console.log('All targets: continuous gate boundaries, 30-degree preparation, complex oracle phase, probability accounting, and exact marked endpoint passed.');
