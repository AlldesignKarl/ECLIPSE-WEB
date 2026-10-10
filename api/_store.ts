// Copia de cada alta, pedido y presupuesto en Vercel Blob (almacen privado).
// Asi nada se pierde aunque el aviso por correo falle; se consultan en el panel
// /alldesign-karl/pedidos/ con la contrasena ADMIN_KEY.
//   BLOB_READ_WRITE_TOKEN   lo crea Vercel al conectar el almacen al proyecto
//   ADMIN_KEY               contrasena del panel

import { put, list, get } from '@vercel/blob';

declare const process: { env: Record<string, string | undefined> };

export type Kind = 'pedidos' | 'altas' | 'presupuestos';

export async function saveRecord(kind: Kind, ref: string, data: Record<string, unknown>): Promise<boolean> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return false;
  try {
    const at = new Date().toISOString();
    await put(`ak/${kind}/${at.replace(/[:.]/g, '-')}-${ref}.json`, JSON.stringify({ kind, ref, at, ...data }), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
    });
    return true;
  } catch (e) {
    console.error('[store] no se ha podido guardar', kind, ref, e);
    return false;
  }
}

export async function listRecords(limit = 300): Promise<unknown[]> {
  const { blobs } = await list({ prefix: 'ak/', limit: 1000 });
  const recent = blobs.sort((a, b) => (a.pathname < b.pathname ? 1 : -1)).slice(0, limit);
  const out = await Promise.all(
    recent.map(async (b) => {
      try {
        const r = await get(b.pathname, { access: 'private' });
        if (!r) return null;
        return JSON.parse(await new Response(r.stream).text());
      } catch {
        return null;
      }
    }),
  );
  return out.filter(Boolean);
}

/** Comparacion en tiempo constante para la contrasena del panel. */
export function isAdmin(key: string | null): boolean {
  const want = process.env.ADMIN_KEY || '';
  if (!want || !key || key.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}
