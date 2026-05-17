// content.js — noter content script
// Injected into every page. Handles element highlighting, screenshot cropping,
// the note modal, annotation badges, and message handling from the popup.

(() => {
  if (window.__uiAnnotatorLoaded) return;
  window.__uiAnnotatorLoaded = true;

  // ─── State ────────────────────────────────────────────────────────────────
  const state = {
    active: false,
    annotations: [],
    counter: 0,
  };

  // ─── UI Elements ──────────────────────────────────────────────────────────
  let highlightEl, modeIndicator;

  function init() {
    highlightEl = document.createElement('div');
    highlightEl.id = '__ua-highlight';
    document.documentElement.appendChild(highlightEl);

    modeIndicator = document.createElement('div');
    modeIndicator.id = '__ua-mode-indicator';
    modeIndicator.innerHTML = '<span class="__ua-dot">●</span> Noting — click an element';
    document.documentElement.appendChild(modeIndicator);

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  // ─── Mode Toggle ──────────────────────────────────────────────────────────
  function activate() {
    state.active = true;
    document.documentElement.classList.add('__ua-active');
    modeIndicator.style.display = 'flex';
    highlightEl.style.display = 'block';
  }

  function deactivate() {
    state.active = false;
    document.documentElement.classList.remove('__ua-active');
    modeIndicator.style.display = 'none';
    highlightEl.style.display = 'none';
  }

  function toggle() {
    state.active ? deactivate() : activate();
    return state.active;
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────
  function onMouseOver(e) {
    if (!state.active) return;
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
    const el = e.target;
    if (isAnnotatorEl(el)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const rect = el.getBoundingClientRect();
    const selector = getSelector(el);
    const tagName = el.tagName.toLowerCase();
    const innerText = (el.innerText || '').trim().substring(0, 120);

    // Hide annotator UI before screenshot
    highlightEl.style.display = 'none';
    modeIndicator.style.display = 'none';

    const screenshot = await captureAndCrop(rect);

    // Restore annotator UI
    highlightEl.style.display = 'block';
    modeIndicator.style.display = 'flex';

    // Show note modal
    const note = await showModal(screenshot, selector);
    if (note === null) return; // user cancelled

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

  // ─── Screenshot ───────────────────────────────────────────────────────────
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

  // ─── Note Modal ───────────────────────────────────────────────────────────
  function showModal(screenshot, selector) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = '__ua-overlay';

      const modal = document.createElement('div');
      modal.id = '__ua-modal';

      // Header
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

      // Screenshot preview
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

      // Body
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
      hint.textContent = '⌘↵ to save · Esc to cancel';

      body.appendChild(label);
      body.appendChild(textarea);
      body.appendChild(hint);

      // Footer
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
      document.documentElement.appendChild(overlay);

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
      document.getElementById('__ua-close-x').addEventListener('click', () => close(null));
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

  // ─── Annotation Badge ─────────────────────────────────────────────────────
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
    document.documentElement.appendChild(badge);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
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

  // ─── Export Helpers (called from popup via message) ───────────────────────
  function buildMarkdown(annotations, pageTitle, pageUrl) {
    const date = new Date().toISOString();
    // YAML frontmatter — compact, zero wasted tokens vs. markdown tables
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
      // Lead with the actionable instruction
      lines.push(`**Fix:** ${ann.note.replace(/\n/g, ' ')}`);
      lines.push(``);
      // Compact context line — no x/y coords (not actionable for code changes)
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

  function buildJson(annotations, pageTitle, pageUrl) {
    // Lean schema: per-annotation fields that are redundant with meta are omitted.
    // `note` renamed to `task` for imperative agent clarity.
    // x/y coords dropped (not actionable for code edits).
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

  // ─── Message Listener ─────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.action) {
      case 'toggleMode': {
        const wasActive = state.active;
        const nowActive = toggle();
        // When turning OFF with annotations, return the completed session data
        if (wasActive && !nowActive && state.annotations.length > 0) {
          const md = buildMarkdown(state.annotations, document.title, location.href);
          const session = {
            id: Date.now(),
            pageTitle: document.title,
            pageUrl: location.href,
            count: state.annotations.length,
            markdown: md,
            filename: `annotations-${Date.now()}.md`,
            timestamp: new Date().toISOString(),
          };
          // Reset for next session
          state.annotations = [];
          state.counter = 0;
          document.querySelectorAll('.__ua-badge').forEach(b => b.remove());
          sendResponse({ active: nowActive, session });
        } else {
          sendResponse({ active: nowActive, session: null });
        }
        break;
      }
      case 'getStatus':
        sendResponse({ active: state.active, count: state.annotations.length });
        break;
    }
    return true; // keep channel open for async-style responses
  });

  init();
})();
