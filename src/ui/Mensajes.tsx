import { useRef } from 'react';
import { T, span } from '../scroll/timeline';
import { useScrollBind } from './useScrollBind';

/**
 * Lo que hacemos, contado mientras el eclipse gira.
 *
 * Cada bloque tiene su propio tramo de `t`: entra desde abajo con desenfoque,
 * se queda quieto el tiempo suficiente para leerse entero y sale por arriba.
 * Los tres comparten sitio en el centro del encuadre, de modo que nunca hay dos
 * a la vez y el ojo no tiene que elegir.
 *
 * El tercero es el que vende: nombra en voz alta lo que el visitante lleva
 * medio minuto mirando.
 */

const BLOQUES = [
  {
    clave: 'bloque1' as const,
    indice: '01',
    titulo: 'Diseño',
    texto:
      'Cada pieza se dibuja desde cero. Sin plantillas, sin temas comprados y sin parecerse a la web de al lado.',
  },
  {
    clave: 'bloque2' as const,
    indice: '02',
    titulo: 'Desarrollo',
    texto:
      'Código propio, rápido y tuyo. La web queda a tu nombre y no dependes de nadie para tocarla mañana.',
  },
  {
    clave: 'bloque3' as const,
    indice: '03',
    titulo: 'Movimiento',
    texto:
      'Animación, 3D y scroll cinematográfico. Esto que estás viendo no es un vídeo: corre en tu navegador ahora mismo.',
  },
];

export function Mensajes() {
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useScrollBind((t) => {
    for (let i = 0; i < BLOQUES.length; i++) {
      const el = refs.current[i];
      if (!el) continue;

      const [a, b] = T[BLOQUES[i].clave];
      // Entra en el primer 22 % del tramo y sale en el ultimo 22 %. El 56 % de
      // en medio se queda quieto: si no hay reposo no da tiempo a leerlo.
      const entrada = span(t, a, a + (b - a) * 0.22);
      const salida = span(t, b - (b - a) * 0.22, b);
      const visible = entrada * (1 - salida);

      el.style.opacity = String(visible);
      // Un solo eje de movimiento, y corto. Entra subiendo y sale subiendo, de
      // modo que la lectura siempre avanza en la misma direccion.
      const desplaza = (1 - entrada) * 34 - salida * 34;
      el.style.transform = `translate3d(0, ${desplaza}px, 0)`;
      el.style.filter = visible > 0.995 ? 'none' : `blur(${(1 - visible) * 7}px)`;
      el.style.visibility = visible > 0.004 ? 'visible' : 'hidden';
    }
  });

  return (
    <div className="mensajes" aria-hidden="true">
      {BLOQUES.map((bloque, i) => (
        <div
          className="mensaje"
          key={bloque.clave}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <span className="mensaje__n">{bloque.indice}</span>
          <h2 className="mensaje__t">{bloque.titulo}</h2>
          <p className="mensaje__p">{bloque.texto}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Los mismos textos, en el DOM y legibles siempre.
 *
 * Los de arriba estan marcados como decorativos porque su opacidad la gobierna
 * el scroll, y un lector de pantalla leeria tres bloques invisibles. Esta
 * version no se ve pero si se lee, asi que el mensaje llega igual a quien
 * navega con teclado o con lector — y a Google.
 */
export function MensajesAccesibles() {
  return (
    <div className="sr-only">
      <h2>Lo que hacemos</h2>
      <ul>
        {BLOQUES.map((b) => (
          <li key={b.clave}>
            <strong>{b.titulo}.</strong> {b.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}
