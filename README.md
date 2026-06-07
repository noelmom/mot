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


---

## Phase 3.1 Notes

### Bounce Removal Fix

Bounce removal now uses direct page-context fetch from the content script instead of the service worker.

This matches the admin-page request context used by browser-side admin tools and avoids false permission failures on:

```http
POST /api/v1/org/email/bounces/remove-list
```

### Ignored Emails

The Bounce Email Manager now ignores system-generated email addresses:

```text
system@okta.com
```

### Pagination and Larger Result Sets

Browser-friendly defaults:

```text
System Log fetch limit per API page: 200
Maximum System Log pages fetched initially: 5
Maximum events processed initially: 1,000
UI page size: 25 email rows
```

The UI now shows:

```text
Showing 1-25 · Page 1 of N
```

and includes Previous/Next buttons.

### Service Worker Header Support

The service worker now supports returning response headers. This is used to read the System Log `Link` header and follow up to 5 pages of results.


---

## Phase 3.2 Notes

### Bounce Removal XSRF Fix

Bounce removal now sends the Okta XSRF token header for POST requests.

The token is read from the browser cookie:

```text
XSRF-TOKEN
```

and sent as:

```http
X-Okta-XsrfToken: <token>
```

This is required for some admin-session write actions even when GET API calls work.

### Updated Bounce Removal Behavior

If the XSRF cookie is missing, MOT v1 now shows:

```text
Missing XSRF-TOKEN cookie. Refresh the admin page and try again.
```

If the POST still returns 403, the UI now indicates that the request may be denied due to XSRF/session context rather than assuming the admin lacks permissions.


---

## Phase 3.3 Notes

### Page Context POST Fix

The previous XSRF approach attempted to read the `XSRF-TOKEN` cookie from the content script. Some environments do not expose that cookie to content scripts.

Bounce removal now uses a page-context bridge:

```text
content script → injected page script → same-origin fetch('/api/v1/org/email/bounces/remove-list')
```

This better matches the request model used by browser-side admin tools because the POST runs inside the actual admin page context.

### Bounce Removal Request

```http
POST /api/v1/org/email/bounces/remove-list
Content-Type: application/json

{
  "emailAddresses": [
    "user@example.com"
  ]
}
```

The request uses a relative URL from the admin page origin.


---

## Phase 3.4 Notes

### External Page Bridge

The previous page-context bridge used inline injected JavaScript. Some admin pages may block inline scripts through Content Security Policy.

Phase 3.4 moves the bridge to an external extension file:

```text
page/page-bridge.js
```

and exposes it through Manifest V3:

```json
"web_accessible_resources": [
  {
    "resources": ["page/page-bridge.js"],
    "matches": ["https://*.okta.com/*"]
  }
]
```

The content script injects this external file into the page context and then uses window events to request same-origin page fetches.

This is intended to support admin-page-context POST requests for:

```http
POST /api/v1/org/email/bounces/remove-list
```


---

## Phase 3.5 Notes

### XSRF Token Source

Rockstar-style admin page POST requests use the page-provided XSRF token element:

```text
#_xsrfToken
```

Phase 3.5 updates the external page bridge to read the token from the actual admin page context and send:

```http
X-Okta-XsrfToken: <value from #_xsrfToken>
```

It also sends:

```http
X-Okta-User-Agent-Extended: MOT-v1
```

This more closely matches the browser-side admin request pattern.


---

## Phase 3.6 Notes

### Bounce Removal Confirmation CSV

After a successful or partially successful bounce removal request, MOT v1 now shows:

```text
Selected emails removed from bounce list. Download confirmation CSV.
```

The downloadable CSV includes:

```text
email_removed
actor_requested_removal
response_header_request_id
timestamp
response
```

### Response Field

A `200` response with no API errors is recorded as:

```text
200 successful
```

Any non-200 response or API-level errors are recorded with the status code and error details.

### Request ID

The page bridge now returns response headers so MOT can capture request IDs such as:

```text
x-okta-request-id
x-request-id
request-id
```


---

## Phase 3.7.1 Notes

### CSP-Safe UI Cleanup

This build keeps the Phase 3.7 UI cleanup but removes the accidental inline script bridge path.

The page bridge is loaded only from:

```text
page/page-bridge.js
```

through Manifest V3 `web_accessible_resources`, avoiding inline script CSP violations.

### Included UI Changes

- Connection, Org Metadata, and API Test now use tabs in one card.
- Generated Query is hidden unless debug mode is enabled.
- Select Page is hidden when no results exist.
- Pagination controls are hidden when there is only one page.
- The confusing “More results may exist” message was removed.
- Confirmation CSV columns are now:
  - timestamp
  - email_removed
  - response_header_request_id
  - response


---

## Phase 3.7.3 Notes

### Bounce Manager UI Fix

- `Select page` has been renamed to `Select all`.
- The result toolbar is hidden before a search is performed.
- Pagination controls are hidden before a search is performed.
- Previous/Next actions now do nothing when there are no results.


---

## Phase 3.8 Notes

### Deferred State Support

MOT v1 now explicitly searches for both email delivery states:

```text
eventType eq "system.email.delivery" and outcome.result eq "FAILURE"
eventType eq "system.email.delivery" and outcome.result eq "DEFERRED"
```

The Bounce Email Manager merges both result sets and displays:

```text
Bounce
Deferred
```

The results table header was updated from `Reason` to `State`.

### Why This Was Needed

Deferred email events may appear as:

```text
outcome.result = DEFERRED
outcome.reason = deferred
```

These events are not returned when filtering only on:

```text
outcome.result eq "FAILURE"
```


---

## Phase 3.8.4 Notes

### CSV Helper Scope Fix

Verified that all CSV helpers exist and are defined before use:

```text
csvEscape
downloadTextFile
getResponseRequestId
createBounceRemovalConfirmationCsv
buildRemovalAuditRow
```

Both CSV flows now use shared helpers:

```text
Bounce search export
Bounce removal confirmation export
```

A JavaScript syntax check was performed before packaging.


---

## Phase 3.8.5 Notes

### Confirmation Dialog and Download Helper Fix

- Fixed removal confirmation prompt so selected emails display on separate lines.
- Restored `showRemovalConfirmationDownload()` in the correct scope.
- Verified JavaScript syntax before packaging.


---

## Phase 3.8.6 Notes

### CSV Line Break and Debug Cleanup

- Fixed removal confirmation CSV so exported rows use real CSV line breaks.
- Hidden detailed removal error output from the normal UI.
- Detailed per-email removal responses remain available in the confirmation CSV.
- The bottom error/debug output is now hidden behind future Debug Mode behavior.
