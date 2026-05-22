# Testing Strategy

## Current Automated Tests

The repository has a dependency-free Node unit test baseline.

| Test file                           | Coverage                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `tests/ai-chat-url.test.ts`         | ChatGPT URL host/protocol/credential normalization.                                       |
| `tests/settings-storage.test.ts`    | Settings normalization, numeric clamps, and unknown platform exclusion.                   |
| `tests/backup-repository.test.ts`   | Backup schema metadata, AI key stripping, unsupported version rejection, secret clearing. |
| `tests/mostaql-bid-tracker.test.ts` | Mostaql 30-day/24-hour bid stats and status buckets.                                      |

## Validation Commands

```bash
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
npm run lint:firefox
```

## Documentation Consistency Checks

Run focused `rg` scans for unsupported platform references, deleted legacy-doc references, and unresolved editorial markers before release. README and maintained docs should not link to deleted docs or contain unresolved markers.

## Manual Smoke Tests

Chrome and Firefox:

- load generated build
- open popup
- run manual check and diagnostics
- open dashboard
- save settings
- export and import a safe backup
- test notification and sound
- verify content panels on supported platform pages
- verify bridge prompt insertion on an allowed ChatGPT host

## Remaining Coverage Gaps

Current automated tests do not exercise:

- MV3 service-worker suspension/resume
- browser notification UI
- browser downloads and Blob URL lifecycle
- offscreen document creation in Chrome
- Firefox runtime behavior
- popup/dashboard browser accessibility
- live content-script DOM fixtures
- provider mock integration over runtime messages
- SignalR hub lifecycle in a browser

Adding browser E2E tooling would require an approved dependency and lockfile change.

Related docs:

- [`13-build-test-release.md`](13-build-test-release.md)
- [`15-maintainer-guide.md`](15-maintainer-guide.md)
