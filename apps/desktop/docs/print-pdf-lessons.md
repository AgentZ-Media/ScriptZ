# Drucken & PDF-Export — was wir gelernt haben

Notiz für zukünftige Sessions, damit wir nicht die gleichen Sackgassen
nochmal abarbeiten. Stand: 2026-05-07. Bei einem späteren Anlauf zuerst
hier reinschauen, dann erst Code schreiben.

## Status quo (Commit `c432d60`)

- **Editor on-screen**: Lexical + `Editor.css`, 14px / line-height 1.6,
  paper-Geometrie via mm in `tokens.css`.
- **Drucken (Cmd+P)**: HTML in offscreen `#scriptz-print-area` injizieren
  (siehe `src/lib/print.ts`), `@media print` versteckt alles andere,
  dann `window.print()` → macOS-Print-Sheet (User kann auch "Speichern
  als PDF" wählen).
- **PDF-Export**: eigener Rust-Renderer mit `printpdf`-Crate, eigene
  Wrap-Logik mit `CHAR_W_MM = 2.30` (siehe
  `src-tauri/src/commands/export.rs`).

Drei separate Render-Pfade, drei leicht unterschiedliche Outputs. Das
ist die Wurzel aller Probleme.

## Bekannte Bugs (nicht gefixt, dokumentiert)

1. **PDF-Export wickelt Zeilen anders um als der Editor**: weil
   `CHAR_W_MM = 2.30` jedes Zeichen gleich breit annimmt, iA Writer
   Quattro aber duospaced ist (i, l, t schmaler als M, W). Editor
   nutzt echte Browser-Font-Metriken, PDF nicht. → 1-2 Zeilen
   Versatz pro Absatz.
2. **Druck (Cmd+P → "Speichern als PDF") droppt manchmal die letzte
   Seite oder Teile davon**. Reproduzierbar mit längeren Skripten +
   aktivierter Titelseite. Wir vermuten WebKit's Print-Pagination im
   Zusammenspiel mit unserer offscreen-`position: absolute`-DOM-
   Struktur, aber konnten es ohne Runtime-Debugging nicht eindeutig
   einkreisen.

## Was wir versucht haben — und warum es nicht ging

### Versuch 1: `WKWebView.createPDF` (objc2-web-kit)

Idee: HTML in hidden `WebviewWindow` laden, `createPDF` aufrufen,
Bytes in Datei schreiben. Sollte WYSIWYG-Unifizierung Editor↔PDF
liefern.

**Warum nicht**: `createPDFWithConfiguration_completionHandler`
**ignoriert `@page`-CSS und Pagination komplett**. Es macht eine
einzige Bildschirmkopie der gesamten scrollbaren Seite — eine
endlos-lange "Seite" als PDF. Für ein Drehbuch unbrauchbar.

→ **Niemals wieder `createPDF` für mehrseitige PDFs.** Nur für
Single-Page-Snapshots geeignet (Thumbnails o.ä.).

### Versuch 2: `NSPrintOperation` mit Save-Disposition auf hidden WebviewWindow

Idee: dasselbe wie `window.print()`, aber programmatisch und mit
Ziel = Datei statt Print-Dialog. `NSPrintInfo.jobDisposition =
NSPrintSaveJob`, `NSPrintJobSavingURL` = Pfad,
`view.printOperationWithPrintInfo(info)`, `runOperation()`.

**Warum nicht**: hidden `WebviewWindow` + `runOperation` =
**Endlosschleife**. Schwarzes Fenster ploppt auf, App friert ein,
PDF-Datei wächst sekündlich um mehrere MB bis User die App killt
(nach 1 Min schon >200 MB). Vermutlich ein WebKit-Layout-Loop, weil
die hidden-window-WebView nicht richtig sized ist und der
Print-Pass keinen sauberen Layout-Grund hat. Auch
`.visible(false)` auf `WebviewWindowBuilder` hindert `runOperation`
nicht daran, das Fenster sichtbar zu machen.

→ **Niemals wieder NSPrintOperation auf eine hidden Tauri-WebView**.
Wenn wir den Pfad nochmal angehen, dann auf dem **Hauptfenster**.

### Versuch 3: `NSPrintOperation` auf der Haupt-WebView

Idee: HTML in `#scriptz-print-area` der Hauptansicht stagen (wie
`Cmd+P` schon macht), dann `runOperation` auf der Haupt-`WKWebView`
mit Save-Disposition. Selbe Engine wie `Cmd+P`, nur ohne
Print-Sheet, direkt in Datei.

**Warum nicht**: gleiche Endlosschleife wie Versuch 2, gleiches
Symptom (wachsende Datei, App-Hang). Selbst auf der Haupt-WebView.
Vermutung: irgendwas in unserer App-DOM (`#root` mit `display: none`
via `@media print`-Hack? globaler `overflow: hidden`?) macht der
Print-Engine den Hals zu, wenn sie im Save-Modus statt
Dialog-Modus läuft. Im Dialog-Modus (Cmd+P) klappt es.

→ Wenn wir **noch einmal** `NSPrintOperation` save versuchen, dann
**nur in einem isolierten iframe oder hidden-iframe-Doc**, nicht
gegen die Haupt-WebView mit komplexer App-DOM.

### Versuch 4: Editor.css ↔ Print-CSS auf gleiche Einheit ziehen

Idee: Beide auf `px` (statt `pt` im Print). CSS px = 1/96 inch in
allen Kontexten, sollte 1:1 transferieren.

**Warum nicht eindeutig**: hat keinen messbaren Effekt auf den
beobachteten Last-Page-Drop-Bug gehabt. Kann später nochmal angegangen
werden, hat aber kein Problem allein gelöst.

### Versuch 5: `padding-top: 30vh` → `80mm`, `widows/orphans: 1`, `break-inside: auto`

Idee: typische WebKit-Print-Quirks fixen — `vh` ist im Print-Pass
unzuverlässig, `widows/orphans` Defaults droppen Zeilen,
`break-inside: avoid` auf `.sz-group` kann bei zu großen Gruppen
Inhalt komplett unterdrücken.

**Warum nicht**: hat das Last-Page-Drop-Problem **nicht behoben**.
Mehrere Blöcke fehlten weiter im Print-PDF. Es ist also nicht (nur)
ein widows/orphans/break-inside-Thema.

### Versuch 6: iframe-Print

Angefangen, abgebrochen vom User. Idee war: Standalone-HTML-Doc mit
inline `@font-face` und `@page` in hidden iframe rendern, dann
`iframe.contentWindow.print()`. Damit ist der Print-Pass komplett
isoliert von Solid-Root, globalen Resets und @media-print-Scoping.

Status: ungetestet. Falls wir nochmal angreifen, hier weitermachen.
Ursprünglicher Code-Kommentar in `print.ts` warnt vor iframe wegen
"Load Race in WKWebView" — aber `document.open() / write() / close()`
ist synchron und vermeidet das Race. Plus `await
iframe.contentDocument.fonts.ready` vor `print()`. Das sollte
funktionieren.

## Lessons / Heuristiken für nächstes Mal

1. **Nicht in 5 Schritten bauen, in 1 testen.** Jeder Versuch
   hier hat 30+ Min Code geschluckt, dann beim ersten Realtest beim
   User gecrashed. Künftig: kleinste Iteration, Feedback,
   dann erst weiterbauen.
2. **Niemals einen Renderer ersetzen, der funktioniert, ohne
   Rollback-Plan.** Der `printpdf`-Pfad war bekannt und tat seinen
   Job (modulo Wrap-Versatz). Den abzureißen bevor der Ersatz steht
   = User hat funktionsloses Produkt.
3. **WKWebView + Tauri + Print ist eine Mienenfeld-Kombination.**
   Native Print-APIs haben Quirks, die ohne Runtime-Inspektion (Safari
   DevTools an die WKWebView pinnen, Console-Logs aus dem
   Print-Pass) **nicht** zu diagnostizieren sind. Wenn wir das
   nochmal angehen: zuerst Debug-Setup, dann Code.
4. **Eine echte Lösung für WYSIWYG-PDF auf Tauri/macOS müsste
   wahrscheinlich:** entweder (a) bei `printpdf` bleiben und nur den
   Wrap mit echten TTF-Glyph-Metriken statt fester `CHAR_W_MM`
   nachziehen, oder (b) iframe + `iframe.contentWindow.print()` für
   sowohl Druck als auch PDF (User klickt "Save as PDF" im macOS-
   Sheet). Beide Wege sind machbar, aber brauchen Ruhe und Testing.
5. **Bevor Architektur-Refactor: Reproduzierfall fixieren.** Der
   Last-Page-Drop-Bug wäre vielleicht in 30 Min mit DevTools direkt
   im Print-Pass eingekreist gewesen. Stattdessen Stunden auf neuen
   Render-Pfaden verbrannt, die das Symptom nicht mal getroffen haben.

## Wenn wir das wieder anfassen

Reihenfolge:

1. Last-Page-Drop im **bestehenden** `@media print` /
   `#scriptz-print-area` reproduzieren mit minimalem Test-Skript.
2. Safari DevTools an die WKWebView pinnen (Develop-Menü →
   "ScriptZ" → Webview), `Print`-Mode aktivieren in DevTools, das
   Layout im Print-Modus inspizieren — **bevor** Code geändert
   wird.
3. Ursache finden. Erst danach entscheiden ob Fix in CSS reicht
   oder ob iframe-Approach nötig ist.
4. Für PDF-Export-Genauigkeit: separates Thema, nicht im selben
   Anlauf mit dem Print-Bug vermischen. Die einfachste Verbesserung
   wäre `CHAR_W_MM` durch echte Glyph-Metriken aus den TTFs zu
   ersetzen (printpdf hat Font-API dafür).
