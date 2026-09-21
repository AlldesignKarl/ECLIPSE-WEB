import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene } from './scene/Scene';
import { hasWebGL } from './scene/profile';
import { STAGE_VH } from './scroll/timeline';
import { attachStage, subscribe } from './scroll/scrollStore';
import { Anchors } from './ui/Anchors';
import { Mensajes, MensajesAccesibles } from './ui/Mensajes';
import { ScrollHint } from './ui/ScrollHint';
import { Preloader } from './ui/Preloader';
import { Content } from './ui/Content';
import { Poster } from './ui/Poster';

export function App() {
  const stage = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);
  const [webgl] = useState(hasWebGL);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    if (!webgl) return;
    attachStage(stage.current);
    return () => attachStage(null);
  }, [webgl]);

  // Una vez el escenario queda un viewport por encima, la escena deja de
  // dibujarse. En una pestana de fondo no se gasta ni un ciclo ni bateria.
  useEffect(() => {
    if (!webgl) return;
    return subscribe(() => {
      const el = stage.current;
      if (!el) return;
      const next = el.getBoundingClientRect().bottom > -window.innerHeight * 0.5;
      setActive((prev) => (prev === next ? prev : next));
    });
  }, [webgl]);

  const lienzo = webgl ? (
    <div className="canvasHolder">
      <Scene onReady={onReady} active={active} />
    </div>
  ) : null;

  return (
    <>
      <a className="skip" href="#servicios">
        Saltar al contenido
      </a>
      <h1 className="sr-only">ECLIPSE — Diseño y desarrollo web</h1>
      <MensajesAccesibles />

      {webgl ? (
        <>
          {lienzo}
          <div className="stage" ref={stage} style={{ height: `${reduced ? 400 : STAGE_VH}vh` }}>
            <div className="stage__sticky">
              <Anchors />
              <Mensajes />
              <ScrollHint />
            </div>
          </div>
        </>
      ) : (
        <Poster />
      )}

      <Content />

      {webgl ? <Preloader ready={ready} /> : null}

      <div className="grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
    </>
  );
}
