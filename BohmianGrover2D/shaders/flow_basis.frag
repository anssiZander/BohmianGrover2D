#version 300 es
precision highp float;
uniform vec3 uPotential[81];
uniform float uGridSize;
layout(location=0) out vec4 correctionA;
layout(location=1) out vec4 correctionB;
void main() {
  vec2 xy=(gl_FragCoord.xy-.5)/(uGridSize-1.0);
  float cx[9],cy[9],sx[9],sy[9];
  const float PI=3.141592653589793;
  for(int n=0;n<9;n++){cx[n]=cos(float(n)*PI*xy.x);cy[n]=cos(float(n)*PI*xy.y);sx[n]=sin(float(n)*PI*xy.x);sy[n]=sin(float(n)*PI*xy.y);}
  vec3 jx=vec3(0),jy=vec3(0);
  for(int n=0;n<9;n++)for(int m=0;m<9;m++){
    jx-=float(n)*PI*sx[n]*cy[m]*uPotential[9*n+m];
    jy-=float(m)*PI*cx[n]*sy[m]*uPotential[9*n+m];
  }
  if(xy.x<=0.0||xy.x>=1.0)jx=vec3(0);
  if(xy.y<=0.0||xy.y>=1.0)jy=vec3(0);
  correctionA=vec4(jx.x,jy.x,jx.y,jy.y);correctionB=vec4(jx.z,jy.z,0,0);
}
