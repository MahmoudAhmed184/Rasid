# Security Policy

Rasid is a browser extension that can read supported marketplace pages, store extension settings, open AI-provider requests when configured by the user, and insert generated proposal text into pages for user review. Security reports should avoid public disclosure until maintainers have had a chance to investigate.

## Supported Versions

| Version                                  | Supported |
| ---------------------------------------- | --------- |
| Current `main` branch                    | Yes       |
| Latest published package, when available | Yes       |
| Older unpublished snapshots              | No        |

## Reporting A Vulnerability

Do not open a public issue for a vulnerability.

Use GitHub private vulnerability reporting if it is enabled for this repository. If it is not enabled, open a public issue that asks maintainers for a private security contact, but do not include exploit details, secrets, personal data, account data, or marketplace content in that issue.

Useful private report details:

- affected browser and extension build
- affected extension area
- exact reproduction steps
- impact and attacker prerequisites
- whether the issue involves website content, stored data, AI provider requests, downloads, notifications, or generated proposal text
- sanitized logs or screenshots
- suggested fix or mitigation, when available

## Security Scope

In scope:

- unauthorized access to extension storage or secrets
- unsafe backup/import/export behavior
- unsafe content-script, DOM, message, or URL handling
- unexpected network destinations or host-permission behavior
- remote-code execution or dynamic-code execution paths
- generated proposal text being submitted without user action
- download or ZIP behavior that bypasses documented safety limits

Out of scope:

- reports that require physical access to an unlocked machine without another vulnerability
- marketplace account compromise unrelated to this extension
- AI-provider output quality or hallucination without a security impact
- unsupported browsers or modified extension builds
- social engineering without a technical vulnerability in this repository

## Maintainer Handling

Maintainers should triage private reports before public discussion, verify the issue against current source, prepare a fix on a private branch or advisory when needed, and update `README.md`, `PRIVACY.md`, store-review notes, and source-reference docs if the fix changes behavior or data handling.
