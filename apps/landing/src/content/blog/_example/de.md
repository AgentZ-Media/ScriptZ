---
title: "Referenz: alle Block-Typen + Schreibregeln"
description: "Spickzettel für jeden neuen Blog-Beitrag. Zeigt jeden unterstützten Markdown-Block in der Skript-Optik und listet die Schreibregeln, die für ScriptZ-Beiträge gelten."
date: 2026-05-13
author: "Timo"
tags: ["referenz", "template"]
draft: false
---

Dieser Beitrag erscheint nicht öffentlich (Underscore-Präfix im Slug)
und ist absichtlich als lebendige Referenz angelegt. Wer einen neuen
Beitrag schreibt, kopiert diesen Ordner unter neuem Namen, passt das
Frontmatter an und löscht hier raus, was nicht passt.

## Workflow

1. **Immer zuerst die deutsche Fassung schreiben.** Erst wenn die DE-
   Version inhaltlich und stilistisch sitzt, kommt eine 1:1-Übersetzung
   in eine zweite Datei `en.md` daneben. Kein Parallel-Schreiben in
   beiden Sprachen, weil sonst die Übersetzung ungleichmäßig wird.
2. **Bilder leben im Beitrags-Ordner**, nicht in `public/`. Frontmatter
   referenziert `cover: "./cover.jpg"`, Inline-Bilder gehen mit
   `![alt](./images/screenshot.png)`. Astro übernimmt die responsive
   Auslieferung mit AVIF und srcset.
3. **Slug ist der Ordnername** und sollte ein ISO-Datum plus
   Kurzthema sein: `2026-05-20-quickmodus-update`. Macht die
   Sortierung im Dateibaum vorhersehbar.

## Schreibregeln

> **Diese drei Regeln sind nicht verhandelbar.** Wer beim Schreiben
> automatisch reflexartig den falschen Strich oder ein "ae" tippt,
> sucht und ersetzt das vor dem Commit.

- **Echte Umlaute, niemals ASCII-Ersatz.** Es heißt `ä`, `ö`, `ü`, `ß`,
  nicht `ae`, `oe`, `ue`, `ss`. Selbst wenn die Tastatur gerade keine
  Umlaute liefert: lieber kurz suchen, als ein "haendisch" ins Repo
  schreiben.
- **Normale Bindestriche, keine Em-Dashes.** Ein einfaches `-` reicht
  überall. Em-Dashes (`—`) und En-Dashes (`–`) sind verboten, auch
  weil sie ein verlässliches Erkennungsmerkmal für KI-Texte sind.
- **Gerade Anführungszeichen.** `"so"` statt `„so"` oder `"so"`. Wer
  einen Editor mit Smart Quotes nutzt, schaltet das vor dem Schreiben
  aus.

### Nicht wie eine KI klingen

Damit der Text nicht wie aus einem Modell fällt, hilft eine Liste der
typischen Tells - inspiriert vom Wikipedia-Artikel
[Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing).
Davon möglichst weit weg bleiben:

- **Keine "Nicht nur X, sondern auch Y"-Rhetorik.** Sätze wie "Das ist
  nicht nur schneller, sondern auch eleganter" hört man hauptsächlich
  von Modellen. Stattdessen eine konkrete Behauptung machen.
- **Keine Floskel-Vokabeln.** Wörter wie "facettenreich", "vielfältig",
  "bedeutsam", "wegweisend", "lebendig", "robust", "vertieft",
  "Ökosystem", "Landschaft", "Reise", "Vermächtnis" sind Verdächtige.
  Wenn so eines auftaucht, einmal nachfragen, ob man das selbst so
  sagen würde.
- **Keine künstliche Bedeutsamkeit.** Sätze wie "Dies markiert einen
  Wendepunkt in der Entwicklung von..." sind Modell-Tonfall. Einfach
  beschreiben, was passiert ist.
- **Keine Dreier-Adjektiv-Stacks.** "Schnell, effizient und elegant"
  ist Modell-Reflex. Eines reicht meist.
- **Keine Aufzählung von Quellen als Existenzbeweis.** "Wie unter
  anderem in The Verge, Wired und Heise berichtet" - so schreibt
  niemand. Wenn ein Beleg wichtig ist, einen direkt verlinken.
- **Keine vagen Hedges.** "Studien zeigen", "Experten argumentieren",
  "Branchenberichte deuten an" - entweder konkrete Quelle benennen
  oder weglassen.
- **Konkrete Bilder statt Metaphern.** Statt "ein reichhaltiges
  Ökosystem an Tools" lieber "Final Draft, Notion und ChatGPT".

## Block-Typen

Was Markdown im Blog rendern kann. Wer einen neuen Beitrag schreibt,
braucht nicht alles davon - das hier ist der Vollkatalog.

### Action-Absatz

Ein normaler Markdown-Absatz wird zum Action-Block: linksbündig,
locker fliessend. So liest sich der Großteil eines Beitrags. **Fett**
und *kursiv* funktionieren wie überall, dazu Inline-`code` und
[Inline-Links](https://write-scriptz.com).

### Slugline (H2)

Eine H2 (`## Slugline`) rendert klein, in Versalien, mit einem
gestrichelten Strich davor. Das markiert einen neuen Abschnitt im
Beitrag - so wie eine Slugline im Skript eine neue Szene markiert.
Drei oder vier Slugs pro Beitrag reichen meistens.

### Sub-Slug (H3)

Eine H3 ist eine kleinere Slugline, ohne den Strich-Marker. Für
Unterstrukturen innerhalb einer Sektion gut.

#### Headings ab H4

H4 bis H6 rendern als normale, leise Headings ohne Skript-Gimmick.

### Charakter + Dialog

Ein Blockquote, der mit `**NAME:**` startet, wird zum Dialog-Block.
Der Name landet zentriert, uppercase, mit einer farbigen Pille pro
Sprecher (Hash zu Farbe, deterministisch). Die Charaktere `TIMO` und
`AXEL` haben fest die Brand-Tints aus der Landing - alle anderen
kriegen einen Hash-Hue über den goldenen Winkel verteilt, damit sie
sich optisch klar unterscheiden.

> **TIMO:** So sieht ein klassischer Dialog-Block aus. Eine Zeile,
> ein Sprecher, fertig.

> **AXEL:** *(skeptisch)*
> Inline-Parenthetical direkt nach dem Namen funktioniert auch.
> Folgezeilen bleiben beim selben Sprecher, bis ein neuer Blockquote
> startet.

> **TIMO:** Ein Block mit mehreren Absätzen.
>
> Der zweite Absatz vom selben Sprecher landet eingerückt direkt
> darunter - die Charakter-Pille zeigt für Folge-Absätze keine neue
> Zeile, der Sprecher bleibt zugeordnet.

### Klassisches Zitat

Ein Blockquote ohne `**NAME:**`-Präfix bleibt ein editorial Zitat
mit gestrichelter Vertikallinie davor und Kursivschrift:

> "Schreiben ist umschreiben." - irgendein Autor irgendwann.

### Listen

Bullet-Liste mit gestricheltem Marker:

- Erstes Element.
- Zweites mit etwas mehr Text - eine Liste lebt davon, dass die
  Punkte unterschiedlich lang sind.
- Drittes mit [Inline-Link](https://write-scriptz.com).

Geordnete Liste:

1. Wenn die Reihenfolge zählt.
2. Sieht genauso schlicht aus.

### Code

Inline-Code für kurze Befehle: `pnpm dev:landing`.

Block-Code mit Syntax-Highlighting (github-light-Theme über Shiki):

```bash
pnpm install
pnpm dev:landing
```

```ts
function greet(name: string): string {
  return `Hallo, ${name}.`;
}
```

### Akt-Trenner

Drei Bindestriche werden zur gestrichelten Trennlinie, gut für
Themen-Wechsel mitten im Beitrag:

---

Danach geht's mit einem neuen Gedankenstrang weiter.

### Bilder

`![Screenshot der ScriptZ-Übersicht](./images/beispiel.png)` rendert
das Bild über die volle Breite mit Border. Der `alt`-Text wird zur
Screenreader-Beschreibung und zur SEO-Bildbeschriftung. Bilder leben
neben der Markdown-Datei, nicht in `public/`.

## SEO + RSS

Frontmatter steuert alles Wichtige automatisch:

- `title` und `description` landen in `<title>`, OG-Tags, Twitter-
  Cards und JSON-LD-`BlogPosting`-Schema.
- `cover` (optional) wird als OG-Image genutzt und auf der
  Übersichts-Seite als Thumbnail.
- `date` ist Pflicht und steuert die Sortierung in der Übersicht.
- `updated` (optional) erscheint als "Aktualisiert am ..." im Meta-
  Block und als `dateModified` im JSON-LD.
- `tags` rendern als Pillen unter Titel und Beschreibung.
- `draft: true` versteckt den Beitrag im Production-Build, im
  Devserver bleibt er sichtbar.

Beiträge tauchen automatisch im RSS-Feed (`/rss.xml` für DE,
`/en/rss.xml` für EN) auf, sobald die Markdown-Datei existiert und
`draft: false` gesetzt ist.

## Schluss

Wenn du bis hierher gelesen hast, kennst du das System. Den ganzen
Ordner kopieren, neue Datei als `de.md` anlegen, schreiben, dann
übersetzen.
