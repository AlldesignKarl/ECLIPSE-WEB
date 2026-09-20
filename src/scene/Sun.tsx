import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/noise';
import { sceneState } from './state';

const vertexShader = /* glsl */ `
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vPos = position;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader =
  NOISE_GLSL +
  /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uCool;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;

void main() {
  vec3 p = normalize(vPos);

  // Granulacion en dos escalas: las celdas grandes se mueven despacio, el
  // hervor fino va mas rapido. La fotosfera respira aunque el scroll no avance.
  float coarse = warpedFbm(p * 3.1 + vec3(0.0, uTime * 0.035, 0.0), 1.4, 4);
  float fine = fbm(p * 9.0 - vec3(uTime * 0.055), 3);
  float g = clamp((coarse * 0.65 + fine * 0.35) * 0.5 + 0.5, 0.0, 1.0);

  // Oscurecimiento del limbo: el borde del disco se apaga porque miramos la
  // atmosfera de lado. Sin esto el sol parece una pegatina.
  float mu = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
  float limb = pow(mu, 0.42);

  vec3 deep = vec3(0.55, 0.24, 0.08);
  vec3 mid = vec3(0.95, 0.60, 0.23);
  vec3 hot = vec3(1.0, 0.94, 0.85);
  vec3 col = mix(deep, mid, smoothstep(0.24, 0.60, g));
  col = mix(col, hot, smoothstep(0.60, 0.92, g));
  col *= 0.30 + 0.90 * limb;

  // Al cuartearse, la materia se enfria: el ambar vira a azul en lugar de
  // apagarse sin mas. Si se queda ambar a intensidad baja, el disco toma un
  // pardo sucio que ensucia justo el momento que deberia ser el mas limpio.
  col = mix(col, vec3(0.30, 0.52, 0.82) * (0.25 + g * 0.9), uCool);

  gl_FragColor = vec4(col * uIntensity, 1.0);
}
`;

export function Photosphere() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uCool: { value: 0 },
    }),
    [],
  );

  useFrame((_, delta) => {
    // Los uniformes se escriben a traves del material, no sobre el objeto que se
    // le paso como prop: cuando el shader se reconstruye, el material acaba con
    // su propia copia y mutar el original deja de tener efecto. Es un fallo
    // silencioso — compila, no avisa y el shader se queda con valores viejos.
    const u = material.current?.uniforms;
    if (!u) return;
    u.uTime.value += delta;
    u.uIntensity.value = sceneState.photosphere;
    u.uCool.value = sceneState.cool;
    material.current!.visible = sceneState.photosphere > 0.002;
  });

  return (
    <mesh>
      <sphereGeometry args={[1, 96, 96]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        toneMapped={false}
      />
    </mesh>
  );
}

const chromoFragment =
  NOISE_GLSL +
  /* glsl */ `
uniform float uTime;
uniform float uIntensity;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;

void main() {
  // Solo el borde. La cromosfera es un anillo visto de canto, no una capa.
  float mu = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
  float rim = pow(1.0 - mu, 3.4);

  vec3 p = normalize(vPos);
  // Protuberancias: laten a ritmo propio, independiente del scroll.
  float flare = fbm(p * 4.4 + vec3(0.0, uTime * 0.11, uTime * 0.05), 4);
  float tongues = pow(max(0.0, flare * 0.5 + 0.5), 3.0);

  float a = rim * (0.35 + tongues * 1.5) * uIntensity;
  vec3 col = mix(vec3(1.0, 0.42, 0.22), vec3(1.0, 0.82, 0.62), tongues);
  gl_FragColor = vec4(col * a, a);
}
`;

export function Chromosphere() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uIntensity: { value: 1 } }), []);

  useFrame((_, delta) => {
    const u = material.current?.uniforms;
    if (!u) return;
    u.uTime.value += delta;
    u.uIntensity.value = sceneState.photosphere;
  });

  return (
    <mesh scale={1.035}>
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={chromoFragment}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}
