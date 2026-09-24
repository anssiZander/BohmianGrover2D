import { STATE_COUNT, hadamard, sineCoefficients, PACKET_TRANSFORM } from './multiregion-core.js';

// Products of our four sine modes contain only cosine frequencies 0..8.
// Solve the Neumann Poisson equation spectrally, with zero constant potential.
// This selects the curl-free current; the wave evolution is not modified.
export const FLOW_MODES = 9;

function crossDensity(a, b) {
  const re = new Float64Array(81), im = new Float64Array(81);
  for (let q = 0; q < 16; q++) for (let r = 0; r < 16; r++) {
    const real = a[2*q]*b[2*r] + a[2*q+1]*b[2*r+1];
    const imag = a[2*q]*b[2*r+1] - a[2*q+1]*b[2*r];
    const nx = [Math.abs((q >> 2) - (r >> 2)), (q >> 2) + (r >> 2) + 2];
    const ny = [Math.abs((q & 3) - (r & 3)), (q & 3) + (r & 3) + 2];
    // u_n u_m = cos((n-m) pi x) - cos((n+m) pi x).
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
      const sign = x === y ? 1 : -1, k = 9*nx[x]+ny[y];
      re[k] += sign*real; im[k] += sign*imag;
    }
  }
  return { re, im };
}

export function gateFlow(start, kind, target, duration) {
  const fixed = Float64Array.from(start), rotating = new Float64Array(2*STATE_COUNT);
  if (kind === 'oracle' || kind === 'reference') {
    const q = kind === 'oracle' ? target : 0;
    rotating[2*q] = fixed[2*q]; rotating[2*q+1] = fixed[2*q+1];
    fixed[2*q] = 0; fixed[2*q+1] = 0;
  } else {
    const transformed = hadamard(start);
    for (let k = 0; k < fixed.length; k++) {
      fixed[k] = .5*(start[k]+transformed[k]);
      rotating[k] = .5*(start[k]-transformed[k]);
    }
  }
  const f = sineCoefficients(fixed), g = sineCoefficients(rotating);
  const cross = crossDensity(f,g), dc = cross.re.map(v => 2*v), ds = cross.im.map(v => 2*v);
  // fixed and rotating are orthogonal projector components. Their exact cross
  // integral is zero; discard only floating-point roundoff of this zero mode.
  dc[0] = 0; ds[0] = 0;
  const potential = new Float32Array(162);
  for (let n = 0; n < 9; n++) for (let m = 0; m < 9; m++) {
    const k = 9*n+m, lambda = Math.PI**2*(n*n+m*m);
    if (lambda) { potential[2*k] = dc[k]/lambda; potential[2*k+1] = ds[k]/lambda; }
  }
  return { f, g, dc, ds, potential, direction: kind === 'inverse' ? -1 : 1, duration };
}

export function flowAt(flow, x, y, progress) {
  const cx = [], cy = [], sx = [], sy = [];
  for (let n = 0; n < 9; n++) {
    cx.push(Math.cos(n*Math.PI*x)); cy.push(Math.cos(n*Math.PI*y));
    sx.push(Math.sin(n*Math.PI*x)); sy.push(Math.sin(n*Math.PI*y));
  }
  const angle = flow.direction*Math.PI*progress, c = Math.cos(angle), s = Math.sin(angle);
  const rate = flow.direction*Math.PI/flow.duration;
  let drho = 0, jx = 0, jy = 0, divergence = 0, fr = 0, fi = 0, gr = 0, gi = 0;
  for (let n = 0; n < 4; n++) for (let m = 0; m < 4; m++) {
    const k = 2*(4*n+m), weight = 2*sx[n+1]*sy[m+1];
    fr += weight*flow.f[k]; fi += weight*flow.f[k+1];
    gr += weight*flow.g[k]; gi += weight*flow.g[k+1];
  }
  const re = fr+c*gr+s*gi, im = fi+c*gi-s*gr;
  for (let n = 0; n < 9; n++) for (let m = 0; m < 9; m++) {
    const k = 9*n+m, source = rate*(-s*flow.dc[k]+c*flow.ds[k]);
    drho += source*cx[n]*cy[m];
    if (!n && !m) continue;
    const chi = source/(Math.PI**2*(n*n+m*m));
    jx -= n*Math.PI*chi*sx[n]*cy[m]; jy -= m*Math.PI*chi*cx[n]*sy[m];
    divergence -= source*cx[n]*cy[m];
  }
  return { rho: re*re+im*im, drho, current: [jx,jy], divergence };
}

// Inverse CDF of the initial 1D packet. Stratification and a deterministic
// shuffle avoid an artificial spatial lattice without resampling during gates.
function initialCdf(x) {
  let sum = 0;
  for (let n = 1; n <= 4; n++) for (let m = 1; m <= 4; m++) {
    const integral = n === m ? x-Math.sin(2*n*Math.PI*x)/(2*n*Math.PI)
      : Math.sin((n-m)*Math.PI*x)/((n-m)*Math.PI)-Math.sin((n+m)*Math.PI*x)/((n+m)*Math.PI);
    sum += PACKET_TRANSFORM[0][n-1]*PACKET_TRANSFORM[0][m-1]*integral;
  }
  return sum;
}
export function sampleInitialParticles(count, seed = 73991) {
  let randomState = seed >>> 0;
  const random = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0)/4294967296; };
  const quantiles = new Float32Array(count), order = Uint32Array.from({length:count},(_,i)=>i);
  for (let i = 0; i < count; i++) {
    const u = (i+.15+.7*random())/count;
    let lo = 0, hi = 1;
    for (let k = 0; k < 34; k++) { const mid = .5*(lo+hi); if (initialCdf(mid) < u) lo = mid; else hi = mid; }
    quantiles[i] = .5*(lo+hi);
  }
  for (let i = count-1; i > 0; i--) { const j = Math.floor(random()*(i+1)); [order[i],order[j]] = [order[j],order[i]]; }
  const states = new Float32Array(4*count);
  for (let i = 0; i < count; i++) { states[4*i] = quantiles[i]; states[4*i+1] = quantiles[order[i]]; }
  return states;
}
