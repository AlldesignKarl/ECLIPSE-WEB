// Configuracion del formulario de presupuesto. La usan la pagina y la funcion
// de servidor (api/presupuesto.ts), asi que los limites son los mismos en los
// dos lados.

/** Opciones del selector "Producto o servicio". Se pueden cambiar libremente. */
export const PRODUCT_OPTIONS = [
  'Productos artesanales',
  'Regalos para empresas',
  'Decoración',
  'Pedidos personalizados',
  'Pedidos mayoristas / grandes cantidades',
  'Otro',
];

/** Opciones de "Tipo de proyecto". */
export const PROJECT_TYPES = [
  'Pedido puntual',
  'Pedido recurrente',
  'Evento o campaña',
  'Proyecto de interiorismo',
  'Otro',
];

/** Rangos de "Presupuesto aproximado" (opcional). */
export const BUDGET_OPTIONS = ['Menos de 500 €', '500 – 1.500 €', '1.500 – 5.000 €', 'Más de 5.000 €', 'Aún no lo sé'];

// Adjuntos. Vercel limita el cuerpo de una peticion a 4,5 MB, y los archivos
// viajan en base64 (un tercio mas grandes): 3 MB en total deja margen.
export const FILES = {
  maxCount: 3,
  maxTotalBytes: 3 * 1024 * 1024,
  types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  accept: '.jpg,.jpeg,.png,.webp,.pdf',
  label: 'JPG, PNG, WEBP o PDF · hasta 3 archivos · 3 MB en total',
};

export interface QuoteFile {
  name: string;
  type: string;
  size: number;
  /** Contenido en base64, sin el prefijo data:. */
  data: string;
}

export interface QuotePayload {
  nombre: string;
  cargo: string;
  email: string;
  telefono: string;
  empresa: string;
  cif: string;
  web: string;
  producto: string;
  cantidad: string;
  tipo: string;
  fecha: string;
  presupuesto: string;
  ciudad: string;
  descripcion: string;
  privacidad: boolean;
  comunicaciones: boolean;
  /** Campo trampa para bots: una persona nunca lo rellena. */
  website2: string;
  archivos: QuoteFile[];
}

export const LIMITS: Record<string, number> = {
  nombre: 120,
  cargo: 120,
  email: 160,
  telefono: 40,
  empresa: 160,
  cif: 30,
  web: 200,
  producto: 80,
  cantidad: 80,
  tipo: 80,
  fecha: 20,
  presupuesto: 40,
  ciudad: 120,
  descripcion: 4000,
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^[+()\d\s.-]{7,20}$/;

/** Errores por campo; vacio si todo esta bien. Mismo criterio en cliente y servidor. */
export function validateQuote(p: Partial<QuotePayload>, step?: 1 | 2): Record<string, string> {
  const e: Record<string, string> = {};
  const t = (k: keyof QuotePayload) => String(p[k] ?? '').trim();
  if (!step || step === 1) {
    if (!t('nombre')) e.nombre = 'Indica tu nombre y apellidos.';
    if (!t('email')) e.email = 'Indica un email de contacto.';
    else if (!EMAIL_RE.test(t('email'))) e.email = 'Este email no parece válido.';
    if (!t('telefono')) e.telefono = 'Indica un teléfono de contacto.';
    else if (!PHONE_RE.test(t('telefono'))) e.telefono = 'Este teléfono no parece válido.';
    if (!t('empresa')) e.empresa = 'Indica el nombre de la empresa.';
    if (t('web') && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(t('web'))) e.web = 'Esta dirección web no parece válida.';
  }
  if (!step || step === 2) {
    if (!t('producto')) e.producto = 'Elige qué te interesa.';
    if (t('descripcion').length < 10) e.descripcion = 'Cuéntanos el proyecto en unas líneas.';
  }
  if (!step) {
    if (p.privacidad !== true) e.privacidad = 'Es necesario aceptar la Política de Privacidad.';
  }
  for (const [k, max] of Object.entries(LIMITS)) {
    if (String(p[k as keyof QuotePayload] ?? '').length > max && !e[k]) e[k] = `Máximo ${max} caracteres.`;
  }
  return e;
}
