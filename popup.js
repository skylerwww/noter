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

function sendMsg(action, callback) {
  chrome.tabs.sendMessage(currentTab.id, { action }, (response) => {
    if (chrome.runtime.lastError) {
      showError('Cannot connect to this page. Try refreshing it.');
      return;
    }
    clearError();
    if (callback) callback(response);
  });
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown' });
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

const DL_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
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
        <button class="action-btn" data-action="copy" data-id="${s.id}" title="Copy Markdown">
          ${COPY_SVG}
        </button>
        <button class="action-btn" data-action="download" data-id="${s.id}" title="Download .md">
          ${DL_SVG}
        </button>
      </div>`;

    // Wire up buttons
    item.querySelector('[data-action="copy"]').addEventListener('click', (e) => {
      navigator.clipboard.writeText(s.markdown).then(() => {
        const btn = e.currentTarget;
        btn.classList.add('copied');
        btn.innerHTML = CHECK_SVG + '<span class="action-text">Copied</span>';
        setTimeout(() => {
          btn.innerHTML = COPY_SVG;
          btn.classList.remove('copied');
        }, 1800);
      });
    });

    item.querySelector('[data-action="download"]').addEventListener('click', () => {
      triggerDownload(s.markdown, s.filename);
    });

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

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Sync switch with current page mode state
  sendMsg('getStatus', ({ active, count }) => setModeUI(active, count));

  // Load + render saved sessions
  loadSessions((sessions) => {
    renderSessions(sessions);
    setInProgressItem(modeActive, modeCount);
  });

  // Switch toggle
  modeSwitch.addEventListener('change', () => {
    sendMsg('toggleMode', (response) => {
      setModeUI(response.active, 0);
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
