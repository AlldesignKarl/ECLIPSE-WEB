import './style.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { SCRIPT } from './script';
import { Stage, type StageFrame } from './stage';

gsap.registerPlugin(ScrollTrigger);

const BASE = '/alldesign-karl';
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const mobile = coarse || innerWidth < 760;
const desktop = matchMedia('(min-width: 900px)');
const params = new URLSearchParams(location.search);
const frozen = params.has('s');

document.documentElement.classList.toggle('is-touch', coarse);
document.documentElement.classList.toggle('is-reduced', reduced);
$('[data-year]').textContent = String(new Date().getFullYear());

// ---------------------------------------------------------------------------
// Scroll suave. En tactil se deja el nativo: es mas fluido y no pelea con el
// gesto del usuario.
// ---------------------------------------------------------------------------
let lenis: Lenis | null = null;
if (!reduced && !frozen) {
  lenis = new Lenis({ duration: 1.25, easing: (t) => 1 - Math.pow(1 - t, 3.2), smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis!.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}
if (lenis) lenis.stop();

// Anclas a traves de Lenis, para que el salto tambien sea suave.
$$<HTMLAnchorElement>('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href')!;
    if (id.length < 2) return;
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    if (lenis) {
      // Desde un panel abierto Lenis esta parado: se reanuda antes de saltar.
      lenis.start();
      lenis.scrollTo(el as HTMLElement, { duration: 2.2 });
    }
    else (el as HTMLElement).scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  }),
);

// ---------------------------------------------------------------------------
// Escenario WebGL
// ---------------------------------------------------------------------------
const stageEl = $('.stage');
// La seccion mide lo que dura el guion mas una pantalla: el escenario queda
// fijo mientras tanto.
$('.experience').style.height = `${SCRIPT.totalVh + 100}vh`;
const canvas = $<HTMLCanvasElement>('.stage__canvas');
const counterN = $('[data-assembly-n]');
const notes = $$('[data-note]');
const noteLines = $<SVGSVGElement>('[data-note-lines]');
let stage: Stage | null = null;
let stageInView = true;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

let lastLanded = -1;
function onFrame(f: StageFrame) {
  if (f.landed !== lastLanded) {
    lastLanded = f.landed;
    counterN.textContent = String(f.landed).padStart(2, '0');
  }
  // Anotaciones: el punto de cada nota sigue a la escultura.
  if (f.s > SCRIPT.pieceB[0] && desktop.matches) {
    const box = stageEl.getBoundingClientRect();
    let d = '';
    for (const n of notes) {
      const [u, v] = n.dataset.note!.split(',').map(Number);
      const p = f.project(u, v);
      const r = n.getBoundingClientRect();
      const x0 = r.left - box.left - 14;
      const y0 = r.top - box.top + r.height / 2;
      d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${(p.x + 6).toFixed(1)} ${p.y.toFixed(1)}`;
      n.style.setProperty('--py', `${p.y}px`);
    }
    noteLines.innerHTML = `<path d="${d}" pathLength="1" /><g>${notes
      .map((n) => {
        const [u, v] = n.dataset.note!.split(',').map(Number);
        const p = f.project(u, v);
        return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" />`;
      })
      .join('')}</g>`;
  }
}

async function bootStage() {
  if (!hasWebGL()) throw new Error('sin webgl');
  stage = new Stage({ canvas, mobile, reduced, base: BASE, onFrame });
  await stage.load();
  stage.start();

  // Fuera de pantalla o con la pestaña oculta no se pinta nada.
  const io = new IntersectionObserver(
    ([e]) => {
      stageInView = e.isIntersecting;
      if (!document.body.classList.contains('has-panel')) stage!.setVisible(stageInView);
    },
    { rootMargin: '10% 0px' },
  );
  io.observe(stageEl);
  document.addEventListener('visibilitychange', () => !document.hidden && stage!.setVisible(stageInView));

  let rw = innerWidth;
  let rh = innerHeight;
  addEventListener('resize', () => {
    // En movil la barra del navegador cambia el alto al hacer scroll: no se
    // recompone la escena por eso.
    if (coarse && innerWidth === rw && Math.abs(innerHeight - rh) < 160) return;
    rw = innerWidth;
    rh = innerHeight;
    stage!.resize();
  });
  if (!coarse) {
    addEventListener('pointermove', (e) => {
      stage!.setPointer((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
    });
  }
  (window as unknown as { __ak: () => unknown }).__ak = () => stage!.debug();
}

// Progreso del escenario = progreso de la pieza.
ScrollTrigger.create({
  trigger: '.experience',
  start: 'top top',
  end: 'bottom bottom',
  onUpdate: (self) => stage?.setProgress(self.progress),
});

// ---------------------------------------------------------------------------
// Capa de texto del escenario, en la misma escala de tiempo que la pieza.
// ---------------------------------------------------------------------------
function buildStageTimeline() {
  const tl = gsap.timeline({
    paused: frozen,
    defaults: { ease: 'none' },
    // Con ?s= la pieza se congela en un fotograma: la capa de texto tambien.
    scrollTrigger: frozen ? undefined : { trigger: '.experience', start: 'top top', end: 'bottom bottom', scrub: 0.6 },
  });
  const heroItems = $$('[data-hero-item]');
  const corners = $$('[data-hero-corner]');
  const v = SCRIPT.f; // vh de recorrido -> fraccion del escenario
  const [h0, h1] = SCRIPT.heroOut;
  const [a0] = SCRIPT.pieceA;
  const [b0, b1] = SCRIPT.pieceB;
  tl.to(heroItems, { autoAlpha: 0, y: -36, filter: 'blur(8px)', stagger: v(2.8), duration: h1 - h0, ease: 'power1.in' }, h0)
    .to(corners, { autoAlpha: 0, y: 12, duration: v(21) }, h0)
    // El contador ocupa el sitio de "Hecho a mano en Aragon" desde el primer
    // gesto y se queda hasta que la escultura cede el paso al texto.
    .fromTo('[data-assembly]', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: v(18) }, h0 + v(8))
    .to('[data-assembly]', { autoAlpha: 0, y: -10, duration: v(21) }, a0 - v(6));

  const aLines = $$('[data-line]', $('[data-piece="a"]'));
  const bLines = $$('[data-line]', $('[data-piece="b"]'));
  const lineIn = { autoAlpha: 1, y: 0, filter: 'blur(0px)', stagger: v(8.4), duration: v(35), ease: 'power2.out' };
  tl.set('[data-piece="a"]', { autoAlpha: 1 }, a0)
    .fromTo(aLines, { autoAlpha: 0, y: 26, filter: 'blur(10px)' }, lineIn, a0 + v(14))
    .to(aLines, { autoAlpha: 0, y: -22, filter: 'blur(6px)', stagger: v(4.2), duration: v(21), ease: 'power1.in' }, b0 - v(24.5))
    .set('[data-piece="b"]', { autoAlpha: 1 }, b0)
    .fromTo(bLines, { autoAlpha: 0, y: 26, filter: 'blur(10px)' }, lineIn, b0 + v(14))
    .fromTo('[data-note]', { autoAlpha: 0, x: 18 }, { autoAlpha: 1, x: 0, stagger: v(8.4), duration: v(28) }, b1 - v(14))
    .fromTo(noteLines, { autoAlpha: 0 }, { autoAlpha: 1, duration: v(28) }, b1 - v(7))
    .set({}, {}, 1);

  // Sin WebGL: la escultura es una imagen fija que acompaña a los textos.
  if (document.documentElement.classList.contains('no-webgl')) {
    const wide = desktop.matches;
    tl.fromTo('.stage__poster', { autoAlpha: 0.14, scale: 0.94 }, { autoAlpha: 1, scale: 1, duration: SCRIPT.buildEnd - h1, ease: 'power1.inOut' }, h1)
      .to('.stage__poster', { xPercent: wide ? -62 : 0, yPercent: wide ? 0 : -22, scale: wide ? 1 : 0.7, duration: v(56) }, a0)
      .to('.stage__poster', { xPercent: wide ? 45 : 0, duration: v(56) }, b0);
  }
  if (frozen) tl.progress(parseFloat(params.get('s')!) || 0);
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------
function intro() {
  document.body.classList.remove('is-loading');
  if (frozen) {
    // Fotograma congelado para capturas: sin cortina ni entrada.
    gsap.set('.loader', { autoAlpha: 0 });
    stage?.playIntro();
    buildStageTimeline();
    return;
  }
  const tl = gsap.timeline();
  tl.to('.loader__fill', { scaleX: 1, duration: 0.5, ease: 'power2.inOut' })
    .to('.loader', { autoAlpha: 0, duration: 0.9, ease: 'power2.inOut' })
    .add(() => stage?.playIntro(), '-=0.7');
  {
    tl.from('.nav > *', { autoAlpha: 0, y: -14, stagger: 0.08, duration: 1.1, ease: 'power3.out' }, '-=0.6')
      .from('[data-hero-item]', { autoAlpha: 0, y: 28, filter: 'blur(10px)', stagger: 0.12, duration: 1.5, ease: 'power3.out', clearProps: 'transform,filter,opacity,visibility' }, '-=1.0')
      .from('[data-hero-corner]', { autoAlpha: 0, duration: 1.4, clearProps: 'opacity,visibility' }, '-=0.9');
  }
  tl.add(() => {
    buildStageTimeline();
    lenis?.start();
    ScrollTrigger.refresh();
  });
}

// ---------------------------------------------------------------------------
// Revelados del resto de la pagina
// ---------------------------------------------------------------------------
function splitWords(el: HTMLElement) {
  const words = el.textContent!.trim().split(/\s+/);
  el.innerHTML = words.map((w) => `<span class="w"><span>${w}</span></span>`).join(' ');
  return $$('.w > span', el);
}

function reveals() {
  $$('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      autoAlpha: 0,
      y: 26,
      filter: 'blur(6px)',
      duration: 1.3,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });

  $$('[data-split]').forEach((el) => {
    const words = splitWords(el);
    gsap.from(words, {
      yPercent: 110,
      duration: 1.4,
      ease: 'power4.out',
      stagger: 0.045,
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  // Mascaras: la imagen se descubre de abajo arriba mientras se asienta.
  $$('[data-mask]').forEach((fig) => {
    const img = $('img', fig);
    const tl = gsap.timeline({ scrollTrigger: { trigger: fig, start: 'top 85%', once: true } });
    tl.fromTo(fig, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6, ease: 'power4.inOut' })
      .from(img, { scale: 1.3, duration: 2.2, ease: 'power3.out' }, 0);
  });

  // Paralaje interno de las fotografias.
  $$('[data-parallax]').forEach((img) => {
    gsap.fromTo(
      img,
      { yPercent: -6 },
      {
        yPercent: 6,
        ease: 'none',
        scrollTrigger: { trigger: img.closest('figure'), start: 'top bottom', end: 'bottom top', scrub: true },
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Colecciones: la foto sigue al cursor, muy poco.
// ---------------------------------------------------------------------------
function collections() {
  if (coarse) return;
  $$('.collection').forEach((card) => {
    const media = $('.collection__media', card);
    const qx = gsap.quickTo(media, '--mx', { duration: 0.9, ease: 'power3.out' });
    const qy = gsap.quickTo(media, '--my', { duration: 0.9, ease: 'power3.out' });
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      qx(((e.clientX - r.left) / r.width - 0.5) * 2);
      qy(((e.clientY - r.top) / r.height - 0.5) * 2);
    });
    card.addEventListener('pointerleave', () => {
      qx(0);
      qy(0);
    });
  });
}

// ---------------------------------------------------------------------------
// Artesania: recorrido horizontal fijado en escritorio, lista en movil.
// ---------------------------------------------------------------------------
function drawArt(step: HTMLElement) {
  const paths = $$<SVGGeometryElement>('path, ellipse', step);
  paths.forEach((p) => {
    const len = p.getTotalLength ? p.getTotalLength() : 400;
    p.style.strokeDasharray = p.getAttribute('stroke-dasharray') ? '' : `${len}`;
    if (!p.getAttribute('stroke-dasharray')) p.style.strokeDashoffset = `${len}`;
  });
  return paths.filter((p) => !p.getAttribute('stroke-dasharray'));
}

function craft() {
  const track = $('[data-craft-track]');
  const steps = $$('.step', track);
  const mm = gsap.matchMedia();

  mm.add('(min-width: 900px)', () => {
    const dist = () => track.scrollWidth - innerWidth;
    const tween = gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: {
        trigger: '.craft',
        pin: '.craft__pin',
        start: 'top top',
        end: () => `+=${dist()}`,
        scrub: 0.8,
        invalidateOnRefresh: true,
      },
    });
    gsap.to('[data-craft-bar]', {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: { trigger: '.craft', start: 'top top', end: () => `+=${dist()}`, scrub: true },
    });
    steps.forEach((step) => {
      const paths = drawArt(step);
      gsap.to(paths, {
        strokeDashoffset: 0,
        duration: 1,
        stagger: 0.12,
        ease: 'power2.inOut',
        scrollTrigger: { trigger: step, containerAnimation: tween, start: 'left 85%', end: 'center 55%', scrub: 0.6 },
      });
      gsap.from($$('.step__num, h3, p', step), {
        autoAlpha: 0,
        y: 30,
        stagger: 0.08,
        ease: 'power2.out',
        scrollTrigger: { trigger: step, containerAnimation: tween, start: 'left 90%', end: 'left 55%', scrub: 0.6 },
      });
    });
  });

  mm.add('(max-width: 899px)', () => {
    steps.forEach((step) => {
      const paths = drawArt(step);
      gsap.to(paths, {
        strokeDashoffset: 0,
        duration: 2,
        stagger: 0.15,
        ease: 'power2.inOut',
        scrollTrigger: { trigger: step, start: 'top 80%', once: true },
      });
      gsap.from($$('.step__num, h3, p', step), {
        autoAlpha: 0,
        y: 24,
        stagger: 0.1,
        duration: 1.2,
        ease: 'power3.out',
        scrollTrigger: { trigger: step, start: 'top 80%', once: true },
      });
    });
  });
}

// ---------------------------------------------------------------------------
// CTA: fragmentos de la portada flotando, con paralaje de cursor y scroll.
// ---------------------------------------------------------------------------
function cta() {
  const frags = $$('.cta__frag');
  frags.forEach((f, i) => {
    const d = parseFloat(f.dataset.depth || '0.5');
    gsap.fromTo(f, { y: 120 * d }, { y: -120 * d, ease: 'none', scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'bottom top', scrub: true } });
    if (!reduced) {
      gsap.to(f, {
        rotation: (i % 2 ? -1 : 1) * (4 + i * 2),
        xPercent: (i % 2 ? 1 : -1) * 4,
        duration: 7 + i * 1.7,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    }
  });
  if (coarse || reduced) return;
  const wrap = $('.cta__frags');
  const qx = gsap.quickTo(wrap, '--cx', { duration: 1.4, ease: 'power3.out' });
  const qy = gsap.quickTo(wrap, '--cy', { duration: 1.4, ease: 'power3.out' });
  $('.cta').addEventListener('pointermove', (e) => {
    qx((e.clientX / innerWidth - 0.5) * 2);
    qy((e.clientY / innerHeight - 0.5) * 2);
  });
}

// ---------------------------------------------------------------------------
// Navegacion, paneles, cursor
// ---------------------------------------------------------------------------
function nav() {
  const header = $('[data-nav]');
  ScrollTrigger.create({
    trigger: '.collections',
    start: 'top 80px',
    endTrigger: 'body',
    end: 'bottom bottom',
    toggleClass: { targets: header, className: 'is-solid' },
  });
  ScrollTrigger.create({
    trigger: '.footer',
    start: 'top 70px',
    onToggle: (self) => header.classList.toggle('is-dark', self.isActive),
  });
  const links = $$<HTMLAnchorElement>('.nav__links a');
  ['#inicio', '#colecciones', '#nosotros', '#contacto'].forEach((id) => {
    ScrollTrigger.create({
      trigger: id,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (!self.isActive) return;
        links.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === id));
      },
    });
  });
}

const CATALOG = [
  { t: 'Flora — busto de porcelana', c: 'Colección Escultórica', href: '#inicio' },
  { t: 'Cuenco azul roto con oro', c: 'Ediciones Especiales', href: '#colecciones' },
  { t: 'Vajilla pintada en cobalto', c: 'Colección Azul', href: '#colecciones' },
  { t: 'Jarrón de ramas', c: 'Colección Botánica', href: '#colecciones' },
  { t: 'Platos de huerta aragonesa', c: 'Colección Botánica', href: '#colecciones' },
  { t: 'Figuras de gran formato', c: 'Colección Escultórica', href: '#colecciones' },
  { t: 'Encargos personalizados', c: 'Contacto', href: '#contacto' },
];

function panels() {
  let open: HTMLElement | null = null;
  let opener: HTMLElement | null = null;

  const close = () => {
    if (!open) return;
    const p = open;
    open = null;
    gsap.to(p, {
      autoAlpha: 0,
      duration: 0.6,
      ease: 'power2.inOut',
      onComplete: () => {
        p.hidden = true;
      },
    });
    document.body.classList.remove('has-panel');
    stage?.setVisible(stageInView);
    lenis?.start();
    opener?.focus();
  };

  const show = (name: string, from: HTMLElement) => {
    if (open) close();
    const p = $(`[data-panel="${name}"]`);
    open = p;
    opener = from;
    p.hidden = false;
    document.body.classList.add('has-panel');
    // El panel tapa la pantalla entera: el escenario deja de pintar mientras.
    stage?.setVisible(false);
    lenis?.stop();
    gsap.fromTo(p, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'power2.out' });
    // Solo opacidad: con visibility oculta el campo de busqueda no acepta foco.
    gsap.from($$('.panel__menu a, .search > *, .panel > p, .panel > .btn', p), {
      opacity: 0,
      y: 30,
      stagger: 0.06,
      duration: 0.9,
      delay: 0.1,
      ease: 'power3.out',
    });
    const focusable = $('input, a, button', p) as HTMLElement | null;
    setTimeout(() => ($('input', p) ?? focusable)?.focus(), 80);
  };

  $$('[data-open]').forEach((b) => b.addEventListener('click', () => show(b.dataset.open!, b)));
  $$('[data-close]').forEach((b) => b.addEventListener('click', close));
  addEventListener('keydown', (e) => e.key === 'Escape' && close());

  const input = $<HTMLInputElement>('#q');
  const results = $('[data-search-results]');
  const render = () => {
    const q = input.value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const hits = CATALOG.filter((i) => !q || norm(i.t + ' ' + i.c).includes(q));
    results.innerHTML = hits.length
      ? hits.map((i) => `<li><a href="${i.href}" data-close><span>${i.t}</span><small>${i.c}</small></a></li>`).join('')
      : '<li class="search__none">Sin resultados. Escríbenos y lo hacemos por encargo.</li>';
    $$('[data-close]', results).forEach((a) => a.addEventListener('click', close));
  };
  input.addEventListener('input', render);
  $('[data-search]').addEventListener('submit', (e) => e.preventDefault());
  render();
}

function cursor() {
  if (coarse || reduced) return;
  const el = $('.cursor');
  const label = $('.cursor__label', el);
  const qx = gsap.quickTo(el, 'x', { duration: 0.45, ease: 'power3.out' });
  const qy = gsap.quickTo(el, 'y', { duration: 0.45, ease: 'power3.out' });
  addEventListener('pointermove', (e) => {
    qx(e.clientX);
    qy(e.clientY);
    el.classList.add('is-on');
  });
  document.addEventListener('pointerleave', () => el.classList.remove('is-on'));
  $$('a, button').forEach((a) => {
    a.addEventListener('pointerenter', () => {
      el.classList.add('is-link');
      const txt = a.getAttribute('data-cursor');
      if (txt) {
        label.textContent = txt;
        el.classList.add('is-label');
      }
    });
    a.addEventListener('pointerleave', () => el.classList.remove('is-link', 'is-label'));
  });

  // Botones magneticos, con contencion.
  $$('[data-magnetic]').forEach((b) => {
    const qbx = gsap.quickTo(b, 'x', { duration: 0.8, ease: 'elastic.out(1, 0.6)' });
    const qby = gsap.quickTo(b, 'y', { duration: 0.8, ease: 'elastic.out(1, 0.6)' });
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      qbx((e.clientX - r.left - r.width / 2) * 0.18);
      qby((e.clientY - r.top - r.height / 2) * 0.3);
    });
    b.addEventListener('pointerleave', () => {
      qbx(0);
      qby(0);
    });
  });
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
nav();
panels();
cursor();
collections();
craft();
cta();
reveals();

const minShow = new Promise((r) => setTimeout(r, frozen ? 0 : 700));
const fontsReady = document.fonts?.ready ?? Promise.resolve();
const boot = bootStage().catch((err) => {
  console.warn('[alldesign] escenario sin WebGL:', err);
  document.documentElement.classList.add('no-webgl');
});
// Si algo tarda demasiado, la pagina no se queda secuestrada tras la cortina.
const timeout = new Promise((r) => setTimeout(r, 6000));
Promise.race([Promise.all([boot, minShow, fontsReady]), timeout]).then(intro);
