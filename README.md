# Rebound — Bounce List Manager for Okta

Rebound is a lightweight browser extension that helps Okta administrators clear
bounced and deferred email addresses off the suppression list — directly inside
the Okta Admin Console — so affected users can receive email again.

> Rebound was previously released as **MOT v1**. Same functionality, redesigned UI.

## Current Release

```text
v1.2.0
```

## Features

### Bounce List Manager

- Search bounced email delivery events
- Search deferred email delivery events
- Filter results by address and by state (Bounce / Deferred)
- Remove selected addresses from the bounce suppression list
- Export search results to CSV
- Per-removal audit CSV (one row per address, with response request IDs)
- Tenant metadata + custom-domain detection
- API session validation ("Session valid" indicator)
- Debug Mode toggle

## The three views

- **Results & selection** — big count of suppressed addresses for the selected
  time window, an address filter, `24h / 7d / 30d / 90d` range and
  `All / Bounce / Deferred` state controls, and a selectable results list.
- **Removed + audit** — after a removal: per-address confirmation and a
  downloadable audit CSV (`rebound-removal-YYYY-MM-DD.csv`).
- **All clear** — friendly empty state when a search returns nothing, with the
  range control so you can widen the window and re-run.

## Project Page

https://github.com/noelmom/rebound

## Download

- **Chrome / Edge Web Store:** _(link once published)_
- **Manual install:** grab the latest `rebound-<version>.zip` from the
  [Releases](https://github.com/noelmom/rebound/releases) page, then follow
  **Manual Installation** below.

## Screenshots

![Find, review, and remove bounced Okta emails](docs/Rebound-screenshot-1-find-review-1280x800.png)

![Removal confirmation with a downloadable audit trail](docs/Rebound-screenshot-2-restore-delivery-1280x800.png)

![Feature overview](docs/Rebound-screenshot-3-features-1280x800.png)

## Support

- Bug Report: https://forms.gle/41a3QX4bXD2C4ikC6
- Feature Request: https://forms.gle/KUsk1PZ3D2YwDsmU6
- Contact / Support: https://forms.gle/5pp1ZzU6zP5gYvBx9

## Security

_This section also serves as Rebound's privacy policy._

Rebound keeps tenant data inside your browser. It collects **no** personal
information, uses **no** analytics or trackers, and sends nothing to any
external server or third party.

**What Rebound accesses.** Using your already-authenticated Okta admin session,
Rebound reads bounced and deferred email delivery events from the Okta System
Log and, when you choose, submits bounce-list removals. All of this happens
directly between your browser and your own Okta tenant.

**What Rebound does NOT do:**

- Store credentials or API tokens
- Collect, sell, or share personal information
- Send tenant data, logs, metadata, search results, or CSV exports to a backend
- Use analytics, tracking, or third-party services

**Local storage.** Rebound saves only a few UI preferences (panel position,
minimized state, Debug Mode) locally in your browser. No account or tenant data
is stored.

All searches, processing, exports, and bounce-removal operations are performed
locally using the authenticated administrator browser session.

## Manual Installation

1. Download the latest Rebound ZIP package.
2. Extract the ZIP file.
3. Open `chrome://extensions` or `edge://extensions`.
4. Enable Developer Mode.
5. Click **Load unpacked**.
6. Select the extracted Rebound folder.
7. Log in to the Okta Admin Console.
8. Rebound opens automatically on supported admin URLs.

## Supported Admin Domains

```text
*.okta.com
*.oktapreview.com
*.okta-emea.com
*.okta-gov.com
*.okta.mil
```

## Release Notes

### v1.2.0

Rebound release (redesign of MOT v1).

Includes:

- Bounce List Manager
- Bounce and deferred email search
- Address + state filtering
- Bounce removal with per-address audit CSV
- Search results CSV export
- Tenant metadata + custom domain detection
- API session validation
- Debug Mode toggle
- Rebound extension popup

## Roadmap

Planned future features:

- Bounce Removal History using `system.email.bounce.removal`
- Removal verification from System Log
- Rate Limit Inspector
- User Lookup Helper
- System Log Query Builder

## Disclaimer

Rebound is an independent tool and is not affiliated with, endorsed by, or
sponsored by Okta, Inc. "Okta" and related marks are trademarks of Okta, Inc.,
used here only to describe compatibility.

## Copyright

Copyright © 2026 Noelmo Melo.

All rights reserved.
