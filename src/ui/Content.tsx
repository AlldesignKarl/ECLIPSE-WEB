/**
 * El contenido.
 *
 * A partir de aqui el lienzo se libera y la pagina vuelve a ser una pagina. La
 * primera seccion entra desplazandose sobre el humo, que sangra dentro de ella
 * y se queda de fondo: las secciones estan unidas por la materia, no por un
 * fundido.
 *
 * Los corchetes marcan lo que no me corresponde inventar. Son datos de negocio
 * reales, no relleno: los sustituyes tu.
 */
export function Content() {
  return (
    <main className="content">
      <section className="section section--first" id="estudio">
        <p className="kicker">01 — Materia</p>
        <h2>
          <strong>Nace</strong> <em>del silencio</em>
        </h2>
        <div className="prose">
          <p>
            Un eclipse total dura poco mas de dos minutos y medio en el mejor de los casos. Todo lo
            que ocurre antes es espera, y todo lo que ocurre despues es memoria. Esa proporcion —
            mucha quietud y un golpe muy corto — es la que gobierna esta pagina.
          </p>
          <p>
            El disco que acabas de ver no es una imagen ni un video. Es geometria resolviendose en
            tiempo real: granulacion, oscurecimiento del limbo, corona por acumulacion radial. Si
            subes, se recompone. Si bajas, vuelve a romperse.
          </p>
        </div>
      </section>

      <section className="section" id="proceso">
        <p className="kicker">02 — Proceso</p>
        <h2>
          <strong>Tres actos</strong> <em>y un solo reloj</em>
        </h2>
        <ol className="acts">
          <li>
            <span className="acts__n">I</span>
            <div>
              <h3>Cuerpo</h3>
              <p>
                El sol ya esta vivo cuando entras. La camara avanza de verdad, con paralaje de las
                estrellas del fondo, y el disco empieza a comerse el centro del titulo.
              </p>
            </div>
          </li>
          <li>
            <span className="acts__n">II</span>
            <div>
              <h3>Ocultacion</h3>
              <p>
                La luna entra y la corona aparece ya azul, cinco actos antes de que haga falta. El
                color se anuncia mucho antes de cumplirse.
              </p>
            </div>
          </li>
          <li>
            <span className="acts__n">III</span>
            <div>
              <h3>Disolucion</h3>
              <p>
                La corona se estira hacia el ecuador, el disco se cuartea y las particulas salen de
                su propia superficie. Durante unos fotogramas conviven disco y plasma.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="section" id="archivo">
        <p className="kicker">03 — Archivo</p>
        <h2>
          <strong>Piezas</strong> <em>anteriores</em>
        </h2>
        <ul className="archive">
          <li>
            <span className="archive__year">[AÑO]</span>
            <h3>[TITULO DEL PROYECTO 01]</h3>
            <p>[UNA LINEA DE DESCRIPCION]</p>
          </li>
          <li>
            <span className="archive__year">[AÑO]</span>
            <h3>[TITULO DEL PROYECTO 02]</h3>
            <p>[UNA LINEA DE DESCRIPCION]</p>
          </li>
          <li>
            <span className="archive__year">[AÑO]</span>
            <h3>[TITULO DEL PROYECTO 03]</h3>
            <p>[UNA LINEA DE DESCRIPCION]</p>
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

/**
 * El unico momento de interfaz de toda la pagina.
 *
 * Panel de cristal ahumado con luz de canto: un borde superior de un pixel mas
 * claro que el resto es lo que le da grosor. Viene de la captura, traducido al
 * negro — sin la lavanda, sin el desenfoque generalizado y con el radio bajado
 * de veinte a doce.
 */
function Contact() {
  return (
    <section className="section section--contact" id="contacto">
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <div className="panel__glyph" aria-hidden="true">
          <span />
        </div>

        <h2 className="panel__title">
          <strong>Trabajemos</strong> <em>juntos</em>
        </h2>
        <p className="panel__sub">Cuentanos que quieres construir</p>

        <div className="field">
          <label htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" placeholder="tu@correo.com" required />
        </div>

        <div className="field">
          <label htmlFor="project">Proyecto</label>
          <textarea id="project" name="project" rows={3} placeholder="Una experiencia como esta" />
        </div>

        <button type="submit">Enviar</button>
        <p className="panel__foot">Escribenos a [CORREO DE CONTACTO]</p>
      </form>
    </section>
  );
}
