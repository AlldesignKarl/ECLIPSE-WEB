/**
 * El reloj de la pieza.
 *
 * Todo lo que ocurre en ECLIPSE es una funcion pura de `t`, un valor entre 0 y 1
 * que el usuario arrastra con el scroll. Nada se anima por su cuenta salvo el
 * ruido temporal que hace respirar la materia.
 *
 * Este archivo es el guion: si cambia un numero aqui, cambia la pelicula.
 * Recalibrar el ritmo no deberia obligar a tocar ningun otro archivo.
 */

/** Los nueve estados, en tramos de `t`. */
export const T = {
  entrada: [0.0, 0.1],
  contacto: [0.1, 0.34],
  creciente: [0.34, 0.56],
  anillo: [0.56, 0.62],
  totalidad: [0.62, 0.76],
  estiramiento: [0.76, 0.82],
  fractura: [0.82, 0.86],
  ignicion: [0.86, 0.9],
  humo: [0.9, 1.0],
} as const;

/** Alto del contenedor que mide el tiempo. Mas alto = pieza mas lenta. */
export const STAGE_VH = 760;

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
// El hallazgo de la referencia que mas facil es pasar por alto: no usa el mismo
// easing en todo. Usa tres, y el contraste entre ellas es lo que se lee como
// masa, golpe y disipacion.

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
  /** Desplazamiento de la luna en X. 0 = alineada. */
  moonX: number;
  /** Distancia de camara. Baja = mas cerca. */
  cameraZ: number;
  /** Intensidad de la corona, 0 a 1. */
  corona: number;
  /** Alargamiento ecuatorial de la corona. 1 = circular. */
  coronaStretch: number;
  /** Luz ambiente del cielo. 1 = dia, 0 = totalidad. */
  skyLight: number;
  /** Opacidad de las estrellas. */
  stars: number;
  /** Grietas de luz sobre el disco, 0 a 1. */
  cracks: number;
  /** Opacidad del disco lunar. Se retira cuando el plasma ya ha salido. */
  disc: number;
  /** Avance de la explosion, 0 a 1. Gobierna las particulas. */
  burst: number;
  /** Densidad del humo, 0 a 1. */
  smoke: number;
  /** Pico del anillo de diamante, 0 a 1. */
  diamond: number;
  /** Golpe de luz de la ignicion, 0 a 1. Sube de golpe y se apaga enseguida. */
  flash: number;
  /** Enfriamiento de la materia, 0 a 1. Sube con la fractura y no baja. */
  cool: number;
  /** Visibilidad de la fotosfera: se apaga al fracturarse. */
  photosphere: number;
  /** Opacidad del wordmark en la escena. */
  wordmark: number;
}

export function evaluate(t: number): EclipseState {
  const anillo = stage(t, 'anillo');
  const estiramiento = stage(t, 'estiramiento');
  const fractura = stage(t, 'fractura');
  const ignicion = stage(t, 'ignicion');
  const humo = stage(t, 'humo');

  // La luna entra desde fuera de plano y toca el borde del sol exactamente en
  // t = 0.10, que es donde empieza el tramo que se llama primer contacto. No la
  // sacamos despues: en cuanto hay totalidad, ahi se queda.
  const moonX =
    t < T.contacto[0]
      ? mix(7.6, 2.04, easeInOut(span(t, 0, T.contacto[0])))
      : mix(2.04, 0, easeGrowth(span(t, T.contacto[0], T.anillo[1])));

  // La camara avanza de verdad durante todo el acto I. En la ignicion retrocede
  // cuatro grados de golpe, como si la onda empujara al espectador.
  const dolly = easeGrowth(span(t, 0, T.anillo[1]));
  const kick = easeStep(ignicion) * (1 - easeSettle(humo) * 0.55);
  const pull = easeSettle(humo);
  const cameraZ = mix(7.4, 5.5, dolly) + kick * 0.9 + pull * 2.8;

  // La corona aparece ya azul en el primer contacto: el color se anuncia cinco
  // actos antes de cumplirse.
  const coronaRise = easeGrowth(span(t, T.contacto[0], T.totalidad[0]));
  const coronaFade = 1 - easeStep(ignicion) * 0.85 - easeSettle(humo) * 0.15;
  const corona = clamp01(coronaRise * Math.max(0, coronaFade));

  // Estiramiento: la silueta pasa de vertical a panoramica antes de estallar.
  const coronaStretch = mix(1, 2.7, easeInOut(estiramiento));

  const skyLight = 1 - easeGrowth(span(t, T.contacto[0], T.totalidad[0])) * 0.97;
  const stars = easeGrowth(span(t, T.creciente[0], T.totalidad[0]));

  // El anillo de diamante es un pico, no una meseta: sube y baja dentro del tramo.
  const diamond = Math.sin(Math.PI * anillo) ** 2;

  const cracks = easeInOut(fractura) * (1 - easeStep(ignicion));

  // El enfriamiento NO puede ir atado a las grietas: estas se apagan con la
  // ignicion, asi que en el momento del estallido el valor vale casi cero y el
  // ambar sigue ahi, dando el pardo sucio. Esto sube con la fractura y se queda.
  const cool = easeInOut(fractura);

  // La explosion y el humo comparten un unico avance continuo, para que las
  // particulas no den un salto al cruzar de un tramo al otro.
  const burst = clamp01(easeStep(ignicion) * 0.45 + easeSettle(humo) * 0.55);
  const smoke = easeSettle(humo);

  // El estallido se VE antes de entenderse: la luz llega primero y la materia
  // despues. Sube de golpe con la ignicion y se apaga en el primer tercio del
  // humo, para que no quede un resplandor flotando sobre la nube.
  const flash = clamp01(easeStep(ignicion) * (1 - easeSettle(humo) * 1.8));

  // La fotosfera se apaga cuando el disco se cuartea, no antes.
  const photosphere = 1 - easeInOut(fractura) * 0.35 - easeStep(ignicion) * 0.65;

  // El disco que se ve en totalidad es la luna, no el sol: es a ella a la que
  // le salen las grietas. Y se retira TARDE, cuando el plasma ya esta fuera:
  // durante unos fotogramas conviven disco y explosion, y esa convivencia es la
  // razon de que se lea como materia y no como un cambio de imagen.
  const disc = clamp01(1 - (burst - 0.08) / 0.42);

  // El wordmark vive con el disco y se retira al empezar la totalidad, cuando
  // le cede el sitio al manifiesto.
  const wordmark = clamp01(1 - easeInOut(span(t, T.anillo[0], T.totalidad[0] + 0.04)));

  return {
    t,
    moonX,
    cameraZ,
    corona,
    coronaStretch,
    skyLight,
    stars,
    cracks,
    cool,
    disc,
    burst,
    smoke,
    diamond,
    flash,
    photosphere: clamp01(photosphere),
    wordmark,
  };
}

/**
 * Umbral con banda muerta. Los tramos caros (sembrar particulas, compilar el
 * humo) se encienden y se apagan con histeresis, para que un scroll nervioso
 * arriba y abajo no los dispare en bucle.
 */
export function hysteresis(current: boolean, value: number, on: number, off: number) {
  if (!current && value >= on) return true;
  if (current && value <= off) return false;
  return current;
}
