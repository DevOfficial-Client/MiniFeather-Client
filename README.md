# MiniFeather Client — distribución minificada

**este repo es una máquina de generar, no un escondite.** contiene el código del client minificado automáticamente en cada push del repositorio de desarrollo, por un workflow público que cualquiera puede leer y auditar.

## mapa

- **fuente legible y auditable:** [DevOfficial-Client/MiniFeather-Client](https://github.com/DevOfficial-Client/MiniFeather-Client) — GPL-3.0, con tests, historial completo y licencia explícita.
- **el generador:** `tools/minify-repo.js` + `.github/workflows/publish-minified.yml` en el repo de desarrollo. la minificación es terser con ajustes conservadores (sin mangle, sin poda de globals) y el workflow verifica sintaxis de cada módulo antes de pushear.
- **releases estables:** [shusukegxe/MiniFeather-Client-releases](https://github.com/shusukegxe/MiniFeather-Client-releases).

## para qué sirve

los canales de distribución (hotload del mirror, userscript) pueden servir desde acá: así quien quiera rebrandear o revender el client se lleva blobs masticados sin comentarios ni estructura legible, mientras el código fuente sigue 100% público. anti-piratería sin cajita negra: nada que verificar a ciegas.

## reglas

- **no edites nada a mano acá** — la próxima sync lo pisa sin ceremonia.
- licencia: **GPL-3.0**, igual que el original (el código minificado es obra derivada del mismo fuente).
- `src/Libraries/` viaja tal cual: son librerías de terceros ya minificadas y sus headers de licencia no se tocan.
