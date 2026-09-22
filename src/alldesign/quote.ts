// Pagina "Pedir presupuesto": formulario en tres pasos para empresas.
// Sin cuentas ni registro: se rellena, se revisa y se envia a /api/presupuesto.

import './quote.css';
import { gsap } from 'gsap';
import { applyContact } from './contact';
import {
  BUDGET_OPTIONS,
  FILES,
  PRODUCT_OPTIONS,
  PROJECT_TYPES,
  validateQuote,
  type QuoteFile,
  type QuotePayload,
} from './quote-config';

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const form = $<HTMLFormElement>('[data-quote-form]');
const steps = $$<HTMLFieldSetElement>('.qstep', form);
const btnPrev = $<HTMLButtonElement>('[data-prev]');
const btnNext = $<HTMLButtonElement>('[data-next]');
const btnSubmit = $<HTMLButtonElement>('[data-submit]');
const alertBox = $('[data-alert]');
let current = 1;
let files: QuoteFile[] = [];
let sending = false;

applyContact();

// ---------------------------------------------------------------- opciones
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
$('[data-products]').innerHTML = PRODUCT_OPTIONS.map(
  (o, i) =>
    `<label class="chip"><input type="radio" name="producto" value="${esc(o)}" ${i === 0 ? 'required' : ''} /><span>${esc(o)}</span></label>`,
).join('');
$('[data-types]').insertAdjacentHTML('beforeend', PROJECT_TYPES.map((o) => `<option>${esc(o)}</option>`).join(''));
$('[data-budgets]').insertAdjacentHTML('beforeend', BUDGET_OPTIONS.map((o) => `<option>${esc(o)}</option>`).join(''));
$<HTMLInputElement>('#f-fecha').min = new Date().toISOString().slice(0, 10);
$('[data-files-hint]').textContent = FILES.label;
$<HTMLInputElement>('[data-files]').accept = FILES.accept;

// ---------------------------------------------------------------- datos
function data(): QuotePayload {
  const fd = new FormData(form);
  const s = (k: string) => String(fd.get(k) ?? '').trim();
  return {
    nombre: s('nombre'),
    cargo: s('cargo'),
    email: s('email'),
    telefono: s('telefono'),
    empresa: s('empresa'),
    cif: s('cif'),
    web: s('web'),
    producto: s('producto'),
    cantidad: s('cantidad'),
    tipo: s('tipo'),
    fecha: s('fecha'),
    presupuesto: s('presupuesto'),
    ciudad: s('ciudad'),
    descripcion: s('descripcion'),
    privacidad: fd.get('privacidad') === 'on',
    comunicaciones: fd.get('comunicaciones') === 'on',
    website2: s('website2'),
    archivos: files,
  };
}

// ---------------------------------------------------------------- errores
function fieldEl(name: string): HTMLElement | null {
  return (
    form.querySelector<HTMLElement>(`[data-field="${name}"]`) ??
    form.querySelector<HTMLElement>(`[name="${name}"]`)?.closest('.field') ??
    null
  );
}

function clearErrors(scope: ParentNode = form) {
  $$('.field__error', scope).forEach((e) => e.remove());
  $$('.is-invalid', scope).forEach((e) => e.classList.remove('is-invalid'));
  $$('[aria-invalid]', scope).forEach((e) => e.removeAttribute('aria-invalid'));
}

function showErrors(errors: Record<string, string>) {
  let first: HTMLElement | null = null;
  for (const [name, msg] of Object.entries(errors)) {
    const box = fieldEl(name);
    if (!box) continue;
    box.classList.add('is-invalid');
    const id = `err-${name}`;
    box.querySelector('.field__error')?.remove();
    box.insertAdjacentHTML('beforeend', `<span class="field__error" id="${id}">${esc(msg)}</span>`);
    const input = box.querySelector<HTMLElement>('input, select, textarea');
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', id);
    }
    first ??= input ?? box;
  }
  first?.focus({ preventScroll: true });
  first?.closest('.field')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
}

// Al corregir un campo, su error desaparece.
form.addEventListener('input', (e) => {
  const box = (e.target as HTMLElement).closest('.field, [data-field]');
  if (box?.classList.contains('is-invalid')) {
    box.classList.remove('is-invalid');
    box.querySelector('.field__error')?.remove();
    box.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid');
  }
  alertBox.hidden = true;
});

// ---------------------------------------------------------------- pasos
function paint() {
  $$('[data-step-label]').forEach((li) => {
    const n = Number(li.dataset.stepLabel);
    li.classList.toggle('is-current', n === current);
    li.classList.toggle('is-done', n < current);
    if (n === current) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
  gsap.to('[data-progress]', { scaleX: current / 3, duration: reduced ? 0 : 0.9, ease: 'power3.inOut' });
  btnPrev.hidden = current === 1;
  btnNext.hidden = current === 3;
  btnSubmit.hidden = current !== 3;
}

function go(to: number) {
  if (to === current) return;
  const from = steps[current - 1];
  const next = steps[to - 1];
  const dir = to > current ? 1 : -1;
  current = to;
  if (to === 3) renderReview();
  paint();
  alertBox.hidden = true;
  const show = () => {
    from.hidden = true;
    from.classList.remove('is-active');
    next.hidden = false;
    next.classList.add('is-active');
    $('.steps').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    gsap.fromTo(
      next,
      { autoAlpha: 0, x: 24 * dir, filter: 'blur(4px)' },
      { autoAlpha: 1, x: 0, filter: 'blur(0px)', duration: reduced ? 0 : 0.7, ease: 'power3.out', clearProps: 'filter,transform' },
    );
    next.querySelector<HTMLElement>('.qstep__title')?.focus({ preventScroll: true });
  };
  if (reduced) show();
  else gsap.to(from, { autoAlpha: 0, x: -24 * dir, duration: 0.35, ease: 'power2.in', onComplete: show });
}

btnNext.addEventListener('click', () => {
  clearErrors(steps[current - 1]);
  const errors = validateQuote(data(), current as 1 | 2);
  if (Object.keys(errors).length) return showErrors(errors);
  go(current + 1);
});
btnPrev.addEventListener('click', () => go(current - 1));
$$<HTMLElement>('.qstep__title').forEach((l) => (l.tabIndex = -1));

// Intro en un campo de texto: avanza en lugar de enviar.
form.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && current < 3 && (e.target as HTMLElement).tagName === 'INPUT') {
    e.preventDefault();
    btnNext.click();
  }
});

// Contador de la descripcion
const desc = $<HTMLTextAreaElement>('#f-descripcion');
desc.addEventListener('input', () => ($('[data-count]').textContent = `${desc.value.length} / 4000`));

// ---------------------------------------------------------------- archivos
const fileInput = $<HTMLInputElement>('[data-files]');
const drop = $('[data-drop]');
const list = $('[data-files-list]');
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function readFile(f: File): Promise<QuoteFile> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: f.name, type: f.type, size: f.size, data: String(r.result).split(',')[1] ?? '' });
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

async function addFiles(incoming: FileList | File[]) {
  const box = fieldEl('archivos')!;
  box.classList.remove('is-invalid');
  box.querySelector('.field__error')?.remove();
  const errs: string[] = [];
  for (const f of Array.from(incoming)) {
    const okType = FILES.types.includes(f.type) || /\.(jpe?g|png|webp|pdf)$/i.test(f.name);
    if (!okType) {
      errs.push(`«${f.name}» no es JPG, PNG, WEBP ni PDF.`);
      continue;
    }
    if (files.length >= FILES.maxCount) {
      errs.push(`Máximo ${FILES.maxCount} archivos.`);
      break;
    }
    const total = files.reduce((a, x) => a + x.size, 0) + f.size;
    if (total > FILES.maxTotalBytes) {
      errs.push(`«${f.name}» supera el límite de 3 MB en total.`);
      continue;
    }
    files.push(await readFile(f));
  }
  renderFiles();
  if (errs.length) showErrors({ archivos: errs.join(' ') });
}

function renderFiles() {
  const total = files.reduce((a, x) => a + x.size, 0);
  list.innerHTML = files
    .map(
      (f, i) =>
        `<li><span class="files__type">${/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) ? 'PDF' : 'IMG'}</span><span class="files__name">${esc(f.name)}</span><span class="files__size">${kb(f.size)}</span><button type="button" data-remove="${i}" aria-label="Quitar ${esc(f.name)}">×</button></li>`,
    )
    .join('');
  if (files.length) list.insertAdjacentHTML('beforeend', `<li class="files__total">${files.length} de ${FILES.maxCount} · ${kb(total)} de 3 MB</li>`);
}

fileInput.addEventListener('change', () => {
  if (fileInput.files) addFiles(fileInput.files);
  fileInput.value = '';
});
list.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-remove]');
  if (!b) return;
  files.splice(Number(b.dataset.remove), 1);
  renderFiles();
});
['dragenter', 'dragover'].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('is-over');
  }),
);
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  const dt = (e as DragEvent).dataTransfer;
  if (dt?.files.length) addFiles(dt.files);
});

// ---------------------------------------------------------------- revision
function renderReview() {
  const d = data();
  const v = (s: string) => (s ? esc(s) : '<i>—</i>');
  const fecha = d.fecha ? new Date(`${d.fecha}T12:00:00`).toLocaleDateString('es-ES', { dateStyle: 'long' }) : '';
  const block = (title: string, step: number, rows: [string, string][]) =>
    `<section class="review__block"><header><h3>${title}</h3><button type="button" class="review__edit" data-goto="${step}">Editar</button></header><dl>${rows
      .map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`)
      .join('')}</dl></section>`;
  $('[data-review]').innerHTML =
    block('Datos de contacto', 1, [
      ['Nombre', v(d.nombre)],
      ['Cargo', v(d.cargo)],
      ['Email', v(d.email)],
      ['Teléfono', v(d.telefono)],
      ['Empresa', v(d.empresa)],
      ['CIF / NIF', v(d.cif)],
      ['Web', v(d.web)],
    ]) +
    block('Datos del proyecto', 2, [
      ['Producto / servicio', v(d.producto)],
      ['Cantidad', v(d.cantidad)],
      ['Tipo de proyecto', v(d.tipo)],
      ['Fecha aproximada', v(fecha)],
      ['Presupuesto', v(d.presupuesto)],
      ['Ciudad / provincia', v(d.ciudad)],
      ['Descripción', `<span class="review__desc">${v(d.descripcion)}</span>`],
      ['Archivos', files.length ? files.map((f) => esc(f.name)).join('<br>') : '<i>Ninguno</i>'],
    ]);
  $$<HTMLButtonElement>('[data-goto]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.goto))));
}

// ---------------------------------------------------------------- envio
function setSending(on: boolean) {
  sending = on;
  btnSubmit.disabled = on;
  btnPrev.disabled = on;
  btnSubmit.classList.toggle('is-loading', on);
  $('[data-submit-label]').textContent = on ? 'Enviando…' : 'Enviar solicitud';
  form.setAttribute('aria-busy', String(on));
}

function fail(msg: string) {
  alertBox.textContent = msg;
  alertBox.hidden = false;
  gsap.fromTo(alertBox, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.5 });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sending || current !== 3) return;
  clearErrors();
  const d = data();
  const errors = validateQuote(d);
  if (Object.keys(errors).length) {
    // Vuelve al primer paso con errores.
    const step1 = ['nombre', 'email', 'telefono', 'empresa', 'web', 'cargo', 'cif'];
    const step2 = ['producto', 'descripcion', 'cantidad', 'tipo', 'fecha', 'presupuesto', 'ciudad'];
    const keys = Object.keys(errors);
    if (keys.some((k) => step1.includes(k))) go(1);
    else if (keys.some((k) => step2.includes(k))) go(2);
    setTimeout(() => showErrors(errors), reduced ? 0 : 450);
    return;
  }
  setSending(true);
  try {
    const res = await fetch('/api/presupuesto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; fields?: Record<string, string> };
    if (!res.ok || !out.ok) {
      if (out.fields) {
        const fields = out.fields;
        if (Object.keys(fields).some((k) => ['nombre', 'email', 'telefono', 'empresa', 'web'].includes(k))) go(1);
        else if (!('privacidad' in fields)) go(2);
        setTimeout(() => showErrors(fields), reduced ? 0 : 450);
      }
      fail(out.error || 'No hemos podido enviar la solicitud. Inténtalo de nuevo en unos minutos.');
      return;
    }
    success();
  } catch {
    fail('No hay conexión. Comprueba tu red e inténtalo de nuevo; tus datos siguen aquí.');
  } finally {
    setSending(false);
  }
});

function success() {
  const body = $('[data-quote-body]');
  const done = $('[data-done]');
  const reveal = () => {
    body.hidden = true;
    done.hidden = false;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    done.focus({ preventScroll: true });
    if (reduced) return;
    const tl = gsap.timeline();
    tl.fromTo(done.querySelector('circle'), { strokeDashoffset: 190 }, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut' })
      .fromTo(done.querySelector('path'), { strokeDashoffset: 40 }, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.out' }, '-=0.3')
      .from($$('.done > :not(.done__mark)'), { autoAlpha: 0, y: 18, filter: 'blur(6px)', stagger: 0.1, duration: 0.9, ease: 'power3.out' }, 0.3);
  };
  if (reduced) reveal();
  else gsap.to(body, { autoAlpha: 0, y: -16, duration: 0.5, ease: 'power2.in', onComplete: reveal });
}

// ---------------------------------------------------------------- entrada
paint();
if (!reduced) {
  gsap.from('.quote__media img', { scale: 1.08, duration: 2.4, ease: 'power3.out' });
  gsap.from('.quote__top, .quote__intro > *, .steps, .progress, .qstep.is-active, .qform__nav', {
    autoAlpha: 0,
    y: 20,
    stagger: 0.07,
    duration: 1,
    ease: 'power3.out',
    delay: 0.15,
    clearProps: 'transform,opacity,visibility',
  });
}
