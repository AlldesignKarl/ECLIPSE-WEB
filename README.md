# ECLIPSE

Web de un estudio de diseno y desarrollo web.

El eclipse no es el tema: es la demostracion. Un eclipse volumetrico que
reacciona al scroll, se estira, se fractura y se convierte en humo azul que pasa
a ser el fondo del contenido. Todo en tiempo real en el navegador, que es
justamente el argumento de venta: lo que el visitante acaba de recorrer es una
muestra de lo que se le puede construir.

La propuesta creativa y tecnica completa, con el analisis de la referencia y el
guion de tiempos, vive en el lienzo de diseno que acompana a este repositorio.

## Alldesign Karl (`/alldesign-karl/`)

La web de un trabajo del estudio vive en el mismo proyecto como segunda página
de Vite: `alldesign-karl/index.html`, con el código en `src/alldesign/` y los
recursos en `public/alldesign-karl/`. Con `npm run dev` se abre en
http://localhost:5173/alldesign-karl/.

**La idea.** Los fragmentos de porcelana de la portada son, literalmente,
trozos de la escultura. `scripts/build-shards.py` recorta el busto (sin fondo)
y lo parte en 38 fragmentos con grietas irregulares; `shards.png` guarda en
cada píxel a qué fragmento pertenece y a qué distancia está del borde. En
WebGL cada fragmento es una instancia que descarta todo lo que no es suyo, se
curva como una concha, lleva filo de oro y flota.

**La escultura se construye pieza a pieza.** Cada fragmento tiene su propia
ventana de scroll (`src/alldesign/script.ts`): despega, describe un arco y se
posa con una pequeña corrección final; la siguiente sale cuando la anterior va
por algo más de la mitad, así que nunca hay más de dos en movimiento. El orden
lo decide `scripts/order-shards.py`: empieza por una pieza grande del pecho,
cada pieza siguiente toca a alguna ya colocada, primero las grandes y las de
abajo, y la última es la del rostro, que espera a la vista toda la
construcción. No hay ninguna capa con la escultura entera: lo que se ve al
final son los 38 fragmentos en su sitio. El contador (`00 / 38 fragmentos`)
cuenta los que ya han llegado, y al subir se deshace en orden inverso.

| Archivo | Qué hace |
| --- | --- |
| `src/alldesign/script.ts` | **El guion**, en vh de recorrido: la ventana de cada fragmento, la pausa con la escultura completa y los textos. |
| `src/alldesign/stage.ts` | El escenario: flotación, trayectorias y asiento de cada fragmento. Todo es función pura del progreso: se puede subir y bajar. |
| `src/alldesign/shaders.ts` | Seda de fondo, fragmentos y escultura entera. |
| `src/alldesign/main.ts` | Lenis + GSAP ScrollTrigger: progreso del escenario, capa de textos, colecciones, artesanía en horizontal, paneles, cursor. |
| `scripts/build-shards.py` | Recorte, fragmentación y datos de los fragmentos. Necesita `pillow`, `numpy`, `scipy` y la máscara de `rembg` (modelo `isnet-general-use`). |
| `scripts/order-shards.py` | Orden de montaje de los fragmentos. |
| `scripts/build-editorial.py` | Fotografías provisionales de colecciones y taller, sacadas de las referencias. |

Herramientas: `?s=0.5` congela la pieza en ese punto del guion (0 portada,
0.67 escultura completa, 1 final); `?bg` muestra solo la seda; en consola,
`__ak()` da el estado del escenario y cuántos fragmentos han llegado.

Móvil: misma idea con la textura a media resolución, sin paralaje de puntero y
con los textos bajo la escultura. Sin WebGL se sirve la escultura como imagen
fija; con `prefers-reduced-motion` los fragmentos no vuelan: cada uno se
desvanece donde flotaba y aparece en su sitio, en su turno.

Pendiente de datos reales: fotografía de producto de las colecciones (las
actuales salen de las dos imágenes de referencia), correo de contacto
(`hola@alldesignkarl.com` es provisional) y el perfil de Instagram.

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # bundle de produccion en dist/
```

Node 20 o superior.

## La idea en una linea

Toda la pieza es una funcion pura de `t`, un valor entre 0 y 1 que el usuario
arrastra con el scroll. Nada se anima por su cuenta salvo el ruido temporal que
hace respirar la materia. Si subes, el eclipse se recompone.

## Donde esta cada cosa

| Archivo | Que hace |
| --- | --- |
| `src/scroll/timeline.ts` | **El guion.** Los nueve estados, las tres curvas de aceleracion y el estado de la escena derivado de `t`. Recalibrar el ritmo se hace aqui y en ningun otro sitio. |
| `src/scroll/scrollStore.ts` | La cabeza lectora: lee el scroll nativo, lo amortigua y publica `t`. |
| `src/scene/Scene.tsx` | Monta el lienzo, el tono y la precompilacion de shaders. |
| `src/scene/Sun.tsx` | Fotosfera con granulacion y oscurecimiento del limbo, mas la cromosfera. |
| `src/scene/Moon.tsx` | La luna. Es una esfera, no un disco, y es la que se cuartea. |
| `src/scene/Corona.tsx` | La corona, por acumulacion radial sobre un campo de ruido. |
| `src/scene/Particles.tsx` | La explosion. Analitica y reversible. |
| `src/scene/Smoke.tsx` | El humo, en planos billboard con ruido procedural. |
| `src/scene/Wordmark.tsx` | ECLIPSE, dentro de la escena para que el disco lo ocluya de verdad. |
| `src/scene/profile.ts` | Los tres perfiles de dispositivo. |
| `src/ui/` | La capa de DOM: anclas, manifiesto, contenido y el panel de contacto. |

## Los nueve estados

| `t` | Estado |
| --- | --- |
| 0.00 – 0.10 | Entrada. El sol ya respira y la camara avanza. |
| 0.10 – 0.34 | Primer contacto. La corona asoma ya azul. |
| 0.34 – 0.56 | Creciente. El disco se come el centro del titulo. |
| 0.56 – 0.62 | Anillo de diamante. |
| 0.62 – 0.76 | Totalidad. El manifiesto se revela palabra a palabra. |
| 0.76 – 0.82 | Estiramiento. La corona se alarga hacia el ecuador. |
| 0.82 – 0.86 | Fractura. Grietas de luz sobre el disco. |
| 0.86 – 0.90 | Ignicion. |
| 0.90 – 1.00 | Humo y residuo. |

## Tres decisiones que conviene conocer antes de tocar nada

**Las particulas son analiticas, no una simulacion.** La posicion de cada una es
una formula cerrada de su semilla y del avance de la explosion. Una simulacion
GPGPU con estado no sabe ir hacia atras, y aqui el usuario puede subir: con la
formula, la nube se recompone en el disco exacto del que salio. Sale mas barato
ademas.

**Las particulas nacen en la superficie del propio disco.** Con avance cero, su
posicion es exactamente la esfera del eclipse. Durante los primeros fotogramas
la nube todavia tiene su forma, y el disco sigue visible mientras el plasma ya
esta fuera. Nunca hay una sustitucion de una imagen por otra: es lo que separa
materia de animacion.

**La corona es azul desde el primer contacto.** La corona real es blanca. Se
sacrifica realismo estricto para que el estallido azul del final se sienta
prometido en lugar de arbitrario.

## Herramientas de direccion

Sin estas dos, los fallos de mas abajo no se encuentran. No son andamios: se
quedan en el codigo.

`?t=0.68` congela la pieza en ese fotograma exacto, sin amortiguamiento. Sirve
para sacar capturas de cualquier estado y para afinar sin pelearse con el
scroll: en una maquina lenta el amortiguamiento no converge nunca, y acabas
juzgando un fotograma que no es el que crees estar viendo.

`?q=low`, `?q=mid` o `?q=high` fuerzan un perfil de dispositivo. Sirve para ver
la gama baja sin tener un movil delante, y para capturar en maquinas sin GPU,
donde el perfil alto tarda mas de medio minuto por fotograma.

En desarrollo, `window.__eclipse` expone el estado de la escena en vivo. Leer un
valor es siempre mejor que deducirlo de lo que se ve en pantalla.

## Cuatro trampas que ya costaron caras

Las cuatro compilan sin avisos, pasan el typecheck y no lanzan ni un error de
consola. Solo se encuentran mirando la pieza.

**Los uniformes se escriben a traves del material**, nunca sobre el objeto que
se le paso como prop. Cuando el shader se reconstruye, el material acaba con su
propia copia y mutar el original deja de tener efecto. Esto tuvo la corona
invisible durante horas, con la intensidad congelada en 0.044: como todo va
multiplicado por ella, subir la ganancia no cambiaba ni un pixel.

**`smoothstep` siempre con los bordes en orden ascendente.** Al reves es
comportamiento indefinido en GLSL: funciona en unos drivers y devuelve cero en
otros. Tenia corona, particulas y humo invisibles a la vez.

**Los colores de los shaders son LINEALES, no sRGB.** El negro del sistema,
`#06070A`, es aproximadamente `0.0018` lineal. Escribir `0.0075` pensando en
sRGB da un gris azulado bien visible.

**Los gradientes del hash van normalizados.** Sin normalizar, el ruido pierde la
media cero y se sesga; cualquier umbral que pongas encima satura en casi todo el
campo y la estructura se aplana.

## Rendimiento

Tres perfiles decididos al arrancar a partir de la GPU, los nucleos, la memoria
y el tipo de puntero. Ademas hay resolucion dinamica: si el fotograma medio se
pasa de dieciocho milisegundos durante un segundo, baja la densidad de pixeles
un escalon y la recupera cuando vuelve a ir holgada. La pieza no se ralentiza,
se ablanda.

Los shaders se compilan durante el preloader. Sin eso, el primer fotograma de la
explosion cuesta unos trescientos milisegundos de tiron, justo en el climax.

## Accesibilidad

Todo el contenido existe en el DOM como HTML real; el lienzo es decorativo y
esta marcado como tal. La pagina se navega con teclado y con lector de pantalla
aunque el WebGL no arranque nunca: sin el se sirve un poster estatico.

Con `prefers-reduced-motion` el eclipse cambia de estado por pasos discretos al
entrar cada seccion, sin escrubado continuo ni explosion.

## Lo que falta antes de publicar

Los corchetes marcan datos reales que hay que rellenar, no relleno de plantilla:

- `[PRECIO DESDE]` en los tres servicios.
- `[NOMBRE DEL CLIENTE]`, `[AÑO]` y `[QUE SE HIZO, EN UNA LINEA]` en trabajos.
- `[CORREO DE CONTACTO]` en `src/ui/Content.tsx` (la constante `EMAIL`), que es
  a donde va el formulario.
- `[NOMBRE DEL ESTUDIO]` y `[AÑO]` en el pie.

El formulario de contacto abre el cliente de correo del visitante con el mensaje
ya escrito. Funciona sin servidor desde el primer dia, pero cuando haya backend
conviene cambiarlo por una peticion de verdad: el mailto depende de que el
visitante tenga un cliente de correo configurado.
