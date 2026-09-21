import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/noise';
import { sceneState } from './state';
import { detectProfile } from './profile';

/**
 * El humo.
 *
 * Planos billboard grandes con ruido procedural y bordes fundidos. Barato y
 * muy convincente: lo que delata a un sistema de humo casi siempre es el canto
 * recto del plano, y aqui el alfa cae a cero mucho antes de llegar al borde.
 *
 * Va en mezcla normal, no aditiva. Las particulas son energia y suman luz; el
 * humo es materia y tapa lo que hay detras. Sin esa diferencia, la nube se
 * queda en efecto luminoso y nunca pesa.
 */

const vertexShader = /* glsl */ `
uniform float uSpread;
attribute vec3 aOffset;
attribute vec3 aSeed;
varying vec2 vUv;
varying vec3 vSeed;

void main() {
  vUv = uv;
  vSeed = aSeed;

  // El humo crece por encima del encuadre: que salga de plano es lo que da la
  // sensacion de estar dentro y no mirandolo de lejos.
  // El crecimiento se contiene a proposito: una nube que cubre el encuadre
  // entero no tiene silueta, y sin silueta no hay volumen, solo niebla.
  vec3 p = position * (1.0 + uSpread * (0.5 + aSeed.z * 1.3));
  vec4 local = instanceMatrix * vec4(p, 1.0);
  local.xyz += aOffset * uSpread * 2.4;
  local.y += uSpread * uSpread * 1.6;

  gl_Position = projectionMatrix * modelViewMatrix * local;
}
`;

const fragmentShader =
  NOISE_GLSL +
  /* glsl */ `
uniform float uTime;
uniform float uDensity;
varying vec2 vUv;
varying vec3 vSeed;

void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;

  // Dos escalas de ruido y mucho contraste. Con poco contraste, dieciseis planos
  // superpuestos se promedian entre si y el resultado es niebla plana: hace
  // falta que haya zonas densas y zonas vacias para que se lea el volumen.
  float coarse = fbm(vec3(p * 1.5 + vSeed.xy * 17.0, uTime * 0.02 + vSeed.z * 9.0), 3);
  float fine = fbm(vec3(p * 4.2 + vSeed.xy * 31.0, uTime * 0.05 + vSeed.z * 4.0), 4);
  float n = coarse * 0.7 + fine * 0.3;

  float body = 1.0 - smoothstep(0.05, 1.0, r);
  // smoothstep en vez de clamp: recorta los medios tonos y deja jirones en
  // lugar de una sabana uniforme.
  float density = smoothstep(0.04, 0.42, 0.32 + n);
  float a = body * density * uDensity;

  // Azul claro donde el humo es denso, azul de sombra donde se deshilacha: el
  // volumen sale de esa diferencia, no de una textura.
  // Valores LINEALES: 0.22 aqui se ve como un 0.50 en pantalla.
  // Azul claro de verdad. Antes quedaba tan apagado que se perdia contra el
  // negro; el encargo era una nube de humo azul claro y tiene que leerse como
  // tal, no como una sombra azulada.
  vec3 col = mix(vec3(0.020, 0.045, 0.085), vec3(0.34, 0.60, 0.88), clamp(n * 1.3 + 0.5, 0.0, 1.0));

  gl_FragColor = vec4(col, a * 0.42);
}
`;

export function Smoke() {
  const profile = detectProfile();
  const count = profile.smokePlanes;
  const mesh = useRef<THREE.InstancedMesh>(null);

  const { offsets, seeds } = useMemo(() => {
    const off = new Float32Array(count * 3);
    const sd = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      off[i * 3] = Math.cos(theta) * s;
      off[i * 3 + 1] = u * 0.72;
      off[i * 3 + 2] = Math.sin(theta) * s * 0.55;
      sd[i * 3] = Math.random();
      sd[i * 3 + 1] = Math.random();
      sd[i * 3 + 2] = Math.random();
    }
    return { offsets: off, seeds: sd };
  }, [count]);

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uSpread: { value: 0 }, uDensity: { value: 0 } }), []);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const zero = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      // Rotacion desigual por plano. Si todos giran al mismo ritmo el ojo
      // detecta la repeticion de inmediato.
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.random() * Math.PI * 2);
      const size = 1.1 + Math.random() * 1.9;
      scale.set(size, size, size);
      matrix.compose(zero, quaternion, scale);
      mesh.current.setMatrixAt(i, matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    mesh.current.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
  }, [count, offsets, seeds]);

  useFrame((_, delta) => {
    const u = (mesh.current?.material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (u) {
      u.uTime.value += delta;
      u.uSpread.value = sceneState.burst;
      u.uDensity.value = sceneState.smoke;
    }
    if (mesh.current) mesh.current.visible = sceneState.smoke > 0.002;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false} renderOrder={3}>
      <planeGeometry args={[2.6, 2.6]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
