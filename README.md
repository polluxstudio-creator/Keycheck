# KEYCHECK — Free Online Keyboard & Mouse Tester

Sitio web estático para probar **teclados y ratones directamente desde el navegador**: cada tecla
física que pulsas se ilumina, cada botón del ratón se cuenta, y nada de lo que escribes sale de tu
equipo. La única monetización prevista es **Google AdSense** (actualmente desactivada hasta que
existan identificadores reales).

- **Cero dependencias en producción.** HTML, CSS y JavaScript planos. Ni frameworks, ni fuentes
  externas, ni analítica.
- **Cero recolección de teclas.** Todo el procesamiento ocurre en el navegador.
- **Build sin dependencias.** Node ≥ 18 y nada más.

---

## 1. Estructura del proyecto

```
keycheck/
├── config/
│   └── site.json                 ← CONFIGURACIÓN CENTRAL (dominio, AdSense, consentimiento, sitemap)
├── scripts/
│   ├── build.mjs                 ← genera dist/ (tokens, parciales, sitemap, robots.txt, ads.txt)
│   ├── serve.mjs                 ← servidor estático local sin dependencias
│   ├── generate-assets.mjs       ← genera iconos PNG y la imagen Open Graph con Playwright
│   └── sync-faq-ld.py            ← regenera el JSON-LD de la FAQ desde el texto visible
├── src/
│   ├── index.html                ← tester + guías + FAQ compacta
│   ├── about.html  contact.html  privacy.html  terms.html  404.html
│   ├── guides/
│   │   ├── diagnostico.html      ← guía larga de diagnóstico (teclado y ratón)
│   │   └── faq.html              ← FAQ completa (18 preguntas) + FAQPage JSON-LD
│   ├── partials/
│   │   ├── header.html           ← cabecera y navegación (se inyecta en todas las páginas)
│   │   └── footer.html           ← pie, enlaces legales y banner de consentimiento
│   ├── assets/
│   │   ├── css/styles.css        ← sistema de diseño completo
│   │   ├── js/
│   │   │   ├── keyboard.js       ← tester de teclado (KeyboardEvent.code)
│   │   │   ├── mouse.js          ← tester de ratón (botones, rueda, doble clic)
│   │   │   ├── ui.js             ← pestañas (patrón ARIA tabs) y enlaces profundos
│   │   │   ├── consent.js        ← CMP ligera (banner de cookies)
│   │   │   ├── adsense.js        ← carga de anuncios (independiente del tester)
│   │   │   ├── app.js            ← arranque de la aplicación
│   │   │   └── site-config.js    ← GENERADO en el build a partir de config/site.json
│   │   └── img/                  ← favicon.svg, icon-*.png, apple-touch-icon.png, og-image.png
│   └── site.webmanifest
├── tests/
│   ├── e2e.test.mjs              ← 41 pruebas end-to-end con Chromium real
│   ├── probe-cls.mjs             ← medición del CLS con y sin anuncios
│   └── shots.mjs                 ← capturas de pantalla automáticas
├── dist/                         ← GENERADO: esta es la carpeta que se sube al hosting
└── package.json
```

---

## 2. Instalación

No hay dependencias que instalar para que la web funcione. Solo necesitas **Node.js 18+** para
desarrollar y construir.

```bash
cd keycheck
node -v            # debe ser >= 18
```

Playwright solo hace falta para generar los PNG y para ejecutar las pruebas:

```bash
npm install playwright --no-save   # opcional
npx playwright install chromium     # opcional
```

## 3. Ejecutarlo localmente

```bash
npm run dev        # = node scripts/build.mjs && node scripts/serve.mjs
```

Abre <http://localhost:4173>. Para elegir otro puerto: `node scripts/serve.mjs 8080 dist`.

Otros comandos:

```bash
npm run build      # regenera dist/
npm run serve      # sirve dist/ sin recompilar
npm test           # suite E2E (Chromium real, 41 pruebas)
```

### Personalizar el dominio y los textos

Casi todo se cambia desde `config/site.json` (dominio, email de contacto, consentimientos,
ubicaciones de anuncios). El build inyecta esos valores en las páginas: `{{SITE_URL}}`,
`{{CANONICAL}}`, `{{OG_IMAGE}}`, `{{CONTACT_EMAIL}}`, `{{YEAR}}`, `{{BASE}}`… después de
`npm run build` **vuelve a compilar** para que los cambios se apliquen.

---

## 4. Despliegue

`dist/` es un sitio estático puro: sirve la carpeta tal cual desde cualquier hosting.

```bash
npm run build
# luego sube el contenido de dist/ a tu hosting
```

### Cloudflare Workers (el hosting usado en este proyecto)

El repo está conectado a **Cloudflare → Workers & Pages → keycheck**, así que cada `push` a
`main` compila y publica el sitio automáticamente. Configura en **Settings → Builds &
deployments**:

| Ajuste | Valor |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(vacío)* |
| Node version | `20` (o `18`+) |
| Environment variables | ninguna — el build no tiene dependencias |

El build no necesita `npm install`: no hay dependencias de producción. `dist/.nojekyll` se
genera solo para que GitHub Pages sirva los ficheros tal cual.

Para tener URL pública hay dos vías:

1. **Subdominio workers.dev**: *Workers & Pages → keycheck → Settings → Domains & Routes →
   Add → Workers subdomain*. Te da una URL del tipo `https://keycheck.<tu-subdominio>.workers.dev`.
2. **Dominio propio**: *Add → Custom domain* y apuntas el CNAME que te indica Cloudflare.

**Después de obtener la URL**, actualiza `site.url` en `config/site.json` (de ahí salen el
canonical, el sitemap, `robots.txt` y la imagen Open Graph) y haz push.

Opciones habituales:

| Hosting | Pasos |
|---|---|
| **Netlify** | Sube la carpeta `dist/` (o conecta el repo y define `npm run build` + carpeta `dist`). |
| **Vercel** | Mismo esquema: build `npm run build`, output `dist`. |
| **Cloudflare Pages** | Build `npm run build`, directorio de salida `dist`. |
| **GitHub Pages** | Sube `dist/` a la rama `gh-pages` (o usa Actions con el output de `dist`). |
| **Hosting compartido / cPanel** | Sube `dist/` por FTP a `public_html/`. |
| **Nginx / Apache** | `root /var/www/keycheck;` + `try_files $uri $uri/ =404;` |

Requisitos del servidor:

- **HTTPS obligatorio** (Google AdSense no muestra anuncios en HTTP y el navegador bloquea APIs
  seguras).
- Sin PHP, sin base de datos, sin backend: el sitio no envía nada.
- `ads.txt` debe servirse en la raíz del dominio (`https://tudominio.com/ads.txt`) — ya se genera
  en `dist/ads.txt`; solo tienes que pegarle la línea real de tu cuenta de AdSense.

**Antes de publicar:** cambia `site.url` en `config/site.json` por el dominio real y recompila
(`npm run build`). El canonical, el sitemap, el robots.txt y las URLs de Open Graph se generan a
partir de ese valor. El email de contacto (`site.contactEmail`) también sale de ahí: se inyecta
en el pie de página y en el formulario de contacto.

---

## 5. Configuración de Google AdSense

Todo pasa por **un único archivo**: `config/site.json` → sección `adsense`.

```jsonc
"adsense": {
  "enabled": false,                 // interruptor global de anuncios
  "publisherId": "",                // "ca-pub-XXXXXXXXXXXXXXXX" — vacío = sin anuncios
  "autoAds": false,
  "enabledPlacements": ["header", "sidebar", "belowTester", "betweenSections"],
  "slots": {
    "header": "",                   // ID del bloque horizontal bajo la cabecera
    "sidebar": "",                  // ID del bloque vertical (solo >= 1024 px)
    "belowTester": "",              // ID del bloque bajo el tester
    "betweenSections": ""           // ID del bloque entre secciones
  },
  "formats": { "header": "horizontal", "sidebar": "vertical", "…": "…" },
  "minViewportWidth": { "sidebar": 1024, "…": 0 },
  "reserveHeight": { "header": 285, "sidebar": 625, "…": 285 },
  "label": "Advertisement"
}
```

`reserveHeight` es la **altura total del hueco** (etiqueta + unidad). Ajústala a tu bloque: ~115 px
para una unidad horizontal de 728×90, ~285 px para una de 300×250 y ~625 px para la vertical de
300×600. El valor por defecto (285) cubre el caso habitual de una unidad responsiva.

Reglas de funcionamiento:

- **Mientras `publisherId` o un `slots.*` estén vacíos, no se renderiza nada**: no se carga el
  script de Google, no se generan `<ins>` y **no queda ningún hueco vacío** en la página
  (`.ad-slot:empty { display: none }`).
- El `ads.txt` se **genera solo** a partir del `publisherId`: no hay que editarlo a mano.
- El interruptor `enabled: false` desactiva los anuncios aunque los IDs estén puestos.
- Las ubicaciones se activan una a una con `enabledPlacements`: si no quieres el bloque lateral,
  quítalo de la lista y la columna lateral se recolapsa sola.
- El script de Google se carga **una sola vez**, de forma asíncrona, y **nunca se recarga**.
- Los anuncios se renderizan **después** del consentimiento (ver punto 7).

### Cómo se reserva el espacio (y por qué importa)

El hueco se reserva **en el HTML, durante el build**, no desde JavaScript: en cuanto la
configuración de AdSense está completa, cada `data-ad-placement` se compila con la clase
`ad-slot--reserved` y la altura reservada. Así el hueco existe desde el primer pintado y la página
no salta nunca.

Dos detalles aprendidos midiendo el resultado real en el navegador:

1. **El cargador de Google reescribe el estilo del contenedor directo del `<ins>`** (`height:auto`,
   `min-height:0`). Por eso la altura reservada se aplica al contenedor **exterior**
   (`.ad-slot`), que Google no toca, y no al marco interior.
2. El espacio del teclado también se reserva (`--kb-h`), porque el teclado se dibuja con
   JavaScript y, sin reserva, empujaba hacia abajo el contenido de la tarjeta.

Medido con Chromium real en una página con anuncios (unidades simuladas de 728×90):

| Situación | CLS antes | CLS ahora |
|---|---|---|
| Sin anuncio (hueco reservado) | 0,116 | **0,000** |
| Unidad 728×90 | 0,160 | **0,000** |
| Unidad 300×250 | 0,154 | **0,001** |

Medido con Chromium real mediante `PerformanceObserver` (`tests/probe-cls.mjs`). El valor por
defecto de `reserveHeight` (285 px) cubre una unidad responsiva de 300×250; si tu unidad es más
baja (728×90), baja el valor a ~115 y seguirá sin haber desplazamiento.


### Qué información necesito de ti para activarlo

1. **ID del editor**: `ca-pub-XXXXXXXXXXXXXXXX` (en AdSense → *Account* → *Account information*).
2. **IDs de bloque** (uno por ubicación que quieras usar). En AdSense → *AdSense* → *Ad units* →
   *New ad unit* → elige **Display ad** → copia el `data-ad-slot`.
   - `header` → bloque horizontal (728×90 / responsivo).
   - `sidebar` → bloque vertical (300×600), solo se muestra en pantallas ≥ 1024 px.
   - `belowTester` → bloque horizontal bajo el tester.
   - `betweenSections` → bloque horizontal entre secciones informativas.
3. **Tu dominio final** (`site.url`) para canonical, sitemap y `ads.txt`.
4. **Email de contacto** (`site.contactEmail`).
5. Opcional: **autoanuncios** → `autoAds: true`. En ese modo Google coloca los anuncios por su
   cuenta y no se encolan las unidades manuales (para no servir anuncios duplicados).

Con esos cinco datos, relleno `config/site.json`, recompilo y la web queda lista.

### Cómo pedir la aprobación de AdSense

1. **Prepara el sitio antes de aplicar**: contenido original suficiente (esta plantilla ya incluye
   la página principal con guías, la guía de diagnóstico, la FAQ, privacidad, términos, about y
   contacto), página de contacto real con email funcional, textos en inglés, y navegación clara.
2. **Verifica que no falten los archivos legales**: `privacy.html` y `terms.html` deben ser
   visibles desde el pie de página (ya lo están) y describir el uso real del sitio.
3. **Añade `ads.txt`** en la raíz del dominio con la línea que te da AdSense
   (*Account* → *Ads.txt*). El archivo se genera, pero la línea real la tienes que pegar tú.
4. **Aplica**: AdSense → *AdSense* → *Get started* → indica el dominio y el email.
5. **Conecta el sitio**: añade el snippet de AdSense… **excepto que este proyecto ya lo hace por ti**
   (el script se carga solo cuando hay IDs configurados y el usuario acepta). Solo debes rellenar
   la configuración, no tocar el HTML.
6. **Configura el consentimiento**: para la UE/EEA, lo recomendable es usar **Google Funding
   Choices** (el CMP oficial de Google, que ya viene incluido al activar AdSense) en lugar del
   banner propio. El banner de este proyecto funciona, pero para una aprobación y un
   funcionamiento sin fricciones en Europa, usa el CMP de Google.
7. **Revisa el bloque de anuncios**: comprueba que no tapa el teclado, que el ancho no supera el
   viewport en móvil y que los anuncios no se parecen a la interfaz de la herramienta.
8. **Espera la revisión**: normalmente se revisa en unos días. Si te la rechazan, Google explica el
   motivo; lo más común es contenido insuficiente, falta de página de contacto o políticas de
   privacidad que no describan el uso real del sitio.

> El sitio **no afirma** estar aprobado por AdSense en ningún sitio: la aprobación depende de la
> revisión de Google.

---

## 6. Pruebas realizadas

Todas las pruebas se ejecutan de verdad con Chromium (Playwright) contra el build de `dist/`.

```bash
cd keycheck
node --test tests/e2e.test.mjs
```

**Resultado de la última ejecución: 41 pruebas, 41 correctas, 0 fallos.**

| # | Área | Qué se comprueba |
|---|---|---|
| 1 | Teclado | Se renderizan las **104 teclas** del layout ANSI |
| 2 | Teclado | La tecla pulsada se ilumina mientras está mantenida |
| 3 | Teclado | El contador de **pulsaciones totales** funciona |
| 4 | Teclado | Las **teclas únicas** se cuentan por separado (3 pulsaciones de `a` + `b` + `Enter` → 3 únicas, 5 pulsaciones) |
| 5 | Teclado | El **porcentaje de cobertura** = únicas / 104 y la barra se rellena |
| 6 | Teclado | Las **teclas modificadoras** se detectan y se muestran como "mantenidas" |
| 7 | Teclado | Las combinaciones **Ctrl/Cmd/Alt no cuentan** como pulsaciones de test |
| 8 | Teclado | **Reiniciar** pone todos los contadores a cero |
| 9 | Teclado | El **historial** muestra las pulsaciones en orden (más reciente primero) |
| 10 | Ratón | Se detectan **botón izquierdo, derecho y central** por separado |
| 11 | Ratón | La **rueda** registra eventos y distancia acumulada |
| 12 | Ratón | Se detecta el **doble clic** |
| 13 | Ratón | El **menú contextual** se bloquea dentro del área de test y **fuera funciona con normalidad** |
| 14 | Ratón | El **movimiento del puntero** actualiza coordenadas y distancia recorrida |
| 15 | Ratón | **Reiniciar** limpia los contadores del ratón |
| 16 | Interfaz | Las **pestañas** alternan entre ambos testers con ARIA correcto |
| 17 | Interfaz | **Responsive a 360 / 768 / 1440 px** sin desbordamiento horizontal |
| 18 | Interfaz | El teclado **sigue funcionando en móvil** |
| 19 | Interfaz | **Navegación por teclado** en las pestañas (flechas) y **skip link** operativo |
| 20 | Anuncios | Sin configuración: **no hay markup de anuncios** ni ninguna petición a Google |
| 21 | Anuncios | Sin configuración: el **banner de consentimiento no aparece** |
| 22 | Anuncios | Con configuración: los `<ins>` se crean con el publisher y el slot **de la configuración**, y el script se pide **una sola vez** con el `client` correcto |
| 23 | Anuncios | Con configuración: los anuncios **no solapan el teclado** y el tester sigue funcionando |
| 24 | Anuncios | El bloque lateral **no se inyecta por debajo de 1024 px** |
| 25 | Páginas | Las **7 páginas** cargan sin errores de consola, con un solo `<h1>` y canonical absoluto |
| 26 | Páginas | Las guías, la privacidad y los términos están **enlazados** desde la portada |
| 27 | SEO | `robots.txt`, `sitemap.xml` (7 URLs) y `ads.txt` se generan correctamente |
| 28 | SEO | **Ningún ID de publisher inventado** en el HTML ni en `ads.txt` |
| 29 | A11y | Todos los botones y enlaces **tienen nombre accesible** |
| 30 | Contenido | La política de privacidad **declara** que las teclas no se envían |
| 31 | Anuncios | El hueco publicitario se **reserva en el markup** (antes de cualquier script) y **no se pide nada a Google hasta el consentimiento** |
| 32 | Anuncios | **CLS < 0,05** cuando llega el anuncio (medido con PerformanceObserver) |
| 33 | Teclado | Los **tres bloques del teclado (principal, flechas y numérico) están alineados fila a fila** y con el mismo tamaño de tecla |
| 34 | Teclado | La tecla probada se marca como **"ya probada"** (indicador verde) |
| 35 | Teclado | El aviso de **modificador mantenido se libera** al perder el foco la ventana |
| 36 | Teclado | Las teclas **fuera del layout nunca llevan la cobertura por encima del 100 %** |
| 37 | Ratón | Un **triple clic cuenta como un solo doble clic** |
| 38–41 | Extra | Comprobaciones de regresión de cada suite (41 en total) |

Verificación manual adicional realizada durante el desarrollo:

- Capturas reales a 1440 px, 820 px y 390 px (escritorio, tablet, móvil) para revisar la
  maquetación y la legibilidad del teclado.
- Inspección visual de la imagen Open Graph generada (1200×630) y de los iconos PWA.

---

## 7. Privacidad, consentimiento y seguridad

- **Las teclas nunca salen del navegador.** El código solo lee `KeyboardEvent.code` (la posición
  física) para saber qué tecla iluminar. No hay `fetch`, ni `sendBeacon`, ni escritura de teclas en
  `localStorage`/`sessionStorage`/cookies.
- **Los clics y la rueda** también se procesan solo en local.
- **Lo único que se guarda** en el dispositivo es la decisión de consentimiento
  (`keycheck.consent.v1`: valor + fecha).
- El **banner de consentimiento** aparece únicamente cuando hay publicidad configurada, y el
  script de Google **no se carga hasta que el usuario acepta**. Si rechaza, no se carga nada.
- Sin analítica, sin píxeles de terceros, sin widgets sociales, sin fuentes externas.
- El **menú contextual** solo se suprime dentro del área de test del ratón; en el resto de la página
  funciona con normalidad. La rueda también queda capturada dentro de esa área para que la página
  no salte mientras pruebas.

## 8. Accesibilidad

- Navegación completa por teclado, foco visible (`:focus-visible`), skip link al contenido.
- Patrón **ARIA tabs** correcto en el selector Keyboard/Mouse.
- Los contadores viven en regiones `aria-live="polite"` y las líneas de estado (última tecla,
  instrucciones en vivo) usan `role="status"`.
- Contraste calculado (WCAG 2.1): texto principal `#e9edf2` sobre `#0d0f12` = **16.3:1**;
  texto secundario `#a3adba` sobre `#181c22` = **7.5:1**; texto tenue `#8a94a1` sobre `#181c22` =
  **5.6:1**; verde de detección `#35d399` sobre la tecla `#232830` = **7.7:1**; azul de acción
  `#6c9bff` sobre `#181c22` = **6.3:1**. Todos por encima del mínimo 4.5:1 (AAA para texto normal
  en casi todos los casos).
- `prefers-reduced-motion` respetado (se desactivan transiciones y scroll suave).
- Foco visible incluso con teclado: la tecla pulsada se distingue por color **y** por estado.

## 9. Limitaciones conocidas

- **El navegador no puede ver todo.** El sistema operativo se queda con algunos atajos (tecla
  Windows, combinaciones de sistema, teclas de firmware), así que esas teclas nunca se detectan.
- **Una prueba en el navegador no diagnostica el hardware**: no detecta interruptores desgastados,
  cables intermitentes, una matriz rota ni sensores que se degradan. El sitio lo dice explícitamente
  en la página y en el FAQ.
- **Los modificadores combinados no cuentan** (Ctrl/Cmd/Alt + tecla) para no romper los atajos del
  navegador; la tecla modificadora sí se cuenta y se muestra como "mantenida".
- **El doble clic es orientativo**: se mide con un umbral de 500 ms, similar al de los sistemas
  operativos, pero el ajuste real depende de tu sistema.
- En **móvil** la pantalla táctil no genera eventos de teclado reales: sirve para probar un teclado
  externo Bluetooth/USB, no el teclado en pantalla.
- El layout dibujado es el **ANSI de 104 teclas** (referencia US). En AZERTY o QWERTZ se ilumina la
  tecla física correcta, pero los caracteres impresos son los del layout US.
- La cola de teclas se limita a los **40 últimos eventos** y la lista de teclas probadas se
  muestra completa (104 máximo).
- El proyecto **no está aprobado por AdSense**: la aprobación depende de la revisión de Google.

## 10. Licencia y contenido

El código de KEYCHECK es reutilizable; el diseño, los textos y la marca son originales (no se ha
copiado código, identidad visual ni textos de la página de referencia). Las frases de las guías
están escritas para este proyecto. Las rutas relativas (`../assets/...`) permiten publicarlo en un
subdirectorio sin tocar nada.
