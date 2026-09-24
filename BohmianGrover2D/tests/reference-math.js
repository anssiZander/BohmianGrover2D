// Independent dense kinetic matrix in the packet basis, exponentiated using
// a scaled Taylor series and squaring. No production propagator is imported.
const N = 16;
const packetWeight=(j,n)=>(n===4?.5:Math.SQRT1_2)*Math.sin((j+.5)*n*Math.PI/4);
export function generator(kind, target) {
  return Array.from({ length: N }, (_, row) => Float64Array.from({ length: N }, (_, col) => {
    if (kind === 'oracle' || kind === 'reference') return row === col && row === (kind === 'oracle' ? target : 0) ? Math.PI : 0;
    let kinetic=0;
    for(let n=1;n<=4;n++) {
      if((row&3)===(col&3)) kinetic+=n*n*packetWeight(row>>2,n)*packetWeight(col>>2,n);
      if((row>>2)===(col>>2)) kinetic+=n*n*packetWeight(row&3,n)*packetWeight(col&3,n);
    }
    return (kind==='inverse'?7:1)*Math.PI*kinetic/4;
  }));
}
const cache=new Map();
function square(a) {
  const out=new Float64Array(2*N*N);
  for(let i=0;i<N;i++)for(let j=0;j<N;j++)for(let k=0;k<N;k++) {
    const x=2*(i*N+k),y=2*(k*N+j),z=2*(i*N+j);
    out[z]+=a[x]*a[y]-a[x+1]*a[y+1];out[z+1]+=a[x]*a[y+1]+a[x+1]*a[y];
  }return out;
}
export function referenceStep(state, kind, p, target) {
  const key=`${kind}/${kind==='oracle'?target:0}/${p}`;
  let propagator=cache.get(key);
  if(!propagator) {
    const matrix=generator(kind,target),norm=Math.max(...matrix.map(row=>row.reduce((s,v)=>s+Math.abs(v*p),0)));
    const scaling=Math.max(0,Math.ceil(Math.log2(Math.max(norm,.5)/.5))),h=p/2**scaling;
    propagator=new Float64Array(2*N*N);let term=new Float64Array(2*N*N);
    for(let i=0;i<N;i++)propagator[2*(i*N+i)]=term[2*(i*N+i)]=1;
    for(let order=1;order<=32;order++) {
      const next=new Float64Array(2*N*N);
      for(let i=0;i<N;i++)for(let j=0;j<N;j++)for(let k=0;k<N;k++) {
        const a=2*(k*N+j),b=2*(i*N+j),factor=matrix[i][k]*h/order;
        next[b]+=factor*term[a+1];next[b+1]-=factor*term[a];
      }
      next.forEach((v,i)=>propagator[i]+=v);term=next;
      if(Math.max(...term.map(Math.abs))<1e-18)break;
    }
    for(let i=0;i<scaling;i++)propagator=square(propagator);
    cache.set(key,propagator);
  }
  const out=new Float64Array(2*N);
  for(let i=0;i<N;i++)for(let j=0;j<N;j++) {
    const k=2*(i*N+j);out[2*i]+=propagator[k]*state[2*j]-propagator[k+1]*state[2*j+1];
    out[2*i+1]+=propagator[k]*state[2*j+1]+propagator[k+1]*state[2*j];
  }return out;
}
export function referenceWave(state, x, y) {
  const packet = (j, z) => Array.from({ length: 4 }, (_, k) => {
    const n = k + 1, weight = (n === 4 ? .5 : 1 / Math.sqrt(2)) * Math.sin((j + .5) * n * Math.PI / 4);
    return weight * Math.sqrt(2) * Math.sin(n * Math.PI * z);
  }).reduce((a, b) => a + b, 0);
  const fx = [0, 1, 2, 3].map(j => packet(j, x)), fy = [0, 1, 2, 3].map(j => packet(j, y));
  const psi = [0, 0];
  for (let q = 0; q < N; q++) {
    psi[0] += fx[q >> 2] * fy[q & 3] * state[2 * q];
    psi[1] += fx[q >> 2] * fy[q & 3] * state[2 * q + 1];
  }
  return psi;
}
