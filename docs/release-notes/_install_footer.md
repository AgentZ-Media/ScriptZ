## Installation (nur beim ersten Mal)

### macOS (Apple Silicon)

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

### Windows (x64)

1. Lade den `.exe`-Installer unten herunter und führe ihn aus.
2. Beim ersten Start meldet sich **Windows SmartScreen**: "Der
   Computer wurde durch Windows geschützt." Die App ist **nicht
   signiert** (kein EV-Code-Signing-Zertifikat), deshalb kennt
   SmartScreen sie noch nicht.
3. Auf **"Weitere Informationen"** klicken, dann auf den dann
   erscheinenden Button **"Trotzdem ausführen"**.
4. Ab da läuft ScriptZ normal. Auto-Updates funktionieren danach
   ohne weitere Hürden.

Ohne Schritt 3 bricht SmartScreen die Ausführung ab. Das ist
Windows-Schutz, nicht die App.
