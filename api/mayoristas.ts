// Alta de clientes mayoristas y pedidos mayoristas de Alldesign Karl.
//
// Funcion serverless de Vercel (POST /api/mayoristas). Dos tipos de envio:
//   { tipo: 'registro', cliente }           alta de un cliente mayorista
//   { tipo: 'pedido', cliente, lineas }     pedido (minimo 100 € sin IVA)
//
// Todo se valida otra vez aqui. Los precios del pedido se calculan en el
// servidor con los de Wix en directo (o con la copia si Wix no responde): el
// navegador solo dice que productos y cuantas unidades.
// El email sale igual que el de presupuestos (Resend si hay RESEND_API_KEY;
// si no, el navegador lo reenvia con FormSubmit). Variables: ver presupuesto.ts.

import {
  MIN_ORDER,
  normId,
  round2,
  eur,
  snapshotPrices,
  validateRegistro,
  type Linea,
  type Registro,
} from '../src/alldesign/wholesale.js';
import { saveRecord, listRecords, isAdmin, type Kind } from './_store.js';
import { sendEmail, hasMailer, recipients, orderEmail, type OrderLine } from './_email.js';

declare const process: { env: Record<string, string | undefined> };

const WIX_CLIENT_ID = 'ea222fb8-f58c-44ac-ad80-daf0f8bfc11c';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const clean = (v: unknown, max = 200) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, max);

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Precios sin IVA de Wix en directo; si Wix tarda o falla, los de la copia.
async function prices() {
  const snap = snapshotPrices();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const tok = await fetch('https://www.wixapis.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: WIX_CLIENT_ID, grantType: 'anonymous' }),
      signal: ctrl.signal,
    }).then((r) => r.json());
    const data = await fetch('https://www.wixapis.com/stores/v3/products/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: tok.access_token },
      body: JSON.stringify({ query: { cursorPaging: { limit: 100 } } }),
      signal: ctrl.signal,
    }).then((r) => r.json());
    clearTimeout(t);
    for (const p of data.products ?? []) {
      const unit = Number(p.actualPriceRange?.minValue?.amount);
      if (!p.id || !isFinite(unit) || unit <= 0) continue;
      const pack = /pack de (\d+)/i.exec(p.ribbon?.name ?? '');
      snap[p.id] = {
        name: String(p.name).trim(),
        unit,
        pack: pack ? Number(pack[1]) : snap[p.id]?.pack ?? 1,
        img: p.media?.main?.image?.url || snap[p.id]?.img || '',
      };
    }
  } catch {
    /* se usa la copia */
  }
  return snap;
}

function readRegistro(c: Record<string, unknown> | undefined): Registro {
  return {
    empresa: clean(c?.empresa, 160),
    nombre: clean(c?.nombre, 120),
    email: clean(c?.email, 160),
    telefono: clean(c?.telefono, 40),
    nif: normId(clean(c?.nif, 20)),
    dni: normId(clean(c?.dni, 20)),
    nifIva: normId(clean(c?.nifIva, 20)),
    privacidad: c?.privacidad === true,
  };
}

const clientRows = (r: Registro): [string, string][] => [
  ['Empresa', r.empresa],
  ['Nombre y apellidos', r.nombre],
  ['Email', r.email],
  ['Teléfono', r.telefono],
  ['NIF/CIF de la empresa', r.nif],
  ['DNI/NIE', r.dni],
  ['NIF-IVA intracomunitario', r.nifIva || '—'],
];

function html(title: string, rows: [string, string][]) {
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#7a6d5f;font-size:13px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;font-size:15px;white-space:pre-wrap">${esc(v)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#f1ebe1;padding:32px 16px;font-family:Georgia,serif;color:#1c1a17"><div style="max-width:640px;margin:0 auto;background:#fbf8f2;border:1px solid #e3d8c6;padding:32px"><p style="margin:0 0 6px;font:500 11px Helvetica,Arial,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#7a6d5f">Alldesign Karl · Mayoristas</p><h1 style="margin:0 0 20px;font-weight:400;font-size:24px">${esc(title)}</h1><table style="border-collapse:collapse">${tr}</table></div></body></html>`;
}

async function deliver(
  kind: Kind,
  ref: string,
  subject: string,
  rows: [string, string][],
  replyTo: string,
  extra: Record<string, unknown>,
  mail?: { html: string; text: string },
) {
  const text = mail?.text ?? rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  // Primero se guarda: aunque el correo falle, queda en el panel de pedidos.
  const saved = await saveRecord(kind, ref, { subject, rows });
  extra = { ...extra, saved };
  if (process.env.EMAIL_DRY_RUN === '1') {
    console.log(`[mayoristas] (prueba) a ${recipients().join(', ')}\nAsunto: ${subject}\n\n${text}`);
    return json(200, { ok: true, dryRun: true, ...extra });
  }
  if (hasMailer()) {
    const sent = await sendEmail({ subject, html: mail?.html ?? html(subject, rows), text, replyTo });
    if (sent || saved) return json(200, { ok: true, emailed: sent, ...extra });
    return json(502, { ok: false, error: 'No hemos podido enviarlo. Inténtalo de nuevo en unos minutos.' });
  }
  // Sin Gmail ni Resend configurados, el navegador lo reenvia con FormSubmit.
  const [to, ...cc] = recipients();
  return json(200, { ok: true, relay: 'formsubmit', to, cc: cc.join(','), subject, rows, ...extra });
}

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: 'La solicitud no tiene un formato válido.' });
  }
  if (clean(body.website2)) return json(200, { ok: true }); // trampa para bots

  const cliente = readRegistro(body.cliente as Record<string, unknown>);
  const errors = validateRegistro(cliente);
  if (Object.keys(errors).length) return json(422, { ok: false, error: 'Revisa los datos de tu empresa.', fields: errors });

  const when = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'long', timeStyle: 'short' });

  if (body.tipo === 'registro') {
    const rows = [...clientRows(cliente), ['Fecha de alta', when] as [string, string]];
    const ref = `A-${Date.now().toString(36).toUpperCase()}`;
    return deliver('altas', ref, `Nuevo cliente mayorista - ${cliente.empresa}`, rows, cliente.email, { ref });
  }

  if (body.tipo !== 'pedido') return json(400, { ok: false, error: 'Tipo de envío desconocido.' });

  const raw = Array.isArray(body.lineas) ? body.lineas.slice(0, 50) : [];
  if (!raw.length) return json(422, { ok: false, error: 'Tu pedido está vacío.' });
  const table = await prices();
  const lines: (Linea & OrderLine)[] = [];
  for (const l of raw as Record<string, unknown>[]) {
    const id = clean(l.productId, 60);
    const p = table[id];
    const qty = Math.floor(Number(l.qty));
    if (!p) return json(422, { ok: false, error: 'Uno de los productos ya no está disponible. Revisa tu pedido.' });
    if (!(qty >= 1 && qty <= 9999)) return json(422, { ok: false, error: 'Revisa las cantidades.' });
    if (qty % p.pack) return json(422, { ok: false, error: `${p.name} se vende en packs de ${p.pack} unidades.` });
    lines.push({ productId: id, name: p.name, detalle: clean(l.detalle, 300), qty, unit: p.unit, total: round2(p.unit * qty), img: p.img, pack: p.pack });
  }
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  if (subtotal < MIN_ORDER)
    return json(422, { ok: false, error: `El pedido mínimo para mayoristas es de ${eur(MIN_ORDER)} sin IVA. Te faltan ${eur(round2(MIN_ORDER - subtotal))}.` });

  const ref = `M-${Date.now().toString(36).toUpperCase()}`;
  const rows: [string, string][] = [
    ['Referencia', ref],
    ...clientRows(cliente),
    ...lines.map((l, i) => [
      `Producto ${i + 1}`,
      `${l.name}${l.detalle ? ` (${l.detalle})` : ''}\n${l.qty} × ${eur(l.unit)} = ${eur(l.total)}`,
    ] as [string, string]),
    ['Total del pedido (sin IVA)', eur(subtotal)],
    ['IVA', 'Precios mayoristas sin IVA. El IVA que corresponda se indica en la factura.'],
    ['Observaciones', clean(body.notas, 1000) || '—'],
    ['Fecha del pedido', when],
  ];
  const notas = clean(body.notas, 1000);
  const units = lines.reduce((n, l) => n + l.qty, 0);
  const mail = orderEmail({ ref, when, cliente, lines, subtotal, notas, eur });
  return deliver(
    'pedidos',
    ref,
    `Nuevo pedido ${ref} · ${cliente.empresa} · ${units} uds. · ${eur(subtotal)}`,
    rows,
    cliente.email,
    { ref, subtotal },
    mail,
  );
}

// Panel de pedidos: GET /api/mayoristas con la cabecera x-admin-key.
export async function GET(request: Request): Promise<Response> {
  if (!isAdmin(request.headers.get('x-admin-key'))) return json(401, { ok: false, error: 'Contraseña incorrecta.' });
  try {
    return json(200, { ok: true, items: await listRecords() });
  } catch (e) {
    console.error('[mayoristas] panel', e);
    return json(500, { ok: false, error: 'No se han podido cargar los pedidos.' });
  }
}
