/* ==========================================================================
   KEYCHECK — mouse tester
   Left / right / middle / side buttons, scroll wheel, pointer movement and
   an indicative double-click detector. All processing stays in the browser.
   ========================================================================== */
(function () {
  'use strict';

  const BUTTONS = {
    0: { id: 'left', label: 'Left button', hint: 'Primary click' },
    1: { id: 'middle', label: 'Middle button', hint: 'Wheel click / scroll lock' },
    2: { id: 'right', label: 'Right button', hint: 'Secondary click' },
    3: { id: 'back', label: 'Side button', hint: 'Back / button 4' },
    4: { id: 'forward', label: 'Side button', hint: 'Forward / button 5' }
  };

  const DOUBLE_CLICK_MS = 500; // Windows / macOS default double-click interval
  const DOUBLE_CLICK_PX = 12;

  const state = {
    total: 0,
    perButton: { left: 0, middle: 0, right: 0, back: 0, forward: 0 },
    wheelEvents: 0,
    scrollDelta: 0,
    scrollX: 0,
    scrollY: 0,
    doubleClicks: 0,
    slowDoubleClicks: 0,
    distance: 0,
    lastX: null,
    lastY: null,
    x: 0,
    y: 0,
    lastClick: { button: null, at: 0, x: 0, y: 0 },
    lastDelta: 0
  };

  let dom = {};
  let canvas = null;
  let ctx = null;
  let trail = [];
  let rafId = 0;

  const byId = (id) => document.getElementById(id);

  /* ---------------------------------------------------------- helpers */
  function bump(key) {
    state.perButton[key] = (state.perButton[key] || 0) + 1;
  }

  function flashButton(id) {
    const card = dom.buttons && dom.buttons[id];
    if (!card) return;
    card.dataset.active = 'true';
    clearTimeout(card._t);
    card._t = setTimeout(() => {
      card.dataset.active = 'false';
    }, 140);
  }

  /* ---------------------------------------------------------- canvas */
  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawTrail() {
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (trail.length > 1) {
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1];
        const b = trail[i];
        const alpha = (i / trail.length) * 0.75;
        ctx.strokeStyle = `rgba(108, 155, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const last = trail[trail.length - 1];
      ctx.fillStyle = 'rgba(53, 211, 153, 0.95)';
      ctx.beginPath();
      ctx.arc(last.x, last.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(53, 211, 153, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    rafId = 0;
  }

  function scheduleDraw() {
    if (!rafId) rafId = requestAnimationFrame(drawTrail);
  }

  /* ---------------------------------------------------------- events */
  function onMouseDown(e) {
    const btn = BUTTONS[e.button];
    if (!btn) return;

    state.total += 1;
    bump(btn.id);
    state.lastDelta = 0;

    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Indicative double-click detection (own timing, independent of the OS setting)
    const now = performance.now();
    const prev = state.lastClick;
    let lastClick = { button: btn.id, at: now, x, y };

    if (prev.button === btn.id) {
      const dt = now - prev.at;
      const far = Math.hypot(x - prev.x, y - prev.y) > DOUBLE_CLICK_PX;
      if (dt <= DOUBLE_CLICK_MS && !far) {
        state.doubleClicks += 1;
        if (dt > 380) state.slowDoubleClicks += 1;
        showDoubleClick(dt);
        // A third click starts a new pair: a triple click is one double click.
        lastClick = { button: null, at: 0, x: 0, y: 0 };
      }
    }
    state.lastClick = lastClick;

    flashButton(btn.id);
    render();
  }

  function showDoubleClick(dt) {
    if (!dom.dbl) return;
    const slow = dt > 380;
    dom.dbl.dataset.state = slow ? 'slow' : 'ok';
    dom.dbl.querySelector('.dbl__text').textContent = slow
      ? `Double-click detected — but slow (${Math.round(dt)} ms)`
      : `Double-click detected (${Math.round(dt)} ms)`;
  }

  function onWheel(e) {
    // The wheel is captured inside the test area: the page must not scroll
    // away while the user checks the wheel, otherwise the event target moves
    // out from under the pointer and events get lost.
    if (e.cancelable) e.preventDefault();

    state.wheelEvents += 1;
    const dy = e.deltaY || 0;
    const dx = e.deltaX || 0;
    state.scrollDelta += Math.abs(dy) + Math.abs(dx);
    state.scrollY += dy;
    state.scrollX += dx;
    state.lastDelta = dy;

    if (dom.wheelDir) {
      dom.wheelDir.textContent = dy === 0 ? (dx > 0 ? 'scroll right' : dx < 0 ? 'scroll left' : '—') : dy > 0 ? 'scroll down' : 'scroll up';
    }
    render();
  }

  function onMouseMove(e) {
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (state.lastX !== null) {
      state.distance += Math.hypot(x - state.lastX, y - state.lastY);
    }
    state.lastX = x;
    state.lastY = y;
    state.x = e.clientX;
    state.y = e.clientY;

    trail.push({ x, y });
    if (trail.length > 90) trail.shift();
    scheduleDraw();

    if (dom.pos) dom.pos.textContent = `${Math.round(e.clientX)}, ${Math.round(e.clientY)}`;
    if (dom.dist) dom.dist.textContent = Math.round(state.distance).toLocaleString('en-US');
  }

  function onContextMenu(e) {
    // The right button must be testable inside the test area only.
    e.preventDefault();
  }

  function onLeave() {
    trail = [];
    scheduleDraw();
  }

  /* --------------------------------------------------------- render */
  function render() {
    if (dom.total) dom.total.textContent = state.total.toLocaleString('en-US');
    if (dom.left) dom.left.textContent = state.perButton.left.toLocaleString('en-US');
    if (dom.middle) dom.middle.textContent = state.perButton.middle.toLocaleString('en-US');
    if (dom.right) dom.right.textContent = state.perButton.right.toLocaleString('en-US');
    if (dom.back) dom.back.textContent = state.perButton.back.toLocaleString('en-US');
    if (dom.forward) dom.forward.textContent = state.perButton.forward.toLocaleString('en-US');
    if (dom.wheelEvents) dom.wheelEvents.textContent = state.wheelEvents.toLocaleString('en-US');
    if (dom.scrollDelta) dom.scrollDelta.textContent = Math.round(state.scrollDelta).toLocaleString('en-US');
    if (dom.doubleClicks) dom.doubleClicks.textContent = state.doubleClicks.toLocaleString('en-US');
    if (dom.dist) dom.dist.textContent = Math.round(state.distance).toLocaleString('en-US');
  }

  function reset() {
    state.total = 0;
    state.perButton = { left: 0, middle: 0, right: 0, back: 0, forward: 0 };
    state.wheelEvents = 0;
    state.scrollDelta = 0;
    state.scrollX = 0;
    state.scrollY = 0;
    state.doubleClicks = 0;
    state.slowDoubleClicks = 0;
    state.distance = 0;
    state.lastX = null;
    state.lastY = null;
    state.lastClick = { button: null, at: 0, x: 0, y: 0 };
    trail = [];
    scheduleDraw();
    if (dom.dbl) {
      dom.dbl.dataset.state = '';
      dom.dbl.querySelector('.dbl__text').textContent = 'No double-click detected yet';
    }
    if (dom.wheelDir) dom.wheelDir.textContent = '—';
    render();
  }

  /* ----------------------------------------------------------- init */
  function init() {
    const area = byId('mouse-area');
    if (!area) return null;

    canvas = byId('mouse-canvas');
    ctx = canvas ? canvas.getContext('2d') : null;

    dom = {
      total: byId('ms-total'),
      left: byId('ms-left'),
      middle: byId('ms-middle'),
      right: byId('ms-right'),
      back: byId('ms-back'),
      forward: byId('ms-forward'),
      wheelEvents: byId('ms-wheel-events'),
      scrollDelta: byId('ms-scroll-delta'),
      doubleClicks: byId('ms-double-clicks'),
      dist: byId('ms-distance'),
      pos: byId('ms-pos'),
      wheelDir: byId('ms-wheel-dir'),
      dbl: byId('ms-dbl'),
      buttons: {
        left: byId('ms-btn-left'),
        middle: byId('ms-btn-middle'),
        right: byId('ms-btn-right'),
        back: byId('ms-btn-back'),
        forward: byId('ms-btn-forward')
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe(area);

    area.addEventListener('mousedown', onMouseDown);
    area.addEventListener('mousemove', onMouseMove);
    area.addEventListener('wheel', onWheel, { passive: false });
    area.addEventListener('contextmenu', onContextMenu);
    area.addEventListener('mouseleave', onLeave);

    const resetBtn = byId('ms-reset');
    if (resetBtn) resetBtn.addEventListener('click', reset);

    const clearBtn = byId('ms-clear-trail');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        trail = [];
        scheduleDraw();
      });
    }

    render();
    return { reset };
  }

  window.MouseTester = { init, reset };
})();
