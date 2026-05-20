// background.js — Service Worker
// Screenshot capture and bringing the host window to the front.

/** Bounce the dock icon without stealing focus (safe while the popup is open). */
async function drawAttentionToTab(tab) {
  if (!tab?.windowId) return;
  try {
    await chrome.windows.update(tab.windowId, { drawAttention: true });
  } catch {
    // Ignore — optional UX polish.
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'drawAttention') {
    drawAttentionToTab(sender.tab).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.action === 'captureScreenshot') {
    const windowId = sender.tab ? sender.tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true;
  }
});
