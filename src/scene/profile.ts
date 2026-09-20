/**
 * Perfiles de dispositivo.
 *
 * Tres calidades decididas una sola vez, al arrancar. No es la misma escena mas
 * pequena: es la misma pelicula rodada con menos camaras.
 */

export type Tier = 'high' | 'mid' | 'low';

export interface Profile {
  tier: Tier;
  /** Numero de particulas de la explosion. */
  particles: number;
  /** Planos billboard de humo. */
  smokePlanes: number;
  /** Muestras radiales de la corona. */
  coronaSteps: number;
  /** Tope de densidad de pixeles. */
  maxDpr: number;
  /** Postproceso completo (aberracion cromatica y vineta ademas de bloom). */
  fullPost: boolean;
}

const PROFILES: Record<Tier, Profile> = {
  high: { tier: 'high', particles: 180000, smokePlanes: 40, coronaSteps: 32, maxDpr: 2, fullPost: true },
  mid: { tier: 'mid', particles: 90000, smokePlanes: 28, coronaSteps: 20, maxDpr: 1.75, fullPost: true },
  low: { tier: 'low', particles: 45000, smokePlanes: 16, coronaSteps: 12, maxDpr: 1.5, fullPost: false },
};

function rendererString(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    return '';
  }
}

let cached: Profile | null = null;

/**
 * `?q=low`, `?q=mid` o `?q=high` fuerzan un perfil.
 *
 * Sirve para ver como queda la pieza en gama baja sin tener un movil delante, y
 * para poder capturarla en maquinas sin GPU, donde el perfil alto tarda mas de
 * medio minuto por fotograma.
 */
function forcedTier(): Tier | null {
  const q = new URLSearchParams(window.location.search).get('q');
  return q === 'low' || q === 'mid' || q === 'high' ? q : null;
}

export function detectProfile(): Profile {
  if (cached) return cached;

  const forced = forcedTier();
  if (forced) {
    cached = PROFILES[forced];
    return cached;
  }

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 820;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const gpu = rendererString().toLowerCase();

  // Graficas integradas antiguas y moviles van al perfil bajo directamente, sin
  // esperar a medir: medir cuesta un segundo de pieza entrecortada.
  const weakGpu = /swiftshader|llvmpipe|mali-4|adreno [1-4]|powervr/.test(gpu);

  let tier: Tier;
  if (coarse && narrow) tier = 'low';
  else if (weakGpu || cores <= 4 || memory <= 4) tier = 'mid';
  else tier = 'high';

  cached = PROFILES[tier];
  return cached;
}

export function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/**
 * Sin WebGL2 se cae a WebGL1 con el perfil bajo. Sin WebGL ninguno se sirve un
 * poster estatico: la pagina sigue siendo legible y vendible.
 */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
