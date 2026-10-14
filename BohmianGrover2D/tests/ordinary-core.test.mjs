import test from 'node:test';
import assert from 'node:assert/strict';
import {basisState, gridModel, hadamard, oracle, referenceFlip, evolveGate,
  normSquared, probabilities, SearchSimulation} from '../ordinary-core.js';

const close = (a,b,message='values agree') => assert.ok(Math.abs(a-b)<2e-11,`${message}: ${a} vs ${b}`);
const vector = (a,b,message='vectors agree') => {
  assert.equal(a.length,b.length);
  a.forEach((value,q)=>close(value,b[q],`${message} at ${q}`));
};
const parity = q => q.toString(2).replaceAll('0','').length % 2;

// Independent dense definition, rather than the production butterfly transform.
function denseWalsh(state) {
  const count=state.length/2;
  return Float64Array.from({length:state.length},(_,k)=>{
    const x=Math.floor(k/2), part=k%2;
    return Array.from({length:count},(_,y)=>(parity(x&y)?-1:1)*state[2*y+part]/Math.sqrt(count))
      .reduce((sum,v)=>sum+v,0);
  });
}
function reflectAbout(state,s) {
  let re=0,im=0;
  for(let k=0;k<state.length;k+=2) {
    re+=s[k]*state[k]+s[k+1]*state[k+1];
    im+=s[k]*state[k+1]-s[k+1]*state[k];
  }
  return Float64Array.from({length:state.length},(_,k)=> k%2
    ? 2*(s[k-1]*im+s[k]*re)-state[k]
    : 2*(s[k]*re-s[k+1]*im)-state[k]);
}
function complexState(side) {
  const values=Float64Array.from({length:2*side*side},(_,k)=>Math.sin(k*1.7+.3));
  const norm=Math.sqrt(normSquared(values));
  return values.map(value=>value/norm);
}

test('ordinary qubit H agrees with the dense textbook Walsh matrix on every basis input',()=>{
  for(const side of [2,4]) {
    for(let q=0;q<side*side;q++) {
      const input=basisState(q,side);
      vector(hadamard(input),denseWalsh(input));
    }
    const state=complexState(side);
    vector(hadamard(state),denseWalsh(state),'complex input');
  }
});

test('each mixer is Hermitian and self-inverse, and preparation and diffuser H use the same animation',()=>{
  for(const side of [2,3,4,5]) {
    const columns=Array.from({length:side*side},(_,q)=>hadamard(basisState(q,side)));
    for(let x=0;x<side*side;x++) for(let y=0;y<side*side;y++) {
      close(columns[y][2*x],columns[x][2*y],'Hermitian real part');
      close(columns[y][2*x+1],-columns[x][2*y+1],'Hermitian imaginary part');
    }
    const state=complexState(side);
    vector(hadamard(hadamard(state)),state,'H squared');
    for(const p of [0,.13,.5,.82,1]) {
      const prepared=evolveGate(state,'prepare',p,0);
      assert.deepEqual(evolveGate(state,'inverse',p,0),prepared);
      close(normSquared(prepared),1,'animation norm');
    }
  }
});

test('the final -H adds only a continuous common phase, preserving the H probability path',()=>{
  for(const side of [2,3,4,5]) {
    const state=complexState(side), end=hadamard(state).map(value=>-value);
    assert.deepEqual(evolveGate(state,'forward',0,0),state);
    assert.deepEqual(evolveGate(state,'forward',1,0),end);
    for(const p of [0,1e-8,.13,.5,.82,1-1e-8,1]) {
      const ordinary=evolveGate(state,'inverse',p,0), corrected=evolveGate(state,'forward',p,0);
      vector(probabilities(corrected),probabilities(ordinary),'common phase leaves each probability unchanged');
      close(normSquared(corrected),1,'final mixer animation norm');
      const c=Math.cos(Math.PI*p), s=Math.sin(Math.PI*p);
      vector(corrected,ordinary.map((value,k)=>k%2
        ? c*value+s*ordinary[k-1] : c*value-s*ordinary[k+1]),'common phase of exp(i pi p)');
    }
    for(const [p,endpoint] of [[1e-8,state],[1-1e-8,end]]) {
      const near=evolveGate(state,'forward',p,0);
      assert.ok(Math.hypot(...near.map((value,k)=>value-endpoint[k]))<4e-8,'no endpoint phase jump');
    }
  }
});

test('the 4x4 checkpoint signs include the initial-only flip and genuine Hadamard negatives',()=>{
  const sim=new SearchSimulation(15,0,4);
  const expected=[
    Array(16).fill(.25),
    Array.from({length:16},(_,q)=>q===15?-.25:.25),
    Array.from({length:16},(_,q)=>(q===0?1:0)-.125*(parity(q)?-1:1)),
    Array.from({length:16},(_,q)=>q===0?-.875:-.125*(parity(q)?-1:1)),
    Array.from({length:16},(_,q)=>q===15?.6875:.1875),
  ];
  for(const amplitudes of expected) {
    sim.startNext();sim.advance(10);
    vector(sim.amplitudes.filter((_,k)=>k%2===0),amplitudes,sim.last.kind);
    sim.amplitudes.filter((_,k)=>k%2===1).forEach(value=>assert.equal(Math.abs(value),0));
  }
  while(sim.startNext()) sim.advance(10);
  sim.amplitudes.filter((_,k)=>k%2===0).forEach((value,q)=>close(value,q===15?.98046875:-.05078125,'round three sign'));
});

test('the three displayed gates (-H) S_i H equal the usual diffuser for every initial state',()=>{
  for(const side of [2,3,4,5]) {
    const state=complexState(side);
    for(let initial=0;initial<side*side;initial++) {
      const prepared=hadamard(basisState(initial,side));
      const mixed=evolveGate(state,'inverse',1,0,initial);
      const flipped=evolveGate(mixed,'reference',1,0,initial);
      const actual=evolveGate(flipped,'forward',1,0,initial);
      vector(actual,reflectAbout(state,prepared),`diffuser ${side}/${initial}`);
      if(initial===0) {
        const mean=[0,1].map(part=>state.filter((_,k)=>k%2===part).reduce((sum,v)=>sum+v,0)/(side*side));
        vector(actual,state.map((value,k)=>2*mean[k%2]-value),'inversion about arithmetic mean');
      }
    }
  }
});

test('oracle and reference each flip only their selected state, leaving all others fixed throughout',()=>{
  for(const side of [2,3,4,5]) {
    const state=complexState(side);
    for(let selected=0;selected<side*side;selected++) {
      vector(oracle(state,selected),state.map((v,k)=>Math.floor(k/2)===selected?-v:v));
      vector(referenceFlip(state,selected),state.map((v,k)=>Math.floor(k/2)===selected?-v:v));
      for(const kind of ['oracle','reference']) for(const p of [0,.25,.5,.75,1]) {
        const animated=evolveGate(state,kind,p,selected,selected);
        vector(probabilities(animated),probabilities(state),'phase probability');
        animated.forEach((value,k)=>{
          if(Math.floor(k/2)!==selected) close(value,state[k],'unselected amplitude stays fixed');
        });
      }
    }
  }
});

test('all initial/marked pairs follow the Grover success curve and the usual diffuser sign convention',()=>{
  for(const side of [2,3,4,5]) for(let initial=0;initial<side*side;initial++) {
    const prepared=hadamard(basisState(initial,side)), theta=Math.asin(1/side);
    for(let target=0;target<side*side;target++) {
      const sim=new SearchSimulation(target,initial,side);
      for(const gate of gridModel(side).gates) {
        sim.startNext();sim.advance(gate.duration);
        close(normSquared(sim.amplitudes),1,'checkpoint norm');
        if(gate.kind!=='forward' && gate.kind!=='prepare') continue;
        const angle=(2*gate.iteration+1)*theta;
        close(probabilities(sim.amplitudes)[target],Math.sin(angle)**2,'marked success');
        sim.amplitudes.forEach((value,k)=>{
          const q=Math.floor(k/2), factor=q===target ? side*Math.sin(angle) : side*Math.cos(angle)/Math.sqrt(side*side-1);
          close(value,prepared[k]*factor,`amplitude orientation ${side}/${initial}/${target}/${gate.iteration}`);
        });
      }
    }
  }
});
