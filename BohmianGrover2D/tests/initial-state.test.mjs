import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchSimulation, basisState, GATES, evolveGate, boxProbability, projectGroverState, expectedProbability } from '../multiregion-core.js';
import { gateFlow, flowAt, sampleInitialParticles } from '../probability-flow.js';
import { referenceStep, referenceWave } from './reference-math.js';

test('all 256 initial/goal pairs amplify at every checkpoint, including coincident states', () => {
  for (let initial = 0; initial < 16; initial++) for (let target = 0; target < 16; target++) {
    const sim = new SearchSimulation(target, initial);
    assert.deepEqual(sim.amplitudes, basisState(initial));
    sim.runFull(); sim.advance(100);
    for (const gate of sim.checkpoints.filter(g => g.kind === 'forward')) {
      assert.ok(Math.abs(gate.targetProbability - expectedProbability(gate.iteration)) < 1e-12);
    }
    const state = sim.snapshot(), projection = projectGroverState(sim.amplitudes, target, initial);
    assert.equal(state.initial, initial); assert.equal(state.completed, 13);
    assert.ok(Math.abs(state.time - 26.4) < 1e-12 && Math.abs(state.norm - 1) < 1e-12);
    assert.ok(Math.abs(projection.bloch.weight - 1) < 1e-12);
    assert.ok(Math.abs(projection.targetProbability - expectedProbability(3)) < 1e-12);
  }
});

test('every input follows independent dense-matrix evolution through gate interiors', () => {
  for (let initial = 0; initial < 16; initial++) {
    let state = basisState(initial); const target = 15 - initial;
    for (const gate of GATES) {
      for (const p of [.17, .5, .83, 1]) {
        const actual = evolveGate(state, gate.kind, p, target, initial);
        const expected = referenceStep(state, gate.kind, p, target, initial);
        assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) < 1e-12));
      }
      state = referenceStep(state, gate.kind, 1, target, initial);
    }
  }
});

test('selected reference projector and conserved current match independent density changes', () => {
  const h = 1e-5, p = .37;
  for (let initial = 0; initial < 16; initial++) {
    let state = basisState(initial); const target = (initial + 5) % 16;
    for (const gate of GATES) {
      const flow = gateFlow(state, gate.kind, target, gate.duration, initial);
      const minus = referenceStep(state, gate.kind, p-h, target, initial);
      const plus = referenceStep(state, gate.kind, p+h, target, initial);
      for (const [x, y] of [[.13, .22], [.48, .61], [.88, .74]]) {
        const a = referenceWave(minus, x, y), b = referenceWave(plus, x, y);
        const rate = (b[0]**2+b[1]**2-a[0]**2-a[1]**2)/(2*h*gate.duration);
        const div = (flowAt(flow,x+h,y,p).current[0]-flowAt(flow,x-h,y,p).current[0]
          +flowAt(flow,x,y+h,p).current[1]-flowAt(flow,x,y-h,p).current[1])/(2*h);
        assert.ok(Math.abs(rate + div) < 2e-6);
      }
      state = referenceStep(state, gate.kind, 1, target, initial);
    }
  }
});

test('all 16 input packets seed their own reproducible Born distributions', () => {
  for (let initial = 0; initial < 16; initial++) {
    const count = 4000, points = sampleInitialParticles(count, 73991, initial), bins = new Uint32Array(16);
    assert.deepEqual(points, sampleInitialParticles(count, 73991, initial));
    for (let i = 0; i < count; i++) {
      const x = points[4*i], y = points[4*i+1];
      assert.ok(x > 0 && x < 1 && y > 0 && y < 1);
      bins[4*Math.floor(4*x)+Math.floor(4*y)]++;
    }
    for (let q = 0; q < 16; q++) assert.ok(Math.abs(bins[q]/count - boxProbability(basisState(initial),q)) < .014);
  }
});

test('input selection, reset and full run preserve choices, with active and paused selection locks', () => {
  const sim = new SearchSimulation(9);
  for (const value of [-1, 16, 1.5, NaN]) assert.equal(sim.setInitial(value), false);
  assert.equal(sim.setInitial(6), true); sim.reset();
  assert.equal(sim.initial, 6); assert.equal(sim.target, 9);
  sim.runFull(); assert.equal(sim.active.initial, 6);
  assert.equal(sim.setInitial(4), false); sim.paused = true;
  assert.equal(sim.setInitial(4), false); assert.equal(sim.setTarget(2), false);
  sim.reset(); assert.deepEqual(sim.amplitudes, basisState(6));
  assert.equal(sim.paused, false); assert.equal(sim.setTarget(2), true);
  assert.equal(sim.initial, 6);
});
