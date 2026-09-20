import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene } from './scene/Scene';
import { hasWebGL } from './scene/profile';
import { STAGE_VH } from './scroll/timeline';
import { attachStage, subscribe } from './scroll/scrollStore';
import { updateSceneState } from './scene/state';
import { Anchors } from './ui/Anchors';
import { Manifesto } from './ui/Manifesto';
import { ScrollHint } from './ui/ScrollHint';
import { Preloader } from './ui/Preloader';
import { Content } from './ui/Content';
import { Poster } from './ui/Poster';
import { Auth } from './ui/Auth';

/**
 * Donde va el acceso.
 *
 * `true` lo pone como puerta de entrada: nadie ve la web sin pasar por el.
 * `false` deja la landing publica y el acceso disponible desde la navegacion.
 *
 * Recomiendo `false` para captar clientes. Quien llega no conoce el estudio
 * todavia, y pedirle una cuenta antes de ensenarle nada hunde las consultas —
 * ademas de esconder justo lo que vende, que es el eclipse. `true` tiene
 * sentido cuando la web deja de ser un escaparate y pasa a ser el area privada
 * de clientes que ya han firmado.
 */
const ACCESO_EN_LA_PUERTA = true;

/** El estado del eclipse que se ve detras del acceso: la totalidad. */
const AUTH_T = 0.66;

const CLAVE = 'eclipse.entrado';

function yaEntro(): boolean {
  if (!ACCESO_EN_LA_PUERTA) return true;
  try {
    return sessionStorage.getItem(CLAVE) === '1';
  } catch {
    // Sin almacenamiento no bloqueamos: esto no protege nada, asi que fallar
    // dejando pasar es mejor que dejar la web inaccesible.
    return true;
  }
}

export function App() {
  const stage = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);
  const [entered, setEntered] = useState(yaEntro);
  const [webgl] = useState(hasWebGL);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const onReady = useCallback(() => setReady(true), []);

  const entrar = useCallback(() => {
    try {
      sessionStorage.setItem(CLAVE, '1');
    } catch {
      /* sin almacenamiento, el acceso dura lo que dure la pagina */
    }
    setEntered(true);
  }, []);

  // Detras del acceso la escena se queda quieta en la totalidad. La corona y la
  // fotosfera siguen respirando porque su ruido va con el tiempo, no con `t`.
  useEffect(() => {
    if (!entered) updateSceneState(AUTH_T);
  }, [entered]);

  useEffect(() => {
    if (!webgl || !entered) return;
    attachStage(stage.current);
    return () => attachStage(null);
  }, [webgl, entered]);

  // Una vez el escenario queda un viewport por encima, la escena deja de
  // dibujarse. En una pestana de fondo no se gasta ni un ciclo ni bateria.
  useEffect(() => {
    if (!webgl || !entered) return;
    return subscribe(() => {
      const el = stage.current;
      if (!el) return;
      const next = el.getBoundingClientRect().bottom > -window.innerHeight * 0.5;
      setActive((prev) => (prev === next ? prev : next));
    });
  }, [webgl, entered]);

  const lienzo = webgl ? (
    <div className="canvasHolder">
      <Scene onReady={onReady} active={active} />
    </div>
  ) : null;

  if (!entered) {
    return (
      <>
        {lienzo ?? <Poster />}
        <Auth onEnter={entrar} />
        {webgl ? <Preloader ready={ready} /> : null}
        <div className="grain" aria-hidden="true" />
        <div className="vignette" aria-hidden="true" />
      </>
    );
  }

  return (
    <>
      <a className="skip" href="#servicios">
        Saltar al contenido
      </a>
      <h1 className="sr-only">ECLIPSE</h1>

      {webgl ? (
        <>
          {lienzo}
          <div className="stage" ref={stage} style={{ height: `${reduced ? 400 : STAGE_VH}vh` }}>
            <div className="stage__sticky">
              <Anchors />
              <Manifesto />
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
