(() => {
  const PANEL_ID = "mot-v1-panel";
  const DEBUG_MODE = false;

  const LOG_FETCH_LIMIT = 200;
  const MAX_LOG_PAGES = 5;
  const UI_PAGE_SIZE = 25;

  const IGNORED_EMAILS = new Set([
    "system@okta.com"
  ]);

  const STORAGE_KEYS = {
    minimized: "motMinimized",
    position: "motPosition"
  };

  const ADMIN_HOST_PATTERNS = [
    {
      adminSuffix: "-admin.okta.com",
      tenantSuffix: ".okta.com",
      platform: "Commercial"
    },
    {
      adminSuffix: "-admin.oktapreview.com",
      tenantSuffix: ".oktapreview.com",
      platform: "Preview"
    },
    {
      adminSuffix: "-admin.okta-emea.com",
      tenantSuffix: ".okta-emea.com",
      platform: "EMEA"
    },
    {
      adminSuffix: "-admin.okta-gov.com",
      tenantSuffix: ".okta-gov.com",
      platform: "Government"
    },
    {
      adminSuffix: "-admin.okta.mil",
      tenantSuffix: ".okta.mil",
      platform: "Military"
    }
  ];

  let bounceResults = [];
  let bounceCurrentPage = 1;
  let processedLogEvents = 0;
  let lastRemovalConfirmationCsv = "";
  let lastRemovalConfirmationFilename = "";

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

    if (!pattern) {
      return null;
    }

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

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) {
      el.textContent = value || "Unavailable";
    }
  }

  function clearText(selector) {
    const el = document.querySelector(selector);
    if (el) {
      el.textContent = "";
    }
  }

  function setStatus(selector, type, text) {
    const el = document.querySelector(selector);
    if (!el) return;

    el.classList.remove("mot-status-ok", "mot-status-warn", "mot-status-error", "mot-status-loading");
    el.classList.add(`mot-status-${type}`);
    el.querySelector(".mot-status-text").textContent = text;
  }

  function safeJsonStringify(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "";
    }
  }

  function normalizeLinksToArray(linkValue) {
    if (!linkValue) return [];

    if (Array.isArray(linkValue)) {
      return linkValue;
    }

    if (typeof linkValue === "object") {
      return [linkValue];
    }

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

    if (organizationHref.toLowerCase().includes("oie")) {
      return "OIE";
    }

    return "Review response";
  }

  function extractOrgSummary(orgInfo) {
    if (!orgInfo || typeof orgInfo !== "object") {
      return {
        cell: "Unavailable",
        pipeline: "Unavailable",
        customDomainsText: "Unavailable",
        customDomainsList: []
      };
    }

    const customDomains = extractCustomDomains(orgInfo);

    return {
      cell: orgInfo.cell || "Unavailable",
      pipeline: extractPipeline(orgInfo),
      customDomainsText: customDomains.length > 0 ? customDomains.join(", ") : "No custom domains",
      customDomainsList: customDomains
    };
  }

  function motFetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "MOT_FETCH_JSON",
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
            reject(new Error("No response from MOT service worker"));
            return;
          }

          if (!response.ok) {
            const data = response.data || {};
            const message =
              data.errorSummary ||
              data.error ||
              data.raw ||
              response.statusText ||
              "Request failed";

            reject(new Error(`${response.status} ${response.statusText}: ${message}`));
            return;
          }

          resolve(response.data);
        }
      );
    });
  }

  async function motPageFetchJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    const text = await response.text();

    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!response.ok) {
      const message =
        data?.errorSummary ||
        data?.error ||
        data?.raw ||
        response.statusText ||
        "Request failed";

      throw new Error(`${response.status} ${response.statusText}: ${message}`);
    }

    return data;
  }

  function ensurePageContextBridge() {
    if (window.__MOT_V1_CONTENT_BRIDGE_REQUESTED__) {
      return;
    }

    window.__MOT_V1_CONTENT_BRIDGE_REQUESTED__ = true;

    const script = document.createElement("script");
    script.id = "mot-v1-page-bridge";
    script.src = chrome.runtime.getURL("page/page-bridge.js");
    script.onload = () => {
      script.remove();
    };

    (document.head || document.documentElement).appendChild(script);
  }

  function motPageContextFetchJson(url, options = {}) {
    ensurePageContextBridge();

    return new Promise((resolve, reject) => {
      const requestId = `mot-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const timeout = window.setTimeout(() => {
        window.removeEventListener("MOT_V1_PAGE_FETCH_RESPONSE", onResponse);
        window.removeEventListener("MOT_V1_PAGE_BRIDGE_READY", onReady);
        reject(new Error("Page context fetch timed out. Bridge may not have loaded."));
      }, 30000);

      function cleanup() {
        window.clearTimeout(timeout);
        window.removeEventListener("MOT_V1_PAGE_FETCH_RESPONSE", onResponse);
        window.removeEventListener("MOT_V1_PAGE_BRIDGE_READY", onReady);
      }

      function dispatchRequest() {
        window.dispatchEvent(new CustomEvent("MOT_V1_PAGE_FETCH_REQUEST", {
          detail: {
            requestId,
            url,
            method: options.method || "GET",
            headers: options.headers || {},
            body: options.body
          }
        }));
      }

      function onReady() {
        dispatchRequest();
      }

      function onResponse(event) {
        const response = event.detail || {};

        if (response.requestId !== requestId) {
          return;
        }

        cleanup();

        if (!response.ok) {
          const data = response.data || {};
          const message =
            data.errorSummary ||
            data.error ||
            data.raw ||
            response.statusText ||
            "Request failed";

          reject(new Error(`${response.status} ${response.statusText}: ${message}`));
          return;
        }

        resolve(response);
      }

      window.addEventListener("MOT_V1_PAGE_FETCH_RESPONSE", onResponse);
      window.addEventListener("MOT_V1_PAGE_BRIDGE_READY", onReady);

      // Give the external bridge file a moment to load, then dispatch.
      // If it is already loaded, the listener will already be registered.
      window.setTimeout(dispatchRequest, 250);
    });
  }

  function getSinceISOString(days) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  function getNestedValues(value, results = []) {
    if (value === null || value === undefined) {
      return results;
    }

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

          if (!IGNORED_EMAILS.has(normalized)) {
            emails.add(normalized);
          }
        });
      }
    });

    return [...emails];
  }

  function getFailureReason(event) {
    const reasonCandidates = [
      event?.outcome?.reason,
      event?.debugContext?.debugData?.reason,
      event?.debugContext?.debugData?.failureReason,
      event?.debugContext?.debugData?.error,
      event?.debugContext?.debugData?.errorSummary,
      event?.debugContext?.debugData?.smtpResponse,
      event?.debugContext?.debugData?.deliveryStatus,
      event?.displayMessage
    ]
      .filter(Boolean)
      .join(" ");

    const lower = reasonCandidates.toLowerCase();

    if (lower.includes("bounce")) return "bounce";
    if (lower.includes("defer")) return "deferred";

    return reasonCandidates || "failure";
  }

  function isBounceOrDeferredEvent(event) {
    const searchableText = getNestedValues(event).join(" ").toLowerCase();
    return searchableText.includes("bounce") || searchableText.includes("defer");
  }

  function summarizeBounceEvents(events) {
    const byEmail = new Map();

    events.forEach((event) => {
      if (!isBounceOrDeferredEvent(event)) {
        return;
      }

      const emails = extractEmailsFromEvent(event);
      const reason = getFailureReason(event);
      const published = event?.published || "";

      emails.forEach((email) => {
        const existing = byEmail.get(email) || {
          email,
          reason,
          count: 0,
          lastSeen: "",
          eventUuids: []
        };

        existing.count += 1;

        if (!existing.lastSeen || new Date(published) > new Date(existing.lastSeen)) {
          existing.lastSeen = published;
          existing.reason = reason;
        }

        if (event?.uuid) {
          existing.eventUuids.push(event.uuid);
        }

        byEmail.set(email, existing);
      });
    });

    return [...byEmail.values()].sort((a, b) => {
      return new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0);
    });
  }

  function parseNextLink(linkHeader) {
    if (!linkHeader) return null;

    const links = linkHeader.split(",");

    for (const link of links) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/i);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  function motFetchWithHeaders(url, options = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "MOT_FETCH_WITH_HEADERS",
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
            reject(new Error("No response from MOT service worker"));
            return;
          }

          if (!response.ok) {
            const data = response.data || {};
            const message =
              data.errorSummary ||
              data.error ||
              data.raw ||
              response.statusText ||
              "Request failed";

            reject(new Error(`${response.status} ${response.statusText}: ${message}`));
            return;
          }

          resolve(response);
        }
      );
    });
  }

  async function fetchLogPages(initialUrl) {
    const allEvents = [];
    let nextUrl = initialUrl;
    let pagesFetched = 0;

    while (nextUrl && pagesFetched < MAX_LOG_PAGES) {
      const response = await motFetchWithHeaders(nextUrl);
      const pageEvents = Array.isArray(response.data) ? response.data : [];

      allEvents.push(...pageEvents);
      pagesFetched += 1;
      nextUrl = parseNextLink(response.headers?.link);
    }

    return {
      events: allEvents,
      pagesFetched,
      hasMore: Boolean(nextUrl)
    };
  }

  async function loadOrganizationInfo() {
    const tenantOrigin = getTenantOriginFromAdminHost();
    const adminOrigin = getAdminOrigin();

    setText("[data-mot-admin-url]", adminOrigin);
    setText("[data-mot-tenant-url]", tenantOrigin);
    setText("[data-mot-platform]", getPlatformName());

    if (!tenantOrigin) {
      setStatus("[data-mot-org-status]", "error", "Unable to derive tenant URL from admin URL");
      return;
    }

    try {
      setStatus("[data-mot-org-status]", "loading", "Loading organization metadata");

      const orgInfo = await motFetchJson(`${tenantOrigin}/.well-known/okta-organization`);
      const summary = extractOrgSummary(orgInfo);

      setText("[data-mot-cell]", summary.cell);
      setText("[data-mot-pipeline]", summary.pipeline);
      setText("[data-mot-custom-domains]", summary.customDomainsText);

      const details = document.querySelector("[data-mot-org-json]");
      if (details) {
        details.textContent = safeJsonStringify(orgInfo);
      }

      setStatus("[data-mot-org-status]", "ok", "Organization metadata loaded");
    } catch (error) {
      setStatus("[data-mot-org-status]", "error", "Unable to load organization metadata");
      setText("[data-mot-cell]", "Unavailable");
      setText("[data-mot-pipeline]", "Unavailable");
      setText("[data-mot-custom-domains]", "Unavailable");

      const details = document.querySelector("[data-mot-org-json]");
      if (details) {
        details.textContent = error.message;
      }
    }
  }

  async function testApiAccess() {
    const apiOrigin = getApiOrigin();

    if (!apiOrigin) {
      setStatus("[data-mot-api-status]", "error", "Unable to determine API origin");
      return;
    }

    try {
      setStatus("[data-mot-api-status]", "loading", "Testing API access");

      await motFetchJson(`${apiOrigin}/api/v1/logs?limit=1`);

      setStatus("[data-mot-api-status]", "ok", "API reachable with current admin session");
    } catch (error) {
      if (error.message.includes("403")) {
        setStatus("[data-mot-api-status]", "warn", "API reachable but permission denied");
      } else {
        setStatus("[data-mot-api-status]", "error", "API test failed");
      }

      const details = document.querySelector("[data-mot-api-error]");
      if (details) {
        details.textContent = error.message;
      }
    }
  }

  function renderBounceResults() {
    const tbody = document.querySelector("[data-mot-bounce-tbody]");
    const countEl = document.querySelector("[data-mot-bounce-count]");
    const pageEl = document.querySelector("[data-mot-bounce-page]");
    const prevButton = document.querySelector("[data-mot-action='prev-bounce-page']");
    const nextButton = document.querySelector("[data-mot-action='next-bounce-page']");

    if (!tbody) return;

    const totalResults = bounceResults.length;
    const totalPages = Math.max(1, Math.ceil(totalResults / UI_PAGE_SIZE));

    if (bounceCurrentPage > totalPages) {
      bounceCurrentPage = totalPages;
    }

    const startIndex = (bounceCurrentPage - 1) * UI_PAGE_SIZE;
    const pageItems = bounceResults.slice(startIndex, startIndex + UI_PAGE_SIZE);
    const displayStart = totalResults === 0 ? 0 : startIndex + 1;
    const displayEnd = Math.min(startIndex + UI_PAGE_SIZE, totalResults);

    countEl.textContent = `${totalResults} result${totalResults === 1 ? "" : "s"} · ${processedLogEvents} events processed`;
    pageEl.textContent = `Showing ${displayStart}-${displayEnd} · Page ${bounceCurrentPage} of ${totalPages}`;

    if (prevButton) {
      prevButton.disabled = bounceCurrentPage <= 1;
    }

    if (nextButton) {
      nextButton.disabled = bounceCurrentPage >= totalPages;
    }

    if (totalResults === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="mot-empty">No bounced or deferred emails found for this range.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = pageItems
      .map((item, pageIndex) => {
        const realIndex = startIndex + pageIndex;
        const lastSeen = item.lastSeen ? new Date(item.lastSeen).toLocaleString() : "Unavailable";

        return `
          <tr>
            <td>
              <input type="checkbox" data-mot-bounce-select="${realIndex}" aria-label="Select ${item.email}" />
            </td>
            <td class="mot-email-cell">${item.email}</td>
            <td>${item.reason}</td>
            <td>${item.count}</td>
            <td>${lastSeen}</td>
          </tr>
        `;
      })
      .join("");
  }

  async function loadBounceEmails(days) {
    const apiOrigin = getApiOrigin();
    const since = encodeURIComponent(getSinceISOString(days));
    const filter = encodeURIComponent('eventType eq "system.email.delivery" and outcome.result eq "FAILURE"');
    const url = `${apiOrigin}/api/v1/logs?since=${since}&filter=${filter}&limit=${LOG_FETCH_LIMIT}`;

    try {
      clearText("[data-mot-bounce-error]");
      const confirmation = document.querySelector("[data-mot-removal-confirmation]");
      if (confirmation) confirmation.innerHTML = "";
      setStatus("[data-mot-bounce-status]", "loading", `Loading last ${days === 1 ? "24 hours" : `${days} days`}`);
      setText("[data-mot-bounce-query]", decodeURIComponent(url));

      const result = await fetchLogPages(url);
      processedLogEvents = result.events.length;
      bounceCurrentPage = 1;
      bounceResults = summarizeBounceEvents(result.events);

      renderBounceResults();

      const moreText = result.hasMore ? " More results may exist." : "";
      setStatus("[data-mot-bounce-status]", "ok", `Bounce search complete.${moreText}`);
    } catch (error) {
      bounceResults = [];
      processedLogEvents = 0;
      bounceCurrentPage = 1;
      renderBounceResults();

      if (error.message.includes("403")) {
        setStatus("[data-mot-bounce-status]", "warn", "Permission denied for System Log search");
      } else {
        setStatus("[data-mot-bounce-status]", "error", "Bounce search failed");
      }

      setText("[data-mot-bounce-error]", error.message);
    }
  }

  function getSelectedBounceEmails() {
    const selected = [];
    document.querySelectorAll("[data-mot-bounce-select]").forEach((checkbox) => {
      if (!checkbox.checked) return;

      const index = Number(checkbox.getAttribute("data-mot-bounce-select"));
      const item = bounceResults[index];

      if (item?.email) {
        selected.push(item.email);
      }
    });

    return selected;
  }

  async function removeSelectedBounceEmails() {
    const selectedEmails = getSelectedBounceEmails();

    if (selectedEmails.length === 0) {
      setStatus("[data-mot-bounce-status]", "warn", "Select at least one email first");
      return;
    }

    const confirmed = window.confirm(
      `Remove ${selectedEmails.length} email address${selectedEmails.length === 1 ? "" : "es"} from the bounce list?\n\n${selectedEmails.join("\n")}`
    );

    if (!confirmed) {
      return;
    }

    try {
      clearText("[data-mot-bounce-error]");
      setStatus("[data-mot-bounce-status]", "loading", "Removing selected emails");

      const pageResponse = await motPageContextFetchJson("/api/v1/org/email/bounces/remove-list", {
        method: "POST",
        body: JSON.stringify({
          emailAddresses: selectedEmails
        })
      });

      const responseData = pageResponse?.data || {};
      const errors = Array.isArray(responseData?.errors) ? responseData.errors : [];

      const confirmationFilename = `mot-bounce-removal-confirmation-${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}.csv`;
      const confirmationCsv = createBounceRemovalConfirmationCsv({
        emails: selectedEmails,
        actor: pageResponse?.actor,
        headers: pageResponse?.headers || {},
        status: pageResponse?.status,
        statusText: pageResponse?.statusText,
        response: responseData
      });

      showRemovalConfirmationDownload(confirmationCsv, confirmationFilename);

      if (errors.length > 0) {
        setStatus("[data-mot-bounce-status]", "warn", `Removal completed with ${errors.length} error${errors.length === 1 ? "" : "s"}`);
        setText("[data-mot-bounce-error]", safeJsonStringify(errors));
      } else {
        setStatus("[data-mot-bounce-status]", "ok", "Selected emails removed from bounce list. Download confirmation CSV.");
      }
    } catch (error) {
      if (error.message.includes("403")) {
        setStatus("[data-mot-bounce-status]", "warn", "Bounce removal denied by admin page session");
      } else {
        setStatus("[data-mot-bounce-status]", "error", "Bounce removal failed");
      }

      setText("[data-mot-bounce-error]", error.message);
    }
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

  function csvEscape(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function createBounceRemovalConfirmationCsv({ emails, actor, headers, status, statusText, response }) {
    const timestamp = new Date().toISOString();
    const requestId = getResponseRequestId(headers);
    const errors = Array.isArray(response?.errors) ? response.errors : [];
    const responseSummary =
      status === 200 && errors.length === 0
        ? "successful"
        : errors.length > 0
          ? JSON.stringify(errors)
          : JSON.stringify(response || {});

    const rows = emails.map((email) => ({
      emailRemoved: email,
      actor: actor || "Current admin session",
      responseHeaderRequestId: requestId,
      timestamp,
      response: status === 200 && errors.length === 0 ? "200 successful" : `${status} ${statusText}: ${responseSummary}`
    }));

    const headersRow = [
      "email_removed",
      "actor_requested_removal",
      "response_header_request_id",
      "timestamp",
      "response"
    ];

    const csvRows = rows.map((row) =>
      [
        row.emailRemoved,
        row.actor,
        row.responseHeaderRequestId,
        row.timestamp,
        row.response
      ].map(csvEscape).join(",")
    );

    return [headersRow.join(","), ...csvRows].join("\n");
  }

  function downloadTextFile(filename, content, mimeType = "text/csv") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  function showRemovalConfirmationDownload(csv, filename) {
    lastRemovalConfirmationCsv = csv;
    lastRemovalConfirmationFilename = filename;

    const container = document.querySelector("[data-mot-removal-confirmation]");
    if (!container) return;

    container.innerHTML = `
      <div class="mot-confirmation-box">
        <div>Selected emails removed from bounce list.</div>
        <button class="mot-small-button" type="button" data-mot-action="download-removal-confirmation">
          Download confirmation CSV
        </button>
      </div>
    `;
  }

  function exportBounceResultsCsv() {
    if (bounceResults.length === 0) {
      setStatus("[data-mot-bounce-status]", "warn", "No results to export");
      return;
    }

    const headers = ["email", "reason", "count", "lastSeen", "eventUuids"];
    const rows = bounceResults.map((item) =>
      headers
        .map((header) => {
          const value = header === "eventUuids" ? item.eventUuids.join(" | ") : item[header];
          return `"${String(value || "").replaceAll('"', '""')}"`;
        })
        .join(",")
    );

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `mot-bounce-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  function applyPanelState(panel) {
    const minimized = getStoredValue(STORAGE_KEYS.minimized, "false") === "true";
    const position = getStoredValue(STORAGE_KEYS.position, "bottom");

    panel.classList.toggle("mot-minimized", minimized);
    panel.classList.toggle("mot-top", position === "top");
    panel.classList.toggle("mot-bottom", position !== "top");

    const minimizeButton = panel.querySelector("[data-mot-action='minimize']");
    const positionButton = panel.querySelector("[data-mot-action='position']");

    if (minimizeButton) {
      minimizeButton.textContent = minimized ? "□" : "−";
      minimizeButton.title = minimized ? "Expand MOT" : "Minimize MOT";
      minimizeButton.setAttribute("aria-label", minimized ? "Expand MOT" : "Minimize MOT");
    }

    if (positionButton) {
      positionButton.textContent = position === "top" ? "Bottom" : "Top";
      positionButton.title = position === "top" ? "Move MOT to bottom" : "Move MOT to top";
    }
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) {
      return;
    }

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "mot-bottom";

    panel.innerHTML = `
      <div class="mot-header">
        <button class="mot-brand-button" type="button" data-mot-action="toggle" title="Toggle MOT panel">
          <div class="mot-title">MOT v1</div>
          <div class="mot-subtitle">Operations Toolkit</div>
        </button>

        <div class="mot-controls">
          <button class="mot-control mot-position" type="button" data-mot-action="position" title="Move MOT to top">Top</button>
          <button class="mot-control" type="button" data-mot-action="minimize" title="Minimize MOT">−</button>
          <button class="mot-control" type="button" data-mot-action="close" title="Close MOT" aria-label="Close MOT panel">×</button>
        </div>
      </div>

      <div class="mot-body">
        <div class="mot-section">
          <div class="mot-label">Connection</div>
          <div class="mot-kv">
            <span>Admin URL</span>
            <strong data-mot-admin-url>Loading</strong>
          </div>
          <div class="mot-kv">
            <span>Tenant URL</span>
            <strong data-mot-tenant-url>Loading</strong>
          </div>
          <div class="mot-kv">
            <span>Platform</span>
            <strong data-mot-platform>Loading</strong>
          </div>
        </div>

        <div class="mot-section">
          <div class="mot-label">Organization Metadata</div>
          <div class="mot-status-row mot-status-loading" data-mot-org-status>
            <span class="mot-status-dot"></span>
            <span class="mot-status-text">Waiting</span>
          </div>
          <div class="mot-kv mot-mt">
            <span>Cell</span>
            <strong data-mot-cell>Loading</strong>
          </div>
          <div class="mot-kv">
            <span>Pipeline</span>
            <strong data-mot-pipeline>Loading</strong>
          </div>
          <div class="mot-kv">
            <span>Custom Domains</span>
            <strong data-mot-custom-domains>Loading</strong>
          </div>

          <details class="mot-details mot-debug-only">
            <summary>Raw metadata</summary>
            <pre data-mot-org-json>Debug mode disabled</pre>
          </details>
        </div>

        <div class="mot-section">
          <div class="mot-label">API Session Test</div>
          <div class="mot-status-row mot-status-loading" data-mot-api-status>
            <span class="mot-status-dot"></span>
            <span class="mot-status-text">Waiting</span>
          </div>
          <pre class="mot-error" data-mot-api-error></pre>
        </div>

        <div class="mot-section mot-bounce-manager">
          <div class="mot-label">Bounce Email Manager</div>

          <div class="mot-status-row mot-status-loading" data-mot-bounce-status>
            <span class="mot-status-dot"></span>
            <span class="mot-status-text">Ready</span>
          </div>

          <div class="mot-button-row">
            <button class="mot-small-button" type="button" data-mot-action="load-bounces" data-days="1">24h</button>
            <button class="mot-small-button" type="button" data-mot-action="load-bounces" data-days="7">7d</button>
            <button class="mot-small-button" type="button" data-mot-action="load-bounces" data-days="30">30d</button>
            <button class="mot-small-button" type="button" data-mot-action="load-bounces" data-days="90">90d</button>
          </div>

          <div class="mot-bounce-toolbar">
            <span data-mot-bounce-count>0 results</span>
            <button class="mot-link-button" type="button" data-mot-action="select-all-bounces">Select page</button>
          </div>

          <div class="mot-table-wrap">
            <table class="mot-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Email</th>
                  <th>Reason</th>
                  <th>Count</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody data-mot-bounce-tbody>
                <tr>
                  <td colspan="5" class="mot-empty">Choose a time range to search.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mot-pagination">
            <button class="mot-small-button" type="button" data-mot-action="prev-bounce-page">Prev</button>
            <span data-mot-bounce-page>Showing 0-0 · Page 1 of 1</span>
            <button class="mot-small-button" type="button" data-mot-action="next-bounce-page">Next</button>
          </div>

          <div class="mot-button-row">
            <button class="mot-primary-button" type="button" data-mot-action="remove-selected-bounces">Remove Selected</button>
            <button class="mot-small-button" type="button" data-mot-action="export-bounces">Export CSV</button>
          </div>

          <div data-mot-removal-confirmation></div>

          <details class="mot-details">
            <summary>Generated query</summary>
            <pre data-mot-bounce-query>Not generated yet</pre>
          </details>

          <pre class="mot-error" data-mot-bounce-error></pre>
        </div>

        <div class="mot-footer">
          Phase 3.1: Bounce Manager fixes and pagination.
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    if (DEBUG_MODE) {
      panel.classList.add("mot-debug-enabled");
    }

    applyPanelState(panel);

    panel.addEventListener("click", (event) => {
      const button = event.target.closest("[data-mot-action]");
      if (!button) return;

      const action = button.getAttribute("data-mot-action");

      if (action === "close") {
        panel.remove();
        return;
      }

      if (action === "minimize" || action === "toggle") {
        const isMinimized = panel.classList.contains("mot-minimized");
        setStoredValue(STORAGE_KEYS.minimized, String(!isMinimized));
        applyPanelState(panel);
        return;
      }

      if (action === "position") {
        const currentPosition = getStoredValue(STORAGE_KEYS.position, "bottom");
        const nextPosition = currentPosition === "top" ? "bottom" : "top";
        setStoredValue(STORAGE_KEYS.position, nextPosition);
        applyPanelState(panel);
        return;
      }

      if (action === "load-bounces") {
        const days = Number(button.getAttribute("data-days") || "1");
        loadBounceEmails(days);
        return;
      }

      if (action === "select-all-bounces") {
        document.querySelectorAll("[data-mot-bounce-select]").forEach((checkbox) => {
          checkbox.checked = true;
        });
        return;
      }

      if (action === "prev-bounce-page") {
        bounceCurrentPage = Math.max(1, bounceCurrentPage - 1);
        renderBounceResults();
        return;
      }

      if (action === "next-bounce-page") {
        const totalPages = Math.max(1, Math.ceil(bounceResults.length / UI_PAGE_SIZE));
        bounceCurrentPage = Math.min(totalPages, bounceCurrentPage + 1);
        renderBounceResults();
        return;
      }

      if (action === "remove-selected-bounces") {
        removeSelectedBounceEmails();
        return;
      }

      if (action === "export-bounces") {
        exportBounceResultsCsv();
        return;
      }

      if (action === "download-removal-confirmation") {
        if (!lastRemovalConfirmationCsv || !lastRemovalConfirmationFilename) {
          setStatus("[data-mot-bounce-status]", "warn", "No confirmation CSV available");
          return;
        }

        downloadTextFile(lastRemovalConfirmationFilename, lastRemovalConfirmationCsv);
      }
    });

    loadOrganizationInfo();
    testApiAccess();
  }

  function init() {
    if (!isAdminDashboardHost()) {
      return;
    }

    createPanel();
  }

  init();
})();
