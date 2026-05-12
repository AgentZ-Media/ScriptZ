/**
 * Deutsche Strings für die Landing.
 *
 * Keys-Konvention: bereich.kontext.was (flach, dot-separated, lowercase).
 * Wer hier ändert, muss in `en.ts` denselben Key updaten - TypeScript
 * erzwingt das via `Record<keyof typeof de, string>` in en.ts.
 *
 * Plattform-spezifische Strings tragen einen `.mac` / `.win`-Suffix.
 * Die Landing rendert beide Varianten und blendet die nicht-passende
 * via CSS aus (siehe `[data-platform="windows"] .mac-only { display: none }`
 * in landing.css). Default-Render ist macOS-Look fuer SEO und JS-aus.
 */
export const de = {
  // ===================== Hero =====================
  "hero.eyebrow": "SCRIPTZ // FÜR CONTENT CREATOR",
  "hero.h1.keyword": "Skripteditor für Content Creator.",
  "hero.h1.line1": "Schreiben,",
  "hero.h1.line2": "statt formatieren.",
  "hero.lead":
    "Der Skripteditor für Content Creator. Eine Idee → ein fertiges Skript in wenigen Minuten. Kein Drehbuch-Korsett, keine KI, kein Abo. Nur du, deine Idee und ein Cursor, der dir aus dem Weg geht.",
  "hero.cta.download.mac": "Kostenlos für macOS",
  "hero.cta.download.win": "Kostenlos für Windows",
  "hero.cta.github": "Auf GitHub",
  "hero.cta.allplatforms": "Andere Plattform? Alle Downloads auf GitHub →",
  "hero.meta.os.mac": "macOS 13+",
  "hero.meta.os.win": "Windows 10+",
  "hero.meta.zero": "0 Tracker · 0 Konten · 0 KI",
  "hero.web.intro": "Lieber erst ausprobieren?",
  "hero.web.link": "Direkt im Browser testen →",
  "hero.web.hint": "Test-Editor, lokal in deinem Browser. Daten bleiben dort.",

  // ===================== Page-Hero pro Route =====================
  // Auf jeder Route sitzt oben ein einheitlicher Page-Hero (Keyword-
  // Eyebrow + H1 + Subline + Download-CTA). Nur die Home-Variante
  // (`/`) nutzt die historischen `hero.h1.*` / `hero.lead`-Keys, weil
  // dort das Brand-Statement groesser bleibt. Sub-Routen ziehen aus
  // den `hero.{route}.*`-Keys hier drunter.
  "hero.warum.keyword": "WARUM SCRIPTZ",
  "hero.warum.title": "Skripte schreiben, ohne dass die App im Weg steht.",
  "hero.warum.subline":
    "Für Content Creator, die Skripte für TikTok, Reels und YouTube Shorts schneller fertigbekommen wollen - ohne Drehbuch-Korsett, ohne KI, ohne Abo.",

  "hero.quickmodus.keyword": "DAS DETAIL, DAS NIEMAND SONST KANN",
  "hero.quickmodus.title": "Quickmodus: der Two-Hander-Workflow für Reels und Shorts.",
  "hero.quickmodus.subline":
    "Zwei Sprecher, ein Enter. Der Cursor springt automatisch in den nächsten Charakter - ohne Tab, ohne Sprechernamen tippen. Spart pro Skript eine Minute.",

  "hero.noai.keyword": "DAS NO-AI-MANIFEST",
  "hero.noai.title": "Skripteditor ohne KI. Deine Stimme bleibt deine.",
  "hero.noai.subline":
    "Keine Chatbox, keine Vorschläge, kein „Verbessern\"-Button. Deine Skripte liegen lokal in einer SQLite-Datei, nicht in der Cloud.",

  "hero.vergleich.keyword": "DER EHRLICHE VERGLEICH",
  "hero.vergleich.title": "ScriptZ vs. Final Draft, Notion, ChatGPT, Word.",
  "hero.vergleich.subline":
    "Was ScriptZ kann, das die anderen nicht können - und wo wir bewusst klein bleiben. Als kostenlose Final-Draft-Alternative für Short-Form gebaut.",

  "hero.download.keyword": "KOSTENLOS, LOKAL, OPEN SOURCE",
  "hero.download.title": "ScriptZ kostenlos herunterladen - macOS und Windows.",
  "hero.download.subline":
    "Ein .dmg oder .exe. Kein Konto, keine Tracker, keine KI. Updates kommen automatisch über den eingebauten Updater.",

  "hero.ideen.keyword": "DIE IDEEN-INBOX",
  "hero.ideen.title": "Sammle, was du als Nächstes schreibst.",
  "hero.ideen.subline":
    "Skript-Ideen für TikTok, Reels und Shorts an einem Ort. Per Klick wird daraus ein fertiges Skript - offline, ohne Konto.",

  // ===================== Home-Section (`/`) =====================
  // Eigener Inhalt unterhalb des Page-Hero, statt den Warum-Tab zu
  // wiederholen: Screenshot-Galerie, drei Feature-Teaser, Vergleichs-
  // Hinweis, Closing-Download-Block.
  "home.gallery.h2": "Drei Ansichten, eine App.",
  "home.gallery.sub":
    "Übersicht, Ideen, Editor. Mehr braucht ein Skript-Tool nicht. Die Tabs oben sind die App.",

  "home.features.h2": "Drei Dinge, die nur ScriptZ kann.",
  "home.feature.quick.title": "Quickmodus für zwei Sprecher",
  "home.feature.quick.body":
    "Two-Hander-Dialog wie von selbst: Enter springt zum nächsten Charakter, kein Tab, kein Sprechername tippen. Spart pro 60-Sekunden-Reel eine Minute.",
  "home.feature.quick.link": "Quickmodus erklärt →",
  "home.feature.noai.title": "Bewusst ohne KI",
  "home.feature.noai.body":
    "Keine Vorschläge, kein „Verbessern\"-Button, kein Cloud-Upload. Deine Stimme bleibt deine, dein Skript bleibt lokal in einer SQLite-Datei.",
  "home.feature.noai.link": "Das Kein-KI-Manifest →",
  "home.feature.local.title": "Lokal, kostenlos, Open Source",
  "home.feature.local.body":
    "Ein Installer, kein Konto, keine Tracker. macOS oder Windows. Quellcode auf GitHub, alles in einer SQLite-Datei auf deinem Rechner.",
  "home.feature.local.link": "Auf GitHub ansehen →",

  "home.compare.h2": "Im Vergleich.",
  "home.compare.body":
    "Final Draft kann Spielfilm-Drehbücher. Notion kann Wikis. ChatGPT kann Brainstorming. ScriptZ kann: Skripte für Reels schnell. Das ist alles - und das wars uns wert.",
  "home.compare.cta": "Den ganzen Vergleich sehen →",

  "home.closing.eyebrow": "BEREIT?",
  "home.closing.h2": "Kostenlos. Lokal. Ohne Konto.",
  "home.closing.body":
    "macOS 13+ oder Windows 10+. Ein Klick, ein Installer, fertig. Kein Sign-in, keine Mail-Liste, keine Abos.",

  // macOS-Install-Hinweis
  "install.mac.summary": "Beim ersten Öffnen blockiert macOS die App?",
  "install.mac.body":
    "Das ist normal - ScriptZ ist Open Source und nicht bei Apple registriert. Einmal diesen Befehl im Terminal ausführen, danach läuft alles wie gewohnt:",
  "install.mac.why":
    "Apple verlangt eine kostenpflichtige Signatur, die diesen Schritt überflüssig machen würde. Bis sich das lohnt, ist der kurze Befehl der Preis dafür, dass ScriptZ kostenlos und ohne Konto bleibt.",
  "install.mac.whyShort.label": "Warum?",
  "install.mac.whyShort.body":
    "Apple verlangt eine kostenpflichtige Signatur, die diesen Schritt überflüssig machen würde. Bis sich das lohnt, ist der kurze Befehl der Preis dafür, dass ScriptZ kostenlos und ohne Konto bleibt.",

  // Windows-Install-Hinweis
  "install.win.summary": "Beim ersten Start meldet sich SmartScreen?",
  "install.win.body":
    "Das ist normal - ScriptZ ist Open Source und hat (noch) kein EV-Code-Signing-Zertifikat. Mit zwei Klicks ist es gelöst:",
  "install.win.step1": "1. Im SmartScreen-Dialog auf „Weitere Informationen\" klicken.",
  "install.win.step2": "2. Den dann erscheinenden Button „Trotzdem ausführen\" anklicken.",
  "install.win.why":
    "Microsoft verlangt für sofortige Akzeptanz ein kostenpflichtiges EV-Code-Signing-Zertifikat. Bis sich das lohnt, sind die zwei zusätzlichen Klicks der Preis dafür, dass ScriptZ kostenlos und ohne Konto bleibt.",
  "install.win.whyShort.label": "Warum?",
  "install.win.whyShort.body":
    "Microsoft verlangt ein EV-Code-Signing-Zertifikat. Bis sich das lohnt, sind zwei Klicks der Preis dafür, dass ScriptZ kostenlos und ohne Konto bleibt.",

  // Copy-Button (nur macOS, aber Strings teilen wir)
  "install.copy": "Kopieren",
  "install.copied": "Kopiert ✓",
  "install.copyManual": "Bitte manuell kopieren",

  // ===================== App-Chrome / Tabs =====================
  "tab.home.title": "Übersicht",
  "tab.home.long": "Skripteditor für TikTok, Reels und YouTube Shorts",
  "tab.home.aria": "Übersicht (zurück nach oben)",
  "tab.ideas.title": "Ideen",
  "tab.ideas.aria": "Ideen",
  "tab.warum.short": "Warum?",
  "tab.warum.long": "Skripte schreiben, ohne dass die App im Weg steht",
  "tab.quickmodus.short": "Der Quickmodus",
  "tab.quickmodus.long": "Quickmodus - der Trick, den niemand anders kann",
  "tab.noai.short": "Keine KI",
  "tab.noai.long": "Kein-KI-Manifest",
  "tab.compare.short": "Vergleich",
  "tab.compare.long": "Im Vergleich zu allem anderen",
  "tab.download.short": "Download",
  "tab.download.long.mac": "Download - macOS, kostenlos",
  "tab.download.long.win": "Download - Windows, kostenlos",

  "status.opensource": "Open Source",
  "status.saved": "Gespeichert",

  "toolbar.back.aria": "Zurück zur Übersicht",
  "toolbar.back.label": "Übersicht",
  "toolbar.pill.action": "ACTION",
  "toolbar.pill.character": "CHARAKTER",
  "toolbar.pill.dialog": "DIALOG",
  "toolbar.download": "Download",

  // ===================== Tab: WARUM =====================
  "warum.caption": "INT. SCRIPTZ — SKRIPTEDITOR FÜR TIKTOK, REELS UND YOUTUBE SHORTS",
  "warum.action1":
    "Eine leere Seite. Cursor blinkt. Du tippst und das Format passiert von allein. Charakter-Name? Automatisch zentriert und in Versalien. Tabulator? Block-Wechsel. Enter? Nächste Zeile - meistens schon im richtigen Block.",
  "warum.action2":
    "ScriptZ ist für Content Creator gebaut, nicht für Drehbuchautoren. Du willst kein 90-Minuten-Spielfilm-Layout. Du willst ein TikTok-Skript um halb drei fertig haben, bevor das gute Licht weg ist.",
  "warum.timo1.paren": "(direkt)",
  "warum.timo1.dialog":
    "Du tippst, der Editor formatiert. Charaktere werden automatisch erkannt, kriegen eine Farbe, eine Sprechzeit-Statistik. Du musst nichts anlegen. Du musst nichts klicken. Du musst nur schreiben.",
  "warum.axel1.dialog": "Das klingt nach jedem Tool seit 2015.",
  "warum.timo2.dialog":
    "Probier's. Mach ein Skript, schreib zwei Sprecher. Dann drück Enter. Du wirst sehen, dass der Cursor schon im richtigen Block landet, mit dem richtigen Sprecher davor. Das ist der Quickmodus. Genau das spart dir pro Wechsel zwei Tastendrücke - und bei einem 60-Sekunden-Reel mit 12 Wechseln spart das eine Minute.",
  "warum.axel2.paren": "(neugierig)",
  "warum.axel2.dialog": "Und KI? Macht sie mir vor, was ich sagen soll?",
  "warum.timo3.dialog":
    "Nein. Bewusst nicht. Kreativität ist dein Job. Wenn du wolltest, dass ein Modell für dich schreibt, hättest du ChatGPT auf.",
  "warum.cut": "CUT TO: SCREENSHOT",
  "warum.action3": "Drei Ansichten der App. Klick die Tabs - die App ist diese Tabs.",

  "shot.tab.overview": "Übersicht",
  "shot.tab.ideas": "Ideen",
  "shot.tab.editor": "Editor",
  "shot.alt.overview": "ScriptZ Übersicht mit Skript-Liste und Charakteren",
  "shot.alt.ideas": "ScriptZ Ideen-Inbox",
  "shot.alt.editor": "ScriptZ Editor mit Charakter-Highlights und Cast-Sidebar",

  "jump.label.long": "Weiter im Programm:",
  "jump.label.short": "Weiter:",
  "jump.btn.quickmodus": "→ Quickmodus erklärt",
  "jump.btn.noai": "→ Warum kein KI",
  "jump.btn.noaiAlt": "→ Warum keine KI",
  "jump.btn.compare": "→ Vergleich mit anderen",
  "jump.btn.compareShort": "→ Vergleich",
  "jump.btn.download": "→ Download",
  "jump.btn.backToStart": "→ Zurück zum Anfang",

  // ===================== Tab: QUICKMODUS =====================
  "quick.caption": "INT. QUICKMODUS — DER TWO-HANDER-WORKFLOW FÜR REELS UND SHORTS",
  "quick.action1":
    "Der Quickmodus ist das, was ScriptZ nicht ersetzbar macht. Sobald dein Skript genau zwei Sprecher hat, übernimmt er. Nach jedem Dialog und einmal Enter springt der Cursor automatisch in den anderen Charakter und gleich rein in den nächsten Dialog. Kein Tab, kein Sprechername tippen, kein zweites Enter.",
  "quick.sfxLabel": "SFX:",
  "quick.sfxText": "tack-tack-tack",
  "quick.action2":
    "Praktisch heißt das: pro Sprecherwechsel zwei Tastendrücke gespart. Bei einem typischen 60-Sekunden-Reel mit zehn bis zwölf Wechseln ist das fast eine Minute. Pro Tag drei Skripte? Drei Minuten. Pro Woche? Eine viertel Stunde, in der du nicht formatiert, sondern geschrieben hast.",
  "quick.timo1.dialog": "So sieht das in echt aus. Ich tippe etwas.",
  "quick.axel1.dialog": "Ich antworte. Enter.",
  "quick.timo2.dialog": "Cursor ist schon hier. Niemand hat „TIMO\" getippt.",
  "quick.axel2.dialog": "Niemand hat „AXEL\" getippt. Niemand hat Tab gedrückt.",
  "quick.timo3.dialog": "Wir schreiben einfach. Der Editor weiß, was wir wollen.",
  "quick.action3":
    "Drei Charaktere im Skript? Quickmodus pausiert automatisch - dann weiß der Editor nicht, wer als Nächster spricht. Sobald du wieder auf zwei reduzierst, ist er wieder da. Kein Schalter, kein Setting, kein Lernen.",
  "quick.callout.eyebrow": "DAS DETAIL, DAS ZÄHLT",
  "quick.callout.body":
    "Das machen weder Word, noch Notion, noch Final Draft, noch ChatGPT, noch Apple Notes. Bei uns ist es ein Kernfeature, von Anfang an. Wer schon mal zwei Sprecher gleichzeitig getippt hat, weiß, was das pro Tag spart.",

  // ===================== Tab: NO-AI =====================
  "noai.caption": "INT. KEIN-KI-MANIFEST — SKRIPTEDITOR OHNE KI",
  "noai.action1":
    "ScriptZ hat keine KI eingebaut. Kein Chatfenster, kein „schreib mir ein Skript\", kein automatisches Umformulieren, keine Vorschläge, keine Auto-Vervollständigung jenseits der Charakter-Namen aus deinem eigenen Skript. Bewusst nicht.",
  "noai.axel1.paren": "(skeptisch)",
  "noai.axel1.dialog": "Alle anderen Tools haben KI. Du verkaufst „keine KI\" als Feature?",
  "noai.timo1.dialog":
    "Ja. Weil deine Stimme dein Produkt ist. Wenn ein Modell dir die Hälfte des Skripts schreibt, ist die Hälfte der Stimme das Modell.",
  "noai.axel2.dialog": "Manchmal hängt man halt fest.",
  "noai.timo2.dialog":
    "Dann ist die Lösung nicht „lass das Modell ran\", sondern „mach drei Minuten Pause\". Wir haben dafür den Sprint-Timer und die Ideen-Inbox. Beides offline, beides ohne fremde Stimme.",
  "noai.camera": "CAMERA: HÄLT DRAUF.",
  "noai.card1.title": "Kein API-Key",
  "noai.card1.body": "Keine Cloud-Schlüssel, keine Tokens, keine Abrechnung pro Wort.",
  "noai.card2.title": "Kein Trainingsdaten-Beitrag",
  "noai.card2.body": "Dein Skript wird nicht hochgeladen. Es liegt lokal in einer SQLite-Datei.",
  "noai.card3.title": "Kein „verbessern\"-Button",
  "noai.card3.body": "Dein Skript ist nicht kaputt. Es braucht keine Verbesserung von außen.",
  "noai.card4.title": "Stattdessen: schneller Editor",
  "noai.card4.body":
    "Quickmodus, Charakter-Auto-Erkennung, Block-Hotkeys. Tools, die deine Idee aus deinem Kopf auf die Seite tragen - ohne sie umzuschreiben.",

  // ===================== Tab: VERGLEICH =====================
  "cmp.caption": "EXT. VERGLEICH — SCRIPTZ VS. FINAL DRAFT, NOTION, CHATGPT",
  "cmp.action1":
    "ScriptZ als Final-Draft-Alternative für Short-Form: andere Tools können vieles, was wir nicht können. Hier ist die Liste, was wir können, was sie nicht können:",
  "cmp.head.crit": "Was du brauchst",
  "cmp.row.format": "Format passiert ohne dich",
  "cmp.row.quick": "Quickmodus für 2 Sprecher",
  "cmp.row.chars": "Charaktere automatisch erkannt",
  "cmp.row.short": "Auf Short-Form ausgelegt",
  "cmp.row.noai": "Bewusst ohne KI",
  "cmp.row.local": "Kostenlos & lokal",
  "cmp.row.fast": "Auf in < 1 s",
  "cmp.mark.yes": "JA",
  "cmp.mark.no": "NEIN",
  "cmp.mark.feature": "Spielfilm",
  "cmp.mark.featureNo": "NEIN, Spielfilm",
  "cmp.mark.copilot": "Copilot",
  "cmp.mark.notionai": "Notion AI",
  "cmp.mark.isai": "Ist KI",
  "cmp.mark.beatai": "Beat AI",
  "cmp.mark.appleint": "Apple Int.",
  "cmp.mark.cloud": "Cloud",
  "cmp.mark.paid": "Bezahl",
  "cmp.mark.appleonly": "Apple-only",
  "cmp.mark.meh": "Naja",
  "cmp.action2":
    "Wir können nichts davon ersetzen. Final Draft kann eine Spielfilm-Drehbuchabgabe an die WGA. Notion kann ein Wiki. ChatGPT kann dir ein Brainstorming generieren. Wir können: Skripte für Reels schnell. Das ist alles - und das wars uns wert.",

  // ===================== Tab: DOWNLOAD =====================
  "dl.caption": "INT. DOWNLOAD — SCRIPTZ KOSTENLOS FÜR MACOS UND WINDOWS",
  "dl.action1.mac":
    "macOS 13 oder neuer. Kostenlos. Open Source. Beim ersten Start: Rechtsklick aufs App-Icon → „Öffnen\". Apple verlangt das für unsignierte Apps. Updates kommen danach automatisch.",
  "dl.action1.win":
    "Windows 10 oder neuer. Kostenlos. Open Source. Beim ersten Start meldet sich SmartScreen - einmal „Weitere Informationen\" → „Trotzdem ausführen\", danach läuft alles automatisch. Updates kommen ohne Hürde.",
  "dl.eyebrow.os.mac": "macOS 13+",
  "dl.eyebrow.os.win": "Windows 10+",
  "dl.h": "Kostenlos. Lokal. Ohne Konto.",
  "dl.sub.mac":
    "Ein .dmg, keine Tracker, kein Sign-in, kein „Updates per E-Mail\". Du lädst die App runter, ziehst sie in den Programme-Ordner, und das wars.",
  "dl.sub.win":
    "Ein .exe-Installer, keine Tracker, kein Sign-in, kein „Updates per E-Mail\". Doppelklick, fertig.",
  "dl.cta.dmg": ".dmg herunterladen",
  "dl.cta.exe": ".exe herunterladen",
  "dl.cta.code": "Quellcode auf GitHub",
  "dl.fallback.label": "Andere Plattform? Alle Downloads auf GitHub →",
  "dl.stat.version": "aktuelle Version",
  "dl.stat.tracker": "Tracker",
  "dl.stat.accounts": "Konten",
  "dl.stat.ai": "KI",
  "dl.stat.dmg": ".dmg",
  "dl.stat.exe": ".exe",
  "dl.web.intro": "Lieber erst ausprobieren?",
  "dl.web.link": "Direkt im Browser testen →",
  "dl.web.sub": "Test-Editor, kein Konto, alles lokal in deinem Browser.",
  "dl.sfxLabel": "SFX:",
  "dl.sfxText": "Erster Start",
  "dl.action2.mac":
    "Beim ersten Öffnen meldet macOS, dass die App nicht überprüft werden kann. Das ist normal - ScriptZ ist Open Source und nicht bei Apple registriert. Einmal den Befehl unten im Terminal ausführen, danach läuft alles wie gewohnt.",
  "dl.action2.win":
    "Beim ersten Start meldet sich der Windows SmartScreen, dass die App nicht überprüft werden kann. Das ist normal - ScriptZ ist Open Source und hat (noch) kein EV-Code-Signing-Zertifikat. Mit zwei Klicks ist es gelöst.",
  "dl.fadeOut": "FADE OUT.",
  "dl.end": "ENDE",

  // ===================== Tab: IDEEN =====================
  "ideas.h": "Ideen",
  "ideas.sub":
    "Sammle, was du als Nächstes schreiben willst — und mach daraus ein Skript, sobald die Idee Beine bekommt.",
  "ideas.input.placeholder": "Was schreibst du als Nächstes?",
  "ideas.search.placeholder": "In Ideen suchen…",
  "ideas.filter.open": "Offen",
  "ideas.filter.all": "Alle",
  "ideas.filter.used": "Verwendet",
  "ideas.sort": "Sortieren · Neueste",
  "ideas.btn.script": "Skript →",
  "ideas.btn.delete.aria": "Idee löschen",
  "ideas.hint.before": "in der App öffnet diese Inbox als Overlay — egal, wo du gerade bist. Eingeben, Enter, weiter.",

  // Ideen-Beispiele
  "ideas.sample.tutorial.title": "Tutorial: Vom leeren Cursor zum fertigen Skript in 5 Minuten",
  "ideas.sample.tutorial.body":
    "Screen-Recording mit Stoppuhr. Quickmodus aktivieren, einfach drauflos tippen, exportieren - fertig. Beweis statt Behauptung.",
  "ideas.sample.tutorial.age": "vor 2 Std.",
  "ideas.sample.fd.title": "Warum ich Final Draft für TikTok nicht mehr nutze",
  "ideas.sample.fd.body":
    "Lizenz, Drehbuch-Layout, Courier 12pt. Alles gebaut für 90 Min Film. Ich brauche 60 Sekunden.",
  "ideas.sample.fd.age": "vor 4 Std.",
  "ideas.sample.word.title": "Eine Schweigeminute für Word-Power-User",
  "ideas.sample.word.body":
    "Klick, klick, klick, klick. Einrückung manuell. Charakter-Name fett, neue Zeile, zentriert. Tab, tab, tab.",
  "ideas.sample.word.age": "vor 6 Std.",
  "ideas.sample.noai.title": "ScriptZ ohne KI - bewusst entschieden",
  "ideas.sample.noai.body":
    "Andere Tools schreiben dir das Skript. Wir schreiben dir gar nichts. Du bist der Creator, nicht das Modell.",
  "ideas.sample.noai.age": "vor 9 Std.",
  "ideas.sample.reel.title": "Reel: Quickmodus erklärt in 30 Sekunden",
  "ideas.sample.reel.body":
    "Two-hander Dialog. Enter drücken. Sprecher wechselt automatisch. Das wars.",
  "ideas.sample.reel.age": "vor 14 Std.",
  "ideas.sample.morning.title": "Was passiert, wenn man morgens nichts geschrieben hat",
  "ideas.sample.morning.body":
    "Streak bricht. Heatmap-Lücke. Tag verloren. So motivierend wie der Wecker um 6 Uhr.",
  "ideas.sample.morning.age": "vor 1 Tag",
  "ideas.sample.cliche.title": "Cliché GenZ im Bewerbungsgespräch",
  "ideas.sample.cliche.age": "gestern verwendet",

  // ===================== Footer =====================
  "footer.col.project": "Projekt",
  "footer.col.legal": "Recht",
  "footer.col.contact": "Kontakt",
  "footer.link.github": "GitHub",
  "footer.link.releases": "Releases",
  "footer.link.imprint": "Impressum",
  "footer.link.privacy": "Datenschutz",
  "footer.link.email": "E-Mail",
  "footer.about.eyebrow": "ÜBER SCRIPTZ",
  "footer.about.body":
    "Ein Skripteditor für Content Creator, der dir aus dem Weg geht. Format passiert beim Tippen, Charaktere werden automatisch erkannt, der Quickmodus spart pro Sprecherwechsel zwei Tastendrücke. Alles lokal, alles in einer SQLite-Datei auf deinem Computer. Keine Cloud, kein Konto, keine KI.",
  "footer.about.os.mac": "macOS 13+ · Open Source",
  "footer.about.os.win": "Windows 10+ · Open Source",

  // ===================== Sprint-Pille =====================
  "sprint.label": "Lese-Sprint",

  // ===================== Sprach-Toggle =====================
  "lang.toggle.aria": "Sprache wechseln",
  "lang.toggle.de": "DE",
  "lang.toggle.en": "EN",

  // ===================== Page-Meta =====================
  // Home (`/`) - bleibt der dominante Brand-Eintrag.
  "meta.title": "ScriptZ - der Skripteditor für Content Creator",
  "meta.description":
    "Schreiben statt formatieren. Eine Idee → ein fertiges Skript in wenigen Minuten. Lokal, kostenlos, Open Source. Für TikTok, Reels und YouTube Shorts.",
  // Warum-Route (`/warum-scriptz`)
  "meta.warum.title": "Warum ScriptZ - Skripteditor ohne Drehbuch-Korsett | für Reels und Shorts",
  "meta.warum.description":
    "ScriptZ ist für Content Creator gebaut, nicht für Drehbuchautoren. Format passiert beim Tippen, Charaktere werden automatisch erkannt. Für TikTok, Reels und YouTube Shorts.",
  // Quickmodus-Route (`/quickmodus`)
  "meta.quickmodus.title": "Quickmodus - Two-Hander-Workflow für Reels und Shorts | ScriptZ",
  "meta.quickmodus.description":
    "Der Quickmodus von ScriptZ schreibt Two-Hander-Dialoge automatisch: Enter springt zum nächsten Sprecher. Spart pro Skript eine Minute, ohne Tab und ohne Sprechernamen tippen.",
  // Keine-KI-Route (`/keine-ki`)
  "meta.noai.title": "Skripteditor ohne KI - das No-AI-Manifest | ScriptZ",
  "meta.noai.description":
    "ScriptZ hat bewusst keine KI eingebaut. Keine Vorschläge, kein „Verbessern\"-Button, kein Cloud-Upload. Deine Stimme bleibt deine, dein Skript bleibt lokal.",
  // Vergleichs-Route (`/vergleich`)
  "meta.compare.title": "ScriptZ vs. Final Draft, Notion, ChatGPT - der ehrliche Vergleich",
  "meta.compare.description":
    "ScriptZ als kostenlose Final-Draft-Alternative für TikTok, Reels und Shorts. Was wir können, was Word, Notion, Final Draft, ChatGPT und Apple Notes nicht können - und umgekehrt.",
  // Download-Route (`/download`)
  "meta.download.title": "ScriptZ kostenlos herunterladen - macOS und Windows | Open Source",
  "meta.download.description":
    "Skripteditor für Content Creator. Kostenlos, lokal, Open Source. macOS 13+ (.dmg) oder Windows 10+ (.exe). Kein Konto, keine Tracker, keine KI.",
  // Ideen-Route (`/ideen`)
  "meta.ideas.title": "Ideen-Inbox - was du als Nächstes schreibst | ScriptZ",
  "meta.ideas.description":
    "Sammle Skript-Ideen für TikTok, Reels und YouTube Shorts, wandle sie per Klick in ein fertiges Skript. Offline, ohne Konto, in der ScriptZ-App und im Browser.",
  "meta.ogLocale": "de_DE",
} as const;
