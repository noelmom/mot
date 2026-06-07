# MOT v1 - Melo Operations Toolkit

A lightweight browser extension that provides operational tools directly inside the Okta Admin Console.

MOT is designed to reduce the need for external scripts, Postman collections, browser bookmarks, and one-off utilities by bringing commonly used administrative workflows directly into the authenticated admin experience.

---

# Current Status

```text
Phase 3
Version: v0.3.9rc1
Status: Stable Release Candidate
```

Maintainer:

```text
Noelmo Melo
```

---

# Project Goals

MOT follows a few core principles:

* No API tokens required
* No credential storage
* No external telemetry
* No tenant data sent to third-party services
* Use the current authenticated admin session
* Keep the interface professional and lightweight
* Build tools administrators actually use daily

---

# Supported Platforms

Current support:

```text
*.okta.com
*.oktapreview.com
*.okta-emea.com
```

Planned support:

```text
*.okta-gov.com
*.okta.mil
```

MOT only injects into Okta Admin Dashboard pages.

Examples:

```text
tenant-admin.okta.com
tenant-admin.oktapreview.com
tenant-admin.okta-emea.com
```

---

# Architecture

MOT uses a hybrid browser-extension architecture.

## Content Script

Responsible for:

* Rendering UI
* Handling user interactions
* Displaying results
* Managing panel state

## Background Service Worker

Responsible for:

* API reads
* System Log retrieval
* Pagination handling

## Page Bridge

Responsible for:

* Same-origin admin POST requests
* XSRF-protected operations
* Bounce removal requests

The page bridge executes in page context and avoids CSP restrictions.

---

# Tenant Intelligence

MOT automatically identifies tenant information using:

```http
GET /.well-known/okta-organization
```

Displayed information:

* Admin URL
* Tenant URL
* Cell
* Pipeline
* Custom Domains

---

## Example

Admin URL:

```text
https://integrator-4594550-admin.okta.com
```

Tenant URL:

```text
https://integrator-4594550.okta.com
```

Pipeline:

```text
OIE
```

Cell:

```text
OK14
```

Custom Domains:

```text
oie.company.com
login.company.com
```

---

# MOT Panel

The MOT panel supports:

* Minimize
* Close
* Move Top / Bottom
* Persistent Position
* Persistent Minimized State

---

## Header Controls

```text
[MOT] MOT v1

⚙ Settings
Top / Bottom
Minimize
Close
```

---

# Settings

Accessed through the gear icon.

Current settings:

```text
Enable Debug Mode
```

Debug Mode is stored locally and persists across sessions.

---

# Debug Mode

When enabled, MOT exposes:

* Raw Organization Metadata
* Generated System Log Queries
* Internal Debug Information
* Additional Troubleshooting Data

Debug content is hidden by default.

---

# Bounce Email Manager

The Bounce Email Manager provides visibility into email delivery failures and allows administrators to remove addresses from the bounce list.

---

## Search Ranges

```text
24 Hours
7 Days
30 Days
90 Days
```

---

## Supported States

### Bounce

Detected from:

```text
eventType = system.email.delivery
outcome.result = FAILURE
```

Displayed as:

```text
Bounce
```

---

### Deferred

Detected from:

```text
eventType = system.email.delivery
outcome.result = DEFERRED
```

Displayed as:

```text
Deferred
```

MOT performs separate searches for FAILURE and DEFERRED events and merges the results into a single view.

---

# Results Table

Displays:

```text
Email
State
Count
Last Seen
```

Example:

```text
john@example.com
Bounce
12
2026-06-07
```

---

# Pagination

Results are paginated.

Current page size:

```text
25 rows
```

Pagination controls remain hidden until results are available.

---

# Bounce Removal

Uses:

```http
POST /api/v1/org/email/bounces/remove-list
```

Example request:

```json
{
  "emailAddresses": [
    "user@example.com"
  ]
}
```

Supports:

* Single email removal
* Multi-select removal
* Bulk removal

---

# Removal Workflow

Administrators:

1. Search
2. Select addresses
3. Click Remove
4. Confirm operation
5. Download confirmation CSV

---

## Status Messages

Success:

```text
Bounce removal request completed.
```

Mixed results:

```text
Removal completed: X successful, Y errors.
```

Failure:

```text
Bounce removal failed.
```

---

# Removal Confirmation CSV

Generated after removal operations.

Columns:

```text
timestamp
email_removed
response_header_request_id
response
```

Example:

```text
2026-06-07T18:22:11Z
user@example.com
YT2h7A8j...
200 successful
```

Each email is processed independently so every row contains its own:

* Timestamp
* Request ID
* Response

---

# CSV Exports

Current exports:

### Bounce Search Results

```text
email
state
count
lastSeen
eventUuids
```

### Bounce Removal Confirmation

```text
timestamp
email_removed
response_header_request_id
response
```

---

# UI Standards

MOT follows a professional enterprise visual style.

Colors:

```text
Black
White
Gray
```

No vendor-specific branding colors.

---

## Standard Button Spacing

```css
.mot-button-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  margin-bottom: 12px;
}
```

---

# Release Notes

---

## v0.3.9rc1

### New Features

#### Debug Mode

Added:

* Settings panel
* Gear icon
* Persistent debug state

#### MOT Branding

Added:

* MOT badge
* Updated header styling

---

### Bounce Email Manager Improvements

Added:

* Deferred email support
* Multi-select removal
* Per-email audit tracking
* Improved CSV exports

---

### UI Improvements

Added:

* Internal panel scrolling
* Better handling for 1440x900 displays
* Improved minimized layout
* Better pagination controls

---

### Fixes

Resolved:

* Header disappearing during long searches
* Pagination controls showing before results
* CSV formatting issues
* Helper scope issues
* Confirmation dialog formatting
* Removal audit export problems

---

## v0.3.8

Introduced:

* Bounce Email Manager
* Deferred email support
* Removal confirmation CSV
* Tenant metadata
* API session validation

---

# Phase 4 Roadmap

Planned focus:

## Bounce Removal History

Using:

```text
system.email.bounce.removal
```

Potential fields:

```text
Timestamp
Actor
Email
Result
Request ID
```

---

## Planned Features

* Removal History
* Removal Verification
* Audit Timeline
* CSV Export
* System Log Correlation

---

# Future Tool Ideas

Potential MOT modules:

* Rate Limit Inspector
* User Lookup
* Group Membership Analysis
* Application Assignment Analysis
* Org Metadata Collector
* System Log Query Builder
* Splunk Query Generator
* HAR Analysis Helper
* Custom Domain Validator

---

# Security

MOT does not:

* Store credentials
* Store API tokens
* Send tenant data externally

All actions execute using the authenticated administrator session.

---

# Project Status

```text
Phase 3
Version: v0.3.9rc1
Status: Stable Release Candidate
```

MOT = Melo Operations Toolkit
