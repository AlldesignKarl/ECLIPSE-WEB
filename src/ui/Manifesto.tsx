import { useMemo, useRef } from 'react';
import { T, span } from '../scroll/timeline';
import { useScrollBind } from './useScrollBind';

// La frase de venta de toda la pagina, y llega en el mejor momento posible:
// justo cuando el usuario acaba de quedarse mirando algo que no esperaba. No
// describe el eclipse — lo convierte en argumento.
const TEXT =
  'Esto no es un vídeo. Es una página web funcionando en tu navegador ahora mismo. Así trabajamos.';

/**
 * El manifiesto.
 *
 * Se revela palabra a palabra durante la totalidad, sobre la escena casi
 * quieta, y se queda nitido durante el estallido: ni desenfoque, ni
 * desplazamiento, ni cambio de opacidad. Es el plano fijo que impide que el
 * caos de detras se lea como ruido.
 */
export function Manifesto() {
  const root = useRef<HTMLParagraphElement>(null);
  const words = useMemo(() => TEXT.split(' '), []);
  const spans = useRef<(HTMLSpanElement | null)[]>([]);

  useScrollBind((t) => {
    if (!root.current) return;

    // Se retira solo al final del todo, cuando el humo ya es fondo.
    const out = 1 - span(t, 0.965, 1);
    root.current.style.opacity = String(out);

    const reveal = span(t, T.totalidad[0], T.totalidad[1] - 0.015);
    const total = spans.current.length;
    for (let i = 0; i < total; i++) {
      const el = spans.current[i];
      if (!el) continue;
      // Desfase por palabra. Cada una tiene su propia ventana dentro del tramo.
      const start = (i / total) * 0.82;
      const local = span(reveal, start, start + 0.18);
      el.style.opacity = String(local);
      el.style.transform = `translateY(${(1 - local) * 0.42}em)`;
      el.style.filter = local < 0.999 ? `blur(${(1 - local) * 6}px)` : 'none';
    }
  });

  return (
    <p className="manifesto" ref={root}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          ref={(el) => {
            spans.current[i] = el;
          }}
        >
          {word}{' '}
        </span>
      ))}
    </p>
  );
}
