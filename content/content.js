(() => {
  const PANEL_ID = "mot-v1-panel";

  function getTenantHost() {
    return window.location.hostname;
  }

  function isSupportedTenantPage() {
    const host = window.location.hostname;
    return (
      host.endsWith(".okta.com") ||
      host.endsWith(".oktapreview.com") ||
      host.endsWith(".okta-emea.com")
    );
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) {
      return;
    }

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="mot-header">
        <div>
          <div class="mot-title">MOT v1</div>
          <div class="mot-subtitle">Operations Toolkit</div>
        </div>
        <button class="mot-close" type="button" aria-label="Close MOT panel">×</button>
      </div>

      <div class="mot-section">
        <div class="mot-label">Connected Tenant</div>
        <div class="mot-value">${getTenantHost()}</div>
      </div>

      <div class="mot-section">
        <div class="mot-label">Phase 1 Status</div>
        <div class="mot-status-row">
          <span class="mot-status-dot"></span>
          <span>Panel loaded successfully</span>
        </div>
      </div>

      <div class="mot-section">
        <div class="mot-label">Tools</div>
        <button class="mot-tool-button" type="button" disabled>
          Bounce Email Manager
          <span>Coming Soon</span>
        </button>
      </div>

      <div class="mot-footer">
        No API calls are made in Phase 1.
      </div>
    `;

    document.body.appendChild(panel);

    const closeButton = panel.querySelector(".mot-close");
    closeButton.addEventListener("click", () => {
      panel.remove();
    });
  }

  function init() {
    if (!isSupportedTenantPage()) {
      return;
    }

    createPanel();
  }

  init();
})();
