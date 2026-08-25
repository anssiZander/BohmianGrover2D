const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false });
if (!gl) throw new Error('WebGL2 is required.');
if (!gl.getExtension('EXT_color_buffer_float')) {
  alert('EXT_color_buffer_float is required. Use a current desktop Chrome, Edge, or Firefox.');
  throw new Error('Missing EXT_color_buffer_float');
}
const floatLinear = gl.getExtension('OES_texture_float_linear');

gl.disable(gl.CULL_FACE);
gl.disable(gl.DITHER);

const TAU = Math.PI * 2;
const GRID = 128;
const HBAR = 1.0;
const MASS = 1.0;
const DX = 1 / (GRID - 1);
// The finite-difference box has exact sampled sine eigenvectors but slightly
// shifted eigenvalues.  Calibrate the quarter-beat mixer to that discrete
// spectrum so A, A† and the directly initialized balanced state match.
const DELTA_E = (HBAR * HBAR / (MASS * DX * DX)) *
  (Math.cos(Math.PI / (GRID - 1)) - Math.cos(2 * Math.PI / (GRID - 1)));
const MIX_TIME = Math.PI / (2 * DELTA_E);
const LOGICAL_PHASE_ANGLE = Math.PI;
const PHASE_FRAMES = 90;
const QUADRANT_NAMES = ['00', '01', '10', '11'];
const LN2 = Math.log(2);

const params = {
  target: 3,
  stepsPerFrame: 5,
  dt: 0.00003,
  nParticles: 30000,
  rhoMin: 1e-6,
  velClamp: 35,
  visGain: 0.65,
  visGamma: 0.55,
  showPhase: 1,
  showParticles: 1,
  showPhaseArrows: 1,
  arrowGrid: 16,
  arrowGain: 0.18,
  arrowLength: 0.88,
  arrowThickness: 1.0,
  arrowRhoMin: 0.0008,
  dotSize: 7.5,
  dotSigma: 0.28,
  dotGain: 0.85,
  showTrail: 1,
  trailHalfLife: 0.01,
  trailVisGain: 0.16,
  trailVisGamma: 0.58,
  trailStampGain: 0.28,
};

function getTrailWidth() {
  return params.dotSize * 0.75;
}

const dom = {
  controls: document.getElementById('controls'),
  stats: document.getElementById('stats'),
  stage: document.getElementById('stageStatus'),
  logical: document.getElementById('logical'),
  progress: document.getElementById('progressBar'),
  reset: document.getElementById('reset'),
  pause: document.getElementById('pause'),
  prepare: document.getElementById('prepare'),
  oracle: document.getElementById('oracle'),
  inverse: document.getElementById('inverse'),
  reference: document.getElementById('reference'),
  forward: document.getElementById('forward'),
  next: document.getElementById('next'),
  full: document.getElementById('full'),
  minui: document.getElementById('minui'),
  uibody: document.getElementById('uibody'),
  quadrants: document.getElementById('quadrants'),
  targetSummary: document.getElementById('targetSummary'),
  targetButtons: Array.from(document.querySelectorAll('[data-target]')),
};

const SH = {};
const U = {};
let programs = {};
let wave = {};
let particle = {};
let trails = {};
let paused = false;
let simulationReady = false;
let frameRecordingActive = false;
let stageIndex = 0;
let operationQueue = [];
let activeSegment = null;
let operationFinalStage = 0;
let gateFlash = 0;
let gateQuadrant = 0;
let simTime = 0;
let simSteps = 0;
let frameCount = 0;
let lastDiagnosticsFrame = -999;
let lastDiagnostics = null;
let rhoVisualMax = 20;
const basis = [];
let initialDensityCdf = null;
let initialDensitySum = 0;
const vaoEmpty = gl.createVertexArray();

function fmt(v, digits = 3) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if ((a > 0 && a < 0.001) || a >= 10000) return v.toExponential(2);
  return v.toFixed(digits).replace(/\.?0+$/, '');
}

function compile(type, source, name) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`${name}: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function link(vsSource, fsSource, name, varyings = null) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSource, `${name} vertex`));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSource, `${name} fragment`));
  if (varyings) gl.transformFeedbackVaryings(p, varyings, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${name}: ${gl.getProgramInfoLog(p)}`);
  return p;
}

function uloc(p, name) { return gl.getUniformLocation(p, name); }
async function loadText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${url}: ${r.status}`);
  return r.text();
}

async function loadShaders() {
  const names = [
    'fullscreen.vert', 'wave_rk_stage.frag', 'wave_rk_combine.frag', 'wave_phase_pulse.frag', 'wave_scale.frag',
    'wave_render.frag', 'particle_update.vert', 'particle_update.frag', 'particle_render.vert', 'particle_render.frag',
    'particle_stamp.vert', 'particle_stamp.frag', 'density_step.frag', 'density_render.frag',
    'phase_arrows.vert', 'phase_arrows.frag',
  ];
  await Promise.all(names.map(async n => { SH[n] = await loadText(`./shaders/${n}`); }));
}

function buildPrograms() {
  programs.rkStage = link(SH['fullscreen.vert'], SH['wave_rk_stage.frag'], 'wave RK stage');
  programs.rkCombine = link(SH['fullscreen.vert'], SH['wave_rk_combine.frag'], 'wave RK combine');
  programs.phase = link(SH['fullscreen.vert'], SH['wave_phase_pulse.frag'], 'phase pulse');
  programs.scale = link(SH['fullscreen.vert'], SH['wave_scale.frag'], 'wave scale');
  programs.waveRender = link(SH['fullscreen.vert'], SH['wave_render.frag'], 'wave render');
  programs.particleUpdate = link(SH['particle_update.vert'], SH['particle_update.frag'], 'particle update', ['vState']);
  programs.particleRender = link(SH['particle_render.vert'], SH['particle_render.frag'], 'particle render');
  programs.particleStamp = link(SH['particle_stamp.vert'], SH['particle_stamp.frag'], 'particle stamp');
  programs.densityStep = link(SH['fullscreen.vert'], SH['density_step.frag'], 'trail fade');
  programs.densityRender = link(SH['fullscreen.vert'], SH['density_render.frag'], 'trail render');
  programs.phaseArrows = link(SH['phase_arrows.vert'], SH['phase_arrows.frag'], 'phase-gradient arrows');

  U.rkStage = { base: uloc(programs.rkStage,'uBase'), prev: uloc(programs.rkStage,'uPrevK'), dt: uloc(programs.rkStage,'uDT'), scale: uloc(programs.rkStage,'uScale'), hbar: uloc(programs.rkStage,'uHbar'), mass: uloc(programs.rkStage,'uMass') };
  U.rkCombine = { base: uloc(programs.rkCombine,'uBase'), k1: uloc(programs.rkCombine,'uK1'), k2: uloc(programs.rkCombine,'uK2'), k3: uloc(programs.rkCombine,'uK3'), k4: uloc(programs.rkCombine,'uK4'), dt: uloc(programs.rkCombine,'uDT') };
  U.phase = { wave: uloc(programs.phase,'uWave'), basis: uloc(programs.phase,'uBasis'), coefficient: uloc(programs.phase,'uCoefficient'), angle: uloc(programs.phase,'uAngle'), quadrant: uloc(programs.phase,'uQuadrant') };
  U.scale = { wave: uloc(programs.scale,'uWave'), scale: uloc(programs.scale,'uScale') };
  U.waveRender = { wave: uloc(programs.waveRender,'uWave'), gain: uloc(programs.waveRender,'uVisGain'), gamma: uloc(programs.waveRender,'uVisGamma'), phase: uloc(programs.waveRender,'uShowPhase'), canvas: uloc(programs.waveRender,'uCanvasSize'), target: uloc(programs.waveRender,'uTarget'), flash: uloc(programs.waveRender,'uGateFlash'), gateQ: uloc(programs.waveRender,'uGateQuadrant') };
  U.particleUpdate = { wave: uloc(programs.particleUpdate,'uWave'), dt: uloc(programs.particleUpdate,'uDT'), hbar: uloc(programs.particleUpdate,'uHbar'), mass: uloc(programs.particleUpdate,'uMass'), rhoMin: uloc(programs.particleUpdate,'uRhoMin'), velClamp: uloc(programs.particleUpdate,'uVelClamp'), freeze: uloc(programs.particleUpdate,'uFreeze') };
  U.particleRender = { point: uloc(programs.particleRender,'uPointSize'), n: uloc(programs.particleRender,'uNumParticles'), trail: uloc(programs.particleRender,'uTrailWidth'), canvas: uloc(programs.particleRender,'uCanvasSize'), sigma: uloc(programs.particleRender,'uDotSigma'), gain: uloc(programs.particleRender,'uDotGain') };
  U.particleStamp = { point: uloc(programs.particleStamp,'uPointSize'), n: uloc(programs.particleStamp,'uNumParticles'), trail: uloc(programs.particleStamp,'uTrailWidth'), sigma: uloc(programs.particleStamp,'uDotSigma'), gain: uloc(programs.particleStamp,'uDotGain'), stamp: uloc(programs.particleStamp,'uStampGain') };
  U.densityStep = { prev: uloc(programs.densityStep,'uPrev'), fade: uloc(programs.densityStep,'uFade') };
  U.densityRender = { tex: uloc(programs.densityRender,'uDensity'), gain: uloc(programs.densityRender,'uGain'), gamma: uloc(programs.densityRender,'uGamma'), blend: uloc(programs.densityRender,'uBlendMode'), canvas: uloc(programs.densityRender,'uCanvasSize'), square: uloc(programs.densityRender,'uSquareBox') };
  U.phaseArrows = { wave: uloc(programs.phaseArrows,'uWave'), canvas: uloc(programs.phaseArrows,'uCanvasSize'), grid: uloc(programs.phaseArrows,'uArrowGrid'), gain: uloc(programs.phaseArrows,'uGain'), length: uloc(programs.phaseArrows,'uLengthScale'), thickness: uloc(programs.phaseArrows,'uThicknessScale'), rhoMin: uloc(programs.phaseArrows,'uRhoMin') };
}

function makeTexture(w, h, internal = gl.RGBA32F, filter = gl.NEAREST) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return t;
}
function makeFbo(tex) {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Incomplete framebuffer: ${status}`);
  return f;
}
function bindTexture(unit, tex, loc) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(loc, unit);
}
function drawFullscreen(program, fbo, w = GRID, h = GRID) {
  gl.useProgram(program);
  gl.bindVertexArray(vaoEmpty);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0,0,w,h);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
}

function createWaveTargets() {
  const filter = floatLinear ? gl.LINEAR : gl.NEAREST;
  wave.texA = makeTexture(GRID,GRID,gl.RGBA32F,filter); wave.fboA = makeFbo(wave.texA);
  wave.texB = makeTexture(GRID,GRID,gl.RGBA32F,filter); wave.fboB = makeFbo(wave.texB);
  wave.phaseBaseTex = makeTexture(GRID,GRID,gl.RGBA32F,filter); wave.phaseBaseFbo = makeFbo(wave.phaseBaseTex);
  wave.basisTex = makeTexture(GRID,GRID,gl.RGBA32F,gl.NEAREST);
  wave.kTex = []; wave.kFbo = [];
  for (let i=0;i<4;i++) { const t=makeTexture(GRID,GRID); wave.kTex.push(t); wave.kFbo.push(makeFbo(t)); }
  wave.srcTex = wave.texA; wave.srcFbo = wave.fboA; wave.dstTex = wave.texB; wave.dstFbo = wave.fboB;
}
function swapWave() {
  [wave.srcTex,wave.dstTex] = [wave.dstTex,wave.srcTex];
  [wave.srcFbo,wave.dstFbo] = [wave.dstFbo,wave.srcFbo];
}

function mode1(n, x) { return Math.SQRT2 * Math.sin(n * Math.PI * x); }
function buildBasisAndInitialData() {
  basis.length = 0;
  for (let q=0;q<4;q++) basis.push(new Float64Array(GRID*GRID));
  const data = new Float32Array(GRID*GRID*4);

  // Build the four quadrant-localized logical basis states from the first two
  // hard-box modes in x and y. Reset begins in the physical |00> wavepacket;
  // the visible preparation operation then evolves it numerically into A|00>.
  for (let j=0;j<GRID;j++) {
    const y=j/(GRID-1); const uy1=mode1(1,y), uy2=mode1(2,y);
    const b=(uy1+uy2)/Math.SQRT2, t=(uy1-uy2)/Math.SQRT2;
    for (let i=0;i<GRID;i++) {
      const x=i/(GRID-1); const ux1=mode1(1,x), ux2=mode1(2,x);
      const l=(ux1+ux2)/Math.SQRT2, r=(ux1-ux2)/Math.SQRT2;
      const k=j*GRID+i;
      basis[0][k]=l*b; basis[1][k]=l*t; basis[2][k]=r*b; basis[3][k]=r*t;
    }
  }

  const weight=DX*DX;
  for (let q=0;q<4;q++) {
    let n=0;
    for (let k=0;k<basis[q].length;k++) n += basis[q][k]*basis[q][k]*weight;
    const scale=1/Math.sqrt(n);
    for (let k=0;k<basis[q].length;k++) basis[q][k]*=scale;
  }

  initialDensityCdf = new Float64Array(GRID * GRID);
  initialDensitySum = 0;
  const psi=basis[0];
  for (let k=0;k<psi.length;k++) {
    const re=psi[k];
    data[4*k]=re; data[4*k+1]=0; data[4*k+2]=0; data[4*k+3]=1;
    initialDensitySum += re*re;
    initialDensityCdf[k] = initialDensitySum;
  }
  return data;
}
function uploadInitialWave() {
  const data=buildBasisAndInitialData();
  const basisData=new Float32Array(GRID*GRID*4);
  for(let k=0;k<GRID*GRID;k++){basisData[4*k]=basis[0][k];basisData[4*k+1]=basis[1][k];basisData[4*k+2]=basis[2][k];basisData[4*k+3]=basis[3][k];}
  gl.bindTexture(gl.TEXTURE_2D,wave.basisTex);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,GRID,GRID,gl.RGBA,gl.FLOAT,basisData);
  gl.bindTexture(gl.TEXTURE_2D,wave.texA);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,GRID,GRID,gl.RGBA,gl.FLOAT,data);
  gl.bindTexture(gl.TEXTURE_2D,wave.texB);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,GRID,GRID,gl.RGBA,gl.FLOAT,data);
  gl.bindTexture(gl.TEXTURE_2D,null);
  wave.srcTex=wave.texA; wave.srcFbo=wave.fboA; wave.dstTex=wave.texB; wave.dstFbo=wave.fboB;
}

function runRkStage(outFbo, prevTex, scale, dt) {
  gl.useProgram(programs.rkStage);
  bindTexture(0,wave.srcTex,U.rkStage.base); bindTexture(1,prevTex,U.rkStage.prev);
  gl.uniform1f(U.rkStage.dt,dt); gl.uniform1f(U.rkStage.scale,scale); gl.uniform1f(U.rkStage.hbar,HBAR); gl.uniform1f(U.rkStage.mass,MASS);
  drawFullscreen(programs.rkStage,outFbo);
}
function waveRk4(dt) {
  runRkStage(wave.kFbo[0],wave.srcTex,0,dt);
  runRkStage(wave.kFbo[1],wave.kTex[0],0.5,dt);
  runRkStage(wave.kFbo[2],wave.kTex[1],0.5,dt);
  runRkStage(wave.kFbo[3],wave.kTex[2],1.0,dt);
  gl.useProgram(programs.rkCombine);
  bindTexture(0,wave.srcTex,U.rkCombine.base); bindTexture(1,wave.kTex[0],U.rkCombine.k1); bindTexture(2,wave.kTex[1],U.rkCombine.k2); bindTexture(3,wave.kTex[2],U.rkCombine.k3); bindTexture(4,wave.kTex[3],U.rkCombine.k4);
  gl.uniform1f(U.rkCombine.dt,dt);
  drawFullscreen(programs.rkCombine,wave.dstFbo);
  swapWave();
}
function copyWaveToPhaseBase() {
  gl.useProgram(programs.scale);
  bindTexture(0,wave.srcTex,U.scale.wave);
  gl.uniform1f(U.scale.scale,1.0);
  drawFullscreen(programs.scale,wave.phaseBaseFbo);
}
function logicalOverlap(quadrant, data = null) {
  const w = data || readWaveData();
  const phi = basis[quadrant];
  const weight = DX * DX;
  let re = 0, im = 0;
  for (let k=0;k<phi.length;k++) {
    re += phi[k] * w[4*k] * weight;
    im += phi[k] * w[4*k+1] * weight;
  }
  return {re, im};
}
function renderLogicalPhaseFromBase(angle, quadrant, coefficient) {
  gl.useProgram(programs.phase);
  bindTexture(0,wave.phaseBaseTex,U.phase.wave);
  bindTexture(1,wave.basisTex,U.phase.basis);
  gl.uniform2f(U.phase.coefficient,coefficient.re,coefficient.im);
  gl.uniform1f(U.phase.angle,angle);
  gl.uniform1i(U.phase.quadrant,quadrant);
  drawFullscreen(programs.phase,wave.dstFbo);
  swapWave();
}
function applyLogicalPhase(angle, quadrant) {
  const coefficient = logicalOverlap(quadrant);
  copyWaveToPhaseBase();
  renderLogicalPhaseFromBase(angle,quadrant,coefficient);
}
function scaleWave(scale) {
  gl.useProgram(programs.scale); bindTexture(0,wave.srcTex,U.scale.wave); gl.uniform1f(U.scale.scale,scale);
  drawFullscreen(programs.scale,wave.dstFbo); swapWave();
}
function readWaveData() {
  const data=new Float32Array(GRID*GRID*4);
  gl.bindFramebuffer(gl.FRAMEBUFFER,wave.srcFbo);
  gl.readPixels(0,0,GRID,GRID,gl.RGBA,gl.FLOAT,data);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return data;
}
function normalizeWave() {
  const data=readWaveData(); let norm=0; for(let k=0;k<GRID*GRID;k++){const re=data[4*k],im=data[4*k+1];norm+=(re*re+im*im)*DX*DX;}
  if (norm>1e-12 && Math.abs(norm-1)>1e-5) scaleWave(1/Math.sqrt(norm));
  return norm;
}

function createParticleBuffers() {
  particle.src=gl.createBuffer(); particle.dst=gl.createBuffer(); particle.vao=gl.createVertexArray(); particle.tf=gl.createTransformFeedback();
  bindParticleSource();
}
function bindParticleSource() {
  if(!particle.vao||!particle.src)return;
  gl.bindVertexArray(particle.vao); gl.bindBuffer(gl.ARRAY_BUFFER,particle.src); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,4,gl.FLOAT,false,16,0); gl.bindVertexArray(null);
}
function sampleInitialParticles(count) {
  if (!initialDensityCdf || initialDensitySum <= 0) throw new Error('Initial density was not built.');
  const out=new Float32Array(count*4);
  for(let n=0;n<count;n++){
    const r=Math.random()*initialDensitySum; let lo=0,hi=initialDensityCdf.length-1;
    while(lo<hi){const m=(lo+hi)>>1;if(initialDensityCdf[m]<r)lo=m+1;else hi=m;}
    const j=Math.floor(lo/GRID),i=lo-j*GRID;
    const x=Math.min(1-1e-4,Math.max(1e-4,(i+(Math.random()-.5))/(GRID-1)));
    const y=Math.min(1-1e-4,Math.max(1e-4,(j+(Math.random()-.5))/(GRID-1)));
    out[4*n]=x;out[4*n+1]=y;out[4*n+2]=1;out[4*n+3]=Math.random();
  }
  return out;
}
function rebuildParticles() {
  particle.count=Math.max(100,Math.floor(params.nParticles));
  const data=sampleInitialParticles(particle.count);
  gl.bindBuffer(gl.ARRAY_BUFFER,particle.src); gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,particle.dst); gl.bufferData(gl.ARRAY_BUFFER,data.byteLength,gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,null); bindParticleSource(); clearTrails();
}
function particleStep(dt, freeze=false) {
  if(!particle.count)return;
  gl.useProgram(programs.particleUpdate); bindTexture(0,wave.srcTex,U.particleUpdate.wave);
  gl.uniform1f(U.particleUpdate.dt,dt);gl.uniform1f(U.particleUpdate.hbar,HBAR);gl.uniform1f(U.particleUpdate.mass,MASS);gl.uniform1f(U.particleUpdate.rhoMin,params.rhoMin);gl.uniform1f(U.particleUpdate.velClamp,params.velClamp);gl.uniform1i(U.particleUpdate.freeze,freeze?1:0);
  gl.bindVertexArray(particle.vao);gl.enable(gl.RASTERIZER_DISCARD);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,particle.tf);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,particle.dst);
  gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,particle.count);gl.endTransformFeedback();
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);gl.disable(gl.RASTERIZER_DISCARD);gl.bindVertexArray(null);
  [particle.src,particle.dst]=[particle.dst,particle.src];bindParticleSource();
}
function readParticles() {
  const data=new Float32Array(particle.count*4);gl.bindBuffer(gl.ARRAY_BUFFER,particle.src);gl.getBufferSubData(gl.ARRAY_BUFFER,0,data);gl.bindBuffer(gl.ARRAY_BUFFER,null);return data;
}

function deleteTrails(){for(const k of ['texA','texB'])if(trails[k])gl.deleteTexture(trails[k]);for(const k of ['fboA','fboB'])if(trails[k])gl.deleteFramebuffer(trails[k]);}
function createTrails(){deleteTrails();const res=Math.max(256,Math.min(1024,Math.min(canvas.width,canvas.height)));trails.w=res;trails.h=res;trails.texA=makeTexture(trails.w,trails.h,gl.RGBA16F,gl.NEAREST);trails.texB=makeTexture(trails.w,trails.h,gl.RGBA16F,gl.NEAREST);trails.fboA=makeFbo(trails.texA);trails.fboB=makeFbo(trails.texB);trails.flip=0;clearTrails();}
function clearTrails(){if(!trails.fboA)return;for(const f of [trails.fboA,trails.fboB]){gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.viewport(0,0,trails.w,trails.h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}gl.bindFramebuffer(gl.FRAMEBUFFER,null);trails.flip=0;}
function trailStep(dtTotal){if(!params.showTrail||!trails.fboA||!particle.count)return;const src=trails.flip?trails.texB:trails.texA;const dst=trails.flip?trails.fboA:trails.fboB;const fade=Math.exp(-LN2*dtTotal/Math.max(params.trailHalfLife,1e-6));
  gl.useProgram(programs.densityStep);gl.bindFramebuffer(gl.FRAMEBUFFER,dst);gl.viewport(0,0,trails.w,trails.h);bindTexture(0,src,U.densityStep.prev);gl.uniform1f(U.densityStep.fade,fade);gl.disable(gl.BLEND);gl.bindVertexArray(vaoEmpty);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.colorMask(true,false,false,false);gl.useProgram(programs.particleStamp);gl.bindVertexArray(particle.vao);gl.uniform1f(U.particleStamp.point,params.dotSize);gl.uniform1i(U.particleStamp.n,particle.count);gl.uniform1f(U.particleStamp.trail,getTrailWidth());gl.uniform1f(U.particleStamp.sigma,params.dotSigma);gl.uniform1f(U.particleStamp.gain,params.dotGain);gl.uniform1f(U.particleStamp.stamp,params.trailStampGain);gl.drawArrays(gl.POINTS,0,particle.count);
  gl.colorMask(true,true,true,true);gl.disable(gl.BLEND);gl.bindVertexArray(null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);trails.flip=1-trails.flip;
}

function resizeCanvas(){const dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));const w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;createTrails();layoutQuadrants();return true;}return false;}
function layoutQuadrants(){const side=Math.min(canvas.clientWidth,canvas.clientHeight);dom.quadrants.style.width=`${side}px`;dom.quadrants.style.height=`${side}px`;dom.quadrants.style.left=`${(canvas.clientWidth-side)/2}px`;dom.quadrants.style.top=`${(canvas.clientHeight-side)/2}px`;dom.quadrants.style.display='block';}

function bindCommonParticleRender(Ux){gl.uniform1f(Ux.point,params.dotSize);if(Ux.n)gl.uniform1i(Ux.n,particle.count);if(Ux.trail)gl.uniform1f(Ux.trail,0);if(Ux.canvas)gl.uniform2f(Ux.canvas,canvas.width,canvas.height);gl.uniform1f(Ux.sigma,params.dotSigma);gl.uniform1f(Ux.gain,params.dotGain);}
function renderPhaseArrows(){
  if(!params.showPhaseArrows)return;
  const n=Math.max(4,Math.floor(params.arrowGrid));
  gl.useProgram(programs.phaseArrows);
  bindTexture(0,wave.srcTex,U.phaseArrows.wave);
  gl.uniform2f(U.phaseArrows.canvas,canvas.width,canvas.height);
  gl.uniform1i(U.phaseArrows.grid,n);
  gl.uniform1f(U.phaseArrows.gain,params.arrowGain);
  gl.uniform1f(U.phaseArrows.length,params.arrowLength);
  gl.uniform1f(U.phaseArrows.rhoMin,params.arrowRhoMin);
  gl.uniform1f(U.phaseArrows.thickness,params.arrowThickness);
  gl.bindVertexArray(vaoEmpty);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArraysInstanced(gl.TRIANGLES,0,6,n*n);
  gl.disable(gl.BLEND);
}
function renderTopDown(){const trailTex=trails.flip?trails.texB:trails.texA;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(programs.waveRender);bindTexture(0,wave.srcTex,U.waveRender.wave);gl.uniform1f(U.waveRender.gain,params.visGain);gl.uniform1f(U.waveRender.gamma,params.visGamma);gl.uniform1i(U.waveRender.phase,params.showPhase);gl.uniform2f(U.waveRender.canvas,canvas.width,canvas.height);gl.uniform1i(U.waveRender.target,params.target);gl.uniform1f(U.waveRender.flash,gateFlash);gl.uniform1i(U.waveRender.gateQ,gateQuadrant);gl.bindVertexArray(vaoEmpty);gl.drawArrays(gl.TRIANGLES,0,3);
  if(params.showTrail&&trailTex){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_COLOR);gl.useProgram(programs.densityRender);bindTexture(0,trailTex,U.densityRender.tex);gl.uniform1f(U.densityRender.gain,params.trailVisGain);gl.uniform1f(U.densityRender.gamma,params.trailVisGamma);gl.uniform1i(U.densityRender.blend,1);gl.uniform2f(U.densityRender.canvas,canvas.width,canvas.height);gl.uniform1i(U.densityRender.square,1);gl.bindVertexArray(vaoEmpty);gl.drawArrays(gl.TRIANGLES,0,3);gl.disable(gl.BLEND);}
  if(params.showParticles){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(programs.particleRender);gl.bindVertexArray(particle.vao);bindCommonParticleRender(U.particleRender);gl.drawArrays(gl.POINTS,0,particle.count);gl.disable(gl.BLEND);gl.bindVertexArray(null);}
  renderPhaseArrows();
}
function render(){renderTopDown();}

function freeStep(dt){particleStep(dt,false);waveRk4(dt);simTime+=dt;simSteps++;}
function segmentLabel(seg){return seg?.label||'Idle';}
function startOperation(segments,finalStage){if(activeSegment||operationQueue.length)return;operationQueue=segments.map(s=>({...s,elapsed:0,frame:0}));operationFinalStage=finalStage;activeSegment=operationQueue.shift()||null;gateFlash=0;syncButtons();updateStageStatus();}
function finishSegment(){normalizeWave();activeSegment=operationQueue.shift()||null;if(!activeSegment){stageIndex=operationFinalStage;gateFlash=0;updateDiagnostics(true);syncButtons();}updateStageStatus();}
function advanceOperation(){if(!activeSegment||paused)return 0;let advanced=0;
  if(activeSegment.type==='free'){
    const maxSteps=Math.max(1,Math.floor(params.stepsPerFrame));
    for(let i=0;i<maxSteps&&activeSegment.elapsed<activeSegment.duration-1e-12;i++){
      const dt=Math.min(params.dt,activeSegment.duration-activeSegment.elapsed);freeStep(dt);activeSegment.elapsed+=dt;advanced+=dt;
    }
    gateFlash=0;
    if(activeSegment.elapsed>=activeSegment.duration-1e-10)finishSegment();
  }else if(activeSegment.type==='phase'){
    if(!activeSegment.prepared){activeSegment.coefficient=logicalOverlap(activeSegment.quadrant);copyWaveToPhaseBase();activeSegment.prepared=true;}
    const remaining=activeSegment.frames-activeSegment.frame;
    activeSegment.frame++;
    activeSegment.elapsed=activeSegment.frame/activeSegment.frames;
    renderLogicalPhaseFromBase(activeSegment.angle*activeSegment.elapsed,activeSegment.quadrant,activeSegment.coefficient);
    gateQuadrant=activeSegment.quadrant;gateFlash=Math.sin(Math.PI*Math.min(1,activeSegment.elapsed));
    if(remaining<=1)finishSegment();
  }
  updateProgress();return advanced;
}
function opPrepare(){
  if(stageIndex!==0||activeSegment)return;
  startOperation([{type:'free',duration:MIX_TIME,label:'1. Preparation mixer A'}],1);
}
function opOracle(){
  if(stageIndex!==1||activeSegment)return;
  startOperation([{type:'phase',frames:PHASE_FRAMES,angle:LOGICAL_PHASE_ANGLE,quadrant:params.target,label:`2. Oracle: phase mark |${QUADRANT_NAMES[params.target]}⟩`}],2);
}
function opInverse(){
  if(stageIndex!==2||activeSegment)return;
  startOperation([{type:'free',duration:3*MIX_TIME,label:'3a. Diffuser: inverse mixer A†'}],3);
}
function opReference(){
  if(stageIndex!==3||activeSegment)return;
  startOperation([{type:'phase',frames:PHASE_FRAMES,angle:LOGICAL_PHASE_ANGLE,quadrant:0,label:'3b. Diffuser: reference phase on |00⟩'}],4);
}
function opForward(){
  if(stageIndex!==4||activeSegment)return;
  startOperation([{type:'free',duration:MIX_TIME,label:'3c. Diffuser: forward mixer A'}],5);
}
function opNext(){
  if(stageIndex===0)opPrepare();
  else if(stageIndex===1)opOracle();
  else if(stageIndex===2)opInverse();
  else if(stageIndex===3)opReference();
  else if(stageIndex===4)opForward();
}
function opFull(){
  if(activeSegment)return;
  resetSimulation(false);
  startOperation([
    {type:'free',duration:MIX_TIME,label:'1. Preparation mixer A'},
    {type:'phase',frames:PHASE_FRAMES,angle:LOGICAL_PHASE_ANGLE,quadrant:params.target,label:`2. Oracle: phase mark |${QUADRANT_NAMES[params.target]}⟩`},
    {type:'free',duration:3*MIX_TIME,label:'3a. Diffuser: inverse mixer A†'},
    {type:'phase',frames:PHASE_FRAMES,angle:LOGICAL_PHASE_ANGLE,quadrant:0,label:'3b. Diffuser: reference phase on |00⟩'},
    {type:'free',duration:MIX_TIME,label:'3c. Diffuser: forward mixer A'}
  ],5);
}
function updateProgress(){let p=0;if(activeSegment){p=activeSegment.type==='free'?activeSegment.elapsed/activeSegment.duration:activeSegment.frame/activeSegment.frames;}dom.progress.style.width=`${100*Math.max(0,Math.min(1,p))}%`;}
function targetLocation(q){return ['lower-left','upper-left','lower-right','upper-right'][q]||'';}
function syncTargetUi(){
  dom.targetButtons.forEach(button=>{const q=Number(button.dataset.target);const selected=q===params.target;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  dom.targetSummary.innerHTML=`<b>Marked state</b>: |${QUADRANT_NAMES[params.target]}⟩ — ${targetLocation(params.target)} quadrant`;
  dom.oracle.textContent=`2. Oracle: mark |${QUADRANT_NAMES[params.target]}⟩`;
}
function chooseTarget(q){
  q=Math.max(0,Math.min(3,q|0));
  if(activeSegment||q===params.target)return;
  params.target=q;
  resetSimulation();
}
function syncButtons(){const busy=!!activeSegment;dom.prepare.disabled=busy||stageIndex!==0;dom.oracle.disabled=busy||stageIndex!==1;dom.inverse.disabled=busy||stageIndex!==2;dom.reference.disabled=busy||stageIndex!==3;dom.forward.disabled=busy||stageIndex!==4;dom.next.disabled=busy||stageIndex>=5;dom.full.disabled=busy;dom.targetButtons.forEach(button=>button.disabled=busy);syncTargetUi();}
function updateStageStatus(){const stageNames=['Initialized in |00⟩','Preparation mixer complete','Oracle complete: target phase marked','Inverse mixer complete','Reference phase complete','Grover amplification complete'];const active=activeSegment?`<b>Operation</b>: ${segmentLabel(activeSegment)}`:`<b>Stage</b>: ${stageNames[stageIndex]}`;const checkpoint=activeSegment?'':'<br><b>Between operations</b>: state held fixed';dom.stage.innerHTML=`${active}${checkpoint}<br><b>Target</b>: |${QUADRANT_NAMES[params.target]}⟩ &nbsp; <b>Mixer quarter-beat</b>: ${fmt(MIX_TIME,4)}`;}

function diagnostics() {
  const w=readWaveData();const weight=DX*DX;let norm=0,maxRho=0;const amp=Array.from({length:4},()=>({re:0,im:0,p:0,phase:0}));const qp=[0,0,0,0];
  for(let j=0;j<GRID;j++)for(let i=0;i<GRID;i++){const k=j*GRID+i,re=w[4*k],im=w[4*k+1],rho=re*re+im*im;norm+=rho*weight;maxRho=Math.max(maxRho,rho);const q=(i>=(GRID-1)/2?2:0)+(j>=(GRID-1)/2?1:0);qp[q]+=rho*weight;for(let s=0;s<4;s++){amp[s].re+=basis[s][k]*re*weight;amp[s].im+=basis[s][k]*im*weight;}}
  for(const a of amp){a.p=a.re*a.re+a.im*a.im;a.phase=Math.atan2(a.im,a.re);}let logicalSum=amp.reduce((s,a)=>s+a.p,0);
  const pp=[0,0,0,0];const pdata=readParticles();for(let n=0;n<particle.count;n++){const x=pdata[4*n],y=pdata[4*n+1];const q=(x>=.5?2:0)+(y>=.5?1:0);pp[q]++;}for(let q=0;q<4;q++)pp[q]/=Math.max(1,particle.count);
  rhoVisualMax=Math.max(1,maxRho*1.05);return{norm,amp,qp,pp,logicalSum,maxRho,targetFidelity:amp[params.target].p};
}
function updateDiagnostics(force=false){if(!force&&frameCount-lastDiagnosticsFrame<45)return;lastDiagnosticsFrame=frameCount;lastDiagnostics=diagnostics();const d=lastDiagnostics;dom.logical.innerHTML=d.amp.map((a,q)=>`<div class="logicalCell"><div class="logicalTop"><b>|${QUADRANT_NAMES[q]}⟩</b><span>${(100*a.p).toFixed(1)}%</span></div><div class="bar"><i style="width:${Math.min(100,100*a.p)}%"></i></div><div class="phase">phase ${fmt(a.phase/Math.PI,2)}π · particles ${(100*d.pp[q]).toFixed(1)}%</div></div>`).join('');dom.stats.innerHTML=`<b>Wave norm</b>: ${fmt(d.norm,5)} &nbsp; <b>logical weight</b>: ${(100*d.logicalSum).toFixed(1)}%<br><b>Target fidelity</b>: ${(100*d.targetFidelity).toFixed(1)}% &nbsp; <b>target-region particles</b>: ${(100*d.pp[params.target]).toFixed(1)}%<br><b>Simulation time</b>: ${fmt(simTime,4)} &nbsp; <b>Grid</b>: ${GRID}² RK4 GPU<br><b>Particles</b>: ${particle.count.toLocaleString()}`;}

function resetSimulation(update=true){operationQueue=[];activeSegment=null;stageIndex=0;simTime=0;simSteps=0;gateFlash=0;uploadInitialWave();rebuildParticles();normalizeWave();updateProgress();syncButtons();updateStageStatus();if(update)updateDiagnostics(true);}

function addSection(text){const e=document.createElement('div');e.className='section';e.textContent=text;dom.controls.appendChild(e);}
function addSlider(key,label,min,max,step,onChange=null){const row=document.createElement('div');row.className='row';const lab=document.createElement('label');lab.textContent=label;const inp=document.createElement('input');inp.type='range';inp.min=min;inp.max=max;inp.step=step;inp.value=params[key];const val=document.createElement('div');val.className='val';val.textContent=fmt(params[key]);inp.addEventListener('input',()=>{params[key]=parseFloat(inp.value);val.textContent=fmt(params[key]);});inp.addEventListener('change',()=>{onChange?.();updateDiagnostics(true);});row.append(lab,inp,val);dom.controls.appendChild(row);}
function addToggle(key,label,onChange=null){const row=document.createElement('div');row.className='row';const lab=document.createElement('label');lab.textContent=label;const b=document.createElement('button');b.style.flex='1';const sync=()=>b.textContent=params[key]?'ON':'OFF';sync();b.addEventListener('click',()=>{params[key]=params[key]?0:1;sync();onChange?.();});row.append(lab,b,document.createElement('div'));row.lastChild.className='val';dom.controls.appendChild(row);}
function addSegment(key,label,values,onChange=null){const row=document.createElement('div');row.className='row';const lab=document.createElement('label');lab.textContent=label;const seg=document.createElement('div');seg.className='seg';const bs=values.map((v,i)=>{const b=document.createElement('button');b.textContent=v;b.addEventListener('click',()=>{params[key]=i;sync();onChange?.();});seg.appendChild(b);return b;});const sync=()=>bs.forEach((b,i)=>b.classList.toggle('selected',i===params[key]));sync();row.append(lab,seg,document.createElement('div'));row.lastChild.className='val';dom.controls.appendChild(row);}
function buildUi(){addSection('Visualization');
  addToggle('showPhase','show phase');
  addToggle('showPhaseArrows','phase-gradient arrows');
  addSlider('arrowGrid','arrow grid',8,40,1);
  //addSlider('arrowGain','arrow sensitivity',.01,.35,.005);
  //addSlider('arrowLength','arrow length',.25,1.15,.05);
  //addSlider('arrowThickness','arrow thickness',.45,2.2,.05);
  addToggle('showParticles','show particles');
  addToggle('showTrail','draw trails',clearTrails);
  //addSlider('visGain','density gain',.1,3,.05);
  //addSlider('visGamma','density gamma',.25,1.4,.05);
  addSlider('dotSize','particle size',2,14,.5);
  addSlider('nParticles','particle count',1000,250000,1000,rebuildParticles);
  //addSlider('trailHalfLife','trail half-life',.005,.12,.005);
  //addSection('Numerics');addSlider('stepsPerFrame','steps / frame',4,80,1);
  //addSlider('dt','RK4 dt',.00001,.00004,.000001);
  //addSlider('velClamp','velocity clamp',5,80,1);
  }

function installEvents(){
  dom.reset.addEventListener('click',()=>resetSimulation());
  dom.pause.addEventListener('click',()=>{paused=!paused;dom.pause.textContent=paused?'Resume':'Pause';});
  dom.prepare.addEventListener('click',opPrepare);dom.oracle.addEventListener('click',opOracle);dom.inverse.addEventListener('click',opInverse);dom.reference.addEventListener('click',opReference);dom.forward.addEventListener('click',opForward);dom.next.addEventListener('click',opNext);dom.full.addEventListener('click',opFull);
  dom.targetButtons.forEach(button=>button.addEventListener('click',()=>chooseTarget(Number(button.dataset.target))));
  dom.minui.addEventListener('click',()=>{dom.uibody.hidden=!dom.uibody.hidden;dom.minui.textContent=dom.uibody.hidden?'+':'v';});
  window.addEventListener('keydown',e=>{if(e.key==='r'||e.key==='R')resetSimulation();if(e.code==='Space'){e.preventDefault();dom.pause.click();}});
  window.addEventListener('resize',resizeCanvas);
}

function drawFrame(advance=true){resizeCanvas();let advanced=0;if(advance&&!paused&&activeSegment)advanced=advanceOperation();if(advanced>0)trailStep(advanced);render();updateDiagnostics(false);updateStageStatus();frameCount++;}

window.BohmianGrover2D={
  beginFrameRecording(){frameRecordingActive=true;},endFrameRecording(){frameRecordingActive=false;},isReady(){return simulationReady;},renderRecordingFrame(){if(simulationReady)drawFrame(true);},
  state(){return{stageIndex,simTime,simSteps,target:params.target,busy:!!activeSegment,diagnostics:lastDiagnostics};},
  reset(){resetSimulation();render();return this.state();},
  runFull(){opFull();return this.state();},
  advanceFrames(n=1){for(let i=0;i<n;i++)drawFrame(true);return this.state();},
  setParams(next, doReset=false){Object.assign(params,next||{});if(doReset)resetSimulation();else{syncTargetUi();updateStageStatus();}return this.state();},
  setTarget(q){chooseTarget(q);return this.state();},
  debugFreeSteps(n=1,dt=params.dt){for(let i=0;i<Math.max(0,Math.floor(n));i++)freeStep(dt);updateDiagnostics(true);return this.state();},
  debugPhase(angle=LOGICAL_PHASE_ANGLE,quadrant=params.target){applyLogicalPhase(angle,quadrant);normalizeWave();updateDiagnostics(true);return this.state();},
  diagnostics(){updateDiagnostics(true);return lastDiagnostics;},
};

async function main(){await loadShaders();buildPrograms();createWaveTargets();createParticleBuffers();buildUi();installEvents();resizeCanvas();resetSimulation();simulationReady=true;requestAnimationFrame(function loop(){if(!frameRecordingActive)drawFrame(true);requestAnimationFrame(loop);});}
main().catch(err=>{console.error(err);alert(String(err));});
