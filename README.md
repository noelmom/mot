# MOT v1

MOT v1 is a professional browser-extension-based operations toolkit.

## Phase 1 Goal

Phase 1 only verifies that:

- The extension loads
- The content script runs on supported tenant pages
- A professional MOT v1 floating panel renders
- No API calls are made yet

## Load Locally

1. Open Chrome or Edge.
2. Go to `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `mot-v1` project folder.
6. Open a supported tenant admin page.
7. Confirm the MOT v1 panel appears.

## Phase 1 File Structure

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

## Next Phase

Phase 2 will add an authenticated API connectivity test against:

```text
/api/v1/logs?limit=1
```
