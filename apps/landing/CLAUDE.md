# write-scriptz.com - Claude context

Astro-Landing für ScriptZ, Vercel-Deploy, statisch. Hosting unter
[write-scriptz.com](https://write-scriptz.com).

## Aufbau

```
src/
  components/        Astro-Komponenten der Sektionen
    Nav.astro
    Hero.astro
    Workflow.astro         Vier-Schritt-Tour mit interaktiver Editor-Demo in Schritt 3
    Story.astro            "Warum ScriptZ" + AgentZ-Hintergrund
    Features.astro         Top-3-Features
    Compare.astro          Vergleichstabelle gegen andere Tools
    OpenSource.astro       Lizenz, Versprechen
    Download.astro         CTA, First-Run-Anleitung
    Footer.astro
  data/site.ts        zentrale Site-Konstanten + GitHub-Release-Fetch
  layouts/Base.astro  Head, Meta, Reveal-Observer
  pages/              index, impressum, datenschutz
  styles/             tokens, fonts, global
public/               Schrift, Icons, robots
```

## Konventionen

- **Hellmodus only**, monochrom. Akzent ist Tinten-Schwarz, nicht
  Orange. Status-Indikatoren in Tabellen / Checklisten dürfen Farbe
  tragen (grün/grau/gelb), sonst nicht.
- **Karo-Hintergrund** über die ganze Seite - Echo des App-Icons,
  durch Repeating-Gradient auf body in [`src/styles/global.css`](src/styles/global.css).
  Werte in [`src/styles/tokens.css`](src/styles/tokens.css)
  (`--grid-line`, `--grid-cell`).
- **Karten verdecken das Karo**, dashed-Border-Boxen zeigen es durch.
- **Schrift: iA Writer Quattro**, selbst gehostet (`public/fonts/`),
  kein CDN, kein Tracker.
- **Deutsche Texte**, normale Bindestriche statt Em-Dashes,
  Umlaute statt ae/oe/ue.

## Versionsnummer

Wird zur Build-Zeit von der GitHub-Releases-API geholt
([`src/data/site.ts`](src/data/site.ts) → `getLatestRelease()`).
Fail-soft mit Fallback `site.fallbackVersion`. Vercel baut die
Landing bei jedem Push, GitHub bei jedem neuen Release-Tag indirekt
über den nächsten Vercel-Build.

## Spiegelung der Desktop-App

Diese Landing ist das Schaufenster der App in
[`apps/desktop/`](../desktop/). Sie muss zur tatsächlichen App
passen, sonst zeigt sie ein Produkt, das es so nicht gibt.

Wenn du **hier** etwas änderst, weil die App sich verändert hat:

- Editor-Demo (Schritt 3 in [`Workflow.astro`](src/components/Workflow.astro))
  muss das echte Editor-Layout 1:1 spiegeln. Referenz: die Block-CSS in
  [`apps/desktop/src/components/Editor/Editor.css`](../desktop/src/components/Editor/Editor.css).
- Versprechen in [`OpenSource.astro`](src/components/OpenSource.astro)
  und der Abschnitt "Die Desktop-App ScriptZ selbst" in
  [`pages/datenschutz.astro`](src/pages/datenschutz.astro) müssen mit
  dem tatsächlichen Verhalten der App übereinstimmen (Telemetrie,
  Konto, Cloud, Tracking).
- Vergleichstabelle in [`Compare.astro`](src/components/Compare.astro)
  - Häkchen müssen ehrlich sein.

Die vollständige Auslöserliste steht in der Repo-Root-CLAUDE.md
([`/CLAUDE.md`](../../CLAUDE.md)) unter "Konsistenz Desktop ↔ Landing".

## Befehle

Vom Repo-Root:

```bash
pnpm dev:landing        # Astro-Devserver
pnpm build:landing      # statische Site nach dist/
pnpm typecheck          # astro check
```

Direkt in diesem Verzeichnis funktionieren auch `pnpm dev`,
`pnpm build`, `pnpm preview`.

## Don'ts

- Keine Tracker, kein Analytics, kein CDN. Wer eine "wir tracken
  nichts"-Page baut, soll auch keine Beacons feuern.
- Keine Brand-Akzentfarbe (Orange) wieder einführen, ohne dass die
  App sie ebenfalls trägt. Aktuell sind beide bewusst schwarz/weiß.
- Versionsnummer **nicht** hardcoden. `fallbackVersion` ist nur das
  Sicherheitsnetz, falls GitHub beim Build down ist.
