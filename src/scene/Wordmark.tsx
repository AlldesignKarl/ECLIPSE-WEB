import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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

/**
 * Dibuja la palabra y devuelve cuanto ocupa DE VERDAD, en pixeles del lienzo.
 *
 * Ese dato es el que manda para encajarla en pantalla. El plano mide 8.6
 * unidades pero el texto solo ocupa poco mas de la mitad del centro, asi que
 * ajustar el PLANO al ancho visible dejaba la palabra mas pequena que el propio
 * disco y el disco se la tragaba entera: en vertical no se veia ni una letra.
 */
function draw(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
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
  return total;
}

/** Ancho del plano del titulo, en unidades de mundo. */
const PLANE_W = 8.6;

/** Profundidad a la que vive, detras del disco. */
const PLANE_Z = -1.6;

export function Wordmark() {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const size = useThree((s) => s.size);

  // Medio ancho del texto en unidades de mundo, a escala uno.
  const medioTexto = useRef(2.4);

  const { texture, canvas } = useMemo(() => {
    const el = document.createElement('canvas');
    el.width = WIDTH;
    el.height = HEIGHT;
    medioTexto.current = ((draw(el) / WIDTH) * PLANE_W) / 2;
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
      medioTexto.current = ((draw(canvas) / WIDTH) * PLANE_W) / 2;
      texture.needsUpdate = true;
    });
    return () => {
      alive = false;
    };
  }, [canvas, texture]);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((state) => {
    if (material.current) {
      material.current.opacity = sceneState.wordmark;
      material.current.visible = sceneState.wordmark > 0.004;
    }
    if (!mesh.current) return;

    // El titulo se mide contra el ancho que de verdad hay. Ocho unidades y
    // media entran holgadas en horizontal y no entran ni de lejos en vertical:
    // en el movil se veia una "E" gigante cortada por el borde izquierdo. Nunca
    // crece por encima de su tamano de diseno; solo se recoge cuando hace falta.
    const camera = state.camera as THREE.PerspectiveCamera;
    const aspecto = size.width / Math.max(size.height, 1);
    const medioFov = (camera.fov * Math.PI) / 360;
    const distancia = camera.position.z - PLANE_Z;
    const medioAncho = Math.tan(medioFov) * distancia * aspecto;

    // Se compara texto contra ancho visible, no plano contra ancho visible. El
    // 97 % deja un respiro: la palabra tiene que tocar casi el borde, porque esa
    // tension es parte del diseno. Lo que no puede es salirse ni encogerse tanto
    // que el disco se la coma.
    const escala = Math.min(1, (medioAncho * 0.97) / medioTexto.current);
    mesh.current.scale.setScalar(escala);
  });

  return (
    <mesh ref={mesh} position={[0, 0, PLANE_Z]}>
      <planeGeometry args={[PLANE_W, 2.15]} />
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
