import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/noise';
import { sceneState } from './state';

/**
 * El golpe de luz de la ignicion.
 *
 * Sin esto la explosion se lee como nieve: puntos que se separan. La luz es lo
 * que la convierte en un suceso — llega primero y la materia despues, igual que
 * en la referencia, donde el nucleo revienta un par de fotogramas antes de que
 * se vea una sola particula.
 *
 * Es un plano, no una luz real: la escena es emisiva de principio a fin y no
 * tiene iluminacion que sumar. Lo que cuenta es el perfil radial y que se apague
 * rapido, para que no quede un resplandor flotando sobre la nube.
 */

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader =
  NOISE_GLSL +
  /* glsl */ `
uniform float uFlash;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;

  // Nucleo duro con halo CORTO. Un flash se lee por contraste con lo que queda
  // oscuro alrededor, no por cantidad de luz: si el halo llega a las esquinas,
  // se come el negro y con el negro se va el sistema entero.
  float core = pow(1.0 - smoothstep(0.0, 0.22, r), 3.2);
  float halo = pow(1.0 - smoothstep(0.0, 0.46, r), 2.8);

  // Rayos: rompen el circulo perfecto, que siempre delata un sprite.
  float a = atan(p.y, p.x);
  float rays = fbm(vec3(cos(a), sin(a), 0.0) * 4.0 + vec3(0.0, 0.0, uTime * 0.05), 3);
  halo *= 0.55 + 0.75 * smoothstep(-0.15, 0.25, rays);

  float i = (core * 0.85 + halo * 0.16) * uFlash;
  vec3 col = mix(vec3(0.62, 0.80, 1.0), vec3(1.0), clamp(core * 1.6, 0.0, 1.0));

  gl_FragColor = vec4(col * i + dither(gl_FragCoord.xy), 1.0);
}
`;

export function Flash() {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uFlash: { value: 0 }, uTime: { value: 0 } }), []);

  useFrame((_, delta) => {
    const u = material.current?.uniforms;
    if (u) {
      u.uTime.value += delta;
      u.uFlash.value = sceneState.flash;
    }
    if (mesh.current) {
      mesh.current.visible = sceneState.flash > 0.003;
      // Crece con el propio golpe: al nacer es un punto, al apagarse ya ha
      // barrido el encuadre.
      const s = 1 + sceneState.burst * 1.5;
      mesh.current.scale.setScalar(s);
    }
  });

  return (
    <mesh ref={mesh} position={[0, 0, 0.35]} renderOrder={1}>
      <planeGeometry args={[5, 5]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}
