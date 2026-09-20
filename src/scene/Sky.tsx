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

// OJO: estos valores son LINEALES, no sRGB. El renderer convierte al escribir,
// asi que un 0.0075 aqui sale como un gris azulado bien visible en pantalla, no
// como negro. El negro del sistema, #06070A, es aproximadamente 0.0018 lineal.
const vec3 NIGHT = vec3(0.0016, 0.0019, 0.0029);
const vec3 DAY_EDGE = vec3(0.0032, 0.0075, 0.0180);
const vec3 DAY_CORE = vec3(0.0110, 0.0240, 0.0680);

void main() {
  vec3 d = normalize(vPos);

  // Halo atmosferico alrededor del sol: intenso con luz de dia, inexistente en
  // totalidad. Pierde saturacion antes de perder brillo, como el cielo real.
  float toCenter = 1.0 - clamp(length(d.xy) * 1.35, 0.0, 1.0);
  vec3 day = mix(DAY_EDGE, DAY_CORE, pow(toCenter, 2.0));

  vec3 col = mix(NIGHT, day, uLight);

  // Polvo muy tenue, para que el vacio tenga grano propio y no sea una pared.
  float dust = fbm(d * 2.6, 3) * 0.5 + 0.5;
  col += vec3(0.0013, 0.0018, 0.0030) * pow(dust, 3.0) * (1.0 - uLight * 0.5);

  gl_FragColor = vec4(col + dither(gl_FragCoord.xy), 1.0);
}
`;

function Backdrop() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uLight: { value: 1 } }), []);
  useFrame(() => {
    const u = material.current?.uniforms;
    if (u) u.uLight.value = sceneState.skyLight;
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
