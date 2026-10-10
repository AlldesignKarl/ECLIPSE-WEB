// Correos de Alldesign Karl: envio y diseno del aviso de pedido mayorista.
//
// Destinatarios: EMAIL_TO (separados por comas). Por defecto los dos correos
// del taller. Formas de envio, por orden:
//   GMAIL_USER + GMAIL_APP_PASSWORD   Gmail (contrasena de aplicacion de Google)
//   RESEND_API_KEY (+ EMAIL_FROM)     Resend
//   ninguna                           el navegador lo reenvia con FormSubmit

import nodemailer from 'nodemailer';
import SNAPSHOT from '../src/alldesign/shop-products.js';

declare const process: { env: Record<string, string | undefined> };

export const recipients = () =>
  (process.env.EMAIL_TO || 'alldesignkarl@gmail.com,vanessa@alldesignkarl.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const hasMailer = () => !!((process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || process.env.RESEND_API_KEY);

export async function sendEmail(m: {
  subject: string;
  html: string;
  text: string;
  replyTo: string;
  attachments?: { filename: string; content: string }[]; // content en base64
}): Promise<boolean> {
  const to = recipients();
  try {
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      const t = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, '') },
      });
      await t.sendMail({
        from: `Alldesign Karl <${process.env.GMAIL_USER}>`,
        to,
        replyTo: m.replyTo,
        subject: m.subject,
        html: m.html,
        text: m.text,
        attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content, encoding: 'base64' })),
      });
      return true;
    }
    if (process.env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Alldesign Karl <onboarding@resend.dev>',
          to,
          reply_to: m.replyTo,
          subject: m.subject,
          html: m.html,
          text: m.text,
          attachments: m.attachments,
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status} ${await res.text().catch(() => '')}`);
      return true;
    }
  } catch (e) {
    console.error('[email] no se ha podido enviar', e);
  }
  return false;
}

const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Color de cada nombre de color de la tienda, para pintar la muestra en el correo.
const COLORS: Record<string, string> = {};
for (const p of SNAPSHOT as { options?: { choicesSettings?: { choices?: { name: string; colorCode?: string }[] } }[] }[])
  for (const o of p.options ?? []) for (const c of o.choicesSettings?.choices ?? []) if (c.colorCode) COLORS[c.name.toLowerCase()] = c.colorCode;

const thumb = (u: string) => {
  const m = /static\.wixstatic\.com\/media\/([^/]+)/.exec(u || '');
  return m ? `https://static.wixstatic.com/media/${m[1]}/v1/fill/w_180,h_180,al_c,q_85/${m[1]}` : '';
};

const swatch = (name: string) => {
  const c = COLORS[name.trim().toLowerCase()];
  return c
    ? `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${c};border:1px solid rgba(0,0,0,.15);vertical-align:-1px;margin-right:5px"></span>`
    : '';
};

// "Color: Rojo · Letra: M" -> filas con la muestra de color.
function detailHtml(detalle: string) {
  if (!detalle) return '';
  return detalle
    .split(' · ')
    .map((part) => {
      const i = part.indexOf(':');
      const k = i === -1 ? '' : part.slice(0, i).trim();
      const v = i === -1 ? part : part.slice(i + 1).trim();
      const val = /^colou?res?$/i.test(k)
        ? v.split('+').map((c) => `${swatch(c)}${esc(c.trim())}`).join(' &nbsp;+&nbsp; ')
        : `${/color/i.test(k) ? swatch(v) : ''}${esc(v)}`;
      return `<div style="font:14px/1.6 Helvetica,Arial,sans-serif;color:#4a4036">${k ? `<span style="color:#9a8a78">${esc(k)}:</span> ` : ''}<strong style="font-weight:600">${val}</strong></div>`;
    })
    .join('');
}

export type OrderLine = { name: string; detalle: string; qty: number; unit: number; total: number; img: string; pack: number };

export function orderEmail(o: {
  ref: string;
  when: string;
  cliente: { empresa: string; nombre: string; email: string; telefono: string; nif: string; dni: string; nifIva: string };
  lines: OrderLine[];
  subtotal: number;
  notas: string;
  eur: (n: number) => string;
}) {
  const { eur, cliente: c } = o;
  const units = o.lines.reduce((s, l) => s + l.qty, 0);
  const lineRows = o.lines
    .map((l) => {
      const img = thumb(l.img);
      return `<tr>
<td style="padding:16px 0;border-bottom:1px solid #eadfcd;width:76px;vertical-align:top">${img ? `<img src="${img}" width="64" height="64" alt="" style="display:block;border-radius:10px;object-fit:cover">` : ''}</td>
<td style="padding:16px 12px;border-bottom:1px solid #eadfcd;vertical-align:top">
<div style="font:600 16px/1.35 Georgia,serif;color:#2b2620">${esc(l.name)}</div>
${detailHtml(l.detalle)}
<div style="font:13px/1.6 Helvetica,Arial,sans-serif;color:#9a8a78;margin-top:2px">${eur(l.unit)} / ud.${l.pack > 1 ? ` · packs de ${l.pack}` : ''}</div>
</td>
<td style="padding:16px 0;border-bottom:1px solid #eadfcd;vertical-align:top;text-align:right;white-space:nowrap">
<div style="font:600 13px Helvetica,Arial,sans-serif;color:#7a6d5f;letter-spacing:.06em">× ${l.qty} ${l.qty === 1 ? 'ud.' : 'uds.'}</div>
<div style="font:600 16px Georgia,serif;color:#2b2620;margin-top:4px">${eur(l.total)}</div>
</td></tr>`;
    })
    .join('');

  const field = (k: string, v: string) =>
    `<tr><td style="padding:5px 14px 5px 0;font:13px Helvetica,Arial,sans-serif;color:#9a8a78;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:5px 0;font:15px Helvetica,Arial,sans-serif;color:#2b2620">${v}</td></tr>`;
  const tel = c.telefono.replace(/[^\d+]/g, '');
  const section = (t: string) =>
    `<p style="margin:30px 0 10px;font:600 11px Helvetica,Arial,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#b08a4a">${t}</p>`;
  const btn = (href: string, label: string, dark: boolean) =>
    `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 22px;border-radius:999px;font:600 12px Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;${dark ? 'background:#2b2620;color:#fbf8f2' : 'border:1px solid #2b2620;color:#2b2620'}">${label}</a>`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#efe7da">
<div style="display:none;max-height:0;overflow:hidden">${esc(c.empresa)} · ${units} uds. · ${eur(o.subtotal)} sin IVA</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe7da"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fbf8f2;border-radius:22px;overflow:hidden;border:1px solid #e3d8c6">
<tr><td style="padding:30px 32px 26px;background:#2b2620;color:#fbf8f2">
<p style="margin:0;font:600 11px Helvetica,Arial,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#d8bf8e">Alldesign Karl · Mayoristas</p>
<h1 style="margin:10px 0 0;font:400 30px/1.15 Georgia,serif">Nuevo pedido</h1>
<p style="margin:6px 0 0;font:15px Helvetica,Arial,sans-serif;color:#d9cfc0">${esc(c.empresa)} · ${esc(o.when)}</p>
</td></tr>
<tr><td style="padding:22px 32px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3ece0;border-radius:16px"><tr>
<td style="padding:16px 18px"><div style="font:11px Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#9a8a78">Referencia</div><div style="font:600 17px Georgia,serif;color:#2b2620;margin-top:4px;white-space:nowrap">${esc(o.ref)}</div></td>
<td style="padding:16px 18px"><div style="font:11px Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#9a8a78">Unidades</div><div style="font:600 17px Georgia,serif;color:#2b2620;margin-top:4px">${units}</div></td>
<td style="padding:16px 18px;text-align:right"><div style="font:11px Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#9a8a78">Total sin IVA</div><div style="font:600 22px Georgia,serif;color:#2b2620;margin-top:2px">${eur(o.subtotal)}</div></td>
</tr></table>
</td></tr>
<tr><td style="padding:0 32px">
${section('Lo que han pedido')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lineRows}
<tr><td></td><td style="padding:16px 12px 0;font:600 13px Helvetica,Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#7a6d5f">Total (sin IVA)</td><td style="padding:16px 0 0;text-align:right;font:600 20px Georgia,serif;color:#2b2620;white-space:nowrap">${eur(o.subtotal)}</td></tr>
</table>
${o.notas ? `${section('Observaciones del cliente')}<div style="padding:14px 16px;background:#f3ece0;border-left:3px solid #b08a4a;border-radius:8px;font:15px/1.6 Helvetica,Arial,sans-serif;color:#2b2620;white-space:pre-wrap">${esc(o.notas)}</div>` : ''}
${section('Cliente')}
<table role="presentation" cellpadding="0" cellspacing="0">
${field('Empresa', `<strong>${esc(c.empresa)}</strong>`)}
${field('Contacto', esc(c.nombre))}
${field('Email', `<a href="mailto:${esc(c.email)}" style="color:#2b2620">${esc(c.email)}</a>`)}
${field('Teléfono', `<a href="tel:${esc(tel)}" style="color:#2b2620">${esc(c.telefono)}</a>`)}
${field('NIF/CIF', esc(c.nif))}
${field('DNI/NIE', esc(c.dni))}
${c.nifIva ? field('NIF-IVA', esc(c.nifIva)) : ''}
</table>
<div style="margin:26px 0 6px">
${btn(`mailto:${esc(c.email)}?subject=${encodeURIComponent(`Tu pedido ${o.ref} - Alldesign Karl`)}`, 'Responder al cliente', true)}
${btn(`tel:${esc(tel)}`, 'Llamar', false)}
</div>
<p style="margin:18px 0 30px;font:13px/1.6 Helvetica,Arial,sans-serif;color:#9a8a78">Precios mayoristas sin IVA. El IVA que corresponda se indica en la factura. Pedido mínimo 100 € sin IVA.</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font:12px Helvetica,Arial,sans-serif;color:#9a8a78">Aviso automático de la tienda para mayoristas de Alldesign Karl</p>
</td></tr></table>
</body></html>`;

  const text = [
    `NUEVO PEDIDO MAYORISTA ${o.ref}`,
    `${c.empresa} · ${o.when}`,
    '',
    'LO QUE HAN PEDIDO',
    ...o.lines.map((l) => `- ${l.name}${l.detalle ? ` (${l.detalle})` : ''}: ${l.qty} uds. × ${eur(l.unit)} = ${eur(l.total)}`),
    '',
    `TOTAL SIN IVA: ${eur(o.subtotal)}`,
    o.notas ? `\nOBSERVACIONES: ${o.notas}` : '',
    '',
    'CLIENTE',
    `Empresa: ${c.empresa}`,
    `Contacto: ${c.nombre}`,
    `Email: ${c.email}`,
    `Teléfono: ${c.telefono}`,
    `NIF/CIF: ${c.nif}`,
    `DNI/NIE: ${c.dni}`,
    c.nifIva ? `NIF-IVA: ${c.nifIva}` : '',
  ]
    .filter((s) => s !== '')
    .join('\n');

  return { html, text };
}
