/* ==========================================================================
   KEYCHECK — keyboard tester
   Physical key detection through KeyboardEvent.code (layout independent).
   Everything happens locally in the browser: no key data ever leaves the page.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------- key layout */
  /* ANSI 104 layout expressed in keyboard units (1u = one standard key).
     Row/column placement is explicit so the three clusters stay aligned:
       row 1 -> function row          row 4 -> home row
       row 2 -> number row            row 5 -> bottom letter row
       row 3 -> QWERTY row            row 6 -> modifier row                */

  const MAIN_ROWS = [
    // Function row
    [
      { c: 'Escape', l: 'Esc' }, { g: 0.5 },
      'F1', 'F2', 'F3', 'F4', { g: 0.5 },
      'F5', 'F6', 'F7', 'F8', { g: 0.5 },
      'F9', 'F10', 'F11', 'F12', { g: 0.5 }
    ],
    // Number row
    [
      { c: 'Backquote', l: '`', s: '~' },
      { c: 'Digit1', l: '1', s: '!' }, { c: 'Digit2', l: '2', s: '@' },
      { c: 'Digit3', l: '3', s: '#' }, { c: 'Digit4', l: '4', s: '$' },
      { c: 'Digit5', l: '5', s: '%' }, { c: 'Digit6', l: '6', s: '^' },
      { c: 'Digit7', l: '7', s: '&' }, { c: 'Digit8', l: '8', s: '*' },
      { c: 'Digit9', l: '9', s: '(' }, { c: 'Digit0', l: '0', s: ')' },
      { c: 'Minus', l: '-', s: '_' }, { c: 'Equal', l: '=', s: '+' },
      { c: 'Backspace', l: '⌫', s: 'Bksp', w: 2 }
    ],
    // QWERTY row
    [
      { c: 'Tab', l: 'Tab', w: 1.5 },
      'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
      { c: 'BracketLeft', l: '[', s: '{' }, { c: 'BracketRight', l: ']', s: '}' },
      { c: 'Backslash', l: '\\', s: '|', w: 1.5 }
    ],
    // Home row
    [
      { c: 'CapsLock', l: 'Caps', w: 1.75 },
      'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL',
      { c: 'Semicolon', l: ';', s: ':' }, { c: 'Quote', l: "'", s: '"' },
      { c: 'Enter', l: '⏎', s: 'Enter', w: 2.25 }
    ],
    // Bottom letter row
    [
      { c: 'ShiftLeft', l: 'Shift', s: 'L', w: 2.25 },
      'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM',
      { c: 'Comma', l: ',', s: '<' }, { c: 'Period', l: '.', s: '>' },
      { c: 'Slash', l: '/', s: '?' },
      { c: 'ShiftRight', l: 'Shift', s: 'R', w: 2.75 }
    ],
    // Modifier row
    [
      { c: 'ControlLeft', l: 'Ctrl', w: 1.25 },
      { c: 'MetaLeft', l: 'Win', w: 1.25 },
      { c: 'AltLeft', l: 'Alt', w: 1.25 },
      { c: 'Space', l: 'Space', w: 6.25 },
      { c: 'AltRight', l: 'Alt', w: 1.25 },
      { c: 'MetaRight', l: 'Win', w: 1.25 },
      { c: 'ContextMenu', l: 'Menu', w: 1.25 },
      { c: 'ControlRight', l: 'Ctrl', w: 1.25 }
    ]
  ];

  // Navigation cluster — 3 columns x 6 rows
  const NAV_GRID = [
    { r: 1, c: 1, spec: { c: 'PrintScreen', l: 'PrtSc', s: 'SysRq' } },
    { r: 1, c: 2, spec: { c: 'ScrollLock', l: 'ScrLk' } },
    { r: 1, c: 3, spec: { c: 'Pause', l: 'Pause', s: 'Break' } },
    { r: 2, c: 1, spec: { c: 'Insert', l: 'Ins' } },
    { r: 2, c: 2, spec: { c: 'Home', l: 'Home' } },
    { r: 2, c: 3, spec: { c: 'PageUp', l: 'PgUp' } },
    { r: 3, c: 1, spec: { c: 'Delete', l: 'Del' } },
    { r: 3, c: 2, spec: { c: 'End', l: 'End' } },
    { r: 3, c: 3, spec: { c: 'PageDown', l: 'PgDn' } },
    { r: 5, c: 2, spec: { c: 'ArrowUp', l: '↑' } },
    { r: 6, c: 1, spec: { c: 'ArrowLeft', l: '←' } },
    { r: 6, c: 2, spec: { c: 'ArrowDown', l: '↓' } },
    { r: 6, c: 3, spec: { c: 'ArrowRight', l: '→' } }
  ];

  // Numeric keypad — 4 columns x 6 rows (row 1 is a spacer that lines the
  // keypad up with the number row of the main block)
  const NUMPAD_GRID = [
    { r: 2, c: 1, spec: { c: 'NumLock', l: 'Num', s: 'Lock' } },
    { r: 2, c: 2, spec: { c: 'NumpadDivide', l: '/' } },
    { r: 2, c: 3, spec: { c: 'NumpadMultiply', l: '*' } },
    { r: 2, c: 4, spec: { c: 'NumpadSubtract', l: '−' } },
    { r: 3, c: 1, spec: { c: 'Numpad7', l: '7', s: 'Home' } },
    { r: 3, c: 2, spec: { c: 'Numpad8', l: '8', s: '↑' } },
    { r: 3, c: 3, spec: { c: 'Numpad9', l: '9', s: 'PgUp' } },
    { r: 3, c: 4, rs: 2, spec: { c: 'NumpadAdd', l: '+' } },
    { r: 4, c: 1, spec: { c: 'Numpad4', l: '4', s: '←' } },
    { r: 4, c: 2, spec: { c: 'Numpad5', l: '5' } },
    { r: 4, c: 3, spec: { c: 'Numpad6', l: '6', s: '→' } },
    { r: 5, c: 1, spec: { c: 'Numpad1', l: '1', s: 'End' } },
    { r: 5, c: 2, spec: { c: 'Numpad2', l: '2', s: '↓' } },
    { r: 5, c: 3, spec: { c: 'Numpad3', l: '3', s: 'PgDn' } },
    { r: 5, c: 4, rs: 2, spec: { c: 'NumpadEnter', l: '⏎', s: 'Enter' } },
    { r: 6, c: 1, cs: 2, spec: { c: 'Numpad0', l: '0' } },
    { r: 6, c: 3, spec: { c: 'NumpadDecimal', l: '.', s: 'Del' } }
  ];

  const MODIFIERS = {
    ShiftLeft: 'Shift', ShiftRight: 'Shift',
    ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
    AltLeft: 'Alt', AltRight: 'Alt',
    MetaLeft: 'Meta', MetaRight: 'Meta',
    CapsLock: 'Caps', NumLock: 'Num', ScrollLock: 'Scroll',
    ContextMenu: 'Menu'
  };

  const FALLBACK_KEYS = {
    ' ': 'Space', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', Enter: 'Enter',
    Backspace: 'Backspace', Tab: 'Tab', Escape: 'Escape', Shift: 'ShiftLeft',
    Control: 'ControlLeft', Alt: 'AltLeft', Meta: 'MetaLeft', CapsLock: 'CapsLock'
  };

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  /* ----------------------------------------------------------- state */
  const state = {
    presses: 0,
    unique: new Set(),
    counts: new Map(),
    history: [],
    lastKey: null,
    modifiers: new Set(),
    labels: new Map()
  };

  let dom = {};
  const keyIndex = new Map(); // code -> element

  const byId = (id) => document.getElementById(id);
  const isEditable = (el) =>
    !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ------------------------------------------------------- rendering */
  function makeKey(spec) {
    const el = document.createElement('div');
    el.className = 'key';
    el.dataset.code = spec.c;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', ariaName(spec));

    const label = document.createElement('span');
    label.className = 'key__label';
    label.textContent = spec.l !== undefined ? spec.l : spec.c;
    el.appendChild(label);

    if (spec.s) {
      const sub = document.createElement('span');
      sub.className = 'key__sub';
      sub.textContent = spec.s;
      el.appendChild(sub);
    }

    if (spec.w && spec.w !== 1) {
      el.style.flex = `0 0 calc(var(--u) * ${spec.w} - var(--kb-gap))`;
      el.style.width = `calc(var(--u) * ${spec.w} - var(--kb-gap))`;
    }
    if (MODIFIERS[spec.c]) el.classList.add('key--mod');

    keyIndex.set(spec.c, el);
    state.labels.set(spec.c, { label: spec.l !== undefined ? spec.l : spec.c, sub: spec.s || '' });
    return el;
  }

  function ariaName(spec) {
    if (MODIFIERS[spec.c]) return `${MODIFIERS[spec.c]} key`;
    if (spec.s) return `${spec.l}, shifted ${spec.s}`;
    return spec.l;
  }

  function expandRow(row) {
    const out = [];
    for (const item of row) {
      if (typeof item === 'string') {
        if (item.startsWith('Key')) {
          out.push({ c: item, l: LETTERS[item.charCodeAt(3) - 65] });
        } else {
          out.push({ c: item, l: item });
        }
      } else if (item && item.g) {
        const gap = document.createElement('div');
        gap.className = 'kb__gap';
        gap.style.width = `calc(var(--u) * ${item.g})`;
        gap.setAttribute('aria-hidden', 'true');
        out.push(gap);
      } else if (item) {
        out.push(item);
      }
    }
    return out;
  }

  function buildKeyboard(root) {
    root.textContent = '';
    const kb = document.createElement('div');
    kb.className = 'kb';
    kb.setAttribute('role', 'group');
    kb.setAttribute('aria-label', 'Visual keyboard layout');

    const main = document.createElement('div');
    main.className = 'kb__main';
    MAIN_ROWS.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb__row';
      expandRow(row).forEach((item) => {
        if (item instanceof HTMLElement) rowEl.appendChild(item);
        else rowEl.appendChild(makeKey(item));
      });
      main.appendChild(rowEl);
    });
    kb.appendChild(main);

    const nav = document.createElement('div');
    nav.className = 'kb__nav';
    NAV_GRID.forEach(({ r, c, spec }) => {
      const el = makeKey(spec);
      el.style.gridArea = `${r} / ${c}`;
      nav.appendChild(el);
    });
    kb.appendChild(nav);

    const num = document.createElement('div');
    num.className = 'kb__numpad';
    NUMPAD_GRID.forEach(({ r, c, rs, cs, spec }) => {
      const el = makeKey(spec);
      el.style.gridArea = `${r} / ${c} / ${r + (rs || 1) - 1} / ${c + (cs || 1) - 1}`;
      num.appendChild(el);
    });
    kb.appendChild(num);

    root.appendChild(kb);
  }

  /* ---------------------------------------------------------- helpers */
  function resolveCode(e) {
    if (e.code) return e.code;
    const key = e.key || '';
    if (FALLBACK_KEYS[key]) return FALLBACK_KEYS[key];
    if (key.length === 1) {
      const upper = key.toUpperCase();
      if (LETTERS.includes(upper)) return 'Key' + upper;
      if (/[0-9]/.test(key)) return 'Digit' + key;
    }
    return '';
  }

  function labelFor(code) {
    return state.labels.get(code) || { label: code, sub: '' };
  }

  function setPressed(code, pressed) {
    const el = keyIndex.get(code);
    if (el) el.dataset.pressed = pressed ? 'true' : 'false';
  }

  function clearPressed() {
    keyIndex.forEach((el) => {
      el.dataset.pressed = 'false';
    });
    // A modifier released while the window lost focus never sends its key-up
    // event, so the "held" badge would stay frozen.
    if (state.modifiers.size) {
      state.modifiers.clear();
      renderModifiers();
    }
  }

  function setStatus(html) {
    if (dom.status) dom.status.innerHTML = html;
  }

  /* ---------------------------------------------------------- events */
  function onKeyDown(e) {
    if (isEditable(e.target)) {
      setStatus('Focus is inside a text field — the tester ignores typing there.');
      return;
    }

    const code = resolveCode(e);
    if (!code) return;

    const isModifier = !!MODIFIERS[code];

    // Browser / OS shortcuts (Ctrl+S, Cmd+W, Alt+F4 …) are not test presses.
    if (!isModifier && (e.ctrlKey || e.metaKey || e.altKey)) {
      setStatus('Shortcut combination ignored (Ctrl / Cmd / Alt + key) so browser shortcuts keep working.');
      return;
    }

    setPressed(code, true);
    if (e.repeat) return; // auto-repeat is not a new physical press

    if (isModifier) state.modifiers.add(code);

    state.presses += 1;
    state.counts.set(code, (state.counts.get(code) || 0) + 1);
    state.lastKey = { code, at: Date.now() };

    // Only keys that belong to the drawn layout count towards the coverage,
    // so the percentage can never exceed 100 %.
    if (keyIndex.has(code) && !state.unique.has(code)) {
      state.unique.add(code);
      const el = keyIndex.get(code);
      if (el) el.dataset.tested = 'true';
    }

    state.history.unshift({ code, at: Date.now(), seq: state.counts.get(code) });
    if (state.history.length > 40) state.history.length = 40;

    render();
  }

  function onKeyUp(e) {
    const code = resolveCode(e);
    if (!code) return;
    setPressed(code, false);
    if (MODIFIERS[code]) {
      state.modifiers.delete(code);
      renderModifiers();
    }
  }

  /* --------------------------------------------------------- render */
  function render() {
    const total = keyIndex.size || 104;
    const uniqueCount = state.unique.size;
    const pct = total ? (uniqueCount / total) * 100 : 0;

    if (dom.presses) dom.presses.textContent = state.presses.toLocaleString('en-US');
    if (dom.unique) dom.unique.textContent = uniqueCount.toLocaleString('en-US');
    if (dom.total) dom.total.textContent = total.toLocaleString('en-US');
    if (dom.coverage) dom.coverage.textContent = pct.toFixed(0) + '%';
    if (dom.fill) dom.fill.style.width = pct.toFixed(2) + '%';

    if (dom.last) {
      if (state.lastKey) {
        const l = labelFor(state.lastKey.code);
        dom.last.innerHTML = `<b>${escapeHtml(l.label)}</b> <span style="opacity:.55">${escapeHtml(state.lastKey.code)}</span>`;
      } else {
        dom.last.innerHTML = '<b>—</b>';
      }
    }

    renderHistory();
    renderTested();
    renderModifiers();
  }

  function renderModifiers() {
    if (!dom.modifiers) return;
    const order = ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'];
    const held = order.filter((m) => state.modifiers.has(m));
    dom.modifiers.innerHTML = held.length
      ? held.map((m) => `<span class="badge badge--green">${MODIFIERS[m]}</span>`).join('')
      : '<span class="badge">none held</span>';
  }

  function renderHistory() {
    if (!dom.history) return;
    if (!state.history.length) {
      dom.history.innerHTML = '<p class="history__empty">Press any key to start building the timeline…</p>';
      return;
    }
    dom.history.innerHTML = state.history
      .map((h) => {
        const l = labelFor(h.code);
        const repeat = h.seq > 1 ? `<b>×${h.seq}</b>` : '';
        return `<span class="history__chip" title="${escapeHtml(h.code)}">${escapeHtml(l.label)}${repeat}</span>`;
      })
      .join('');
  }

  function renderTested() {
    if (!dom.tested) return;
    const codes = Array.from(state.unique);
    if (!codes.length) {
      dom.tested.innerHTML = '<p class="history__empty">No keys tested yet.</p>';
      return;
    }
    dom.tested.innerHTML = codes
      .map((code) => {
        const l = labelFor(code);
        return `<span class="tested-key">${escapeHtml(l.label)}<span class="tested-key__n">×${state.counts.get(code)}</span></span>`;
      })
      .join('');
  }

  /* ---------------------------------------------------------- reset */
  function reset() {
    state.presses = 0;
    state.unique.clear();
    state.counts.clear();
    state.history = [];
    state.lastKey = null;
    state.modifiers.clear();
    clearPressed();
    render();
    setStatus('Test cleared. Press any key to begin a new run.');
  }

  /* ----------------------------------------------------------- init */
  function init() {
    const root = byId('kb-root');
    if (!root) return null;
    buildKeyboard(root);

    dom = {
      presses: byId('kb-presses'),
      unique: byId('kb-unique'),
      total: byId('kb-total'),
      coverage: byId('kb-coverage'),
      fill: byId('kb-coverage-fill'),
      last: byId('kb-last-key'),
      history: byId('kb-history'),
      tested: byId('kb-tested-list'),
      modifiers: byId('kb-modifiers'),
      status: byId('kb-status')
    };

    render();
    setStatus('Waiting for input — click anywhere on the page and start typing.');

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearPressed);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearPressed();
    });

    const resetBtn = byId('kb-reset');
    if (resetBtn) resetBtn.addEventListener('click', reset);

    return { reset, getState: () => ({ presses: state.presses, unique: state.unique.size }) };
  }

  window.KeyboardTester = { init, reset };
})();
