# Baritone: integración y límites

Investigación del 4 de octubre de 2026. Fuente primaria: [Miniblox](https://miniblox.io/) y el [JavaScript del juego publicado en esa fecha](https://miniblox.io/assets/index-BJaj5B1H.js). El hash de ese archivo NO está integrado en el módulo.

## Arquitectura

`MovementAPI.js` sigue siendo el intermediario de hooks compartido con Auto Sprint, Safe Sneak y AntiAFK. `BaritoneAdapter.js` concentra la integración con el motor; `BaritonePlanner.js` calcula rutas; `Baritone.js` gestiona tareas, progreso y cancelación. El cargador declara las dependencias antes del módulo en `mirror.json`.

| Capacidad | Integración verificada en el motor actual | Protección |
| --- | --- | --- |
| Movimiento | Recolección nativa de `currentInput`, cola `pendingInputs`, envío nativo y aplicación local | Modificar direcciones del mensaje original antes del envío; conservar clase protobuf, secuencia, posición, ACK, uso del ítem y reconciliación |
| Salto/correr/agacharse | Flags del input nativo y `setSprinting` | Sin escribir velocidad, posición ni enviar paquetes propios |
| Cámara | Controles de orientación verificables o evento `mousemove` nativo con realimentación | No asumir `camera.parent.parent`; comprobar ángulos reales |
| Coordenadas de bloques | `BlockPos` nativo derivado de posiciones del motor | No pasar un objeto genérico que el motor interpreta como aire |
| Chunks cargados | `chunkProvider.isLoaded` o `world.isBlockLoaded` con XYZ válidos | Nunca generar chunks ni considerar aire el terreno desconocido |
| Bloques/colisiones | Estado nativo, `getBlock`, material, dureza y caja de colisión | Distinguir líquidos, aire, bloques rompibles y peligros; no depender de IDs fijos |
| Romper | Controlador nativo: pulsación, progreso de minería y liberación | Exigir objetivo enfocado y alcance nativo; esperar confirmación del mundo |
| Colocar | Clic derecho nativo contra la cara de un vecino | Verificar destino de la cara, bloque en inventario y espacio reemplazable |
| Hotbar | `inventory.currentItem` y selección visible | Slots 1–9; las acciones nativas sincronizan la selección |
| Jugadores | Entidades que el servidor ya envió al cliente | Posiciones actuales/últimas conocidas; no inventar información no recibida |

La dirección nativa es `(-sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))`: mirar a un objetivo requiere `atan2(-dx,-dz)` para yaw y `atan2(dy,hypot(dx,dz))` para pitch. El módulo anterior invertía Z.

## Rutas

A* incremental: hasta 4 ms/160 expansiones por ciclo de lógica, con límites globales de nodos y tiempo. Los costes favorecen caminar frente a saltar, caer o minar. Se validan cuerpo, cabeza, soporte, esquinas diagonales, saltos de un bloque, huecos cardinales de un bloque y caídas de hasta tres bloques. La minería automática solo modifica los obstáculos concretos incluidos en una ruta.

El siguiente tramo se vuelve a validar ante cambios del terreno. Los atascos excluyen tramos fallidos y provocan una nueva búsqueda con reintentos limitados. Una ruta parcial no se presenta como llegada al objetivo. Una posición próxima solo es válida como objetivo ajustado si está conocida y dentro del radio declarado.

Limitaciones deliberadas: no navegar por líquidos, cercas, postes estrechos ni soportes a alturas fraccionarias; no construir puentes automáticamente; no saltos largos/diagonales, parkour avanzado ni escalada. El planificador busca el menor coste dentro de su modelo y del terreno conocido, no garantiza la mejor ruta global en un mundo que aún no se ha cargado. Minar puede tardar o estar prohibido por el servidor.

## Comandos y diagnóstico

```text
/baritone goto <x> <y> <z>
/baritone follow <jugador>
/baritone mine <x> <y> <z>
/baritone place <x> <y> <z> [slot 1-9]
/baritone jump
/baritone automine on
/baritone automine off
/baritone stop
/baritone status
```

`Baritone.debug()` devuelve capacidades, métodos resueltos, modo de input, estado de cámara, motivo de espera/fallo y resultado de búsqueda. La API y los eventos públicos existentes se conservan. Desactivar, cambiar de mundo/jugador, perder el contexto o recargar el módulo libera controles, interacción, hooks y búsquedas. No modifica el renderer del mundo.

No existe una API cliente pública e inmutable para estas operaciones: el adaptador reconoce capacidades y firmas semánticas, pero una actualización que cambie el comportamiento del motor aún puede requerir mantenimiento. En ese caso se debe detener y mostrar el diagnóstico, no ejecutar métodos arbitrarios.

## Verificación

Pruebas automatizadas en `tests/baritone-*.test.cjs`: rutas en mundos simulados, comparación A*/Dijkstra, presupuesto/cancelación, métodos renombrados, input enviado antes de aplicación, reconciliación, cámara, minería, colocación y restauración de otros hooks. Estas pruebas no equivalen a una partida multijugador real. Probar primero en un mundo propio y mantener `/baritone stop` disponible.
