import { useRef } from 'react';
import { span } from '../scroll/timeline';
import { useScrollBind } from './useScrollBind';

/** Desaparece al primer gesto y no vuelve. */
export function ScrollHint() {
  const root = useRef<HTMLDivElement>(null);

  useScrollBind((t) => {
    if (!root.current) return;
    root.current.style.opacity = String(1 - span(t, 0.004, 0.022));
  });

  return (
    <div className="hint" ref={root} aria-hidden="true">
      <span>Desplaza</span>
      <i />
    </div>
  );
}
