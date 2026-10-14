import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraFor, columnCenter, columnHeight, columnValues, project, screenRay, rayBox, phaseColor, DEFAULT_VIEW } from '../histogram-renderer.js';
import { SearchSimulation } from '../multiregion-core.js';

test('the signed vertical scale remains linear and fixed across values and grid sizes', () => {
  for (const side of [2,3,4,5]) {
    assert.equal(columnHeight(0,side),0);
    for (const value of [-1,-.75,-1/side,0,1/side,.25,.5,.9613189697265625,1]) {
      assert.ok(Math.abs(columnHeight(value,side)/columnHeight(1,side)-value) < 1e-14);
    }
  }
});
test('projection and screen rays agree through a full orbit, including tall columns and portrait canvases', () => {
  for (const [width,height] of [[900,600],[360,500]]) for (const side of [2,3,4,5]) {
    for (const yaw of [-Math.PI,-1.4,0,.62,Math.PI/2,2.8]) for (const elevation of [-1.4,-.4,0,.63,1.4]) {
      const camera = cameraFor({...DEFAULT_VIEW,yaw,elevation},width,height,side);
      for (const q of [0,Math.floor(side**2/2),side**2-1]) {
        const p = columnCenter(q,side); p[1] = columnHeight(q === 0 ? 1 : -1/side,side);
        const screen = project(p,camera), ray = screenRay(screen.x,screen.y,camera);
        const actual = p.map((v,i) => v-camera.eye[i]), length = Math.hypot(...actual);
        actual.forEach((v,i) => assert.ok(Math.abs(v/length-ray[i]) < 2e-6));
      }
    }
  }
});
test('a zero-elevation camera is exactly on the zero plane and separates signed columns vertically', () => {
  const camera = cameraFor({...DEFAULT_VIEW,elevation:0},800,600,4);
  assert.equal(camera.eye[1],0);
  const zero = project([0,0,0],camera), plus=project([0,1,0],camera), minus=project([0,-1,0],camera);
  assert.ok(Math.abs(zero.y-300)<1e-6);
  assert.ok(plus.y<zero.y && minus.y>zero.y);
  const below = cameraFor({...DEFAULT_VIEW,elevation:-.2},800,600,4);
  assert.ok(below.eye[1]<0);
});
test('the ordinary oracle crosses zero and flips the signed column without changing probability', () => {
  const sim = new SearchSimulation(15,0,4);
  sim.startNext();sim.advance(2.4);
  const before=columnValues(sim.amplitudes), probabilities=columnValues(sim.amplitudes,'probability');
  before.forEach(value=>assert.ok(Math.abs(value-.25)<1e-12));
  sim.startNext();sim.advance(.8);
  assert.ok(Math.abs(columnValues(sim.amplitudes)[15])<1e-12);
  assert.ok(Math.abs(columnValues(sim.amplitudes,'imaginary')[15]+.25)<1e-12);
  assert.ok(Math.abs(columnValues(sim.amplitudes,'probability')[15]-.0625)<1e-12);
  sim.advance(.8);
  columnValues(sim.amplitudes).forEach((value,q)=>assert.ok(Math.abs(value-(q===15?-.25:.25))<1e-12));
  columnValues(sim.amplitudes,'probability').forEach((value,q)=>assert.ok(Math.abs(value-probabilities[q])<1e-12));
});
test('component views retain complex amplitude information on odd grids', () => {
  for (const side of [3,5]) {
    const sim = new SearchSimulation(side**2-1,side**2-1,side);sim.startNext();sim.advance(2.4);
    const real=columnValues(sim.amplitudes),imaginary=columnValues(sim.amplitudes,'imaginary'),probability=columnValues(sim.amplitudes,'probability');
    assert.ok(imaginary.some(v=>Math.abs(v)>.1));
    probability.forEach((value,q)=>assert.ok(Math.abs(value-real[q]**2-imaginary[q]**2)<1e-12));
  }
});
test('ray picking rejects parallel misses and geometry behind the viewer, with nearest hit distance', () => {
  const lo = [-.3,0,-.3], hi = [.3,4,.3];
  assert.equal(rayBox([0,2,5],[0,0,-1],lo,hi),4.7);
  assert.equal(rayBox([1,2,5],[0,0,-1],lo,hi),Infinity);
  assert.equal(rayBox([0,2,5],[0,0,1],lo,hi),Infinity);
  assert.equal(rayBox([0,6,0],[0,-1,0],lo,hi),2);
});
test('phase colors join continuously at the phase wrap and distinguish a sign flip', () => {
  const positive = phaseColor(0), negative = phaseColor(Math.PI), wrap = phaseColor(-Math.PI);
  assert.deepEqual(negative,wrap);
  assert.ok(Math.hypot(...positive.map((v,i) => v-negative[i])) > .5);
  for (let i=-20;i<=20;i++) assert.ok(phaseColor(i*Math.PI/10).every(v => v>=0 && v<=1));
});
