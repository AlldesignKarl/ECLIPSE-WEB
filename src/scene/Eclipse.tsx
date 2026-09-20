import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Corona } from './Corona';
import { Streak } from './Streak';
import { Moon } from './Moon';
import { sceneState } from './state';

/**
 * El eclipse, como un solo objeto.
 *
 * Corona, destello y disco van juntos en un grupo que gira: si giraran por
 * separado se desharia la relacion entre ellos, que es justo lo que hace que se
 * lea como un cuerpo y no como tres capas superpuestas.
 *
 * El giro es el motor de la pieza. Sustituye al proceso astronomico que habia
 * antes — sol pleno, primer contacto, creciente, anillo — porque aquello
 * tardaba demasiado en llegar a lo que importa: lo que hacemos.
 */
export function Eclipse() {
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    if (group.current) group.current.rotation.z = sceneState.spin;
  });

  return (
    <group ref={group}>
      <Streak />
      <Corona />
      <Moon />
    </group>
  );
}
