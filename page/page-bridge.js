(() => {
  if (window.__MOT_V1_PAGE_BRIDGE__) {
    return;
  }

  window.__MOT_V1_PAGE_BRIDGE__ = true;

  function getPageXsrfToken() {
    const xsrfElement = document.querySelector("#_xsrfToken");

    if (xsrfElement) {
      return xsrfElement.textContent || xsrfElement.value || "";
    }

    const metaCandidates = [
      'meta[name="_xsrfToken"]',
      'meta[name="csrf-token"]',
      'meta[name="_csrf"]'
    ];

    for (const selector of metaCandidates) {
      const meta = document.querySelector(selector);
      const value = meta?.getAttribute("content");

      if (value) {
        return value;
      }
    }

    return "";
  }

  function getCurrentActor() {
    return "Current admin session";
  }

  function headersToObject(headers) {
    const result = {};
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }

  function buildHeaders(requestHeaders = {}) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Okta-User-Agent-Extended": "MOT-v1",
      ...requestHeaders
    };

    const xsrfToken = getPageXsrfToken();

    if (xsrfToken) {
      headers["X-Okta-XsrfToken"] = xsrfToken;
    }

    return headers;
  }

  window.addEventListener("MOT_V1_PAGE_FETCH_REQUEST", async (event) => {
    const detail = event.detail || {};
    const requestId = detail.requestId;

    try {
      const response = await fetch(detail.url, {
        method: detail.method || "GET",
        credentials: "include",
        headers: buildHeaders(detail.headers || {}),
        body: detail.body || undefined
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

      window.dispatchEvent(new CustomEvent("MOT_V1_PAGE_FETCH_RESPONSE", {
        detail: {
          requestId,
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          xsrfFound: Boolean(getPageXsrfToken()),
          actor: getCurrentActor(),
          headers: headersToObject(response.headers),
          data
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent("MOT_V1_PAGE_FETCH_RESPONSE", {
        detail: {
          requestId,
          ok: false,
          status: 0,
          statusText: "Page context fetch failed",
          xsrfFound: Boolean(getPageXsrfToken()),
          actor: getCurrentActor(),
          headers: {},
          data: { error: error.message }
        }
      }));
    }
  });

  window.dispatchEvent(new CustomEvent("MOT_V1_PAGE_BRIDGE_READY", {
    detail: { xsrfFound: Boolean(getPageXsrfToken()) }
  }));
})();
