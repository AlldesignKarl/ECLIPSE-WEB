import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Bloom, ChromaticAberration, EffectComposer } from '@react-three/postprocessing';
import { BlendFunction, KernelSize, type BloomEffect } from 'postprocessing';
import * as THREE from 'three';
import { sceneState } from './state';
import { detectProfile } from './profile';

/**
 * El grado de color.
 *
 * Bloom selectivo con umbral alto, para que florezcan la corona y el anillo y
 * nada mas. Aberracion de 0.4 px: mas que eso ya es un efecto, no una lente.
 *
 * El grano y la vineta NO van aqui: los pone la capa de DOM, que cubre tambien
 * las secciones de contenido. Si se cortaran al salir de la escena se notaria
 * el cambio al instante, y dos capas de cada cosa levantaban los negros.
 */
export function Effects() {
  const profile = detectProfile();
  const bloom = useRef<BloomEffect>(null);
  const offset = useMemo(() => new THREE.Vector2(0.0004, 0.0004), []);

  useFrame(() => {
    if (!bloom.current) return;
    const base = 0.42 + sceneState.corona * 0.22;
    // El anillo de diamante es el pico optico de la pieza: multiplica el bloom
    // durante el seis por ciento del scroll que dura.
    const diamond = sceneState.diamond * 2.6;
    const blast = sceneState.burst * 1.2 * (1 - sceneState.smoke * 0.65);
    bloom.current.intensity = base + diamond + blast;
  });

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        ref={bloom}
        mipmapBlur
        intensity={0.9}
        luminanceThreshold={0.45}
        luminanceSmoothing={0.22}
        kernelSize={profile.fullPost ? KernelSize.LARGE : KernelSize.MEDIUM}
      />
      <ChromaticAberration
        offset={offset}
        radialModulation={false}
        modulationOffset={0}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  );
}
