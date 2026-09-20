import { useMemo, useRef } from 'react';
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
    float rr = r * (0.82 + fi * 0.36);

    // Dos escalas angulares. La baja dibuja las plumas grandes, que son las que
    // dan la silueta; la alta, el hilado fino de dentro de cada una.
    //
    // A cada una se le resta su propia tendencia local: un paso alto que deja el
    // ruido centrado en cero sea cual sea su sesgo. Es la diferencia entre ver
    // plumas y ver un degradado radial liso, porque si el ruido esta sesgado
    // cualquier umbral que pongas encima satura en casi todo el campo. Y el
    // sesgo depende del hash, asi que calibrarlo a ojo no aguanta un cambio de
    // frecuencia.
    float coarse = fbm(ray * 2.4 + vec3(0.0, 0.0, uTime * 0.012), 3) - fbm(ray * 0.7, 2);
    float fine = fbm(ray * (5.6 + rr * 6.0) + vec3(0.0, 0.0, uTime * 0.02), 4) - fbm(ray * 1.4, 2);

    // smoothstep en lugar de pow: acota el resultado a [0,1] pase lo que pase
    // con el ruido. Con pow, un pico dispara el valor y todo satura.
    float plume = smoothstep(0.0, 0.26, fine) * (0.22 + 1.05 * smoothstep(-0.04, 0.20, coarse));

    // Caida exponencial en lugar de una potencia de 1/r: misma lectura, sin la
    // singularidad que revienta el borde del disco.
    dens += plume * exp(-(rr - DISC) * 6.5);
  }
  dens /= float(STEPS);

  // Recortes: fuera del circulo y dentro del disco no hay corona. Muere sobre
  // los dos radios y medio del disco, que es lo que mide una corona real.
  float outer = 1.0 - smoothstep(0.34, 0.95, r);
  float inner = smoothstep(DISC * 0.96, DISC * 1.10, r);
  float d = dens * outer * inner;

  // Las zonas densas tiran a blanco, las finas al azul del sistema.
  vec3 cold = vec3(0.30, 0.54, 0.84);
  vec3 bright = vec3(0.90, 0.96, 1.0);
  vec3 col = mix(cold, bright, clamp(d * 14.0, 0.0, 1.0));

  // El alfa va a UNO, no a d.
  //
  // Con mezcla aditiva el resultado es color * alfa + destino. Si se modula el
  // alfa tambien por la densidad, la contribucion acaba yendo como d al
  // cuadrado, y con d alrededor de 0.05 eso hunde las plumas hasta hacerlas
  // invisibles por mucho que se suba la ganancia. Toda la modulacion va en el
  // color; el alfa solo escala.
  //
  // Ganancia calibrada sobre el valor medido de d: unos 0.10 en el pico junto
  // al disco y 0.006 en el borde exterior.
  gl_FragColor = vec4(col * d * uIntensity * 1.9 + dither(gl_FragCoord.xy), 1.0);
}
`;

export function Corona() {
  const profile = detectProfile();
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uIntensity: { value: 0 }, uStretch: { value: 1 } }),
    [],
  );
  const fragmentShader = useMemo(() => makeFragment(profile.coronaSteps), [profile.coronaSteps]);

  useFrame((_, delta) => {
    // Los uniformes se escriben A TRAVES DEL MATERIAL, no sobre el objeto que se
    // le paso como prop. Cuando el shader se reconstruye, el material acaba con
    // una copia propia de los uniformes; si sigues mutando el objeto original,
    // los cambios no llegan nunca y el shader se queda congelado con los valores
    // que tuviera. Aqui eso dejaba la corona a intensidad casi cero, invisible,
    // y ninguna subida de ganancia la rescataba porque todo iba multiplicado por
    // ese cero.
    const u = material.current?.uniforms;
    if (!u) return;
    u.uTime.value += delta;
    u.uIntensity.value = sceneState.corona;
    u.uStretch.value = sceneState.coronaStretch;
  });

  return (
    <mesh position={[0, 0, -0.2]} renderOrder={-1}>
      <planeGeometry args={[26, 10]} />
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
