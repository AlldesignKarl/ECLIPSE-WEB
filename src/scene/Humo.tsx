import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/noise';
import { sceneState } from './state';
import { detectProfile } from './profile';

/**
 * El humo azul.
 *
 * Tercer intento, y el unico que podia funcionar. Los dos anteriores apilaban
 * carteles translucidos: catorce planos, treinta, daba igual. Sumar muchas
 * opacidades parciales siempre converge a opacidad total, asi que el resultado
 * no era humo sino un filtro azul plano tapando la pantalla.
 *
 * Aqui hay UN SOLO plano. La estructura no sale de superponer geometria, sale
 * del campo de ruido: deformacion de dominio para las celdas de conveccion, y
 * un umbral por encima del cual hay materia y por debajo no hay NADA. Esos
 * huecos son lo que separa el humo de la niebla. Un plano no puede saturar.
 *
 * Mezcla normal, no aditiva. El humo no emite: tapa. Si sumara, cada voluta
 * aclararia el fondo y volveriamos al filtro.
 *
 * El umbral BAJA con el avance. Al principio solo sobreviven los nucleos mas
 * densos, que se leen como volutas sueltas saliendo del estallido; al final
 * casi todo el campo pasa el corte y la nube cubre el encuadre. Es la misma
 * nube creciendo, no dos efectos distintos.
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
uniform float uSmoke;
uniform float uTime;
uniform int uOct;
varying vec2 vUv;

const float PW = 44.0;
const float PH = 26.0;

void main() {
  vec2 p = (vUv - 0.5) * vec2(PW, PH);
  float r = length(p);
  float g = clamp(uSmoke, 0.0, 1.0);

  // El espacio de muestreo CRECE con el avance. Por eso cada voluta se abre
  // desde el centro en vez de aparecer ya hecha en su sitio: es la misma
  // estructura vista cada vez mas de cerca.
  //
  // Las escalas estan calibradas contra lo que de verdad se VE del plano, no
  // contra el plano entero. A la distancia de camara del tramo de humo el
  // encuadre solo muerde unas ocho unidades de ancho de estas cuarenta y
  // cuatro; midiendo sobre el plano completo salia menos de una celda de ruido
  // por pantalla, y una celda de ruido a pantalla completa no es humo: es un
  // degradado borroso.
  float grow = 0.55 + g * 1.05;
  vec3 q = vec3(p * (1.35 / grow), uTime * 0.05 + g * 0.55);

  float d = warpedFbm(q, 1.9, uOct) * 2.0;
  d = d * 0.5 + 0.5;

  // El frente de la nube: por fuera no ha llegado todavia.
  // Media diagonal visible del plano: unas cuatro unidades y media. El frente
  // se mide contra eso, para que la nube nazca pequena y tarde en llegar a las
  // esquinas en vez de empezar ya cubriendolo todo.
  float front = 0.5 + g * 6.0;
  float edge = 1.0 - smoothstep(front * 0.40, front, r);

  // El corte que abre los huecos. Empieza alto (poca materia, muy separada) y
  // baja hasta dejar pasar casi todo el campo.
  float cut = mix(0.66, 0.19, g);

  // Sesgo radial: la nube es COMPACTA en el centro y deshilachada en el borde.
  // Sin el, el umbral dejaba islas de humo sueltas flotando en un anillo y el
  // medio vacio, que es justo al reves de como sale el humo de un estallido.
  float nucleo = 1.0 - smoothstep(0.0, front * 0.85, r);
  float dens = smoothstep(cut, cut + 0.40, d + nucleo * 0.30) * edge;

  float a = dens * smoothstep(0.0, 0.22, g) * 0.97;

  // Azul profundo en la masa, azul frio en las crestas. Nunca blanco: el humo
  // no es una fuente de luz.
  vec3 deep = vec3(0.008, 0.020, 0.044);
  vec3 lit = vec3(0.11, 0.26, 0.47);
  vec3 col = mix(deep, lit, smoothstep(0.34, 0.96, d));

  // Durante el primer tercio queda calor del estallido dentro de la nube.
  float heat = (1.0 - smoothstep(0.3, 3.2, r)) * (1.0 - smoothstep(0.0, 0.42, g));
  col += vec3(0.38, 0.50, 0.70) * heat * 0.75;

  // Las crestas de fuera van mas apagadas: da profundidad y evita que la nube
  // sea una pared de densidad uniforme de esquina a esquina.
  col *= 0.62 + 0.38 * nucleo;

  gl_FragColor = vec4(col + dither(gl_FragCoord.xy), a);
}
`;

export function Humo() {
  const profile = detectProfile();
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uSmoke: { value: 0 },
      uTime: { value: 0 },
      uOct: { value: profile.fullPost ? 5 : 3 },
    }),
    [profile.fullPost],
  );

  useFrame((_, delta) => {
    const u = material.current?.uniforms;
    if (u) {
      u.uTime.value += delta;
      u.uSmoke.value = sceneState.smoke;
    }
    // Fuera de su tramo no se evalua ni un pixel de ruido, que es lo caro.
    if (mesh.current) mesh.current.visible = sceneState.smoke > 0.004;
  });

  return (
    <mesh ref={mesh} position={[0, 0, 2.6]} renderOrder={5}>
      <planeGeometry args={[44, 26]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.NormalBlending}
        toneMapped={false}
      />
    </mesh>
  );
}
