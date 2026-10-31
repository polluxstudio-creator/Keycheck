/* ==========================================================================
   KEYCHECK — Google AdSense loader
   Fully optional and fully decoupled from the tool: if the configuration is
   missing or switched off, nothing is rendered, nothing is requested from
   Google and no empty boxes are left behind.

   Lifecycle
     reserve()  -> reserves the space of every enabled placement (no Google code)
     init()     -> loads the AdSense script and fills the reserved units
     release()  -> removes the reserved slots (the visitor declined)

   The reservation lives on the OUTER container on purpose: the Google ads
   loader rewrites the inline style of the element that directly wraps the
   <ins> (height:auto / min-height:0), so a reservation placed there would be
   wiped out and the page would jump when the ad arrives.
   ========================================================================== */
(function () {
  'use strict';

  const cfg = (window.KEYCHECK_CONFIG && window.KEYCHECK_CONFIG.adsense) || {};
  const SCRIPT_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

  const state = {
    reserved: Object.create(null), // placement -> element
    pushed: Object.create(null), // placement -> true (already handed to Google)
    removed: Object.create(null), // placement -> true (never render again)
    scriptLoaded: false,
    scriptPromise: null
  };

  function log(...args) {
    if (window.console && console.info) console.info('[KEYCHECK]', ...args);
  }

  /** True only when the publisher ID looks like a real AdSense publisher ID. */
  function hasPublisherId() {
    return typeof cfg.publisherId === 'string' && /^ca-pub-\d{6,20}$/.test(cfg.publisherId.trim());
  }

  function isEnabled() {
    return !!(cfg.enabled && hasPublisherId());
  }

  function placementEnabled(placement) {
    if (!Array.isArray(cfg.enabledPlacements)) return false;
    return cfg.enabledPlacements.indexOf(placement) !== -1;
  }

  function slotFor(placement) {
    const slot = (cfg.slots || {})[placement];
    return typeof slot === 'string' && slot.trim() ? slot.trim() : '';
  }

  function isWideEnough(placement) {
    const min = (cfg.minViewportWidth || {})[placement] || 0;
    return window.innerWidth >= min;
  }

  function loadScript() {
    if (state.scriptPromise) return state.scriptPromise;
    state.scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = `${SCRIPT_SRC}?client=${encodeURIComponent(cfg.publisherId.trim())}`;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('AdSense script could not be loaded'));
      document.head.appendChild(s);
    });
    return state.scriptPromise;
  }

  function buildSlot(el, placement, slotId) {
    // The label may already be in the markup (build-time reservation).
    let label = el.querySelector('.ad-slot__label');
    if (!label) {
      label = document.createElement('span');
      label.className = 'ad-slot__label';
      label.textContent = cfg.label || 'Advertisement';
      el.appendChild(label);
    }

    const frame = document.createElement('div');
    frame.className = 'ad-slot__frame';

    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', cfg.publisherId.trim());
    ins.setAttribute('data-ad-slot', slotId);
    ins.setAttribute('data-ad-format', (cfg.formats || {})[placement] === 'vertical' ? 'vertical' : 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');

    frame.appendChild(ins);
    el.appendChild(frame);

    const reserved = (cfg.reserveHeight || {})[placement];
    if (reserved) el.style.setProperty('--ad-reserve', reserved + 'px');
  }

  /** Creates the reserved slots. No request is made to Google here. */
  function reserve() {
    if (!isEnabled()) return;
    document.querySelectorAll('[data-ad-placement]').forEach((el) => {
      const placement = el.dataset.adPlacement;
      if (!placement || state.reserved[placement] || state.removed[placement]) return;
      if (!placementEnabled(placement)) return;
      const slotId = slotFor(placement);
      if (!slotId) return;
      if (!isWideEnough(placement)) return;
      buildSlot(el, placement, slotId);
      state.reserved[placement] = el;
    });
    syncSidebar();
  }

  /** Hands a placement to the Google loader (once per placement). */
  function push(placement) {
    if (state.pushed[placement]) return;
    state.pushed[placement] = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      /* queueing must never break the page */
    }
  }

  /** Auto ads: Google places the ads itself, so no manual unit is queued. */
  function pushAutoAds() {
    if (state.pushed.__auto__) return;
    state.pushed.__auto__ = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({
        google_ad_client: cfg.publisherId.trim(),
        enable_page_level_ads: true
      });
    } catch (err) {
      /* queueing must never break the page */
    }
  }

  /** Loads the AdSense script and fills the reserved units. */
  function init() {
    if (!isEnabled()) {
      log('ads are not enabled — no ad markup is generated.');
      syncSidebar();
      return { enabled: false };
    }

    reserve();

    const deliver = () => {
      if (cfg.autoAds) {
        pushAutoAds();
      } else {
        Object.keys(state.reserved).forEach(push);
      }
    };

    if (!state.scriptLoaded) {
      state.scriptLoaded = true;
      loadScript()
        .then(deliver)
        .catch(() => {
          log('AdSense failed to load — the tool keeps working.');
        });
    } else {
      deliver();
    }

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sync, 300);
    });

    return { enabled: true };
  }

  /** Empties a slot completely: no label, no frame, no reserved space. */
  function clearSlot(el) {
    if (!el) return;
    el.textContent = '';
    el.classList.remove('ad-slot--reserved');
    el.style.removeProperty('--ad-reserve');
  }

  /** The visitor declined: the reserved space is removed again. */
  function release() {
    Object.keys(state.reserved).forEach((placement) => {
      const el = state.reserved[placement];
      clearSlot(el);
      delete state.reserved[placement];
    });
    syncSidebar();
  }

  /** Keeps the slots in sync with the viewport width. */
  function sync() {
    document.querySelectorAll('[data-ad-placement]').forEach((el) => {
      const placement = el.dataset.adPlacement;
      if (!placement || state.removed[placement]) return;

      if (!isWideEnough(placement)) {
        // The unit must not stay in the DOM hidden: it would be an invisible
        // ad. It is removed for good and never rendered again in this session.
        if (state.reserved[placement]) {
          clearSlot(el);
          delete state.reserved[placement];
          state.removed[placement] = true;
        }
        return;
      }

      if (!state.reserved[placement]) {
        const slotId = slotFor(placement);
        if (!placementEnabled(placement) || !slotId) return;
        buildSlot(el, placement, slotId);
        state.reserved[placement] = el;
        if (state.scriptLoaded && !cfg.autoAds) push(placement);
      }
    });
    syncSidebar();
  }

  /** The sidebar column collapses when it holds no unit (no empty gutter). */
  function syncSidebar() {
    const layout = document.querySelector('.layout');
    if (!layout) return;
    const slot = layout.querySelector('[data-ad-placement="sidebar"]');
    const empty = !slot || slot.children.length === 0;
    layout.classList.toggle('no-sidebar', empty);
  }

  window.AdsManager = {
    init,
    reserve,
    release,
    hasPublisherId,
    isEnabled
  };
})();
