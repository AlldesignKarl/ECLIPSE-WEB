import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sceneState } from './state';

/**
 * ECLIPSE.
 *
 * El titulo vive DENTRO de la escena, en un plano detras del disco, no encima
 * del lienzo en HTML. Asi el eclipse lo ocluye de verdad, con el buffer de
 * profundidad, en lugar de fingirlo con una mascara.
 *
 * Es el hallazgo de la referencia que mas cambia la pieza: el titulo no se
 * aparta para dejar sitio al objeto. Se queda quieto y el objeto se lo come.
 * Quedan legibles EC y SE, y el cerebro completa la palabra.
 */

const WIDTH = 2048;
const HEIGHT = 512;
const TEXT = 'ECLIPSE';
const TRACKING = 0.26; // em

function draw(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#f4f4f5';
  ctx.textBaseline = 'middle';
  ctx.font = '300 196px "Space Grotesk", system-ui, sans-serif';

  const gap = TRACKING * 196;
  const letters = [...TEXT];
  let total = letters.reduce((sum, ch) => sum + ctx.measureText(ch).width + gap, 0) - gap;

  let x = (WIDTH - total) / 2;
  for (const ch of letters) {
    ctx.fillText(ch, x, HEIGHT / 2);
    x += ctx.measureText(ch).width + gap;
  }
}

export function Wordmark() {
  const material = useRef<THREE.MeshBasicMaterial>(null);

  const { texture, canvas } = useMemo(() => {
    const el = document.createElement('canvas');
    el.width = WIDTH;
    el.height = HEIGHT;
    draw(el);
    const tex = new THREE.CanvasTexture(el);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { texture: tex, canvas: el };
  }, []);

  // La primera pasada usa la tipografia de sistema porque la web aun no ha
  // cargado. Redibujamos en cuanto esta lista.
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => {
      if (!alive) return;
      draw(canvas);
      texture.needsUpdate = true;
    });
    return () => {
      alive = false;
    };
  }, [canvas, texture]);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(() => {
    if (!material.current) return;
    material.current.opacity = sceneState.wordmark;
    material.current.visible = sceneState.wordmark > 0.004;
  });

  return (
    <mesh position={[0, 0, -1.6]}>
      <planeGeometry args={[8.6, 2.15]} />
      <meshBasicMaterial
        ref={material}
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
