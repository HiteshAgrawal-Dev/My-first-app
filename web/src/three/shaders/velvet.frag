uniform float uTime;
uniform float uScroll;
uniform vec3 uBase;
uniform vec3 uSheen;
uniform vec3 uDeep;
uniform vec2 uMouse;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vFold;
varying vec2 vUv;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main(){
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(-vViewPos);
  // Moving key light that sweeps across the cloth like a showroom spot.
  vec3 L = normalize(vec3(uMouse.x * 1.4 + sin(uTime * 0.17) * 0.6, 0.7 + uMouse.y * 0.6, 0.9));
  float ndl = max(dot(N, L), 0.0);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  // Velvet: piles catch light at grazing angles (inverted falloff) — the signature rim glow.
  float rim = pow(1.0 - ndv, 2.6);
  vec3 col = mix(uDeep, uBase, smoothstep(-0.9, 0.6, vFold));
  col *= 0.78 + 0.26 * ndl;
  col = mix(col, uSheen, rim * (0.35 + 0.3 * ndl));
  // Champagne specular glint, very soft.
  vec3 H = normalize(L + V);
  col += uSheen * pow(max(dot(N, H), 0.0), 60.0) * 0.06;
  // Vignette + film grain for a cinematic finish.
  vec2 q = vUv - 0.5;
  col = mix(uDeep, col, smoothstep(1.1, 0.25, length(q * vec2(1.0, 1.3))));
  // Quieter on the left third where headline copy sits.
  col = mix(mix(col, uBase, 0.55), col, smoothstep(0.05, 0.55, vUv.x));
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.018;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
