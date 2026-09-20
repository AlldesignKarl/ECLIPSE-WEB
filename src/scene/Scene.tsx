import { useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { detectProfile } from './profile';
import { Photosphere, Chromosphere } from './Sun';
import { Moon } from './Moon';
import { Corona } from './Corona';
import { Sky } from './Sky';
import { Wordmark } from './Wordmark';
import { Particles } from './Particles';
import { Smoke } from './Smoke';
import { AdaptiveResolution, Rig } from './Rig';
import { Effects } from './Effects';

/**
 * Compila los shaders por adelantado y avisa cuando la escena esta lista.
 *
 * Sin esto, el primer fotograma de la explosion cuesta unos trescientos
 * milisegundos de tiron, justo en el climax. Compilar durante el preloader es
 * gratis porque ahi nadie esta mirando.
 */
function Precompile({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    let frame = 0;
    gl.compile(scene, camera);
    // Dos fotogramas de margen: el primero sube los programas, el segundo
    // confirma que ya no hay compilacion pendiente.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(onReady);
    });
    return () => cancelAnimationFrame(frame);
  }, [gl, scene, camera, onReady]);

  return null;
}

function useDocumentVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

export function Scene({ onReady, active }: { onReady: () => void; active: boolean }) {
  const profile = detectProfile();
  const visible = useDocumentVisible();

  return (
    <Canvas
      aria-hidden="true"
      frameloop={visible && active ? 'always' : 'never'}
      dpr={[1, profile.maxDpr]}
      camera={{ fov: 42, near: 0.1, far: 140, position: [0, 0, 7.4] }}
      gl={{
        antialias: false,
        alpha: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.04;
        scene.background = new THREE.Color('#06070A');
      }}
    >
      <Rig />
      <AdaptiveResolution max={profile.maxDpr} />
      <Sky />
      <Wordmark />
      <Corona />
      <Photosphere />
      <Chromosphere />
      <Moon />
      <Particles />
      <Smoke />
      <Effects />
      <Precompile onReady={onReady} />
    </Canvas>
  );
}
