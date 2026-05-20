// content.js — noter content script
// Injected into every page. Handles element highlighting, screenshot cropping,
// the note modal, annotation badges, and message handling from the popup.

(() => {
  if (window.__noterRuntime) {
    window.__noterRuntime.syncUi();
    return;
  }

  const state = {
    active: false,
    annotations: [],
    counter: 0,
  };

  let highlightEl;
  let modeIndicator;
  let listenersBound = false;
  let uiObserver = null;

  function mountParent() {
    return document.body || document.documentElement;
  }

  function ensureRoot() {
    let root = document.getElementById('__ua-root');
    if (!root?.isConnected) {
      root = document.createElement('div');
      root.id = '__ua-root';
      mountParent().appendChild(root);
    }
    return root;
  }

  function ensureUiElements() {
    const root = ensureRoot();
    if (!highlightEl?.isConnected) {
      highlightEl = document.createElement('div');
      highlightEl.id = '__ua-highlight';
      root.appendChild(highlightEl);
    }
    if (!modeIndicator?.isConnected) {
      modeIndicator = document.createElement('div');
      modeIndicator.id = '__ua-mode-indicator';
      modeIndicator.innerHTML = '<span class="__ua-dot">●</span> Noting — click an element';
      root.appendChild(modeIndicator);
    }
  }

  function syncUi() {
    ensureUiElements();
    const root = document.getElementById('__ua-root');
    if (root && root.parentElement !== mountParent()) {
      mountParent().appendChild(root);
    }
    if (state.active) {
      document.documentElement.classList.add('__ua-active');
      modeIndicator.style.display = 'flex';
      highlightEl.style.display = 'block';
    } else {
      document.documentElement.classList.remove('__ua-active');
      modeIndicator.style.display = 'none';
      highlightEl.style.display = 'none';
    }
  }

  function startUiObserver() {
    if (uiObserver) return;
    uiObserver = new MutationObserver(() => {
      if (!state.active) return;
      if (!highlightEl?.isConnected || !modeIndicator?.isConnected) syncUi();
    });
    uiObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    ensureUiElements();
    syncUi();
    if (!listenersBound) {
      document.addEventListener('mouseover', onMouseOver, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('pageshow', onPageShow);
      window.addEventListener('popstate', onPageShow);
      listenersBound = true;
    }
    startUiObserver();
  }

  function onPageShow() {
    if (state.active) syncUi();
  }

  function activate() {
    state.active = true;
    syncUi();
    startUiObserver();
    chrome.runtime.sendMessage({ action: 'drawAttention' });
  }

  function deactivate() {
    state.active = false;
    syncUi();
  }

  function toggle() {
    state.active ? deactivate() : activate();
    return state.active;
  }

  function onMouseOver(e) {
    if (!state.active) return;
    ensureUiElements();
    const el = e.target;
    if (isAnnotatorEl(el)) return;
    const rect = el.getBoundingClientRect();
    Object.assign(highlightEl.style, {
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
  }

  async function onClick(e) {
    if (!state.active) return;
    ensureUiElements();
    const el = e.target;
    if (isAnnotatorEl(el)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const rect = el.getBoundingClientRect();
    const selector = getSelector(el);
    const tagName = el.tagName.toLowerCase();
    const innerText = (el.innerText || '').trim().substring(0, 120);

    highlightEl.style.display = 'none';
    modeIndicator.style.display = 'none';

    const screenshot = await captureAndCrop(rect);

    if (state.active) {
      highlightEl.style.display = 'block';
      modeIndicator.style.display = 'flex';
    }

    const note = await showModal(screenshot, selector);
    if (note === null) return;

    const id = ++state.counter;
    state.annotations.push({
      id,
      selector,
      tagName,
      innerText,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      note,
      screenshot,
      timestamp: new Date().toISOString(),
      pageUrl: location.href,
      pageTitle: document.title,
    });

    addBadge(el, id, note);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && state.active) deactivate();
  }

  function captureAndCrop(rect) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
        if (!response || response.error || !response.dataUrl) {
          resolve(null);
          return;
        }
        const img = new Image();
        img.onload = () => {
          const dpr = window.devicePixelRatio || 1;
          const pad = 12;
          const x = Math.max(0, rect.left - pad);
          const y = Math.max(0, rect.top - pad);
          const w = Math.min(window.innerWidth - x, rect.width + pad * 2);
          const h = Math.min(window.innerHeight - y, rect.height + pad * 2);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, x * dpr, y * dpr, w * dpr, h * dpr, 0, 0, w, h);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = response.dataUrl;
      });
    });
  }

  function showModal(screenshot, selector) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = '__ua-overlay';

      const modal = document.createElement('div');
      modal.id = '__ua-modal';

      const header = document.createElement('div');
      header.className = '__ua-modal-header';
      header.innerHTML = `
        <div class="__ua-modal-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Add Annotation
        </div>
        <code class="__ua-selector-badge">${escapeHtml(selector)}</code>
        <button class="__ua-close-btn" id="__ua-close-x">✕</button>
      `;

      if (screenshot) {
        const preview = document.createElement('div');
        preview.className = '__ua-preview';
        const img = document.createElement('img');
        img.src = screenshot;
        img.className = '__ua-preview-img';
        preview.appendChild(img);
        modal.appendChild(header);
        modal.appendChild(preview);
      } else {
        modal.appendChild(header);
      }

      const body = document.createElement('div');
      body.className = '__ua-modal-body';

      const label = document.createElement('label');
      label.className = '__ua-label';
      label.textContent = 'Note for agent';
      label.htmlFor = '__ua-note-textarea';

      const textarea = document.createElement('textarea');
      textarea.id = '__ua-note-textarea';
      textarea.className = '__ua-textarea';
      textarea.placeholder = 'Describe the issue, change needed, or anything you want the agent to know…';
      textarea.rows = 4;

      const hint = document.createElement('p');
      hint.className = '__ua-hint';
      hint.textContent = 'Ctrl+Enter to save · Esc to cancel';

      body.appendChild(label);
      body.appendChild(textarea);
      body.appendChild(hint);

      const footer = document.createElement('div');
      footer.className = '__ua-modal-footer';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = '__ua-btn __ua-btn-ghost';
      cancelBtn.textContent = 'Cancel';

      const saveBtn = document.createElement('button');
      saveBtn.className = '__ua-btn __ua-btn-primary';
      saveBtn.textContent = 'Save Note';

      footer.appendChild(cancelBtn);
      footer.appendChild(saveBtn);
      body.appendChild(footer);
      modal.appendChild(body);
      overlay.appendChild(modal);
      ensureRoot().appendChild(overlay);

      setTimeout(() => textarea.focus(), 60);

      function close(value) {
        overlay.remove();
        resolve(value);
      }

      saveBtn.addEventListener('click', () => {
        const note = textarea.value.trim();
        if (!note) { textarea.classList.add('__ua-textarea-error'); return; }
        close(note);
      });
      cancelBtn.addEventListener('click', () => close(null));
      overlay.querySelector('#__ua-close-x').addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
      textarea.addEventListener('input', () => textarea.classList.remove('__ua-textarea-error'));
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(null); }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          const note = textarea.value.trim();
          if (note) close(note);
        }
      });
    });
  }

  function addBadge(el, id, note) {
    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const badge = document.createElement('div');
    badge.className = '__ua-badge';
    badge.textContent = id;
    badge.title = `#${id}: ${note}`;
    badge.dataset.annotationId = id;
    badge.style.top = (rect.top + scrollY - 10) + 'px';
    badge.style.left = (rect.left + scrollX - 10) + 'px';
    mountParent().appendChild(badge);
  }

  function isAnnotatorEl(el) {
    const id = el.id || '';
    const cls = (typeof el.className === 'string') ? el.className : '';
    return id.startsWith('__ua-') || cls.includes('__ua-');
  }

  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.tagName && cur !== document.documentElement) {
      if (cur.id) { parts.unshift('#' + CSS.escape(cur.id)); break; }
      let part = cur.tagName.toLowerCase();
      const classes = Array.from(cur.classList || [])
        .filter(c => !c.startsWith('__ua-'))
        .slice(0, 2);
      if (classes.length) part += '.' + classes.join('.');
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(s => s.tagName === cur.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      if (parts.length >= 5) break;
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildMarkdown(annotations, pageTitle, pageUrl) {
    const date = new Date().toISOString();
    const lines = [
      `---`,
      `page: "${pageTitle}"`,
      `url: ${pageUrl}`,
      `exported: ${date}`,
      `tasks: ${annotations.length}`,
      `---`,
      ``,
      `# noter tasks`,
      ``,
      `Each task below is a numbered fix request tied to a specific UI element.`,
      `CSS selector, element size, and a text preview are provided as context.`,
    ];

    annotations.forEach((ann) => {
      lines.push(``);
      lines.push(`## Task ${ann.id} — \`${ann.selector}\``);
      lines.push(``);
      lines.push(`**Fix:** ${ann.note.replace(/\n/g, ' ')}`);
      lines.push(``);
      const ctx = [
        `\`<${ann.tagName}>\``,
        `${ann.rect.width}×${ann.rect.height}px`,
      ];
      if (ann.innerText) ctx.push(`"${ann.innerText.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
      lines.push(`**Element context:** ${ctx.join(' · ')}`);
      lines.push(``);
      lines.push(`---`);
    });

    return lines.join('\n');
  }

  function buildHtml(annotations, pageTitle, pageUrl) {
    const exported = new Date().toISOString();
    const tasksHtml = annotations.map((ann) => {
      const ctx = [
        `<code>&lt;${escapeHtml(ann.tagName)}&gt;</code>`,
        `${ann.rect.width}×${ann.rect.height}px`,
      ];
      if (ann.innerText) {
        ctx.push(`"${escapeHtml(ann.innerText.replace(/\n/g, ' '))}"`);
      }
      const screenshotBlock = ann.screenshot
        ? `<figure class="screenshot"><img src="${ann.screenshot}" alt="Task ${ann.id} screenshot"></figure>`
        : `<p class="no-screenshot">Screenshot unavailable</p>`;

      return `
    <article class="task">
      <h2>Task ${ann.id} — <code>${escapeHtml(ann.selector)}</code></h2>
      <p class="fix"><strong>Fix:</strong> ${escapeHtml(ann.note).replace(/\n/g, '<br>')}</p>
      <p class="context"><strong>Element context:</strong> ${ctx.join(' · ')}</p>
      ${screenshotBlock}
    </article>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>noter — ${escapeHtml(pageTitle)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 15px;
      line-height: 1.55;
      color: #171717;
      background: #fafafa;
      padding: 32px 20px 48px;
    }
    .wrap { max-width: 760px; margin: 0 auto; }
    header {
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 12px;
      padding: 24px 28px;
      margin-bottom: 24px;
    }
    header h1 {
      font-size: 22px;
      font-weight: 700;
      color: #0a0a0a;
      margin-bottom: 6px;
    }
    header .intro {
      color: #525252;
      font-size: 14px;
      margin-bottom: 18px;
    }
    .meta {
      display: grid;
      gap: 6px;
      font-size: 13px;
    }
    .meta div { display: flex; gap: 8px; }
    .meta dt {
      font-weight: 600;
      color: #737373;
      min-width: 64px;
      flex-shrink: 0;
    }
    .meta dd { color: #171717; word-break: break-word; }
    .meta a { color: #ea580c; word-break: break-all; }
    .task {
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 12px;
      padding: 22px 28px;
      margin-bottom: 16px;
    }
    .task h2 {
      font-size: 16px;
      font-weight: 600;
      color: #0a0a0a;
      margin-bottom: 12px;
      word-break: break-word;
    }
    .task h2 code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      font-weight: 500;
      color: #c2410c;
      background: #fff7ed;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .fix, .context {
      font-size: 14px;
      color: #404040;
      margin-bottom: 10px;
    }
    .fix strong, .context strong { color: #171717; }
    .context code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      background: #f5f5f5;
      padding: 1px 4px;
      border-radius: 3px;
    }
    .screenshot {
      margin-top: 16px;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      overflow: hidden;
      background: #f5f5f5;
    }
    .screenshot img {
      display: block;
      width: 100%;
      height: auto;
    }
    .no-screenshot {
      margin-top: 12px;
      font-size: 13px;
      color: #a3a3a3;
      font-style: italic;
    }
    footer {
      margin-top: 28px;
      text-align: center;
      font-size: 12px;
      color: #a3a3a3;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>noter tasks</h1>
      <p class="intro">Each task is a numbered fix request tied to a specific UI element.</p>
      <dl class="meta">
        <div><dt>Page</dt><dd>${escapeHtml(pageTitle)}</dd></div>
        <div><dt>URL</dt><dd><a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a></dd></div>
        <div><dt>Exported</dt><dd>${escapeHtml(exported)}</dd></div>
        <div><dt>Tasks</dt><dd>${annotations.length}</dd></div>
      </dl>
    </header>
    <main>
      ${tasksHtml}
    </main>
    <footer>Exported by noter</footer>
  </div>
</body>
</html>`;
  }

  function buildJson(annotations, pageTitle, pageUrl) {
    const payload = {
      meta: {
        tool: 'noter v1.0',
        page: pageTitle,
        url: pageUrl,
        exported: new Date().toISOString(),
        taskCount: annotations.length,
      },
      tasks: annotations.map((ann) => ({
        id: ann.id,
        selector: ann.selector,
        tagName: ann.tagName,
        size: { width: ann.rect.width, height: ann.rect.height },
        ...(ann.innerText ? { textPreview: ann.innerText } : {}),
        task: ann.note,
        screenshot: ann.screenshot || null,
      })),
    };
    return JSON.stringify(payload, null, 2);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'ping' || msg.action === 'getStatus' || msg.action === 'syncUi') {
      syncUi();
      sendResponse({ ok: true, active: state.active, count: state.annotations.length });
      return;
    }

    if (msg.action === 'toggleMode') {
      const wasActive = state.active;
      const nowActive = toggle();
      if (wasActive && !nowActive && state.annotations.length > 0) {
        const ts = Date.now();
        const md = buildMarkdown(state.annotations, document.title, location.href);
        const html = buildHtml(state.annotations, document.title, location.href);
        const session = {
          id: ts,
          pageTitle: document.title,
          pageUrl: location.href,
          count: state.annotations.length,
          markdown: md,
          html,
          filename: `annotations-${ts}.md`,
          htmlFilename: `annotations-${ts}.html`,
          timestamp: new Date().toISOString(),
        };
        state.annotations = [];
        state.counter = 0;
        document.querySelectorAll('.__ua-badge').forEach(b => b.remove());
        sendResponse({ active: nowActive, session, count: state.annotations.length });
      } else {
        sendResponse({ active: nowActive, session: null, count: state.annotations.length });
      }
      return;
    }
  });

  window.__noterRuntime = { syncUi };
  init();
})();
