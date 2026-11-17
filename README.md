# Tagesbericht

Web app for filling in the daily report (Tagesbericht) on a laptop or phone and printing it as a PDF that matches the paper form.

- Entries are saved automatically in the browser (localStorage).
- **Tag → PDF** prints the current day; **Woche → PDF** prints every day of the week that has entries, one A4 page per day.
- In the print dialog choose "Als PDF speichern" / "Save as PDF" (on iPhone: Print → share icon → Save to Files).
- Backup export/import (⋯ menu) moves the data to another device.
- **Sync laptop ↔ phone** (⋯ → Sync einrichten): data is stored in a private GitHub Gist.
  Create a token at https://github.com/settings/tokens/new?scopes=gist (only the `gist` scope) and paste the same token on each device.
  Changes sync automatically a moment after typing and whenever the app is opened. Conflicts are resolved per day (newest edit wins).

## Deploy on GitHub Pages
Settings → Pages → Source: *Deploy from a branch* → pick the branch and `/ (root)` → Save.
