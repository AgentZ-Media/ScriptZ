# write-scriptz.com - Claude context

Astro-Landing für ScriptZ, Vercel-Deploy, statisch. Hosting unter
[write-scriptz.com](https://write-scriptz.com).

## Aufbau

```
src/
  components/
    LandingPage.astro    Geteiltes Markup der Hauptseite, nimmt `lang`-Prop
    LegalShell.astro     Editor-Optik-Wrapper für Impressum/Datenschutz
  data/site.ts           Zentrale Site-Konstanten + GitHub-Release-Fetch
  i18n/                  Mehrsprachige Strings (siehe Abschnitt unten)
    de.ts                  Deutsche Strings (Source of truth)
    en.ts                  Englische Strings (`Record<keyof typeof de, ...>`)
    index.ts               t()-Helper, Lang-Typ, Pfad-Helfer
  layouts/Base.astro     Head, Meta, hreflang, Auto-Detect-Redirect, Reveal-Observer
  pages/
    index.astro            `/` - DE-Default, dünner Wrapper um LandingPage
    en/index.astro         `/en` - EN-Variante, dünner Wrapper
    impressum.astro        `/impressum` - DE-only (Rechts-bedingt)
    datenschutz.astro      `/datenschutz` - DE-only (Rechts-bedingt)
  styles/
    landing.css            Geteiltes Stylesheet der LandingPage (Brutalist-Look)
    tokens.css, fonts.css, global.css
public/                  Schrift, Icons, robots
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
  Umlaute statt ae/oe/ue. Gilt für die DE-Hälfte der i18n-Kataloge
  und alle Code-Kommentare/Docs.

## Mehrsprachigkeit (wichtig)

Die Landing ist mehrsprachig (aktuell DE + EN), genauso wie die App.
Erkennung beim Erstbesuch via `navigator.language` in
[`layouts/Base.astro`](src/layouts/Base.astro), dazu ein DE/EN-Toggle
oben rechts in der Titlebar. Nutzer-Wahl wird in
`localStorage["scriptz-lang"]` persistiert, damit der Auto-Redirect
nach dem ersten Wechsel niemanden mehr umbiegt.

Routing:

- `/` → Deutsch (Default-Sprache, kein Pfad-Prefix)
- `/en` → Englisch
- `/impressum`, `/datenschutz` → **bleiben DE-only** (deutsches Recht,
  Auto-Redirect ignoriert diese Pfade)

### Grundregel

**Jede User-sichtbare Änderung auf der Landing wird in ALLEN
verfügbaren Sprachen gepflegt, immer.** Aktuell heißt das: ein Eintrag
in [`src/i18n/de.ts`](src/i18n/de.ts) UND ein korrespondierender
Eintrag in [`src/i18n/en.ts`](src/i18n/en.ts). Wenn weitere Sprach-
Dateien dazukommen, gilt die Regel für alle: kein Key-Loch in irgendeiner
Sprache. TypeScript erzwingt das (`Record<keyof typeof de, string>` in
`en.ts`), aber das fängt nur die Form, nicht die inhaltliche Qualität -
"TODO"-Strings sind verboten, jeder Wert ist eine echte Übersetzung.

### Was zählt als "User-sichtbar"

- JSX-Children in `LandingPage.astro` und allen `pages/*.astro`
- `title=`, `aria-label=`, `placeholder=`, `alt=` und vergleichbare
  Attribute
- `data-title`, `data-label` etc., wenn JS daraus User-Text macht
  (siehe Sprint-Pille und Toolbar-Titel)
- Meta-Tags (`<title>`, `description`, OG, Twitter) - bereits via
  `t(lang, "meta.*")` in `Base.astro` parametrisiert
- Strings, die im inline-`<script>` von LandingPage durch
  `define:vars={{ jsStrings }}` reingegeben werden (Copy-Button,
  Sprint-Pille-Label/Format)

Nicht User-sichtbar: Code-Kommentare (bleiben deutsch), HTML-Kommentare,
interne IDs/Klassen, `console.log`, Strings in Build-Konfig.

### Wenn du ein neues Feature mit User-Text baust

1. **Key in `de.ts` anlegen.** Naming wie in der App-i18n:
   `bereich.kontext.was` (flach, dot-separated, lowercase).
2. **Korrespondierenden Key in `en.ts`** ergänzen, mit echter
   englischer Übersetzung. Reihenfolge 1:1 zur DE-Datei halten.
3. **In `LandingPage.astro` / `pages/*.astro` nutzen:** `t(lang, "key")`.
4. **Sind JS-Strings betroffen** (Copy-Button-Text, Sprint-Format,
   Toggle-Persistenz), reichst du sie über `define:vars` oder
   `data-`-Attribute ins inline-Script - nicht direkt aus `t()` heraus,
   das Script läuft im Browser ohne Astro-Kontext.
5. **Wenn ein neuer Tab oder neue Sektion entsteht**, dran denken,
   `data-title` (Tab) und ggf. `data-content` (Paper-Sektion) ebenfalls
   übersetzt zu führen.
6. **Verifikation**: `pnpm typecheck` (deckt fehlende EN-Keys), dann
   `pnpm dev:landing` und beide URLs aufrufen - `/` und `/en` - und
   prüfen, dass nichts mehr Deutsch leakt.

### Anti-Pattern (NICHT machen)

- Inline-DE-String in `LandingPage.astro`, weil "ist ja nur ein Wort".
- TODO-Wert in `en.ts`, weil "übersetze ich später".
- Hardcoded `"de_DE"` oder `<html lang="de">` an Stellen, wo die
  Sprache schon im `lang`-Prop steckt.
- Neue Page anlegen, die `LandingPage` direkt umgeht und eigenen Text
  inline einbettet, statt durch i18n zu gehen.
- DE-only Page hinzufügen, ohne in [`src/i18n/index.ts`](src/i18n/index.ts)
  (`localePath` / `switchLangPath`) zu spezifizieren, dass dieser Pfad
  vom Sprach-Routing ausgenommen ist.

### Wann eine Sprach-Differenz OK ist

Nur wenn rechtlich oder kontextuell unausweichlich. Aktueller einziger
Fall: **Impressum und Datenschutz bleiben deutsch** (deutsches Recht,
deutscher Anbieter). Auto-Redirect ignoriert diese Pfade, hreflang-en
wird auf ihnen nicht gesetzt, der Sprach-Toggle erscheint dort nicht.
Wenn jemals englisch-rechtliche Pendants nötig werden, eigene
`pages/en/impressum.astro` / `pages/en/datenschutz.astro` anlegen und
die Sonderfall-Logik in `src/i18n/index.ts` (Funktion `localePath` und
`switchLangPath`) sowie in `Base.astro` (`isLegal`-Check) entfernen.

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
