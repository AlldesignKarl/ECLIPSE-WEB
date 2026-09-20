import { evaluate, type EclipseState } from '../scroll/timeline';

/**
 * El estado de la escena, en un unico objeto mutable.
 *
 * Los componentes lo leen dentro de useFrame en lugar de recibirlo por props:
 * asi la escena entera se actualiza sesenta veces por segundo sin provocar ni
 * un solo re-render de React.
 */
export const sceneState: EclipseState = evaluate(0);

export function updateSceneState(t: number) {
  Object.assign(sceneState, evaluate(t));
}
