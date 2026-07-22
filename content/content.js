(() => {
  const PANEL_ID = "rebound-panel";
  const DEBUG_MODE_DEFAULT = false;

  const LOG_FETCH_LIMIT = 200;
  const MAX_LOG_PAGES = 5;

  const IGNORED_EMAILS = new Set([
    "system@okta.com"
  ]);

  const STORAGE_KEYS = {
    minimized: "reboundMinimized",
    position: "reboundPosition",
    debugEnabled: "reboundDebugEnabled"
  };

  const ADMIN_HOST_PATTERNS = [
    { adminSuffix: "-admin.okta.com", tenantSuffix: ".okta.com", platform: "Commercial" },
    { adminSuffix: "-admin.oktapreview.com", tenantSuffix: ".oktapreview.com", platform: "Preview" },
    { adminSuffix: "-admin.okta-emea.com", tenantSuffix: ".okta-emea.com", platform: "EMEA" },
    { adminSuffix: "-admin.okta-gov.com", tenantSuffix: ".okta-gov.com", platform: "Government" },
    { adminSuffix: "-admin.okta.mil", tenantSuffix: ".okta.mil", platform: "Military" }
  ];

  const RANGE_OPTIONS = [
    { days: 1, label: "24h" },
    { days: 7, label: "7d" },
    { days: 30, label: "30d" },
    { days: 90, label: "90d" }
  ];

  const STATE_FILTERS = ["All", "Bounce", "Deferred"];

  // ---- runtime state ----
  let bounceResults = [];
  const selectedEmails = new Set();
  let currentDays = 1;
  let currentStateFilter = "All";
  let currentTextFilter = "";
  let currentView = "results"; // results | removed | clear
  let hasSearched = false;
  let processedLogEvents = 0;
  let lastCheckedLabel = "";
  let lastRemoval = null; // { rows, csv, filename, successCount, errorCount }
  let panelEnabled = true;
  let panelEventController = null;

  // ---------------------------------------------------------------------------
  // Host / tenant helpers
  // ---------------------------------------------------------------------------
  function getAdminHost() {
    return window.location.hostname.toLowerCase();
  }

  function getAdminOrigin() {
    return window.location.origin;
  }

  function getApiOrigin() {
    return getAdminOrigin();
  }

  function getAdminPattern(host = getAdminHost()) {
    return ADMIN_HOST_PATTERNS.find((pattern) => host.endsWith(pattern.adminSuffix));
  }

  function isAdminDashboardHost() {
    return Boolean(getAdminPattern());
  }

  function getTenantHostFromAdminHost(host = getAdminHost()) {
    const pattern = getAdminPattern(host);
    if (!pattern) return null;
    return host.replace(pattern.adminSuffix, pattern.tenantSuffix);
  }

  function getTenantOriginFromAdminHost(host = getAdminHost()) {
    const tenantHost = getTenantHostFromAdminHost(host);
    return tenantHost ? `https://${tenantHost}` : null;
  }

  function getPlatformName(host = getAdminHost()) {
    const pattern = getAdminPattern(host);
    return pattern ? pattern.platform : "Unknown";
  }

  // ---------------------------------------------------------------------------
  // Storage / debug
  // ---------------------------------------------------------------------------
  function getStoredValue(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  }

  function setStoredValue(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage failure should not break the extension UI.
    }
  }

  function isDebugEnabled() {
    return getStoredValue(STORAGE_KEYS.debugEnabled, String(DEBUG_MODE_DEFAULT)) === "true";
  }

  function setDebugEnabled(enabled) {
    setStoredValue(STORAGE_KEYS.debugEnabled, String(Boolean(enabled)));
  }

  function applyDebugState(panel) {
    const enabled = isDebugEnabled();
    panel.classList.toggle("rbd-debug-enabled", enabled);

    const checkbox = panel.querySelector("[data-rbd-debug-toggle]");
    if (checkbox) checkbox.checked = enabled;
  }

  // ---------------------------------------------------------------------------
  // Small DOM utils
  // ---------------------------------------------------------------------------
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value || "Unavailable";
  }

  function safeJsonStringify(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "";
    }
  }

  function timeLabel(date = new Date()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  // ---------------------------------------------------------------------------
  // Org metadata parsing
  // ---------------------------------------------------------------------------
  function normalizeLinksToArray(linkValue) {
    if (!linkValue) return [];
    if (Array.isArray(linkValue)) return linkValue;
    if (typeof linkValue === "object") return [linkValue];
    return [];
  }

  function extractCustomDomains(orgInfo) {
    const alternateLinks = normalizeLinksToArray(orgInfo?._links?.alternate);
    const domains = alternateLinks
      .map((link) => link?.href)
      .filter(Boolean)
      .map((href) => {
        try {
          return new URL(href).hostname;
        } catch {
          return href;
        }
      });
    return [...new Set(domains)];
  }

  function extractPipeline(orgInfo) {
    const organizationHref = orgInfo?._links?.organization?.href || "";
    if (orgInfo?.pipeline) return orgInfo.pipeline;
    if (orgInfo?.pipelineType) return orgInfo.pipelineType;
    if (orgInfo?.engine) return orgInfo.engine;
    if (orgInfo?.identityEngine) return orgInfo.identityEngine;
    if (orgInfo?.oktaPipeline) return orgInfo.oktaPipeline;
    if (organizationHref.toLowerCase().includes("oie")) return "OIE";
    return "Review response";
  }

  function extractOrgSummary(orgInfo) {
    if (!orgInfo || typeof orgInfo !== "object") {
      return { cell: "Unavailable", pipeline: "Unavailable", customDomainsText: "Unavailable" };
    }
    const customDomains = extractCustomDomains(orgInfo);
    return {
      cell: orgInfo.cell || "Unavailable",
      pipeline: extractPipeline(orgInfo),
      customDomainsText: customDomains.length > 0 ? customDomains.join(", ") : "No custom domains"
    };
  }

  // ---------------------------------------------------------------------------
  // Fetch helpers (via service worker + page bridge)
  // ---------------------------------------------------------------------------
  function rbFetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "REBOUND_FETCH_JSON",
          url,
          method: options.method || "GET",
          headers: options.headers || {},
          body: options.body
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response) {
            reject(new Error("No response from Rebound service worker"));
            return;
          }
          if (!response.ok) {
            reject(new Error(describeError(response)));
            return;
          }
          resolve(response.data);
        }
      );
    });
  }

  function rbFetchWithHeaders(url, options = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "REBOUND_FETCH_WITH_HEADERS",
          url,
          method: options.method || "GET",
          headers: options.headers || {},
          body: options.body
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response) {
            reject(new Error("No response from Rebound service worker"));
            return;
          }
          if (!response.ok) {
            reject(new Error(describeError(response)));
            return;
          }
          resolve(response);
        }
      );
    });
  }

  function describeError(response) {
    const data = response.data || {};
    const message =
      data.errorSummary || data.error || data.raw || response.statusText || "Request failed";
    return `${response.status} ${response.statusText}: ${message}`;
  }

  // Page-context bridge: needed so the removal POST carries the page XSRF token.
  let bridgeReady = false;
  function ensurePageContextBridge() {
    if (window.__REBOUND_CONTENT_BRIDGE_REQUESTED__) return;
    window.__REBOUND_CONTENT_BRIDGE_REQUESTED__ = true;

    window.addEventListener("REBOUND_PAGE_BRIDGE_READY", () => {
      bridgeReady = true;
    });

    const script = document.createElement("script");
    script.id = "rebound-page-bridge";
    script.src = chrome.runtime.getURL("page/page-bridge.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  function waitForBridge(timeoutMs = 4000) {
    if (bridgeReady) return Promise.resolve();
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (bridgeReady || Date.now() - start > timeoutMs) {
          resolve();
        } else {
          window.setTimeout(check, 50);
        }
      };
      check();
    });
  }

  async function rbPageContextFetchJson(url, options = {}) {
    ensurePageContextBridge();
    await waitForBridge();

    return new Promise((resolve, reject) => {
      const requestId = `rebound-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const timeout = window.setTimeout(() => {
        window.removeEventListener("REBOUND_PAGE_FETCH_RESPONSE", onResponse);
        reject(new Error("Page context fetch timed out. Bridge may not have loaded."));
      }, 30000);

      function cleanup() {
        window.clearTimeout(timeout);
        window.removeEventListener("REBOUND_PAGE_FETCH_RESPONSE", onResponse);
      }

      function onResponse(event) {
        const response = event.detail || {};
        if (response.requestId !== requestId) return;
        cleanup();
        if (!response.ok) {
          reject(new Error(describeError(response)));
          return;
        }
        resolve(response);
      }

      window.addEventListener("REBOUND_PAGE_FETCH_RESPONSE", onResponse);
      window.dispatchEvent(new CustomEvent("REBOUND_PAGE_FETCH_REQUEST", {
        detail: {
          requestId,
          url,
          method: options.method || "GET",
          headers: options.headers || {},
          body: options.body
        }
      }));
    });
  }

  // ---------------------------------------------------------------------------
  // Log processing
  // ---------------------------------------------------------------------------
  function getSinceISOString(days) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  function getNestedValues(value, results = []) {
    if (value === null || value === undefined) return results;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      results.push(String(value));
      return results;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => getNestedValues(item, results));
      return results;
    }
    if (typeof value === "object") {
      Object.values(value).forEach((item) => getNestedValues(item, results));
    }
    return results;
  }

  function extractEmailsFromEvent(event) {
    const values = getNestedValues(event);
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const emails = new Set();
    values.forEach((value) => {
      const matches = value.match(emailRegex);
      if (matches) {
        matches.forEach((email) => {
          const normalized = email.toLowerCase();
          if (!IGNORED_EMAILS.has(normalized)) emails.add(normalized);
        });
      }
    });
    return [...emails];
  }

  function getFailureReason(event) {
    const result = (event?.outcome?.result || "").toUpperCase();
    const reason = (event?.outcome?.reason || "").toLowerCase();
    if (result === "DEFERRED" || reason.includes("deferred") || reason.includes("defer")) {
      return "Deferred";
    }
    if (reason.includes("bounce")) return "Bounce";
    return reason || result || "Unknown";
  }

  function isBounceOrDeferredEvent(event) {
    const result = (event?.outcome?.result || "").toUpperCase();
    const reason = (event?.outcome?.reason || "").toLowerCase();
    return (
      result === "DEFERRED" ||
      reason.includes("deferred") ||
      reason.includes("defer") ||
      reason.includes("bounce")
    );
  }

  function summarizeBounceEvents(events) {
    const byEmail = new Map();
    events.forEach((event) => {
      if (!isBounceOrDeferredEvent(event)) return;
      const emails = extractEmailsFromEvent(event);
      const reason = getFailureReason(event);
      const published = event?.published || "";

      emails.forEach((email) => {
        const existing = byEmail.get(email) || {
          email, reason, count: 0, lastSeen: "", eventUuids: [], deliveryEvents: []
        };
        existing.count += 1;
        if (!existing.lastSeen || new Date(published) > new Date(existing.lastSeen)) {
          existing.lastSeen = published;
          existing.reason = reason;
        }
        if (event?.uuid) existing.eventUuids.push(event.uuid);
        existing.deliveryEvents.push({
          published,
          type: reason,
          reason: event?.outcome?.reason || reason,
          message: event?.displayMessage || ""
        });
        byEmail.set(email, existing);
      });
    });

    byEmail.forEach((item) => {
      item.deliveryEvents.sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));
    });

    return [...byEmail.values()].sort(
      (a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0)
    );
  }

  function extractRemovalEmails(event) {
    const targets = Array.isArray(event?.target) ? event.target : [];
    const emails = new Set();

    targets
      .filter((target) => String(target?.type || "").toLowerCase() === "emaillist")
      .forEach((target) => {
        const matches = String(target?.displayName || "").match(
          /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
        );
        (matches || []).forEach((email) => emails.add(email.toLowerCase()));
      });

    return [...emails];
  }

  function addRecentRemovals(results, removalEvents) {
    const removalsByEmail = new Map();

    removalEvents.forEach((event) => {
      if (event?.eventType !== "system.email.bounce.removal") return;
      const published = event?.published || "";
      if (!published) return;
      extractRemovalEmails(event).forEach((email) => {
        const timestamps = removalsByEmail.get(email) || [];
        timestamps.push(published);
        removalsByEmail.set(email, timestamps);
      });
    });

    return results.map((item) => {
      const removalTimestamps = (removalsByEmail.get(item.email) || [])
        .filter((published) => new Date(published) > new Date(item.lastSeen || 0))
        .sort((a, b) => new Date(b) - new Date(a));
      return { ...item, removalTimestamps };
    });
  }

  function parseNextLink(linkHeader) {
    if (!linkHeader) return null;
    for (const link of linkHeader.split(",")) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/i);
      if (match) return match[1];
    }
    return null;
  }

  async function fetchLogPages(initialUrl) {
    const allEvents = [];
    let nextUrl = initialUrl;
    let pagesFetched = 0;
    while (nextUrl && pagesFetched < MAX_LOG_PAGES) {
      const response = await rbFetchWithHeaders(nextUrl);
      const pageEvents = Array.isArray(response.data) ? response.data : [];
      allEvents.push(...pageEvents);
      pagesFetched += 1;
      nextUrl = parseNextLink(response.headers?.link);
    }
    return { events: allEvents, pagesFetched, hasMore: Boolean(nextUrl) };
  }

  // ---------------------------------------------------------------------------
  // Session validation + tenant metadata
  // ---------------------------------------------------------------------------
  function setSessionPill(state, text) {
    const pill = document.querySelector("[data-rbd-session]");
    if (!pill) return;
    pill.className = `rbd-pill rbd-session rbd-session-${state}`;
    const icon = pill.querySelector("[data-rbd-session-icon]");
    if (icon) {
      const glyph = state === "ok"
        ? '<path d="m8.5 12 2.2 2.2 4.8-5"/>'
        : state === "loading"
          ? '<path d="M12 8v4l2.5 1.5"/>'
          : '<path d="m9.5 9.5 5 5m0-5-5 5"/>';
      icon.innerHTML = `<path d="M12 3 5 6v5c0 4.6 2.9 8 7 10 4.1-2 7-5.4 7-10V6l-7-3Z"/>${glyph}`;
    }
    pill.querySelector("[data-rbd-session-text]").textContent = text;
  }

  async function validateSession() {
    const apiOrigin = getApiOrigin();
    if (!apiOrigin) {
      setSessionPill("error", "No session");
      return;
    }
    setSessionPill("loading", "Checking…");
    try {
      await rbFetchJson(`${apiOrigin}/api/v1/logs?limit=1`);
      setSessionPill("ok", "Okta Connected");
    } catch (error) {
      if (error.message.includes("403")) {
        setSessionPill("warn", "Permission denied");
      } else {
        setSessionPill("error", "Session invalid");
      }
    }
  }

  async function loadTenantMetadata() {
    const tenantHost = getTenantHostFromAdminHost();
    const platform = getPlatformName();

    setText("[data-rbd-tenant-host]", tenantHost || "Unknown tenant");
    setText("[data-rbd-tenant-platform]", platform);

    const tenantOrigin = getTenantOriginFromAdminHost();
    if (!tenantOrigin) return;

    try {
      const orgInfo = await rbFetchJson(`${tenantOrigin}/.well-known/okta-organization`);
      const summary = extractOrgSummary(orgInfo);
      setText("[data-rbd-cell]", summary.cell);
      setText("[data-rbd-pipeline]", summary.pipeline);
      setText("[data-rbd-custom-domains]", summary.customDomainsText);

      const raw = document.querySelector("[data-rbd-org-json]");
      if (raw) raw.textContent = safeJsonStringify(orgInfo);
    } catch (error) {
      setText("[data-rbd-cell]", "Unavailable");
      setText("[data-rbd-pipeline]", "Unavailable");
      setText("[data-rbd-custom-domains]", "Unavailable");
      const raw = document.querySelector("[data-rbd-org-json]");
      if (raw) raw.textContent = error.message;
    }
  }

  // ---------------------------------------------------------------------------
  // CSV
  // ---------------------------------------------------------------------------
  function csvEscape(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function downloadTextFile(filename, fileContent, mimeType = "text/csv") {
    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getResponseRequestId(headers = {}) {
    return (
      headers["x-okta-request-id"] ||
      headers["x-request-id"] ||
      headers["request-id"] ||
      headers["x-amzn-requestid"] ||
      ""
    );
  }

  function createRemovalConfirmationCsv(rows) {
    const headersRow = ["timestamp", "email_removed", "response_header_request_id", "response"];
    const csvRows = rows.map((row) =>
      [row.timestamp, row.emailRemoved, row.responseHeaderRequestId, row.response]
        .map(csvEscape)
        .join(",")
    );
    return [headersRow.join(","), ...csvRows].join("\n");
  }

  function getRemovalFailureMessage(errorDetails) {
    if (!errorDetails) return "Removal failed";
    if (typeof errorDetails === "string") return errorDetails;

    const directMessage =
      errorDetails.errorSummary ||
      errorDetails.message ||
      errorDetails.reason ||
      errorDetails.error;
    if (directMessage) return String(directMessage);

    const causeMessages = Array.isArray(errorDetails.errorCauses)
      ? errorDetails.errorCauses
          .map((cause) => cause?.errorSummary || cause?.message)
          .filter(Boolean)
      : [];
    return causeMessages.length > 0 ? causeMessages.join("; ") : "Removal failed";
  }

  function buildRemovalAuditRow({ email, pageResponse, error }) {
    const timestamp = new Date().toISOString();
    if (error) {
      const failureMessage = error.message || String(error);
      return {
        timestamp,
        emailRemoved: email,
        responseHeaderRequestId: "",
        response: failureMessage,
        failureMessage,
        failed: true
      };
    }
    const responseData = pageResponse?.data || {};
    const errors = Array.isArray(responseData?.errors) ? responseData.errors : [];
    const emailError = errors.find(
      (item) => String(item?.emailAddress || "").toLowerCase() === String(email).toLowerCase()
    );
    return {
      timestamp,
      emailRemoved: email,
      responseHeaderRequestId: getResponseRequestId(pageResponse?.headers || {}),
      response: emailError
        ? `${pageResponse?.status} ${pageResponse?.statusText}: ${JSON.stringify(emailError)}`
        : `${pageResponse?.status} successful`,
      failureMessage: emailError ? getRemovalFailureMessage(emailError) : "",
      failed: Boolean(emailError)
    };
  }

  function exportResultsCsv() {
    const rows = getFilteredResults();
    if (rows.length === 0) return;

    const headers = ["email", "reason", "count", "lastSeen", "eventUuids"];
    const csvRows = rows.map((item) =>
      headers
        .map((header) => csvEscape(header === "eventUuids" ? item.eventUuids.join(" | ") : item[header]))
        .join(",")
    );
    const csv = [headers.join(","), ...csvRows].join("\n");
    downloadTextFile(`rebound-results-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  // ---------------------------------------------------------------------------
  // Filtering + selection
  // ---------------------------------------------------------------------------
  function getFilteredResults() {
    const text = currentTextFilter.trim().toLowerCase();
    return bounceResults.filter((item) => {
      if (
        currentStateFilter !== "All" &&
        !(item.deliveryEvents || []).some((event) => event.type === currentStateFilter)
      ) return false;
      if (text && !item.email.includes(text)) return false;
      return true;
    });
  }

  function reasonPillClass(reason) {
    if (reason === "Bounce") return "rbd-pill-bounce";
    if (reason === "Deferred") return "rbd-pill-deferred";
    if (reason === "Mixed") return "rbd-pill-mixed";
    return "rbd-pill-neutral";
  }

  function displayedReason(item) {
    if (currentStateFilter !== "All") return currentStateFilter;
    const eventTypes = new Set(
      (item.deliveryEvents || [])
        .map((event) => event.type)
        .filter((type) => type === "Bounce" || type === "Deferred")
    );
    return eventTypes.size > 1 ? "Mixed" : item.reason;
  }

  function deliveryEventsTitle(item) {
    const events = (item.deliveryEvents || []).filter(
      (event) => currentStateFilter === "All" || event.type === currentStateFilter
    );
    if (events.length === 0) return "";
    const heading = currentStateFilter === "All"
      ? `Latest: ${item.reason}`
      : `${currentStateFilter} events`;
    return [
      heading,
      ...events
      .map((event) => {
        const timestamp = event.published ? new Date(event.published).toLocaleString() : "Unknown time";
        const detail = event.reason || event.message || event.type || "Unknown";
        const repeatedType = String(detail).trim().toLowerCase() === String(event.type || "").toLowerCase();
        return `${timestamp} — ${event.type || "Unknown"}${repeatedType ? "" : ` — ${detail}`}`;
      })
    ].join("\n");
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------
  function switchView(view) {
    currentView = view;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.querySelectorAll("[data-rbd-view]").forEach((section) => {
      section.style.display = section.getAttribute("data-rbd-view") === view ? "" : "none";
    });
    // The tenant strip and controls only belong to the results view.
    const showResultsChrome = view === "results";
    const controls = panel.querySelector("[data-rbd-controls]");
    if (controls) controls.style.display = showResultsChrome ? "" : "none";
  }

  function renderHero() {
    // Hero reflects the total found for the selected time window, independent of
    // the address / state view filters below it.
    const countEl = document.querySelector("[data-rbd-hero-count]");
    const subEl = document.querySelector("[data-rbd-hero-sub]");
    if (countEl) countEl.textContent = String(bounceResults.length);
    if (subEl) {
      const windowLabel = currentDays === 1 ? "last 24 hours" : `last ${currentDays} days`;
      subEl.textContent = hasSearched ? `found in the ${windowLabel}` : "choose a range to search";
    }
  }

  function renderResultsList() {
    const list = document.querySelector("[data-rbd-list]");
    const empty = document.querySelector("[data-rbd-list-empty]");
    if (!list) return;

    const results = getFilteredResults();

    if (results.length === 0) {
      list.innerHTML = "";
      if (empty) {
        empty.style.display = "";
        empty.textContent = hasSearched
          ? "No addresses match the current filters."
          : "Choose a time range to search.";
      }
      renderActionBar();
      return;
    }
    if (empty) empty.style.display = "none";

    list.innerHTML = results
      .map((item) => {
        const selected = selectedEmails.has(item.email);
        const lastSeenDate = item.lastSeen ? new Date(item.lastSeen) : null;
        const lastSeen = lastSeenDate
          ? `${lastSeenDate.toLocaleDateString([], { month: "short", day: "numeric" })}, ${lastSeenDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
          : "unknown";
        const eventCount = item.count > 5
          ? "5+ events"
          : `${item.count} event${item.count === 1 ? "" : "s"}`;
        const meta = `${eventCount} · last ${lastSeen}`;
        const removalTitle = (item.removalTimestamps || [])
          .map((published) => new Date(published).toLocaleString())
          .join("\n");
        const removedPill = removalTitle
          ? `<span class="rbd-pill rbd-pill-removed" title="${esc(removalTitle)}" tabindex="0" aria-label="Removal events: ${esc(removalTitle)}">Removed</span>`
          : "";
        const reason = displayedReason(item);
        const eventsTitle = deliveryEventsTitle(item);
        const reasonPillAttributes = eventsTitle
          ? ` title="${esc(eventsTitle)}" tabindex="0" aria-label="Delivery events: ${esc(eventsTitle)}"`
          : "";
        return `
          <div class="rbd-row${selected ? " rbd-row-selected" : ""}" data-rbd-email="${esc(item.email)}">
            <span class="rbd-check${selected ? " rbd-check-on" : ""}" data-rbd-toggle="${esc(item.email)}" role="checkbox" aria-checked="${selected}" tabindex="0" aria-label="Select ${esc(item.email)}">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 5"/></svg>
            </span>
            <span class="rbd-row-main">
              <span class="rbd-mono rbd-row-email" title="${esc(item.email)}">${esc(item.email)}</span>
              <span class="rbd-row-meta">${esc(meta)}</span>
            </span>
            <span class="rbd-row-pills">
              ${removedPill}
              <span class="rbd-pill ${reasonPillClass(reason)}"${reasonPillAttributes}>${esc(reason)}</span>
            </span>
          </div>
        `;
      })
      .join("");

    renderActionBar();
  }

  function renderActionBar() {
    const results = getFilteredResults();
    const selectedInView = results.filter((item) => selectedEmails.has(item.email)).length;

    const countEl = document.querySelector("[data-rbd-selected-count]");
    if (countEl) countEl.textContent = `${selectedInView} selected`;

    const selectAll = document.querySelector("[data-rbd-select-all]");
    if (selectAll) {
      const allSelected = results.length > 0 && selectedInView === results.length;
      selectAll.textContent = allSelected ? "Clear all" : "Select all";
      selectAll.style.display = results.length > 0 ? "" : "none";
    }

    const resultCount = document.querySelector("[data-rbd-result-count]");
    if (resultCount) {
      resultCount.textContent = `${results.length} address${results.length === 1 ? "" : "es"}`;
    }

    const hasSelection = selectedInView > 0;
    document.querySelectorAll("[data-rbd-needs-selection]").forEach((btn) => {
      btn.disabled = !hasSelection;
    });
    const exportBtn = document.querySelector("[data-rbd-action='export']");
    if (exportBtn) exportBtn.disabled = results.length === 0;
  }

  function renderResultsView() {
    renderHero();
    renderResultsList();
    updateSegments();
  }

  function updateSegments() {
    document.querySelectorAll("[data-rbd-range]").forEach((btn) => {
      btn.classList.toggle("rbd-seg-on", Number(btn.getAttribute("data-rbd-range")) === currentDays);
    });
    document.querySelectorAll("[data-rbd-state]").forEach((btn) => {
      btn.classList.toggle("rbd-seg-on", btn.getAttribute("data-rbd-state") === currentStateFilter);
    });
  }

  function renderRemovedView() {
    if (!lastRemoval) return;
    const { rows, successCount, errorCount, filename } = lastRemoval;

    const summary = errorCount === 0
      ? `${successCount} address${successCount === 1 ? "" : "es"} restored`
      : successCount === 0
        ? `${errorCount} removal${errorCount === 1 ? "" : "s"} failed`
        : `${successCount} restored, ${errorCount} failed`;
    setText("[data-rbd-removed-count]", summary);
    setText(
      "[data-rbd-removed-sub]",
      errorCount === 0
        ? "Cleared from the bounce suppression list. Delivery to these users is re-enabled."
        : "Review failed addresses below. Hover over Failed for details."
    );

    const list = document.querySelector("[data-rbd-removed-list]");
    if (list) {
      list.innerHTML = rows
        .map((row) => {
          if (row.failed) {
            return `
              <div class="rbd-removed-row rbd-removed-fail">
                <span class="rbd-x">✕</span>
                <span class="rbd-mono rbd-row-email" title="${esc(row.emailRemoved)}">${esc(row.emailRemoved)}</span>
                <span class="rbd-removed-label rbd-removed-label-fail" title="${esc(row.failureMessage || "Removal failed")}" tabindex="0" aria-label="Failed: ${esc(row.failureMessage || "Removal failed")}">Failed</span>
              </div>`;
          }
          return `
            <div class="rbd-removed-row">
              <span class="rbd-tick">✓</span>
              <span class="rbd-mono rbd-row-email" title="${esc(row.emailRemoved)}">${esc(row.emailRemoved)}</span>
              <span class="rbd-removed-label">Removed</span>
            </div>`;
        })
        .join("");
    }

    setText("[data-rbd-audit-filename]", filename);
  }

  function renderClearView() {
    const windowLabel = currentDays === 1 ? "last 24 hours" : `last ${currentDays} days`;
    setText("[data-rbd-clear-sub]", `No bounced or deferred addresses in the ${windowLabel}. Nothing to remove.`);
    setText("[data-rbd-clear-checked]", lastCheckedLabel ? `Last checked ${lastCheckedLabel}` : "");
    document.querySelectorAll("[data-rbd-clear-range]").forEach((btn) => {
      btn.classList.toggle("rbd-seg-on", Number(btn.getAttribute("data-rbd-clear-range")) === currentDays);
    });
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  function setBusy(busy, message) {
    const bar = document.querySelector("[data-rbd-status]");
    if (!bar) return;
    bar.style.display = busy || message ? "" : "none";
    bar.classList.toggle("rbd-status-busy", Boolean(busy));
    if (busy) bar.classList.remove("rbd-status-error");
    const text = bar.querySelector("[data-rbd-status-text]");
    if (text) text.textContent = message || "";
  }

  async function loadBounceEmails(days) {
    currentDays = days;
    updateSegments();

    const apiOrigin = getApiOrigin();
    const since = encodeURIComponent(getSinceISOString(days));
    const until = encodeURIComponent(new Date().toISOString());
    const bounceFilter = encodeURIComponent(
      'eventType eq "system.email.delivery" and outcome.result eq "FAILURE"'
    );
    const deferredFilter = encodeURIComponent(
      'eventType eq "system.email.delivery" and outcome.result eq "DEFERRED"'
    );
    const removalFilter = encodeURIComponent('eventType eq "system.email.bounce.removal"');
    const queryBase = `${apiOrigin}/api/v1/logs?since=${since}&until=${until}`;
    const bounceUrl = `${queryBase}&filter=${bounceFilter}&limit=${LOG_FETCH_LIMIT}`;
    const deferredUrl = `${queryBase}&filter=${deferredFilter}&limit=${LOG_FETCH_LIMIT}`;
    const removalUrl = `${queryBase}&filter=${removalFilter}&limit=${LOG_FETCH_LIMIT}`;

    setText("[data-rbd-query]", `${decodeURIComponent(bounceUrl)}\n\n${decodeURIComponent(deferredUrl)}\n\n${decodeURIComponent(removalUrl)}`);
    setBusy(true, `Searching the ${days === 1 ? "last 24 hours" : `last ${days} days`}…`);

    try {
      const [bounceResult, deferredResult, removalResult] = await Promise.all([
        fetchLogPages(bounceUrl),
        fetchLogPages(deferredUrl),
        fetchLogPages(removalUrl).catch(() => ({ events: [], pagesFetched: 0, hasMore: false }))
      ]);

      const allEvents = [...bounceResult.events, ...deferredResult.events];
      processedLogEvents = allEvents.length + removalResult.events.length;
      bounceResults = addRecentRemovals(summarizeBounceEvents(allEvents), removalResult.events);
      selectedEmails.clear();
      hasSearched = true;
      lastCheckedLabel = timeLabel();

      setBusy(false);

      if (bounceResults.length === 0) {
        renderClearView();
        switchView("clear");
      } else {
        renderResultsView();
        switchView("results");
      }
    } catch (error) {
      bounceResults = [];
      selectedEmails.clear();
      hasSearched = true;
      renderResultsView();
      switchView("results");
      if (error.message.includes("403")) {
        setBusy(false, "Permission denied for System Log search.");
      } else {
        setBusy(false, `Search failed: ${error.message}`);
      }
      const bar = document.querySelector("[data-rbd-status]");
      if (bar) bar.classList.add("rbd-status-error");
    }
  }

  async function removeSelected() {
    const emails = getFilteredResults()
      .filter((item) => selectedEmails.has(item.email))
      .map((item) => item.email);

    if (emails.length === 0) return;

    const confirmed = window.confirm(
      `Remove ${emails.length} address${emails.length === 1 ? "" : "es"} from the bounce list?\n\n${emails.join("\n")}`
    );
    if (!confirmed) return;

    setBusy(true, "Removing selected addresses…");

    const auditRows = [];
    let successCount = 0;
    let errorCount = 0;

    for (const email of emails) {
      try {
        const pageResponse = await rbPageContextFetchJson("/api/v1/org/email/bounces/remove-list", {
          method: "POST",
          body: JSON.stringify({ emailAddresses: [email] })
        });
        const responseData = pageResponse?.data || {};
        const errors = Array.isArray(responseData?.errors) ? responseData.errors : [];
        const emailHasError = errors.some(
          (item) => String(item?.emailAddress || "").toLowerCase() === String(email).toLowerCase()
        );
        if (emailHasError) errorCount += 1;
        else successCount += 1;
        auditRows.push(buildRemovalAuditRow({ email, pageResponse }));
      } catch (error) {
        errorCount += 1;
        auditRows.push(buildRemovalAuditRow({ email, error }));
      }
    }

    const filename = `rebound-removal-${new Date().toISOString().slice(0, 10)}.csv`;
    lastRemoval = {
      rows: auditRows,
      csv: createRemovalConfirmationCsv(auditRows),
      filename,
      successCount,
      errorCount
    };

    setBusy(false);
    renderRemovedView();
    switchView("removed");
  }

  function toggleSelection(email) {
    if (selectedEmails.has(email)) selectedEmails.delete(email);
    else selectedEmails.add(email);
    renderResultsList();
  }

  function toggleSelectAll() {
    const results = getFilteredResults();
    const allSelected = results.length > 0 && results.every((item) => selectedEmails.has(item.email));
    if (allSelected) results.forEach((item) => selectedEmails.delete(item.email));
    else results.forEach((item) => selectedEmails.add(item.email));
    renderResultsList();
  }

  // ---------------------------------------------------------------------------
  // Panel chrome (menu / minimize / position)
  // ---------------------------------------------------------------------------
  function applyPanelState(panel) {
    const minimized = getStoredValue(STORAGE_KEYS.minimized, "false") === "true";
    const position = getStoredValue(STORAGE_KEYS.position, "bottom");
    panel.classList.toggle("rbd-minimized", minimized);
    panel.classList.toggle("rbd-top", position === "top");
    panel.classList.toggle("rbd-bottom", position !== "top");

    const positionItem = panel.querySelector("[data-rbd-action='position']");
    if (positionItem) positionItem.textContent = position === "top" ? "Move to bottom" : "Move to top";
  }

  function closeMenu(panel) {
    const menu = panel.querySelector("[data-rbd-menu]");
    if (menu) menu.classList.remove("rbd-menu-open");
  }

  // ---------------------------------------------------------------------------
  // Segmented control markup helpers
  // ---------------------------------------------------------------------------
  function rangeSegments(attr) {
    return RANGE_OPTIONS.map(
      (r) => `<button class="rbd-seg" type="button" ${attr}="${r.days}">${r.label}</button>`
    ).join("");
  }

  function markSvg(size) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 6 6v1"/></svg>`;
  }

  function envelopeSvg() {
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2b59ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M3 6.5l9 6 9-6"/></svg>`;
  }

  function brandBar() {
    return `
      <div class="rbd-brand">
        <span class="rbd-mark"><img src="${chrome.runtime.getURL("assets/icon48.png")}" alt="" width="32" height="32" /></span>
        <span class="rbd-brand-text">
          <span class="rbd-wordmark">Rebound</span>
          <span class="rbd-tagline">Restore delivery for bounced emails</span>
        </span>
      </div>
      <div class="rbd-header-right">
        <button class="rbd-icon-btn" type="button" data-rbd-action="minimize" title="Minimize" aria-label="Minimize Rebound"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg></button>
        <button class="rbd-icon-btn" type="button" data-rbd-action="menu" aria-label="Settings" aria-haspopup="true" title="Settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></svg></button>
      </div>
    `;
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    panelEventController?.abort();
    panelEventController = new AbortController();

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "rbd-bottom";

    panel.innerHTML = `
      <div class="rbd-header">
        ${brandBar()}
      </div>

      <div class="rbd-menu" data-rbd-menu>
        <label class="rbd-menu-toggle">
          <span>Debug mode</span>
          <input type="checkbox" data-rbd-debug-toggle />
          <span class="rbd-toggle-ui" aria-hidden="true"><span></span></span>
        </label>
        <button class="rbd-menu-item" type="button" data-rbd-action="position">Move to top</button>
        <div class="rbd-menu-sep"></div>
        <div class="rbd-menu-meta rbd-debug-only">
          <div class="rbd-kv"><span>Cell</span><b data-rbd-cell>—</b></div>
          <div class="rbd-kv"><span>Pipeline</span><b data-rbd-pipeline>—</b></div>
          <div class="rbd-kv"><span>Custom domains</span><b data-rbd-custom-domains>—</b></div>
        </div>
        <details class="rbd-details rbd-debug-only"><summary>Raw metadata</summary><pre data-rbd-org-json>Debug mode</pre></details>
        <details class="rbd-details rbd-debug-only"><summary>Generated query</summary><pre data-rbd-query>Not generated yet</pre></details>
        <div class="rbd-menu-sep"></div>
        <a class="rbd-menu-item rbd-menu-link" href="https://github.com/noelmom/rebound/issues" target="_blank" rel="noreferrer">Report a bug <span aria-hidden="true">↗</span></a>
        <div class="rbd-menu-sep"></div>
        <button class="rbd-menu-item rbd-menu-danger" type="button" data-rbd-action="close">Close Rebound</button>
        <div class="rbd-menu-note">Independent tool — not affiliated with or endorsed by Okta, Inc.</div>
      </div>

      <div class="rbd-tenant">
        <span class="rbd-mono" data-rbd-tenant-host>tenant</span>
        <span class="rbd-tenant-sep">/</span>
        <span class="rbd-mono rbd-tenant-platform" data-rbd-tenant-platform>Platform</span>
        <span class="rbd-pill rbd-session rbd-session-loading" data-rbd-session><svg data-rbd-session-icon viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.9 8 7 10 4.1-2 7-5.4 7-10V6l-7-3Z"/><path d="M12 8v4l2.5 1.5"/></svg><span data-rbd-session-text>Checking…</span></span>
      </div>

      <div class="rbd-status" data-rbd-status style="display:none;">
        <span class="rbd-spinner"></span>
        <span data-rbd-status-text></span>
      </div>

      <div class="rbd-body">
        <!-- ===================== 3a: results ===================== -->
        <section data-rbd-view="results">
          <div class="rbd-hero">
            <div class="rbd-eyebrow">Suppressed addresses</div>
            <div class="rbd-hero-row">
              <span class="rbd-hero-num" data-rbd-hero-count>0</span>
              <span class="rbd-hero-sub" data-rbd-hero-sub>choose a range to search</span>
            </div>
          </div>

          <div data-rbd-controls>
            <div class="rbd-filter">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa0aa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
              <input type="text" data-rbd-filter placeholder="Filter by address…" aria-label="Filter by address" />
            </div>
            <div class="rbd-seg-row">
              <div class="rbd-seg-track">${rangeSegments("data-rbd-range")}</div>
              <div class="rbd-seg-track">
                ${STATE_FILTERS.map((s) => `<button class="rbd-seg" type="button" data-rbd-state="${s}">${s}</button>`).join("")}
              </div>
            </div>
          </div>

          <div class="rbd-list-head">
            <span data-rbd-result-count>0 addresses</span>
            <button class="rbd-link" type="button" data-rbd-select-all>Select all</button>
          </div>

          <div class="rbd-list" data-rbd-list></div>
          <div class="rbd-empty" data-rbd-list-empty>Choose a time range to search.</div>
        </section>

        <!-- ===================== 3b: removed ===================== -->
        <section data-rbd-view="removed" style="display:none;">
          <div class="rbd-success-hero">
            <span class="rbd-success-badge">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#0f9d58" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
            </span>
            <div class="rbd-success-title" data-rbd-removed-count>0 addresses restored</div>
            <div class="rbd-success-sub" data-rbd-removed-sub>Cleared from the bounce suppression list. Delivery to these users is re-enabled.</div>
          </div>

          <div class="rbd-removed-list" data-rbd-removed-list></div>

          <div class="rbd-audit">
            <span class="rbd-audit-badge">CSV</span>
            <span class="rbd-audit-main">
              <span class="rbd-audit-title">Audit log saved</span>
              <span class="rbd-mono rbd-audit-file" data-rbd-audit-filename>rebound-removal.csv</span>
            </span>
            <button class="rbd-link" type="button" data-rbd-action="download-audit">Download</button>
          </div>

          <button class="rbd-btn rbd-btn-ink rbd-btn-block" type="button" data-rbd-action="back">Back to results</button>
        </section>

        <!-- ===================== 3c: all clear ===================== -->
        <section data-rbd-view="clear" style="display:none;">
          <div class="rbd-seg-row"><div class="rbd-seg-track">${rangeSegments("data-rbd-clear-range")}</div></div>
          <div class="rbd-clear">
            <span class="rbd-clear-badge">${markSvgInk(22)}</span>
            <div class="rbd-clear-title">All clear</div>
            <div class="rbd-clear-sub" data-rbd-clear-sub>No bounced or deferred addresses. Nothing to remove.</div>
          </div>
          <div class="rbd-clear-foot">
            <span data-rbd-clear-checked></span>
            <button class="rbd-link" type="button" data-rbd-action="rerun">Re-run search</button>
          </div>
        </section>
      </div>

      <!-- action bar: only meaningful in results view, hidden elsewhere via view logic -->
      <div class="rbd-actionbar" data-rbd-view="results">
        <div class="rbd-actionbar-row">
          <span class="rbd-selected" data-rbd-selected-count>0 selected</span>
          <div class="rbd-actionbar-btns">
            <button class="rbd-btn rbd-btn-secondary" type="button" data-rbd-action="export" disabled>Export CSV</button>
            <button class="rbd-btn rbd-btn-primary" type="button" data-rbd-action="remove" data-rbd-needs-selection disabled>Remove from list</button>
          </div>
        </div>
        <div class="rbd-actionbar-note">Removing clears suppression so these users can receive email again.</div>
      </div>
    `;

    document.body.appendChild(panel);

    applyPanelState(panel);
    applyDebugState(panel);
    switchView("results");
    updateSegments();
    wireEvents(panel, panelEventController.signal);

    validateSession();
    loadTenantMetadata();
    loadBounceEmails(currentDays); // auto-search 24h on open
  }

  // markSvg with brand-blue stroke for the all-clear badge
  function markSvgInk(size) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="#2b59ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 6 6v1"/></svg>`;
  }

  function wireEvents(panel, signal) {
    panel.addEventListener("click", (event) => {
      // selection checkbox
      const toggle = event.target.closest("[data-rbd-toggle]");
      if (toggle) {
        toggleSelection(toggle.getAttribute("data-rbd-toggle"));
        return;
      }

      // range segments (results view)
      const range = event.target.closest("[data-rbd-range]");
      if (range) {
        loadBounceEmails(Number(range.getAttribute("data-rbd-range")));
        return;
      }
      // range segments (clear view)
      const clearRange = event.target.closest("[data-rbd-clear-range]");
      if (clearRange) {
        loadBounceEmails(Number(clearRange.getAttribute("data-rbd-clear-range")));
        return;
      }

      // state filter segments
      const state = event.target.closest("[data-rbd-state]");
      if (state) {
        currentStateFilter = state.getAttribute("data-rbd-state");
        updateSegments();
        renderResultsList();
        return;
      }

      const selectAll = event.target.closest("[data-rbd-select-all]");
      if (selectAll) {
        toggleSelectAll();
        return;
      }

      const action = event.target.closest("[data-rbd-action]");
      if (!action) return;
      const name = action.getAttribute("data-rbd-action");

      if (name === "menu") {
        panel.querySelector("[data-rbd-menu]").classList.toggle("rbd-menu-open");
        return;
      }
      if (name === "position") {
        const current = getStoredValue(STORAGE_KEYS.position, "bottom");
        setStoredValue(STORAGE_KEYS.position, current === "top" ? "bottom" : "top");
        applyPanelState(panel);
        return;
      }
      if (name === "minimize") {
        setStoredValue(STORAGE_KEYS.minimized, "true");
        applyPanelState(panel);
        closeMenu(panel);
        return;
      }
      if (name === "close") {
        setPanelEnabled(false);
        return;
      }
      if (name === "export") {
        exportResultsCsv();
        return;
      }
      if (name === "remove") {
        removeSelected();
        return;
      }
      if (name === "back" || name === "rerun") {
        loadBounceEmails(currentDays);
        return;
      }
      if (name === "download-audit") {
        if (lastRemoval) downloadTextFile(lastRemoval.filename, lastRemoval.csv);
        return;
      }
    });

    // restore from minimized by clicking the header brand
    panel.querySelector(".rbd-brand").addEventListener("click", () => {
      if (panel.classList.contains("rbd-minimized")) {
        setStoredValue(STORAGE_KEYS.minimized, "false");
        applyPanelState(panel);
      }
    });

    // keyboard toggle for checkboxes
    panel.addEventListener("keydown", (event) => {
      const toggle = event.target.closest("[data-rbd-toggle]");
      if (toggle && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        toggleSelection(toggle.getAttribute("data-rbd-toggle"));
      }
    });

    // address filter
    const filterInput = panel.querySelector("[data-rbd-filter]");
    if (filterInput) {
      filterInput.addEventListener("input", () => {
        currentTextFilter = filterInput.value;
        renderResultsList();
      });
    }

    // debug toggle
    panel.addEventListener("change", (event) => {
      const debugToggle = event.target.closest("[data-rbd-debug-toggle]");
      if (!debugToggle) return;
      setDebugEnabled(debugToggle.checked);
      applyDebugState(panel);
    });

    // close menu on outside click
    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-rbd-menu]") && !event.target.closest("[data-rbd-action='menu']")) {
        closeMenu(panel);
      }
    }, { signal });
  }

  function setPanelEnabled(enabled) {
    panelEnabled = Boolean(enabled);
    if (panelEnabled) {
      createPanel();
      return;
    }
    panelEventController?.abort();
    panelEventController = null;
    document.getElementById(PANEL_ID)?.remove();
  }

  function init() {
    if (!isAdminDashboardHost()) return;
    createPanel();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "REBOUND_GET_PANEL_STATE") {
      sendResponse({ enabled: panelEnabled });
      return false;
    }
    if (message?.type === "REBOUND_SET_PANEL_ENABLED") {
      setPanelEnabled(message.enabled);
      sendResponse({ enabled: panelEnabled });
      return false;
    }
    return false;
  });

  init();
})();
