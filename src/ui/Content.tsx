import { useState } from 'react';

/**
 * El contenido.
 *
 * A partir de aqui el lienzo se libera y la pagina vuelve a ser una pagina. La
 * primera seccion entra desplazandose sobre el humo, que sangra dentro de ella
 * y se queda de fondo: las secciones estan unidas por la materia, no por un
 * fundido.
 *
 * El eclipse no es el tema de esta web: es la demostracion. Todo lo que se lee
 * aqui existe para convertir lo que el visitante acaba de ver en un argumento
 * de venta. Los corchetes marcan lo que no me corresponde inventar — precios,
 * clientes, datos de contacto. Son datos reales, no relleno.
 */
export function Content() {
  return (
    <main className="content">
      <section className="section section--first" id="servicios">
        <p className="kicker">01 — Servicios</p>
        <h2>
          <strong>Webs</strong> <em>que se recuerdan</em>
        </h2>
        <div className="prose">
          <p>
            La mayoria de las paginas se olvidan antes de cerrarse. Se parecen entre si porque salen
            de las mismas plantillas, y compiten por atencion con las mismas herramientas que todos
            los demas.
          </p>
          <p>
            Nosotros hacemos la otra clase. El eclipse que acabas de recorrer no es un video ni una
            imagen: es geometria resolviendose en tiempo real en tu navegador, y reacciona a lo que
            haces. Eso es lo que construimos.
          </p>
        </div>

        <ul className="offer">
          <li>
            <h3>Landing de una pagina</h3>
            <p>
              Una sola pieza, pensada para que quien entre no pueda irse sin recordarla. Ideal para
              lanzamientos, portfolios y productos unicos.
            </p>
            <span className="offer__price">[PRECIO DESDE]</span>
          </li>
          <li>
            <h3>Web completa</h3>
            <p>
              Varias secciones, contenido editable y todo lo que hace falta para que aparezcas en
              Google. Con la misma exigencia visual en cada pantalla.
            </p>
            <span className="offer__price">[PRECIO DESDE]</span>
          </li>
          <li>
            <h3>Experiencia a medida</h3>
            <p>
              3D, animacion y scroll cinematografico, como esta. Para marcas que necesitan que no se
              les parezca nadie.
            </p>
            <span className="offer__price">[PRECIO DESDE]</span>
          </li>
        </ul>
      </section>

      <section className="section" id="proceso">
        <p className="kicker">02 — Proceso</p>
        <h2>
          <strong>De la idea</strong> <em>al dominio</em>
        </h2>
        <ol className="acts">
          <li>
            <span className="acts__n">01</span>
            <div>
              <h3>Hablamos</h3>
              <p>
                Nos cuentas que vendes y a quien. Salimos de ahi con una propuesta cerrada: que
                incluye, cuanto cuesta y cuando esta. Sin sorpresas despues.
              </p>
            </div>
          </li>
          <li>
            <span className="acts__n">02</span>
            <div>
              <h3>Lo ves antes de pagarlo entero</h3>
              <p>
                Te ensenamos una version navegable en cuanto hay algo que ensenar. Si el rumbo no es
                el que esperabas, se corrige ahi y no al final.
              </p>
            </div>
          </li>
          <li>
            <span className="acts__n">03</span>
            <div>
              <h3>Publicamos y te lo entregamos</h3>
              <p>
                Dominio, alojamiento y puesta en marcha. La web queda a tu nombre y con el codigo en
                tu poder: no te quedas atado a nosotros.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="section" id="trabajos">
        <p className="kicker">03 — Trabajos</p>
        <h2>
          <strong>Lo ultimo</strong> <em>que hemos hecho</em>
        </h2>
        <ul className="archive">
          <li>
            <span className="archive__year">[AÑO]</span>
            <h3>[NOMBRE DEL CLIENTE]</h3>
            <p>[QUE SE HIZO, EN UNA LINEA]</p>
          </li>
          <li>
            <span className="archive__year">[AÑO]</span>
            <h3>[NOMBRE DEL CLIENTE]</h3>
            <p>[QUE SE HIZO, EN UNA LINEA]</p>
          </li>
          <li>
            <span className="archive__year">[AÑO]</span>
            <h3>[NOMBRE DEL CLIENTE]</h3>
            <p>[QUE SE HIZO, EN UNA LINEA]</p>
          </li>
        </ul>
      </section>

      <Contact />

      <footer className="footer">
        <span>ECLIPSE</span>
        <span>[NOMBRE DEL ESTUDIO] — [AÑO]</span>
      </footer>
    </main>
  );
}

/** Direccion a la que llegan los formularios. Sustituyela por la real. */
const EMAIL = '[CORREO DE CONTACTO]';

/**
 * El unico momento de interfaz de toda la pagina.
 *
 * Panel de cristal ahumado con luz de canto: un borde superior de un pixel mas
 * claro que el resto es lo que le da grosor.
 *
 * El envio abre el cliente de correo del visitante con el mensaje ya escrito.
 * No es la solucion mas elegante, pero funciona sin servidor desde el primer
 * dia: una web que vende no puede permitirse un formulario que no lleva a
 * ningun sitio. Cuando haya backend, se cambia por una peticion de verdad.
 */
function Contact() {
  const [sent, setSent] = useState(false);

  return (
    <section className="section section--contact" id="contacto">
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const from = String(data.get('email') ?? '');
          const body = String(data.get('project') ?? '');
          const subject = encodeURIComponent('Consulta desde la web');
          const text = encodeURIComponent(`${body}\n\nResponder a: ${from}`);
          window.location.href = `mailto:${EMAIL}?subject=${subject}&body=${text}`;
          setSent(true);
        }}
      >
        <div className="panel__glyph" aria-hidden="true">
          <span />
        </div>

        <h2 className="panel__title">
          <strong>Cuentanos</strong> <em>tu proyecto</em>
        </h2>
        <p className="panel__sub">Respondemos en menos de 48 horas</p>

        <div className="field">
          <label htmlFor="email">Tu correo</label>
          <input id="email" name="email" type="email" placeholder="tu@correo.com" required />
        </div>

        <div className="field">
          <label htmlFor="project">Que necesitas</label>
          <textarea
            id="project"
            name="project"
            rows={3}
            placeholder="Una web para mi negocio, algo como esta..."
            required
          />
        </div>

        <button type="submit">Enviar</button>
        <p className="panel__foot" role="status">
          {sent ? 'Se ha abierto tu correo. Si no, escribenos a ' : 'O escribenos directamente a '}
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
        </p>
      </form>
    </section>
  );
}
