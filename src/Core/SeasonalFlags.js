(() => {
  'use strict';

  const HALLOWEEN_ENABLED = false; // Set true only when publishing the next Halloween event.

  globalThis.__MF_SEASONAL_FLAGS__ = Object.freeze({ halloween: HALLOWEEN_ENABLED });
  // Notify existing modules after a local reinjection too. Consumers read
  // their own world's flag; saved theme preferences cannot override it.
  try { document.dispatchEvent(new CustomEvent('minifeather:seasonal-flags-changed')); } catch (_) {}
})();
