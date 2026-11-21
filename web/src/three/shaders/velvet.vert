#include noise.glsl
uniform float uTime;
uniform float uScroll;
uniform vec2 uMouse;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vFold;
varying vec2 vUv;

// Heavy drapery: long vertical folds + slow travelling ripples + a soft dent under the cursor.
float drape(vec2 p){
  float t = uTime * 0.12;
  float folds = sin(p.x * 2.3 + snoise(vec3(p.x * 0.35, p.y * 0.25, t)) * 2.2) * 0.38;
  float ripple = snoise(vec3(p * vec2(0.55, 0.9), t * 1.4 + uScroll * 0.6)) * 0.55;
  float fine = snoise(vec3(p * 2.1, t * 2.0)) * 0.06;
  float d = distance(p, uMouse * vec2(5.5, 3.2));
  float dent = -0.45 * exp(-d * d * 0.55);
  return folds + ripple + fine + dent;
}

void main(){
  vUv = uv;
  vec3 pos = position;
  float h = drape(pos.xy);
  float e = 0.02;
  float hx = drape(pos.xy + vec2(e, 0.0));
  float hy = drape(pos.xy + vec2(0.0, e));
  vec3 n = normalize(vec3(-(hx - h) / e, -(hy - h) / e, 1.0));
  pos.z += h;
  vFold = h;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vViewPos = mv.xyz;
  vNormalV = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * mv;
}
