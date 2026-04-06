# AMO Review Notes

## Package Under Review

- Firefox build output: `dist/firefox`
- Shared manifest source: `manifests/base.json`
- Firefox manifest overlay: `manifests/firefox.json`
- Minimum Firefox version for the AMO package: `140.0`
- Minimum Firefox for Android version if Android compatibility is enabled: `142.0`

## Third-Party Libraries

- `signalr.min.js`
- `jszip.min.js`

These files are intentionally committed in minified form for runtime use. The repository itself is the corresponding source package and includes the build script in `scripts/build.mjs`.

## External Services Used

- `https://mostaql.com/*`
- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://frelancia.runasp.net/*`

## Reviewer Test Flow

1. Load `dist/firefox/manifest.json` temporarily from `about:debugging`.
2. Open `https://mostaql.com/projects`.
3. Open the popup and click `فحص الآن`.
4. Open the dashboard and test:
    - notification test
    - audio test
    - tracked projects list
    - settings save
5. Open a Mostaql project page and verify:
    - proposal helper buttons render
    - tracked-project toggle works
    - export button works

## Firefox-Specific Notes

- Firefox uses `background.scripts`; Chrome uses a service worker build.
- Firefox does not support notification action buttons. The extension falls back to click-to-open notifications.
- Firefox does not use the Chrome offscreen document path. HTML parsing runs directly in the background page.
- The Firefox manifest declares `browser_specific_settings.gecko.data_collection_permissions.required = ["websiteContent"]`.

## Known Review-Sensitive Areas

- The extension stores settings and job metadata in `storage.local`.
- The extension interacts with Mostaql pages and AI chat pages through content scripts.
- The extension can download user-requested exports through the Downloads API.
