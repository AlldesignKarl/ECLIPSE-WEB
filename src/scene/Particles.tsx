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
uniform float uSmoke;
uniform float uSize;
uniform float uPixelRatio;
uniform float uProjScale;
uniform float uTime;
attribute vec3 aDir;
attribute vec3 aSeed;
attribute float aSpeed;
attribute float aStart;
varying float vLife;
varying float vSpeed;
varying float vFade;

void main() {
  float e = uBurst;

  // Expansion radial con arrastre. La integral de v' = -kv da una exponencial:
  // sale disparada y se frena sola, que es como se comporta la materia.
  float spread = 1.0 - exp(-3.6 * e);

  // El radio tiene dos terminos y el reparto entre ellos es TODO.
  //
  // El primero es comun a todas: un frente unico que avanza. El segundo es la
  // dispersion individual. Con el reparto invertido -- poco comun, mucho
  // individual -- las particulas se reparten por el encuadre a densidad
  // uniforme y lo que se ve es una nevada, no una explosion. Una explosion se
  // reconoce por tener FRENTE: una cascara densa avanzando sobre un interior
  // que se vacia.
  //
  // Y la escala esta medida contra el encuadre. Con la camara donde esta, del
  // mundo solo se ven unas dos unidades y media de medio alto: una cascara de
  // radio cuatro no se lee como bola, se lee como estar DENTRO de ella, y por
  // dentro una cascara es una textura uniforme que tapa la pantalla. Que es
  // exactamente lo que parecia nieve.
  //
  // Se parte de aStart, no de 1.0. Sembrando solo en la superficie la nube sale
  // HUECA, y una cascara hueca deja un anillo oscuro entre el nucleo y la masa
  // que delata al instante que son particulas sobre una esfera. Sembrando en el
  // volumen, con avance cero la nube sigue siendo exactamente el disco -- que
  // es opaco, asi que por fuera no se distingue -- y al abrirse tiene relleno.
  float rad = aStart + spread * (0.55 + aSpeed * 1.7);

  // Turbulencia. Aproxima el curl noise con unas pocas sinusoides desfasadas
  // por semilla: suficiente para que no parezca confeti y, a diferencia de un
  // campo con estado, reversible.
  vec3 turb = vec3(
    sin(aSeed.x * 6.283 + rad * 1.7 + uTime * 0.22),
    sin(aSeed.y * 6.283 + rad * 1.3 - uTime * 0.17),
    sin(aSeed.z * 6.283 + rad * 2.1 + uTime * 0.19)
  );
  vec3 pos = aDir * rad + turb * (0.13 + aSpeed * 0.26) * spread;

  // Deriva ascendente: el humo sube, como en la referencia.
  pos.y += spread * spread * 0.45;

  vLife = clamp(spread, 0.0, 1.0);
  vSpeed = aSpeed;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  // Las que pasan cerca del objetivo se APAGAN. Sin esto, una particula a medio
  // metro de la camara ocupa media pantalla y se lee como suciedad en la lente:
  // son esos borrones azules desenfocados que ensuciaban el estallido entero.
  float near = smoothstep(0.7, 3.2, -mv.z);
  // Y se apagan tambien cuando entra el humo volumetrico, que toma el relevo.
  vFade = near * (1.0 - uSmoke * 0.82);

  // uSize es el radio de la particula en unidades de mundo, y uProjScale
  // convierte ese radio a pixeles a la distancia a la que esta. Sin ese factor
  // el tamano sale en unidades arbitrarias y las particulas acaban midiendo
  // menos de un pixel, que es como no dibujar nada.
  //
  // Crece poco con la edad. Crecer mucho era el otro origen de los borrones:
  // una particula que se multiplica por nueve deja de ser brasa y pasa a ser
  // mancha.
  //
  // El tamano va INVERSO a la velocidad, no proporcional. Un fragmento rapido es
  // una esquirla: pequena, dura y brillante, y son las que dibujan el frente.
  // La materia lenta es la que se queda dentro formando el cuerpo, y esa va
  // grande y difusa. Teniendolo al reves, las rapidas eran ademas las gordas y
  // el resultado era grumos separados en vez de un nucleo denso.
  gl_PointSize = uSize * (0.45 + (1.0 - aSpeed) * 0.95) * (1.0 + vLife * 1.4) * uPixelRatio * uProjScale / max(-mv.z, 0.001);
}
`;

const fragmentShader = /* glsl */ `
uniform float uBurst;
varying float vLife;
varying float vSpeed;
varying float vFade;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  // smoothstep con los bordes al reves es comportamiento indefinido en GLSL:
  // funciona en algunos drivers y devuelve cero en otros. Siempre ascendente.
  // Las rapidas van duras, como brasas; las lentas, difusas, como ceniza.
  // Caida suave, no disco con borde. Un disco con borde se ve COMO disco, y
  // mil discos visibles son palomitas, no materia.
  float soft = pow(1.0 - smoothstep(0.0, 0.5, d), 1.9);

  // Gradiente de vida: blanco, azul claro, azul profundo. El viraje ocurre
  // pronto y en poco recorrido, para que se lea como cambio de estado y no
  // como un degradado decorativo. La materia se enfria.
  vec3 col = mix(vec3(1.0), vec3(0.78, 0.90, 1.0), smoothstep(0.0, 0.12, vLife));
  col = mix(col, vec3(0.44, 0.72, 0.98), smoothstep(0.12, 0.30, vLife));
  col = mix(col, vec3(0.16, 0.34, 0.58), smoothstep(0.46, 1.0, vLife));

  float fade = 1.0 - smoothstep(0.62, 1.0, vLife);
  // Al nacer son energia y queman; al morir son materia y solo tapan.
  float birth = 1.0 - smoothstep(0.0, 0.22, vLife);
  // El frente pesa mas que el relleno: son las rapidas las que dibujan la
  // cascara, y si todas pesan igual la cascara no se ve.
  //
  // Pero cada una pesa POCO. Con brillo alto por particula cada punto satura a
  // blanco por su cuenta y lo que se ve son mil puntos; bajando el peso, lo que
  // se ve es la SUMA, que es una masa continua. Es la diferencia entre dibujar
  // particulas y dibujar una explosion.
  float peso = 0.10 + vSpeed * 0.80;

  gl_FragColor = vec4(col * (1.0 + birth * 1.4), soft * fade * peso * vFade * uBurst);
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
    const start = new Float32Array(count);
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

      // Distribucion muy sesgada: muchisimas lentas y pequenas, unas pocas
      // rapidas y grandes. Con un reparto uniforme la nube se lee como nieve;
      // lo que la hace explosion es que unas cuantas se adelanten al frente.
      speed[i] = Math.pow(Math.random(), 2.6);

      // Radio inicial uniforme EN VOLUMEN: la raiz cubica compensa que una
      // capa esferica tenga mas sitio cuanto mas lejos del centro. Con un
      // reparto lineal se amontonarian todas en el medio.
      start[i] = 0.14 + 0.86 * Math.cbrt(Math.random());
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aStart', new THREE.BufferAttribute(start, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 24);
    return geo;
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uBurst: { value: 0 },
      uSmoke: { value: 0 },
      uSize: { value: 0.026 },
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
      u.uSmoke.value = sceneState.smoke;
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
