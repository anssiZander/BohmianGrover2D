import test from 'node:test';
import assert from 'node:assert/strict';
import {gridModel,basisState,evolveGate,probabilities,expectedProbability,preparedStateFor,projectGroverState,SearchSimulation,boxProbability} from '../multiregion-core.js';
import {gateFlow,flowAt,sampleInitialParticles} from '../probability-flow.js';
import {referenceStep,referenceWave} from './reference-math.js';

const difference=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
const density=psi=>psi.reduce((sum,v)=>sum+v*v,0);
let maxAmplitudeError=0,maxContinuity=0,searches=0;

for(const side of [2,3,4,5]){
  const model=gridModel(side),{stateCount,gates,iterations}=model;
  test(side+'x'+side+': every initial and target spin state has the same amplification and duration',()=>{
    for(let initial=0;initial<stateCount;initial++){
      const prepared=preparedStateFor(initial,side);
      assert.ok(difference(probabilities(prepared),Array(stateCount).fill(1/stateCount))<1e-13);
      for(let target=0;target<stateCount;target++){
        const simulation=new SearchSimulation(target,side,initial);
        simulation.runFull();simulation.advance(1000);searches++;
        const result=simulation.snapshot();
        assert.equal(result.initial,initial);assert.equal(result.target,target);
        assert.equal(result.completed,gates.length);
        assert.ok(Math.abs(result.time-gates.reduce((sum,g)=>sum+g.duration,0))<1e-10);
        for(const checkpoint of result.checkpoints.filter(g=>g.kind==='forward'))
          assert.ok(Math.abs(checkpoint.targetProbability-expectedProbability(checkpoint.iteration,side))<1e-12);
        assert.ok(Math.abs(result.probabilities[target]-expectedProbability(iterations,side))<1e-12);
        assert.ok(Math.abs(projectGroverState(result.amplitudes,target,initial).bloch.weight-1)<1e-12);
      }
    }
  });
  test(side+'x'+side+': continuous gates and Bloch reference agree with independent propagation from every initial state',()=>{
    for(let initial=0;initial<stateCount;initial++){
      const target=(initial+3)%stateCount;
      let actual=basisState(initial,side),reference=Float64Array.from(actual);
      const prepared=referenceStep(reference,'prepare',1,target,initial);
      assert.ok(difference(prepared,preparedStateFor(initial,side))<2e-12);
      for(const gate of gates){
        for(const progress of [.29,.67,1]){
          const a=evolveGate(actual,gate.kind,progress,target,initial),b=referenceStep(reference,gate.kind,progress,target,initial);
          maxAmplitudeError=Math.max(maxAmplitudeError,difference(a,b));
          assert.ok(difference(a,b)<2e-12);
          const aligned=[];
          for(let q=0;q<stateCount;q++)aligned.push([
            Math.sqrt(stateCount)*(prepared[2*q]*b[2*q]+prepared[2*q+1]*b[2*q+1]),
            Math.sqrt(stateCount)*(prepared[2*q]*b[2*q+1]-prepared[2*q+1]*b[2*q]),
          ]);
          const m=aligned[target],u=aligned.reduce((sum,v,q)=>q===target?sum:sum.map((s,k)=>s+v[k]/Math.sqrt(stateCount-1)),[0,0]);
          const marked=density(m),weight=marked+density(u),projection=projectGroverState(a,target,initial);
          assert.ok(Math.abs(projection.bloch.weight-weight)<2e-11);
          if(weight>1e-12)assert.ok(difference(projection.bloch.vector,[2*(m[0]*u[0]+m[1]*u[1])/weight,2*(m[0]*u[1]-m[1]*u[0])/weight,2*marked/weight-1])<2e-11);
        }
        actual=evolveGate(actual,gate.kind,1,target,initial);reference=referenceStep(reference,gate.kind,1,target,initial);
      }
    }
  });
  test(side+'x'+side+': displaced reference gates conserve the independently evolved density and wall flux',()=>{
    const h=1e-6;
    for(let initial=0;initial<stateCount;initial++){
      const target=(initial+3)%stateCount;
      let state=basisState(initial,side);
      for(const gate of gates.slice(0,5)){
        const field=gateFlow(state,gate.kind,target,gate.duration,initial);
        for(const p of [.23,.71]){
          const plus=referenceStep(state,gate.kind,p+h,target,initial),minus=referenceStep(state,gate.kind,p-h,target,initial);
          for(const [x,y] of [[.173,.291],[.481,.632],[.824,.759]]){
            const drho=(density(referenceWave(plus,x,y))-density(referenceWave(minus,x,y)))/(2*h*gate.duration);
            const div=(flowAt(field,x+h,y,p).current[0]-flowAt(field,x-h,y,p).current[0]+flowAt(field,x,y+h,p).current[1]-flowAt(field,x,y-h,p).current[1])/(2*h);
            maxContinuity=Math.max(maxContinuity,Math.abs(drho+div));
            assert.ok(Math.abs(drho+div)<3e-6);
          }
          for(const t of [.14,.37,.69,.91])for(const [x,y,axis] of [[0,t,0],[1,t,0],[t,0,1],[t,1,1]])
            assert.ok(Math.abs(flowAt(field,x,y,p).current[axis])<1e-12);
        }
        state=referenceStep(state,gate.kind,1,target,initial);
      }
    }
  });
  test(side+'x'+side+': each input packet has the correct reproducible Born ensemble for both spins',()=>{
    const count=4000;
    for(let region=0;region<side*side;region++){
      const points=sampleInitialParticles(count,73991,side,2*region),bins=Array(side*side).fill(0);
      assert.deepEqual(points,sampleInitialParticles(count,73991,side,2*region+1));
      for(let k=0;k<count;k++){
        const x=points[4*k],y=points[4*k+1];assert.ok(x>0&&x<1&&y>0&&y<1);
        bins[side*Math.floor(side*x)+Math.floor(side*y)]++;
        assert.equal(points[4*k+2],0);assert.equal(points[4*k+3],0);
      }
      const state=basisState(2*region,side);
      for(let q=0;q<side*side;q++)assert.ok(Math.abs(bins[q]/count-boxProbability(state,q))<.02);
    }
  });
}

test('initial selection resets independently, locks during gates, and survives target changes, reset and resize',()=>{
  const sim=new SearchSimulation(6,5,47);
  assert.equal(sim.snapshot().initialSpin,1);assert.equal(sim.setInitial(39),true);
  assert.equal(sim.target,6);assert.deepEqual(sim.amplitudes,basisState(39,5));
  sim.runFull();sim.advance(.5);assert.equal(sim.setInitial(0),false);
  sim.paused=true;assert.equal(sim.setInitial(0),false);
  assert.equal(sim.setGridSize(3),true);assert.equal(sim.initial,17);assert.equal(sim.target,4);
  assert.equal(sim.paused,false);assert.equal(sim.time,0);assert.equal(sim.completed,0);
  sim.setTarget(7);sim.runFull();sim.advance(1000);sim.reset();
  assert.equal(sim.initial,17);assert.equal(sim.target,7);assert.deepEqual(sim.amplitudes,basisState(17,3));
  sim.setInitial(8);assert.equal(sim.target,7);assert.equal(sim.checkpoints.length,0);
  for(const invalid of [-1,18,1.5,NaN])assert.equal(sim.setInitial(invalid),false);
});
test('report initial-state precision',()=>console.log(searches+' initial/target pairs; amplitude '+maxAmplitudeError.toExponential(3)+'; continuity '+maxContinuity.toExponential(3)));
