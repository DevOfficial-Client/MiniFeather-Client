# facial packs — mf studio

cómo usar el sistema de caras animadas de miniFeather studio.

- [español](#español)
- [english](#english)

---

## español

### qué es esto

es un sistema que le pone caras animadas a tu skin: la cara reacciona a dónde mirás, parpadea sola, y hasta levanta la ceja cuando alguien pregunta algo en el chat. las caras las dibujás vos con los sprites de tu propia skin.

### carpetas de packs

hay dos lugares donde viven los packs:

- `skins/facialskins/` — packs para skins que ya existen en el server (cat, alice, bob, aurora...). si te ponés una de esas skins, la cara animada se activa sola.
- `skins/mypacks/` — packs para skins tuyas que NO están en el server. estas se registran en el juego como skins nativas.

cada pack es una carpeta con un `pack.json` y los pngs:

```
skins/mypacks/mi-pack/
├── pack.json
├── mi-skin.png
├── alfrente.png
├── izquierda.png
├── derecha.png
├── mirando arriba.png
├── mirando abajo.png
├── ceja levantada.png
└── ojo cerrado.png
```

### el pack.json

```json
{
  "id": "mi-pack",
  "name": "mi pack",
  "author": "tu nombre",
  "version": 1,
  "uuid": "6eb7369a-551e-406a-9a63-6db7a358e1e5",
  "skin": "mi-skin.png",
  "sprites": {
    "front": "alfrente.png",
    "left": "izquierda.png",
    "right": "derecha.png",
    "up": "mirando arriba.png",
    "down": "mirando abajo.png",
    "brow": "ceja levantada.png",
    "blink": "ojo cerrado.png"
  }
}
```

campos:

| campo | obligatorio | qué hace |
|---|---|---|
| `id` | sí | tiene que coincidir con el nombre de la carpeta. si es una skin del server, con el id de la skin |
| `name` | no | nombre que se ve en la ui |
| `author` | no | tu nombre |
| `version` | no | número de versión |
| `uuid` | no | uuid de tu cuenta de miniblox. si coincide contigo, el pack se activa solo (y aplica su skin) aunque tengas otra puesta |
| `skin` | no | la skin completa. en mypacks se aplica al juego; en facialskins es solo referencia |
| `sprites.front` | sí | cara normal |
| `sprites.left` | sí | cara mirando a la izquierda |
| `sprites.right` | sí | cara mirando a la derecha |
| `sprites.up` | no | mirar arriba |
| `sprites.down` | no | mirar abajo |
| `sprites.brow` | no | ceja levantada (para el modo "?") |
| `sprites.blink` | no | ojos cerrados para parpadear |

si un sprite opcional no está, esa reacción queda desactivada (o se sintetiza sola, en el caso de la ceja).

### cómo dibujar los sprites

- `front`, `left`, `right`, `up`, `down` y `brow` son **franjas de 32x16** (o múltiplos: 64x32, 512x256...): la mitad izquierda es la cabeza base (32x16: top, bottom, frente y lados) y la derecha es la capa hat/overlay. se dibuja igual que en el editor del skin editor del juego.
- `blink` puede ser la franja completa **o solo la carita 8x8**.
- los nombres de los archivos son libres, los definís en el json.
- soporta cualquier resolución múltiplo de 64 (64x64, 128x128, 512x256, 1024x512...). las skins legacy 2:1 se convierten solas.

### cómo se usa en el juego

1. abrí el panel de miniFeather → **studio → mf facial**
2. pestaña **packs**: ves todos los packs builtin + los que importes
3. según el tipo:
   - **server**: ponete la skin desde el armario del juego y listo, la cara anima sola al detectar el id
   - **custom (mypacks)**: botón **usar skin** → se aplica por el conducto nativo del juego (el server nunca ve el id)
   - en cualquiera: botón **⚡ activar** fuerza el pack aunque la skin no coincida
4. pestaña **auto**: configurás los umbrales (grados de giro), qué preset usar en cada zona, el parpadeo y la ceja

### el modo 🤨 (ceja con "?")

en la pestaña auto, sección de parpadeo:

- **checkbox "levantar la ceja al ver un ?"**: lo activás y listo
- **ceja (opcional)**: elegís un preset, o si el pack trae `brow` se usa ese sprite
- **duración**: cuánto dura la ceja levantada (default 1.4s)

cuando aparece un mensaje nuevo en el chat con un `?`, la ceja se levanta por ese tiempo. sin sprite usa una sintetizada (sube la fila de cejas 1px).

### packs en zip

- **exportar**: botón 📤 en la pestaña packs → baja un zip con el pack.json + todos los pngs
- **importar**: botón importar zip → el pack se guarda en indexeddb, la skin se aplica al toque y queda disponible en todas las sesiones
- el zip puede tener todo en la raíz o en una subcarpeta, y los nombres son case-insensitive

### datos

- los packs importados viven en indexeddb (`minifeather_facialpacks`), no en archivos
- la config del modo auto va a localStorage
- nada se manda al server: las skins custom se aplican solo en tu cliente

---

## english

### what is this

it's a system that adds animated faces to your skin: the face reacts to where you look, blinks on its own, and even raises an eyebrow when someone asks something in chat. you draw the faces yourself using sprites from your own skin.

### pack folders

packs live in two places:

- `skins/facialskins/` — packs for skins that already exist on the server (cat, alice, bob, aurora...). if you equip one of those skins, the animated face turns on by itself.
- `skins/mypacks/` — packs for your own skins that are NOT on the server. these get registered into the game as native skins.

each pack is a folder with a `pack.json` and the pngs:

```
skins/mypacks/my-pack/
├── pack.json
├── my-skin.png
├── front.png
├── left.png
├── right.png
├── look up.png
├── look down.png
├── raised brow.png
└── eyes closed.png
```

### the pack.json

```json
{
  "id": "my-pack",
  "name": "my pack",
  "author": "your name",
  "version": 1,
  "uuid": "6eb7369a-551e-406a-9a63-6db7a358e1e5",
  "skin": "my-skin.png",
  "sprites": {
    "front": "front.png",
    "left": "left.png",
    "right": "right.png",
    "up": "look up.png",
    "down": "look down.png",
    "brow": "raised brow.png",
    "blink": "eyes closed.png"
  }
}
```

fields:

| field | required | what it does |
|---|---|---|
| `id` | yes | must match the folder name. if it's a server skin, match the skin id |
| `name` | no | name shown in the ui |
| `author` | no | your name |
| `version` | no | version number |
| `uuid` | no | your miniblox account uuid. if it matches you, the pack activates itself (and applies its skin) even if you're wearing another one |
| `skin` | no | the full skin. in mypacks it gets applied to the game; in facialskins it's just a reference |
| `sprites.front` | yes | normal face |
| `sprites.left` | yes | face looking left |
| `sprites.right` | yes | face looking right |
| `sprites.up` | no | look up |
| `sprites.down` | no | look down |
| `sprites.brow` | no | raised eyebrow (for the "?" mode) |
| `sprites.blink` | no | closed eyes for blinking |

if an optional sprite is missing, that reaction stays off (or gets auto-synthesized, in the brow's case).

### how to draw the sprites

- `front`, `left`, `right`, `up`, `down` and `brow` are **32x16 strips** (or multiples: 64x32, 512x256...): the left half is the base head (32x16: top, bottom, front and sides) and the right half is the hat/overlay layer. same layout as the game's skin editor.
- `blink` can be the full strip **or just the 8x8 face**.
- file names are up to you, you define them in the json.
- any resolution that's a multiple of 64 works (64x64, 128x128, 512x256, 1024x512...). legacy 2:1 skins get converted automatically.

### how to use it in game

1. open the miniFeather panel → **studio → mf facial**
2. **packs** tab: you'll see all builtin packs plus whatever you import
3. depending on the type:
   - **server**: equip the skin from the game's dressing room and that's it, the face animates on its own once the id is detected
   - **custom (mypacks)**: **use skin** button → it gets applied through the game's native pipeline (the server never sees the id)
   - either way: the **⚡ activate** button forces the pack even if the skin doesn't match
4. **auto** tab: configure the thresholds (turn degrees), which preset to use per zone, blinking and the eyebrow

### the 🤨 mode (brow on "?")

in the auto tab, blinking section:

- **"raise the eyebrow when seeing a ?" checkbox**: tick it and done
- **brow (optional)**: pick a preset, or if the pack ships a `brow` sprite that one gets used
- **duration**: how long the eyebrow stays raised (default 1.4s)

when a new chat message with a `?` shows up, the eyebrow raises for that time. without a sprite it uses a synthesized one (shifts the brow row up 1px).

### zip packs

- **export**: 📤 button in the packs tab → downloads a zip with the pack.json + all the pngs
- **import**: import zip button → the pack gets saved to indexeddb, the skin applies right away and it's available across sessions
- the zip can have everything in the root or a subfolder, and file names are case-insensitive

### data

- imported packs live in indexeddb (`minifeather_facialpacks`), not in files
- auto mode config goes to localStorage
- nothing gets sent to the server: custom skins only apply on your client
