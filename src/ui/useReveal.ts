import { useEffect } from 'react';

/**
 * El revelado de las secciones.
 *
 * Por debajo del eclipse la pagina se quedaba quieta: los bloques ya estaban
 * pintados antes de llegar a ellos, asi que bajar no producia nada. En una web
 * que vende movimiento, eso es contradecirse a mitad de pagina.
 *
 * Dos decisiones aqui son de seguridad, no de estetica, y mandan sobre el
 * efecto:
 *
 * 1. NADA se oculta hasta que este codigo se ha ejecutado. La clase que esconde
 *    la pone el propio script; si el script no llega a correr, la pagina se ve
 *    entera. Ocultar desde la hoja de estilos y destapar desde JavaScript es
 *    apostarse el contenido a que el JavaScript no falle nunca.
 *
 * 2. No se usa IntersectionObserver. Se probo, y bajo carga sus avisos tardaban
 *    SEGUNDOS en llegar: el bloque estaba a 169 pixeles del borde superior, en
 *    mitad de la pantalla, y seguia invisible. Con dieciocho elementos, medir a
 *    mano en un fotograma de scroll no cuesta nada y ocurre cuando tiene que
 *    ocurrir. La precision del observador no compensa perder el control del
 *    momento.
 *
 * Se revela UNA VEZ, y el elemento sale de la lista. Un bloque que se desvanece
 * al salir obliga a volver a esperarlo si subes, y releer algo no deberia
 * costar una animacion.
 */

const PIEZAS = [
  '.kicker',
  '.section > h2',
  '.prose',
  '.offer > li',
  '.acts > li',
  '.trabajo',
  '.archive > li',
  '.panel',
  '.footer',
].join(', ');

/** Retardo entre hermanos, en milisegundos. */
const ESCALON = 70;

/** Tope del escalonado: mas alla se percibe como que la pagina va lenta. */
const MAX_ESCALONES = 5;

/** Fraccion de la altura de ventana a partir de la cual se considera visible. */
const UMBRAL = 0.9;

export function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const piezas = Array.from(el.querySelectorAll<HTMLElement>(PIEZAS));
    if (piezas.length === 0) return;

    // Quien ha pedido que la pagina se este quieta no llega a ocultar nada, asi
    // que tampoco hay nada que vigilar ni un oyente de scroll de mas.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    for (const pieza of piezas) {
      pieza.classList.add('revela');
      // Indice dentro de su propio grupo de hermanos revelables.
      const hermanos = pieza.parentElement
        ? Array.from(pieza.parentElement.children).filter((h) => h.matches(PIEZAS))
        : [];
      const i = Math.min(Math.max(hermanos.indexOf(pieza), 0), MAX_ESCALONES);
      pieza.style.setProperty('--revela-espera', `${i * ESCALON}ms`);
    }

    let pendientes = piezas;

    const revisa = () => {
      const limite = window.innerHeight * UMBRAL;

      // Al final del documento ya no se puede bajar mas, asi que lo que quede
      // por debajo del umbral no va a cruzarlo NUNCA. Le pasaba al pie, que es
      // el ultimo elemento: su borde superior no llegaba a subir del 90 % de la
      // ventana, se quedaba a opacidad cero para siempre y por el hueco se veia
      // la escena 3D asomando al fondo de la pagina. Aqui vale con estar en
      // pantalla.
      const alFinal =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

      pendientes = pendientes.filter((pieza) => {
        const r = pieza.getBoundingClientRect();
        const dentro = r.bottom > 0 && (r.top < limite || (alFinal && r.top < window.innerHeight));
        if (!dentro) return true;
        pieza.classList.add('revela--visto');
        return false;
      });
      if (pendientes.length === 0) suelta();
    };

    const suelta = () => {
      window.removeEventListener('scroll', revisa);
      window.removeEventListener('resize', revisa);
    };

    window.addEventListener('scroll', revisa, { passive: true });
    window.addEventListener('resize', revisa);

    // Sin requestAnimationFrame, ni siquiera para agrupar.
    //
    // Medido: con la escena 3D corriendo, el rAF de esta pagina puede tardar
    // SEGUNDOS en devolver el turno, porque el lienzo se come el bucle de
    // fotogramas. Colgar de ahi el momento de mostrar texto significa que el
    // texto aparece cuando al lienzo le viene bien. Un evento de scroll ya
    // llega como mucho una vez por fotograma, y repasar dieciocho rectangulos
    // no justifica agrupar nada.
    //
    // El reflujo forzado es lo que separa los dos estados: sin el, el navegador
    // nunca llega a asentar la opacidad a cero y no hay nada que animar.
    void el.offsetHeight;
    revisa();

    return suelta;
  }, [root]);
}
