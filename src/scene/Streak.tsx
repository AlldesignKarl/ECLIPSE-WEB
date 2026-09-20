import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/noise';
import { sceneState } from './state';

/**
 * El destello que atraviesa el disco.
 *
 * Es lo que separa este eclipse de un eclipse generico: una linea de luz que
 * cruza el encuadre entero pasando por el centro, mas intensa justo donde toca
 * el borde del disco. Gira con el scroll, y ese giro es el que marca el avance.
 *
 * Va detras del disco, asi que la luna lo corta por la mitad y quedan los dos
 * brazos saliendo a cada lado. Esa interrupcion es la que le da profundidad:
 * si pasara por delante seria una raya pintada encima.
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
uniform float uIntensity;
uniform float uTime;
varying vec2 vUv;

void main() {
  // x recorre la linea a lo largo, y su grosor.
  float x = (vUv.x - 0.5) * 2.0;
  float y = (vUv.y - 0.5) * 2.0;

  float d = abs(x);

  // Nucleo finisimo con un halo muy ajustado. El grosor crece un poco hacia
  // los extremos, como una llamarada que se abre al alejarse.
  float thickness = 0.11 + d * 0.20;
  float core = 1.0 - smoothstep(0.0, thickness * 0.34, abs(y));
  float glow = 1.0 - smoothstep(0.0, thickness * 3.2, abs(y));

  // Se apaga hacia las puntas, y arranca justo fuera del disco.
  // Arranca pegado al borde del disco: si empieza lejos se lee como dos rayas
  // sueltas en vez de como una linea que lo atraviesa.
  float along = (1.0 - smoothstep(0.14, 0.92, d)) * smoothstep(0.045, 0.10, d);

  // Ruido a lo largo: la luz no es un tubo perfecto.
  float grain = 0.72 + 0.42 * smoothstep(-0.2, 0.3, fbm(vec3(x * 5.0, 0.0, uTime * 0.05), 3));

  float i = (core * 1.05 + glow * 0.22) * along * grain * uIntensity;
  vec3 col = mix(vec3(0.62, 0.70, 0.86), vec3(0.95, 0.96, 1.0), clamp(core, 0.0, 1.0));

  gl_FragColor = vec4(col * i + dither(gl_FragCoord.xy), 1.0);
}
`;

export function Streak() {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uIntensity: { value: 0 }, uTime: { value: 0 } }), []);

  useFrame((_, delta) => {
    const u = material.current?.uniforms;
    if (u) {
      u.uTime.value += delta;
      u.uIntensity.value = sceneState.streak;
    }
    if (mesh.current) mesh.current.visible = sceneState.streak > 0.004;
  });

  return (
    <mesh ref={mesh} position={[0, 0, -0.12]} renderOrder={-2}>
      <planeGeometry args={[26, 4]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}
