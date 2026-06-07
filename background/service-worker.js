chrome.runtime.onInstalled.addListener(() => {
  console.log("MOT v1 installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "MOT_FETCH_JSON") {
    return false;
  }

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
        data
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        status: 0,
        statusText: "Fetch failed",
        data: {
          error: error.message
        }
      });
    });

  return true;
});
