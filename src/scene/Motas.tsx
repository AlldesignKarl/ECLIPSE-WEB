import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sceneState } from './state';
import { detectProfile } from './profile';

/**
 * Motas de luz.
 *
 * El vacio alrededor del eclipse estaba muerto: fondo negro, estrellas fijas y
 * nada mas durante todo el tramo de lectura, que es medio minuto. En vertical
 * se notaba el doble, porque el disco ocupa la mitad del ancho y sobra pantalla
 * por arriba y por abajo.
 *
 * Son polvo iluminado por la corona, no chispas: van despacio, no parpadean y
 * apenas pesan. El movimiento tiene que estar por debajo del umbral de
 * atencion; en cuanto se mira una mota y se la sigue, deja de ser atmosfera y
 * pasa a ser un adorno.
 *
 * Se colocan EN EL FRUSTUM, no en una caja de mundo fija. Cada mota calcula el
 * medio ancho y el medio alto que hay a su propia profundidad, de modo que el
 * campo llena el encuadre exacto sea cual sea la proporcion de la pantalla. Una
 * caja fija se queda corta en panoramico y se desperdicia entera en vertical.
 */

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uCamZ;
uniform float uTanHalf;
uniform float uAspect;
uniform float uSize;
uniform float uPixelRatio;
uniform float uProjScale;
attribute vec3 aSeed;
attribute float aDepth;
attribute float aSpeed;
varying float vBorde;
varying float vSeed;

void main() {
  float z = aDepth;
  float dist = max(uCamZ - z, 0.001);
  float medioAlto = uTanHalf * dist;
  float medioAncho = medioAlto * uAspect;

  // Deriva lenta y continua. fract() envuelve el recorrido, asi que el campo es
  // infinito con un numero fijo de puntos.
  float u = fract(aSeed.x + uTime * 0.0045 * (0.35 + aSpeed));
  float v = fract(aSeed.y + uTime * 0.0132 * (0.30 + aSpeed));

  // Un vaiven lateral desfasado por semilla: sin el, todas suben en paralelo y
  // se lee como una cortina cayendo hacia arriba.
  float vaiven = sin(aSeed.z * 6.283 + uTime * 0.21 * (0.5 + aSpeed)) * 0.035;

  // El 1.14 desborda el encuadre a proposito: el salto de fract() ocurre fuera
  // de pantalla, donde no se ve aparecer ni desaparecer nada.
  float x = ((u * 2.0 - 1.0) + vaiven) * medioAncho * 1.14;
  float y = (v * 2.0 - 1.0) * medioAlto * 1.14;

  // Y aun asi se apagan por el borde, por si el redondeo deja el salto dentro.
  vBorde = (1.0 - smoothstep(0.80, 1.0, abs(x) / (medioAncho * 1.14)))
         * (1.0 - smoothstep(0.80, 1.0, abs(y) / (medioAlto * 1.14)));
  vSeed = aSeed.z;

  vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.45 + aSpeed) * uPixelRatio * uProjScale / max(-mv.z, 0.001);
}
`;

const fragmentShader = /* glsl */ `
uniform float uAmb;
uniform float uTime;
varying float vBorde;
varying float vSeed;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;

  // Nucleo con halo: una mota plana se lee como un pixel muerto.
  float nucleo = pow(1.0 - smoothstep(0.0, 0.30, d), 2.2);
  float halo = pow(1.0 - smoothstep(0.0, 0.5, d), 1.4);

  // Respiracion larguisima y desfasada, no parpadeo. Un parpadeo rapido llama
  // la atencion; esto solo hace que el campo no parezca congelado.
  float respira = 0.68 + 0.32 * sin(uTime * 0.55 + vSeed * 6.283);

  vec3 col = mix(vec3(0.46, 0.62, 0.86), vec3(0.88, 0.94, 1.0), nucleo);
  float i = (nucleo * 0.85 + halo * 0.22) * respira * vBorde * uAmb;

  gl_FragColor = vec4(col * i, 1.0);
}
`;

export function Motas() {
  const profile = detectProfile();
  const count = profile.fullPost ? (profile.maxDpr > 1.8 ? 320 : 210) : 110;
  const points = useRef<THREE.Points>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const dpr = useThree((s) => s.viewport.dpr);

  const geometry = useMemo(() => {
    const seed = new Float32Array(count * 3);
    const depth = new Float32Array(count);
    const speed = new Float32Array(count);
    const position = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      seed[i * 3] = Math.random();
      seed[i * 3 + 1] = Math.random();
      seed[i * 3 + 2] = Math.random();
      // Reparto en profundidad: es lo que da paralaje cuando la camara avanza.
      // Sesgado hacia atras para que pocas pasen cerca y no tapen el disco.
      depth[i] = -7.5 + Math.pow(Math.random(), 0.7) * 9.5;
      speed[i] = Math.pow(Math.random(), 1.8);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
    return geo;
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCamZ: { value: 7 },
      uTanHalf: { value: 0.384 },
      uAspect: { value: 1.7 },
      uSize: { value: 0.016 },
      uPixelRatio: { value: 1 },
      uProjScale: { value: 1000 },
      uAmb: { value: 0 },
    }),
    [],
  );

  useFrame((state, delta) => {
    const u = material.current?.uniforms;
    if (u) {
      const camera = state.camera as THREE.PerspectiveCamera;
      u.uTime.value += delta;
      u.uCamZ.value = camera.position.z;
      u.uTanHalf.value = Math.tan((camera.fov * Math.PI) / 360);
      u.uAspect.value = state.size.width / Math.max(state.size.height, 1);
      u.uPixelRatio.value = dpr;
      u.uProjScale.value = state.size.height / (2 * Math.tan((camera.fov * Math.PI) / 360));

      // Entran con las estrellas y se apagan en cuanto estalla: a partir de ahi
      // la pantalla ya tiene toda la luz que necesita.
      const amb = Math.max(0, 1 - sceneState.burst * 2.4) * (0.25 + 0.75 * sceneState.stars);
      u.uAmb.value = amb;
      if (points.current) points.current.visible = amb > 0.004;
    }
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false} renderOrder={-8}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}
