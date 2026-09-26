import test from 'node:test';
import assert from 'node:assert/strict';
import {gridModel,basisState,evolveGate,evolveMixer,evolveFree,rotateSpin,probabilities,normSquared,boxProbability,projectGroverState,SearchSimulation,expectedProbability,FREE_OMEGA,REVIVAL_TIME} from '../multiregion-core.js';
import {gateFlow,flowAt,sampleInitialParticles} from '../probability-flow.js';
import {referenceStep,referenceWave} from './reference-math.js';
const error=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
const density=p=>p.reduce((sum,v)=>sum+v*v,0);
let maxAmplitude=0,maxContinuity=0;
for(const side of [2,3,5]){
  const model=gridModel(side),{stateCount,spatialCount,gates,iterations,mixTime,inverseTime,packetTransform:T}=model;
  test(side+'x'+side+': independent propagation, balanced preparation and positive-time inverse for every joint goal',()=>{
    assert.equal(model.iterations,side);
    assert.ok(Math.abs(mixTime+inverseTime-REVIVAL_TIME)<1e-14);
    assert.ok(Math.abs(FREE_OMEGA*mixTime-Math.PI/side)<1e-14);
    for(let j=0;j<side;j++)for(let k=0;k<side;k++)assert.ok(Math.abs(T[j].reduce((sum,w,n)=>sum+w*T[k][n],0)-(j===k?1:0))<1e-14);
    for(let target=0;target<stateCount;target++){
      const initial=basisState(target,side),prepared=evolveMixer(initial,1);
      assert.ok(error(probabilities(prepared),Array(stateCount).fill(1/stateCount))<1e-13);
      assert.ok(error(evolveGate(prepared,'inverse',1,target),initial)<1e-13);
      assert.ok(error(evolveGate(initial,'inverse',.37,target),rotateSpin(evolveFree(initial,(2*side-1)*.37),-.37*Math.PI/2))<1e-13);
      let actual=basisState(0,side),expected=Float64Array.from(actual);
      for(const gate of gates){
        for(const p of [0,.19,.53,1]){
          const a=evolveGate(actual,gate.kind,p,target),b=referenceStep(expected,gate.kind,p,target);
          maxAmplitude=Math.max(maxAmplitude,error(a,b));
          assert.ok(error(a,b)<2e-12,side+' target '+target+' '+gate.kind+' at '+p);
          assert.ok(Math.abs(normSquared(a)-1)<1e-12);
        }
        actual=evolveGate(actual,gate.kind,1,target);expected=referenceStep(expected,gate.kind,1,target);
        if(gate.kind==='forward')assert.ok(Math.abs(projectGroverState(actual,target).bloch.weight-1)<1e-12);
      }
      assert.ok(Math.abs(probabilities(actual)[target]-expectedProbability(iterations,side))<1e-12);
    }
  });
  test(side+'x'+side+': full spin current conserves independently evolved density and has no wall flux',()=>{
    const h=1e-6;
    for(let target=0;target<stateCount;target++){
      let state=basisState(0,side);
      for(const gate of gates){
        const f=gateFlow(state,gate.kind,target,gate.duration);
        for(const p of [.23,.71]){
          const plus=referenceStep(state,gate.kind,p+h,target),minus=referenceStep(state,gate.kind,p-h,target);
          for(const [x,y] of [[.173,.291],[.481,.632],[.824,.759]]){
            const at=flowAt(f,x,y,p),drho=(density(referenceWave(plus,x,y))-density(referenceWave(minus,x,y)))/(2*h*gate.duration);
            const div=(flowAt(f,x+h,y,p).current[0]-flowAt(f,x-h,y,p).current[0]+flowAt(f,x,y+h,p).current[1]-flowAt(f,x,y-h,p).current[1])/(2*h);
            maxContinuity=Math.max(maxContinuity,Math.abs(drho+div));
            assert.ok(Math.abs(at.drho-drho)<1e-6);
            assert.ok(Math.abs(drho+div)<3e-6);
          }
          for(const t of [.14,.37,.69,.91])for(const [x,y,axis] of [[0,t,0],[1,t,0],[t,0,1],[t,1,1]])
            assert.ok(Math.abs(flowAt(f,x,y,p).current[axis])<1e-12);
        }
        state=evolveGate(state,gate.kind,1,target);
      }
    }
  });
  test(side+'x'+side+': spatial integrals and initial sampling follow the selected packet basis',()=>{
    const state=referenceStep(referenceStep(basisState(0,side),'prepare',.63,stateCount-1),'oracle',.42,stateCount-1);
    let total=0;
    for(let q=0;q<spatialCount;q++){
      const analytic=boxProbability(state,q);total+=analytic;
      assert.ok(Math.abs(analytic-boxProbability(state,q,0)-boxProbability(state,q,1))<1e-13);
      let numerical=0;const steps=96;
      for(let x=0;x<steps;x++)for(let y=0;y<steps;y++)
        numerical+=density(referenceWave(state,(Math.floor(q/side)+(x+.5)/steps)/side,(q%side+(y+.5)/steps)/side))/(side*side*steps*steps);
      assert.ok(Math.abs(numerical-analytic)<6e-5);
    }
    assert.ok(Math.abs(total-1)<1e-12);
    const points=sampleInitialParticles(4000,73991,side),bins=Array(spatialCount).fill(0);
    for(let i=0;i<4000;i++)bins[side*Math.floor(points[4*i]*side)+Math.floor(points[4*i+1]*side)]++;
    for(let q=0;q<spatialCount;q++)assert.ok(Math.abs(bins[q]/4000-boxProbability(basisState(0,side),q))<.015);
  });
}
test('resizing an active or paused search resets its clock, basis and history while preserving a valid goal spin',()=>{
  const a=new SearchSimulation(31),b=new SearchSimulation(3,2);
  a.runFull();a.advance(.5);a.paused=true;
  assert.equal(a.setGridSize(3),true);
  assert.equal(a.model.side,3);assert.equal(a.target,17);
  assert.equal(a.active,null);assert.equal(a.paused,false);assert.equal(a.time,0);assert.equal(a.completed,0);
  assert.equal(a.checkpoints.length,0);assert.deepEqual(a.amplitudes,basisState(0,3));
  b.runFull();b.advance(1000);assert.ok(Math.abs(b.snapshot().probabilities[3]-expectedProbability(2,2))<1e-12);
  a.runFull();a.advance(1000);assert.ok(Math.abs(a.snapshot().probabilities[17]-expectedProbability(3,3))<1e-12);
  for(const n of [5,2,4,3]){assert.equal(a.setGridSize(n),true);assert.equal(a.amplitudes.length,4*n*n);assert.equal(a.target&1,1);}
  assert.equal(a.setGridSize(3),false);
  for(const n of [0,1,6,2.5,NaN])assert.equal(a.setGridSize(n),false);
});
test('report generalized precision',()=>console.log('Additional grids: amplitude '+maxAmplitude.toExponential(3)+', continuity '+maxContinuity.toExponential(3)));
