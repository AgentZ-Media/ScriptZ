## Install (first time only)

1. Download the `.dmg` below and open it.
2. Drag **ScriptZ.app** into your **Applications** folder.
3. The app is **unsigned** (no Apple Developer account), so macOS
   will refuse to open it. Run this once in Terminal to remove the
   quarantine flag:

   ```bash
   xattr -cr /Applications/ScriptZ.app
   ```

4. Open ScriptZ from Applications — it will now launch normally.

If you skip step 3, you'll see "ScriptZ is damaged and can't be
opened" or "cannot be opened because the developer cannot be
verified". That's macOS Gatekeeper, not the app.
