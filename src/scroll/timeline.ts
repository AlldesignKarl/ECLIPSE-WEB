/**
 * El reloj de la pieza.
 *
 * Todo lo que ocurre en ECLIPSE es una funcion pura de `t`, un valor entre 0 y
 * 1 que el usuario arrastra con el scroll. Nada se anima por su cuenta salvo el
 * ruido temporal que hace respirar la materia.
 *
 * Este archivo es el guion: si cambia un numero aqui, cambia la pelicula.
 * Recalibrar el ritmo no deberia obligar a tocar ningun otro archivo.
 *
 * El eclipse YA ESTA FORMADO cuando entras. No hay sol pleno, ni primer
 * contacto, ni creciente, ni anillo de diamante: eso era un fenomeno
 * astronomico contado en orden, y tardaba demasiado en llegar a lo que
 * importa. Ahora el scroll GIRA el eclipse y va revelando lo que hacemos.
 */

/** Los estados, en tramos de `t`. */
export const T = {
  apertura: [0.0, 0.1],
  bloque1: [0.1, 0.32],
  bloque2: [0.32, 0.54],
  bloque3: [0.54, 0.74],
  carga: [0.74, 0.84],
  fractura: [0.84, 0.88],
  ignicion: [0.88, 0.93],
  humo: [0.93, 1.0],
} as const;

/** Alto del contenedor que mide el tiempo. Mas alto = pieza mas lenta. */
export const STAGE_VH = 720;

/** Factor de amortiguamiento del scroll, por fotograma a 60 Hz. */
export const DAMPING = 0.085;

// --- utilidades -------------------------------------------------------------

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Progreso normalizado dentro de un tramo. */
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/** Progreso dentro de uno de los estados con nombre. */
export const stage = (t: number, key: keyof typeof T) => span(t, T[key][0], T[key][1]);

export const mix = (a: number, b: number, x: number) => a + (b - a) * x;

// --- las tres curvas --------------------------------------------------------
//
// No se usa el mismo easing en todo. El contraste entre estas tres es lo que se
// lee como masa, golpe y disipacion.

/** Crecimiento: casi lineal, con la salida apenas suavizada. */
export const easeGrowth = (x: number) => 1 - Math.pow(1 - x, 1.7);

/** Ignicion: escalon. Casi todo el recorrido ocurre en el primer 30 %. */
export const easeStep = (x: number) => 1 - Math.pow(1 - x, 6);

/** Humo: amortiguamiento largo, nunca llega del todo. */
const K = 4.2;
export const easeSettle = (x: number) => (1 - Math.exp(-K * x)) / (1 - Math.exp(-K));

/** Suavizado simetrico, para lo que entra y sale. */
export const easeInOut = (x: number) => x * x * (3 - 2 * x);

// --- el estado de la escena, derivado de t ----------------------------------

export interface EclipseState {
  t: number;
  /** Giro del eclipse en radianes. Es lo que avanza con el scroll. */
  spin: number;
  /** Distancia de camara. Baja = mas cerca. */
  cameraZ: number;
  /** Intensidad de la corona, 0 a 1. */
  corona: number;
  /** Alargamiento de la corona. 1 = circular. */
  coronaStretch: number;
  /** Intensidad del destello que atraviesa el disco, 0 a 1. */
  streak: number;
  /** Opacidad de las estrellas. */
  stars: number;
  /** Grietas de luz sobre el disco, 0 a 1. */
  cracks: number;
  /** Enfriamiento de la materia, 0 a 1. Sube con la fractura y no baja. */
  cool: number;
  /** Opacidad del disco. Se retira cuando el plasma ya ha salido. */
  disc: number;
  /** Avance de la explosion, 0 a 1. Gobierna las particulas. */
  burst: number;
  /** Densidad del humo, 0 a 1. */
  smoke: number;
  /** Golpe de luz de la ignicion, 0 a 1. */
  flash: number;
  /** Opacidad del wordmark en la escena. */
  wordmark: number;
}

export function evaluate(t: number): EclipseState {
  const carga = stage(t, 'carga');
  const fractura = stage(t, 'fractura');
  const ignicion = stage(t, 'ignicion');
  const humo = stage(t, 'humo');

  // El giro es el motor de la pieza: avanza de forma continua durante todo el
  // recorrido de lectura y se frena al llegar la carga, como si el objeto se
  // tensara antes de romperse.
  const spin = easeGrowth(span(t, 0, T.carga[1])) * 2.35;

  // La camara avanza despacio durante la lectura y retrocede de golpe en la
  // ignicion, como si la onda empujara al espectador.
  const dolly = easeGrowth(span(t, 0, T.carga[0]));
  const kick = easeStep(ignicion) * (1 - easeSettle(humo) * 0.55);
  const pull = easeSettle(humo);
  const cameraZ = mix(6.6, 5.4, dolly) + kick * 0.9 + pull * 2.9;

  // La corona esta desde el primer fotograma: el eclipse ya esta formado.
  const coronaFade = 1 - easeStep(ignicion) * 0.85 - easeSettle(humo) * 0.15;
  const corona = clamp01(Math.max(0, coronaFade));

  // Al cargarse, el anillo se estira hacia el ecuador y el encuadre pasa de
  // vertical a panoramico. Avisa al ojo de que va a pasar algo.
  const coronaStretch = mix(1, 2.5, easeInOut(carga));

  // El destello que atraviesa el disco. Se intensifica con la carga.
  const streak = clamp01(0.55 + easeInOut(carga) * 0.45) * (1 - easeStep(ignicion));

  const stars = easeGrowth(span(t, 0, 0.04));

  const cracks = easeInOut(fractura) * (1 - easeStep(ignicion));
  const cool = easeInOut(fractura);

  // La explosion y el humo comparten un unico avance continuo, para que las
  // particulas no den un salto al cruzar de un tramo al otro.
  const burst = clamp01(easeStep(ignicion) * 0.45 + easeSettle(humo) * 0.55);
  const smoke = easeSettle(humo);

  // El estallido se VE antes de entenderse: la luz llega primero y la materia
  // despues. Se apaga en el primer tercio del humo.
  const flash = clamp01(easeStep(ignicion) * (1 - easeSettle(humo) * 1.8));

  // El disco se retira TARDE, cuando el plasma ya esta fuera: durante unos
  // fotogramas conviven, y esa convivencia es la razon de que se lea como
  // materia y no como un cambio de imagen.
  const disc = clamp01(1 - (burst - 0.08) / 0.42);

  // El wordmark abre la pieza y se retira en cuanto empieza a hablar.
  const wordmark = clamp01(1 - easeInOut(span(t, T.apertura[1], T.bloque1[0] + 0.06)));

  return {
    t,
    spin,
    cameraZ,
    corona,
    coronaStretch,
    streak,
    stars,
    cracks,
    cool,
    disc,
    burst,
    smoke,
    flash,
    wordmark,
  };
}

/**
 * Umbral con banda muerta. Los tramos caros se encienden y se apagan con
 * histeresis, para que un scroll nervioso arriba y abajo no los dispare en
 * bucle.
 */
export function hysteresis(current: boolean, value: number, on: number, off: number) {
  if (!current && value >= on) return true;
  if (current && value <= off) return false;
  return current;
}
