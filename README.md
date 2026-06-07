# MOT v1 (Melo Operations Toolkit)

A lightweight Chrome extension that provides operational tools for Okta administrators directly from the Okta Admin Console.

MOT is designed to reduce the need for external scripts, API clients, and browser bookmarks by bringing commonly used support and administration functions into a single panel inside the admin dashboard.

---

## Current Version

v0.3.8

---

## Features

### Tenant Detection

Automatically identifies:

* Admin URL
* Tenant URL
* Cell
* Pipeline

  * Identity Engine (OIE)
  * Classic Engine
* Custom Domains

Organization metadata is retrieved from:

```text
/.well-known/okta-organization
```

---

### Connection Status

Displays:

* Extension status
* Tenant connectivity
* Session state

---

### API Session Validation

Validates that the current administrator session can successfully access Okta APIs.

Used to verify that MOT can perform administrative actions before tools are used.

---

## Bounce Email Manager

Provides visibility into bounced and deferred email deliveries.

### Search Ranges

* Last 24 Hours
* Last 7 Days
* Last 30 Days
* Last 90 Days

### Supported States

#### Bounce

```text
eventType = system.email.delivery
outcome.result = FAILURE
```

#### Deferred

```text
eventType = system.email.delivery
outcome.result = DEFERRED
```

Both event types are collected and merged into a single results table.

---

### Bounce Removal

Uses the supported Okta endpoint:

```http
POST /api/v1/org/email/bounces/remove-list
```

Example:

```json
{
  "emailAddresses": [
    "user@example.com"
  ]
}
```

Supports:

* Single email removal
* Multiple email removal
* Bulk selection

---

### Removal Confirmation CSV

After a successful removal operation, MOT generates a downloadable confirmation CSV.

Columns:

```text
timestamp
email_removed
response_header_request_id
response
```

Example response values:

```text
200 successful
403 forbidden
500 internal error
```

---

## User Interface

### MOT Panel

The panel can:

* Minimize
* Close
* Move to top
* Move to bottom

Panel state is remembered between page loads.

---

### Tabs

#### Connection

Displays:

* Admin URL
* Tenant URL
* Platform

#### Org Metadata

Displays:

* Cell
* Pipeline
* Custom Domains

#### API Test

Displays:

* Session validation results
* API accessibility

---

### Pagination

Bounce Manager supports:

* Result pagination
* Select All
* CSV export

Pagination controls remain hidden until search results are available.

---

### Design Standards

MOT uses a professional UI theme:

* Black
* White
* Gray

No product-specific branding colors are used.

Standard button spacing:

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

## Security

MOT does not:

* Store credentials
* Store session tokens
* Transmit data to third-party services

All API requests execute using the authenticated administrator session.

---

## Supported Domains

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

---

## Roadmap

### Phase 4

Bounce Audit & Verification

Planned:

* Bounce Removal History
* Audit Event Verification
* Removal Verification Status
* Removal History Export
* Actor Tracking from System Log Events

Relevant event type:

```text
system.email.bounce.removal
```

---

### Future Tools

Planned modules:

* Rate Limit Calculator
* User Lookup
* Group Analysis
* App Assignment Analysis
* System Log Helpers
* HAR Analysis Integration
* Splunk Query Generator

---

## Project Status

Active Development

Maintained by Noelmo Melo

MOT = Melo Operations Toolkit
