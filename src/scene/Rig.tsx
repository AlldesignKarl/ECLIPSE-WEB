import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { sceneState } from './state';

/** Medio ancho de mundo que tiene que caber en pantalla, pase lo que pase. */
const ENCUADRE = 1.95;

/** Distancia nominal de la camara en horizontal, con la que se calibro todo. */
const BASE_Z = 6.6;

/**
 * La camara.
 *
 * La referencia hace crecer el objeto y deja la camara quieta. Nosotros hacemos
 * lo contrario: el disco no cambia de tamano, la camara avanza. Un objeto que
 * escala se lee como un zoom de imagen; una camara que avanza se lee como
 * espacio. Es mas caro y es la diferencia entre volumetrico y plano.
 *
 * En la ignicion retrocede de golpe, como si la onda empujara al espectador.
 */
export function Rig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const current = useRef(7.4);

  useFrame((_, delta) => {
    // El encuadre se calcula, no se elige con un interruptor.
    //
    // En Three el campo de vision es VERTICAL. En una pantalla alta y estrecha
    // la altura visible es la misma pero el ancho se encoge con la proporcion,
    // asi que el disco se sale por los lados aunque en horizontal quepa de
    // sobra. Ahi estaba el recorte del movil: con un multiplicador fijo de 1.24
    // el medio ancho visible quedaba en 1.45 unidades y el disco solo ya mide
    // 1.11. No cabia, y el wordmark, de 8.6 de ancho, menos todavia.
    //
    // Asi que la camara se retira lo justo para que quepan ENCUADRE unidades de
    // ancho, sea cual sea la proporcion. Una sola formula cubre el movil en
    // vertical, la tableta, el portatil y el monitor panoramico, y lo hace de
    // forma continua: no hay un salto al cruzar un punto de ruptura.
    const aspecto = size.width / Math.max(size.height, 1);
    const medioFov = (camera.fov * Math.PI) / 360;
    const zEncuadre = ENCUADRE / (Math.tan(medioFov) * Math.max(aspecto, 0.01));

    // Nunca acerca, solo retira: en horizontal el resultado es exactamente el
    // de antes. Y multiplica en vez de sustituir, para que el avance y el
    // retroceso de la camara del guion se conserven enteros en vertical.
    const encuadre = Math.max(1, zEncuadre / BASE_Z);
    const target = sceneState.cameraZ * encuadre;

    // Un segundo amortiguamiento, mas suave que el del scroll: la camara llega
    // siempre un poco tarde y eso es lo que se percibe como peso.
    const k = 1 - Math.pow(1 - 0.12, delta * 60);
    current.current += (target - current.current) * k;
    camera.position.set(0, 0, current.current);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/**
 * Resolucion dinamica.
 *
 * Si el fotograma medio se pasa de presupuesto durante un segundo, baja la
 * densidad de pixeles un escalon. Si se mantiene holgado, la recupera. La pieza
 * nunca se ralentiza: se ablanda.
 */
export function AdaptiveResolution({ max }: { max: number }) {
  const setDpr = useThree((s) => s.setDpr);
  const dpr = useThree((s) => s.viewport.dpr);
  const acc = useRef({ time: 0, frames: 0, cooldown: 0 });

  useFrame((_, delta) => {
    const a = acc.current;
    a.time += delta;
    a.frames += 1;
    if (a.cooldown > 0) a.cooldown -= delta;
    if (a.time < 1) return;

    const avgMs = (a.time / a.frames) * 1000;
    a.time = 0;
    a.frames = 0;
    if (a.cooldown > 0) return;

    if (avgMs > 18 && dpr > 1) {
      setDpr(Math.max(1, Math.round((dpr - 0.25) * 100) / 100));
      a.cooldown = 2;
    } else if (avgMs < 13 && dpr < max) {
      setDpr(Math.min(max, Math.round((dpr + 0.25) * 100) / 100));
      a.cooldown = 3;
    }
  });

  return null;
}
