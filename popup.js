// popup.js — noter popup (sessions architecture)

const modeSwitch  = document.getElementById('mode-switch');
const toggleRow   = document.getElementById('toggle-row');
const toggleSub   = document.getElementById('toggle-sub');
const sessionsList = document.getElementById('sessions-list');
const errorMsg    = document.getElementById('error-msg');

const STORAGE_KEY = 'ua_sessions';
let currentTab = null;
let modeActive = false;
let modeCount = 0;

// ── Helpers ───────────────────────────────────────────────────────────────

function showError(msg) {
  errorMsg.style.display = 'block';
  errorMsg.textContent = msg;
}
function clearError() { errorMsg.style.display = 'none'; }

const RESTRICTED_URL_RE = /^(chrome|chrome-extension|edge|about|moz-extension|view-source):/;

function isRestrictedUrl(url) {
  return !url || RESTRICTED_URL_RE.test(url);
}

async function ensurePageScript(tab) {
  if (!tab?.id || isRestrictedUrl(tab.url)) return false;
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return true;
  } catch {
    return false;
  }
}

function sendMsg(action, callback) {
  if (!currentTab?.id) {
    showError('No active tab found.');
    if (callback) callback(null);
    return;
  }

  if (isRestrictedUrl(currentTab.url)) {
    showError('noter cannot run on this page. Open a normal website (https://…) and try again.');
    if (callback) callback(null);
    return;
  }

  const tabId = currentTab.id;

  const finish = (response, failed) => {
    if (failed) {
      showError('Cannot connect to this page. Refresh the tab, then try again.');
      if (callback) callback(null);
      return;
    }
    clearError();
    if (callback) callback(response);
  };

  (async () => {
    const injected = await ensurePageScript(currentTab);
    if (!injected) {
      finish(null, true);
      return;
    }

    chrome.tabs.sendMessage(tabId, { action }, (response) => {
      if (chrome.runtime.lastError) {
        finish(null, true);
        return;
      }
      finish(response, false);
    });
  })();
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Session storage ───────────────────────────────────────────────────────

function loadSessions(callback) {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    callback(result[STORAGE_KEY] || []);
  });
}

function saveSessions(sessions, callback) {
  chrome.storage.local.set({ [STORAGE_KEY]: sessions }, callback);
}

function addSession(session, callback) {
  loadSessions((sessions) => {
    sessions.unshift(session); // newest first
    saveSessions(sessions, callback);
  });
}

// ── Render sessions ───────────────────────────────────────────────────────

const COPY_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
</svg>`;

const DL_MD_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
</svg>`;

const DL_HTML_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  <line x1="16" y1="13" x2="8" y2="13"/>
  <line x1="16" y1="17" x2="8" y2="17"/>
</svg>`;

const CHECK_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
  <polyline points="20 6 9 17 4 12"/>
</svg>`;

function renderSessions(sessions) {
  sessionsList.innerHTML = '';

  if (!sessions.length) {
    sessionsList.innerHTML = `
      <div class="sessions-empty">
        <strong>No sessions yet</strong>
        Turn on noting, select elements, then turn it off to save a session.
      </div>`;
    return;
  }

  const sortedSessions = [...sessions].sort((a, b) => {
    const aTs = new Date(a.timestamp || 0).getTime();
    const bTs = new Date(b.timestamp || 0).getTime();
    return bTs - aTs;
  });

  sortedSessions.forEach((s) => {
    const item = document.createElement('div');
    item.className = 'session-item';

    const noteWord = s.count === 1 ? 'note' : 'notes';
    item.innerHTML = `
      <div class="session-info">
        <div class="session-title">${escapeHtml(s.pageTitle)}</div>
        <div class="session-meta">
          <span class="session-count">${s.count} ${noteWord}</span>
          <span class="session-dot"></span>
          <span class="session-time">${formatTime(s.timestamp)}</span>
        </div>
      </div>
      <div class="session-actions">
        <button type="button" class="action-btn copy-btn" data-action="copy" data-id="${s.id}" title="Copy Markdown">
          <span class="action-icon action-icon--copy" aria-hidden="true">${COPY_SVG}</span>
          <span class="action-icon action-icon--check" aria-hidden="true">${CHECK_SVG}</span>
          <span class="action-text">Copied</span>
        </button>
        <button class="action-btn" data-action="download-md" data-id="${s.id}" title="Download .md">
          ${DL_MD_SVG}
        </button>
        ${s.html ? `<button class="action-btn" data-action="download-html" data-id="${s.id}" title="Download .html">
          ${DL_HTML_SVG}
        </button>` : ''}
      </div>`;

    // Wire up buttons
    item.querySelector('[data-action="copy"]').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      navigator.clipboard.writeText(s.markdown).then(() => {
        if (!btn.isConnected) return;
        btn.classList.add('copied');
        clearTimeout(btn._copiedTimer);
        btn._copiedTimer = setTimeout(() => btn.classList.remove('copied'), 1800);
      });
    });

    item.querySelector('[data-action="download-md"]').addEventListener('click', () => {
      triggerDownload(s.markdown, s.filename, 'text/markdown');
    });

    const htmlBtn = item.querySelector('[data-action="download-html"]');
    if (htmlBtn) {
      htmlBtn.addEventListener('click', () => {
        triggerDownload(s.html, s.htmlFilename, 'text/html');
      });
    }

    sessionsList.appendChild(item);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Mode UI ───────────────────────────────────────────────────────────────

function setInProgressItem(active, count) {
  const existing = document.getElementById('__ua-inprogress');
  if (existing) existing.remove();
  if (!active) return;

  const item = document.createElement('div');
  item.id = '__ua-inprogress';
  item.className = 'session-item is-inprogress';
  const noteWord = count === 1 ? 'note' : 'notes';
  const countLabel = count > 0 ? `${count} ${noteWord} so far` : 'Noting…';
  item.innerHTML = `
    <div class="session-info">
      <div class="session-title">Current session</div>
      <div class="session-meta">
        <span class="session-count">${countLabel}</span>
      </div>
    </div>
    <div class="inprogress-badge"><span class="pip"></span>In progress</div>`;
  sessionsList.insertAdjacentElement('afterbegin', item);
}

function setModeUI(active, count = 0) {
  modeActive = active;
  modeCount = count;
  modeSwitch.checked = active;
  toggleRow.classList.toggle('is-active', active);
  toggleSub.textContent = active ? 'ON' : 'OFF';
  setInProgressItem(active, count);
}

// ── Init ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Paint saved sessions immediately so the popup never feels blank while connecting.
  loadSessions((sessions) => renderSessions(sessions));

  modeSwitch.disabled = true;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    currentTab = tab;
    modeSwitch.disabled = false;
    sendMsg('syncUi', (response) => {
      if (response) setModeUI(response.active, response.count);
    });
  });

  // Switch toggle
  modeSwitch.addEventListener('change', () => {
    if (!currentTab?.id) {
      modeSwitch.checked = !modeSwitch.checked;
      showError('Still loading — try again in a moment.');
      return;
    }
    const wantOn = modeSwitch.checked;
    sendMsg('toggleMode', (response) => {
      if (!response) {
        modeSwitch.checked = !wantOn;
        return;
      }
      setModeUI(response.active, response.count ?? 0);
      if (response.session) {
        addSession(response.session, () => {
          loadSessions((sessions) => {
            renderSessions(sessions);
            setInProgressItem(modeActive, modeCount);
          });
        });
      }
    });
  });
});
