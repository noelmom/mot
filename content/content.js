(() => {
  const PANEL_ID = "mot-v1-panel";
  const DEBUG_MODE = false;

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

  function getAdminHost() {
    return window.location.hostname.toLowerCase();
  }

  function getAdminOrigin() {
    return window.location.origin;
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

    // Temporary heuristic until we normalize against more real endpoint responses.
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
    const tenantOrigin = getTenantOriginFromAdminHost();

    if (!tenantOrigin) {
      setStatus("[data-mot-api-status]", "error", "Unable to derive tenant URL");
      return;
    }

    try {
      setStatus("[data-mot-api-status]", "loading", "Testing API access");

      await motFetchJson(`${tenantOrigin}/api/v1/logs?limit=1`);

      setStatus("[data-mot-api-status]", "ok", "API reachable with current session");
    } catch (error) {
      setStatus("[data-mot-api-status]", "error", "API test failed");

      const details = document.querySelector("[data-mot-api-error]");
      if (details) {
        details.textContent = error.message;
      }
    }
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

        <div class="mot-section">
          <div class="mot-label">Tools</div>
          <button class="mot-tool-button" type="button" disabled>
            Bounce Email Manager
            <span>Coming Soon</span>
          </button>
        </div>

        <div class="mot-footer">
          Phase 2.1: tenant detection and service-worker API test.
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
