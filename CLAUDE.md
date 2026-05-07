# ScriptZ - Monorepo

pnpm-Workspace mit zwei eigenständigen Apps:

- [`apps/desktop/`](apps/desktop/) - die Tauri-Desktop-App (Solid + Rust + Lexical).
  Eigene `CLAUDE.md` darin mit allen App-spezifischen Details.
- [`apps/landing/`](apps/landing/) - die Marketing-Seite getscriptz.app
  (Astro, statisch, Vercel-Deploy).

## Konvention

Beide Apps sind **vollständig getrennt**. Es gibt keine geteilten
Pakete in `packages/` und keine Imports zwischen den Apps. Wenn die
Landing eine Information aus der Desktop-App braucht (z.B. die
aktuelle Version), holt sie sie zur Build-Zeit von GitHub Releases -
nicht via Workspace-Import.

Phase 2 (geplant, noch nicht umgesetzt): Eine Web-Version der App
unter `app.getscriptz.app`. Erst dann lohnt sich ein
`packages/core/` für Lexical-Nodes, Charakter-Logik und Storage-
Adapter. Bis dahin: getrennt halten, Komplexität vermeiden.

## Konsistenz Desktop ↔ Landing (wichtig)

Die Landing ist das **Schaufenster** der Desktop-App. Wenn an der App
etwas verändert wird, muss die Landing nachgezogen werden, sonst zeigt
sie ein Produkt, das es so nicht mehr gibt. Vor dem Abschluss einer
Aufgabe an der Desktop-App immer prüfen, ob die Landing mit betroffen
ist. Bei Unsicherheit lieber kurz beim User nachfragen statt
auseinanderlaufen lassen.

Auslöser, bei denen die Landing **mit** angepasst werden muss:

| Änderung in der Desktop-App | Was in der Landing folgen muss |
|---|---|
| Neues Feature, das ein User merkt | Ggf. Aufnahme in Features-Sektion oder Vergleichstabelle ([apps/landing/src/components/Features.astro](apps/landing/src/components/Features.astro), [Compare.astro](apps/landing/src/components/Compare.astro)). Wenn es ein Top-3-Feature ist, eines der bestehenden ablösen. |
| Feature entfernt | Aus Features, Vergleich, Demo, Texten rauswerfen. Versprechen wie "lokal" oder "kein Konto" gegenchecken. |
| Design-Token geändert (Farbe, Schrift, Radius, Spacing) | [apps/landing/src/styles/tokens.css](apps/landing/src/styles/tokens.css) angleichen, falls die Landing den App-Look spiegeln soll. |
| Editor-Layout geändert (Block-Typen, Einrückung, ALLCAPS-Regel, Spacing-Cluster) | [Workflow.astro](apps/landing/src/components/Workflow.astro) Schritt 3 ("Schreiben") so anpassen, dass die Demo weiterhin 1:1 dem echten Editor entspricht. |
| App-Chrome verändert (Tab-Bar, Status-Strip, Trafficlight-Position) | Demo-Frame nachziehen, sonst sieht die Demo aus wie eine alte Version. |
| Schriftart oder Schrift-Größen | [src/styles/fonts.css](apps/landing/src/styles/fonts.css) und Tokens. |
| `app_icon`, Branding | Icons in `apps/landing/public/img/` neu setzen. |
| Plattform-Support erweitert (z.B. Windows-Build) | Hero-Meta, Download-Sektion, Compare-Tabelle, "First-Run"-Anleitung anpassen. |
| Lizenzmodell, Tracking-Verhalten, Konto-Verhalten | OpenSource-Sektion und Datenschutzerklärung gegenchecken. |
| Versionsnummer | **Nichts manuell tun** - die Landing fetcht die Version zur Build-Zeit aus GitHub Releases ([src/data/site.ts](apps/landing/src/data/site.ts)). Sobald der Release-Tag publiziert ist, baut Vercel die Landing neu. |

Praktisch heißt das: nach jeder nicht-trivialen Desktop-Änderung mit
einem Blick durch [apps/landing/src/](apps/landing/src/) gehen und
prüfen, ob Texte, Demo, Vergleich noch stimmen. Bei reinen
Bug-Fixes oder Code-Refactors ohne User-sichtbare Wirkung muss nichts
passieren.

## Befehle (vom Repo-Root)

```bash
pnpm install                 # installiert beide Apps
pnpm dev:desktop             # tauri dev der Desktop-App
pnpm dev:landing             # astro dev der Landing
pnpm build:desktop           # native .app bauen
pnpm build:landing           # statische Landing bauen
pnpm typecheck               # tsc/astro check über beide Apps
```

Innerhalb einer App können auch die App-eigenen Skripte direkt benutzt
werden (`cd apps/desktop && pnpm tauri:dev`).

## Release / Deploy

- **Desktop**: GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml))
  baut beim Pushen eines `vX.Y.Z`-Tags auf `macos-26` und published
  Release-Artefakte. Auto-Updater im laufenden Client poll't `latest.json`.
- **Landing**: Vercel-Project mit `Root Directory` = `apps/landing`.
  Deploy auf jeden Push zu `main`. Eigene Domain getscriptz.app.

## Deutsche Texte

App und Landing sind beide auf Deutsch. In Code-Kommentaren und
Doku-Markdown wird normaler Bindestrich verwendet, **kein
Em-Dash**. Auch in von Claude generierten Texten.
