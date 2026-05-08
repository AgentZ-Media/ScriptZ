# write-scriptz.com - Claude context

Astro-Landing für ScriptZ, Vercel-Deploy, statisch. Hosting unter
[write-scriptz.com](https://write-scriptz.com).

## Aufbau

```
src/
  components/        Astro-Komponenten der Sektionen
    Nav.astro              Sticky Top-Bar mit dunklem CTA
    Hero.astro             Zentriertes Layout: H1 + CTA + 4 Mini-Features + App-Screenshot
    WirBar.astro           AgentZ-Eigenreferenz: 240k Follower, 4.000+ Videos
    Features.astro         4-Card-Grid "Schreiben, statt formatieren"
    Steps.astro            3-Schritt-Prozess auf grauem Streifen
    Compare.astro          Vergleichstabelle gegen Word/Notion/ChatGPT/Final Draft/Notes
    Download.astro         Schmale Download-CTA mit Live-Versions-Pille
    Footer.astro           4-Spalten-Grid inkl. Impressum/Datenschutz
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
Fail-soft mit Fallback `site.fallbackVersion`.

**Wichtig:** Vercel reagiert nur auf Git-Push, nicht auf
GitHub-Release-Events. Ein Push, der einen Tag mitschickt, triggert
Vercel **sofort** - bevor der Release-Workflow auf macOS-26 fertig
gebaut und den Release publiziert hat. Der Vercel-Build sieht zu dem
Zeitpunkt also noch die *vorherige* Version in der Releases-API und
backt die in die statische Site ein.

Damit das funktioniert, ruft [`/.github/workflows/release.yml`](../../.github/workflows/release.yml)
am Ende des Build-Jobs einen Vercel-Deploy-Hook auf
(Secret `VERCEL_DEPLOY_HOOK_URL`). Dadurch baut Vercel die Landing
ein zweites Mal - jetzt mit der frisch publizierten Release-Version.

Bei jedem Release auch [`fallbackVersion`](src/data/site.ts) auf den
neuen Tag bumpen, sonst zeigt die Landing bei einem GitHub-API-Ausfall
während des Builds eine veraltete Version. Details: Release-Checkliste
in [`/CLAUDE.md`](../../CLAUDE.md).

## Spiegelung der Desktop-App

Diese Landing ist das Schaufenster der App in
[`apps/desktop/`](../desktop/). Sie muss zur tatsächlichen App
passen, sonst zeigt sie ein Produkt, das es so nicht gibt.

Wenn du **hier** etwas änderst, weil die App sich verändert hat:

- App-Screenshots im Hero und in zukünftigen Demo-Sektionen
  ([`public/img/app/`](public/img/app/)) müssen aus der aktuellen
  Desktop-App stammen. Bei UI-Refresh in der App: neu aufnehmen.
- Versprechen "lokal, kein Konto, kein Tracking" tauchen in
  [`Hero.astro`](src/components/Hero.astro) (Mini-Feature-Row),
  [`Download.astro`](src/components/Download.astro) (Install-Hinweis)
  und im Abschnitt "Die Desktop-App ScriptZ selbst" in
  [`pages/datenschutz.astro`](src/pages/datenschutz.astro) auf -
  alle drei müssen mit dem tatsächlichen App-Verhalten übereinstimmen.
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
