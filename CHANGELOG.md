# Changelog

## v1.2.0 - 2026-11-14

Release focusing on Arabic number/duration parsing accuracy, quiet hours notification reliability, content script autofill performance optimization, popup security hardening, and backend SQLite caching.

### Release Artifacts

- Chrome MV3 extension package: `rasid-v1.2.0-chrome-mv3.zip`.
- Firefox MV3 extension package: `rasid-v1.2.0-firefox-mv3.zip`.
- Firefox review source package: `rasid-v1.2.0-firefox-sources.zip`.
- SHA-256 checksum manifest: `SHA256SUMS.txt`.
- Build and manifest evidence: `release-evidence.json`.

### Added & Improved

- **Arabic Number & Duration Parsing**: Added normalization for Persian/Urdu digits `[۰-۹]`, Arabic comma `،` and thousands separator `٬` stripping between digits, decimal separator `٫` conversion, and multi-week/month token parsing (`أسبوع`, `أسابيع`, `شهر`, `أشهر`).
- **Monitoring & Quiet Hours Reliability**: Fixed quiet hours notification filtering so matching start and end times evaluate to inactive rather than muting notifications 24/7.
- **Autofill Performance Optimization**: Resolved lifecycle leaks in content script autofill by permanently disconnecting mutation observers and terminating interval polling after successful autofill.
- **Security & Lifecycle Hardening**: Guarded admin message URLs against unsafe protocol injection in popup, filtered storage change listeners, and ensured full cleanup on popup unload.
- **Platform Selectors & Permission Deduplication**: Added array selector query fallback support with element deduplication in Nafezly, and consolidated duplicate AI host permission logic.
- **Backend Infrastructure**: Added persistent SQLite seen-job cache with configurable fallback, resilient crawler engine, and modularized endpoints.

## v1.1.0 - 2026-11-14

Feature release introducing individualized job notifications, modernized monochrome UI design, and platform stability fixes.

### Release Artifacts

- Chrome MV3 extension package: `rasid-v1.1.0-chrome-mv3.zip`.
- Firefox MV3 extension package: `rasid-v1.1.0-firefox-mv3.zip`.
- Firefox review source package: `rasid-v1.1.0-firefox-sources.zip`.
- SHA-256 checksum manifest: `SHA256SUMS.txt`.
- Build and manifest evidence: `release-evidence.json`.

### Added & Improved

- **Individual Job Notifications**: Batch job notifications now spawn independent desktop notifications for every project with dedicated title, budget, description snippet, platform icon, and click-through payload, while keeping chime audio to once per batch.
- **Modernized Monochrome UI**: Completely overhauled popup, dashboard, and content script injected panels (Mostaql, Khamsat, Nafezly) with sleek, modern Vercel-inspired monochrome styling.
- **New Chrome Radar Branding**: Updated extension icons with modern chrome radar emblems across all sizes (16px, 48px, 128px).
- **DOM & CSP Hardening**: Secured HTML parsing against DOM XSS across all marketplace parsers and replaced inline event handlers with standards-compliant event listeners.
- **ChatGPT Bridge & Settings**: Fixed host permission requesting and improved ChatGPT bridge and settings workflows.

## v1.0.1 - 2026-08-07

Maintenance release with rebranding updates and monitoring stability improvements.

### Release Artifacts

- Chrome MV3 extension package: `rasid-v1.0.1-chrome-mv3.zip`.
- Firefox MV3 extension package: `rasid-v1.0.1-firefox-mv3.zip`.
- Firefox review source package: `rasid-v1.0.1-firefox-sources.zip`.
- SHA-256 checksum manifest: `SHA256SUMS.txt`.
- Build and manifest evidence: `release-evidence.json`.

### Fixed & Improved

- Rebranded extension name, documentation, tests, and configuration from Freelancia (فريلانسيا) to Rasid (راصد).
- Implemented per-platform rate limiting for job hydration to prevent request bursts and rate limits during monitoring.

## v1.0.0 - 2026-06-05

Initial GitHub release for Rasid.

### Release Artifacts

- Chrome MV3 extension package: `rasid-v1.0.0-chrome-mv3.zip`.
- Firefox MV3 extension package: `rasid-v1.0.0-firefox-mv3.zip`.
- Firefox review source package: `rasid-v1.0.0-firefox-sources.zip`.
- SHA-256 checksum manifest: `SHA256SUMS.txt`.
- Build and manifest evidence: `release-evidence.json`.

### Included

- Monitoring, filtering, notifications, project tracking, and proposal drafting for Mostaql, Khamsat, and Nafezly.
- User-mediated ChatGPT bridge mode through optional ChatGPT host permissions.
- Chrome offscreen support for local audio, DOM parsing, and ZIP Blob URL tasks.
- Firefox MV3 build without Chrome-only offscreen permission.
- Manual GitHub-only draft release workflow for maintainer approval.

### Out Of Scope

- Chrome Web Store submission.
- Firefox AMO signing or submission.
- Automated browser-store publishing credentials.
- Backend release artifacts.
