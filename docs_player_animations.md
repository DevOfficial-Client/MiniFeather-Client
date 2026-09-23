# Documentación: Sistema de Animaciones de Jugador (EMF + FA+Player + Miniblox)

> Investigación completa para portar las animaciones estilo "Fresh Animations" al cliente de MiniFeather.
> Fuentes: mod **Entity Model Features (EMF)** v2.x (Java), resource pack **FA+Player v1.1**, e inspección en vivo de miniblox.io con Puppeteer.

> **ACTUALIZACIÓN (pack activo)**: el pack embebido en `src/PlayerAnims/EMFPack.js` es ahora
> **DetailedAnimationsReworked V1.15 PATCH** (generado por `playground/make_dar_pack.js`).
> Diferencias clave con FA+:
> - **Semántica ADITIVA**: las fórmulas leen la pose vanilla y devuelven `vanilla + delta`
>   (`"body.rx": "body.rx + var.body_rx"`) — no hay ángulos totales pre-computados.
>   El store virtual expone la pose vanilla REAL del rig Miniblox; la aplicación final
>   absoluta equivale a vanilla + delta sin duplicar el yaw del juego.
> - Un solo `player.jem` con TODAS las animaciones inline (walk, sprint, sneak, jump, fall,
>   hoprun, swim, glide, levitate, climb, flaming/boiling, sneaky-dance) + partes cloak/ear.
> - Variables de entorno nuevas soportadas en `ENV`: `is_sitting`, `is_burning` (via
>   `ent.isBurning()`), `is_wet` (false), `fluid_depth` (inWater?2:0), `is_climbing`
>   (`ent.isOnLadder()` del decompilado de miniblox.io).
> - Fakes de FA+ eliminados del store (sneak MC fingido, body.ry=0): con semántica aditiva
>   romperían el cálculo (DAR detecta sneak por `is_sneaking`, no por igualdad de pose).

---

## Parte 1: Cómo funciona EMF (Entity Model Features)

EMF es un mod de Minecraft que permite reemplazar modelos y animaciones de entidades vía resource packs, usando el formato CEM de OptiFine (`.jem`/`.jpm`) extendido con un motor de fórmulas matemáticas.

### 1.1 Formato `.jem` (modelo de entidad)

```json
{
  "texture": "ruta/textura.png",
  "textureSize": [64, 64],
  "shadow_size": 1.0,
  "models": [
    {
      "part": "head",           // parte vanilla a reemplazar/adjuntar
      "id": "head",             // id referenciable en animaciones
      "invertAxis": "xy",       // ejes a invertir: "x","y","z","xy","xyz"
      "translate": [0, -24, 0], // posición en píxeles (1/16 bloque)
      "rotate": [0, 0, 0],      // rotación en GRADOS (se convierte a rad)
      "boxes": [
        {
          "textureOffset": [0, 0],          // UV box-format [u,v]
          "coordinates": [-4, 24, -4, 8, 8, 8], // x,y,z,w,h,d
          "sizeAdd": 0.25                   // dilatación (capa de ropa)
        }
      ],
      "submodels": [ /* hijos recursivos */ ],
      "animations": [
        { "head.rx": "torad(head_pitch) * -1 + sin(age*0.1)*0.05" }
      ]
    }
  ]
}
```

**Reglas del formato:**
- `invertAxis` afecta: `translate` (nega cada eje listado), `rotate` (nega + grados→rad), `coordinates` de boxes (`-coord - size`, espejo real).
- `textureOffset` (box UV) y UVs por cara (`uvNorth` etc.) son mutuamente excluyentes.
- `sizeAdd` → `sizesAdd [x,y,z]` → `sizeAddX/Y/Z` en orden de precedencia inverso (el más específico gana si está definido).
- Un elemento con `"model": "archivo.jpm"` carga un archivo externo que rellena los campos vacíos del inline (lo inline gana).
- `attach: false` (default) = reemplaza los cubos vanilla; `attach: true` = añade sin borrar.

### 1.2 Animaciones: fórmulas matemáticas por frame

Todo el sistema es **expresiones matemáticas** evaluadas secuencialmente cada frame. No hay keyframes del estilo Blockbench.

**Claves** (`lado izquierdo`): `"<parte>.<variable>"`

| Variable | Significado |
|---|---|
| `tx, ty, tz` | posición del bone (píxeles de modelo) |
| `rx, ry, rz` | rotación (radianes) |
| `sx, sy, sz` | escala |
| `visible` | bool |

**Prefijos de parte:** `this` (la parte actual), `part` (la vanilla), `root`, ids custom, jerárquicos `padre:hijo`, y `render.*` (shadow_size etc.), `var.*`/`varb.*` (variables de entidad persistentes), `global_var.*`.

**Funciones** soportadas: `sin cos tan asin acos atan atan2 abs floor ceil round log exp sqrt pow fmod frac signum torad todeg max min clamp lerp random randomb if ifb in between equals print catch` + EMF: `nbt(key,test) keyframe keyframeloop wrapdeg wraprad degdiff raddiff` + curvas: `catmullrom hermite cubicbezier quadbezier` + ~24 easings (`easeinoutexpo`, etc.)

**Semántica crítica para el intérprete JS:**
1. **Booleanos**: `true = +Infinity`, `false = -Infinity`. `if(cond, a, b)` y `&&/||` trabajan con eso.
2. `&&` y `||` tienen **la misma precedencia**, asociativos a izquierda.
3. **Sin operador `^`** (usar `pow(x,y)`).
4. Menos unario: `-var.x` registra variable negada.
5. `!` prefijo invierte booleanos.
6. **Orden de evaluación secuencial**: las líneas se ejecutan en orden de definición; `var.x` escrita en una línea es legible por las siguientes **en el mismo frame**; si se lee antes de escribirse, devuelve el valor del frame anterior.
7. `this`/`part` se sustituyen textualmente antes de parsear; espacios eliminados.

**Variables de entorno disponibles (proveedores):**

| Variable | Fuente en Miniblox |
|---|---|
| `limb_swing` | `entity.limbSwing` |
| `limb_speed` | lerp(prevLimbSwingAmount, limbSwingAmount, partialTicks), clamp 0..1 |
| `frame_time` | `game.delta` |
| `age` | `entity.ticksExisted + partialTicks` (wrap 27720) |
| `head_pitch` | `entity.pitch` (grados, N = mirar arriba) |
| `head_yaw` | `entity.yaw - renderYawOffset` (grados, clamp ±90) |
| `swing_progress` | `punchingT` del mesh |
| `hurt_time` | `entity.hurtTime` |
| `is_sneaking` | `entity.sneak` |
| `is_sprinting` | `entity.isSprinting()` |
| `is_swimming` | `entity.inWater && pitch < ~0.6rad |
| `is_gliding` | `entity.isElytraFlying()` |
| `is_on_ground` | `entity.onGround` |
| `is_child` | false (no babies) |
| `pos_x/y/z` | `entity.pos` |
| `rot_x/y` | pitch/yaw (rad) |
| `health` | 20 (visual) |
| `distance` | dist al player local |
| `is_using_item` | `entity.isUsingItem()` |
| `is_blocking` | `entity.isBlocking()` |
| `is_riding` | `entity.ridingEntity != null` |
| `is_first_person_hand` | false (v1) |
| `frame_counter` | contador propio |

### 1.3 El pack FA+Player v1.1 (el ejemplo real)

Estructura (todos en `emf/cem/`):

```
player.jem                 ← modelo + combinación de capas
a_player_variables.jpm     ← "cerebro": calcula ~130 variables de estado
a_player_idle.jpm          ← capa idle (respiración, sway de cabeza)
a_player_equipment.jpm     ← capa ítems (swing, equipar, arco, escudo)
a_player_movement.jpm      ← capa movimiento (caminar, correr, saltar, nadar, elytra)
a_player_firstperson.jpm   ← pose de primera persona
elytra.jem / player_cape.jem / armor jems
player.properties          ← 4 reglas para dirección de trepa (ladder facing)
```

**Arquitectura en capas** (patrón clave):

```
a_player_variables.jpm  →  escribe var.idl_*, var.mvmnt_*, ...
                          (detecta estado: sneaking, sprint, jump, fall, land, water, swim, climb, glide, fly, idle)
player.jem              →  combina:  body.rx = idl_bodyrx + mvmnt_bodyrx + udrwtr_bodyrx + vrtcl_bodyrx + fly_bodyrx + eqp_bodyrx
                          y aplica:  body.rx = var.body_rx
```

**El patrón de física suavizada** (aparece ~40 veces en variables.jpm):

```
var.yaw_drag = if( varb.fcc, var.yaw_drag,
                   1, objetivo * min(1, frame_time*k) + var.yaw_drag * max(0, 1 - frame_time*k) )
```

donde `varb.fcc` (frame counter check) congela el cálculo si el frame no avanzó, `objetivo` es el valor deseado, y `k` la velocidad de respuesta. Es un lerp exponencial dependiente del framerate.

**Detección de acciones vanilla**: el pack detecta poses vanilla exactas (puntería de arco, charge de ballesta, lanza) comparando ángulos con `between(var.rarm_rx, -pi-0.05, -pi+0.05)`. En Miniblox eso no existe — el propio juego ya setea la pose del arma (ver render() vanilla), así que v1 puede leer el estado del mesh en su lugar.

---

## Parte 2: El modelo del jugador en Miniblox (inspección en vivo)

### 2.1 Jerarquía del rig (verificado con Puppeteer)

```
gameScene.entityMeshes (Group)
└── LF (root del jugador, clase con 94 props) ← .render() se llama cada frame (~75fps)
    ├── .entity → _P (PlayerEntity: pos, yaw, pitch, limbSwing, sneak, punching, inventory, ...)
    ├── .skeleton (Group, y=1.5) ← pivote global del cuerpo
    │   ├── rotYaw/rotPitch (quaternions suavizados)
    │   ├── neck (Object3D, y=-0.07)  ← .quaternion = rotYaw
    │   │   └── headPivot (Group)     ← .quaternion = rotPitch
    │   │       └── meshes.head (Mesh vi)
    │   └── body (Group, y=-0.45)     ← torso raíz del walk cycle
    │       ├── meshes.torso, arms, legs (6 meshes 'vi')  [visibles=false si skinnedBody]
    │       ├── leftShoulder (Object3D, x=-0.38, y=-0.15, rot.z=-0.05)
    │       │   └── leftElbowJoint (y=-0.3) → hand mesh
    │       ├── rightShoulder (x=+0.38, rot.z=+0.05)
    │       │   └── rightElbowJoint → hand mesh
    │       ├── leftHip (x=-0.13, y=-0.8)
    │       │   └── leftKneeJoint (y=-0.4)
    │       ├── rightHip (+0.13, y=-0.8)
    │       │   └── rightKneeJoint
    │       └── elytraMesh (INe: leftWing/rightWing)
    ├── .skinnedBody (SkinnedMesh, 432 verts)  ← skin moderna (10 bones)
    ├── .skinnedArmor (Objeto de SkinnedMeshes)
    ├── .nameTag, .capeMesh, .hatMesh, .backpackMesh
    └── .model, .armorMesh, .wornGeometry, .lodBody, .lodArmor
```

**Importante**: hay DOS renderizadores: el rig de Groups (meshes `vi` clásicos) y el `skinnedBody` (SkinnedMesh con 10 bones idénticos a los joints). Ambos se animan con las mismas fuentes (shoulders/hips/elbows/knees), ya que el skinnedBody comparte los Object3D del rig.

### 2.2 El walk cycle vanilla (descompilado del render() del juego)

```js
// llamado cada frame por jugador visible
render() {
  // 1. nameTag, hurt tint, posición+yaw (slerp .1), LOD
  // 2. sneak: skeleton.position, torso.rotation.x=-PI/8, hombros -.4, caderas bajas
  // 3. idle sway: shoulders += cos(f*0.09)*0.05
  // 4. riding: hips.rotation.x = PI/2
  // 5. glideAmount lerp → rotación del skeleton en mundo
  // 6. SPECTATOR check, elytra visible
  // 7. punchingT: 0→1 a delta*4; arm.rotation = (-cos(T*2PI)+1)/2
  // 8. weaponConfig: brazo derecho a PI/2+pitch
  // 9. usingItem/eating: PI/3; blocking: PI/4
  // 10. walk cycle:
  m = isSprinting(); v = limbSwing - limbSwingAmount*(1-partialTicks);
  w = cos(v*0.6*(m?1.1:1));  T = cos(v*0.6+PI);
  p = limbSwingAmount clamped (0.5 si sneak)
  leftHip.rx  = T * y_amp * p;   rightHip.rx = w * y_amp * p;
  knees = -(e+1)/2 * p * b - (p>0.1 ? PI/12*p : 0)
  leftShoulder.rx = w * p * x;   rightShoulder.rx = T * p * x;
  elbows = (e+1)/2 * p * 0.5 + (m ? PI/6*p : 0)
}
```

### 2.3 Punto de hook verificado

`lf.render` se llama ~75 veces/seg (una por frame de render por jugador visible). Wrapper del prototype:

```js
const proto = Object.getPrototypeOf(playerRoot); // nivel 1: render, applyEmote, swingArm...
const orig = proto.render;
proto.render = function(...args) {
  const r = orig.apply(this, args);
  MF_PlayerAnims.apply(this, game); // AÑADIR rotaciones EMF encima de la pose vanilla
  return r;
};
```

Correr **después** del vanilla garantiza: no peleamos con el juego (no sobreescribe), heredamos sneak/ride/glide ya aplicados, y podemos leer el estado (punchingT, glideAmount) post-cálculo. Las rotaciones EMF se aplican como **aditivas** (`bone.rotation.x += emfValue`), no absolutas.

### 2.4 Fuentes de datos (todas verificadas en vivo)

| Dato | Fuente | Notas |
|---|---|---|
| game.delta | `game.delta` (s) | frame_time |
| partialTicks | `entity.getPartialTicks()` | |
| limbSwing(±Amount) | `entity.limbSwing`, `.limbSwingAmount`, `.prevLimbSwingAmount` | walk |
| sneak/sprint | `entity.sneak`, `entity.isSprinting()` | |
| glide | `entity.isElytraFlying()`, mesh.glideAmount | |
| attack | `mesh.punchingT` / `leftPunchingT` | 0→1 |
| emote | `mesh.emoteAmount`, `mesh.blendingEmote` | el juego ya lo anima |
| item en mano | `mesh.item` / `entity.inventory.main[currentItem]` | nombre via `.getItem()?.name` |
| using/blocking | `entity.isUsingItem()`, `entity.isBlocking()` | |
| elytra equipada | `entity.eljVSdQnIyHtwVz()` (armor[1].name === 'elytra') | |
| hurt/death | `entity.hurtTime`, `.deathTime` | |
| water | `entity.inWater` | |
| otros jugadores | `game.world.entities` (Map) → clase `_P` | |
| skin | `entity.profile.cosmetics.skin` | skinny: `skinManager.skins[i].skinny` |

---

## Parte 3: Plan de implementación v1

### 3.1 Arquitectura del módulo `MF_PlayerAnims`

```
src/PlayerAnims/
├── MF_PlayerAnims.js      ← orquestador: hook de render, loop por jugador, API pública
├── EMFParser.js           ← parser .jem/.jpm → estructura de partes + líneas de animación
├── EMFExpr.js             ← tokenizer + parser + evaluador de expresiones (MathExpressionParser port)
├── EMFRuntime.js          ← proveedores de variables (entity→vars), escritura a bones
└── packs/fa_player/       ← el port del pack FA+ adaptado a Miniblox (assets del pack original)
```

### 3.2 Mapeo de partes EMF → rig Miniblox

| Parte EMF (FA+) | Objeto en el rig Miniblox | Ejes |
|---|---|---|
| `root` | `skeleton` | t: 1/16 bloque → unidad (÷16); r: rad directo |
| `body` | `body` (torso Group) | t, r |
| `head` | `headPivot` (no `neck`, que ya lleva el yaw del cuerpo) | t, r |
| `right_arm` | `rightShoulder` | t, r |
| `left_arm` | `leftShoulder` | t, r |
| `right_leg` | `rightHip` | t, r |
| `left_leg` | `leftHip` | t, r |
| `right_arm:elbow` / `left_arm:elbow` | `*ElbowJoint` | **EXCLUIDO v1 — congelados a 0** (ver 3.2.1) |
| `right_leg:knee` / `left_leg:knee` | `*KneeJoint` | **EXCLUIDO v1 — congelados a 0** (ver 3.2.1) |
| `headwear/jacket/...` | (skinnedBody: no existen como nodos separados) | ignorar en v1 |

Notas:
- El rig usa **unidades de bloque** (0.25 = 4px). EMF usa píxeles: `t_px = t_EMF / 16`.
- El skinnedBody comparte los mismos Object3D → animar el rig anima ambas representaciones.
- La orientación del jugador la maneja `rotYaw/rotPitch` (slerp). Las animaciones EMF de `head.ry` etc. son relativas al cuerpo — aplicar sobre `headPivot` funciona.
- `root.ty` de FA+ baja el root al agacharse — usar `skeleton.position.y` (el juego ya lo baja .2 al sneak; nuestra capa es aditiva).

### 3.2.1 Codos y rodillas: congelados a 0 (decisión de diseño, requisito del usuario)

**v1 NO anima codos ni rodillas.** Como `src/Render/VanillaAnimations.js`, los 4 joints se congelan a rotación 0 cada frame, para que las extremidades queden rectas (estilo vanilla clásico) en vez de dobladas por el walk cycle de Miniblox:

- **Joints**: `leftElbowJoint`, `rightElbowJoint`, `leftKneeJoint`, `rightKneeJoint` (misma lista `JOINT_NAMES` que VanillaAnimations.js).
- **Técnica**: idéntica a VanillaAnimations.js —
  1. Cero directo: `joint.rotation.x = joint.rotation.y = joint.rotation.z = 0` en cada frame de animación.
  2. Congelación dura (defensiva): wrap de `joint.updateMatrixWorld` que fuerza rotación a 0 antes de recomputar la matriz (flag `_mfFrozen`, mismo patrón de `_mfOrigUpdateMatrixWorld`).
- **Dónde se aplica**: dentro del hook `proto.render` (después del vanilla y de la capa EMF), que ya corre una vez por jugador por frame — reemplaza al loop RAF propio de VanillaAnimations.js, misma garantía con menos código.
- **Coexistencia**: la operación es idempotente (setear 0 dos veces = 0), así que si VanillaAnimations.js también está activo no hay conflicto.
- **En el parser**: al cargar el pack, las líneas de animación cuyo destino sea `*:elbow` / `*:knee` se filtran y se loguean como omitidas (FA+ anima codos en equipment/firstperson — esas capas quedan sin efecto en esos joints).
- **Toggle off**: al desactivar PlayerAnims se restauran los `updateMatrixWorld` originales (unfreeze) igual que hace VanillaAnimations.js, y el juego vuelve a doblar codos/rodillas.

### 3.3 Pipeline por frame (por jugador visible)

```
proto.render() [vanilla]          ← pose vanilla completa
  ↓
MF_PlayerAnims.apply(mesh, game):
  1. ctx = perEntityCtx(entityId)  ← mapa var./varb. persistente + frame guard
  2. SI frameCounter(entity) == ctx.lastFrame → return (evita doble aplicación)
  3. evaluateLines(variables.jpm)   ← escribe var.* (estado, drags, timers)
  4. evaluateLines(idle/movement/equipment) ← escribe var.<capa>_*
  5. evaluateLines(player.jem bloques finales) ← combina capas → escribe bone.rx/ry/...
  6. writeBones(rig)                ← rotation.x += emf.rx, position += emf.t/16
  7. freezeLimbs(mesh)              ← codos/rodillas a rotación 0 (patrón VanillaAnimations.js)
```

### 3.4 Port del pack FA+Player a Miniblox (adaptaciones)

El pack original tiene ~130 variables y 300+ líneas de animación. Para v1, port con estos cambios:

1. **Quitar detección de items vanilla** (`nbt(...)`, comparación de poses): el juego ya aplica las poses de arma. v1 mantiene solo las animaciones que añaden vida (idle, walk, sprint lean, jump, fall, land, sneak, swim, glide) — el swing/weapon ya lo maneja el juego y **no lo pisamos** (sería pelear con vanilla).
2. **Recalcular pivotes**: los pivotes FA+ (Blockbench, origen arriba) vs Miniblox (origen en cuello del torso). Conversión: `bone.ty_EMF(px) / 16` aplicado aditivamente al offset vanilla del joint correspondiente.
3. **Sprint lean**: FA+ usa `var.mvmnt_*` para inclinar el cuerpo al correr. Compatible directo (es aditivo).
4. **Elytra**: el juego ya anima `elytraMesh` (visible + flap con glideAmount). FA+ lo mejora, pero v1 la deja vanilla para no duplicar (v2: portar elytra.jem con el flap mejorado).
5. **Primera persona**: fuera de v1 (el juego tiene su propio renderHand).
6. **properties/climb direction**: sin ladders equivalentes verificadas; si hay ladder (bloque `ladder`), leer facing del bloque para trepar horizontal — v1 lo deja si el bloque existe en el mundo.

### 3.5 Sintaxis v1 del parser de expresiones (checklist)

- [x] Tokenizer: números, idents (`a.b`, `a:b`), operadores `+ - * / %`, comparadores `== != < > <= >=`, lógicos `&& ||` (misma precedencia, izq), paréntesis, coma, `!` prefijo, menos unario.
- [x] Booleanos ±Infinity; `if(c,a,b)`, `ifb`, `between`, `clamp`, `lerp`, `min/max`, `abs`, `sin/cos/tan/asin/acos/atan/atan2`, `sqrt`, `pow`, `floor/ceil/round`, `frac`, `torad/todeg`, `random([seed])`, `randomb`, `in`, `equals`, `signum`, `fmod`, `log`, `exp`, `catch`.
- [x] Constantes: `pi`, `e`, `true`, `false`.
- [x] Variables de parte (`head.rx` lectura), `var.*`, `varb.*`, `global_var.*`.
- [x] Sustitución textual `this`/`part` pre-parse; strip de espacios.
- [junto con 3.6] Proveedores de variables Miniblox (tabla 2.4).

### 3.6 Archivos nuevos y cambios

| Archivo | Acción |
|---|---|
| `src/PlayerAnims/MF_PlayerAnims.js` | NUEVO — hook + loop |
| `src/PlayerAnims/EMFParser.js` | NUEVO — parsea .jem/.jpm |
| `src/PlayerAnims/EMFExpr.js` | MathExpressionParser portado a JS (validación + compilación a closure) |
| `src/PlayerAnims/EMFRuntime.js` | Variables desde entity/mesh + escritura a bones |
| `src/PlayerAnims/packs/fa_player/*.jpm` | Copiados del pack original con adaptaciones (sin nbt, pivotes) |
| `manifest.json` | Añadir los 4 scripts |
| `src/UI/ClientPanel.js` | Toggle "Fresh Animations" (on por defecto) |
| `src/Chat/ClientCommands.js` | `/anim list/enable/disable/reload` |

### 3.7 Presupuesto de rendimiento

- 8 jugadores × ~350 líneas de fórmula × 75fps = ~210k evals/s. Con closures pre-compiladas (parse 1 vez, eval como función nativa) es < 1ms/frame total. Sin JIT de bytecode, closures JS.
- Variables por entidad: 1 objeto plano (~150 claves). Frame guard por entity id.
- Fallback: si pack falla al cargar → revertir hooks y log.
- Kill switch: 3 errores de evaluación seguidos → desactiva esa línea para esa entidad (marca invalid, como EMF).

### 3.8 Tests de humo (con Puppeteer)

1. Cargar extensión + pack → 0 pageerrors.
2. Spawn 2 players → bones rotando en idle (sin T-pose).
3. Caminar/sprintear → lean + brazos alternando (diff rotaciones entre frames).
4. Sneak → pose baja (offset -0.2 en skeleton y).
5. Toggle off → bones exactamente vanilla (comparar snapshot).
6. Toggle on después de off → animaciones de vuelta.
7. FPS: medir antes/después con 8 jugadores (target: <5% de impacto).

### 3.9 Out of scope v1 (para v2+)

- Primera persona, armadura EMF completa, cape mejorada, elytra mejorada, ladders horizontales, random por textura/variante, P2P de animaciones (el P2P ya sincroniza mobs/emotes del MF_CustomModels; las de player van local por ahora, ya que cada cliente renderiza a su manera).
