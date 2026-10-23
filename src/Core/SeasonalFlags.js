(() => {
  'use strict';

  const HALLOWEEN_ENABLED = true; // Set false to retire the whole event without deleting it.

  globalThis.__MF_SEASONAL_FLAGS__ = Object.freeze({ halloween: HALLOWEEN_ENABLED });
})();
