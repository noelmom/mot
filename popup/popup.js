(() => {
  const toggle = document.querySelector("[data-panel-toggle]");
  const status = document.querySelector("[data-panel-status]");
  const statusCard = document.querySelector(".popup-status");

  function setAvailable(available, enabled = false) {
    toggle.disabled = !available;
    toggle.checked = available && enabled;
    statusCard.classList.toggle("popup-status-unavailable", !available);
    status.textContent = available
      ? enabled ? "Enabled on this tab" : "Disabled on this tab"
      : "Open an Okta Admin Console tab";
  }

  function withActiveTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        setAvailable(false);
        return;
      }
      callback(tab.id);
    });
  }

  function readPanelState() {
    withActiveTab((tabId) => {
      chrome.tabs.sendMessage(tabId, { type: "REBOUND_GET_PANEL_STATE" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          setAvailable(false);
          return;
        }
        setAvailable(true, response.enabled);
      });
    });
  }

  toggle.addEventListener("change", () => {
    const requestedState = toggle.checked;
    toggle.disabled = true;
    withActiveTab((tabId) => {
      chrome.tabs.sendMessage(
        tabId,
        { type: "REBOUND_SET_PANEL_ENABLED", enabled: requestedState },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            setAvailable(false);
            return;
          }
          setAvailable(true, response.enabled);
        }
      );
    });
  });

  readPanelState();
})();
