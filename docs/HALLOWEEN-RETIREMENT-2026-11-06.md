# Retirada de Halloween — 6 de noviembre de 2026

## Decisión

Desactivar el evento ahora. La ventana configurada para Halloween era del 25 al 31 de octubre de 2026, ambos inclusive. El aspecto normal debería publicarse a partir del 1 de noviembre. Se conserva el código y el arte para futuras temporadas: retirar un evento no requiere borrar sus recursos.

El interruptor local sigue siendo `const HALLOWEEN_ENABLED = false;` en `src/Core/SeasonalFlags.js`. Para publicar otro Halloween se puede reactivar y actualizar las fechas del evento en `seasonal.json`. Cambiar el interruptor requiere regenerar los bundles y recargar la extensión y la página; no modifica por sí solo las instalaciones de otros usuarios.

## Inventario revisado

- `src/Core/SeasonalFlags.js`: autoridad local, compartida mediante la carga correspondiente de cada contexto.
- `src/Core/SplashScreen.js`: colores, texto, calabazas, fantasma y animación de entrada.
- `src/UI/HalloweenTheme.js`: CSS del panel, pantalla nativa, Menu Hub, título clásico, tarjetas, modales y decoraciones.
- `src/UI/ClientPanel.js`, `defaults.json` y `src/I18n/Translations.js`: disponibilidad de controles, banner, preferencias y traducciones.
- `src/Seasonal/MF_Seasonal.js` y `seasonal.json`: fechas, viñeta naranja, hojas, avisos y separación del ambiente nocturno y otras festividades.
- `src/Core/HotLoader.js`, `src/Core/MirrorRunner.js`, `src/Core/background.js`, `src/Core/MF_MiniBackground.js`, `manifest.json`, `mirror.json`, `hotload.json` y herramientas de build: orden de carga, versiones en caché y distribución empaquetada.
- `src/Shaders/CustomShader.js`: Spooklementary y valores predeterminados del render.
- `assets/ui/halloween/`: arte conservado; con el evento retirado, el escenario de navegador comprueba que no se soliciten esas decoraciones.
- Pruebas de Halloween, temporadas, mirror, arranque, valores predeterminados y herramientas de verificación visual.

Las calabazas del propio juego, sus texturas, skins y objetos, así como el módulo Horror y los presets seleccionados expresamente por el usuario, no son decoraciones impuestas por la temporada y no se han eliminado.

## Defectos reproducidos y correcciones de esta pasada

1. El interruptor tenía el punto y coma en otra línea. JavaScript lo aceptaba, pero varias pruebas y escenarios de navegador buscaban el texto exacto y no podían simular ON. Se normalizó el formato y se añadió un helper que tolera espacios y saltos de línea y falla explícitamente si el interruptor no existe o está duplicado.
2. El tema podía dejar CSS y atributos huérfanos cuando su API anterior ya no existía. Se limpian únicamente los nodos y atributos propios, sin sobrescribir colores guardados.
3. Una página ya abierta podía conservar el tema, el inicio o los efectos después de reinjectar el interruptor apagado. Los consumidores se sincronizan mediante un evento y vuelven a leer la bandera de su contexto. No se añade ningún bucle por fotograma.
4. La viñeta antigua podía persistir sin una caché válida y podía haber duplicados. También se limpia al arrancar sin caché, se eliminan duplicados y el apagado es inmediato, sin una transición naranja residual.
5. Las hojas ya creadas podían permanecer al pasar de Halloween al ambiente nocturno normal. Se reconstruyen las partículas cuando cambian los tipos de efecto y se conservan luciérnagas y meteoros independientes.
6. La guarda de temporadas se consultaba, pero no se establecía. Ahora una segunda inyección no inicia otra copia de los temporizadores. Los listeners de ambiente tampoco se vuelven a registrar cada vez que se recrea su canvas.
7. Los planes hot antiguos ahora excluyen también SplashScreen y HalloweenTheme, además de la bandera y el módulo de temporadas. No se borra localStorage ni se deshabilitan los extras ajenos a la temporada.
8. Panel y render usaban Spooklementary como fallback aunque `defaults.json` ya seleccionaba Photon. Se unificaron los valores nuevos y de reserva en Photon; una selección explícita de Spooklementary sigue intacta y disponible. Se añadió un marcador contra overrides antiguos del shader.
9. La versión mínima del módulo de temporadas subió a 2 para que el mirror no reemplace estos cambios por la copia anterior en caché.

## Comprobación

Registros de la ejecución: `artifacts/halloween-retirement-full-tests.log`, `artifacts/halloween-retirement-ui-browser.log`, `artifacts/halloween-retirement-seasonal-browser.log` y `artifacts/halloween-retirement-render-browser.log`.

Resultado final: **662 pruebas correctas de 662**, sin fallos ni pruebas omitidas. Los escenarios de interfaz, temporadas y WebGL en Edge terminaron sin excepciones; el escenario OFF no solicitó imágenes de Halloween. Se inspeccionó también la captura del panel retirado. Se comprobó que el mirror contiene los módulos actuales, que el userscript generado pasa sintaxis y que su bandera incorporada está en `false`.

Los escenarios aislados usan el código real con fechas de octubre, noviembre y diciembre, preferencias guardadas y cachés antiguas. Las pruebas visuales se ejecutan en Edge con recursos locales y sin cuenta ni servidor de juego. Esto no equivale a probar una partida real ni la instalación personal abierta del usuario.

Se regeneran `src/Core/mirror.js` y `dist/MiniFeatherClient.user.js`, sin instaladores Android/Tauri/Electron, sin subir versión, sin commits ni push. Los cambios previos del usuario, incluido el archivo de fuente del cliente clásico, se conservan.

## Después de instalar

Recargar la extensión y a continuación la pestaña de Miniblox. No hay que borrar ajustes ni cachés completos. Los usuarios de la versión publicada necesitan recibir esta actualización; la edición local no cambia la copia que ya tienen instalada.
