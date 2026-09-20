import { useEffect, useState } from 'react';

/**
 * El preloader.
 *
 * Un punto de luz que crece hasta ser el sol. No esta por decoracion: cubre la
 * compilacion de los shaders, que si no se paga en el primer fotograma de la
 * explosion, justo en el climax.
 */
export function Preloader({ ready }: { ready: boolean }) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => setGone(true), 900);
    return () => window.clearTimeout(id);
  }, [ready]);

  if (gone) return null;

  return (
    <div className={`preloader${ready ? ' preloader--out' : ''}`} role="status" aria-live="polite">
      <div className={`preloader__light${ready ? ' preloader__light--full' : ''}`} />
      <span className="preloader__label">{ready ? 'Listo' : 'Encendiendo'}</span>
    </div>
  );
}
