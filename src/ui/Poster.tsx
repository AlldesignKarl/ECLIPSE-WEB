/**
 * Sin WebGL.
 *
 * Un poster estatico de alta calidad con la tipografia animada por CSS. No es
 * una pantalla de error: la pagina sigue siendo legible, navegable y vendible,
 * y quien llegue aqui no tiene por que enterarse de lo que se pierde.
 */
export function Poster() {
  return (
    <section className="poster">
      <div className="poster__scene" aria-hidden="true">
        <div className="poster__corona" />
        <div className="poster__disc" />
      </div>
      <p className="poster__word" aria-hidden="true">
        ECLIPSE
      </p>
      <p className="poster__sub">
        Un cuerpo que se apaga, se convierte en luz, y la luz se convierte en materia.
      </p>
    </section>
  );
}
