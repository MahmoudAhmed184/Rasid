# Source Code Review

These instructions rebuild the Firefox MV3 package from the source ZIP attached to the GitHub release.

## Environment

- Node.js `>=20.19.0`.
- npm.

## Rebuild

From the extracted `frelancia-v1.0.0-firefox-sources.zip` directory:

```bash
npm ci
npm run build:firefox
npm run lint:firefox
npm run zip:firefox
```

The rebuilt Firefox extension ZIP is written under `dist/` as `frelancia-v1.0.0-firefox-mv3.zip`.

## Expected Manifest Checks

- Manifest version is MV3.
- Extension version matches `package.json`.
- Firefox omits the Chrome-only `offscreen` permission.
- Gecko ID is `frelancia@mostaql-notifier`.
- ChatGPT hosts are optional permissions and are not static content-script hosts.

The GitHub release also includes `SHA256SUMS.txt` and `release-evidence.json` generated from the maintainer release workflow.
