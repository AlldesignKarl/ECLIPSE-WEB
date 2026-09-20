import { DAMPING, clamp01 } from './timeline';
import { updateSceneState } from '../scene/state';

/**
 * La cabeza lectora.
 *
 * Un unico bucle lee el scroll nativo, lo amortigua y publica `t`. Nadie mas
 * toca el scroll: no hay preventDefault, ni saltos a seccion, ni secuestro del
 * gesto. El usuario conserva su rueda, su trackpad y su barra.
 */

type Listener = (t: number, dt: number) => void;

export const scroll = {
  /** Progreso crudo del contenedor, 0 a 1. */
  raw: 0,
  /** Progreso amortiguado. Es el que gobierna la escena. */
  t: 0,
  /** Verdadero si el sistema pide movimiento reducido. */
  reduced: false,
};

/**
 * Congelar la pieza en un fotograma exacto: `?t=0.68`.
 *
 * Es la herramienta de direccion. Sirve para sacar capturas exactas de
 * cualquier estado sin pelearse con el amortiguamiento, y es imprescindible
 * para afinar: si esperas a que el scroll converja, en una maquina lenta nunca
 * converge y acabas juzgando un fotograma que no es el que crees.
 */
function frozenT(): number | null {
  const raw = new URLSearchParams(window.location.search).get('t');
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? clamp01(value) : null;
}

let frozen: number | null = null;

/** Los cuatro estados que se sirven cuando el sistema pide movimiento reducido. */
const REDUCED_STEPS = [0, 0.3, 0.68, 0.94];

const listeners = new Set<Listener>();
let stageEl: HTMLElement | null = null;
let frame = 0;
let last = 0;

function readRaw(): number {
  if (!stageEl) return 0;
  const rect = stageEl.getBoundingClientRect();
  const travel = rect.height - window.innerHeight;
  if (travel <= 0) return 0;
  return clamp01(-rect.top / travel);
}

function loop(now: number) {
  // Delta acotado: una pestana que vuelve del fondo no debe teletransportar la
  // escena entera de golpe.
  const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
  last = now;

  if (frozen !== null) {
    scroll.raw = frozen;
    scroll.t = frozen;
    updateSceneState(scroll.t);
    for (const listener of listeners) listener(scroll.t, dt);
    frame = requestAnimationFrame(loop);
    return;
  }

  scroll.raw = readRaw();

  if (scroll.reduced) {
    // Movimiento reducido: el eclipse cambia de estado por pasos discretos al
    // entrar cada seccion, sin escrubado continuo ni explosion. No es una
    // version degradada por descuido, es la que se sirve a quien la pide.
    const i = Math.min(REDUCED_STEPS.length - 1, Math.floor(scroll.raw * REDUCED_STEPS.length));
    scroll.t = REDUCED_STEPS[i];
  } else {
    // Normalizado por delta-time: sin esto, un monitor de 120 Hz reproduce la
    // pieza al doble de velocidad.
    const k = 1 - Math.pow(1 - DAMPING, dt * 60);
    scroll.t += (scroll.raw - scroll.t) * k;
  }

  // El estado de la escena se deriva ANTES de avisar a nadie, para que la capa
  // 3D y la capa de DOM lean exactamente el mismo fotograma.
  updateSceneState(scroll.t);
  for (const listener of listeners) listener(scroll.t, dt);
  frame = requestAnimationFrame(loop);
}

export function attachStage(el: HTMLElement | null) {
  stageEl = el;
  if (el && !frame) {
    scroll.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    frozen = frozenT();
    scroll.raw = frozen ?? readRaw();
    scroll.t = scroll.raw;
    updateSceneState(scroll.t);
    frame = requestAnimationFrame(loop);
  }
  if (!el && frame) {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
