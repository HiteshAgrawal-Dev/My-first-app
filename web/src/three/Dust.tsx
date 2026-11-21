import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/** Champagne dust motes drifting through the spotlight — additive points with soft round sprites. */
export default function Dust({ count = 600, spread = [9, 6, 5], color = '#e8c79a' }: { count?: number; spread?: [number, number, number] | number[]; color?: string }) {
  const ref = useRef<THREE.Points>(null!)
  const [pos, seed] = useMemo(() => {
    const p = new Float32Array(count * 3), s = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * spread[0]; p[i * 3 + 1] = (Math.random() - 0.5) * spread[1]; p[i * 3 + 2] = (Math.random() - 0.5) * spread[2]
      s[i] = Math.random()
    }
    return [p, s]
  }, [count, spread])
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uPx: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: `uniform float uTime; uniform float uPx; attribute float aSeed; varying float vA;
      void main(){ vec3 p = position; float t = uTime*0.08 + aSeed*6.28;
        p.y += mod(uTime*0.05*(0.3+aSeed) + aSeed*6.0, 6.0) - 3.0; p.x += sin(t*2.0)*0.25; p.z += cos(t*1.7)*0.2;
        vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
        gl_PointSize = (6.0 + aSeed*16.0) * uPx / -mv.z; vA = 0.25 + 0.75*sin(t*3.0+aSeed*20.0)*0.5+0.5; }`,
    fragmentShader: `uniform vec3 uColor; varying float vA;
      void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(uColor, a*a*0.55*vA); }`,
  }), [color])
  useFrame((_, dt) => { mat.uniforms.uTime.value += Math.min(dt, 0.05) })
  return (
    <points ref={ref} material={mat}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[seed, 1]} />
      </bufferGeometry>
    </points>
  )
}
