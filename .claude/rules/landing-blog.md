---
paths:
  - "apps/landing/src/content/**"
  - "apps/landing/src/components/blog/**"
  - "apps/landing/src/lib/remarkDialogue.mjs"
  - "apps/landing/src/lib/blog.ts"
  - "apps/landing/src/content.config.ts"
  - "apps/landing/src/pages/blog/**"
  - "apps/landing/src/pages/en/blog/**"
  - "apps/landing/src/pages/rss.xml.ts"
  - "apps/landing/src/pages/en/rss.xml.ts"
  - "apps/landing/src/styles/blog.css"
---

# Landing-Blog-System

Die Landing trägt ein eigenes Blog-System unter `/blog` (DE) und
`/en/blog` (EN). Beiträge liegen als Markdown-Dateien im Repo,
gerendert durch Astro Content Collections.

## Workflow für einen neuen Beitrag

1. **Immer zuerst die deutsche Fassung schreiben.** Erst wenn die
   DE-Version inhaltlich UND stilistisch sitzt, kommt die englische
   1:1-Übersetzung als `en.md` daneben. Kein Parallel-Schreiben in
   beiden Sprachen, sonst wird die Übersetzung ungleichmäßig.
2. Ordner anlegen unter `src/content/blog/<slug>/`. Slug-Konvention:
   ISO-Datum plus Kurzthema, z.B. `2026-05-20-quickmodus-update`.
3. `de.md` schreiben (Frontmatter + Body), Bilder in den
   gleichen Ordner legen, im Frontmatter via `cover: "./cover.jpg"`
   referenzieren, inline via `![alt](./images/x.png)`.
4. Beitrag fertig? `en.md` daneben anlegen, **identisches Frontmatter
   bis auf Sprache der Strings**, Body 1:1 übersetzen.
5. `draft: true` versteckt den Beitrag im Production-Build, im
   Devserver bleibt er sichtbar. `_example/` und alle Slugs mit
   Underscore-Präfix erscheinen nie öffentlich (Template-Konvention).

[`src/content/blog/_example/de.md`](apps/landing/src/content/blog/_example/de.md)
ist die lebende Referenz: zeigt jeden unterstützten Block-Typ und
listet die Schreibregeln. Bei Unsicherheit dort nachschauen.

## Schreibregeln (nicht verhandelbar)

- **Echte Umlaute, niemals ASCII-Ersatz.** `ä`, `ö`, `ü`, `ß` -
  nicht `ae`, `oe`, `ue`, `ss`. Gilt für Body, Frontmatter, Code-
  Beispiele im Body. Wenn die Tastatur das gerade nicht hergibt,
  lieber suchen als ein "haendisch" ins Repo schreiben.
- **Normale Bindestriche, keine Em/En-Dashes.** Im DE wie im EN.
  Em-Dashes (`—`) sind ein verlässliches Erkennungsmerkmal für KI-
  Texte und sollen daher nirgends auftauchen. Vor dem Commit
  einmal nach `—` und `–` suchen, wenn unsicher.
- **Gerade Anführungszeichen.** `"so"` statt `„so"` oder `"so"`.
  Editor-Smart-Quotes vorher ausschalten.

## Nicht wie eine KI klingen (wichtig)

Damit der Blog Stimme behält und nicht wie aus einem Modell fällt,
hier die typischen Tells - destilliert aus dem Wikipedia-Artikel
[Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing).
Davon konsequent Abstand halten:

- **"Nicht nur X, sondern auch Y"** ist Modell-Reflex. Stattdessen
  eine konkrete Behauptung machen ohne den Doppelkontrast.
- **Floskel-Vokabeln**: facettenreich, vielfältig, bedeutsam,
  wegweisend, lebendig, robust, vertieft, Ökosystem, Landschaft,
  Reise, Vermächtnis, beleuchten, unterstreichen. Wenn so eines im
  Entwurf auftaucht: rausnehmen oder durch was Konkretes ersetzen.
- **Künstliche Bedeutsamkeit** vermeiden: "Dies markiert einen
  Wendepunkt", "Das ist mehr als nur..." - so schreibt niemand
  freiwillig. Einfach beschreiben, was passiert ist.
- **Dreier-Adjektiv-Stacks** vermeiden ("schnell, effizient und
  elegant"). Eines reicht meist.
- **Vage Hedges** wie "Studien zeigen", "Experten argumentieren",
  "Branchenberichte deuten an" sind Modell-Sprache. Entweder
  konkrete Quelle nennen oder die Aussage selbst tragen.
- **Quellen-Aufzählung als Existenzbeweis** vermeiden: "Wie unter
  anderem in The Verge, Wired und Heise berichtet". Wenn ein Beleg
  zählt, einen direkt verlinken.
- **Metaphern in abstrakte Nomen ausbauen** ist ein klassischer
  Tell: "im reichhaltigen Ökosystem an Tools" → "zwischen Final
  Draft, Notion und ChatGPT". Konkret bleiben.

## Skript-Optik im Body

Body-Markdown rendert in derselben Skript-Optik wie die Landing-
Sections - Slugline, Action, Charakter, Dialog, Parenthetical. Das
übernimmt ein kleines Remark-Plugin
([`src/lib/remarkDialogue.mjs`](apps/landing/src/lib/remarkDialogue.mjs)),
das Dialog-Blockquotes der Form `> **NAME:** Text...` in dieselben
`v2-block v2-character/dialog/parenthetical`-Klassen verwandelt, die
die Landing nutzt - dadurch sieht der Blog visuell wie ein Auszug aus
einem echten Skript aus.

Wesentliches:

- **H2** wird zur **Slugline** (klein, uppercase, gestrichelter
  Strich davor).
- **Blockquote mit `**NAME:**`** wird zum **Dialog-Block**: Name
  zentriert in eingefärbter Pille (TIMO/AXEL = Landing-Tints,
  andere = Hash-Hue über goldenen Winkel verteilt), Dialog 16%
  eingerückt mit Charakter-Tint pro Zeile.
- **`> **NAME:** *(parenthetical)*`** rendert das Parenthetical
  als eigene Zeile (22% eingerückt, kursiv, gedämpft).
- **Blockquote ohne Charakter-Präfix** bleibt klassisches Zitat.
- **Code-Blöcke** rendern via Shiki mit `github-light`-Theme.
- **Bilder** über `<Image>` von Astro: AVIF, srcset, korrekte
  `width`/`height` gegen CLS.

Vollständige Liste in
[`src/content/blog/_example/de.md`](apps/landing/src/content/blog/_example/de.md).

## SEO + RSS

Astro Content Collections + Frontmatter steuern alles automatisch:

- `<title>`, `meta description`, Canonical, OG/Twitter-Cards aus
  `title`/`description`/`cover` im Frontmatter.
- JSON-LD `BlogPosting`-Schema pro Post mit Author, Publisher,
  `datePublished`/`dateModified`, `image`, `inLanguage`.
- Hreflang-Alternates DE↔EN, automatisch über
  [`Base.astro`](apps/landing/src/layouts/Base.astro) + Override im
  Blog-Page-Wrapper für den Sprach-Toggle.
- Sitemap zieht alle Routen automatisch (`@astrojs/sitemap`).
- RSS-Feed pro Sprache: `/rss.xml` (DE), `/en/rss.xml` (EN). Ein
  neuer Beitrag erscheint dort, sobald `draft: false` und Datum
  gesetzt sind.
- Reading-Time wird im Body berechnet (200 WPM-Heuristik in
  [`src/lib/blog.ts`](apps/landing/src/lib/blog.ts)).

Footer (inkl. Blog-Link und RSS) lebt in einer einzigen Komponente
[`SiteFooter.astro`](apps/landing/src/components/SiteFooter.astro), die
sowohl AppShell als auch LegalShell einbinden. Das heißt: jede Page der
Landing zeigt denselben Footer-Inhalt. Wer dort etwas ändert, ändert
es überall - bewusst so gebaut.

## Wenn du am Blog-System etwas änderst

- **Markdown-Pipeline:** das Remark-Plugin lebt in
  [`src/lib/remarkDialogue.mjs`](apps/landing/src/lib/remarkDialogue.mjs).
  Astros Content-Layer cached die gerenderte MD aggressiv in
  `node_modules/.astro/data-store.json`. Nach Plugin-Änderungen
  ggf. `rm -rf apps/landing/node_modules/.astro apps/landing/.astro`
  vor dem nächsten Build, sonst sieht man die alte HTML-Ausgabe.
- **Neue Frontmatter-Felder:** Schema in
  [`src/content.config.ts`](apps/landing/src/content.config.ts) erweitern,
  dann zusätzliche Renderung in
  [`BlogPost.astro`](apps/landing/src/components/blog/BlogPost.astro) oder
  [`BlogIndex.astro`](apps/landing/src/components/blog/BlogIndex.astro)
  ergänzen. Bestehende Beiträge sollten weiterhin valide bleiben - neue
  Felder also `optional()` oder mit `default(...)` belegen.
- **Neue Block-Typen:** entweder durch Standard-Markdown abdecken
  (bevorzugt) oder durch zusätzliche Remark-Plugins. MDX ist
  installiert, aber im Default unbenutzt - Beiträge bleiben
  `.md`, damit sie portabel bleiben.
- **Neue i18n-Keys:** wie in
  [`/.claude/rules/i18n.md`](i18n.md) beschrieben - in `de.ts` UND
  `en.ts` ergänzen, TypeScript erzwingt das. Blog-Keys liegen im Block
  am Datei-Ende unter `// Blog`.
