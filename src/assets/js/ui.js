/* ==========================================================================
   KEYCHECK — UI helpers (tab switching between the two testers)
   ========================================================================== */
(function () {
  'use strict';

  function selectTab(tab, focus) {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    if (!panel) return;

    tabs.forEach((t) => {
      const active = t === tab;
      t.setAttribute('aria-selected', active ? 'true' : 'false');
      t.setAttribute('tabindex', active ? '0' : '-1');
      const own = document.getElementById(t.getAttribute('aria-controls'));
      if (own) own.hidden = !active;
    });

    if (focus) tab.focus();

    const key = tab.dataset.tab;
    if (key && window.history && history.replaceState) {
      history.replaceState(null, '', '#' + key);
    }
  }

  function init() {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(tab, false));
      tab.addEventListener('keydown', (e) => {
        let next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(index + 1) % tabs.length];
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(index - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) {
          e.preventDefault();
          selectTab(next, true);
        }
      });
    });

    // Deep link support: /#mouse opens the mouse tester directly.
    const hash = (window.location.hash || '').replace('#', '').toLowerCase();
    const match = tabs.find((t) => t.dataset.tab === hash);
    if (match) selectTab(match, false);
  }

  window.KeycheckUI = { init };
})();
