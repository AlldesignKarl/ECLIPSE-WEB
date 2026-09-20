import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/noise';
import { sceneState } from './state';
import { detectProfile } from './profile';

/**
 * La corona. La pieza critica.
 *
 * Acumulacion radial de 12 a 32 muestras sobre un campo de densidad modulado
 * por ruido, con caida 1/r^2.8 y plumas alineadas a un campo angular. Es lo que
 * separa un eclipse creible de un circulo con glow.
 *
 * Y es azul desde el primer contacto, no blanca. Sacrificamos realismo estricto
 * para que el estallido azul del final se sienta prometido en lugar de
 * arbitrario: cuando llega, el color ya llevaba cinco actos anunciandose.
 */

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const makeFragment = (steps: number) =>
  NOISE_GLSL +
  /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uStretch;
varying vec2 vUv;

const int STEPS = ${steps};

// El plano es mucho mas ancho que alto para que la corona quepa cuando se
// estira hacia el ecuador. Trabajamos en unidades normalizadas por RADIUS, no
// por el tamano del plano, de modo que el campo sigue siendo circular aunque el
// plano no lo sea.
const float PLANE_W = 26.0;
const float PLANE_H = 10.0;
const float RADIUS = 5.0;
// Radio aparente del disco en esas unidades: la luna, de radio 1.018 y un poco
// mas cerca de la camara, ocupa aproximadamente un 22 % de RADIUS. Si este
// numero no coincide con el disco real, la corona arranca flotando por dentro o
// despegada por fuera.
const float DISC = 0.222;

void main() {
  vec2 p = vec2((vUv.x - 0.5) * PLANE_W, (vUv.y - 0.5) * PLANE_H) / RADIUS;
  // Estiramiento ecuatorial. En el minimo solar la corona real se alarga por el
  // ecuador, asi que el gesto que tomamos prestado ademas es correcto.
  p.x /= uStretch;

  float r = length(p);
  if (r > 1.0) discard;

  float a = atan(p.y, p.x);
  vec3 ray = vec3(cos(a), sin(a), 0.0);

  // Acumulacion radial alrededor del propio pixel: cada muestra se toma un poco
  // mas adentro y un poco mas afuera de su radio, de modo que las plumas tienen
  // grosor en lugar de ser cunas planas. El campo se muestrea en coordenadas
  // angulares para que salgan radiales, que es lo que la hace leer como corona.
  float dens = 0.0;
  for (int i = 0; i < ${steps}; i++) {
    float fi = (float(i) + 0.5) / float(STEPS);
    float rr = r * (0.80 + fi * 0.40);

    float n = fbm(ray * (2.1 + rr * 3.6) + vec3(0.0, 0.0, uTime * 0.02), 4);
    float plume = pow(max(0.0, 0.42 + n * 0.98), 2.6);

    // Caida exponencial en lugar de una potencia de 1/r: misma lectura, sin la
    // singularidad que revienta el borde del disco.
    dens += plume * exp(-(rr - DISC) * 5.0);
  }
  dens /= float(STEPS);

  // Recortes: fuera del circulo y dentro del disco no hay corona.
  float outer = 1.0 - smoothstep(0.46, 1.0, r);
  float inner = smoothstep(DISC * 0.94, DISC * 1.14, r);
  float d = dens * outer * inner;

  // Las zonas densas tiran a blanco, las finas al azul del sistema.
  vec3 cold = vec3(0.34, 0.57, 0.85);
  vec3 bright = vec3(0.88, 0.95, 1.0);
  vec3 col = mix(cold, bright, clamp(d * 3.4, 0.0, 1.0));

  gl_FragColor = vec4(col * d * uIntensity * 5.2 + dither(gl_FragCoord.xy), clamp(d * uIntensity * 3.0, 0.0, 1.0));
}
`;

export function Corona() {
  const profile = detectProfile();
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uIntensity: { value: 0 }, uStretch: { value: 1 } }),
    [],
  );
  const fragmentShader = useMemo(() => makeFragment(profile.coronaSteps), [profile.coronaSteps]);

  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
    uniforms.uIntensity.value = sceneState.corona;
    uniforms.uStretch.value = sceneState.coronaStretch;
  });

  return (
    <mesh position={[0, 0, -0.2]} renderOrder={-1}>
      <planeGeometry args={[26, 10]} />
      <shaderMaterial
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
