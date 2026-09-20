import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/noise';
import { sceneState } from './state';

/**
 * El cielo.
 *
 * Las estrellas no se encienden: emergen porque baja la exposicion, igual que
 * en un eclipse real. Y el fondo nunca es negro puro, que mata el bloom y hace
 * bandas en cualquier OLED.
 */

const backdropVertex = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const backdropFragment =
  NOISE_GLSL +
  /* glsl */ `
uniform float uLight;
varying vec3 vPos;

// Negro. Sin fase de dia no hay nada que mezclar, y el negro es el sistema.
//
// No es cero absoluto: un negro plano hace bandas en cuanto algo lo ilumina, y
// ademas mata el bloom. Es un valor minimo mas dithering, que en pantalla se
// lee como negro pero se comporta mucho mejor.
const vec3 NIGHT = vec3(0.0008, 0.0009, 0.0013);

void main() {
  vec3 d = normalize(vPos);
  vec3 col = NIGHT * uLight;

  // Polvo muy tenue, para que el vacio tenga grano propio y no sea una pared.
  float dust = fbm(d * 2.6, 3) * 0.5 + 0.5;
  col += vec3(0.0009, 0.0011, 0.0017) * pow(dust, 3.0);

  gl_FragColor = vec4(col + dither(gl_FragCoord.xy), 1.0);
}
`;

function Backdrop() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uLight: { value: 1 } }), []);
  useFrame(() => {
    const u = material.current?.uniforms;
    if (u) u.uLight.value = 1;
  });
  return (
    <mesh renderOrder={-10}>
      <sphereGeometry args={[60, 32, 32]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={backdropVertex}
        fragmentShader={backdropFragment}
        side={THREE.BackSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

const STAR_COUNT = 2600;

function Stars() {
  const material = useRef<THREE.PointsMaterial>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      // Distribucion uniforme sobre la esfera, no en coordenadas polares: si no,
      // las estrellas se amontonan en los polos y se nota.
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const radius = 40;
      positions[i * 3] = Math.cos(theta) * s * radius;
      positions[i * 3 + 1] = u * radius;
      positions[i * 3 + 2] = Math.sin(theta) * s * radius - 6;
      sizes[i] = 0.05 + Math.random() * 0.14;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, []);

  useFrame(() => {
    if (material.current) {
      material.current.opacity = sceneState.stars * 0.9;
      material.current.visible = sceneState.stars > 0.01;
    }
  });

  return (
    <points geometry={geometry} renderOrder={-9}>
      <pointsMaterial
        ref={material}
        color="#cfe2f7"
        size={0.13}
        sizeAttenuation
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

export function Sky() {
  return (
    <>
      <Backdrop />
      <Stars />
    </>
  );
}
