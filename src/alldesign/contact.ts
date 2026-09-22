// Datos de contacto de Alldesign Karl, en un solo sitio.
//
// Las paginas los toman de aqui a traves de los atributos data-contact="..."
// (ver applyContact): cambiar un dato se hace en este archivo y en ningun otro.

export const CONTACT = {
  email: 'alldesignkarl@gmail.com',
  phoneDisplay: '661 30 79 18',
  phoneHref: 'tel:+34661307918',
  instagramHandle: '@alldesignkarl',
  // Perfil de Instagram. No se ha podido comprobar desde aqui que la URL sea
  // la del perfil real: si cambia, basta con tocar esta linea.
  instagramUrl: 'https://www.instagram.com/alldesignkarl/',
  quotePage: '/alldesign-karl/presupuesto/',
  privacyPage: '/alldesign-karl/privacidad/',
};

/** Rellena enlaces y textos marcados con data-contact="email|phone|instagram". */
export function applyContact(root: ParentNode = document) {
  root.querySelectorAll<HTMLAnchorElement>('[data-contact]').forEach((el) => {
    const kind = el.dataset.contact;
    const withText = el.hasAttribute('data-contact-text');
    if (kind === 'email') {
      el.href = `mailto:${CONTACT.email}`;
      if (withText) el.textContent = CONTACT.email;
    } else if (kind === 'phone') {
      el.href = CONTACT.phoneHref;
      if (withText) el.textContent = CONTACT.phoneDisplay;
    } else if (kind === 'instagram') {
      el.href = CONTACT.instagramUrl;
      el.target = '_blank';
      el.rel = 'noopener';
      if (withText) el.textContent = CONTACT.instagramHandle;
    }
  });
}
