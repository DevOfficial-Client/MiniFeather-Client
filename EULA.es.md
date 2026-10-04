# Acuerdo de Licencia de Usuario Final (EULA) — MiniFeather Client

**Versión del acuerdo:** 1.4
**Fecha de entrada en vigor:** 4 de octubre de 2026
**Producto:** MiniFeather Client — extensión de navegador MV3 (Chrome/Chromium), userscript (Safari/iOS vía Userscripts, Firefox Android, escritorio), app Android (APK) y apps de escritorio (Windows/Tauri, Linux/Electron)
**Desarrolladores:** botless, AngryWolfX, ShusukeGxE_, Not_Senpai, ItzNightrise ("el Equipo de Desarrollo", "nosotros")

Este Acuerdo de Licencia de Usuario Final ("Acuerdo") es un contrato vinculante entre usted ("Usuario", "usted") y el Equipo de Desarrollo de MiniFeather. Al instalar, copiar o utilizar MiniFeather Client ("el Cliente", "el Software"), usted acepta estar sujeto a los términos de este Acuerdo. Si no está de acuerdo con alguno de los términos, no instale ni utilice el Software y elimínelo de su sistema.

> [!NOTE]
> This document is also available in English: [EULA.md](EULA.md)
> También disponible una versión fácil de leer (TL;DR): [EULA-TLDR.md](EULA-TLDR.md) (español) · [EULA-TLDR.en.md](EULA-TLDR.en.md) (English)

---

## 1. Naturaleza del producto y aceptación de terceros

1.1. MiniFeather Client es una extensión de navegador desarrollada por miembros de la comunidad, **sin afiliación, respaldo ni patrocinio de Miniblox, su equipo de desarrollo ni ningún tercero**. "Miniblox" y sus activos son propiedad de sus respectivos titulares.

1.1.1. **Distribuciones.** El Cliente se distribuye en varios formatos construidos desde el mismo repositorio público (extensión MV3, userscript, APK Android y aplicaciones de escritorio), todos generados del mismo código fuente y sujetos a los mismos términos. Las aplicaciones de escritorio muestran este Acuerdo en un diálogo de aceptación al primer arranque y recuerdan la aceptación de forma local; una nueva versión del Acuerdo vuelve a solicitarla.

1.2. **Estado del producto: W.I.P. (Work In Progress).** El Cliente se encuentra en desarrollo activo y continuo. Las funciones pueden ser inestables, incompletas, cambiar sin previo aviso, dejar de funcionar tras actualizaciones de Miniblox o del navegador, o ser retiradas temporal o definitivamente. Las funciones etiquetadas como "experimentales" y las marcadas como no aptas para el juego regular pueden contener errores y comportarse de forma impredecible. El Usuario acepta utilizar el Software con conocimiento de su estado de desarrollo y **no debe depender de él para ningún uso crítico**.

1.3. El Cliente se ejecuta sobre el juego Miniblox (`miniblox.io`, `miniblox.online`) y **modifica su comportamiento en el navegador del Usuario** (renderizado, interfaz, entrada de controles y comunicaciones de red del juego). El Usuario reconoce que el uso de software de terceros puede violar los Términos de Servicio de Miniblox y que **el único responsable de las consecuencias (incluida la suspensión o baneo de su cuenta) es el propio Usuario**.

1.4. El Software se proporciona "TAL CUAL" y "SEGÚN DISPONIBILIDAD", sin garantías de ningún tipo, expresas o implícitas, incluyendo pero no limitándose a garantías de comercialización, aptitud para un propósito particular e infracción. El uso del Software es **por cuenta y riesgo del Usuario**.

1.5. **Arte y recursos de terceros.** El Cliente incluye arte, modelos, fuentes, sonidos y otros recursos creados por terceros. Cada obra de terceros incluida está acreditada, con su autor, fuente y licencia, en el archivo [CREDITS.md](CREDITS.md) del proyecto. Dichos recursos siguen siendo propiedad de sus respectivos autores; el Equipo de Desarrollo no reclama ninguna titularidad sobre ellos y los acredita como reconocimiento de buena fe. Los titulares de derechos pueden solicitar una corrección de crédito o la retirada de su obra a través del canal de la sección 14.2.

---

## 2. Licencia concedida

2.1. Se concede al Usuario una licencia **limitada, revocable, no exclusiva, gratuita y no transferible** para instalar y utilizar el Software con fines personales y no comerciales.

2.2. La titularidad intelectual del Software corresponde al Equipo de Desarrollo. Esta licencia no constituye una venta.

2.3. **Licencia del código fuente.** Con independencia de lo anterior, el código fuente propio del Equipo de Desarrollo (el contenido de `src/`, `tools/` y `tests/` en el repositorio del proyecto) se publica bajo la **Licencia Pública General de GNU v3.0** (véase el archivo [LICENSE](LICENSE)), con el alcance y las exclusiones documentados en [LICENSING.md](LICENSING.md). Dicha licencia rige lo que cualquier persona puede hacer con el código fuente; los assets incluidos no están cubiertos por ella y conservan sus propias licencias (véase [CREDITS.md](CREDITS.md)). Este Acuerdo sigue rigiendo el uso de la distribución oficial del Client y de los servicios comunitarios del proyecto.

---

## 3. Restricciones de uso

El Usuario se compromete a **NO**:

3.1. Utilizar el Software para obtener **ventaja injusta en servidores competitivos**, incluyendo sin limitación: el módulo Baritone (desplazamiento, combate y minado automáticos), el módulo IdlePlayerBot (bots simulados), Anti-AFK, o cualquier forma de automatización no autorizada por las reglas del servidor en el que participe.

3.2. Realizar ingeniería inversa del protocolo de red de Miniblox con fines de explotación, sobrecargar servidores o falsear la cantidad de jugadores conectados.

3.3. Vender, alquilar, sublicenciar o explotar comercialmente el Software o cualquier derivado.

3.4. Eludir sistemas anticheat, sistemas de pago ni controles de acceso de Miniblox o terceros.

3.5. Utilizar el Software para acosar, acechar, doxxear o dañar a otros jugadores.

3.6. Redistribuir copias modificadas del Software haciendo pasar el resultado por un producto oficial del Equipo de Desarrollo.

---

## 4. Módulos de automatización y ventaja competitiva — aviso específico

El Cliente incluye funcionalidades que automatizan acciones del juego o alteran la información percibida por el Usuario. Se enumeran con nivel de riesgo orientativo respecto a medidas anticheat y reglas de servidor:

| Nivel de riesgo | Módulos |
|---|---|
| Extremo | IdlePlayerBot (incluido un modo multibot de hasta 16 bots simulados simultáneos), Baritone |
| Alto | Anti-AFK |
| Moderado | Auto Sprint, Safe Sneak, FullBright, Zoom, Health NameTags, Freelook, Elytra Flight (controles) |
| Bajo | Dynamic Crosshair, Distance NameTags, Auto Respawn |
| Restringido por diseño | FreeCam (reservado a administradores de servidor o whitelist) |
| Sin riesgo de juego (cosmético/QoL) | Skins y modelos custom, emotes, shaders, LeafWind, AllayPets, SpiderSim/SpiderBot, DuckMobs, CrittersMobs, MobRagdolls, TaczGuns (modelos de armas, visual), animaciones, GUIPatch, waypoints, mapa, chat de cliente, y demás módulos visuales |

4.1. El Usuario es el único responsable de verificar qué módulos están permitidos en cada servidor y de desactivar los que correspondan.

4.2. El Equipo de Desarrollo **no otorga ninguna garantía de que el uso del Software no resulte en la suspensión, restricción o eliminación de la cuenta del Usuario en Miniblox o cualquier servicio de terceros**.

4.3. Antes de activar determinados módulos de alto riesgo, el Cliente puede mostrar una advertencia adicional y exigir que el Usuario acepte los riesgos indicados. Cerrar o rechazar esa advertencia impide la activación. Elegir «aceptar y no volver a mostrar» guarda esa decisión localmente. La aceptación no significa que el servidor permita el módulo, no garantiza protección frente a sanciones y no traslada la responsabilidad del Usuario.

---

## 5. Privacidad y tratamiento de datos

El Software funciona **sin cuentas propias ni servidores propios**. Sin embargo, para ofrecer sus funciones procesa y transmite los datos que se describen a continuación. Cuando el Usuario proporciona URLs personalizadas (skins, capas, mundos, packs de texturas o recursos de terceros), el Cliente descarga contenido directamente de esas URLs y dicho tráfico queda sujeto a los servicios correspondientes. El Usuario acepta el tratamiento aquí descrito al utilizar las funciones correspondientes.

### 5.1. Datos almacenados localmente (no salen del dispositivo salvo que se indique)

Se guardan en el almacenamiento local del navegador (`localStorage`, `IndexedDB`, `chrome.storage.local`), **sin cifrar**:

- Preferencias y configuración del Cliente (equivalentes a `defaults.json`), idioma, colores, atajos de teclado y avisos de riesgo de módulos aceptados localmente.
- Waypoints (nombres de servidor/mundo, coordenadas, colores).
- Apodos asignados a amigos (UUID y nombre de usuario de Miniblox).
- Skins y packs de caras importados (imágenes PNG en base64), packs de texturas y modelos.
- Servidores locales guardados (LocalGames).
- Estado de moderación en caché (última configuración conocida y veredictos locales; véase la sección 8.5).
- Datos de la cuenta MiniFeather vinculada, si existe (identificador de cuenta y preferencias cosméticas; véase la sección 5.3.3).
- Historial de conversación con VerityAI y, si el Usuario la configura, su **API key de IA en texto plano** (se recomienda usar claves con límite de gasto).

### 5.2. Datos que salen del dispositivo

| Servicio | Función | Datos transmitidos |
|---|---|---|
| GitHub (`api.github.com`, `raw.githubusercontent.com`, `github.com`) | Auto-actualización, hotload de módulos, base de datos comunitaria de skins/rangos, descarga de resourcepacks, configuración de moderación (8.5) y blocklist del filtro de contenido (8.4) | Ningún dato personal del Usuario; solo consultas anónimas de descarga |
| ntfy.sh (bus de mensajes público) | ClientChat (chat entre usuarios del Cliente), señalización de llamadas de voz, anuncios de mundos locales, notificaciones de cambios en la base comunitaria de skins/cuentas | Nombre de usuario y UUID de Miniblox (en ClientChat), hash SHA-256 del UUID (en voz), contenido de los mensajes que el Usuario escriba, nombre del mundo y número de jugadores |
| Catbox (`catbox.moe`, `files.catbox.moe`) | Alojamiento de imágenes enviadas por el chat (botón de adjuntar, pegar o arrastrar) | La imagen enviada, alojada **sin cuenta, de forma permanente y pública**: cualquiera que tenga la URL puede acceder al archivo |
| PeerJS / WebRTC (P2P) | Voz, transferencia de skins/caras entre amigos, LocalGames | Audio directo entre pares (voz), imagen de skin/cara compartida, dirección IP potencialmente visible por los pares conectados (naturaleza de WebRTC) |
| Klipy (`api.klipy.com`) | Búsqueda de GIFs para el chat | Consulta de búsqueda del Usuario; la petición se realiza con una clave de API incluida en el Cliente (el Usuario puede configurar la suya propia) |
| Modrinth (`modrinth.com`, `cdn.modrinth.com`) | Descarga de packs PBR de la lista de presets | Ningún dato personal del Usuario; solo consultas anónimas de descarga |
| OpenRouter / Zhipu / Puter (VerityAI) | Asistente de IA opcional | Historial de conversación y mensajes del chat del juego si el auto-responder está activo |
| qu.ax / YouTube | Reproducción de clips de chat e integración musical | Ningún dato personal del Cliente; el embed de YouTube queda sujeto a la política de Google |
| Miniblox (`miniblox.io`) | Funcionamiento normal del juego | Sesión del Usuario gestionada por el propio juego |

5.2.1. **Aviso importante sobre ntfy.sh:** los canales de ClientChat y señalización de voz son públicos por diseño. Cualquier persona que conozca el nombre del canal puede leer el contenido transmitido. **No envíe información personal, contraseñas ni datos sensibles por ClientChat ni por voz.**

5.2.2. **Micrófono:** la captura de audio solo se solicita cuando el Usuario acepta o inicia una llamada de voz (opt-in mediante `/call on`), puede silenciarse en cualquier momento y desactivarse por completo con `/call off`.

5.2.3. **Aviso sobre subidas públicas:** las imágenes que el Usuario envíe por el chat se alojan en Catbox como archivos **públicos y permanentes**, sin cuenta y sin mecanismo de borrado ofrecido por el Cliente. El Equipo de Desarrollo no revisa dichas imágenes antes de su publicación y no puede retirarlas del servicio de terceros; el Usuario es el único responsable de lo que sube.

### 5.3. Cuentas y credenciales

5.3.1. El Cliente **no solicita, almacena ni gestiona contraseñas de Miniblox**. La sesión activa del juego es creada y gestionada exclusivamente por Miniblox; el Cliente solo la detecta para identificar al Usuario dentro de sus funciones sociales.

5.3.2. La función de identificación de voz publica un hash SHA-256 del UUID de la cuenta, que no verifica criptográficamente la propiedad de la cuenta. **Confirme la identidad del interlocutor por otros medios antes de revelar información sensible.**

5.3.3. **Cuentas MiniFeather (opcionales).** El ecosistema comunitario (skins, capas, rangos y mascotas compartidas) puede gestionarse mediante una cuenta MiniFeather, creada y administrada por el Equipo de Desarrollo a través de un bot oficial de Discord. Estas cuentas son independientes de la cuenta de Miniblox: la contraseña se guarda únicamente como **hash PBKDF2-SHA256 (200.000 iteraciones)** en la infraestructura privada del equipo, nunca en texto plano; la vinculación registra el identificador de Discord; y el perfil público (nombre de cuenta, rango y URLs de los cosméticos publicados) se aloja en el repositorio comunitario público del proyecto. **La solicitud de creación envía el nombre de usuario y la contraseña sin cifrar, en texto plano, a través de un canal público de ntfy.sh**: cualquier persona que escuche ese canal podría leerlos en tránsito. Por eso **el Usuario debe emplear una contraseña única y no reutilizada**, distinta de la de su correo, Discord o Miniblox. Las cuentas son prescindibles: todas las funciones del Cliente operan sin ellas. El Usuario puede solicitar la baja o la eliminación de su cuenta a través del canal de la sección 14.2.

### 5.4. Menores de edad

El Software no está dirigido a menores de 13 años. Si el Usuario es menor de edad, debe utilizar el Software con conocimiento y supervisión de un padre, madre o tutor legal, que acepta este Acuerdo en su nombre.

---

## 6. Actualizaciones y ejecución de código

6.1. El Cliente incorpora un **auto-actualizador** que descarga componentes desde el repositorio público de GitHub del proyecto (`DevOfficial-Client/MiniFeather-Client`) y los aplica mediante un sistema de "hotload" sin pasar por la revisión de la Chrome Web Store. Esto incluye la recarga automática de módulos individuales desde el repositorio (con copia local de respaldo), la auto-actualización del userscript a través del gestor de scripts del Usuario, y las builds rolling de las distribuciones APK y de escritorio. Este comportamiento puede desactivarse o limitarse en la configuración (según plataforma).

6.2. El Cliente carga librerías de terceros desde CDN públicos (PeerJS desde `unpkg.com`, Puter desde `js.puter.com`).

6.3. El Usuario reconoce y acepta estos mecanismos como parte del funcionamiento del Software, junto con los riesgos inherentes a depender de repositorios y CDNs de terceros (indisponibilidad, cambios no deseados, compromiso de la cadena de suministro).

6.4. Dado el estado W.I.P. del proyecto, las actualizaciones pueden aplicarse con mayor frecuencia que en software estable y pueden introducir cambios de comportamiento, regresiones o incompatibilidades temporales. El Usuario puede desactivar el auto-actualizador bajo su propia responsabilidad, asumiendo que las versiones antiguas pueden dejar de ser compatibles con el juego o con las funciones sociales (ClientChat, voz, LocalGames).

---

## 7. Modificación de tráfico de red

7.1. El Cliente utiliza el permiso `declarativeNetRequest` para **redirigir peticiones de texturas y recursos gráficos** de Miniblox hacia versiones personalizadas elegidas por el Usuario (skins, capas, packs de texturas). Estas redirecciones afectan únicamente al navegador del propio Usuario.

7.2. La función "ads" es un **opt-in inverso**: los anuncios se ocultan por defecto (visualmente) y pueden reactivarse voluntariamente con el toggle "Support Ads" para apoyar al juego.

7.3. **Permisos del navegador.** La extensión solicita los permisos que necesita para funcionar: `storage` y `unlimitedStorage` (preferencias, skins, cachés y demás datos locales de la sección 5.1), `alarms` (chequeos periódicos: actualizaciones, configuración de moderación, blocklist del filtro de contenido), `downloads` (guardar en disco los archivos que el Usuario exporta — skins, GIFs, grabaciones del Studio, packs — y componentes de actualización), `activeTab` y `declarativeNetRequest` (sección 7.1). Las distribuciones de escritorio y móviles usan los equivalentes propios de su plataforma (almacenamiento del sistema, micrófono solo para voz).

---

## 8. Contenido generado y comunidad

8.1. El Usuario es el único responsable del contenido que publique mediante ClientChat, mundos locales anunciados, llamadas de voz o cualquier función social del Cliente.

8.2. Queda prohibido publicar contenido ilegal, hate speech, spam, malware, enlaces maliciosos o contenido sexual que involucre a menores (incluida la ficción). El Equipo de Desarrollo puede, a su discreción, retirar contenido de las bases de datos comunitarias y bloquear el acceso a las funciones sociales. Las imágenes enviadas por el chat se alojan en servicios públicos de terceros (véase 5.2.3) sin revisión previa del Equipo, y el Usuario responde por ellas.

8.3. Las skins, packs y aportaciones comunitarias publicadas en los repositorios del proyecto pueden ser utilizadas, distribuidas y modificadas por el Equipo de Desarrollo dentro del ecosistema MiniFeather. Al subir contenido, el Usuario declara tener los derechos necesarios sobre el mismo.

8.4. **Las skins, capas y caras personalizadas son contenido generado por el Usuario.** El Client aplica un filtro de contenido automatizado a las skins y capas en la importación local, la recepción por p2p y la descarga remota, combinando una heurística de desnudos (análisis de regiones de píxeles del layout de skin) con una blocklist de hashes mantenida por el equipo. El filtro es una medida de mejor esfuerzo: puede dejar pasar contenido inapropiado y puede marcar por error skins inofensivas. El contenido almacenado localmente no tiene revisión humana y permanece en el navegador del Usuario; la base de datos de skins de la comunidad además se revisa antes de publicarse. El contenido que evade el filtro puede reportarse por el canal de la sección 14.2; los reportes verificados alimentan la blocklist compartida. Eludir deliberadamente el filtro para difundir contenido prohibido o acosar a otros jugadores es una violación de las secciones 3.5 y 8.2.

8.5. **Moderación remota del Cliente.** El Equipo de Desarrollo mantiene una configuración de moderación remota que el Cliente consulta al arrancar y periódicamente. Mediante ella el Equipo puede: (a) deshabilitar el Cliente de forma total o parcial (kill switch, incluida la desactivación individual de módulos), por razones de mantenimiento, seguridad o cumplimiento de este Acuerdo; y (b) impedir que cuentas concretas utilicen el Cliente, identificadas por su UUID o nombre de Miniblox, cuando su conducta viole las secciones 3 o 8. La aplicación de estas medidas es inmediata y no requiere actualización del Software; el Usuario verá en pantalla el motivo cuando corresponda, y las medidas severas pueden presentarse mediante una pantalla de bloqueo de estilo «pantalla azul». Cuando así se indique expresamente en la configuración de la medida, esta puede incluir además el restablecimiento de los datos locales almacenados por el propio Client (ajustes, cachés y preferencias); los archivos del Usuario y los datos del juego base no se tocan. Estas medidas afectan únicamente al Cliente (el juego base de Miniblox no se ve alterado) y pueden recurrirse por el canal de contacto de la sección 14.2.

---

## 9. Exclusión de garantías

9.1. El Software se ofrece sin garantía alguna, en su estado actual de desarrollo (W.I.P.). No se garantiza que sea ininterrumpido, seguro, esté libre de errores, que sus funciones estén completas o que funcione con versiones futuras de Miniblox, de los navegadores o de las dependencias de terceros. El reporte de errores y su corrección no están garantizados ni sujetos a plazos.

9.2. El Equipo de Desarrollo puede modificar, suspender o discontinuar cualquier función (incluidas ClientChat, voz, LocalGames o VerityAI) en cualquier momento y sin previo aviso, como parte del desarrollo iterativo del proyecto.

---

## 10. Limitación de responsabilidad

EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY APLICABLE, EL EQUIPO DE DESARROLLO NO SERÁ RESPONSABLE POR:

10.1. Daños directos, indirectos, incidentales, especiales, consecuenciales o punitivos, pérdida de datos, pérdida de beneficios o pérdida de cuentas de juego derivadas del uso o la imposibilidad de uso del Software.

10.2. Baneos, suspensiones, restricciones o pérdida de artículos, progreso o cosméticos en Miniblox o cualquier servicio de terceros.

10.3. Actos de terceros: interceptación de mensajes en canales públicos, compromiso de repositorios o CDNs, abuso de API keys configuradas por el Usuario, o comportamiento de otros pares en conexiones WebRTC.

10.4. Pérdida de datos almacenados localmente (el almacenamiento del navegador puede ser vaciado por el propio navegador, por actualizaciones o por otras extensiones).

---

## 11. Terminación

11.1. Esta licencia es efectiva hasta su terminación. El Usuario puede terminarla en cualquier momento desinstalando el Software.

11.2. La licencia termina automáticamente si el Usuario incumple cualquiera de los términos de este Acuerdo. En tal caso, debe desinstalar y destruir todas las copias del Software.

---

## 12. Cambios al Acuerdo

12.1. El Equipo de Desarrollo puede modificar este Acuerdo en cualquier momento. La versión vigente se publicará en el repositorio oficial del proyecto. El uso continuado del Software tras la publicación de cambios constituye la aceptación de los mismos.

---

## 13. Legislación aplicable

13.1. Este Acuerdo se rige por las leyes aplicables en la jurisdicción del Equipo de Desarrollo, sin perjuicio de los derechos imperativos de consumo del Usuario en su lugar de residencia.

13.2. Cualquier controversia se intentará resolver amistosamente a través del Discord oficial del proyecto antes de acudir a vía judicial.

---

## 14. Aviso legal y contacto

14.1. MiniFeather Client es un proyecto comunitario, no comercial y sin ánimo de lucro. Su código fuente propio es software libre bajo la GNU GPL-3.0 ([LICENSE](LICENSE), [LICENSING.md](LICENSING.md)); los assets incluidos conservan sus propias licencias.

14.2. Si usted es el titular de derechos sobre Miniblox o cualquier activo de terceros utilizado (incluida cualquier obra acreditada en el [CREDITS.md](CREDITS.md) del proyecto) y desea solicitar un cambio de crédito o una retirada, o si tiene preguntas sobre este Acuerdo o el tratamiento de datos, contacte a través del Discord oficial del proyecto: `https://discord.gg/k4Ku9DTQDQ`.

---

## 15. Inteligencia Artificial

### 15.1. La IA como herramienta de desarrollo

15.1.1. El Cliente fue desarrollado **con la asistencia significativa de herramientas de inteligencia artificial** (generación de código, refactorización, traducción y documentación). Las contribuciones generadas por IA fueron revisadas y adoptadas por el Equipo de Desarrollo, que mantiene la responsabilidad sobre el código publicado. No obstante, dada la naturaleza de estas herramientas, el Software puede contener errores, inconsistencias o comportamientos no deseados que la revisión automatizada no haya detectado.

15.1.2. El Usuario reconoce que la combinación del desarrollo asistido por IA con el estado W.I.P. del proyecto (sección 1.2) incrementa la probabilidad de errores, y que el Software no debe tratarse como código totalmente auditado.

### 15.2. VerityAI (funciones de IA incluidas en el Cliente)

El Cliente integra un asistente de IA opcional ("VerityAI", habilitado por defecto con el proveedor gratuito Puter, configurable mediante el comando `/verity`).

15.2.1. **Proveedores y claves.** VerityAI admite Puter (sin clave), OpenRouter y Zhipu/GLM (ambos requieren una API key proporcionada por el Usuario). Si se configura, la API key se guarda **sin cifrar** en el almacenamiento local del navegador y se envía al proveedor correspondiente con cada solicitud. El Usuario es responsable de la custodia, los límites de gasto y la revocación de sus claves.

15.2.2. **Datos transmitidos.** Al utilizar el asistente, el historial de conversación (hasta los últimos 20 mensajes), la persona configurada y el texto del mensaje se envían a los servidores del proveedor seleccionado. Si el modo `autoReply` está activado, **mensajes del chat del juego pueden ser procesados y respondidos automáticamente**, lo que implica que el contenido del chat del juego se envía al proveedor de IA.

15.2.3. **Sin garantía de exactitud.** Las respuestas de la IA pueden ser inexactas, desactualizadas, incoherentes o engañosas. El Usuario no debe tomarlas como asesoramiento factual, técnico o jurídico. El Equipo de Desarrollo no es responsable del contenido de las respuestas de la IA ni de las acciones tomadas a partir de ellas.

15.2.4. **Cumplimiento de los términos de los proveedores.** El uso de Puter, OpenRouter, Zhipu o cualquier otro proveedor se rige adicionalmente por los términos de servicio y políticas de cada proveedor. El Usuario debe asegurarse de que su uso cumple dichos términos.

15.2.5. **Usos prohibidos.** El Usuario no debe utilizar VerityAI para generar o difundir contenido prohibido en la sección 8, para automatizar acoso a otros jugadores ni para violar las reglas de cualquier servidor o servicio de terceros.

---

**Al instalar o utilizar MiniFeather Client, usted declara haber leído, comprendido y aceptado todos los términos de este Acuerdo.**
