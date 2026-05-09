## Installation (nur beim ersten Mal)

1. Lade die `.dmg` unten herunter und öffne sie.
2. Zieh **ScriptZ.app** in deinen **Programme**-Ordner.
3. Die App ist **nicht signiert** (kein Apple-Developer-Account), deshalb
   weigert sich macOS, sie zu starten. Einmal im Terminal ausführen, um
   das Quarantäne-Flag zu entfernen:

   ```bash
   xattr -cr /Applications/ScriptZ.app
   ```

4. ScriptZ aus dem Programme-Ordner öffnen - jetzt startet sie normal.

Ohne Schritt 3 kommt die Meldung "ScriptZ ist beschädigt und kann nicht
geöffnet werden" oder "kann nicht geöffnet werden, weil der Entwickler
nicht überprüft werden kann". Das ist macOS Gatekeeper, nicht die App.
