/* ==========================================================================
   KEYCHECK — application bootstrap
   The testers are independent from the advertising layer: if ads fail or are
   disabled, the tool keeps working exactly the same.
   ========================================================================== */
(function () {
  'use strict';

  function start() {
    if (window.KeyboardTester) window.KeyboardTester.init();
    if (window.MouseTester) window.MouseTester.init();
    if (window.KeycheckUI) window.KeycheckUI.init();

    const adsPossible = window.AdsManager ? window.AdsManager.isEnabled() : false;

    if (adsPossible && window.AdsManager) {
      // Reserve the space of the ad units before the first paint so the page
      // does not jump later on. No Google code is requested here.
      window.AdsManager.reserve();
    }

    if (window.ConsentManager) {
      window.ConsentManager.init({
        suppressBanner: !adsPossible,
        onDecision: (value) => {
          if (!window.AdsManager) return;
          if (value === 'granted') {
            // Advertising is only requested after an explicit consent decision.
            window.AdsManager.init();
          } else {
            window.AdsManager.release();
          }
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
