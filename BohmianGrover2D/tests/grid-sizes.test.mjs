import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../multiregion-core.js';
import { gateFlow, flowAt, sampleInitialParticles } from '../probability-flow.js';

const { gridModel, basisState, evolveMixer, evolveGate, sineCoefficients, probabilities,
  normSquared, waveAt, boxProbability, projectGroverState, SearchSimulation } = core;
const free = 'FREE_OMEGA' in core;
const error = (a, b) => Math.max(...Array.from(a, (v, i) => Math.abs(v - b[i])));
const expected = (side, k) => Math.sin((2*k+1)*Math.asin(1/side))**2;

for (const side of [2, 3, 4, 5]) {
  const model = gridModel(side), count = side*side;
  test(`${side}x${side}: scalar basis, balanced unitary preparation and correct inverse path`, () => {
    assert.equal(model.stateCount, count);
    assert.equal(model.iterations, [1,2,3,3][side-2]);
    const T = model.packetTransform;
    for (let j=0;j<side;j++) for (let k=0;k<side;k++) {
      assert.ok(Math.abs(T[j].reduce((s,v,n)=>s+v*T[k][n],0)-(j===k?1:0))<1e-13);
    }
    for (let q=0;q<count;q++) {
      const input=basisState(q,side), prepared=evolveMixer(input,1);
      assert.equal(input.length,2*count, 'one complex amplitude per spatial packet, no spin');
      assert.ok(probabilities(prepared).every(p=>Math.abs(p-1/count)<1e-13));
      assert.ok(error(evolveGate(prepared,'inverse',1,0,q),input)<2e-13);
    }
    let input=Float64Array.from({length:2*count},(_,i)=>Math.sin(.71*i+.3)+Math.cos(1.13*i));
    input=input.map(v=>v/Math.sqrt(normSquared(input)));
    const p=.371, inverse=evolveGate(input,'inverse',p,0);
    assert.ok(Math.abs(normSquared(inverse)-1)<1e-13);
    if (free) {
      assert.equal(model.inverseFactor,2*side-1);
      assert.ok(Math.abs(model.mixTime+model.inverseTime-core.REVIVAL_TIME)<1e-13);
      const before=sineCoefficients(input), after=sineCoefficients(inverse);
      // The physical sine spectrum must advance under +H throughout A†.
      for (let n=1;n<=side;n++) for (let m=1;m<=side;m++) {
        const k=2*(side*(n-1)+m-1), angle=core.FREE_OMEGA*model.inverseTime*p*(n*n+m*m);
        assert.ok(Math.abs(after[k]-(Math.cos(angle)*before[k]+Math.sin(angle)*before[k+1]))<2e-13);
        assert.ok(Math.abs(after[k+1]-(Math.cos(angle)*before[k+1]-Math.sin(angle)*before[k]))<2e-13);
      }
      assert.ok(error(inverse,evolveMixer(input,-p))>.01, 'forward revival waiting has a distinct interior path');
    } else {
      assert.equal(model.mixTime,2.4); assert.equal(model.inverseTime,2.4);
      assert.ok(error(core.hadamard(core.hadamard(input)),input)<1e-13);
      assert.ok(error(evolveMixer(inverse,p),input)<1e-13);
      assert.ok(error(inverse,evolveMixer(input,-p))<1e-14, 'non-free inverse reverses signed time');
    }
  });

  test(`${side}x${side}: all initial/goal pairs reach the Grover prediction`, () => {
    for (let initial=0;initial<count;initial++) for (let target=0;target<count;target++) {
      const sim=new SearchSimulation(target,initial,side);
      sim.runFull(); sim.advance(1000);
      assert.equal(sim.completed,1+4*model.iterations);
      assert.ok(Math.abs(normSquared(sim.amplitudes)-1)<2e-12);
      for (const gate of sim.checkpoints.filter(g=>g.kind==='forward')) {
        assert.ok(Math.abs(gate.targetProbability-expected(side,gate.iteration))<2e-12);
      }
      const projection=projectGroverState(sim.amplitudes,target,initial);
      assert.ok(Math.abs(projection.bloch.weight-1)<2e-12);
      assert.ok(Math.abs(projection.targetProbability-expected(side,model.iterations))<2e-12);
    }
  });

  test(`${side}x${side}: spatial probabilities and gate currents conserve the same density`, () => {
    const initial=count-2,target=Math.floor(count/2),h=1e-6;
    let state=basisState(initial,side);
    for (const gate of model.gates.slice(0,5)) {
      const flow=gateFlow(state,gate.kind,target,gate.duration,initial),p=.37;
      assert.equal(flow.side,side); assert.equal(flow.modes,2*side+1);
      assert.equal(flow.mode,free&&['prepare','inverse','forward'].includes(gate.kind)?'free':'phase');
      const minus=evolveGate(state,gate.kind,p-h,target,initial),plus=evolveGate(state,gate.kind,p+h,target,initial);
      const current=evolveGate(state,gate.kind,p,target,initial);
      assert.ok(Math.abs(Array.from({length:count},(_,q)=>boxProbability(current,q)).reduce((a,b)=>a+b,0)-1)<1e-12);
      for (const [x,y] of [[.13,.27],[.47,.61],[.83,.74]]) {
        const a=waveAt(minus,x,y),b=waveAt(plus,x,y),value=flowAt(flow,x,y,p),psi=waveAt(current,x,y);
        const drho=(b[0]**2+b[1]**2-a[0]**2-a[1]**2)/(2*h*gate.duration);
        const div=(flowAt(flow,x+h,y,p).current[0]-flowAt(flow,x-h,y,p).current[0]
          +flowAt(flow,x,y+h,p).current[1]-flowAt(flow,x,y-h,p).current[1])/(2*h);
        assert.ok(Math.abs(value.rho-(psi[0]**2+psi[1]**2))<1e-11);
        assert.ok(Math.abs(value.drho-drho)<2e-6);
        assert.ok(Math.abs(div+drho)<2e-6);
        assert.ok(Math.abs(flowAt(flow,0,y,p).current[0])<1e-12);
        assert.ok(Math.abs(flowAt(flow,1,y,p).current[0])<1e-12);
        assert.ok(Math.abs(flowAt(flow,x,0,p).current[1])<1e-12);
        assert.ok(Math.abs(flowAt(flow,x,1,p).current[1])<1e-12);
      }
      state=evolveGate(state,gate.kind,1,target,initial);
    }
  });

  test(`${side}x${side}: particle initialization matches the selected packet`, () => {
    for (const initial of [0,count-2]) {
      const samples=sampleInitialParticles(4000,73991,initial,side),bins=new Uint32Array(count);
      for (let i=0;i<samples.length;i+=4) {
        const x=samples[i],y=samples[i+1];
        assert.ok(x>0&&x<1&&y>0&&y<1);
        bins[side*Math.floor(side*x)+Math.floor(side*y)]++;
      }
      for (let q=0;q<count;q++) assert.ok(Math.abs(bins[q]/4000-boxProbability(basisState(initial,side),q))<.016);
    }
  });
}

test('resize resets running and paused searches, clamps coordinates, and rejects invalid sizes', () => {
  const sim=new SearchSimulation(14,11);
  for (const side of [5,2,3,4,2,5]) {
    sim.runFull();sim.advance(.31);sim.paused=true;
    const previous=sim.snapshot(),oldSide=sim.model.side;
    assert.equal(sim.setGridSize(side),true);
    assert.equal(sim.target,side*Math.min(side-1,Math.floor(previous.target/oldSide))+Math.min(side-1,previous.target%oldSide));
    assert.equal(sim.initial,side*Math.min(side-1,Math.floor(previous.initial/oldSide))+Math.min(side-1,previous.initial%oldSide));
    assert.deepEqual(sim.amplitudes,basisState(sim.initial,side));
    assert.equal(sim.completed,0);assert.equal(sim.time,0);assert.equal(sim.active,null);
    assert.equal(sim.paused,false);assert.equal(sim.autoplay,false);assert.equal(sim.checkpoints.length,0);
    const held=sim.snapshot();
    for (const invalid of [side,1,6,2.5,NaN,Infinity,'3',null]) {
      assert.equal(sim.setGridSize(invalid),false);assert.deepEqual(sim.snapshot(),held);
    }
    assert.equal(sim.setTarget(side*side),false);assert.equal(sim.setInitial(-1),false);
  }
});
