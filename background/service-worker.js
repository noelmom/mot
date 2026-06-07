chrome.runtime.onInstalled.addListener(() => {
  console.log("MOT v1 installed");
});

function headersToObject(headers) {
  const result = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

function handleFetchMessage(message, sendResponse, includeHeaders = false) {
  fetch(message.url, {
    method: message.method || "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(message.headers || {})
    },
    body: message.body || undefined
  })
    .then(async (response) => {
      const text = await response.text();

      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }

      sendResponse({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: includeHeaders ? headersToObject(response.headers) : {},
        data
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        status: 0,
        statusText: "Fetch failed",
        headers: {},
        data: {
          error: error.message
        }
      });
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return false;
  }

  if (message.type === "MOT_FETCH_JSON") {
    handleFetchMessage(message, sendResponse, false);
    return true;
  }

  if (message.type === "MOT_FETCH_WITH_HEADERS") {
    handleFetchMessage(message, sendResponse, true);
    return true;
  }

  return false;
});
