import test from 'node:test';
import assert from 'node:assert/strict';
import { PACKET_TRANSFORM, GATES, MIX_TIME, REVIVAL_TIME, PREPARED_STATE, sineCoefficients, basisState, evolveMixer, evolveGate, phasePulse,
  probabilities, normSquared, axisPacket, waveAt, boxProbability, projectGroverState,
  effectiveBlochState, SearchSimulation, expectedProbability } from '../multiregion-core.js';
import { referenceStep, referenceWave, generator } from './reference-math.js';

const error = (a, b) => Math.max(...Array.from(a, (value, i) => Math.abs(value - b[i])));
let maxReferenceError = 0, maxNormError = 0;

test('localized packets are orthonormal, hard-walled, and concentrated in their own cells', () => {
  for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) {
    const dot = PACKET_TRANSFORM[j].reduce((sum, value, n) => sum + value * PACKET_TRANSFORM[k][n], 0);
    assert.ok(Math.abs(dot - (j === k ? 1 : 0)) < 1e-14);
    let overlap = 0, inside = 0;
    for (let i = 0; i < 4096; i++) {
      const x = (i + .5) / 4096;
      overlap += axisPacket(j, x) * axisPacket(k, x) / 4096;
      if (j === k && x > j / 4 && x < (j + 1) / 4) inside += axisPacket(j, x) ** 2 / 4096;
    }
    assert.ok(Math.abs(overlap - (j === k ? 1 : 0)) < 1e-12);
    if (j === k) assert.ok(inside > .83, `packet ${j}: ${inside}`);
    assert.ok(Math.abs(axisPacket(j, 0)) < 1e-14 && Math.abs(axisPacket(j, 1)) < 1e-14);
  }
});

test('free preparation is balanced and forward waiting implements the exact inverse', () => {
  assert.equal(GATES[2].duration,7*MIX_TIME);
  assert.equal(REVIVAL_TIME,8*MIX_TIME);
  for (let q = 0; q < 16; q++) {
    const state = basisState(q);
    assert.ok(error(evolveMixer(state,8),state)<1e-14);
    assert.ok(error(evolveGate(evolveMixer(state,1),'inverse',1,0),state)<1e-14);
    assert.ok(error(evolveGate(state,'inverse',.3,0),evolveMixer(state,2.1))<1e-14);
    assert.ok(error(evolveGate(state,'inverse',.3,0),evolveMixer(state,-.3))>.1);
    assert.ok(error(evolveMixer(evolveMixer(state, .371), -.371), state) < 1e-14);
    for (const p of probabilities(evolveMixer(state,1))) assert.ok(Math.abs(p-1/16)<1e-14);
    const before=sineCoefficients(state),after=sineCoefficients(evolveMixer(state,.391));
    for(let k=0;k<32;k+=2)assert.ok(Math.abs(before[k]**2+before[k+1]**2-after[k]**2-after[k+1]**2)<1e-14);
  }
  for (const p of probabilities(evolveMixer(basisState(), 1))) assert.ok(Math.abs(p - 1 / 16) < 1e-14);
});

test('every continuous gate agrees with an independent matrix exponential for all 16 targets', () => {
  for (let target = 0; target < 16; target++) {
    let actual = basisState(), expected = basisState();
    for (const gate of GATES) {
      for (let sample = 0; sample <= 8; sample++) {
        const p = sample / 8, a = evolveGate(actual, gate.kind, p, target), b = referenceStep(expected, gate.kind, p, target);
        maxReferenceError = Math.max(maxReferenceError, error(a, b));
        maxNormError = Math.max(maxNormError, Math.abs(normSquared(a) - 1));
        assert.ok(error(a, b) < 2e-13, `target ${target}, ${gate.kind}, p=${p}`);
        assert.ok(Math.abs(normSquared(a) - 1) < 1e-13);
      }
      actual = evolveGate(actual, gate.kind, 1, target);
      expected = referenceStep(expected, gate.kind, 1, target);
      if (gate.kind === 'forward') assert.ok(Math.abs(probabilities(actual)[target] - expectedProbability(gate.iteration)) < 1e-13);
    }
    assert.ok(Math.abs(probabilities(actual)[target] - 0.9613189697265625) < 1e-13);
  }
});

test('every gate obeys its Schrodinger equation, including positive-time inverse waiting', () => {
  let state = Float64Array.from({ length: 32 }, (_, i) => Math.sin(1.7 * i + .3));
  state = state.map(value => value / Math.sqrt(normSquared(state)));
  for (const kind of ['prepare', 'oracle', 'inverse', 'reference', 'forward']) {
    const p = .37, epsilon = 1e-7, value = evolveGate(state, kind, p, 9);
    const plus = evolveGate(state, kind, p + epsilon, 9), minus = evolveGate(state, kind, p - epsilon, 9);
    const k = generator(kind, 9), derivative = new Float64Array(32);
    for (let q = 0; q < 16; q++) for (let r = 0; r < 16; r++) {
      derivative[2 * q] += k[q][r] * value[2 * r + 1];
      derivative[2 * q + 1] -= k[q][r] * value[2 * r];
    }
    assert.ok(error(plus.map((v, i) => (v - minus[i]) / (2 * epsilon)), derivative) < 2e-7);
  }
  const mid = evolveMixer(basisState(), .5), endpoint = evolveMixer(basisState(),1);
  const linear = endpoint.map((value, i) => .5 * (value + basisState()[i]));
  assert.ok(error(mid, linear) > .1 && Math.abs(normSquared(linear) - 1) > .1);
  assert.ok(mid.some((value, i) => i % 2 && Math.abs(value) > .1), 'the intermediate wave must carry the complex phases');
});

test('phase gates preserve every logical probability throughout their pulse', () => {
  const state = evolveMixer(basisState(), .43), before = probabilities(state);
  for (let target = 0; target < 16; target++) for (let p = 0; p <= 1; p += .125) {
    assert.ok(error(probabilities(phasePulse(state, target, p)), before) < 1e-14);
  }
});

test('geometrical box probabilities integrate the spatial wave and partition unity', () => {
  const state = referenceStep(referenceStep(basisState(), 'prepare', .71, 6), 'oracle', .41, 6);
  assert.ok(error(waveAt(state, .372, .694), referenceWave(state, .372, .694)) < 1e-14);
  let total = 0;
  for (let q = 0; q < 16; q++) {
    const analytic = boxProbability(state, q); total += analytic;
    let numerical = 0; const steps = 96;
    for (let x = 0; x < steps; x++) for (let y = 0; y < steps; y++) {
      const psi = referenceWave(state, ((q >> 2) + (x + .5) / steps) / 4, ((q & 3) + (y + .5) / steps) / 4);
      numerical += (psi[0] ** 2 + psi[1] ** 2) / (16 * steps * steps);
    }
    assert.ok(Math.abs(analytic - numerical) < 2e-5);
  }
  assert.ok(Math.abs(total - 1) < 1e-12);
});

test('clock partitions, checkpoints, target locking, pause and reset preserve the exact state', () => {
  const a = new SearchSimulation(10), b = new SearchSimulation(10);
  a.runFull(); b.runFull(); a.advance(100);
  while (b.active) b.advance(.017);
  assert.ok(error(a.amplitudes, b.amplitudes) < 1e-13);
  assert.equal(a.completed, 13); assert.equal(a.checkpoints.length, 13);
  b.reset(); b.startNext(); b.advance(.7); b.paused = true;
  const paused = b.snapshot(); b.advance(100); assert.deepEqual(b.snapshot(), paused);
  assert.equal(b.setTarget(5), false); b.paused = false; b.advance(100);
  assert.equal(b.completed, 1); assert.equal(b.active, null);
  const held = b.snapshot(); b.advance(100); assert.deepEqual(b.snapshot(), held);
  assert.equal(b.setTarget(5), true); assert.equal(b.completed, 0); assert.equal(b.time, 0);
  assert.ok(error(b.amplitudes, basisState()) === 0);
});

test('Bloch projection retains unit length, accounts for outside weight, and ignores global phase', () => {
  for(let target=0;target<16;target++)assert.ok(Math.abs(projectGroverState(PREPARED_STATE,target).bloch.weight-1)<1e-14);
  assert.equal(effectiveBlochState([0, 0], [0, 0]).vector, null);
  for (const [unmarked, expected] of [[[1, 0], [1, 0, 0]], [[0, 1], [0, 1, 0]], [[0, -1], [0, -1, 0]]]) {
    assert.ok(error(effectiveBlochState([1, 0], unmarked).vector, expected) < 1e-14);
  }
  for (let target = 0; target < 16; target++) {
    let state = basisState();
    for (const gate of GATES) {
      for (const p of [0, .25, .5, .75, 1]) {
        const current = evolveGate(state, gate.kind, p, target), projection = projectGroverState(current, target);
        const { vector, weight } = projection.bloch;
        if (vector) assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-13);
        assert.ok(Math.abs(weight + projection.outsideProbability - 1) < 1e-13);
        if (vector) assert.ok(Math.abs(weight * (1 + vector[2]) / 2 - probabilities(current)[target]) < 1e-13);
        const rotated = current.map((value, i) => i % 2 ? Math.sin(.9) * current[i - 1] + Math.cos(.9) * value : Math.cos(.9) * value - Math.sin(.9) * current[i + 1]);
        if (vector) assert.ok(error(projectGroverState(rotated, target).bloch.vector, vector) < 1e-13);
      }
      state = evolveGate(state, gate.kind, 1, target);
      if(gate.kind==='forward')assert.ok(Math.abs(projectGroverState(state,target).bloch.weight-1)<1e-12);
    }
  }
});

test('report numerical precision', () => {
  console.log(`1872 continuous states; maximum matrix-exponential error ${maxReferenceError.toExponential(3)}, norm error ${maxNormError.toExponential(3)}.`);
});
