// El escenario: fragmentos de porcelana que flotan y, con el scroll, encajan
// hasta reconstruir la escultura.
//
// Toda la pieza es una funcion pura del progreso `s` (0..1) mas el tiempo, que
// solo mueve la flotacion y la seda. Si el usuario sube, los fragmentos vuelven
// exactamente a donde estaban: no hay estado que deshacer.

import * as THREE from 'three';
import {
  sculptFragment,
  sculptVertex,
  shardFragment,
  shardVertex,
  silkFragment,
  silkVertex,
} from './shaders';

type Box = [number, number, number, number];
interface ShardDef {
  id: number;
  box: Box;
  c: [number, number];
  a: number;
}
interface ShardData {
  w: number;
  h: number;
  count: number;
  shards: ShardDef[];
}

// Guion. Cambiar el ritmo de la pieza se hace aqui y en ningun otro sitio.
export const SCRIPT = {
  assembleStart: 0.035,
  assembleEnd: 0.47,
  maxDelay: 0.36, // retraso del ultimo fragmento, en unidades de ensamblaje
  seamPeak: 0.505,
  seamEnd: 0.6,
  sweep: [0.485, 0.6] as const,
  hold: [0.5, 0.6] as const,
  pieceA: [0.6, 0.68] as const,
  pieceB: [0.78, 0.86] as const,
};

const FOV = 30;
const CAM_Z = 10;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// Entrada lenta, planeo largo y aterrizaje muy suave: nada de rebote.
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const damp = (a: number, b: number, lambda: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-lambda * dt));

// Generador determinista: la composicion es la misma en cada visita.
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Shard {
  def: ShardDef;
  home: THREE.Vector3;
  start: THREE.Vector3;
  ctrl: THREE.Vector3;
  qStart: THREE.Quaternion;
  spinAxis: THREE.Vector3;
  spin: number;
  scaleStart: number;
  bend: number;
  delay: number;
  depth: number; // 0 lejos .. 1 cerca, para el paralaje del puntero
  // flotacion
  f: [number, number, number, number, number, number];
  ph: [number, number, number, number, number, number];
  amp: number;
  // estado del fotograma
  u: number;
  z: number;
  m: THREE.Matrix4;
}

export interface StageFrame {
  s: number;
  landed: number;
  total: number;
  /** Proyecta un punto de la escultura (uv, origen abajo-izquierda) a pixeles. */
  project: (u: number, v: number) => { x: number; y: number };
}

export interface StageOptions {
  canvas: HTMLCanvasElement;
  mobile: boolean;
  reduced: boolean;
  base: string;
  onFrame?: (f: StageFrame) => void;
}

export class Stage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  private group = new THREE.Group();
  private silk!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private sculpt!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private mesh!: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private aShard!: THREE.InstancedBufferAttribute;
  private aDyn!: THREE.InstancedBufferAttribute;
  private aAlpha!: THREE.InstancedBufferAttribute;
  private shards: Shard[] = [];
  private data!: ShardData;
  private order: number[] = [];

  private target = 0;
  private s = 0;
  private intro = 0;
  private introTarget = 0;
  private time = 0;
  private mouse = new THREE.Vector2();
  private mouseTarget = new THREE.Vector2();
  private w = 1;
  private h = 1;
  private h0 = 2 * CAM_Z * TAN; // alto visible en z = 0
  private sculptH = 1;
  private sculptW = 1;
  private visible = true;
  private running = false;
  private raf = 0;
  private last = 0;
  private dpr = 1;
  private maxDpr = 2;
  private slowFrames = 0;
  private fastFrames = 0;
  private frozen: number | null = null;
  private opts: StageOptions;

  // temporales reutilizados: ni una asignacion por fotograma
  private tmpQ = new THREE.Quaternion();
  private tmpQ2 = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private qId = new THREE.Quaternion();

  constructor(opts: StageOptions) {
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0xf1ebe1, 1);
    this.maxDpr = opts.mobile ? 1.5 : 2;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.renderer.setPixelRatio(this.dpr);
    this.camera.position.set(0, 0, CAM_Z);
    this.scene.add(this.group);

    const q = new URLSearchParams(location.search).get('s');
    if (q !== null && !Number.isNaN(parseFloat(q))) this.frozen = clamp01(parseFloat(q));
  }

  async load() {
    const base = this.opts.base;
    const texLoader = new THREE.TextureLoader();
    const [color, dataImg, data] = await Promise.all([
      texLoader.loadAsync(`${base}/${this.opts.mobile ? 'sculpture-sm' : 'sculpture'}.webp`),
      new THREE.ImageLoader().loadAsync(`${base}/shards.png`),
      fetch(`${base}/shards.json`).then((r) => r.json() as Promise<ShardData>),
    ]);
    this.data = data;

    color.colorSpace = THREE.NoColorSpace;
    color.generateMipmaps = true;
    color.minFilter = THREE.LinearMipmapLinearFilter;
    color.magFilter = THREE.LinearFilter;
    color.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());

    const ids = new THREE.Texture(dataImg);
    ids.colorSpace = THREE.NoColorSpace;
    ids.minFilter = ids.magFilter = THREE.NearestFilter;
    ids.generateMipmaps = false;
    ids.needsUpdate = true;
    const dist = new THREE.Texture(dataImg);
    dist.colorSpace = THREE.NoColorSpace;
    dist.minFilter = dist.magFilter = THREE.LinearFilter;
    dist.generateMipmaps = false;
    dist.needsUpdate = true;

    this.build(color, ids, dist);
    // ?bg muestra solo la seda, para afinar el fondo sin fragmentos delante.
    if (new URLSearchParams(location.search).has('bg')) this.group.visible = false;
    this.resize();
    // Sube texturas y compila shaders antes de levantar la cortina: el primer
    // fotograma del scroll no puede costar un tiron.
    this.renderer.compile(this.scene, this.camera);
    this.renderFrame(0);
  }

  private build(color: THREE.Texture, ids: THREE.Texture, dist: THREE.Texture) {
    // Seda
    this.silk = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: silkVertex,
        fragmentShader: silkFragment,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uRes: { value: new THREE.Vector2(1, 1) },
          uTime: { value: 0 },
          uCalm: { value: 0 },
          uMouse: { value: new THREE.Vector2() },
          uFocus: { value: new THREE.Vector3() },
        },
      }),
    );
    this.silk.frustumCulled = false;
    this.silk.renderOrder = -10;
    this.scene.add(this.silk);

    // Escultura entera (relevo cuando todo ha encajado)
    this.sculpt = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: sculptVertex,
        fragmentShader: sculptFragment,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: color },
          uDist: { value: dist },
          uIds: { value: ids },
          uOpacity: { value: 0 },
          uSeam: { value: 0 },
          uSweep: { value: 0 },
          uTime: { value: 0 },
        },
      }),
    );
    this.sculpt.renderOrder = 1;
    this.group.add(this.sculpt);

    // Fragmentos
    const n = this.data.count;
    const boxes = new Array(64).fill(0).map(() => new THREE.Vector4());
    this.data.shards.forEach((d) => boxes[d.id - 1].set(...d.box));
    const geo = new THREE.PlaneGeometry(1, 1, 12, 12);
    this.aShard = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.aDyn = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    for (const a of [this.aShard, this.aDyn, this.aAlpha]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aShard', this.aShard);
    geo.setAttribute('aDyn', this.aDyn);
    geo.setAttribute('aAlpha', this.aAlpha);
    const mat = new THREE.ShaderMaterial({
      vertexShader: shardVertex,
      fragmentShader: shardFragment,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      uniforms: {
        uBoxes: { value: boxes },
        uSculpt: { value: new THREE.Vector2(1, 1) },
        uColor: { value: color },
        uIds: { value: ids },
        uDist: { value: dist },
      },
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.group.add(this.mesh);

    const rnd = mulberry(1307);
    this.shards = this.data.shards.map((def) => {
      const r6 = () => [0, 0, 0, 0, 0, 0].map(() => rnd()) as Shard['f'];
      const f = r6().map((x) => 0.16 + x * 0.22) as Shard['f'];
      const ph = r6().map((x) => x * Math.PI * 2) as Shard['ph'];
      const axis = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, (rnd() - 0.5) * 0.6).normalize();
      return {
        def,
        home: new THREE.Vector3(),
        start: new THREE.Vector3(),
        ctrl: new THREE.Vector3(),
        qStart: new THREE.Quaternion(),
        spinAxis: axis,
        spin: (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.6),
        scaleStart: 1,
        bend: 0.18 + rnd() * 0.22,
        // De abajo arriba, como se levanta una pieza en el taller: la base
        // primero y la corona al final, con algo de azar para que respire.
        delay: SCRIPT.maxDelay * clamp01(def.c[1] * 0.78 + rnd() * 0.22),
        depth: 0.5,
        f,
        ph,
        amp: 0.6 + rnd() * 0.6,
        u: 0,
        z: 0,
        m: new THREE.Matrix4(),
      };
    });
    this.order = this.shards.map((_, i) => i);
  }

  /** Composicion inicial: los fragmentos rodean el titulo, como en la campana. */
  private layout() {
    const aspect = this.w / this.h;
    const portrait = aspect < 0.9;
    const h0 = this.h0;
    const w0 = h0 * aspect;

    // Tamano de la escultura montada.
    const sa = this.data.w / this.data.h;
    this.sculptH = portrait ? Math.min(h0 * 0.66, (w0 * 0.86) / sa) : h0 * 0.8;
    this.sculptW = this.sculptH * sa;
    this.mesh.material.uniforms.uSculpt.value.set(this.sculptW, this.sculptH);
    this.sculpt.scale.set(this.sculptW, this.sculptH, 1);
    this.sculpt.position.z = -0.004;

    const rnd = mulberry(4242);
    // Orden por tamano: los grandes ocupan los huecos de protagonista.
    const bySize = [...this.shards].sort((a, b) => b.def.a - a.def.a);

    // Huecos prediseñados a partir de la portada (x, y en -1..1 de pantalla,
    // z profundidad). Los primeros son los grandes: el cuenco de la izquierda,
    // el trozo de la derecha, el de primer plano abajo a la derecha...
    const wide: [number, number, number][] = [
      [-0.62, -0.12, 1.4], [0.7, -0.08, 0.6], [0.8, -0.86, 4.2], [-0.98, 0.18, 3.4],
      [-0.72, 0.62, -0.4], [0.74, 0.55, 0.1], [0.43, -0.2, -0.6], [-0.08, -0.72, 0.5],
      [0.26, -0.86, 1.4], [-0.5, 0.36, -1.4], [0.52, 0.22, -1.8], [-0.92, -0.42, 1.9],
      [0.95, 0.08, 2.6], [-0.3, 0.8, -1.0], [0.32, 0.78, -2.2], [-0.62, -0.46, -1.2],
      [0.6, -0.55, -0.8], [-0.2, -0.92, 2.8], [0.92, -0.42, 0.9], [-0.9, -0.2, -2.4],
    ];
    // En vertical el texto ocupa todo el ancho: los fragmentos se reparten
    // arriba y abajo, y solo alguno asoma por los bordes.
    const tall: [number, number, number][] = [
      [-0.55, 0.72, 1.0], [0.6, 0.66, 0.6], [0.72, -0.72, 3.0], [-0.74, -0.7, 2.4],
      [-0.18, 0.9, -0.6], [0.28, 0.88, -0.4], [0.5, -0.6, -0.8], [-0.22, -0.66, 0.5],
      [0.16, -0.94, 1.2], [-0.95, 0.5, -1.6], [0.95, 0.4, -1.8], [-0.6, -0.95, 1.4],
      [0.96, -0.2, 2.2], [-0.02, 0.64, -1.4], [0.42, 0.56, -2.4], [-0.96, -0.12, -1.2],
    ];
    const slots = portrait ? tall : wide;

    bySize.forEach((sh, i) => {
      let sx: number, sy: number, z: number;
      if (i < slots.length) {
        [sx, sy, z] = slots[i];
        sx += (rnd() - 0.5) * 0.06;
        sy += (rnd() - 0.5) * 0.06;
      } else {
        // El resto: anillo alrededor del texto, a distinta profundidad; los
        // pequenos al fondo, desenfocados, dan escala a la escena.
        let tries = 0;
        do {
          const ang = rnd() * Math.PI * 2;
          const rad = 0.62 + rnd() * 0.5;
          sx = Math.cos(ang) * rad * (portrait ? 0.95 : 1.05);
          sy = Math.sin(ang) * rad * (portrait ? 1.05 : 0.95);
          tries++;
        } while (Math.abs(sx) < (portrait ? 0.92 : 0.4) && Math.abs(sy) < (portrait ? 0.54 : 0.42) && tries < 30);
        z = -1.5 - rnd() * 4;
      }
      // Pantalla -> mundo a la profundidad z
      const hh = (CAM_Z - z) * TAN;
      sh.start.set(sx * hh * aspect, sy * hh, z);
      sh.depth = clamp01((z + 5.5) / 9);
      // Los grandes de primer plano se ven mas grandes por perspectiva; al
      // resto se les da algo de cuerpo para que se lean como en la portada.
      const big = i < 2 ? 1.3 : 1.0;
      sh.scaleStart = (portrait ? 0.78 : 1.12) * big * (0.9 + rnd() * 0.25);

      // Casa
      const [bx, by, bw, bh] = sh.def.box;
      sh.home.set((bx + bw / 2 - 0.5) * this.sculptW, (by + bh / 2 - 0.5) * this.sculptH, 0);

      // Control de la curva: el camino no es recto, gira alrededor de la
      // escultura y se acerca a camara antes de encajar.
      const d = this.tmpV.subVectors(sh.start, sh.home);
      const ang = (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5);
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      sh.ctrl.set(
        sh.home.x + (d.x * c - d.y * s) * 0.5,
        sh.home.y + (d.x * s + d.y * c) * 0.5,
        sh.home.z + d.z * 0.35 + 1.2 + rnd() * 1.4,
      );

      // Orientacion inicial: bien inclinados, para que se lea el volumen de
      // la concha y a veces el reverso blanco.
      const axis = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, (rnd() - 0.5) * 0.5).normalize();
      sh.qStart.setFromAxisAngle(axis, 0.45 + rnd() * 0.6);
    });
  }

  resize() {
    const el = this.opts.canvas.parentElement!;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.silk) this.silk.material.uniforms.uRes.value.set(w * this.dpr, h * this.dpr);
    if (this.data) this.layout();
  }

  setProgress(p: number) {
    this.target = clamp01(p);
  }

  setPointer(x: number, y: number) {
    this.mouseTarget.set(x, y);
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (v && !this.running) this.start();
  }

  playIntro() {
    this.introTarget = 1;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 1 / 20);
      this.last = now;
      if (this.visible && !document.hidden) {
        this.renderFrame(dt);
        this.adapt(dt);
      } else {
        this.running = false;
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Resolucion dinamica: si va justo, se ablanda en lugar de ralentizarse. */
  private adapt(dt: number) {
    if (dt > 1 / 42) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (dt < 1 / 58) this.fastFrames++;
    else this.fastFrames = 0;
    if (this.slowFrames > 45 && this.dpr > 1) {
      this.dpr = Math.max(1, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
      this.slowFrames = 0;
    } else if (this.fastFrames > 240 && this.dpr < Math.min(window.devicePixelRatio || 1, this.maxDpr)) {
      this.dpr = Math.min(this.maxDpr, this.dpr + 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
      this.fastFrames = 0;
    }
  }

  private renderFrame(dt: number) {
    const reduced = this.opts.reduced;
    this.time += dt;
    // Amortiguado propio encima del scroll suave: la pieza pesa, no salta.
    const goal = this.frozen ?? this.target;
    this.s = this.frozen !== null ? goal : damp(this.s, goal, 7, dt);
    if (Math.abs(this.s - goal) < 1e-5) this.s = goal;
    this.intro = this.frozen !== null ? 1 : damp(this.intro, this.introTarget, 1.6, dt);
    this.mouse.x = damp(this.mouse.x, this.mouseTarget.x, 3, dt);
    this.mouse.y = damp(this.mouse.y, this.mouseTarget.y, 3, dt);

    const s = this.s;
    const t = this.time;
    const A = clamp01((s - SCRIPT.assembleStart) / (SCRIPT.assembleEnd - SCRIPT.assembleStart));
    const span = 1 - SCRIPT.maxDelay;

    // Juntas de oro: se encienden al encajar, brillan un instante y se van.
    const seam =
      A < 1 ? 0.7 : 0.7 + 0.3 * smooth(SCRIPT.assembleEnd, SCRIPT.seamPeak, s) - smooth(SCRIPT.seamPeak, SCRIPT.seamEnd, s);
    const seamNow = Math.max(0, seam);

    // Camara: un balanceo minimo con el puntero y un paso adelante al final.
    const aspect = this.w / this.h;
    const portrait = aspect < 0.9;
    this.camera.position.x = this.mouse.x * 0.22;
    this.camera.position.y = this.mouse.y * 0.14;
    this.camera.lookAt(0, 0, 0);

    // Grupo: la escultura se aparta para dejar sitio al texto.
    const w0 = this.h0 * aspect;
    const pa = easeInOut(smooth(SCRIPT.pieceA[0], SCRIPT.pieceA[1], s));
    const pb = easeInOut(smooth(SCRIPT.pieceB[0], SCRIPT.pieceB[1], s));
    const hold = smooth(SCRIPT.hold[0], SCRIPT.hold[1], s);
    if (portrait) {
      const up = Math.max(pa, pb);
      this.group.position.set(0, this.h0 * 0.19 * up, 0);
      this.group.scale.setScalar(1 + 0.03 * hold - 0.3 * up);
    } else {
      const margin = this.sculptW * 0.5 + w0 * 0.06;
      const xA = -Math.min(w0 * 0.22, w0 / 2 - margin);
      const xB = Math.min(w0 * 0.1, w0 / 2 - margin);
      this.group.position.set(xA * (pa - pb) + xB * pb, -this.h0 * 0.02, 0);
      this.group.scale.setScalar(1 + 0.02 * hold - 0.04 * pb);
    }
    this.group.updateMatrixWorld();

    let landed = 0;
    let allSealed = true;
    const introE = easeOut(this.intro);

    for (const sh of this.shards) {
      const u = reduced ? (A > 0.5 ? 1 : 0) : clamp01((A - sh.delay) / span);
      sh.u = u;
      const e = easeInOut(u);
      const er = easeOut(clamp01(u * 1.08)); // la rotacion asienta un poco antes
      if (u >= 0.985) landed++;
      const seal = smooth(0.94, 1.0, u);
      if (seal < 1) allSealed = false;

      // Curva de Bezier cuadratica: salida -> control -> casa.
      const a = (1 - e) * (1 - e);
      const b = 2 * e * (1 - e);
      const c = e * e;
      const p = this.tmpV.set(
        a * sh.start.x + b * sh.ctrl.x + c * sh.home.x,
        a * sh.start.y + b * sh.ctrl.y + c * sh.home.y,
        a * sh.start.z + b * sh.ctrl.z + c * sh.home.z,
      );

      // Flotacion: suma de senos lentos de frecuencias distintas por eje. Se
      // apaga en cuanto el fragmento emprende el viaje.
      const fl = (1 - smooth(0, 0.55, u)) * (reduced ? 0 : 1);
      const amp = 0.07 * sh.amp * fl * (0.6 + sh.depth);
      p.x += (Math.sin(t * sh.f[0] + sh.ph[0]) + 0.45 * Math.sin(t * sh.f[3] * 1.7 + sh.ph[3])) * amp * 0.7;
      p.y += (Math.sin(t * sh.f[1] + sh.ph[1]) + 0.4 * Math.sin(t * sh.f[4] * 1.9 + sh.ph[4])) * amp;
      p.z += Math.sin(t * sh.f[2] + sh.ph[2]) * amp * 0.8;

      // Paralaje del puntero, mas fuerte en los cercanos.
      p.x -= this.mouse.x * (sh.depth - 0.4) * 0.35 * (1 - e);
      p.y -= this.mouse.y * (sh.depth - 0.4) * 0.25 * (1 - e);

      // Entrada: los fragmentos llegan desde fuera la primera vez.
      if (introE < 1) {
        const k = 1 - introE;
        p.x += sh.start.x * 0.35 * k;
        p.y += sh.start.y * 0.35 * k - 0.4 * k;
        p.z += 2.5 * k * (sh.depth - 0.3);
      }

      // Orientacion: inclinacion inicial + giro extra que se deshace + balanceo.
      this.tmpQ.copy(sh.qStart).slerp(this.qId, er);
      this.tmpQ2.setFromAxisAngle(sh.spinAxis, sh.spin * (1 - er) * (1 - er) + Math.sin(t * sh.f[5] + sh.ph[5]) * 0.12 * fl);
      this.tmpQ.multiply(this.tmpQ2);

      const sc = sh.scaleStart + (1 - sh.scaleStart) * e;
      this.tmpS.set(sc, sc, sc);
      // La matriz se guarda en el fragmento; el orden de dibujo va despues.
      sh.m.compose(p, this.tmpQ, this.tmpS);
      sh.z = p.z;
    }

    // De atras hacia delante: los bordes suaves se mezclan bien.
    this.order.sort((i, j) => this.shards[i].z - this.shards[j].z);
    const dyn = this.aDyn.array as Float32Array;
    const ids = this.aShard.array as Float32Array;
    const alpha = this.aAlpha.array as Float32Array;
    const focus = 0.5;
    for (let k = 0; k < this.order.length; k++) {
      const sh = this.shards[this.order[k]];
      const u = sh.u;
      const e = easeInOut(u);
      this.mesh.setMatrixAt(k, sh.m);
      ids[k] = sh.def.id;
      const zDist = Math.abs(sh.z - focus);
      const blur = Math.min(1, Math.pow(Math.max(0, zDist - 0.9) / 3.6, 1.3)) * (1 - e);
      dyn[k * 4 + 0] = sh.bend * (1 - smooth(0.25, 0.95, u));
      dyn[k * 4 + 1] = 1 + (seamNow - 1) * smooth(0.75, 1, u);
      dyn[k * 4 + 2] = blur;
      dyn[k * 4 + 3] = smooth(0.94, 1.0, u);
      alpha[k] = clamp01(this.intro * 1.6 - (1 - sh.depth) * 0.4) * (reduced ? 1 - smooth(0.4, 0.6, A) : 1);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aDyn.needsUpdate = true;
    this.aShard.needsUpdate = true;
    this.aAlpha.needsUpdate = true;

    // Relevo: con todo sellado, la escultura entera sustituye a los
    // fragmentos, que son la misma imagen pixel a pixel.
    const whole = reduced ? smooth(0.4, 0.6, A) : allSealed ? 1 : 0;
    this.mesh.visible = whole < 1;
    const su = this.sculpt.material.uniforms;
    su.uOpacity.value = whole;
    su.uSeam.value = seamNow;
    su.uTime.value = t;
    const sw = clamp01((s - SCRIPT.sweep[0]) / (SCRIPT.sweep[1] - SCRIPT.sweep[0]));
    su.uSweep.value = reduced ? 0 : sw;

    // Fondo
    const bu = this.silk.material.uniforms;
    bu.uTime.value = reduced ? 0 : t;
    bu.uMouse.value.copy(this.mouse);
    bu.uCalm.value = 0.18 * smooth(0.3, 0.55, s) + 0.5 * smooth(0.86, 1.0, s);
    const gp = this.group.position;
    bu.uFocus.value.set(gp.x / ((this.h0 * aspect) / 2), gp.y / (this.h0 / 2), 0.9 * smooth(0.2, 0.5, s));

    this.renderer.render(this.scene, this.camera);

    this.opts.onFrame?.({
      s,
      landed,
      total: this.shards.length,
      project: (u: number, v: number) => this.project(u, v),
    });
  }

  private project(u: number, v: number) {
    const p = this.tmpV.set((u - 0.5) * this.sculptW, (v - 0.5) * this.sculptH, 0);
    p.applyMatrix4(this.group.matrixWorld).project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.w, y: (1 - (p.y * 0.5 + 0.5)) * this.h };
  }

  debug() {
    return {
      s: this.s,
      dpr: this.dpr,
      landed: this.shards.filter((x) => x.u >= 1).length,
      calls: this.renderer.info.render.calls,
    };
  }
}
