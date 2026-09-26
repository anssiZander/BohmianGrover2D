// Independent 32 x 32 complex Hamiltonian, exponentiated by scaled Taylor
// series and squaring. This imports no production propagator or basis data.
const N=32;
const weight=(j,n)=>(n===4?.5:Math.SQRT1_2)*Math.sin((j+.5)*n*Math.PI/4);
export function generator(kind,target) {
  return Array.from({length:N},(_,row)=>Float64Array.from({length:2*N},(_,index)=>{
    const col=index>>1,imag=index&1;
    if(kind==='oracle'||kind==='reference')
      return !imag&&row===col&&row===(kind==='oracle'?target:0)?Math.PI:0;
    const qr=row>>1,qc=col>>1;
    if(imag) return qr===qc&&(row&1)!==(col&1)?(row&1?1:-1)*(kind==='inverse'?-1:1)*Math.PI/4:0;
    if((row&1)!==(col&1))return 0;
    let kinetic=0;
    for(let n=1;n<=4;n++){
      if((qr&3)===(qc&3))kinetic+=n*n*weight(qr>>2,n)*weight(qc>>2,n);
      if((qr>>2)===(qc>>2))kinetic+=n*n*weight(qr&3,n)*weight(qc&3,n);
    }
    return (kind==='inverse'?7:1)*Math.PI*kinetic/4;
  }));
}
export function derivative(state,matrix) {
  const out=new Float64Array(2*N);
  for(let i=0;i<N;i++)for(let j=0;j<N;j++){
    const re=matrix[i][2*j],im=matrix[i][2*j+1];
    out[2*i]+=re*state[2*j+1]+im*state[2*j];
    out[2*i+1]+=-re*state[2*j]+im*state[2*j+1];
  }return out;
}
const cache=new Map();
function square(a) {
  const out=new Float64Array(2*N*N);
  for(let i=0;i<N;i++)for(let k=0;k<N;k++)for(let j=0;j<N;j++){
    const x=2*(i*N+k),y=2*(k*N+j),z=2*(i*N+j);
    out[z]+=a[x]*a[y]-a[x+1]*a[y+1];out[z+1]+=a[x]*a[y+1]+a[x+1]*a[y];
  }return out;
}
export function referenceStep(state,kind,p,target) {
  if(kind==='oracle'||kind==='reference'){
    const out=Float64Array.from(state),q=kind==='oracle'?target:0,c=Math.cos(Math.PI*p),s=Math.sin(Math.PI*p);
    out[2*q]=c*state[2*q]+s*state[2*q+1];out[2*q+1]=c*state[2*q+1]-s*state[2*q];return out;
  }
  const key=kind+'/'+p;
  let propagator=cache.get(key);
  if(!propagator){
    const matrix=generator(kind,target),norm=Math.max(...matrix.map(row=>row.reduce((s,v)=>s+Math.abs(v*p),0)));
    const scaling=Math.max(0,Math.ceil(Math.log2(Math.max(norm,.5)/.5))),h=p/2**scaling;
    propagator=new Float64Array(2*N*N);let term=new Float64Array(2*N*N);
    for(let i=0;i<N;i++)propagator[2*(i*N+i)]=term[2*(i*N+i)]=1;
    for(let order=1;order<=32;order++){
      const next=new Float64Array(2*N*N);
      for(let i=0;i<N;i++)for(let k=0;k<N;k++)for(let j=0;j<N;j++){
        const a=2*(k*N+j),b=2*(i*N+j),re=matrix[i][2*k]*h/order,im=matrix[i][2*k+1]*h/order;
        next[b]+=re*term[a+1]+im*term[a];next[b+1]+=-re*term[a]+im*term[a+1];
      }
      next.forEach((v,i)=>propagator[i]+=v);term=next;
      if(Math.max(...term.map(Math.abs))<1e-18)break;
    }
    for(let i=0;i<scaling;i++)propagator=square(propagator);
    cache.set(key,propagator);
  }
  const out=new Float64Array(2*N);
  for(let i=0;i<N;i++)for(let j=0;j<N;j++){
    const k=2*(i*N+j);out[2*i]+=propagator[k]*state[2*j]-propagator[k+1]*state[2*j+1];
    out[2*i+1]+=propagator[k]*state[2*j+1]+propagator[k+1]*state[2*j];
  }return out;
}
export function referenceWave(state,x,y) {
  const packet=(j,z)=>Array.from({length:4},(_,k)=>Math.sqrt(2)*weight(j,k+1)*Math.sin((k+1)*Math.PI*z)).reduce((a,b)=>a+b,0);
  const fx=[0,1,2,3].map(j=>packet(j,x)),fy=[0,1,2,3].map(j=>packet(j,y)),psi=[0,0,0,0];
  for(let q=0;q<16;q++)for(let k=0;k<4;k++)psi[k]+=fx[q>>2]*fy[q&3]*state[4*q+k];
  return psi;
}
