import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/noise';
import { sceneState } from './state';

/**
 * La luna.
 *
 * Es una esfera, no un disco. Su silueta es lo que define el creciente, y un
 * disco plano se delata en cuanto la camara se acerca: no tiene borde, tiene
 * contorno. Con relieve y luz rasante, en cambio, el borde tiene grosor.
 */

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
uniform float uCoronaLight;
uniform float uCracks;
uniform float uTime;
uniform float uOpacity;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;

void main() {
  vec3 p = normalize(vPos);

  // Micro-relieve procedural: crateres y mares, apenas visibles, solo lo justo
  // para que el disco no sea un agujero plano.
  float relief = warpedFbm(p * 6.5, 1.1, 4) * 0.5 + 0.5;
  float craters = smoothstep(0.42, 0.58, fbm(p * 14.0, 3) * 0.5 + 0.5);

  // Valores LINEALES: el negro del sistema ronda 0.0018. Escribir aqui un 0.012
  // pensando en sRGB da una luna claramente gris, que es justo lo que no
  // queremos: en totalidad tiene que ser un agujero, no un disco iluminado.
  vec3 base = vec3(0.0012, 0.0014, 0.0022);
  base += vec3(0.0016, 0.0018, 0.0026) * relief;
  base -= vec3(0.0007) * craters;

  // La corona ilumina el borde por detras. Es la unica luz que recibe la luna
  // en totalidad, y es lo que le da volumen en lugar de silueta.
  float mu = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
  float rim = pow(1.0 - mu, 6.0);
  base += vec3(0.42, 0.58, 0.82) * rim * uCoronaLight * 0.55;

  // Grietas de luz. El disco que se ve en totalidad es este, asi que es este el
  // que se cuartea. No son una capa por encima: la luz sale de dentro y recorre
  // la superficie siguiendo un campo de ruido, como una fractura de verdad.
  if (uCracks > 0.001) {
    float veins = fbm(p * 5.2 + 11.0, 4);
    float crack = 1.0 - smoothstep(0.0, 0.055, abs(veins));
    float pulse = 0.72 + 0.28 * sin(uTime * 9.0 + veins * 20.0);
    base += vec3(0.72, 0.86, 1.0) * crack * uCracks * pulse * 3.6;
  }

  gl_FragColor = vec4(base, uOpacity);
}
`;

export function Moon() {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uCoronaLight: { value: 0 },
      uCracks: { value: 0 },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
    }),
    [],
  );

  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
    uniforms.uCoronaLight.value = sceneState.corona;
    uniforms.uCracks.value = sceneState.cracks;
    uniforms.uOpacity.value = sceneState.disc;
    if (material.current) {
      // Mientras es opaca escribe profundidad y ocluye lo que hay detras. En
      // cuanto empieza a irse deja de hacerlo, para no recortar las particulas
      // que ya estan saliendo de su propia superficie.
      material.current.depthWrite = sceneState.disc > 0.985;
      material.current.visible = sceneState.disc > 0.004;
    }
    if (group.current) {
      group.current.position.x = sceneState.moonX;
      // Una inclinacion minima en Y: la trayectoria real de un eclipse no es
      // horizontal perfecta, y esa asimetria es la que lo hace creible.
      group.current.position.y = sceneState.moonX * 0.11;
    }
  });

  return (
    <group ref={group} position={[3.4, 0.37, 0.28]}>
      <mesh>
        <sphereGeometry args={[1.018, 96, 96]} />
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
