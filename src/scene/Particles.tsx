import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sceneState } from './state';
import { detectProfile } from './profile';

/**
 * La explosion.
 *
 * Cambio respecto a la propuesta: las particulas son ANALITICAS, no una
 * simulacion GPGPU con estado en texturas.
 *
 * El motivo es la reversibilidad. Toda la pieza es una funcion de `t`, asi que
 * el usuario puede subir y el eclipse se recompone. Una simulacion con estado
 * no sabe ir hacia atras: habria que re-simular desde el principio, o aceptar
 * que la nube no vuelve. Con una formula cerrada, la posicion de cada particula
 * depende solo de su semilla y del avance, de modo que scrubear hacia arriba
 * devuelve la nube al disco exacto del que salio. Sale mas barato ademas.
 *
 * Y la siembra es la regla que separa materia de animacion: cada particula nace
 * en un punto de la superficie del propio disco (aDir es un vector unitario, y
 * con avance cero su posicion es exactamente la esfera del sol). Durante los
 * primeros fotogramas la nube todavia TIENE la forma del eclipse. Nunca hay una
 * sustitucion de una imagen por otra.
 */

const vertexShader = /* glsl */ `
uniform float uBurst;
uniform float uSize;
uniform float uPixelRatio;
uniform float uProjScale;
uniform float uTime;
attribute vec3 aDir;
attribute vec3 aSeed;
attribute float aSpeed;
varying float vLife;
varying float vSpeed;

void main() {
  float e = uBurst;

  // Expansion radial con arrastre. La integral de v' = -kv da una exponencial:
  // sale disparada y se frena sola, que es como se comporta la materia.
  float spread = 1.0 - exp(-3.2 * e);
  float rad = 1.0 + spread * (1.6 + aSpeed * 8.4);
  vec3 pos = aDir * rad;

  // Turbulencia. Aproxima el curl noise con unas pocas sinusoides desfasadas
  // por semilla: suficiente para que no parezca confeti y, a diferencia de un
  // campo con estado, reversible.
  vec3 turb = vec3(
    sin(aSeed.x * 6.283 + rad * 1.7 + uTime * 0.22),
    sin(aSeed.y * 6.283 + rad * 1.3 - uTime * 0.17),
    sin(aSeed.z * 6.283 + rad * 2.1 + uTime * 0.19)
  );
  pos += turb * (0.42 + aSpeed * 1.1) * spread * 1.5;

  // Deriva ascendente: el humo sube, como en la referencia.
  pos.y += spread * spread * 1.15;

  vLife = clamp(spread, 0.0, 1.0);
  vSpeed = aSpeed;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  // uSize es el radio de la particula en unidades de mundo, y uProjScale
  // convierte ese radio a pixeles a la distancia a la que esta. Sin ese factor
  // el tamano sale en unidades arbitrarias y las particulas acaban midiendo
  // menos de un pixel, que es como no dibujar nada.
  gl_PointSize = uSize * (0.35 + aSpeed) * (1.0 + vLife * 2.6) * uPixelRatio * uProjScale / max(-mv.z, 0.001);
}
`;

const fragmentShader = /* glsl */ `
uniform float uBurst;
varying float vLife;
varying float vSpeed;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  // smoothstep con los bordes al reves es comportamiento indefinido en GLSL:
  // funciona en algunos drivers y devuelve cero en otros. Siempre ascendente.
  float soft = 1.0 - smoothstep(0.04, 0.5, d);

  // Gradiente de vida: blanco, ambar, azul claro, azul profundo. El viraje a
  // azul ocurre pronto y en poco recorrido, para que se lea como cambio de
  // estado y no como un degradado decorativo. La materia se enfria.
  vec3 col = mix(vec3(1.0), vec3(1.0, 0.86, 0.68), smoothstep(0.0, 0.14, vLife));
  col = mix(col, vec3(0.56, 0.78, 0.95), smoothstep(0.14, 0.32, vLife));
  col = mix(col, vec3(0.15, 0.29, 0.45), smoothstep(0.44, 1.0, vLife));

  float fade = 1.0 - smoothstep(0.58, 1.0, vLife);
  gl_FragColor = vec4(col, soft * fade * uBurst * (0.30 + vSpeed * 0.8));
}
`;

export function Particles() {
  const profile = detectProfile();
  const count = profile.particles;
  const points = useRef<THREE.Points>(null);
  const dpr = useThree((s) => s.viewport.dpr);

  const geometry = useMemo(() => {
    const dir = new Float32Array(count * 3);
    const seed = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    const position = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Muestreo uniforme sobre la esfera: es literalmente la superficie del
      // disco que se acaba de fracturar.
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      dir[i * 3] = Math.cos(theta) * s;
      dir[i * 3 + 1] = u;
      dir[i * 3 + 2] = Math.sin(theta) * s;

      seed[i * 3] = Math.random();
      seed[i * 3 + 1] = Math.random();
      seed[i * 3 + 2] = Math.random();

      // Distribucion sesgada: muchas lentas y pocas muy rapidas, que son las
      // que dibujan los filamentos largos del frente.
      speed[i] = Math.pow(Math.random(), 1.8);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 24);
    return geo;
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uBurst: { value: 0 },
      uSize: { value: 0.016 },
      uPixelRatio: { value: 1 },
      uProjScale: { value: 1000 },
      uTime: { value: 0 },
    }),
    [],
  );

  useFrame((state, delta) => {
    const u = (points.current?.material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (u) {
      u.uTime.value += delta;
      u.uBurst.value = sceneState.burst;
      u.uPixelRatio.value = dpr;
      const camera = state.camera as THREE.PerspectiveCamera;
      u.uProjScale.value = state.size.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    }
    // Fuera de su ventana no se despacha ni un vertice.
    if (points.current) points.current.visible = sceneState.burst > 0.0015;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false} renderOrder={2}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}
