import { useEffect, useRef } from 'react';
import { subscribe } from '../scroll/scrollStore';
import { sceneState } from '../scene/state';
import type { EclipseState } from '../scroll/timeline';

/**
 * Ata un componente de DOM al reloj de la pieza.
 *
 * Muta estilos directamente en lugar de pasar por el estado de React: a
 * sesenta fotogramas por segundo, un re-render por fotograma cuesta mas que
 * toda la escena 3D junta.
 */
export function useScrollBind(apply: (t: number, state: EclipseState) => void) {
  const ref = useRef(apply);
  ref.current = apply;
  useEffect(() => subscribe((t) => ref.current(t, sceneState)), []);
}
