#version 300 es
precision highp float;
uniform vec4 uCoefficients[16];
uniform float uGridSize;
out vec4 fragColor;
void main() {
  vec2 xy=(gl_FragCoord.xy-.5)/(uGridSize-1.0);
  if(min(xy.x,xy.y)<=0.0||max(xy.x,xy.y)>=1.0){fragColor=vec4(0);return;}
  const float PI=3.141592653589793;
  vec4 sx=sin(PI*xy.x*vec4(1,2,3,4)),sy=sin(PI*xy.y*vec4(1,2,3,4));
  vec4 psi=vec4(0);
  for(int n=0;n<4;n++)for(int m=0;m<4;m++)psi+=uCoefficients[4*n+m]*(2.0*sx[n]*sy[m]);
  fragColor=psi;
}
