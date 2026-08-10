<div align="center">

# 🪶 MiniFeather Client

### A lightweight, customizable browser client designed to enhance your experience on Miniblox.io.

![Version](https://img.shields.io/badge/version-v4.0.0-2563eb?style=flat-square)
![Status](https://img.shields.io/badge/status-active-16a34a?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Miniblox.io-7c3aed?style=flat-square)

</div>

---

## 📖 Overview

MiniFeather Client is a community-developed browser extension created to enhance the Miniblox.io experience with visual improvements, HUD modules, camera features, player customization, chat utilities, and quality-of-life features.

The client is designed to remain lightweight, configurable, and easy to use while continuing to receive compatibility updates, fixes, performance improvements, and new modules.

---

## 🆕 What's New in v4.0.0

### 📦 Item Physics

A new **Item Physics** module has been added to MiniFeather Client.

When enabled, dropped items receive improved client-side visual physics instead of keeping the same static orientation.

Item Physics adds:

- Natural spinning while items are moving through the air
- Different settling behavior depending on the item's visual shape
- Landing bounce and rotation response
- Wall collision spin response
- Smoother resting positions when items reach the ground
- More natural movement for flat and thin item models
- Visual physics without changing the item's native collision behavior

The module can be enabled or disabled from the **Rendering** section.

### 🫳 PatPat

PatPat adds a playful interaction for nearby players and living mobs.

When the module is enabled:

1. Look directly at a nearby player or living mob.
2. Hold **Shift**.
3. **Right-click** to pat the target.

The interaction includes:

- A pixel-style patting hand animation
- A short squash animation on the target model
- Native nametag movement that can follow the squash effect
- Randomized pat sounds
- Your normal hand swing animation
- Target visibility checks
- A short cooldown between pats

### PatPat Settings

Right-click the **PatPat** module to open its configuration.

#### Presets

- **Soft** – lighter and slower movement
- **Normal** – balanced default behavior
- **Strong** – stronger squish and push effects
- **Extreme** – maximum preset intensity
- **Custom** – used automatically when manual values no longer match a preset

#### Custom Options

You can configure:

- **Squish Strength** – controls how strongly the target model is visually compressed
- **Pat Duration** – controls how long the pat animation lasts
- **Hand Movement** – controls the amount of movement in the patting hand animation
- **Push Strength** – controls the strength of the visual push effect
- **Sound Volume** – controls PatPat sound volume
- **Random Sounds** – enables or disables randomized PatPat sounds
- **Nametag Follow** – controls whether the native nametag follows the temporary squash movement

PatPat settings are saved automatically.


---

## 📦 Item Physics

Item Physics improves the visual behavior of dropped items in Miniblox.

Instead of every dropped item keeping the same basic orientation, the module adds client-side movement and rotation that reacts to how the item is moving.

Features include:

- Air rotation and spin
- Landing bounce
- Rotation response when hitting walls
- Ground settling
- Shape-aware resting behavior
- Different handling for flatter or thinner item models
- Smooth visual recovery when the module is disabled

Item Physics is designed as a visual enhancement and does **not** replace or modify the game's native item collision behavior.

The module can be enabled or disabled from the **Rendering** section.

---

## 👁️ FreeLook

FreeLook allows you to look around independently without changing the direction your player is facing.

- Default bind: `Z`
- Supports **Hold** mode
- Supports **Toggle** mode
- Configurable keybind
- Keybind can be changed or removed
- Right-click the module to open its settings

FreeLook is designed to keep camera movement separate from the player's facing direction while active.

---

## 🔍 Zoom

Zoom provides a closer view while playing.

- Zoom range: `1×` to `20×`
- Default bind: `X`
- Hold the configured keybind and use the mouse wheel to change zoom
- `Ctrl + Scroll` allows finer adjustments
- Releasing the activation key restores normal zoom
- Displays the current zoom level while adjusting
- Configurable keybind
- Right-click the module to change or remove the bind

---

## 🧍 Titan & Tiny

Titan & Tiny allows you to modify the scale of your local player model.

### Available Range

```text
0.20× — 5.00×
```

### Presets

- **Tiny** → `0.35×`
- **Normal** → `1.00×`
- **Titan** → `3.00×`
- **Custom** → Any supported value between `0.20×` and `5.00×`

While active, the module also synchronizes related local player values used by the feature.

Right-click the module to configure:

- Player scale
- Presets
- Custom scale
- Keybind

Titan & Tiny has no keybind assigned by default.

The selected scale and keybind are saved automatically.

---

## 🎥 Camera Overhaul

Camera Overhaul adds smoother and more dynamic camera movement during gameplay.

It reacts to player movement, turning, jumping, landing, mouse movement, and speed.

### Profiles

#### Soft

Subtle camera movement with a lighter effect.

#### Normal

Balanced camera movement designed for regular gameplay.

#### Strong

More noticeable and dynamic camera effects.

#### Custom

Allows you to manually configure the camera behavior.

Changing custom values automatically switches the active profile to **Custom** when the configuration no longer matches one of the built-in presets.

### Camera Effects

Depending on the selected configuration, Camera Overhaul can affect:

- Overall camera strength
- Strafe roll
- Turn roll
- Movement pitch
- Vertical movement response
- Head bob
- Bob frequency
- Landing impact
- Idle sway
- Speed-based FOV
- Mouse response

Camera Overhaul has no keybind assigned by default.

- **Left-click** → Enable or disable
- **Right-click** → Open settings
- A custom keybind can be assigned or removed

Settings are saved automatically.

---

## 🔲 Block Highlight

Block Highlight allows you to customize the native outline shown around the block you are currently targeting.

You can configure:

- Highlight color
- Outline thickness
- Module state

### Thickness

```text
1 — 4
```

The module updates the block outline while playing and keeps the selected configuration saved.

---

## 🎮 HUD Modules

MiniFeather includes several optional HUD modules.

### FPS Counter

Displays the current frame rate.

### CPS Counter

Displays clicks per second.

### Ping Counter

Displays the client's current ping measurement.

### Keystrokes

Displays movement and mouse input information while playing.

Each HUD module can be enabled or disabled independently.

---

## 💬 Chat Features

MiniFeather includes several optional chat enhancements.

### Chat Videos

Supported video links can be displayed directly from chat.

### Chat Links

URLs can become clickable while preserving the original chat message.

### Chat Memes

MiniFeather includes a built-in collection of GIFs and images that can be used through meme IDs.

Examples:

```text
:laughing:
:faceemoji:
:6pk3tk:
:son:
```

The client also includes a meme library where supported IDs can be viewed with previews.

---

## 👕 Cosmetics & Customization

MiniFeather includes several visual customization options:

- Custom player skins
- Custom capes
- Custom logo
- Custom background
- Custom textures
- Custom spritesheets
- MiniFeather interface branding

These options are intended to make the local Miniblox experience more customizable.

---

## 🌐 Languages

MiniFeather currently supports:

- English
- Español
- 日本語
- Italiano

Translations are stored separately from the main client logic to keep the codebase cleaner and easier to maintain.

The selected language is saved automatically.

---

## 📊 Dashboard

The MiniFeather dashboard provides a quick overview of the client.

Depending on the current configuration, it can display information such as:

- Active modules
- Current FPS
- Ping information
- Client status
- Module statistics

---

## ⚙️ Saved Settings

MiniFeather automatically saves supported settings using browser storage.

Saved configuration can include:

- Enabled modules
- PatPat module state
- Item Physics module state
- HUD preferences
- Module keybinds
- Titan & Tiny scale
- Zoom bind
- FreeLook configuration
- Block Highlight settings
- Camera Overhaul profile
- Camera Overhaul custom values
- Chat options
- Language
- Interface preferences
- Cosmetic settings

Your configuration remains available after reloading Miniblox or restarting the browser.

---

## ⌨️ Keybinds

Supported modules can use configurable keybinds.

To configure a keybind:

1. Right-click a supported module.
2. Open its settings.
3. Select the bind option.
4. Press the key you want to use.
5. Save the configuration.

Keybinds can be changed or removed later.

---

## 🖱️ Right-Click Configuration

Modules with advanced settings can be configured by right-clicking them.

Depending on the module, this can include:

- Keybind configuration
- Presets
- Scale values
- Camera settings
- Colors
- Custom values
- Module-specific options

This keeps the main panel simple while still allowing deeper customization.

---

## 📢 Support Ads

MiniFeather includes a **Support Ads** option.

When disabled, supported advertisement elements are hidden from the Miniblox interface.

When enabled, those elements are allowed to remain visible.

---

## ⚡ Performance

MiniFeather is designed to remain lightweight and avoid unnecessary background processing.

The client uses a modular lifecycle system so supported features can enable, disable, refresh, and clean up their own behavior.

Performance-focused improvements include:

- HUD elements created only when needed
- Reduced unnecessary listeners
- Reduced unnecessary DOM observation
- Independent module lifecycle handling
- Separate translation handling
- Separate files for larger modules
- Cleanup when supported features are disabled

---

## 🧩 Project Structure

Larger MiniFeather systems are separated into their own files.

Current examples include:

```text
src/content.js
src/translations.js
src/HealthNameTags.js
src/DistanceNameTags.js
src/PatPat.js
src/ItemPhysics.js
src/TitanTiny.js
src/Zoom.js
src/Camera Overhaul.js
src/mf-freelook.js
src/features.js
```

PatPat also uses its own visual and audio assets:

```text
assets/patpat.png
assets/pat.ogg
assets/pat1.ogg
assets/pat2.ogg
```

This makes features easier to maintain, update, and debug independently.

---

## 📥 Installation

1. Open the repository's **Releases** section.
2. Download the latest MiniFeather Client `.zip` file.
3. Extract the downloaded archive.
4. Open the extensions page in your Chromium-based browser:

```text
chrome://extensions
```

5. Enable **Developer mode**.
6. Click **Load unpacked**.
7. Select the extracted MiniFeather Client folder.
8. Open or reload:

```text
https://miniblox.io/
```

MiniFeather should now load automatically.

---

## 🔄 Updating

To update MiniFeather Client:

1. Download the newest release from GitHub.
2. Extract the new archive.
3. Replace the previous MiniFeather Client folder.
4. Open:

```text
chrome://extensions
```

5. Reload MiniFeather Client.
6. Reload Miniblox.io.

---

## 🐛 Bugs

Found a bug or unexpected behavior?

Please report it through the GitHub repository and include useful information such as:

- What happened
- What you expected to happen
- MiniFeather version
- Browser used
- Steps to reproduce the issue
- Screenshots or videos
- Console errors when available

Detailed reports make issues easier to reproduce and fix.

---

## 💡 Suggestions

Feature ideas and improvements are welcome.

Suggestions can include:

- New modules
- UI improvements
- Performance improvements
- Camera features
- Cosmetic features
- Chat features
- Translation improvements
- Compatibility fixes
- HUD improvements
- Quality-of-life features

---

## 🤝 Contributing

MiniFeather Client is a community-developed project.

Contributions are welcome, including:

- New features
- Bug fixes
- Performance improvements
- Code cleanup
- Translations
- UI improvements
- Compatibility updates
- Documentation
- Testing

When contributing, try to keep new features consistent with the existing MiniFeather module system and interface.

---

## 🔗 Community

### Discord

https://discord.gg/k4Ku9DTQDQ

### GitHub Repository

https://github.com/DevOfficial-Client/MiniFeather-Client/

---

## ⚠️ Disclaimer

MiniFeather Client is an independent community project and is not officially affiliated with Miniblox.io.

The client is designed to improve and customize the local Miniblox experience.

Because Miniblox.io may change over time, some features may require compatibility updates after game updates.

Some modules may also behave differently depending on browser version, Miniblox updates, game mode, or changes to the game's internal systems.

---

<div align="center">

### 🪶 MiniFeather Client

Built by the community for a more customizable Miniblox experience.

</div>
