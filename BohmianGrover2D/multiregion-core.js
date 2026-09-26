// 16 spatial packets x spin 1/2. Each packet stores [up.re,up.im,down.re,down.im].
export const SIDE = 4;
export const SPATIAL_COUNT = SIDE * SIDE;
export const STATE_COUNT = 2 * SPATIAL_COUNT;
export const ITERATIONS = 4;
export const MIX_TIME = 2.4;
export const FREE_OMEGA = Math.PI / (4 * MIX_TIME);
export const HBAR_OVER_M = 2 * FREE_OMEGA / Math.PI ** 2;
export const REVIVAL_TIME = 8 * MIX_TIME;
export const SPATIAL_LABELS = Array.from({length:SPATIAL_COUNT},(_,q)=>q.toString(2).padStart(4,'0'));
export const LABELS = Array.from({length:STATE_COUNT},(_,q)=>SPATIAL_LABELS[q>>1]+','+(q&1?'↓':'↑'));
export const GATES = Object.freeze([
  {kind:'prepare',name:'Prepare · free T + spin rotation',symbol:'A',iteration:0,duration:MIX_TIME},
  ...Array.from({length:ITERATIONS},(_,i)=>[
    {kind:'oracle',name:'Joint position–spin oracle',symbol:'Oω',iteration:i+1,duration:1.6},
    {kind:'inverse',name:'A† · forward 7T + inverse spin',symbol:'A†',iteration:i+1,duration:7*MIX_TIME},
    {kind:'reference',name:'Reference phase |0000,↑⟩',symbol:'S₀',iteration:i+1,duration:1.6},
    {kind:'forward',name:'Forward · free T + spin rotation',symbol:'A',iteration:i+1,duration:MIX_TIME},
  ]).flat(),
].map(Object.freeze));

export const PACKET_TRANSFORM = Array.from({length:SIDE},(_,j)=>Float64Array.from({length:SIDE},(_,n)=>
  (n===SIDE-1?1/Math.sqrt(SIDE):Math.sqrt(2/SIDE))*Math.sin(Math.PI*(j+.5)*(n+1)/SIDE)));

export function basisState(q=0) {const state=new Float64Array(2*STATE_COUNT);state[2*q]=1;return state;}
export function sineCoefficients(state) {
  const out=new Float64Array(2*STATE_COUNT);
  for(let n=0;n<SIDE;n++)for(let m=0;m<SIDE;m++)for(let x=0;x<SIDE;x++)for(let y=0;y<SIDE;y++) {
    const w=PACKET_TRANSFORM[x][n]*PACKET_TRANSFORM[y][m];
    for(let k=0;k<4;k++)out[4*(SIDE*n+m)+k]+=w*state[4*(SIDE*x+y)+k];
  }return out;
}
export function packetCoefficients(modes) {
  const out=new Float64Array(2*STATE_COUNT);
  for(let x=0;x<SIDE;x++)for(let y=0;y<SIDE;y++)for(let n=0;n<SIDE;n++)for(let m=0;m<SIDE;m++) {
    const w=PACKET_TRANSFORM[x][n]*PACKET_TRANSFORM[y][m];
    for(let k=0;k<4;k++)out[4*(SIDE*x+y)+k]+=w*modes[4*(SIDE*n+m)+k];
  }return out;
}
export function rotateSpin(state,angle) {
  // Ry(angle)=exp(-i angle sigma_y/2), applied uniformly in space.
  const out=new Float64Array(state.length),c=Math.cos(angle/2),s=Math.sin(angle/2);
  for(let q=0;q<SPATIAL_COUNT;q++)for(let k=0;k<2;k++) {
    const a=4*q+k;out[a]=c*state[a]-s*state[a+2];out[a+2]=s*state[a]+c*state[a+2];
  }return out;
}
export function evolveFree(state,intervals) {
  const modes=sineCoefficients(state);
  for(let n=0;n<SIDE;n++)for(let m=0;m<SIDE;m++) {
    const angle=Math.PI*intervals*((n+1)**2+(m+1)**2)/4,c=Math.cos(angle),s=Math.sin(angle);
    for(let spin=0;spin<2;spin++) {
      const q=4*(SIDE*n+m)+2*spin,re=modes[q],im=modes[q+1];
      modes[q]=c*re+s*im;modes[q+1]=c*im-s*re;
    }
  }return packetCoefficients(modes);
}
export function evolveMixer(state,p,inverse=false) {
  // Spatial inverse is positive-time U_box(7T); the independent spin drive reverses.
  return rotateSpin(evolveFree(state,(inverse?7:1)*p),(inverse?-1:1)*Math.PI*p/2);
}
export function phasePulse(state,target,p) {
  const out=Float64Array.from(state),r=2*target,c=Math.cos(Math.PI*p),s=Math.sin(Math.PI*p);
  out[r]=c*state[r]+s*state[r+1];out[r+1]=c*state[r+1]-s*state[r];return out;
}
export function evolveGate(state,kind,progress,target) {
  if(kind==='prepare'||kind==='forward')return evolveMixer(state,progress);
  if(kind==='inverse')return evolveMixer(state,progress,true);
  if(kind==='oracle')return phasePulse(state,target,progress);
  if(kind==='reference')return phasePulse(state,0,progress);
  throw Error('Unknown gate: '+kind);
}
export function probabilities(state) {return Float64Array.from({length:STATE_COUNT},(_,q)=>state[2*q]**2+state[2*q+1]**2);}
export function normSquared(state) {return state.reduce((s,v)=>s+v*v,0);}
export function expectedProbability(k) {return Math.sin((2*k+1)*Math.asin(1/Math.sqrt(STATE_COUNT)))**2;}
export function spinSummary(state) {
  let up=0,down=0,x=0,y=0;
  for(let q=0;q<SPATIAL_COUNT;q++) {
    const [a,b,c,d]=state.slice(4*q,4*q+4);up+=a*a+b*b;down+=c*c+d*d;x+=2*(a*c+b*d);y+=2*(a*d-b*c);
  }return {up,down,bloch:[x,y,up-down],purity:(1+x*x+y*y+(up-down)**2)/2};
}
export function axisPacket(j,x) {return PACKET_TRANSFORM[j].reduce((sum,w,n)=>sum+w*Math.SQRT2*Math.sin((n+1)*Math.PI*x),0);}
export function waveAt(state,x,y) {
  const fx=Array.from({length:SIDE},(_,j)=>axisPacket(j,x)),fy=Array.from({length:SIDE},(_,j)=>axisPacket(j,y));
  const out=[0,0,0,0];
  for(let j=0;j<SIDE;j++)for(let k=0;k<SIDE;k++)for(let s=0;s<4;s++)out[s]+=fx[j]*fy[k]*state[4*(SIDE*j+k)+s];
  return out;
}

function sineOverlap(n,m,a,b) {
  if(n===m)return b-a-(Math.sin(2*n*Math.PI*b)-Math.sin(2*n*Math.PI*a))/(2*n*Math.PI);
  const primitive=x=>Math.sin((n-m)*Math.PI*x)/((n-m)*Math.PI)-Math.sin((n+m)*Math.PI*x)/((n+m)*Math.PI);
  return primitive(b)-primitive(a);
}
const CELL_OVERLAPS=Array.from({length:SIDE},(_,j)=>Array.from({length:SIDE},(_,n)=>
  Float64Array.from({length:SIDE},(_,m)=>sineOverlap(n+1,m+1,j/SIDE,(j+1)/SIDE))));
// region is a spatial cell (0..15); optional spin resolves a measurement channel.
export function boxProbability(state,region,spin=null) {
  const c=sineCoefficients(state),ix=CELL_OVERLAPS[region>>2],iy=CELL_OVERLAPS[region&3];let weight=0;
  for(let q=0;q<SPATIAL_COUNT;q++)for(let r=0;r<SPATIAL_COUNT;r++)for(let s=0;s<2;s++) {
    if(spin!==null&&spin!==s)continue;
    const a=4*q+2*s,b=4*r+2*s;
    weight+=(c[a]*c[b]+c[a+1]*c[b+1])*ix[q>>2][r>>2]*iy[q&3][r&3];
  }return Math.max(0,Math.min(1,weight));
}
export function effectiveBlochState(marked,unmarked) {
  const [mr,mi]=marked,[ur,ui]=unmarked,m=mr*mr+mi*mi,u=ur*ur+ui*ui,weight=m+u;
  if(weight<1e-12)return {vector:null,weight,conditionalMarked:null};
  return {vector:[2*(mr*ur+mi*ui)/weight,2*(mr*ui-mi*ur)/weight,(m-u)/weight],weight:Math.min(1,weight),conditionalMarked:m/weight};
}
export const PREPARED_STATE=evolveMixer(basisState(),1);
export function projectGroverState(state,target) {
  const marked=[0,0],unmarked=[0,0];
  for(let q=0;q<STATE_COUNT;q++) {
    const re=Math.sqrt(STATE_COUNT)*(PREPARED_STATE[2*q]*state[2*q]+PREPARED_STATE[2*q+1]*state[2*q+1]);
    const im=Math.sqrt(STATE_COUNT)*(PREPARED_STATE[2*q]*state[2*q+1]-PREPARED_STATE[2*q+1]*state[2*q]);
    if(q===target){marked[0]=re;marked[1]=im;}else{unmarked[0]+=re/Math.sqrt(STATE_COUNT-1);unmarked[1]+=im/Math.sqrt(STATE_COUNT-1);}
  }
  const bloch=effectiveBlochState(marked,unmarked);
  return {bloch,targetProbability:marked[0]**2+marked[1]**2,outsideProbability:Math.max(0,1-bloch.weight)};
}
export class SearchSimulation {
  constructor(target=30){this.target=target;this.reset();}
  reset(){this.amplitudes=basisState();this.completed=0;this.active=null;this.last=null;this.paused=false;this.autoplay=false;this.time=0;this.revision=(this.revision||0)+1;this.checkpoints=[];}
  setTarget(target){if(this.active||!Number.isInteger(target)||target<0||target>=STATE_COUNT)return false;this.target=target;this.reset();return true;}
  startNext(){if(this.active||this.completed>=GATES.length)return false;this.active={...GATES[this.completed],index:this.completed,elapsed:0,progress:0,startAmplitudes:Float64Array.from(this.amplitudes)};return true;}
  runFull(){if(this.active)return false;this.reset();this.autoplay=true;return this.startNext();}
  advance(dt){
    if(this.paused||!Number.isFinite(dt)||dt<=0)return;let remaining=dt;
    while(this.active&&remaining>1e-12){
      const gate=this.active,step=Math.min(remaining,gate.duration-gate.elapsed);
      gate.elapsed+=step;this.time+=step;remaining-=step;gate.progress=Math.min(1,gate.elapsed/gate.duration);
      if(gate.duration-gate.elapsed<1e-10)gate.progress=1;
      this.amplitudes=evolveGate(gate.startAmplitudes,gate.kind,gate.progress,this.target);
      if(gate.progress<1)break;
      this.last=gate;this.active=null;this.completed++;
      this.checkpoints.push({step:this.completed,kind:gate.kind,iteration:gate.iteration,targetProbability:probabilities(this.amplitudes)[this.target]});
      if(this.autoplay&&this.completed<GATES.length)this.startNext();else this.autoplay=false;
    }
  }
  snapshot(){const gate=this.active||this.last;return {target:this.target,targetRegion:this.target>>1,targetSpin:this.target&1,completed:this.completed,busy:!!this.active,paused:this.paused,time:this.time,kind:gate?.kind||'input',iteration:gate?.iteration||0,progress:this.active?.progress??(this.last?1:0),norm:normSquared(this.amplitudes),probabilities:Array.from(probabilities(this.amplitudes)),amplitudes:Array.from(this.amplitudes),spin:spinSummary(this.amplitudes),checkpoints:this.checkpoints.map(x=>({...x}))};}
}
