# ScriptZ - Monorepo

pnpm-Workspace mit zwei eigenständigen Apps:

- [`apps/desktop/`](apps/desktop/) - die Tauri-Desktop-App (Solid + Rust + Lexical).
  Eigene `CLAUDE.md` darin mit allen App-spezifischen Details.
- [`apps/landing/`](apps/landing/) - die Marketing-Seite write-scriptz.com
  (Astro, statisch, Vercel-Deploy).

## Konvention

Beide Apps sind **vollständig getrennt**. Es gibt keine geteilten
Pakete in `packages/` und keine Imports zwischen den Apps. Wenn die
Landing eine Information aus der Desktop-App braucht (z.B. die
aktuelle Version), holt sie sie zur Build-Zeit von GitHub Releases -
nicht via Workspace-Import.

Phase 2 (geplant, noch nicht umgesetzt): Eine Web-Version der App
unter `app.write-scriptz.com`. Erst dann lohnt sich ein
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
| Versionsnummer | Siehe Release-Checkliste unten. |

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
  Deploy auf jeden Push zu `main`. Eigene Domain write-scriptz.com.

### Release-Checkliste (jedes Mal!)

Bei einem neuen Release `vX.Y.Z` müssen **vier** Stellen synchron
gehalten werden, sonst bleibt entweder die Landing oder der
Auto-Updater auf der alten Version hängen:

1. [`apps/desktop/package.json`](apps/desktop/package.json) - `version`
2. [`apps/desktop/src-tauri/tauri.conf.json`](apps/desktop/src-tauri/tauri.conf.json) - `version`
3. [`apps/desktop/src-tauri/Cargo.toml`](apps/desktop/src-tauri/Cargo.toml) +
   [`Cargo.lock`](apps/desktop/src-tauri/Cargo.lock) (Lock-Eintrag
   `name = "scriptz"` mitziehen, sonst bricht der CI-Build mit
   `--frozen-lockfile`)
4. [`apps/landing/src/data/site.ts`](apps/landing/src/data/site.ts) -
   `fallbackVersion`. Die Landing fetcht zwar zur Build-Zeit aus der
   GitHub-Releases-API, aber `fallbackVersion` greift, falls die API
   beim Build down ist - und sollte daher zum aktuellen Tag passen.
5. [`docs/release-notes/vX.Y.Z.md`](docs/release-notes/) **neu anlegen**
   mit dem Changelog seit dem letzten Tag (siehe nächster Abschnitt).
   Der Release-Workflow liest diese Datei und bricht ab, wenn sie
   fehlt - kein Release geht mit der vorherigen Beschreibung raus.

Danach: commit, `git tag vX.Y.Z`, `git push origin main vX.Y.Z`. Der
Release-Workflow triggert nach erfolgreichem Build automatisch einen
Vercel-Rebuild via Deploy-Hook (Secret `VERCEL_DEPLOY_HOOK_URL`),
damit die Landing die frisch publizierte Version aus der
GitHub-Releases-API zieht. Ohne diesen Hook würde die Landing auf
der vorherigen Version hängenbleiben, weil Vercel nur auf Git-Push
reagiert - und der Push passiert *vor* dem Release-Publish.

### Release-Notes schreiben

Pro Release **eine** Markdown-Datei unter
[`docs/release-notes/vX.Y.Z.md`](docs/release-notes/) anlegen. Inhalt:

- **Erste Zeile:** kurzes Headline-Statement, was dieses Release
  ausmacht. `ScriptZ vX.Y.Z - <ein-Satz-Tagline>.`
- **`## Was ist neu`** mit den User-sichtbaren Features seit dem
  vorherigen Tag. Knackig, in Bullets gruppiert nach Themen.
  Keine Refactor-Listen. Keine internen Migration-Phasen. Was würde
  ein User merken, der die App benutzt?
- **`## Bug-Fixes`** wenn vorhanden. Kurz beschreiben, was sich für
  den User ändert (nicht *welche Datei* gefixt wurde).
- **`## Updating`** als letzter inhaltlicher Abschnitt mit ein bis
  zwei Sätzen, wie die Auto-Update-Pille funktioniert.

Die statische **Install-Footer** ("Install (first time only)" mit
`xattr -cr`-Hinweis) hängt der Release-Workflow automatisch dran -
**niemals** in die per-Version-Datei kopieren. Die kommt aus
[`.github/workflows/release.yml`](.github/workflows/release.yml).

**Die Landing hat in den Release-Notes nichts zu suchen.** Die Notes
beschreiben die App, nicht die Marketing-Site. Änderungen an
`write-scriptz.com` wandern nicht ins Release.

Als Vorlage: [`docs/release-notes/v0.6.0.md`](docs/release-notes/v0.6.0.md).

Workflow-Verhalten: ist die Datei vor dem Tag-Push commited, baut der
Release-Workflow Body = Datei-Inhalt + Install-Footer. Vergisst man
sie, **bricht der Workflow mit klarem Error ab** statt mit der
vorherigen Beschreibung weiterzumachen.

Wer einen bereits publizierten Release retroaktiv mit den richtigen
Notes nachziehen will: Body-Datei manuell zusammensetzen
(per-Version-Notes + Install-Footer aus dem Workflow-YAML einmalig
copy/pasten) und mit `gh release edit vX.Y.Z --notes-file <datei>`
überschreiben.

### Was bei einem Release alles automatisch passiert

Sobald der Tag-Push erfolgreich gebaut hat, läuft alles weitere ohne
manuelle Schritte:

1. GitHub Actions baut `.dmg` + `.app.tar.gz` auf `macos-26`
2. Signiert den Updater-Bundle mit `TAURI_SIGNING_PRIVATE_KEY`
3. Legt das GitHub-Release-Objekt an, lädt Assets hoch
   (`latest.json` für Auto-Updater, `.dmg`, `.app.tar.gz`, `.sig`)
4. Triggert den Vercel-Deploy-Hook (`VERCEL_DEPLOY_HOOK_URL`)
5. Vercel rebuildet die Landing, fetcht die neue Version aus der
   GitHub-Releases-API, deployed write-scriptz.com
6. Bestehende User sehen innerhalb von ~60 Min die grüne Update-Pille
   im File-Browser-Footer (stündlicher `latest.json`-Poll)

### Wenn der Release-Workflow fehlschlägt

**Re-Run via `gh run rerun` reicht oft nicht**, weil GitHub den
`GITHUB_TOKEN`-Kontext vom ursprünglichen Trigger cached. Wenn der
Fehler etwas mit Permissions zu tun hatte (z.B. nach einem
Org-Transfer oder einer geänderten Workflow-Permission-Setting),
muss ein **frischer** Run her:

```bash
git push --delete origin vX.Y.Z   # Remote-Tag entfernen
git tag -d vX.Y.Z                 # lokal entfernen
git tag -a vX.Y.Z -m "ScriptZ vX.Y.Z"  # neu setzen
git push origin vX.Y.Z            # frischer Workflow-Trigger
```

Das Release-Objekt selbst wird dabei nicht doppelt - der gefailte
Run hatte ja noch keins erstellt. Der historische Failed-Run bleibt
in der Actions-History stehen, das ist OK.

Bei wiederholten Permission-Fehlern: prüfen, dass auf **Org- und
Repo-Ebene** unter Settings → Actions → General → "Workflow
permissions" jeweils "Read and write permissions" aktiv ist.

## Workflow nach jeder Änderung (wichtig)

Nach **jeder** abgeschlossenen Aufgabe (Feature, Fix, Refactor,
Doku-Update, egal was) **niemals automatisch committen, pushen oder
releasen**. Stattdessen einmal kurz innehalten und dem User eine
Zusammenfassung + Optionen geben:

1. **Was wurde geändert?** Ein Satz, plus Liste der angefassten
   Dateien. So kann der User selbst nochmal drüberschauen, bevor
   irgendwas rausgeht.
2. **Konsistenz-Check:** Ist die Landing mit betroffen (siehe Tabelle
   oben)? Müssen Versionen synchron gezogen werden? Wenn ja, sagen.
3. **Empfehlung + Optionen** für das weitere Vorgehen, abhängig von
   der Art der Änderung. Beispiele:
   - **Trivial** (Tippfehler, Kommentar, kleines Style-Detail):
     Direkt-Commit auf `main` reicht. Kein Release nötig.
   - **Kleiner, aber wichtiger Bugfix** (User merkt's, betrifft alle):
     Direkt-Commit auf `main` + Patch-Release `vX.Y.Z+1` empfehlen,
     damit der Auto-Updater die Fix ausrollt. Release-Checkliste
     durchgehen.
   - **Neues Feature oder nicht-trivialer Refactor:** PR auf GitHub
     vorschlagen, damit CodeRabbit drüberschaut. Erst nach Review +
     Merge ggf. Minor-Release `vX.Y+1.0`.
   - **Landing-only Änderung** (Texte, Bilder, Marketing): Direkt-
     Commit reicht, kein Versions-Bump - Vercel deployed bei Push.
   - **Risiko-Änderung** (Migrations, Storage-Format, Build-Pipeline):
     Immer PR, nie direkt - egal wie klein.
4. **Auf Antwort warten.** Erst handeln, wenn der User explizit sagt
   was er will (z.B. "ja, Patch-Release" oder "PR machen" oder "nur
   committen, kein Release"). Niemals in einem Rutsch durchziehen,
   auch wenn die Empfehlung offensichtlich scheint.

Diese Regel gilt **immer**, auch wenn der User vorher schon eine
Aufgabe ähnlich abgewickelt hat. Jede Änderung ist neu zu bewerten.

## Deutsche Texte

App und Landing sind beide auf Deutsch. In Code-Kommentaren und
Doku-Markdown wird normaler Bindestrich verwendet, **kein
Em-Dash**. Auch in von Claude generierten Texten.

**Echte Umlaute, keine ASCII-Ersatzschreibung.** In allen
deutschsprachigen Texten (Release-Notes, README, Landing,
UI-Strings, Code-Kommentare) immer `ä`, `ö`, `ü`, `ß` statt
`ae`, `oe`, `ue`, `ss`. Auch wenn die Tastatur das gerade
nicht hergibt - dann lieber kurz suchen als ein "haendisch"
ins Repo schreiben. Gilt insbesondere für Release-Notes,
weil die im GitHub-Release-Body stehen und User-sichtbar sind.
