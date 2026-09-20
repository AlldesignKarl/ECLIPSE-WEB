/**
 * Ruido compartido por todos los shaders de la escena.
 *
 * Ruido de gradiente 3D basado en hash. Todo procedural: ni una textura en la
 * carga inicial, y el eclipse aguanta cualquier acercamiento de camara sin
 * revelar pixeles.
 */
export const NOISE_GLSL = /* glsl */ `
// Los gradientes van NORMALIZADOS. Sin normalizar, su longitud varia entre casi
// cero y la raiz de tres, el ruido deja de tener media cero y se sesga a
// positivo; luego cualquier umbral que pongas encima satura en casi todo el
// campo y la estructura se aplana. Se nota sobre todo en la corona, donde las
// plumas desaparecen y queda un degradado radial liso.
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  vec3 h = -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  // El epsilon evita el NaN en el caso, improbable pero posible, de que las tres
  // componentes salgan exactamente a cero.
  return h / max(length(h), 1e-4);
}

float gnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dot(hash33(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0)),
                     dot(hash33(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0)), u.x),
                 mix(dot(hash33(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0)),
                     dot(hash33(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0)), u.x), u.y),
             mix(mix(dot(hash33(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0)),
                     dot(hash33(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0)), u.x),
                 mix(dot(hash33(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0)),
                     dot(hash33(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0)), u.x), u.y), u.z);
}

float fbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * gnoise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return sum;
}

// Deformacion de dominio: es lo que convierte un ruido plano en celdas de
// conveccion con aspecto de materia.
float warpedFbm(vec3 p, float warp, int octaves) {
  vec3 q = vec3(fbm(p, 3), fbm(p + vec3(5.2, 1.3, 2.7), 3), fbm(p + vec3(1.7, 9.2, 4.1), 3));
  return fbm(p + warp * q, octaves);
}

// Dithering ordenado. Sin esto, cualquier degradado oscuro hace bandas en OLED.
float dither(vec2 fragCoord) {
  return fract(sin(dot(fragCoord, vec2(12.9898, 78.233))) * 43758.5453) / 255.0;
}
`;
