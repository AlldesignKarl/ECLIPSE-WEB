// Shaders de la experiencia de Alldesign Karl.
//
// Todo trabaja en espacio sRGB, sin conversiones: las texturas se suben tal
// cual (NoColorSpace) y el renderer no corrige la salida. Asi el fotograma
// final de la escultura es, pixel a pixel, la fotografia recortada.

const NOISE = /* glsl */ `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      a *= 0.5;
    }
    return v;
  }
`;

// ---------------------------------------------------------------------------
// Fondo: seda marfil con filamentos de luz calida, como la foto de campana.
// ---------------------------------------------------------------------------
export const silkVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
  }
`;

export const silkFragment = /* glsl */ `
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uCalm;
  uniform vec2 uMouse;
  uniform vec3 uFocus;   // xy: centro de la escultura en pantalla (-1..1), z: intensidad
  varying vec2 vUv;
  ${NOISE}

  void main() {
    float aspect = uRes.x / uRes.y;
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
    float t = uTime * 0.03;

    // Campo de flujo: la tela corre en diagonal, de abajo a la izquierda hacia
    // arriba a la derecha, con pliegues largos que se desplazan muy despacio.
    vec2 q = p + uMouse * 0.015;
    q += 0.5 * (vec2(fbm(q * 0.9 + vec2(t, -t)), fbm(q * 0.9 + vec2(5.2 - t, 1.3 + t))) - 0.5);
    float band = q.y - q.x * 0.48 + 0.22 * sin(q.x * 1.7 + t * 2.0);

    // Relieve del raso: tres familias de ondas. Se sombrea con la pendiente,
    // no con la altura: asi aparecen crestas con luz y valles con sombra.
    float m2 = 0.4 + 0.6 * smoothstep(0.3, 0.62, fbm(q * 1.5 + vec2(3.0, -1.0)));
    float m3 = 0.3 + 0.7 * smoothstep(0.32, 0.62, fbm(q * 2.2 + vec2(-4.0, 2.0)));
    float ph1 = band * 7.0 + fbm(q * 1.1 + 2.0) * 1.2;
    float ph2 = band * 19.0 - q.x * 1.2 + fbm(q * 1.3 + 7.0) * 1.6;
    float ph3 = band * 44.0 + fbm(q * 1.7 + vec2(1.0, -3.0)) * 2.2;
    float sl = cos(ph1) + cos(ph2) * 0.6 * m2 + cos(ph3) * 0.35 * m3;
    float diff = tanh(sl * 0.9);

    // Hebras de luz: el brillo especular aparece donde la pendiente coincide
    // con la luz, en lineas finas que siguen los pliegues.
    float spec = exp(-pow((sl - 0.95) / 0.12, 2.0))
               + 0.55 * exp(-pow((sl - 0.45) / 0.09, 2.0))
               + 0.3 * exp(-pow((sl + 0.25) / 0.07, 2.0));
    spec *= 0.4 + 0.6 * m3;
    float sheen = pow(max(sl, 0.0), 2.0) * 0.25;

    vec3 deep  = vec3(0.780, 0.670, 0.530);   // pliegue en sombra
    vec3 cream = vec3(0.940, 0.905, 0.852);   // marfil
    vec3 light = vec3(1.000, 0.990, 0.970);   // luz sobre el raso
    vec3 gold  = vec3(1.000, 0.900, 0.720);

    vec3 col = cream;
    col = mix(col, deep, clamp(-diff, 0.0, 1.0) * 0.6);
    col = mix(col, mix(gold, light, 0.5), clamp(diff, 0.0, 1.0) * 0.45);
    col = mix(col, light, clamp(spec * (1.0 - uCalm) + sheen, 0.0, 1.0));

    // Luz central amplia, como en la foto: el centro respira.
    vec2 pc = p * vec2(0.85, 1.35);
    col = mix(col, light, exp(-dot(pc, pc) * 2.2) * 0.42);

    // Detras de la escultura, una sombra calida muy abierta que despega el
    // blanco de la porcelana del marfil del fondo.
    vec2 f = (p - vec2(uFocus.x * 0.5 * aspect, uFocus.y * 0.5)) * vec2(1.6, 1.0);
    col = mix(col, col * vec3(0.93, 0.90, 0.86), exp(-dot(f, f) * 2.6) * uFocus.z);

    // Viñeta calida
    float v = smoothstep(1.25, 0.25, length(p * vec2(0.9, 1.1)));
    col *= mix(0.86, 1.0, v);

    // Calma: hacia el marfil liso de la pagina.
    col = mix(col, vec3(0.945, 0.922, 0.882), uCalm);

    // Grano para romper el banding del degradado.
    col += (hash(vUv * uRes + fract(uTime)) - 0.5) * 0.012;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Fragmentos: cada instancia es la caja de un fragmento; el fragment shader
// descarta todo lo que no sea su id. Se doblan como conchas de porcelana
// mientras flotan y se aplanan al encajar.
// ---------------------------------------------------------------------------
export const shardVertex = /* glsl */ `
  uniform vec4 uBoxes[64];
  uniform vec2 uSculpt;
  attribute float aShard;
  attribute vec4 aDyn;     // x: curvatura, y: oro, z: desenfoque, w: sellado
  attribute float aAlpha;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  varying vec4 vDyn;
  varying float vId;
  varying float vAlpha;

  void main() {
    vec4 box = uBoxes[int(aShard + 0.5) - 1];
    vec2 p = position.xy;
    vUv = box.xy + (p + 0.5) * box.zw;
    vec2 size = box.zw * uSculpt;
    float r = max(size.x, size.y);
    vec2 q = p * size / r;

    // Concha: la curvatura es un paraboloide centrado en la caja.
    float k = aDyn.x;
    vec3 pos = vec3(p * size, -k * r * dot(q, q) * 1.8);
    vec3 n = normalize(vec3(3.6 * k * q.x, 3.6 * k * q.y, 1.0));

    vec4 mv = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
    vN = normalize(normalMatrix * mat3(instanceMatrix) * n);
    vV = normalize(-mv.xyz);
    vDyn = aDyn;
    vId = aShard;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * mv;
  }
`;

export const shardFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uColor;
  uniform sampler2D uIds;
  uniform sampler2D uDist;
  uniform float uSealed[64];
  uniform float uSweep;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  varying vec4 vDyn;
  varying float vId;
  varying float vAlpha;

  void main() {
    if (vUv.x < 0.0 || vUv.y < 0.0 || vUv.x > 1.0 || vUv.y > 1.0) discard;
    float blur = vDyn.z;
    float seal = vDyn.w;
    float lit = 1.0 - seal;

    float id = floor(texture2D(uIds, vUv).r * 255.0 + 0.5);
    bool mine = abs(id - vId) < 0.5;
    // Junta entre dos piezas ya posadas: el texel de la frontera puede caer
    // fuera de las dos cajas por redondeo y dejar un pixel de fondo. Si las dos
    // estan en su sitio, cualquiera puede pintarlo: es la misma porcelana en el
    // mismo lugar. Con piezas en vuelo no aplica: su hueco debe verse.
    bool shared = !mine && seal > 0.999 && id > 0.5 && uSealed[int(id + 0.5) - 1] > 0.5;
    if (!mine && !shared) discard;

    float dist = texture2D(uDist, vUv).g * 255.0 / 4.0;   // en pixeles de textura
    vec4 tex = texture2D(uColor, vUv, blur * 3.2);
    if (shared && tex.a < 0.99) discard;

    vec3 N = gl_FrontFacing ? vN : -vN;
    vec3 base = tex.rgb;
    if (!gl_FrontFacing) {
      // El reverso de un fragmento es esmalte blanco, apenas teñido.
      base = mix(vec3(0.95, 0.94, 0.925), tex.rgb, 0.12);
    }

    // Luz de estudio: clave calida arriba a la izquierda. Solo se aplica la
    // diferencia respecto a la pieza plana, para que al sellar quede la foto.
    vec3 L = normalize(vec3(-0.55, 0.65, 0.75));
    vec3 H = normalize(L + vV);
    float ndl = dot(N, L);
    float flat0 = L.z;
    // La porcelana es muy blanca y rebota luz por todas partes: nunca se
    // oscurece de verdad, ni siquiera de espaldas a la clave.
    float shade = clamp(1.0 + 0.38 * (ndl - flat0) * lit, 0.84, 1.08);
    float spec = pow(max(dot(N, H), 0.0), 60.0) * 0.55 * lit;
    float fres = pow(1.0 - max(dot(N, vV), 0.0), 3.0) * 0.35 * lit;
    vec3 col = base * shade + vec3(1.0, 0.975, 0.93) * (spec + fres);

    // Filo de oro, como los fragmentos de la portada.
    float rimW = mix(3.6, 2.2, seal);
    float rim = (1.0 - smoothstep(rimW * 0.55, rimW, dist)) * vDyn.y;
    float sheen = 0.5 + 0.5 * clamp(dot(N, H), 0.0, 1.0);
    vec3 gold = mix(vec3(0.60, 0.42, 0.17), vec3(1.0, 0.86, 0.52), pow(sheen, 6.0));
    gold += spec * 0.8;
    // Al sellar, el oro solo queda en las juntas interiores, igual que en la
    // escultura entera que toma el relevo: el cambio no se ve.
    float inner = smoothstep(0.92, 0.995, texture2D(uColor, vUv, 3.0).a);
    col = mix(col, gold, rim * mix(smoothstep(0.02, 0.4, tex.a), inner, seal));

    // Borde: suave y mas ancho cuanto mas desenfocado; al sellar desaparece.
    float soft = 0.9 + blur * 9.0;
    float edge = mix(smoothstep(0.0, soft, dist), 1.0, seal);
    float a = tex.a * edge * vAlpha;
    if (a < 0.003) discard;

    // Barrido de luz sobre la escultura ya completa: una banda diagonal que
    // cruza la porcelana una sola vez.
    float d = (vUv.x * 0.55 + vUv.y) - (uSweep * 2.2 - 0.4);
    float band = exp(-d * d / 0.006) * step(0.001, uSweep) * (1.0 - step(0.999, uSweep));
    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    col += vec3(1.0, 0.97, 0.9) * band * 0.22 * smoothstep(0.35, 0.95, lum) * seal;

    gl_FragColor = vec4(col, a);
  }
`;
