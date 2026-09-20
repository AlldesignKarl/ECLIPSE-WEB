import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { sceneState } from './state';

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
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const current = useRef(7.4);

  // En vertical no encogemos la escena: cambiamos el encuadre. La camara mira
  // por debajo del disco, que sube al tercio superior y deja sitio al texto.
  const portrait = size.height > size.width * 1.05;

  useFrame((_, delta) => {
    const target = sceneState.cameraZ * (portrait ? 1.24 : 1);
    // Un segundo amortiguamiento, mas suave que el del scroll: la camara llega
    // siempre un poco tarde y eso es lo que se percibe como peso.
    const k = 1 - Math.pow(1 - 0.12, delta * 60);
    current.current += (target - current.current) * k;
    camera.position.set(0, 0, current.current);
    camera.lookAt(0, portrait ? -0.62 : 0, 0);
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
