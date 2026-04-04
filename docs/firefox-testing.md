# Firefox Testing

## Temporary Loading

1. Run `npm run build`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on...`.
4. Select `dist/firefox-mv3/manifest.json`.
5. Use Firefox 140 or newer.
6. Use the `Reload` button after rebuilding.

## Suggested Smoke Test

1. Open `https://mostaql.com/projects`.
2. Open the extension popup and confirm stats render.
3. Open the dashboard and save settings.
4. Trigger `فحص الإشعار` and `فحص الصوت` from the dashboard.
5. Trigger `فحص الآن` from the popup.
6. Open a project page and verify:
    - `ذكاء` button opens ChatGPT.
    - `سريع` autofill prepares bid data.
    - `مراقبة` adds and removes tracked projects.
7. Export a project or chat and confirm the generated HTML opens without external assets.

## Optional CLI

If `web-ext` is installed locally or globally:

```bash
web-ext run --source-dir dist/firefox-mv3
web-ext lint --source-dir dist/firefox-mv3
```
