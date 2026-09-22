// El guion de la experiencia: cuando ocurre cada cosa a lo largo del scroll.
//
// Se escribe en vh de recorrido (lo que el usuario desplaza) y se exporta en
// fracciones del escenario (0..1), que es lo que manejan WebGL y GSAP. Cambiar
// el ritmo de la pieza se hace aqui y en ningun otro sitio.
//
// La escultura se construye fragmento a fragmento: cada uno tiene su propia
// ventana de scroll y la siguiente empieza cuando la anterior va por algo mas
// de la mitad. Asi nunca hay mas de dos piezas en movimiento y el ojo puede
// seguir cada una hasta que encaja.

import data from './shards.json';

export interface ShardDef {
  id: number;
  box: [number, number, number, number];
  c: [number, number];
  a: number;
}
export interface ShardData {
  w: number;
  h: number;
  count: number;
  shards: ShardDef[];
  order: number[];
}
export const SHARDS = data as unknown as ShardData;

const VH = {
  heroOut: [3, 38] as const, // la portada se retira
  buildStart: 16, // el primer fragmento echa a volar
  strideFirst: 24, // separacion entre salidas al principio (piezas grandes)...
  strideLast: 12, // ...y al final (piezas pequenas): el ritmo se aviva
  travel: 1.75, // cada viaje dura esto por la separacion: solapes de a dos
  lastPause: 14, // respiro antes de la ultima pieza, el rostro
  lastTravel: 46, // y su viaje, mas lento
  hold: 90, // escultura completa, quieta, antes del primer texto
  pieceMove: 56, // la escultura se aparta y entra el texto
  pieceGap: 126, // de un texto al siguiente
  tail: 98, // tras el segundo texto, hasta soltar el escenario
};

const n = SHARDS.count;
const windowsVh: [number, number][] = [];
let t = VH.buildStart;
for (let k = 0; k < n; k++) {
  const last = k === n - 1;
  const stride = VH.strideFirst + (VH.strideLast - VH.strideFirst) * Math.pow(k / Math.max(1, n - 2), 0.9);
  if (last) t += VH.lastPause;
  const travel = last ? VH.lastTravel : stride * VH.travel;
  windowsVh.push([t, t + travel]);
  t += stride;
}
const buildEnd = Math.max(...windowsVh.map((w) => w[1]));
const holdEnd = buildEnd + VH.hold;
const pieceA0 = holdEnd;
const pieceB0 = pieceA0 + VH.pieceGap;
const total = pieceB0 + VH.pieceMove + VH.tail;

const f = (vh: number) => vh / total;

export const SCRIPT = {
  /** Recorrido total del escenario, en vh. La seccion mide esto mas una pantalla. */
  totalVh: total,
  /** Convierte vh de recorrido a fraccion del escenario. */
  f,
  heroOut: [f(VH.heroOut[0]), f(VH.heroOut[1])] as const,
  buildStart: f(VH.buildStart),
  buildEnd: f(buildEnd),
  /** Ventana [inicio, llegada] de cada paso del montaje, en orden de montaje. */
  windows: windowsVh.map(([a, b]) => [f(a), f(b)] as const),
  hold: [f(buildEnd), f(holdEnd)] as const,
  sweep: [f(buildEnd + 16), f(buildEnd + 80)] as const,
  pieceA: [f(pieceA0), f(pieceA0 + VH.pieceMove)] as const,
  pieceB: [f(pieceB0), f(pieceB0 + VH.pieceMove)] as const,
};
