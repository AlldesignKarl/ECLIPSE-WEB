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
        <a href="#estudio">Estudio</a>
        <a href="#proceso">Proceso</a>
        <a href="#archivo">Archivo</a>
        <a href="#contacto">Contacto</a>
      </nav>

      <p className="anchor anchor--tr">
        La unica sombra
        <br />
        que se puede mirar
      </p>

      <div className="anchor anchor--bl">
        <p>
          La luz tambien
          <br />
          tiene materia
        </p>
        <a className="anchor__link" href="#estudio">
          Ver el archivo <span aria-hidden="true">&#8599;</span>
        </a>
      </div>

      <p className="anchor anchor--br">
        Un cuerpo que se apaga, se convierte en luz,
        <br />y la luz se convierte en materia.
      </p>
    </div>
  );
}
