// Venta a mayoristas de Alldesign Karl: reglas comunes al navegador y al
// servidor (api/mayoristas.ts). El servidor vuelve a comprobarlo todo.

import SNAPSHOT from './shop-products.js';

/** Pedido mínimo, en euros y sin IVA. */
export const MIN_ORDER = 100;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^[+()\d\s.-]{7,20}$/;

export type Registro = {
  empresa: string;
  nombre: string;
  email: string;
  telefono: string;
  nif: string; // NIF/CIF de la empresa (o NIF del autónomo)
  dni: string; // DNI o NIE de la persona que hace el pedido
  nifIva: string; // NIF-IVA intracomunitario (opcional, empresas de la UE)
  privacidad: boolean;
};

export type Linea = {
  productId: string;
  name: string;
  detalle: string; // opciones elegidas: color, letra, aroma...
  qty: number;
};

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

export const normId = (s: string) => String(s ?? '').toUpperCase().replace(/[\s.-]/g, '');

/** DNI (12345678Z) o NIE (X1234567L) con la letra de control correcta. */
export function isDniNie(raw: string): boolean {
  const s = normId(raw);
  const m = /^([XYZ]|\d)(\d{7})([A-Z])$/.exec(s);
  if (!m) return false;
  const lead = { X: '0', Y: '1', Z: '2' }[m[1] as 'X'] ?? m[1];
  return DNI_LETTERS[Number(lead + m[2]) % 23] === m[3];
}

/** CIF de sociedad (B12345674) con su dígito o letra de control. */
export function isCif(raw: string): boolean {
  const s = normId(raw);
  const m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(s);
  if (!m) return false;
  const d = m[2].split('').map(Number);
  let sum = 0;
  d.forEach((n, i) => {
    if (i % 2 === 0) {
      const x = n * 2;
      sum += Math.floor(x / 10) + (x % 10);
    } else sum += n;
  });
  const ctrl = (10 - (sum % 10)) % 10;
  const letter = 'JABCDEFGHI'[ctrl];
  if ('PQRSNW'.includes(m[1])) return m[3] === letter;
  if ('ABEH'.includes(m[1])) return m[3] === String(ctrl);
  return m[3] === String(ctrl) || m[3] === letter;
}

/** NIF de empresa: CIF de sociedad, o DNI/NIE si es autónomo. */
export const isNifEmpresa = (s: string) => isCif(s) || isDniNie(s);

/** NIF-IVA intracomunitario: prefijo del país + número (p. ej. ESB12345674). */
export const isNifIva = (s: string) => /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(normId(s));

export function validateRegistro(r: Registro): Record<string, string> {
  const e: Record<string, string> = {};
  if (r.empresa.length < 2) e.empresa = 'Escribe el nombre de la empresa.';
  if (r.nombre.trim().split(/\s+/).length < 2) e.nombre = 'Escribe tu nombre y apellidos.';
  if (!EMAIL_RE.test(r.email)) e.email = 'Revisa el correo electrónico.';
  if (!PHONE_RE.test(r.telefono) || r.telefono.replace(/\D/g, '').length < 9) e.telefono = 'Revisa el número de teléfono.';
  if (!isNifEmpresa(r.nif)) e.nif = 'El NIF/CIF no es válido. Revisa letras y números.';
  if (!isDniNie(r.dni)) e.dni = 'El DNI/NIE no es válido. Revisa la letra.';
  if (r.nifIva && !isNifIva(r.nifIva)) e.nifIva = 'El NIF-IVA debe empezar por el código del país (p. ej. ES).';
  if (!r.privacidad) e.privacidad = 'Necesitamos tu conformidad para darte de alta.';
  return e;
}

type SnapProduct = { id: string; name: string; ribbon?: { name?: string }; actualPriceRange?: { minValue?: { amount?: string } } };

/** Unidades por pack (los ambientadores se venden de 5 en 5). */
export function packSize(p: SnapProduct | undefined): number {
  const m = /pack de (\d+)/i.exec(p?.ribbon?.name ?? '');
  return m ? Number(m[1]) : 1;
}

/** Precios sin IVA por producto, de la copia de Wix (se pueden sustituir por los de Wix en directo). */
export function snapshotPrices(): Record<string, { name: string; unit: number; pack: number }> {
  const out: Record<string, { name: string; unit: number; pack: number }> = {};
  for (const p of SNAPSHOT as SnapProduct[]) {
    out[p.id] = { name: p.name.trim(), unit: Number(p.actualPriceRange?.minValue?.amount ?? 0), pack: packSize(p) };
  }
  return out;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
