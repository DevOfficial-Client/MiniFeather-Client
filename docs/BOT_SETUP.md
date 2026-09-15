# Guía Completa — MiniFeather Bot (SkinBot + Cuentas)

Bot de Discord que administra la DB de skins compartidas (`accounts.json` vía GitHub) y crea cuentas MiniFeather con contraseña vinculadas a Discord.

Todo el bot vive en `ai/discord_skinbot.py`.

---

## Índice

1. ~~[Crear el bot en Discord](#1-crear-el-bot-en-discord)~~ (falta 1.1 y 1.2)
2. ~~[Token de GitHub](#2-token-de-github)~~ ✅
3. ~~[Tu ID de Discord](#3-tu-id-de-discord)~~ ✅
4. [Invitar el bot a tu server](#4-invitar-el-bot-a-tu-server)
5. [Instalar y correr el bot](#5-instalar-y-correr-el-bot)
6. [Comandos /skin — DB de skins](#6-comandos-skin--db-de-skins)
7. [Comandos /mfaccount — cuentas](#7-comandos-mfaccount--cuentas)
8. [Problemas comunes](#8-problemas-comunes)
9. [Dejarlo 24/7](#9-dejarlo-247)

> **Estado:** aplicación creada, bot puesto privado (error del enlace resuelto), repo `mfaccs` público con semilla (verificado) y token de GitHub verificado.
> **Pendiente:** 1.1 (Reset Token → `MFSB_TOKEN`), 1.2 (Message Content Intent), 3 (tu ID), 4 (invitar), 5 (instalar y correr).

---

## 1. Crear el bot en Discord

> Necesitas: cuenta de Discord con permisos de administrador en un server.

1. ~~Abre **https://discord.com/developers/applications**~~
2. ~~Click en **"New Application"** (arriba a la derecha)~~
3. ~~Nombre: `MiniFeather Bot` (o el que quieras) → **Create Application**~~ ✅
4. ~~En el menú lateral izquierdo, entra a la pestaña **"Bot"**~~

### 1.1 Sacar el token del bot

5. Click en **"Reset Token"** → confirma con tu contraseña/2FA
6. Click en **"Copy"**

> ⚠️ **GUARDA ESTE TOKEN YA** — solo se muestra una vez. Si lo pierdes, resetéalo de nuevo.

Este es tu **`MFSB_TOKEN`**.

### 1.2 Activar intents

7. En la misma pestaña Bot, baja hasta **"Privileged Gateway Intents"**
8. Activa ✅ **Message Content Intent**
9. Click en **Save Changes**

### 1.3 (Recomendado) Bot privado

> ⚠️ **Si te sale el error** *"La aplicación privada no puede tener un enlace de autorización predeterminado"*:
> ve a la pestaña **"Installation"** del menú lateral → sección **"Authorization Method"** →
> desmárcala / ponla en **"Ninguno" (None)** → Save Changes → vuelve aquí.

10. En la pestaña **Bot**, sección **"Authorization Flow"**:
    - Desactiva ❌ **Public Bot** (para que nadie más pueda invitarlo)
    - Desactiva ❌ **Requires OAuth2 Code Grant**

---

## 2. Token de GitHub

El bot escribe `accounts.json` en el repo **`EstebanGrp/mfaccs`** con la API de GitHub. Necesita un token con permiso de escritura.

> 📌 Ese repo debe ser **público**: la extensión lo lee desde
> `raw.githubusercontent.com` sin autenticación. El token `?token=GHSAT0...`
> que GitHub agrega al URL del navegador es efímero (expira en minutos) —
> no sirve para nada fuera de tu sesión.

1. Abre **https://github.com/settings/personal-access-tokens/new**
   (Perfil → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token)
2. **Token name**: `minifeather-skinbot`
3. **Expiration**: elige la máxima (o custom 1 año)
4. **Resource owner**: `EstebanGrp`
5. **Repository access**: "Only select repositories" → selecciona **`mfaccs`**
6. **Permissions** → "Repository permissions" → busca **Contents** → selecciona **Read and write**
7. (Nada más necesita nada más)
8. **Generate token** → copia el token

> ⚠️ Solo se muestra una vez.

Este es tu **`MFSB_GH_TOKEN`**.

---

## 3. Tu ID de Discord

Para que solo tú puedas usar los comandos de admin.

1. En Discord: **Ajustes de usuario** (engranaje) → **Avanzado** → activa **Modo desarrollador**
2. Cierra ajustes
3. Click derecho sobre **tu propio nombre** en cualquier mensaje o lista de miembros
4. Click en **"Copiar ID de usuario"**

~~Este es tu **`MFSB_ADMINS`**.~~ ✅

**Admins (3):**

| Quién | ID |
|---|---|
| Tú | `1361713094916571177` |
| Bro 1 | `1443765152628473957` |
| Bro 2 | `1376242650302124062` |

```powershell
$env:MFSB_ADMINS="1361713094916571177,1443765152628473957,1376242650302124062"
```

---

## 4. Invitar el bot a tu server

Con el **Client ID** de tu aplicación (pantalla "OAuth2" del Developer Portal o "General Information"):

```
https://discord.com/oauth2/authorize?client_id=<TU_CLIENT_ID>&scope=bot+applications.commands&permissions=83968
```

1. Reemplaza `<TU_CLIENT_ID>` por el ID (ejemplo: `1549449146199707668`)
2. Pega el link en tu navegador
3. Selecciona tu server → **Autorizar**
4. El bot aparece en la lista de miembros (aparecerá offline hasta que lo corras)

> Permisos 83968 = Send Messages + Embed Links + Read Message History + Use Slash Commands. Suficiente.

---

## 5. Instalar y correr el bot

Abre **PowerShell** en el proyecto:

```powershell
cd C:\Users\etc\Desktop\MiniFeather-Client
```

### 5.1 Instalar dependencias (una sola vez)

```powershell
pip install discord.py requests
```

### 5.2 Setear las variables (cada vez que abras PowerShell nuevo)

```powershell
$env:MFSB_TOKEN="aqui_el_token_del_paso_1"
$env:MFSB_GH_TOKEN="aqui_el_token_del_paso_2"
$env:MFSB_ADMINS="tu_id_del_paso_3"
```

Opcionales:

```powershell
# restringir comandos a un canal específico ✅ (solo este canal)
$env:MFSB_CHANNEL="1549465150552023161"

# si tu repo es otro distinto del default (EstebanGrp/mfaccs)
$env:MFSB_REPO="tu_usuario/tu_repo"
```

### 5.3 Arrancar

```powershell
python ai/discord_skinbot.py
```

Salida esperada:

```
[SkinBot] repo: EstebanGrp/mfaccs@main · path: accounts.json
[SkinBot] SkinBot listo como MiniFeather Bot#XXXX — repo EstebanGrp/mfaccs@main
[SkinBot] canal autorizado: (todos) | admins: 1
```

El bot queda **online** en Discord. Los slash commands aparecen ~1 minuto después de la primera sincronización — escribe `/` en un canal y busca `/skin` y `/mfaccount`.

---

## 6. Comandos /skin — DB de skins

> Solo admins (`MFSB_ADMINS`). Edita `assets/accounts.json` en GitHub → todos los clientes de la extensión lo reciben en ≤5 min o al recargar.

| Comando | Qué hace |
|---|---|
| `/skin set` `player:juancito123` `skin:custom:mf_dev_nightrise` | Asigna skin a un jugador (por username o uuid) |
| `/skin seturl` `player:juancito123` `url:https://.../skin.png` | Asigna skin por URL de PNG |
| `/skin remove` `player:juancito123` | Quita el override |
| `/skin list` `page:1` | Lista paginada de toda la DB (15 por página) |
| `/skin reload` | Descarta cambios locales y re-descarga el remoto |
| `/skin sync` | Fuerza re-subida del archivo (crea commit) |

**Formatos válidos de skin:**

| Valor | Ejemplo |
|---|---|
| ID custom del client | `custom:mf_angrywolfx`, `custom:mf_dev_itzesteban` |
| Skin vanilla de Miniblox | `chris`, `bob`, `alice` |
| Ruta del pack /skins/ | `devs/itzesteban` o `devs/itzesteban.png` |
| URL absoluta | `https://raw.githubusercontent.com/.../skin.png` |

**uuid vs username:** mejor **uuid** (inmune a renombres). Cómo conseguirlo: ver el perfil del jugador en el juego, o F12 → red → respuestas con `"uuid"`. El bot acepta ambos como clave.

Cada comando genera un commit con mensaje `skinbot: set <jugador>` — historial completo visible en GitHub.

---

## 7. Comandos /mfaccount — cuentas

### Para cualquier usuario del server:

| Comando | Qué hace |
|---|---|
| `/mfaccount create` `username:pepito` `password:•••` | Crea la cuenta y la vincula a tu Discord automáticamente |
| `/mfaccount info` | Muestra tu cuenta: dueño, fecha de creación |

### Solo admins:

| Comando | Qué hace |
|---|---|
| `/mfaccount link` `username:pepito` `account:<discord_id>` | Vincula una cuenta a otro usuario de Discord |
| `/mfaccount unlink` `username:pepito` | Quita la vinculación |
| `/mfaccount passwd` `username:pepito` `password:•••` | Cambia la contraseña |
| `/mfaccount list` | Todas las cuentas con sus dueños |
| `/mfaccount delete` `username:pepito` | Elimina la cuenta |

**Reglas:**
- Username: 3-16 caracteres, solo `[a-z0-9_]`
- Contraseña: mínimo 6 caracteres
- Una cuenta por Discord a la vez (para otra, `unlink` primero vía admin)
- Las respuestas son **efímeras**: solo tú las ves

**Seguridad:**
- Contraseñas hasheadas con **PBKDF2-HMAC-SHA256, 200,000 iteraciones, salt aleatoria por cuenta**
- Se guardan en `ai/mf_accounts.json` **solo en la PC donde corre el bot** — jamás se sube al repo público
- Escritura atómica a disco (no se corrompe si se corta la luz)

> Estas cuentas son del ecosistema MiniFeather (identidad para skins/mesh), no loguean en los servers oficiales de Miniblox.

---

## 8. Problemas comunes

| Error | Causa | Solución |
|---|---|---|
| `Falta MFSB_TOKEN` | No seteaste la variable | Repite el paso 5.2 |
| `Improper token has been passed` | Token mal copiado o reseteado | Reset Token otra vez y actualiza `$env:MFSB_TOKEN` |
| `GitHub 401/403` | Token GH sin permiso o vencido | Regenera con Contents: Read and write |
| `GitHub 409` | Conflicto de SHA (otro cambio simultáneo) | `/skin reload` y reintenta |
| `/skin` no aparece | Commands aún sincronizando | Espera 1-2 min, o reinicia Discord (Ctrl+R) |
| Bot offline | El proceso no corre | Vuelve a `python ai/discord_skinbot.py` |
| `PrivilegedIntentsRequired` | Falta el intent del paso 1.2 | Activa Message Content Intent en el Developer Portal |
| `No autorizado` | Tu ID no está en admins | Verifica `$env:MFSB_ADMINS` |
| Repo equivocado | Default es `EstebanGrp/mfaccs` | `$env:MFSB_REPO="usuario/repo"` |

Logs: el bot imprime todo en la consola donde corre (`[SkinBot] ...`).

---

## 9. Dejarlo 24/7

El bot solo responde mientras el proceso corre. Opciones:

**A) Task Scheduler de Windows (tu PC, gratis):**
1. Win+R → `taskschd.msc`
2. Crear tarea → Disparador: "Al iniciar sesión" → Acción: iniciar programa `python`
3. Argumentos: `-c` con un script `.ps1` que setee las variables y lance `python ai/discord_skinbot.py`
4. Desmarca "Detener si se ejecuta más de..." en Ajustes

**B) Segundo plano simple (sesión actual):**
```powershell
Start-Process python -ArgumentList "ai/discord_skinbot.py" -WindowStyle Hidden
```
(con las variables ya seteadas en esa sesión)

**C) VPS / Raspberry:** copia la carpeta `ai/` + Python + deps, corre con `screen`/`systemd`.

**D) GitHub Actions (gratis, sin tarjeta, ~99.8% uptime) — recomendado:**

> El bot corre en la infraestructura de GitHub en vez de tu PC. Repo **público**
> = minutos ilimitados gratis. Un job corre ~5h50m; el cron cada 10 min +
> la cola de concurrencia encadenan el siguiente → casi siempre online
> (micro-corte de ~1 min cada ~6h).

1. **Repo privado para las cuentas** (las contraseñas hasheadas NO pueden
   ir en el repo público):
   - Crea `mfaccs-private` (Privado ✅) con un README o archivo cualquiera
   - Edita tu token fine-grained: Settings → Developer settings → Personal
     access tokens → `minifeather-skinbot` → **Repository access** → añade
     también `mfaccs-private` (mismo permiso Contents: Read and write)

2. **Sube el workflow** (ya está en `.github/workflows/skinbot.yml`):
   - El workflow vive en el repo de la DB (`mfaccs`) → copia ahí la carpeta
     `.github/` y el archivo `ai/discord_skinbot.py`

3. **Secrets** en `mfaccs` → Settings → Secrets and variables → Actions →
   New repository secret (uno por cada uno):

   | Secret | Valor |
   |---|---|
   | `MFSB_TOKEN` | token del bot de Discord |
   | `MFSB_GH_TOKEN` | token fine-grained (con AMBOS repos) |
   | `MFSB_ADMINS` | `13617...,14437...,13762...` |
   | `MFSB_CHANNEL` | `1549465150552023161` |
   | `MFSB_ACC_REPO` | `EstebanGrp/mfaccs-private` |

4. **Apaga el bot de tu PC** (dos instancias con el mismo token se
   patean del Gateway). Después en GitHub → pestaña **Actions** → workflow
   `skinbot` → **Run workflow** → corre el primero a mano.

5. Verifica: Actions → el job en verde con `[SkinBot] SkinBot listo...`
   en los logs, y el bot online en Discord.

> ⚠️ Nota honesta: esto usa Actions como "host permanente", que va contra
> el espíritu del ToS de GitHub (aunque no contra la letra). Riesgo: que
> algún día lo deshabiliten — migrable a VPS/Oracle cuando haya tarjeta.

> Si creaste cuentas con el bot corriendo local y luego migras a Actions:
> sube tu `ai/mf_accounts.json` al repo privado como `mf_accounts.json`
   (una sola vez, para no perderlas).

> Los cambios ya commiteados (skins asignadas) siguen funcionando aunque el bot esté apagado. Las cuentas nuevas sí necesitan el bot vivo.

---

## Resumen de archivos

| Archivo | Qué es | ¿Público? |
|---|---|---|
| `ai/discord_skinbot.py` | El bot completo | Sí (código, sin secretos) |
| `ai/mf_accounts.json` | Hashes de contraseñas + vínculos Discord | **NO — solo tu PC** |
| `assets/accounts.json` (GitHub) | Overrides de skins que ven todos | Sí (así debe ser) |
| Variables de entorno | Tokens y config | Nunca las subas a ningún lado |
