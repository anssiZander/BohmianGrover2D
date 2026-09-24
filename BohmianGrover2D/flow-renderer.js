import { gateFlow, sampleInitialParticles } from './probability-flow.js';

export class FlowRenderer {
  constructor(gl, grid, loadShader, createProgram) {
    Object.assign(this,{gl,grid,loadShader,createProgram});
    this.count=4000;this.index=0;this.trailIndex=0;this.gate=null;this.newGate=false;
    this.trailSize=1024;this.elapsed=0;this.statsTime=-Infinity;
  }
  async init(vertex) {
    const loadShader=this.loadShader;
    const [basis,shared,update,empty,points,dots,arrows,arrowFragment,trail,trailFragment,composite]=await Promise.all([
      loadShader('flow_basis.frag'),loadShader('flow_sample.glsl'),loadShader('flow_particle_update.vert'),
      loadShader('particle_update.frag'),loadShader('flow_particles.vert'),loadShader('particle_render.frag'),
      loadShader('flow_arrows.vert'),loadShader('phase_arrows.frag'),loadShader('flow_trail.vert'),
      loadShader('flow_trail.frag'),loadShader('flow_trail_composite.frag'),
    ]);
    const program=this.createProgram;
    this.basis=program(vertex,basis,['uFixed[0]','uRotating[0]','uPotential[0]','uGridSize']);
    this.update=program(update.replace('// FLOW_SAMPLE',shared),empty,
      ['uWaveParts','uCurrentParts','uDirection','uEnd','uNewGate'],['nextState']);
    this.points=program(points,dots,['uPointSize','uDotSigma','uDotGain']);
    this.arrows=program(arrows.replace('// FLOW_SAMPLE',shared),arrowFragment,
      ['uWaveParts','uCurrentParts','uAngle','uRate','uGain','uArrowGrid']);
    this.trail=program(trail,trailFragment,['uWidth']);
    this.composite=program(vertex,composite,['uTrail','uFade']);
    const gl=this.gl;
    this.emptyVao=gl.createVertexArray();this.feedback=gl.createTransformFeedback();
    this.buffers=[gl.createBuffer(),gl.createBuffer()];
    this.vaos=this.buffers.map(buffer=>{
      const vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,16,0);return vao;
    });
    this.segmentVaos=[0,1].map(i=>{
      const vao=gl.createVertexArray();gl.bindVertexArray(vao);
      for(let a=0;a<2;a++) {
        gl.bindBuffer(gl.ARRAY_BUFFER,this.buffers[a===0?i:1-i]);
        gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,16,0);gl.vertexAttribDivisor(a,1);
      }return vao;
    });
    this.waveParts=this.texture(this.grid,gl.RGBA32F,gl.FLOAT);
    this.currentParts=this.texture(this.grid,gl.RGBA32F,gl.FLOAT);
    this.basisFbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.basisFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.waveParts,0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,this.currentParts,0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
    this.checkFramebuffer();
    this.trailTextures=[0,1].map(()=>this.texture(this.trailSize,gl.RGBA8,gl.UNSIGNED_BYTE));
    this.trailFbos=this.trailTextures.map(tex=>{
      const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);this.checkFramebuffer();return fbo;
    });
    this.reset();
  }
  checkFramebuffer() {
    const gl=this.gl;
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Could not create probability-flow buffers.');
  }
  texture(size,format,type) {
    const gl=this.gl,tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,type===gl.FLOAT?gl.NEAREST:gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,type===gl.FLOAT?gl.NEAREST:gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,format,size,size,0,gl.RGBA,type,null);return tex;
  }
  bindTexture(texture,unit,uniform) {
    const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(uniform,unit);
  }
  clearTrails() {
    const gl=this.gl;gl.clearColor(0,0,0,0);
    for(const fbo of this.trailFbos) {gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.clear(gl.COLOR_BUFFER_BIT);}
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  reset(count=this.count) {
    this.count=count;this.gate=null;this.data=null;this.index=0;this.elapsed=0;this.statsTime=-Infinity;
    const gl=this.gl,states=sampleInitialParticles(count);
    for(const buffer of this.buffers) {gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,states,gl.DYNAMIC_COPY);}
    gl.bindBuffer(gl.ARRAY_BUFFER,null);this.clearTrails();
  }
  prepare(gate,target) {
    if(this.gate===gate||!gate) return;
    this.gate=gate;this.newGate=true;
    this.data=gateFlow(gate.startAmplitudes,gate.kind,target,gate.duration);
    const gl=this.gl,u=this.basis.uniforms;
    gl.disable(gl.BLEND);gl.bindVertexArray(this.emptyVao);gl.bindFramebuffer(gl.FRAMEBUFFER,this.basisFbo);
    gl.viewport(0,0,this.grid,this.grid);gl.useProgram(this.basis.program);
    gl.uniform2fv(u['uFixed[0]'],Float32Array.from(this.data.f));gl.uniform2fv(u['uRotating[0]'],Float32Array.from(this.data.g));
    gl.uniform2fv(u['uPotential[0]'],this.data.potential);gl.uniform1f(u.uGridSize,this.grid);
    gl.drawArrays(gl.TRIANGLES,0,3);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  step(gate,target,end,dt,showTrails) {
    this.prepare(gate,target);
    const gl=this.gl,u=this.update.uniforms,before=this.index,after=1-before;
    gl.disable(gl.BLEND);gl.useProgram(this.update.program);
    this.bindTexture(this.waveParts,0,u.uWaveParts);this.bindTexture(this.currentParts,1,u.uCurrentParts);
    gl.uniform1f(u.uDirection,this.data.direction);gl.uniform1f(u.uEnd,end);gl.uniform1i(u.uNewGate,this.newGate?1:0);
    gl.bindVertexArray(this.vaos[before]);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,this.feedback);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,this.buffers[after]);
    gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,this.count);
    gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);
    this.index=after;this.newGate=false;this.elapsed+=dt;
    if(showTrails) this.stampTrails(before,dt);
  }
  stampTrails(before,dt) {
    const gl=this.gl,next=1-this.trailIndex,u=this.composite.uniforms;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.trailFbos[next]);gl.viewport(0,0,this.trailSize,this.trailSize);
    gl.bindVertexArray(this.emptyVao);gl.disable(gl.BLEND);gl.useProgram(this.composite.program);
    this.bindTexture(this.trailTextures[this.trailIndex],0,u.uTrail);gl.uniform1f(u.uFade,Math.exp(-dt/1.1));
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.trail.program);gl.uniform1f(this.trail.uniforms.uWidth,1.1/this.trailSize);
    gl.bindVertexArray(this.segmentVaos[before]);gl.drawArraysInstanced(gl.TRIANGLES,0,6,this.count);
    this.trailIndex=next;gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  render(canvas,params,active) {
    const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);
    gl.enable(gl.BLEND);
    if(params.showTrails) {
      gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.bindVertexArray(this.emptyVao);
      gl.useProgram(this.composite.program);this.bindTexture(this.trailTextures[this.trailIndex],0,this.composite.uniforms.uTrail);
      gl.uniform1f(this.composite.uniforms.uFade,1);gl.drawArrays(gl.TRIANGLES,0,3);
    }
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    if(params.showParticles) {
      gl.bindVertexArray(this.vaos[this.index]);gl.useProgram(this.points.program);
      const u=this.points.uniforms,dpr=canvas.width/canvas.clientWidth;
      gl.uniform1f(u.uPointSize,params.particleSize*dpr);gl.uniform1f(u.uDotSigma,.2);gl.uniform1f(u.uDotGain,.16);
      gl.drawArrays(gl.POINTS,0,this.count);
    }
    if(params.showCurrent&&active) {
      this.prepare(active,params.target);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);gl.enable(gl.BLEND);
      gl.bindVertexArray(this.emptyVao);gl.useProgram(this.arrows.program);const u=this.arrows.uniforms;
      this.bindTexture(this.waveParts,0,u.uWaveParts);this.bindTexture(this.currentParts,1,u.uCurrentParts);
      gl.uniform1f(u.uAngle,this.data.direction*Math.PI*active.progress);gl.uniform1f(u.uRate,this.data.direction*Math.PI/active.duration);
      gl.uniform1f(u.uGain,params.currentGain);gl.uniform1i(u.uArrowGrid,params.arrowGrid);
      gl.drawArraysInstanced(gl.TRIANGLES,0,6,params.arrowGrid**2);
    }
    gl.disable(gl.BLEND);
  }
  readParticles() {
    const gl=this.gl,data=new Float32Array(4*this.count);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffers[this.index]);gl.getBufferSubData(gl.ARRAY_BUFFER,0,data);gl.bindBuffer(gl.ARRAY_BUFFER,null);
    return data;
  }
  statistics(target,progress,force=false) {
    if(!force&&this.elapsed-this.statsTime<.3&&this.stats?.target===target) return this.stats;
    const data=this.readParticles(),bins=new Array(16).fill(0);let invalid=0,failures=0,lag=0,lagging=0,slowest=null;
    for(let i=0;i<this.count;i++) {
      const x=data[4*i],y=data[4*i+1];
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<=0||x>=1||y<=0||y>=1) invalid++;
      else bins[4*Math.floor(4*x)+Math.floor(4*y)]++;
      failures+=data[4*i+3];
      if(!this.newGate) {
        const behind=progress-data[4*i+2];if(behind>2e-6)lagging++;
        if(behind>lag){lag=behind;slowest=[x,y,data[4*i+2]];}
      }
    }
    this.statsTime=this.elapsed;
    this.stats={target,count:this.count,boxProbability:bins[target]/this.count,bins,invalid,failures,maxLag:lag,lagging,slowest};return this.stats;
  }
  readField() {
    const gl=this.gl,wave=new Float32Array(4*this.grid**2),current=new Float32Array(wave.length);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.basisFbo);gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0,0,this.grid,this.grid,gl.RGBA,gl.FLOAT,wave);gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(0,0,this.grid,this.grid,gl.RGBA,gl.FLOAT,current);gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    return {wave,current,grid:this.grid,direction:this.data?.direction||1,duration:this.gate?.duration||1};
  }
}
