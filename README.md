<p align="center">
  <img src="apps/desktop/docs/scriptz-icon-400.png" alt="ScriptZ" width="160" height="160" />
</p>

<h1 align="center">ScriptZ</h1>

<p align="center">
  <strong>Der schnellste Skript-Editor für TikTok-Creator und Sketch-Teams.</strong><br/>
  <em>Lokal. Offline. Mac-first.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.3.2-e0791f?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/platform-macOS-e0791f?style=flat-square" alt="macOS" />
  <img src="https://img.shields.io/badge/license-MIT-e0791f?style=flat-square" alt="license" />
</p>

---

Dies ist das Monorepo für ScriptZ. Es enthält zwei eigenständige Apps:

| App | Pfad | Zweck |
|---|---|---|
| Desktop-App | [`apps/desktop/`](apps/desktop/) | Die eigentliche ScriptZ-App (Tauri 2 + Solid + Rust + Lexical). |
| Landing | [`apps/landing/`](apps/landing/) | Marketing-Seite getscriptz.app (Astro, statisch). |

Detailierte Doku zur Desktop-App in [`apps/desktop/README.md`](apps/desktop/README.md).

## Schnellstart

```bash
pnpm install              # installiert beide Apps
pnpm dev:desktop          # Tauri-Devserver für die App
pnpm dev:landing          # Astro-Devserver für die Landing
pnpm build:desktop        # Native .app bauen
pnpm build:landing        # Statische Landing bauen
pnpm typecheck            # TypeScript prüfen, beide Apps
```

## Lizenz

MIT - siehe [LICENSE](LICENSE).
Schrift: iA Writer Quattro © Information Architects Inc., SIL OFL 1.1.
Entwickelt von [AgentZ](https://www.tiktok.com/@deragentz).
