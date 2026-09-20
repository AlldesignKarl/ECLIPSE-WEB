import { useRef } from 'react';
import { span } from '../scroll/timeline';
import { useScrollBind } from './useScrollBind';

/**
 * Las cuatro anclas de esquina.
 *
 * Se resuelven en el primer segundo y no vuelven a moverse hasta que se libera
 * el lienzo. Todo el centro del encuadre queda limpio para el disco: es la
 * regla de composicion que sostiene la pieza entera.
 */
export function Anchors() {
  const root = useRef<HTMLDivElement>(null);

  useScrollBind((t) => {
    if (!root.current) return;
    const appear = span(t, 0.005, 0.05);
    const retire = 1 - span(t, 0.9, 0.99);
    root.current.style.opacity = String(appear * retire);
  });

  return (
    <div className="anchors" ref={root} aria-hidden="true">
      <nav className="anchor anchor--tl">
        <a href="#servicios">Servicios</a>
        <a href="#proceso">Proceso</a>
        <a href="#trabajos">Trabajos</a>
        <a href="#contacto">Contacto</a>
      </nav>

      <p className="anchor anchor--tr">
        Estudio de diseño
        <br />y desarrollo web
      </p>

      <div className="anchor anchor--bl">
        <p>
          Hacemos webs que
          <br />
          no se parecen a nada
        </p>
        <a className="anchor__link" href="#servicios">
          Ver servicios <span aria-hidden="true">&#8599;</span>
        </a>
      </div>

      <p className="anchor anchor--br">
        Diseño, desarrollo y animación.
        <br />
        De la idea al dominio, sin intermediarios.
      </p>
    </div>
  );
}
