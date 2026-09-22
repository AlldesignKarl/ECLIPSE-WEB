// Solicitudes de presupuesto de Alldesign Karl.
//
// Funcion serverless de Vercel (POST /api/presupuesto). Recibe el formulario
// en JSON, lo valida otra vez (nunca se confia en el navegador) y lo envia por
// email con Resend (https://resend.com). La clave solo existe aqui, en el
// servidor, a traves de variables de entorno:
//
//   RESEND_API_KEY   clave de la API de Resend (obligatoria)
//   EMAIL_TO         a quien llegan las solicitudes (por defecto alldesignkarl@gmail.com)
//   EMAIL_FROM       remitente; sin dominio propio verificado en Resend hay que
//                    usar "Alldesign Karl <onboarding@resend.dev>" (valor por
//                    defecto), que solo puede enviar al email de la cuenta de Resend
//   EMAIL_DRY_RUN=1  no envia nada: escribe el email en el registro (pruebas)

import {
  FILES,
  PRODUCT_OPTIONS,
  PROJECT_TYPES,
  BUDGET_OPTIONS,
  validateQuote,
  type QuoteFile,
  type QuotePayload,
} from '../src/alldesign/quote-config.js';

// Variables de entorno de Vercel. Se declara aqui para no depender de los
// tipos de Node al compilar la funcion.
declare const process: { env: Record<string, string | undefined> };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const clean = (v: unknown, max = 4000) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
    .slice(0, max);

// El tipo que declara el navegador no basta: se comprueba la firma del archivo.
function sniff(bytes: Uint8Array): string | null {
  const s = (i: number, str: string) => [...str].every((ch, k) => bytes[i + k] === ch.charCodeAt(0));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && s(1, 'PNG')) return 'image/png';
  if (s(0, 'RIFF') && s(8, 'WEBP')) return 'image/webp';
  if (s(0, '%PDF')) return 'application/pdf';
  return null;
}

function checkFiles(list: unknown): { files: QuoteFile[]; error?: string } {
  if (!Array.isArray(list) || list.length === 0) return { files: [] };
  if (list.length > FILES.maxCount) return { files: [], error: `Máximo ${FILES.maxCount} archivos.` };
  const files: QuoteFile[] = [];
  let total = 0;
  for (const f of list) {
    const data = String(f?.data ?? '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { files: [], error: 'Un archivo adjunto está dañado.' };
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    total += bytes.length;
    const type = sniff(bytes);
    if (!type || !FILES.types.includes(type)) return { files: [], error: 'Solo se admiten archivos JPG, PNG, WEBP o PDF.' };
    const name = clean(f?.name, 120).replace(/[\\/:*?"<>|]/g, '_') || 'adjunto';
    files.push({ name, type, size: bytes.length, data });
  }
  if (total > FILES.maxTotalBytes) return { files: [], error: 'Los archivos superan los 3 MB en total.' };
  return { files };
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function buildEmail(p: QuotePayload, files: QuoteFile[], when: string) {
  const v = (s: string) => s || '—';
  const contact: [string, string][] = [
    ['Nombre', p.nombre],
    ['Cargo', p.cargo],
    ['Email', p.email],
    ['Teléfono', p.telefono],
    ['Empresa', p.empresa],
    ['CIF/NIF', p.cif],
    ['Web', p.web],
  ];
  const project: [string, string][] = [
    ['Producto/servicio', p.producto],
    ['Cantidad', p.cantidad],
    ['Tipo de proyecto', p.tipo],
    ['Fecha aproximada', p.fecha ? new Date(`${p.fecha}T12:00:00Z`).toLocaleDateString('es-ES', { dateStyle: 'long', timeZone: 'Europe/Madrid' }) : ''],
    ['Presupuesto', p.presupuesto],
    ['Ciudad/provincia', p.ciudad],
  ];
  const fileLines = files.length ? files.map((f) => `${f.name} (${kb(f.size)})`) : ['Ninguno'];
  const consent = `Acepta la Política de Privacidad: sí\nAcepta recibir información relacionada con su solicitud: ${p.comunicaciones ? 'sí' : 'no'}`;

  const text = [
    'NUEVA SOLICITUD DE PRESUPUESTO',
    '',
    'DATOS DE CONTACTO',
    '',
    ...contact.map(([k, val]) => `${k}: ${v(val)}`),
    '',
    'DATOS DEL PROYECTO',
    '',
    ...project.map(([k, val]) => `${k}: ${v(val)}`),
    '',
    'DESCRIPCIÓN:',
    '',
    p.descripcion,
    '',
    'ARCHIVOS ADJUNTOS:',
    '',
    ...fileLines,
    '',
    consent,
    '',
    `Fecha y hora de solicitud: ${when}`,
  ].join('\n');

  const row = ([k, val]: [string, string]) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#7a6d5f;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-size:15px;color:#1c1a17">${esc(v(val))}</td></tr>`;
  const h = (t: string) =>
    `<h2 style="margin:28px 0 8px;font:500 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#b08a4a">${t}</h2>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1ebe1;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#1c1a17">
<div style="max-width:620px;margin:0 auto;background:#fbf8f2;border:1px solid #e3d8c6;padding:36px 32px">
<p style="margin:0 0 6px;font:500 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#7a6d5f">Alldesign Karl</p>
<h1 style="margin:0;font-weight:400;font-size:26px">Nueva solicitud de presupuesto</h1>
${h('Datos de contacto')}<table style="border-collapse:collapse">${contact.map(row).join('')}</table>
${h('Datos del proyecto')}<table style="border-collapse:collapse">${project.map(row).join('')}</table>
${h('Descripción')}<p style="margin:0;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(p.descripcion)}</p>
${h('Archivos adjuntos')}<p style="margin:0;font-size:15px;line-height:1.6">${fileLines.map(esc).join('<br>')}</p>
<p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e3d8c6;font:13px/1.6 Helvetica,Arial,sans-serif;color:#7a6d5f">${esc(consent).replace(/\n/g, '<br>')}<br>Fecha y hora de solicitud: ${esc(when)}</p>
</div></body></html>`;

  return { subject: `Nueva solicitud de presupuesto - ${p.empresa}`, text, html };
}

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: 'La solicitud no tiene un formato válido.' });
  }

  // Trampa para bots: se responde como si todo hubiera ido bien.
  if (clean(body.website2)) return json(200, { ok: true });

  const p: QuotePayload = {
    nombre: clean(body.nombre, 120),
    cargo: clean(body.cargo, 120),
    email: clean(body.email, 160),
    telefono: clean(body.telefono, 40),
    empresa: clean(body.empresa, 160),
    cif: clean(body.cif, 30),
    web: clean(body.web, 200),
    producto: clean(body.producto, 80),
    cantidad: clean(body.cantidad, 80),
    tipo: clean(body.tipo, 80),
    fecha: clean(body.fecha, 20),
    presupuesto: clean(body.presupuesto, 40),
    ciudad: clean(body.ciudad, 120),
    descripcion: clean(body.descripcion, 4000),
    privacidad: body.privacidad === true,
    comunicaciones: body.comunicaciones === true,
    website2: '',
    archivos: [],
  };

  const errors = validateQuote(p);
  // Los selectores solo admiten sus propias opciones.
  if (p.producto && !PRODUCT_OPTIONS.includes(p.producto)) errors.producto = 'Elige una opción de la lista.';
  if (p.tipo && !PROJECT_TYPES.includes(p.tipo)) errors.tipo = 'Elige una opción de la lista.';
  if (p.presupuesto && !BUDGET_OPTIONS.includes(p.presupuesto)) errors.presupuesto = 'Elige una opción de la lista.';
  if (p.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) errors.fecha = 'Fecha no válida.';
  if (Object.keys(errors).length) return json(422, { ok: false, error: 'Revisa los campos marcados.', fields: errors });

  const { files, error: fileError } = checkFiles(body.archivos);
  if (fileError) return json(422, { ok: false, error: fileError, fields: { archivos: fileError } });

  const when = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'long', timeStyle: 'short' });
  const mail = buildEmail(p, files, when);
  const to = process.env.EMAIL_TO || 'alldesignkarl@gmail.com';
  const from = process.env.EMAIL_FROM || 'Alldesign Karl <onboarding@resend.dev>';

  if (process.env.EMAIL_DRY_RUN === '1') {
    console.log(`[presupuesto] (prueba, no se envia) a ${to}\nAsunto: ${mail.subject}\n\n${mail.text}\nAdjuntos: ${files.length}`);
    return json(200, { ok: true, dryRun: true });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('[presupuesto] Falta la variable de entorno RESEND_API_KEY');
    return json(503, { ok: false, error: 'El envío no está disponible ahora mismo. Escríbenos a alldesignkarl@gmail.com o llámanos al 661 30 79 18.' });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: p.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: files.map((f) => ({ filename: f.name, content: f.data })),
    }),
  });

  if (!res.ok) {
    console.error('[presupuesto] Resend respondio', res.status, await res.text().catch(() => ''));
    return json(502, { ok: false, error: 'No hemos podido enviar la solicitud. Inténtalo de nuevo en unos minutos o escríbenos a alldesignkarl@gmail.com.' });
  }
  return json(200, { ok: true });
}
