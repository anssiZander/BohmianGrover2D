import test from 'node:test';
import assert from 'node:assert/strict';
import { basisState, GATES, evolveGate, boxProbability, HBAR_OVER_M, waveAt } from '../multiregion-core.js';
import { gateFlow, flowAt, sampleInitialParticles } from '../probability-flow.js';
import { referenceStep, referenceWave } from './reference-math.js';

let maxSourceError=0,maxDivergenceError=0,maxFluxError=0;
test('spectral current conserves the independently evolved density for every gate and target',()=>{
  const h=1e-6;
  for(let target=0;target<32;target++) {
    let state=basisState();
    for(const gate of GATES) {
      const f=gateFlow(state,gate.kind,target,gate.duration);
      for(const p of [.17,.5,.83]) {
        const minus=referenceStep(state,gate.kind,p-h,target),plus=referenceStep(state,gate.kind,p+h,target);
        for(const [x,y] of [[.13,.22],[.48,.61],[.88,.74]]) {
          const a=referenceWave(minus,x,y),b=referenceWave(plus,x,y),at=flowAt(f,x,y,p);
          const drho=(b.reduce((s,v)=>s+v*v,0)-a.reduce((s,v)=>s+v*v,0))/(2*h*gate.duration);
          const sourceError=Math.abs(at.drho-drho);maxSourceError=Math.max(maxSourceError,sourceError);
          const div=(flowAt(f,x+h,y,p).current[0]-flowAt(f,x-h,y,p).current[0]
            +flowAt(f,x,y+h,p).current[1]-flowAt(f,x,y-h,p).current[1])/(2*h);
          maxDivergenceError=Math.max(maxDivergenceError,Math.abs(div+drho));
          assert.ok(sourceError<1e-6);assert.ok(Math.abs(div+drho)<2e-6);
        }
      }
      state=evolveGate(state,gate.kind,1,target);
    }
  }
});

test('all currents have zero wall flux and phase-gate correction is curl-free',()=>{
  const state=Float64Array.from({length:64},(_,i)=>Math.sin(i*1.73)/4);
  const h=1e-5;
  for(const gate of GATES.slice(0,5)) {
  const f=gateFlow(state,gate.kind,9,gate.duration);
  for(const p of [.1,.37,.9]) for(const t of [.04,.2,.41,.68,.97]) {
    assert.ok(Math.abs(flowAt(f,0,t,p).current[0])<1e-13);
    assert.ok(Math.abs(flowAt(f,1,t,p).current[0])<1e-13);
    assert.ok(Math.abs(flowAt(f,t,0,p).current[1])<1e-13);
    assert.ok(Math.abs(flowAt(f,t,1,p).current[1])<1e-13);
    const curl=(flowAt(f,t+h,.43,p).correction[1]-flowAt(f,t-h,.43,p).correction[1]
      -flowAt(f,t,.43+h,p).correction[0]+flowAt(f,t,.43-h,p).correction[0])/(2*h);
    if(f.mode==='phase')assert.ok(Math.abs(curl)<2e-7);
  }
  }
});

test('complex inputs and forward inverse waiting use the correct physical current',()=>{
  let state=Float64Array.from({length:64},(_,i)=>Math.cos(.87*i)+Math.sin(1.73*i));
  const norm=Math.sqrt(state.reduce((s,v)=>s+v*v,0));state=state.map(v=>v/norm);
  for(const gate of GATES.slice(0,5)) {
    const f=gateFlow(state,gate.kind,6,gate.duration),h=1e-6,p=.37;
    const a=referenceWave(referenceStep(state,gate.kind,p-h,6),.39,.58);
    const b=referenceWave(referenceStep(state,gate.kind,p+h,6),.39,.58);
    const rate=(b.reduce((s,v)=>s+v*v,0)-a.reduce((s,v)=>s+v*v,0))/(2*h*gate.duration);
    assert.ok(Math.abs(flowAt(f,.39,.58,p).drho-rate)<1e-7);
  }
  const forward=gateFlow(state,'forward',6,2.4),inverse=gateFlow(state,'inverse',6,16.8);
  const a=flowAt(forward,.39,.58,.37),b=flowAt(inverse,.39,.58,.37/7);
  assert.ok(Math.hypot(a.convective[0]-b.convective[0],a.convective[1]-b.convective[1])<1e-13);
  // Independent spatial phase-gradient current from finite-difference waves.
  const p=.23,h=1e-6,psi=referenceWave(referenceStep(state,'prepare',p,6),.39,.58);
  for(const axis of [0,1]) {
    const point=[.39,.58],plus=[...point],minus=[...point];plus[axis]+=h;minus[axis]-=h;
    const c=referenceStep(state,'prepare',p,6),wp=referenceWave(c,...plus),wm=referenceWave(c,...minus);
    const j=HBAR_OVER_M*[0,2].reduce((sum,k)=>sum+psi[k]*(wp[k+1]-wm[k+1])-psi[k+1]*(wp[k]-wm[k]),0)/(2*h);
    assert.ok(Math.abs(flowAt(forward,...point,p).convective[axis]-j)<1e-8);
  }
});

test('net current through a region boundary equals its actual probability gain',()=>{
  let state=basisState();const target=6,p=.41,h=1e-6,intervals=256;
  for(const gate of GATES) {
    const f=gateFlow(state,gate.kind,target,gate.duration);
    for(const q of [0,6,15]) {
      const x=(q>>2)/4,y=(q&3)/4;let inward=0;
      for(let i=0;i<=intervals;i++) {
        const t=i/(4*intervals),weight=(i===0||i===intervals)?1:(i%2?4:2);
        inward+=weight*(flowAt(f,x,y+t,p).current[0]-flowAt(f,x+.25,y+t,p).current[0]
          +flowAt(f,x+t,y,p).current[1]-flowAt(f,x+t,y+.25,p).current[1]);
      }
      inward/=12*intervals;
      const rate=(boxProbability(evolveGate(state,gate.kind,p+h,target),q)
        -boxProbability(evolveGate(state,gate.kind,p-h,target),q))/(2*h*gate.duration);
      maxFluxError=Math.max(maxFluxError,Math.abs(rate-inward));assert.ok(Math.abs(rate-inward)<1e-7);
    }
    state=evolveGate(state,gate.kind,1,target);
  }
});

test('initial particle sampling represents the spatial Born density reproducibly',()=>{
  const count=4000,data=sampleInitialParticles(count),again=sampleInitialParticles(count),bins=new Array(16).fill(0);
  assert.deepEqual(data,again);
  for(let i=0;i<count;i++) {
    const x=data[4*i],y=data[4*i+1];assert.ok(x>0&&x<1&&y>0&&y<1);
    bins[4*Math.floor(x*4)+Math.floor(y*4)]++;
  }
  for(let q=0;q<16;q++) assert.ok(Math.abs(bins[q]/count-boxProbability(basisState(),q))<.012);
});
test('report current precision',()=>console.log(`Source error ${maxSourceError.toExponential(3)}; divergence error ${maxDivergenceError.toExponential(3)}; flux error ${maxFluxError.toExponential(3)}.`));

test('nonuniform spin includes both density-gradient and spin-texture currents without double counting',()=>{
  const state=evolveGate(evolveGate(basisState(),'prepare',1,31),'oracle',.63,31);
  const flow=gateFlow(state,'forward',31,2.4),p=.27,h=1e-6,x=.39,y=.58,at=flowAt(flow,x,y,p);
  let textureMagnitude=0;
  for(const [axis,coordinate,sign] of [[0,1,1],[1,0,-1]]){
    const plus=[x,y],minus=[x,y];plus[coordinate]+=h;minus[coordinate]-=h;
    const a=flowAt(flow,...plus,p),b=flowAt(flow,...minus,p);
    const densityPart=sign*HBAR_OVER_M/2*(a.rho-b.rho)/(2*h)*at.polarization[2];
    const texturePart=sign*HBAR_OVER_M/2*at.rho*(a.polarization[2]-b.polarization[2])/(2*h);
    assert.ok(Math.abs(at.spin[axis]-densityPart-texturePart)<1e-8);
    textureMagnitude+=Math.abs(texturePart);
    const curl=sign*HBAR_OVER_M/2*(a.rho*a.polarization[2]-b.rho*b.polarization[2])/(2*h);
    assert.ok(Math.abs(curl-at.spin[axis])<1e-8);
  }
  assert.ok(textureMagnitude>1e-4,'the test must contain a nonzero spin texture');
  const up=flowAt(gateFlow(basisState(0),'oracle',31,1.6),x,y,0);
  const down=flowAt(gateFlow(basisState(1),'oracle',31,1.6),x,y,0);
  assert.ok(Math.hypot(...up.spin)>.001);
  assert.ok(Math.hypot(up.spin[0]+down.spin[0],up.spin[1]+down.spin[1])<1e-13);
});
