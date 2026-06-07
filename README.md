# MOT v1

**MOT v1** stands for **Melo Operations Toolkit v1**.

MOT v1 is a professional browser-extension-based operations toolkit. It is designed to run inside an authenticated admin browser session and provide lightweight administrative utilities without requiring static API tokens.

---

## Phase 2 Goal

Phase 2 adds the foundation required before building feature modules:

- Admin dashboard hostname detection
- Tenant URL derivation from admin URL
- Platform detection
- Organization metadata lookup using `/.well-known/okta-organization`
- Authenticated API session test using `/api/v1/logs?limit=1`
- Support for commercial, preview, EMEA, gov, and mil hostname patterns

---

## Supported Admin Hostname Patterns

MOT v1 currently injects only on admin dashboard URLs matching:

```text
*-admin.okta.com
*-admin.oktapreview.com
*-admin.okta-emea.com
*-admin.okta-gov.com
*-admin.okta.mil
```

Examples:

```text
integrator-4594550-admin.okta.com
ndentity-lab-admin.okta.com
```

---

## Tenant URL Detection

Admin URLs are not always the same as the regular tenant URL.

Example:

```text
Admin URL:
https://integrator-4594550-admin.okta.com

Tenant URL:
https://integrator-4594550.okta.com
```

MOT v1 derives the tenant URL from the admin URL and then calls:

```http
GET https://<tenant>/.well-known/okta-organization
```

This endpoint is used to gather tenant metadata such as pipeline/engine and custom domain information when available.

---

## API Session Test

MOT v1 also tests whether the current browser session can call the tenant API:

```http
GET https://<tenant>/api/v1/logs?limit=1
```

This confirms whether the admin session can reach APIs needed for future modules.

---

## Local Setup

1. Open Chrome or Edge.
2. Go to:

```text
chrome://extensions
```

or:

```text
edge://extensions
```

3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `mot-v1-phase2-org-detection` folder.
6. Open a supported admin dashboard URL.
7. Confirm the MOT panel shows:

```text
Admin URL
Tenant URL
Platform
Organization Metadata
API Session Test
```

---

## Phase 2 File Structure

```text
mot-v1/
├── README.md
├── manifest.json
├── content/
│   ├── content.js
│   └── content.css
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── background/
│   └── service-worker.js
├── modules/
│   └── utils.js
└── assets/
```

---

## Current Design Direction

MOT v1 is designed to look and feel like a professional enterprise operations tool.

Design principles:

- Black, white, and gray color palette
- Dark-mode-first experience
- Clean and minimal interface
- High information density
- Accessibility-focused
- Functional over decorative
- Consistent spacing and typography
- Enterprise-grade appearance

---

## Current Features

- Floating MOT panel
- Minimize and expand
- Close panel
- Move panel to top-right or bottom-right
- Admin dashboard detection
- Tenant URL derivation
- Platform detection
- Organization metadata lookup
- Authenticated API test

---

## Future TODO / Roadmap

### MOT-000: Tenant Detection

- [x] Detect current admin URL
- [x] Derive regular tenant URL from admin URL
- [x] Call `/.well-known/okta-organization`
- [x] Display tenant base URL
- [x] Display admin URL
- [x] Display platform
- [ ] Normalize pipeline/engine display after reviewing real endpoint responses
- [ ] Display custom domain list if available
- [ ] Improve custom domain parsing after reviewing real endpoint responses
- [x] Support commercial, preview, EMEA, gov, and mil tenant patterns

### MOT-001: Bounce Email Manager

- [ ] Query email delivery failures
- [ ] Add time range filters
- [ ] Extract bounced/deferred email addresses
- [ ] Deduplicate results
- [ ] Show count and last seen timestamp
- [ ] Remove single email from bounce list
- [ ] Remove selected emails from bounce list
- [ ] Export results to CSV
- [ ] Copy API request
- [ ] Copy System Log query
- [ ] Add success/failure result panel

### MOT-002: Email Delivery Dashboard

- [ ] Show total delivery failures
- [ ] Show bounce count
- [ ] Show deferred count
- [ ] Show top affected domains
- [ ] Show most common failure reasons
- [ ] Show trend by time range

---

## Security Principles

- No API tokens required
- No credential storage
- No external data collection
- No telemetry
- No tenant data sent to third-party services
- Use current authenticated browser session
- Confirm before write actions
- Keep permissions as narrow as possible

---

## Recommended Commit

```bash
git add .
git commit -m "Add tenant detection and API session test"
```


---

## Phase 2.1 Notes

### Custom Domain Detection

`/.well-known/okta-organization` may list custom domains under:

```json
"_links": {
  "alternate": {
    "href": "https://oie.example.com"
  }
}
```

or as multiple alternate links.

MOT v1 now checks `_links.alternate` and displays:

```text
No custom domains
```

or:

```text
oie.example.com, login.example.com
```

### Raw Metadata

Raw metadata is now hidden by default.

A future debug mode will expose raw metadata only when explicitly enabled.

### API Test

The API test now runs through the extension service worker instead of the content script directly. This avoids cross-origin fetch problems when the admin URL and tenant URL are different origins.


---

## Phase 3 Notes: Bounce Email Manager MVP

Phase 3 adds the first functional MOT v1 tool.

### What it does

- Searches System Log for `system.email.delivery` failures
- Supports 24h, 7d, 30d, and 90d presets
- Finds events containing `bounce` or `defer`
- Extracts email addresses from matching event payloads
- Deduplicates by email address
- Shows reason, count, and last seen timestamp
- Supports CSV export
- Supports removing selected addresses from the bounce list

### System Log query

```text
eventType eq "system.email.delivery" and outcome.result eq "FAILURE"
```

### Bounce removal endpoint

```http
POST /api/v1/org/email/bounces/remove-list
Content-Type: application/json

{
  "emailAddresses": [
    "name@company.com"
  ]
}
```

### Important implementation detail

Authenticated API calls use the admin origin.

Example:

```text
https://integrator-4594550-admin.okta.com/api/v1/logs
```

The regular tenant URL is still used for:

```text
/.well-known/okta-organization
```

### Known limitations

- Only fetches the first page of System Log results for now.
- Event parsing is intentionally broad and searches nested payload values for email addresses.
- Bounce/deferred classification may need refinement after reviewing more real event samples.
- Removal result currently only shows overall success/failure.
- Debug mode is still hardcoded as disabled.
