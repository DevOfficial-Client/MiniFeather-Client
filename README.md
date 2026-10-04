# rama `minified` — distribución minificada

**esta rama es una máquina de generar, no un escondite.** contiene el código del client minificado automáticamente, sincronizada por el workflow público [`publish-minified`](https://github.com/DevOfficial-Client/MiniFeather-Client/blob/main/.github/workflows/publish-minified.yml) en cada push a `beta` (rolling) o `main` (estable).

## mapa del repo oficial

- **`main`** — código fuente 100% legible y auditable, GPL-3.0, con tests e historial completo. la rama oficial.
- **`beta`** — donde trabajan los devs; betas rolling con los mismos builds automáticos.
- **`minified`** (esta rama) — el mismo árbol masticado: mismo mirror.json, mismas rutas, mismo hotload.

## para qué sirve

los canales de distribución (hotload del mirror, userscript) pueden servir desde acá: así quien quiera rebrandear o revender el client se lleva blobs masticados sin comentarios ni estructura legible, mientras el código fuente sigue 100% público en `main`. anti-piratería sin cajita negra: el minificador (`tools/minify-repo.js`) y sus ajustes son públicos, y cualquiera puede verificar que el minificado corresponde al fuente.

## reglas

- **no edites nada a mano acá** — la próxima sync lo pisa sin ceremonia.
- licencia: **GPL-3.0**, igual que el original (el código minificado es obra derivada del mismo fuente).
- `src/Libraries/` viaja tal cual: son librerías de terceros ya minificadas y sus headers de licencia no se tocan.
