// Panel privado de pedidos, altas y presupuestos (lee /api/mayoristas con ADMIN_KEY).
import './fonts.css';
import './admin.css';

type Item = { kind: string; ref: string; at: string; subject: string; rows?: [string, string][]; text?: string; archivos?: string[] };

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const KEY = 'adk.panel.key';
let items: Item[] = [];
let tab = 'pedidos';

const store = {
  get: () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } },
  set: (v: string) => { try { sessionStorage.setItem(KEY, v); } catch { /* sin almacenamiento */ } },
  clear: () => { try { sessionStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } },
};

async function load(key: string): Promise<boolean> {
  const res = await fetch('/api/mayoristas', { headers: { 'x-admin-key': key } }).catch(() => null);
  if (!res) { $('login-msg').textContent = 'No hay conexión.'; return false; }
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) { $('login-msg').textContent = out.error || 'No se ha podido entrar.'; return false; }
  items = out.items as Item[];
  return true;
}

function render() {
  document.querySelectorAll<HTMLButtonElement>('#tabs [data-k]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.k === tab));
    b.querySelector('span')!.textContent = String(items.filter((i) => i.kind === b.dataset.k).length);
  });
  const list = items.filter((i) => i.kind === tab);
  $('list').innerHTML = list.length
    ? list
        .map((i) => {
          const when = new Date(i.at).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Madrid' });
          const body = i.rows
            ? `<dl>${i.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
            : `<pre>${esc(i.text || '')}</pre>`;
          return `<article class="card"><header><strong>${esc(i.subject)}</strong><time>${esc(when)}</time></header>${body}</article>`;
        })
        .join('')
    : '<p class="empty">Todavía no hay nada aquí.</p>';
}

async function enter(key: string) {
  if (!(await load(key))) return;
  store.set(key);
  $('login').hidden = true;
  $('panel').hidden = false;
  $('logout').hidden = false;
  render();
}

$('login').addEventListener('submit', (e) => {
  e.preventDefault();
  $('login-msg').textContent = 'Comprobando…';
  void enter(($('key') as HTMLInputElement).value.trim());
});
$('tabs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-k]');
  if (b) { tab = b.dataset.k!; render(); }
});
$('reload').addEventListener('click', async () => { if (await load(store.get())) render(); });
$('logout').addEventListener('click', () => { store.clear(); location.reload(); });

const saved = store.get();
if (saved) void enter(saved);
