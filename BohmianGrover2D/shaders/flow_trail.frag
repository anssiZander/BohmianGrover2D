#version 300 es
precision highp float;
in vec2 vLocal;
flat in float vLength;
uniform float uWidth;
out vec4 fragColor;
void main() {
  float d=length(vec2(max(abs(vLocal.x)-.5*vLength,0.0),vLocal.y));
  float a=.32*(1.0-smoothstep(.2*uWidth,uWidth,d));
  fragColor=vec4(1.0,.92,.08,a);
}
