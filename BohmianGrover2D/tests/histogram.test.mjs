import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraFor, columnCenter, columnHeight, project, screenRay, rayBox, phaseColor, DEFAULT_VIEW } from '../histogram-renderer.js';

test('the vertical scale remains linear and fixed across probabilities and grid sizes', () => {
  for (const side of [2,3,4,5]) {
    assert.equal(columnHeight(0,side),0);
    for (const probability of [1/side**2,.25,.5,.9613189697265625,1]) {
      assert.ok(Math.abs(columnHeight(probability,side)/columnHeight(1,side)-probability) < 1e-14);
    }
  }
});
test('projection and screen rays agree through a full orbit, including tall columns and portrait canvases', () => {
  for (const [width,height] of [[900,600],[360,500]]) for (const side of [2,3,4,5]) {
    for (const yaw of [-Math.PI,-1.4,0,.62,Math.PI/2,2.8]) for (const elevation of [.18,.63,1.55]) {
      const camera = cameraFor({...DEFAULT_VIEW,yaw,elevation},width,height,side);
      for (const q of [0,Math.floor(side**2/2),side**2-1]) {
        const p = columnCenter(q,side); p[1] = columnHeight(q === 0 ? 1 : 1/side**2,side);
        const screen = project(p,camera), ray = screenRay(screen.x,screen.y,camera);
        const actual = p.map((v,i) => v-camera.eye[i]), length = Math.hypot(...actual);
        actual.forEach((v,i) => assert.ok(Math.abs(v/length-ray[i]) < 2e-6));
      }
    }
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
