---
paths:
  - "apps/landing/**"
  - "apps/desktop/src/**"
  - "apps/web/src/**"
  - "packages/core/styles/**"
  - "packages/core/i18n/**"
---

# Konsistenz App ↔ Landing

Die Landing ist das **Schaufenster** der App. Wenn an der App etwas
verändert wird, muss die Landing nachgezogen werden, sonst zeigt sie
ein Produkt, das es so nicht mehr gibt. Vor dem Abschluss einer
App-Aufgabe immer prüfen, ob die Landing mit betroffen ist. Bei
Unsicherheit lieber kurz beim User nachfragen statt auseinanderlaufen
lassen.

Auslöser, bei denen die Landing **mit** angepasst werden muss:

| Änderung in der App (Desktop oder Web) | Was in der Landing folgen muss |
|---|---|
| Neues Feature, das ein User merkt | Ggf. Aufnahme in Features-Sektion oder Vergleichstabelle ([apps/landing/src/components/Features.astro](apps/landing/src/components/Features.astro), [Compare.astro](apps/landing/src/components/Compare.astro)). Wenn es ein Top-3-Feature ist, eines der bestehenden ablösen. Wenn das Feature im Web *nicht* funktioniert, im Web-CTA-Hinweis ehrlich erwähnen. |
| Feature entfernt | Aus Features, Vergleich, Demo, Texten rauswerfen. Versprechen wie "lokal" oder "kein Konto" gegenchecken. |
| Design-Token geändert (Farbe, Schrift, Radius, Spacing) in `packages/core/styles/` | [apps/landing/src/styles/tokens.css](apps/landing/src/styles/tokens.css) angleichen, falls die Landing den App-Look spiegeln soll. |
| Editor-Layout geändert (Block-Typen, Einrückung, ALLCAPS-Regel, Spacing-Cluster) | [Workflow.astro](apps/landing/src/components/Workflow.astro) Schritt 3 ("Schreiben") so anpassen, dass die Demo weiterhin 1:1 dem echten Editor entspricht. |
| App-Chrome verändert (Tab-Bar, Status-Strip, Trafficlight-Position) | Demo-Frame nachziehen, sonst sieht die Demo aus wie eine alte Version. |
| Schriftart oder Schrift-Größen | [src/styles/fonts.css](apps/landing/src/styles/fonts.css) und Tokens. |
| `app_icon`, Branding | Icons in `apps/landing/public/img/` neu setzen. |
| Plattform-Support erweitert (z.B. Windows-Build) | Hero-Meta, Download-Sektion, Compare-Tabelle, "First-Run"-Anleitung anpassen. |
| Lizenzmodell, Tracking-Verhalten, Konto-Verhalten | OpenSource-Sektion und Datenschutzerklärung gegenchecken. |
| Versionsnummer der Desktop-App | Siehe Release-Checkliste in `.claude/rules/release.md`. |
| Disclaimer-/Limit-Texte der Web-App (`apps/web/src/components/WebDisclaimerBanner.tsx`) | "Direkt im Browser testen"-CTA und der zugehörige Hinweistext auf der Landing müssen mit dem Banner-Text konsistent bleiben. |

Praktisch heißt das: nach jeder nicht-trivialen App-Änderung mit
einem Blick durch [apps/landing/src/](apps/landing/src/) gehen und
prüfen, ob Texte, Demo, Vergleich noch stimmen. Bei reinen
Bug-Fixes oder Code-Refactors ohne User-sichtbare Wirkung muss nichts
passieren.
