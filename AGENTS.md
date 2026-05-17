# Agent guide — noter

This repository is a **Chrome / Chromium Manifest V3 extension** named **noter** in `manifest.json`. It injects a content script into web pages so users can highlight elements, attach notes, capture cropped viewport screenshots, and collect **annotation sessions** as Markdown for AI workflows.

There is **no bundler, no `package.json`, and no test runner** — everything is plain HTML/CSS/JS loaded directly by the browser.

---

## Quick map

| File | Role |
|------|------|
| `manifest.json` | MV3 entry: permissions, content scripts, service worker, action popup |
| `background.js` | Service worker: `chrome.tabs.captureVisibleTab` when the content script asks for a full-tab screenshot |
| `content.js` | In-page UI (highlight, modal, badges), annotation state, selector + crop logic, Markdown/JSON builders, `chrome.runtime.onMessage` |
| `content.css` | Styles for injected noter UI (`__ua-*` classes) |
| `popup.html` / `popup.js` | Toolbar popup: toggle annotating, list/copy/download **Markdown** sessions from `chrome.storage.local` |

---

## Architecture

1. **Content script** runs in the page’s isolated world. It owns `state` (active mode, `annotations`, counter), DOM for highlight/modal/badges, and message handling.
2. **Background** is minimal: responds to `{ action: 'captureScreenshot' }` with a PNG data URL. The content script crops that image to the element’s viewport rect (with DPR).
3. **Popup** talks to the **active tab** via `chrome.tabs.sendMessage` with `getStatus` and `toggleMode`. It cannot assume the content script is injected until the user has navigated or refreshed on restricted flows — errors surface as “Cannot connect to this page.”

**Session flow:** Turning annotating **off** after at least one note (via `toggleMode`) clears in-page annotations/badges and returns a `session` object (Markdown + metadata). The popup persists sessions under storage key `ua_sessions`.

---

## Conventions (keep these consistent)

- **Injected DOM / CSS** uses the `__ua-` prefix (`__ua-highlight`, `.__ua-badge`, etc.). `isAnnotatorEl()` treats elements with `id`/`class` matching this prefix as non-targets for hover/click.
- **Double-load guard:** `content.js` sets `window.__uiAnnotatorLoaded` and bails if already set.
- **Async messaging:** Listeners that call `sendResponse` asynchronously must `return true` to keep the channel open (see `background.js` and `content.js`).
- **User-visible strings** in the manifest and popup should stay aligned with product naming (**noter**).

---

## Permissions and limits

Declared in `manifest.json`: `activeTab`, `scripting`, `storage`, `tabs`, and broad `host_permissions` for `<all_urls>` so the content script can run on normal sites.

**Does not run** on internal browser pages (`chrome://`, `edge://`, etc.). Screenshots are **viewport-only**; elements should be scrolled into view before capture.

---

## How to verify changes

1. Open `chrome://extensions` (or Edge equivalent).
2. Enable **Developer mode** → **Load unpacked** → select **this folder** (the repo root).
3. After editing `manifest.json`, `background.js`, or message contracts, use **Reload** on the extension card.
4. After editing `content.js` / `content.css`, **reload the target web page** so the content script re-injects.

There is no automated lint or CI in-repo; rely on manual smoke tests: toggle mode, add a note, turn mode off (session saved), copy/download from popup.

---

## UI fixtures during development

When changing **popup** or **injected page UI** (markup, layout, CSS), add or update a **standalone HTML file** in the repo (for example under `dev/`) that **mocks all important UI states** with **static fixture data** in the document. Open that file directly in the browser (or serve it locally) so you can review empty, loading, error, in-progress, single-session, multi-session, and any new edge-case layouts **without** stepping through the full extension flow each time.

Keep fixtures **out of `manifest.json`** unless you deliberately ship a demo page. Prefer linking the same stylesheets or duplicating minimal structure so the mock stays close to production markup. Refresh the mock page after edits for a fast feedback loop; still run the unpacked-extension checks above before finishing.

---

## Change checklist for agents

- **`manifest.json`:** bump `version` for user-visible releases; keep `manifest_version` at `3`.
- **New permissions:** require user-facing justification; avoid expanding `host_permissions` without a clear need.
- **New message `action` values:** document the payload shape; update both sender and receiver; keep `return true` where responses are async.
- **Storage schema:** `popup.js` uses `STORAGE_KEY = 'ua_sessions'`; backward compatibility matters if you change session object shape.
- **`content.js` size:** export payloads can include base64 images — be mindful of `chrome.storage.local` quota if you start persisting screenshots in storage.

---

## README vs code

`README.md` may describe Markdown and JSON export flows. The popup UI currently centers on **Markdown** sessions; `content.js` still contains `buildJson()` for structured output if you wire it into the popup or session object. When changing export behavior, update `README.md` in the same change so humans and agents stay aligned.
