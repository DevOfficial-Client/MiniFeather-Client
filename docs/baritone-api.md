# Baritone: integración y límites

Investigación del 4 de octubre de 2026. Fuente primaria: [Miniblox](https://miniblox.io/) y el [JavaScript del juego publicado en esa fecha](https://miniblox.io/assets/index-BJaj5B1H.js). El hash de ese archivo NO está integrado en el módulo.

Se inspeccionó, sin ejecutarlo, `baritone-standalone-fabric-1.15.0.jar`: Baritone 1.15.0 para Fabric/Minecraft 1.21.6–1.21.8, distribuido con LGPL-3.0. Referencias del original: [funciones y búsqueda](https://github.com/cabaletta/baritone/blob/1.21.4/FEATURES.md) y [selección de herramientas en v1.15.0](https://github.com/cabaletta/baritone/blob/v1.15.0/src/main/java/baritone/utils/ToolSet.java). La integración de MiniFeather es una implementación JavaScript independiente de esas ideas; no ejecuta el JAR ni copia su código Java, y no es una adaptación completa de todas sus funciones.

## Arquitectura

`MovementAPI.js` sigue siendo el intermediario de hooks compartido con Auto Sprint, Safe Sneak y AntiAFK. `BaritoneAdapter.js` concentra la integración con el motor; `BaritonePlanner.js` calcula rutas; `BaritonePathRenderer.js` dibuja rutas dentro de la escena nativa; `Baritone.js` gestiona tareas, progreso y cancelación. El cargador declara las dependencias antes del módulo en `mirror.json` y reconoce las versiones de navegación 7, adaptador/planificador 6 y visualizador 1, evitando que una caché remota antigua restaure el seguimiento anterior.

| Capacidad | Integración verificada en el motor actual | Protección |
| --- | --- | --- |
| Movimiento | Recolección nativa de `currentInput`, cola `pendingInputs`, envío nativo y aplicación local | Modificar direcciones del mensaje original antes del envío; conservar clase protobuf, secuencia, posición, ACK, uso del ítem y reconciliación |
| Salto/correr/agacharse | Flags del input nativo y `setSprinting` | Sin escribir velocidad, posición ni enviar paquetes propios |
| Nadar/respirar | `inWater`, `oxygen` y salto nativo para ascender; soltarlo permite hundirse | Lava excluida, tramos sumergidos limitados y desvío hacia una superficie conocida cuando falta aire |
| Cámara | Controles de orientación verificables o evento `mousemove` nativo con realimentación | No asumir `camera.parent.parent`; comprobar ángulos reales |
| Coordenadas de bloques | `BlockPos` nativo derivado de posiciones del motor | No pasar un objeto genérico que el motor interpreta como aire |
| Chunks cargados | `chunkProvider.isLoaded` o `world.isBlockLoaded` con XYZ válidos | Nunca generar chunks ni considerar aire el terreno desconocido |
| Bloques/colisiones | Estado nativo, `getBlock`, material, dureza y caja de colisión | Distinguir líquidos, aire, bloques rompibles y peligros; no depender de IDs fijos |
| Romper | Controlador nativo: pulsación, progreso de minería y liberación | Exigir objetivo enfocado y alcance nativo; esperar confirmación del mundo |
| Colocar | Clic derecho nativo contra la cara de un vecino | Verificar destino de la cara, bloque en inventario y espacio reemplazable |
| Hotbar | `inventory.currentItem` y selección visible | Slots 1–9; las acciones nativas sincronizan la selección |
| Herramientas | Dureza relativa de minería calculada por el bloque nativo para los nueve slots | Estimar con vistas de solo lectura del jugador/inventario; elegir mediante selección nativa solo al minar; excluir armas de fuego y herramientas casi rotas; restaurar el slot |
| Materiales de construcción | Stacks reales de la hotbar y bloques nativos de cubo completo | Excluir bloques que caen, TNT, líquidos y soportes inseguros; restaurar la selección tras colocación automática |
| Jugadores | Entidades que el servidor ya envió al cliente | Posiciones actuales/últimas conocidas; no inventar información no recibida |

La dirección nativa es `(-sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))`: mirar a un objetivo requiere `atan2(-dx,-dz)` para yaw y `atan2(dy,hypot(dx,dz))` para pitch. El módulo anterior invertía Z.

## Rutas

A* incremental: hasta 4 ms/256 expansiones por ciclo de lógica, con límites de 20 000 nodos y 5 segundos por búsqueda. El cliente permite una caché acotada de hasta 65 536 lecturas por búsqueda, que se libera al terminar; el default independiente del planificador sigue en 8 192. La comprobación del siguiente movimiento siempre consulta el mundo actual. Los costes comparan caminar, saltar, caer, nadar, minar y construir. La minería usa los ticks estimados por el motor con la mejor herramienta válida de la hotbar; si la API no está disponible, usa dureza y un coste conservador. Así puede preferir rodear una pared antes que excavación lenta. Se validan cuerpo, cabeza, soporte, esquinas diagonales, saltos de un bloque, huecos cardinales de un bloque y caídas de hasta tres bloques.

Con `fastWalk:true`, activado en el cliente, una meta exacta a cualquier ángulo XZ sobre suelo seco y nivelado se comprueba directamente hasta 128 pasos, distribuyendo las diagonales dentro de los mismos presupuestos incrementales. Solo se acepta si todos los pasos y esquinas son caminables y el coste alcanza el mínimo teórico octile de esa distancia; obstáculos, fronteras desconocidas o tramos bloqueados devuelven la búsqueda a A*. No cambia minería, saltos ni construcción. La heurística de A* añade mínimos admisibles de 0.7 por bloque de ascenso y 0.35 de descenso; se verificó contra Dijkstra y los tipos de movimiento. En una subida simulada de 128 bloques, las expansiones bajaron de 1 838 a 129 y las lecturas de 6 688 a 1 227 con el mismo coste; esto no es una medición de FPS en una partida.

Los destinos lejanos conservan su coordenada global y empiezan con puntos intermedios de unos 32 bloques horizontales. Los tramos secos, completos y baratos permiten ampliar de 32 a 64 y a 128; ese horizonte ya no se reinicia con cada pequeño avance. Un endpoint desconocido reduce el tramo efectivo hasta 32, sin tratar obstáculos conocidos como chunks descargados. El siguiente tramo se precalcula hasta 32 puntos antes de llegar, dentro de 2 ms/256 expansiones por ciclo, y puede empalmarse a menos de 0.6 bloques del enlace si el corredor real sigue siendo seguro, sin recentrarse en su cuadro. Llegar a un punto intermedio nunca se anuncia como llegada al destino. Los resultados parciales por presupuesto pueden conservar un rodeo útil, pero una búsqueda agotada no hace deambular al jugador cuando la meta es inalcanzable.

Cuando una frontera descargada no permite más progreso, se observan hasta 32 posiciones desconocidas cercanas/al objetivo una vez por segundo. Sin cambios no se repite A* entero: se conservan los inputs neutrales y el límite de seis reintentos. Si un bloque observado pasa a conocido o cambia la posición, se vuelve a planificar con terreno actual. En una simulación de 600 bloques las búsquedas bajaron de 19 a 6; con una frontera fija descargada, las lecturas bajaron de 1 090 677 a 39 475. La generación/carga de chunks sigue siendo responsabilidad del juego; no se inventa terreno.

La minería automática abre túneles consecutivos sin necesitar espacio lateral. Mantiene el destino exacto cuando es excavable y despeja primero la cabeza. También puede excavar el espacio para subir un escalón cardinal, siempre sobre un soporte completo existente y con techo de salida libre; no salta hasta que el mundo confirma la excavación. Cada bloque tiene su propio tiempo de trabajo, entre 18 y 120 segundos si hay una estimación nativa, o 45 segundos sin ella. Selecciona la herramienta segura más rápida de la hotbar sin transferir ítems del inventario principal, y restaura la selección temporal. El tiempo de viaje de `/baritone mine` o `place` no consume el tiempo de la interacción final.

Los puentes consumen únicamente bloques seguros de la hotbar, con hasta 32 colocaciones presupuestadas por búsqueda y presupuesto renovado al continuar. Se acercan al borde agachándose, apuntan a una cara auténtica y esperan a que el mundo confirme cada soporte antes de caminar sobre él. No simulan raycasts ni suponen éxito porque el clic nativo fue aceptado. `/baritone place` sin slot elige material seguro disponible; el slot explícito se conserva. La selección temporal automática se restaura al terminar o cancelar.

El agua permite entrada, ascenso, descenso y salida a tierra, sin exigir contacto con el fondo. Se prefiere respirar en superficie y se limitan los pasos consecutivos con la cabeza sumergida (por defecto 12, ajustados al oxígeno observado). Con 60 ticks de oxígeno o menos se intenta un desvío a una superficie cercana conocida, conservando la meta original. Sin una salida conocida se detiene y avisa; esto no garantiza evitar ahogarse en cualquier terreno.

El siguiente tramo se vuelve a validar ante cambios del terreno. Los atascos excluyen tramos fallidos y provocan una nueva búsqueda con reintentos limitados. Una ruta parcial no se presenta como llegada al objetivo. Una posición próxima solo es válida como objetivo ajustado si está conocida y dentro del radio declarado.

La validación de una transición comprueba únicamente su dirección, no los ocho vecinos ni costes de herramientas de movimientos que no se van a ejecutar. Su caché vive una sola llamada y no se conserva para el siguiente tick. En la prueba con vecinos minables, un paso recto pasó de 59 a 6 lecturas y de 9 a 0 cálculos de herramientas ajenas a ese paso.

## Seguimiento y cámara

En caminatas secas se mira hasta 3.2 bloques por delante, entre un máximo de seis puntos de ruta. Solo se omiten puntos intermedios de caminar: un barrido de la huella real de 0.6 bloques comprueba cuerpo, cabeza y todos los apoyos cruzados en el mundo actual. No se saltan acciones de minería, colocación, saltos, caídas ni nado, y no se cortan esquinas con paredes o suelo desconocido. El punto inicial es una referencia, no obliga a volver a su centro si ya existe un corredor seguro hacia delante.

La llegada global de un `goto` seco puede detenerse de forma natural dentro del bloque correcto, a un máximo de 0.45 bloques del centro. Se predice la parada por inercia con el deslizamiento real del suelo y el umbral nativo por componente; también su posición de reposo debe quedar dentro del mismo bloque/radio y cada tramo de la huella debe tener apoyo completo, cabeza libre y terreno conocido. No exige el ajuste fino A/D hacia el centro del cuadro blanco. El cambio no relaja la llegada de acciones precisas, nado ni puntos parciales: esas reglas y la confirmación de minería/puentes siguen independientes. Sin datos de momento nativo se conserva la llegada precisa anterior.

La navegación conserva la inclinación vertical de la cámara y permite avanzar con un pequeño margen de orientación horizontal, sin perseguir correcciones menores de unos 0.025 radianes. Minar y colocar siguen exigiendo apuntado preciso. El adaptador comprueba los ángulos nativos después de girar, para no añadir un tick parado cuando el giro ya se aplicó. El modo de ratón calibra con un movimiento pequeño y espera respuesta nativa antes de enviar otro, evitando acumular giros retrasados. El sprint nativo se mantiene en los corredores claros y se desactiva cerca de maniobras; no se aumenta la velocidad física del jugador.

La cámara sigue la dirección del tramo caminable, no el centro del siguiente cuadro blanco. Los desvíos laterales se corrigen con pulsos A/D nativos, amortiguados según la inercia horizontal real. El rumbo cambia en las curvas reales; saltar, nadar, minar y colocar conservan su apuntado específico. Cada pulso se calcula una sola vez por input nativo y se reutiliza tanto en el envío como en la aplicación local, sin modificar inputs antiguos durante la reconciliación.

Antes de aplicar una corrección se comprueba la envolvente del siguiente paso: velocidad observada, yaw real, factor de movimiento y deslizamiento del bloque leídos del motor, con margen conservador para sprint. Dos barridos de la huella cubren la envolvente acotada, incluyendo la inercia; comprobar solo la línea al objetivo no bastaría para un A/D digital. Si faltan estas capacidades, el desplazamiento es demasiado grande o aparece un apoyo inseguro, el input se neutraliza y se activa sneak nativo. Esta protección cubre caminata seca sobre apoyo entero; no sustituye la física del juego ni garantiza resistir impulsos externos arbitrarios.

Si el jugador comienza parcialmente sobre un borde, solo puede recentrarse agachado hacia dentro de su misma celda, con apoyo completo y cuerpo/cabeza libres. Se utilizan movimientos delante/atrás y A/D según la orientación actual, sin girar la cámara hacia el centro. Los vecinos bajo su huella deben ser conocidos, sin líquidos ni peligros. Esta recuperación tiene un límite de 2.5 segundos y nunca autoriza caminar sobre un puente no confirmado. Los corredores que siguen siendo inseguros activan espera/reintentos limitados, no una búsqueda nueva sin fin. Pequeños errores de redondeo de Y se normalizan únicamente cuando el motor confirma contacto con el suelo y están a menos de 0.01 bloques de una altura entera.

El historial de excavación descarta como apoyo un bloque que ya se previó minar en esa misma ruta, incluso al calcular saltos ascendentes. No se usa una copia completa del mundo como clave de cada nodo: ciertas alternativas con distinto historial de excavación pueden combinarse, así que la revalidación en vivo sigue siendo necesaria.

Limitaciones deliberadas: no navegar por lava, cercas, postes estrechos ni soportes a alturas fraccionarias; no saltos largos/diagonales, parkour avanzado, esquemas de construcción ni escalada. Construir requiere materiales y permisos reales del servidor. El planificador busca el menor coste dentro de su modelo y del terreno conocido, no garantiza la mejor ruta global ni resolver obstáculos arbitrariamente grandes. Minar puede tardar o estar prohibido por el servidor; no mueve materiales ni herramientas desde el inventario principal a la hotbar.

## Visualización de rutas

La ruta confirmada es verde y la mejor ruta provisional es azul/cian. Los bloques previstos para minar se marcan en rojo, los soportes para colocar en naranja, la meta en amarillo, el punto intermedio en violeta y el siguiente paso en blanco. El visualizador funciona en el mundo 3D, no como una línea superpuesta en HTML. Está activado por defecto y se puede ocultar independientemente de la navegación.

Usa constructores, geometrías y materiales básicos del motor actual para añadir únicamente objetos propios a su escena. Prefiere tiras de triángulos frente a líneas finas y mantiene una capa tenue visible tras los bloques. No crea contextos WebGL ni otro renderer, no intercepta la cámara ni cambia el render del mundo. Se reutilizan buffers/materiales, se limita el dibujo a 512 puntos y 64 marcas de interacción, y se actualizan los datos como máximo cada 250 ms. Ocultar/parar retira sus objetos; destruir el módulo o cambiar de escena libera solamente sus recursos. La recarga independiente del visualizador sustituye la instancia anterior sin detener el movimiento. Si falla la visualización, la navegación continúa y el diagnóstico visual recoge el problema.

## Comandos y diagnóstico

```text
/baritone goto <x> <y> <z>
/baritone follow <jugador>
/baritone mine <x> <y> <z>
/baritone place <x> <y> <z> [slot 1-9]
/baritone jump
/baritone automine on
/baritone automine off
/baritone autoplace on
/baritone autoplace off
/baritone renderpath on
/baritone renderpath off
/baritone stop
/baritone status
```

`Baritone.debug()` devuelve capacidades, métodos resueltos, modo de input, estado de cámara, motivo de espera/fallo, meta global, punto intermedio, desvío para respirar, recuperación de apoyo, herramienta, precálculo, resultado de búsqueda y diagnóstico visual (buffers, escena, material y contadores de render). `setAutoPlace()` y la configuración `autoPlace` permiten desactivar los puentes (activos por defecto si hay materiales). `setShowPath()` y `showPath` controlan el dibujo. La API y los eventos públicos existentes se conservan. Desactivar, cambiar de mundo/jugador, perder el contexto o recargar el módulo libera controles, interacción, selección temporal, hooks y búsquedas. No sustituye el renderer del mundo.

No existe una API cliente pública e inmutable para estas operaciones: el adaptador reconoce capacidades y firmas semánticas, pero una actualización que cambie el comportamiento del motor aún puede requerir mantenimiento. En ese caso se debe detener y mostrar el diagnóstico, no ejecutar métodos arbitrarios.

## Verificación

Pruebas automatizadas en `tests/baritone-*.test.cjs`: rutas en mundos simulados, comparación A*/Dijkstra, presupuesto/cancelación, costes de herramientas, caché de búsqueda, rutas provisionales, escalones excavados, precálculo, métodos renombrados, input enviado antes de aplicación, reconciliación, cámara, minería, colocación y restauración de otros hooks. También incluyen recorridos de 320 bloques por fronteras cargadas, túneles sin paso lateral, puentes con raycast geométrico desde la cámara y nado/recuperación de aire con física basada en el código nativo. `baritone-steering.test.cjs` combina los módulos reales con aceleración e inercia horizontales simuladas, sin teletransportar al jugador a puntos de ruta: cubre giros, sprint, esquinas, pasillos estrechos, recuperación de apoyo y cambios del mundo. El visualizador se verifica con objetos nativos simulados: reutilización de recursos, límites, ocultación, limpieza y fallo no fatal. Estas pruebas no equivalen a una partida multijugador real ni verifican la apariencia en una GPU real. Probar primero en un mundo propio y mantener `/baritone stop` disponible.
