# Contributing to MiniFeather Client

Thanks for wanting to help! MiniFeather is made by the Miniblox community, for the Miniblox community — and since the whole client is open source (GPL-3.0), anyone can dig in.

## Ground rules

* Read the [EULA TL;DR](EULA-TLDR.en.md) first — contributions are accepted under the same terms as the project.
* Be nice. We're all here because we like block games.
* **Never** bundle third-party assets you don't have permission to redistribute — see [LICENSING.md](LICENSING.md) and [CREDITS.md](CREDITS.md) for how the project handles that.

## Ways to contribute

* **Bug reports & feature requests** — open an issue with what you did, what happened, and what you expected. Console logs help a lot.
* **Modules** — the client is built as separate feature modules (`src/`), each one independently toggleable. Look at an existing module for the shape, keep the public source readable (the `minified` branch is generated automatically — never edit it by hand), and add a test under `tests/` if you can.
* **Translations** — the UI ships a translation table; new languages are welcome.
* **Docs** — clearer install guides, screenshots, FAQ entries. Small PRs, big help.

## Development quickstart

```bash
git clone https://github.com/DevOfficial-Client/MiniFeather-Client.git
cd MiniFeather-Client
# load the repo root as an unpacked Chrome extension (chrome://extensions → Developer mode)
# or build the userscript/packages:
node tools/build-mobile.js
```

Work happens on `beta` and gets merged into `main` when a release is cut — please branch off `beta`.

## Licensing

By contributing, your code is licensed under the project's [GPL-3.0](LICENSE) — the same license as the rest of MiniFeather's own source.
