/* ==========================================================================
   KEYCHECK — cookie / advertising consent
   Lightweight CMP used only when advertising is actually enabled.
   The choice is stored locally; it never leaves the browser.
   ========================================================================== */
(function () {
  'use strict';

  const cfg = (window.KEYCHECK_CONFIG && window.KEYCHECK_CONFIG.consent) || {};
  const STORAGE_KEY = cfg.storageKey || 'keycheck.consent.v1';
  const REVISIT_DAYS = cfg.revisitDays || 180;

  let banner = null;
  let onDecision = function () {};
  let current = null;

  function readStored() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.value) return null;
      if (parsed.date) {
        const ageDays = (Date.now() - parsed.date) / 86400000;
        if (ageDays > REVISIT_DAYS) return null; // ask again after a while
      }
      return parsed.value;
    } catch (err) {
      return null;
    }
  }

  function store(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ value, date: Date.now() }));
    } catch (err) {
      /* storage may be unavailable (private mode) — the choice still applies to this page view */
    }
  }

  function show() {
    if (!banner) return;
    banner.dataset.open = 'true';
    reserveSpace();
    const accept = banner.querySelector('[data-consent-accept]');
    if (accept) accept.focus();
  }

  function hide() {
    if (!banner) return;
    banner.dataset.open = 'false';
    releaseSpace();
  }

  /* The banner is fixed to the viewport: reserve room at the end of the page
     so the last content is never permanently covered. */
  function reserveSpace() {
    if (!banner) return;
    const h = banner.getBoundingClientRect().height + 24;
    document.body.style.paddingBottom = h + 'px';
  }

  function releaseSpace() {
    document.body.style.paddingBottom = '';
  }

  function decide(value) {
    current = value;
    store(value);
    hide();
    onDecision(value);
  }

  function init(options) {
    const opts = options || {};
    onDecision = opts.onDecision || function () {};

    banner = document.getElementById('consent-banner');
    if (!banner) return;

    const acceptBtn = banner.querySelector('[data-consent-accept]');
    const declineBtn = banner.querySelector('[data-consent-decline]');
    const settingsBtns = document.querySelectorAll('[data-consent-settings]');

    if (acceptBtn) acceptBtn.addEventListener('click', () => decide('granted'));
    if (declineBtn) declineBtn.addEventListener('click', () => decide('denied'));

    settingsBtns.forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        show();
      })
    );

    const stored = readStored();
    if (stored) {
      current = stored;
      hide();
      onDecision(stored);
      return;
    }

    // Nothing to consent to when advertising is switched off.
    if (cfg.enabled === false || opts.suppressBanner) {
      current = 'granted';
      hide();
      onDecision('granted');
      return;
    }

    // No stored decision yet: the banner stays visible until the user chooses.
    // Ads are NOT loaded before that choice is made.
    show();
  }

  window.ConsentManager = {
    init,
    get: () => current,
    reopen: show
  };
})();
