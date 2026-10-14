import test from 'node:test';
import assert from 'node:assert/strict';
import {basisState, gridModel, hadamard, oracle, referenceFlip, evolveGate, mixerProjection,
  normSquared, probabilities, SearchSimulation} from '../ordinary-core.js';

const close = (a,b,message='values agree') => assert.ok(Math.abs(a-b)<2e-11,`${message}: ${a} vs ${b}`);
const vector = (a,b,message='vectors agree') => {
  assert.equal(a.length,b.length);
  a.forEach((value,q)=>close(value,b[q],`${message} at ${q}`));
};
const parity = q => q.toString(2).replaceAll('0','').length % 2;

test('the displayed reference predicts the exact full-mixer displacement, including complex and nonzero inputs', () => {
  for (const side of [2,3,4,5]) for (let initial=0;initial<side*side;initial++) {
    const state=complexState(side), reference=mixerProjection(state,initial);
    const result=hadamard(referenceFlip(hadamard(state),initial));
    vector(state.map((v,k)=>v-2*reference[k]),result,'reference displacement equals the three-gate operator');
    if(initial===0) {
      const mean=[0,1].map(part=>state.filter((_,k)=>k%2===part).reduce((sum,v)=>sum+v,0)/(side*side));
      reference.forEach((v,k)=>close(v,mean[k%2],'uniform reference is the arithmetic complex mean'));
    }
  }
});

test('post-oracle reference stays fixed through the mixer and is restored by Previous step', () => {
  for(const combine of [false,true]) {
    const sim=new SearchSimulation(15,0,4);sim.setCombineMixer(combine);
    sim.startNext();sim.advance(2.4);sim.startNext();sim.advance(1.6);
    const input=Array.from(sim.amplitudes);
    mixerProjection(input).forEach((v,k)=>close(v,k%2?0:.21875,'first input mean'));
    sim.startNext();sim.advance(.8);
    vector(sim.snapshot().mixerInput,input,'input frozen during first gate');
    sim.advance(100);
    while(sim.completed<5) {sim.startNext();sim.advance(100);vector(sim.snapshot().mixerInput,input);}
    vector(sim.snapshot().mixerInput,input,'input retained at full endpoint');
    sim.amplitudes.forEach((v,k)=>close(v,input[k]-(k%2?0:.4375),'every column shifts by minus twice the mean'));
    const detached=sim.snapshot();detached.mixerInput[0]=99;
    vector(sim.snapshot().mixerInput,input,'snapshot does not expose mutable reference storage');
    sim.startNext();sim.advance(.4);assert.equal(sim.snapshot().mixerInput,null,'new oracle releases old reference');
    sim.previousStep();vector(sim.snapshot().mixerInput,input,'back from oracle restores previous mixer input');
    sim.previousStep();
    if(combine) assert.equal(sim.snapshot().mixerInput,null);else vector(sim.snapshot().mixerInput,input);
    sim.reset();assert.equal(sim.snapshot().mixerInput,null);
  }
});

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

test('each mixer is Hermitian and self-inverse, and both H steps use exactly the same animation',()=>{
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
      assert.deepEqual(evolveGate(state,'forward',p,0),prepared);
      close(normSquared(prepared),1,'animation norm');
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
    Array.from({length:16},(_,q)=>q===15?-.6875:-.1875),
  ];
  for(const amplitudes of expected) {
    sim.startNext();sim.advance(10);
    vector(sim.amplitudes.filter((_,k)=>k%2===0),amplitudes,sim.last.kind);
    sim.amplitudes.filter((_,k)=>k%2===1).forEach(value=>assert.equal(Math.abs(value),0));
  }
  while(sim.completed<sim.model.gates.length && sim.startNext()) sim.advance(10);
  sim.amplitudes.filter((_,k)=>k%2===0).forEach((value,q)=>close(value,q===15?-.98046875:.05078125,'round three sign'));
});

test('H S_i H equals minus the usual diffuser for every initial state',()=>{
  for(const side of [2,3,4,5]) {
    const state=complexState(side);
    for(let initial=0;initial<side*side;initial++) {
      const prepared=hadamard(basisState(initial,side));
      const actual=hadamard(referenceFlip(hadamard(state),initial));
      vector(actual,reflectAbout(state,prepared).map(value=>-value),`diffuser ${side}/${initial}`);
      if(initial===0) {
        const mean=[0,1].map(part=>state.filter((_,k)=>k%2===part).reduce((sum,v)=>sum+v,0)/(side*side));
        vector(actual,state.map((value,k)=>value-2*mean[k%2]),'minus inversion about arithmetic mean');
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

test('all initial/marked pairs retain the Grover success curve with the explicit global sign per round',()=>{
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
          close(value,(-1)**gate.iteration*prepared[k]*factor,`amplitude orientation ${side}/${initial}/${target}/${gate.iteration}`);
        });
      }
    }
  }
});

test('a combined mixer animates the whole reflection directly with no internal gates or checkpoints',()=>{
  for(const side of [2,3,4,5]) for(const elapsed of [0,.6,1.2,1.8,2.4,20]) {
    const combined=new SearchSimulation(side*side-1,side*side-2,side);
    combined.setCombineMixer(true);
    combined.startNext();combined.advance(100);
    assert.equal(combined.completed,1,'preparation stops separately');
    combined.startNext();combined.advance(100);
    assert.equal(combined.completed,2,'oracle stops before mixer');
    const input=complexState(side);combined.amplitudes=Float64Array.from(input);
    combined.startNext();combined.advance(elapsed);
    const progress=Math.min(elapsed/2.4,1), finished=progress===1, state=combined.snapshot();
    // Independent continuous reflection: conjugate only the phase pulse by
    // the exact H matrices, instead of animating either H as a separate gate.
    const expected=hadamard(evolveGate(hadamard(input),'reference',progress,0,combined.initial));
    vector(combined.amplitudes,expected,`direct complex reflection at ${elapsed}s on ${side}x${side}`);
    assert.equal(state.busy,!finished);
    assert.equal(state.kind,'mixer','no intermediate H or initial-flip stage');
    assert.equal(state.operationKind,'mixer');
    assert.equal(state.completedOperations,finished?3:2);
    assert.equal(state.completed,finished?5:2,'primitive gate indices advance together at the endpoint');
    assert.equal(state.checkpoints.length,finished?3:2,'no intermediate mixer checkpoints');
    assert.equal(state.totalOperations,1+2*state.iterations);
    close(state.operationProgress,progress,'one direct animation progress');
    close(state.norm,1,'combined animation norm');
  }
});

test('combined real columns interpolate monotonically between the oracle and signed mixer endpoint',()=>{
  for(const side of [2,3,4,5]) {
    const sim=new SearchSimulation(side*side-1,0,side);sim.setCombineMixer(true);
    sim.startNext();sim.advance(100);sim.startNext();sim.advance(100);
    const input=Float64Array.from(sim.amplitudes);
    const end=reflectAbout(input,hadamard(basisState(0,side))).map(value=>-value);
    sim.startNext();
    for(let sample=1;sample<=10;sample++) {
      sim.advance(.24);const blend=(1-Math.cos(Math.PI*sample/10))/2;
      for(let q=0;q<side*side;q++) {
        const value=sim.amplitudes[2*q];
        close(value,input[2*q]+blend*(end[2*q]-input[2*q]),'direct eased interpolation of column height');
        assert.ok(value>=Math.min(input[2*q],end[2*q])-2e-11 && value<=Math.max(input[2*q],end[2*q])+2e-11,'no intermediate gate excursion');
      }
      close(normSquared(sim.amplitudes),1);
    }
    vector(sim.amplitudes,end,'exact signed endpoint');
  }
});

test('grouping can change at mixer boundaries without resetting amplitudes, history or time',()=>{
  const sim=new SearchSimulation(15,0,4);
  sim.startNext();sim.advance(100);sim.startNext();sim.advance(100);
  const before=sim.snapshot();
  assert.ok(sim.setCombineMixer(true));
  vector(sim.amplitudes,before.amplitudes);
  assert.deepEqual(sim.checkpoints,before.checkpoints);assert.equal(sim.time,before.time);
  sim.startNext();sim.advance(1.2);sim.paused=true;
  const paused=sim.snapshot();sim.advance(100);
  vector(sim.amplitudes,paused.amplitudes,'pause freezes the whole combined operation');
  assert.equal(sim.time,paused.time);assert.equal(sim.setCombineMixer(false),false);
  sim.paused=false;sim.advance(1.2);
  assert.equal(sim.active,null);assert.equal(sim.completed,5);
  const complete=sim.snapshot();assert.ok(sim.setCombineMixer(false));
  vector(sim.amplitudes,complete.amplitudes);assert.deepEqual(sim.checkpoints,complete.checkpoints);
  assert.equal(sim.snapshot().completedOperations,5);assert.equal(sim.snapshot().totalOperations,13);
  assert.ok(sim.setCombineMixer(true));assert.equal(sim.snapshot().completedOperations,3);
  sim.reset();assert.equal(sim.combineMixer,true);assert.equal(sim.snapshot().completedOperations,0);
  sim.setGridSize(3);assert.equal(sim.combineMixer,true);
  sim.setCombineMixer(false);sim.startNext();sim.advance(100);sim.startNext();sim.advance(100);
  sim.startNext();sim.advance(100);
  assert.equal(sim.snapshot().canCombineMixer,false,'a partially stepped mixer must finish first');
  assert.equal(sim.setCombineMixer(true),false);
  sim.startNext();sim.advance(100);assert.equal(sim.setCombineMixer(true),false);
  sim.startNext();sim.advance(100);assert.ok(sim.setCombineMixer(true));
});

test('direct combined stepping and autoplay retain the signed endpoints for all initial and marked pairs',()=>{
  for(const side of [2,3,4,5]) for(let initial=0;initial<side*side;initial++) for(let target=0;target<side*side;target++) {
    const split=new SearchSimulation(target,initial,side), combined=new SearchSimulation(target,initial,side);
    combined.setCombineMixer(true);
    while(split.completed<split.model.gates.length && split.startNext()) split.advance(100);
    let operations=0;
    while(combined.completed<combined.model.gates.length && combined.startNext()) {
      combined.advance(100);operations++;
      assert.equal(combined.snapshot().completedOperations,operations);
    }
    assert.equal(operations,1+2*combined.model.iterations);
    vector(combined.amplitudes,split.amplitudes,`signed final state ${side}/${initial}/${target}`);
    const endpoints=combined.checkpoints.map(item=>({...item,kind:item.kind==='mixer'?'forward':item.kind}));
    assert.deepEqual(endpoints,split.checkpoints.filter(item=>!['inverse','reference'].includes(item.kind)),'preparation, oracle and complete mixer checkpoints agree');
    close(combined.time,2.4+4*combined.model.iterations,'each combined mixer takes one animation duration');
    if(initial===0 && target===side*side-1) {
      combined.runFull();combined.advance(1000);
      vector(combined.amplitudes,split.amplitudes,'autoplay matches stepping');
      assert.equal(combined.snapshot().completedOperations,operations);
    }
  }
});

test('previous step restores every exact signed checkpoint and supports replay in both mixer modes',()=>{
  for(const side of [2,3,4,5]) for(const combine of [false,true]) for(const [initial,target] of [[0,side*side-1],[side*side-2,1],[side*side-1,side*side-1]]) {
    const sim=new SearchSimulation(target,initial,side);sim.setCombineMixer(combine);
    assert.equal(sim.previousStep(),false);
    const states=[sim.snapshot()];
    while(sim.completed<sim.model.gates.length && sim.startNext()) {sim.advance(100);states.push(sim.snapshot());}
    const final=sim.snapshot();
    for(let step=states.length-2;step>=0;step--) {
      assert.ok(sim.previousStep());const actual=sim.snapshot(), expected=states[step];
      assert.deepEqual(actual.amplitudes,expected.amplitudes,'restore the exact complex state, including signs');
      assert.deepEqual(actual.checkpoints,expected.checkpoints,'discard future iteration history');
      assert.equal(actual.completed,expected.completed);assert.equal(actual.completedOperations,expected.completedOperations);
      assert.equal(actual.kind,expected.kind);assert.equal(actual.iteration,expected.iteration);
      assert.equal(actual.combineMixer,combine);assert.equal(actual.initial,initial);assert.equal(actual.target,target);
      assert.equal(actual.busy,false);assert.equal(actual.paused,false);assert.equal(sim.autoplay,false);
      close(actual.time,expected.time,'restore checkpoint animation time');
    }
    assert.equal(sim.previousStep(),false,'cannot move before the input state');
    while(sim.completed<sim.model.gates.length && sim.startNext()) sim.advance(100);
    assert.deepEqual(sim.snapshot().amplitudes,final.amplitudes,'replaying reaches exactly the same final state');
    assert.deepEqual(sim.checkpoints,final.checkpoints);
  }
});

test('previous step cancels running, paused and autoplay operations at their starting checkpoint',()=>{
  for(const combine of [false,true]) {
    const sim=new SearchSimulation(15,0,4);sim.setCombineMixer(combine);
    while(sim.completed<sim.model.gates.length) {
      const before=sim.snapshot();sim.startNext();sim.advance(sim.active.duration/2);sim.paused=true;
      assert.ok(sim.previousStep());const after=sim.snapshot();
      assert.deepEqual(after.amplitudes,before.amplitudes);assert.deepEqual(after.checkpoints,before.checkpoints);
      assert.equal(after.completed,before.completed);assert.equal(after.busy,false);assert.equal(after.paused,false);
      close(after.time,before.time);
      sim.startNext();sim.advance(100);
    }
    sim.runFull();sim.advance(4.6);
    assert.ok(sim.active && sim.autoplay);assert.ok(sim.previousStep());
    assert.equal(sim.completed,2);assert.equal(sim.active,null);assert.equal(sim.autoplay,false);
    const restored=sim.snapshot();sim.advance(1000);
    assert.deepEqual(sim.snapshot(),restored,'rewinding stops autoplay completely');
  }
});

test('previous step follows the selected mixer mode after switching modes',()=>{
  const sim=new SearchSimulation(15,0,4);
  for(let step=0;step<5;step++) {sim.startNext();sim.advance(100);}
  const mixed=Array.from(sim.amplitudes);
  sim.setCombineMixer(true);assert.ok(sim.previousStep());
  assert.equal(sim.completed,2,'combined mode goes back across all three mixer gates');
  sim.amplitudes.filter((_,k)=>k%2===0).forEach((value,q)=>close(value,q===15?-.25:.25));
  sim.startNext();sim.advance(100);assert.deepEqual(Array.from(sim.amplitudes),mixed);
  sim.setCombineMixer(false);assert.ok(sim.previousStep());
  assert.equal(sim.completed,4,'separate mode revisits the initial-state flip checkpoint');
  close(sim.amplitudes[0],-.875);assert.equal(sim.last.kind,'reference');
  assert.equal(sim.checkpoints.some(item=>['forward','mixer'].includes(item.kind)),false);
  sim.startNext();sim.advance(100);assert.deepEqual(Array.from(sim.amplitudes),mixed);
});

test('manual rounds continue beyond the first peak with the exact Grover amplitudes and signs',()=>{
  for(const side of [2,3,4,5]) for(const combine of [false,true]) for(const initial of [0,side*side-1]) {
    const sim=new SearchSimulation(side*side-2,initial,side);sim.setCombineMixer(combine);
    const prepared=hadamard(basisState(initial,side)), theta=Math.asin(1/side);
    assert.ok(sim.startNext());sim.advance(100);
    for(let round=1;round<=sim.model.iterations+16;round++) {
      while(sim.completed<1+4*round) {
        assert.equal(sim.nextGate.iteration,round,'generated gate belongs to the next round');
        assert.ok(sim.startNext());sim.advance(100);
        assert.equal(sim.snapshot().recommendedReached,sim.completed>=sim.model.gates.length);
      }
      const state=sim.snapshot(), angle=(2*round+1)*theta;
      assert.equal(state.completedIterations,round);
      assert.equal(state.completedOperations,1+(combine?2:4)*round);
      close(state.norm,1,'norm beyond optimum');
      close(state.probabilities[sim.target],Math.sin(angle)**2,'probability through overshoot and later peaks');
      state.amplitudes.forEach((value,k)=>{
        const factor=Math.floor(k/2)===sim.target ? side*Math.sin(angle) : side*Math.cos(angle)/Math.sqrt(side*side-1);
        close(value,(-1)**round*prepared[k]*factor,'signed amplitude remains standard Grover beyond optimum');
      });
    }
    assert.equal(sim.checkpoints.filter(item=>item.kind==='prepare').length,1,'preparation runs only once');
    assert.ok(sim.startNext(),'further rounds remain available');
  }
});

test('autoplay stops at the recommended measurement, then manual stepping reaches the overshoot round',()=>{
  for(const side of [2,3,4,5]) for(const combine of [false,true]) {
    const sim=new SearchSimulation(side*side-1,0,side);sim.setCombineMixer(combine);
    sim.runFull();sim.advance(10000);const optimal=sim.snapshot();
    assert.equal(optimal.completed,sim.model.gates.length);
    assert.ok(optimal.recommendedReached);assert.equal(optimal.busy,false);assert.equal(sim.autoplay,false);
    sim.advance(1000);assert.deepEqual(sim.snapshot(),optimal,'autoplay waits at the recommended stop');
    while(sim.completed<sim.model.gates.length+4) {assert.ok(sim.startNext());sim.advance(100);}
    assert.equal(sim.snapshot().completedIterations,optimal.iterations+1);
    assert.ok(sim.snapshot().recommendedReached,'recommended point remains reached after overshoot');
    assert.ok(sim.snapshot().probabilities[sim.target]<optimal.probabilities[sim.target],'first extra round lowers success probability');
    sim.reset();assert.equal(sim.snapshot().recommendedReached,false);
  }
});

test('Previous step restores checkpoints and the recommended-stop indication across extra rounds',()=>{
  for(const combine of [false,true]) {
    const sim=new SearchSimulation(15,0,4);sim.setCombineMixer(combine);const states=[sim.snapshot()];
    while(sim.completed<sim.model.gates.length+12) {sim.startNext();sim.advance(100);states.push(sim.snapshot());}
    const final=sim.snapshot();
    sim.startNext();sim.advance(.4);sim.paused=true;sim.previousStep();
    assert.deepEqual(sim.snapshot(),final,'cancel an active extra operation exactly');
    for(let i=states.length-2;i>=0;i--) {
      sim.previousStep();assert.deepEqual(sim.snapshot(),states[i],'rewind exact state, history and stop indication');
    }
    while(sim.completed<final.completed) {sim.startNext();sim.advance(100);}
    assert.deepEqual(sim.snapshot(),final,'forward replay past optimum is exact');
    assert.ok(sim.setCombineMixer(!combine));
    sim.previousStep();assert.equal(sim.completed,final.completed-(combine?1:3),'rewind uses the currently selected mixer mode beyond optimum');
  }
});
