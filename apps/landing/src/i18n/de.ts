/**
 * Deutsche Strings für die Landing.
 *
 * Keys-Konvention: bereich.kontext.was (flach, dot-separated, lowercase).
 * Wer hier ändert, muss in `en.ts` denselben Key updaten - TypeScript
 * erzwingt das via `Record<keyof typeof de, string>` in en.ts.
 */
export const de = {
  // ===================== Hero =====================
  "hero.eyebrow": "SCRIPTZ // FÜR CONTENT CREATOR",
  "hero.h1.line1": "Schreiben",
  "hero.h1.line2": "statt formatieren.",
  "hero.lead":
    "Der Skripteditor für Content Creator. Eine Idee → ein fertiges Skript in wenigen Minuten. Kein Drehbuch-Korsett, keine KI, kein Abo. Nur du, deine Idee und ein Cursor, der dir aus dem Weg geht.",
  "hero.cta.download": "Kostenlos für macOS",
  "hero.cta.github": "Auf GitHub",
  "hero.meta.os": "macOS 13+",
  "hero.meta.zero": "0 Tracker · 0 Konten · 0 KI",
  "hero.web.intro": "Lieber erst ausprobieren?",
  "hero.web.link": "Direkt im Browser testen →",
  "hero.web.hint": "Test-Editor, lokal in deinem Browser. Daten bleiben dort.",

  "install.summary": "Beim ersten Öffnen blockiert macOS die App?",
  "install.body":
    "Das ist normal - ScriptZ ist Open Source und nicht bei Apple registriert. Einmal diesen Befehl im Terminal ausführen, danach läuft alles wie gewohnt:",
  "install.copy": "Kopieren",
  "install.copied": "Kopiert ✓",
  "install.copyManual": "Bitte manuell kopieren",
  "install.why":
    "Apple verlangt eine kostenpflichtige Signatur, die diesen Schritt überflüssig machen würde. Bis sich das lohnt, ist der kurze Befehl der Preis dafür, dass ScriptZ kostenlos und ohne Konto bleibt.",
  "install.whyShort.label": "Warum?",
  "install.whyShort.body":
    "Apple verlangt eine kostenpflichtige Signatur, die diesen Schritt überflüssig machen würde. Bis sich das lohnt, ist der kurze Befehl der Preis dafür, dass ScriptZ kostenlos und ohne Konto bleibt.",

  // ===================== App-Chrome / Tabs =====================
  "tab.home.title": "Übersicht",
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
  "tab.download.long": "Download - macOS, kostenlos",

  "status.opensource": "Open Source",
  "status.saved": "Gespeichert",

  "toolbar.back.aria": "Zurück zur Übersicht",
  "toolbar.back.label": "Übersicht",
  "toolbar.pill.action": "ACTION",
  "toolbar.pill.character": "CHARAKTER",
  "toolbar.pill.dialog": "DIALOG",
  "toolbar.download": "Download",

  // ===================== Tab: WARUM =====================
  "warum.caption": "INT. WRITE-SCRIPTZ.COM — JETZT",
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
  "quick.caption": "INT. QUICKMODUS — ZWEI SPRECHER, EIN FLOW",
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
  "noai.caption": "INT. KEIN-KI-MANIFEST",
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
  "cmp.caption": "EXT. KONKURRENZ — DER EHRLICHE VERGLEICH",
  "cmp.action1":
    "Andere Tools können vieles, was wir nicht können. Hier ist die Liste, was wir können, was sie nicht können:",
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
  "dl.caption": "INT. DOWNLOAD — EIN KLICK",
  "dl.action1":
    "macOS 13 oder neuer. Kostenlos. Open Source. Beim ersten Start: Rechtsklick aufs App-Icon → „Öffnen\". Apple verlangt das für unsignierte Apps. Updates kommen danach automatisch.",
  "dl.eyebrow.os": "macOS 13+",
  "dl.h": "Kostenlos. Lokal. Ohne Konto.",
  "dl.sub":
    "Ein .dmg, keine Tracker, kein Sign-in, kein „Updates per E-Mail\". Du lädst die App runter, ziehst sie in den Programme-Ordner, und das wars.",
  "dl.cta.dmg": ".dmg herunterladen",
  "dl.cta.code": "Quellcode auf GitHub",
  "dl.stat.version": "aktuelle Version",
  "dl.stat.tracker": "Tracker",
  "dl.stat.accounts": "Konten",
  "dl.stat.ai": "KI",
  "dl.stat.dmg": ".dmg",
  "dl.web.intro": "Kein Mac zur Hand?",
  "dl.web.link": "Direkt im Browser testen →",
  "dl.web.sub": "Test-Editor, kein Konto, alles lokal in deinem Browser.",
  "dl.sfxLabel": "SFX:",
  "dl.sfxText": "Erster Start",
  "dl.action2":
    "Beim ersten Öffnen meldet macOS, dass die App nicht überprüft werden kann. Das ist normal - ScriptZ ist Open Source und nicht bei Apple registriert. Einmal den Befehl unten im Terminal ausführen, danach läuft alles wie gewohnt.",
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
    "Ein Skripteditor für Content Creator, der dir aus dem Weg geht. Format passiert beim Tippen, Charaktere werden automatisch erkannt, der Quickmodus spart pro Sprecherwechsel zwei Tastendrücke. Alles lokal, alles in einer SQLite-Datei auf deinem Mac. Keine Cloud, kein Konto, keine KI.",
  "footer.about.os": "macOS 13+ · Open Source",

  // ===================== Sprint-Pille =====================
  "sprint.label": "Lese-Sprint",

  // ===================== Sprach-Toggle =====================
  "lang.toggle.aria": "Sprache wechseln",
  "lang.toggle.de": "DE",
  "lang.toggle.en": "EN",

  // ===================== Page-Meta =====================
  "meta.title": "ScriptZ - der Skripteditor für Content Creator",
  "meta.description":
    "Schreiben statt formatieren. Eine Idee → ein fertiges Skript in wenigen Minuten. Lokal, kostenlos, Open Source. Für TikTok, Reels und YouTube Shorts.",
  "meta.ogLocale": "de_DE",
} as const;
