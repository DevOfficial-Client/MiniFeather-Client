<div align="center">

# 🪶 MiniFeather Client

### A lightweight, customizable browser client designed to enhance your experience on Miniblox.io.

![Version](https://img.shields.io/badge/version-v3.2.0-2563eb?style=flat-square)
![Status](https://img.shields.io/badge/status-active-16a34a?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Miniblox.io-7c3aed?style=flat-square)

</div>

---

## 📖 Overview

MiniFeather Client is a community-developed browser extension created to enhance the Miniblox.io experience with visual improvements, HUD modules, camera features, player customization, chat utilities, and quality-of-life features.

The client is designed to remain lightweight, configurable, and easy to use while continuing to receive compatibility updates, fixes, performance improvements, and new modules.

---

## ✨ Features

- Modern and customizable MiniFeather control panel
- Dashboard with active module, FPS, and ping information
- FPS, CPS, ping, and keystrokes HUD modules
- Custom skins, capes, logos, textures, and spritesheets
- Player Health nametags
- Titan & Tiny player scaling
- FreeLook
- Camera Overhaul
- Zoom up to `20×`
- Custom Block Highlight
- Configurable module keybinds
- Right-click module configuration
- Chat videos, links, GIFs, memes, and media previews
- Built-in meme library
- English, Spanish, Japanese, and Italian support
- Custom Miniblox.io interface branding
- Optional ad visibility
- Automatically saved settings
- Performance-focused module lifecycle
- Frequent compatibility fixes and feature updates

---

## 🎮 Module Controls

Most MiniFeather modules follow the same control system:

- **Left-click** → Enable or disable the module
- **Right-click** → Open the module configuration
- **Keybind** → Quickly activate or use supported modules while playing

Module settings and keybinds are saved automatically.

---

## ❤️ Player Health

Player Health enhances the native Miniblox player nametags by displaying the player's current health.

Example:

```text
PlayerName ❤ 20
```

The module uses the game's native nametag rendering instead of creating an ESP-style overlay.

This means:

- Health is displayed directly next to the normal player nametag
- Native nametag visibility behavior is preserved
- Nametags do not become visible through walls simply because the module is enabled
- Health updates dynamically while playing
- Works with both the local player and other detected player entities

The module can be enabled or disabled directly from the **Rendering** section.

---

## 👁️ FreeLook

FreeLook allows you to look around independently without changing the direction your player is facing.

- Default bind: `Z`
- Keeps the player's facing direction separate from camera movement
- Supports **Hold** mode
- Supports **Toggle** mode
- Configurable keybind
- Keybind can be changed or removed
- Right-click the module to open its settings

This allows you to look around your surroundings while keeping your movement direction unchanged.

---

## 🔍 Zoom

Zoom provides a closer view while playing.

- Zoom range: `1×` to `20×`
- Hold the configured keybind and use the mouse wheel to zoom
- `Ctrl + Scroll` allows finer adjustments
- Releasing the activation key immediately restores normal zoom
- Displays the current zoom level while adjusting
- Configurable keybind
- Right-click the module to change or remove the bind

The Zoom system works directly with the Miniblox camera projection.

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

Additional synchronization is handled automatically while the module is active:

- Local player scale
- Local hitbox
- Camera height
- Native nametag height

Titan & Tiny has no keybind assigned by default.

Right-click the module to configure:

- Player scale
- Presets
- Custom scale
- Keybind

The selected scale and keybind are saved automatically.

---

## 🎥 Camera Overhaul

Camera Overhaul provides smoother, more dynamic, and more natural camera movement during gameplay.

It improves camera behavior using effects based on player movement, turning, jumping, landing, mouse movement, and speed.

### Profiles

#### Soft

Subtle camera movement designed for players who want a smoother experience without making the effect too noticeable.

#### Normal

A balanced profile designed for regular gameplay.

#### Strong

More noticeable and responsive camera movement for a stronger visual effect.

#### Custom

Allows the camera behavior to be manually configured.

Changing any value from one of the built-in presets automatically switches the profile to **Custom**.

### Camera Effects

Camera Overhaul can include:

- Movement-based camera tilt
- Strafe roll
- Turning inertia
- Forward and backward movement pitch
- Vertical movement response
- Smooth head bob
- Landing impact
- Idle camera sway
- Breathing-style movement
- Mouse movement response
- Dynamic speed-based FOV
- Smooth camera recovery
- Different effect intensity depending on perspective

### Custom Settings

Camera Overhaul allows configuration of:

- Overall strength
- Strafe roll
- Turn roll
- Movement pitch
- Vertical movement pitch
- Head bob
- Bob frequency
- Landing impact
- Idle sway
- Speed-based FOV
- Mouse response

All configurable values have limits to prevent excessively unstable camera settings.

Camera Overhaul has no keybind assigned by default.

- **Left-click** → Enable or disable Camera Overhaul
- **Right-click** → Open Camera Overhaul settings
- A custom toggle keybind can be assigned or removed

Settings are saved automatically.

---

## 🔲 Block Highlight

Block Highlight allows you to customize the outline shown around the block you are currently looking at.

You can modify:

- Highlight color
- Outline thickness
- Module state

### Thickness Levels

```text
1 — 4
```

The module modifies the native Miniblox block selection outline and updates the effect while playing.

Right-click the module to open its configuration.

---

## 🎮 HUD Modules

MiniFeather includes several optional HUD modules.

### FPS Counter

Displays the current rendering frame rate.

### CPS Counter

Displays clicks per second.

### Ping Counter

Displays the client's current ping measurement.

### Keystrokes

Displays your movement and mouse inputs while playing.

HUD modules can be individually enabled or disabled from the MiniFeather panel.

---

## 💬 Chat Features

MiniFeather includes several optional chat enhancements.

### Chat Videos

Supported video links can be displayed directly from chat.

### Chat Links

URLs can automatically become clickable while preserving the original message.

### Chat Memes

MiniFeather includes a built-in collection of GIFs and images that can be used through meme IDs.

Examples:

```text
:laughing:
:faceemoji:
:6pk3tk:
:son:
```

The client also includes a meme library where supported IDs can be viewed together with previews.

---

## 👕 Cosmetics & Customization

MiniFeather includes several visual customization options.

### Custom Skins

Use custom player skins directly through the client.

### Custom Capes

Apply custom capes to your player.

### Custom Logo

Replace the default interface logo with a custom image.

### Custom Background

Use a custom background image for supported parts of the Miniblox interface.

### Custom Textures

Replace supported textures with custom assets.

### Custom Spritesheets

Use custom spritesheets for supported Miniblox interface and game elements.

These features are designed to modify the local visual experience without replacing the core Miniblox gameplay.

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

The MiniFeather dashboard provides quick information about the client and active modules.

Depending on the current configuration, it can display information such as:

- Active modules
- Current FPS
- Ping information
- Client status
- Module statistics

The dashboard is designed to provide a quick overview without needing to open every individual module.

---

## ⚙️ Settings

MiniFeather automatically saves supported configuration values using browser storage.

Saved settings can include:

- Enabled modules
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

Depending on the module, keybinds can be used to:

- Enable or disable a feature
- Temporarily activate a feature
- Toggle a module
- Hold a module while using another input

To configure a supported module:

1. Right-click the module.
2. Open its settings.
3. Select the keybind option.
4. Press the key you want to use.
5. Save the configuration.

Keybinds can also be changed or removed later.

---

## 🖱️ Right-Click Configuration

Modules with additional settings can be configured by right-clicking them.

Depending on the module, this can provide access to:

- Keybind configuration
- Custom values
- Presets
- Colors
- Scale values
- Camera settings
- Module-specific options

This keeps the main panel clean while still providing advanced configuration when needed.

---

## 📢 Support Ads

MiniFeather includes a **Support Ads** option.

When disabled, the client hides supported advertisement elements from the Miniblox interface.

When enabled, those advertisement elements are allowed to remain visible.

This feature only affects how supported ad elements are displayed by the client.

---

## ⚡ Performance

MiniFeather is designed to remain lightweight and avoid unnecessary background processing.

Several modules use optimized lifecycle behavior so that disabled features do not continue performing unnecessary work.

Performance-focused behavior includes:

- HUD elements created only when needed
- Disabled modules removing unnecessary listeners
- Reduced DOM observers when features are inactive
- Independent module lifecycle handling
- Cleaner translation handling
- Separate feature files for larger modules
- Automatic cleanup when supported features are disabled

The client continues to receive performance improvements as new features are added.

---

## 🧩 Modular Structure

MiniFeather uses separate files for larger systems and features.

Examples include:

```text
content.js
translations.js
Zoom.js
TitanTiny.js
Camera Overhaul.js
mf-freelook.js
```

This structure helps keep individual systems easier to maintain, debug, improve, and update.

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

3. Replace or remove the previous MiniFeather Client folder.

4. Open:

```text
chrome://extensions
```

5. Reload MiniFeather Client.

6. Reload Miniblox.io.

After updating, previously saved settings may continue to work depending on whether the configuration format changed between versions.

---

## 🐛 Bugs

Found a bug or unexpected behavior?

Please report it through the GitHub repository and include as much useful information as possible.

Useful information includes:

- What happened
- What you expected to happen
- MiniFeather version
- Browser used
- Steps to reproduce the issue
- Screenshots or videos
- Console errors when available

Providing detailed information makes it easier to reproduce and fix issues.

---

## 💡 Suggestions

Feature ideas and improvements are welcome.

MiniFeather Client continues to evolve through community feedback, experimentation, and contributions.

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
- Module improvements
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
