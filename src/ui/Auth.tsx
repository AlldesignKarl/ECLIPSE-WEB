import { useState } from 'react';

/**
 * La pantalla de acceso.
 *
 * ATENCION — ESTO ES INTERFAZ, NO AUTENTICACION.
 *
 * No hay servidor detras: no se crean cuentas, no se comprueba ninguna
 * contrasena y no se protege absolutamente nada. Cualquiera puede saltarselo
 * borrando una clave del navegador, y hasta que no haya un proveedor de
 * identidad de verdad (Supabase, Clerk, Auth0, Firebase o el que sea) seguira
 * siendo asi.
 *
 * Por eso la contrasena NO se guarda ni se envia a ningun sitio: se queda en el
 * estado del componente y muere al salir. Guardar credenciales en el navegador
 * sin backend seria peor que no tener acceso.
 */

type Mode = 'entrar' | 'crear';

function Glyph() {
  return (
    <div className="auth__glyph" aria-hidden="true">
      <span />
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      {!open && (
        <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function Auth({ onEnter }: { onEnter: () => void }) {
  const [mode, setMode] = useState<Mode>('entrar');
  const [reveal, setReveal] = useState(false);
  const entrar = mode === 'entrar';

  return (
    <section className="auth">
      <form
        className="auth__panel"
        onSubmit={(event) => {
          event.preventDefault();
          // Aqui ira la llamada al proveedor de identidad. Mientras tanto solo
          // levanta la barrera, sin comprobar nada.
          onEnter();
        }}
      >
        <Glyph />

        <h1 className="auth__title">
          {entrar ? (
            <>
              <strong>Bienvenido</strong> <em>de nuevo</em>
            </>
          ) : (
            <>
              <strong>Crea</strong> <em>tu cuenta</em>
            </>
          )}
        </h1>

        <p className="auth__sub">
          {entrar
            ? 'Accede al seguimiento de tu proyecto, tus archivos y tus facturas'
            : 'Te damos acceso al seguimiento de tu proyecto desde el primer dia'}
        </p>

        <div className="auth__tabs" role="group" aria-label="Entrar o crear cuenta">
          <button
            type="button"
            aria-pressed={entrar}
            className={entrar ? 'is-on' : undefined}
            onClick={() => setMode('entrar')}
          >
            Entrar
          </button>
          <button
            type="button"
            aria-pressed={!entrar}
            className={!entrar ? 'is-on' : undefined}
            onClick={() => setMode('crear')}
          >
            Crear cuenta
          </button>
        </div>

        {!entrar && (
          <div className="field">
            <label htmlFor="auth-name">Nombre</label>
            <input id="auth-name" name="name" type="text" autoComplete="name" placeholder="Tu nombre" required />
          </div>
        )}

        <div className="field">
          <label htmlFor="auth-email">Correo</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="auth-password">Contrasena</label>
          <div className="field__wrap">
            <input
              id="auth-password"
              name="password"
              type={reveal ? 'text' : 'password'}
              autoComplete={entrar ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              minLength={8}
              required
            />
            <button
              type="button"
              className="field__reveal"
              aria-label={reveal ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              aria-pressed={reveal}
              onClick={() => setReveal((v) => !v)}
            >
              <EyeIcon open={reveal} />
            </button>
          </div>
        </div>

        {entrar && (
          <div className="auth__row">
            <label className="check">
              <input type="checkbox" name="remember" defaultChecked />
              <span>No cerrar sesion</span>
            </label>
            <a href="#contacto" onClick={onEnter}>
              He olvidado la contrasena
            </a>
          </div>
        )}

        <button type="submit" className="auth__cta">
          {entrar ? 'Entrar' : 'Crear cuenta'}
        </button>

        <div className="auth__or">
          <span>o</span>
        </div>

        <button type="button" className="auth__alt" onClick={onEnter}>
          Continuar sin cuenta
        </button>

        <p className="auth__foot">
          {entrar ? '¿Todavia no tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <button type="button" onClick={() => setMode(entrar ? 'crear' : 'entrar')}>
            {entrar ? 'Crear una' : 'Entrar'}
          </button>
        </p>
      </form>
    </section>
  );
}
