(function () {
  function tryPatchSliders() {
    document.querySelectorAll('input[type="range"]').forEach(input => {
      if (input.dataset.mfPatched) return;

      const origMax = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "max");
      Object.defineProperty(input, "max", {
        get() { return origMax ? origMax.get.call(this) : this._max; },
        set(val) {
          if (this._patchActive && Number(val) === 8) {
            console.log("[MiniFeather] Blocking max=8, keeping 32");
            this._max = 32;
            return;
          }
          this._max = val;
        },
        configurable: true,
      });

      input.dataset.mfPatched = "1";
      input._patchActive = true;
    });
  }

  function onSettingsOpen() {
    setTimeout(tryPatchSliders, 200);
    setTimeout(tryPatchSliders, 500);
    setTimeout(tryPatchSliders, 1000);
  }

  document.addEventListener("click", (e) => {
    const el = e.target;
    if (!el) return;
    const text = el.innerText?.toLowerCase() || "";
    const isSettings = text.includes("settings") || text.includes("ajustes") || text.includes("configuracion");
    if (isSettings) onSettingsOpen();
  }, true);

  const bodyObserver = new MutationObserver(() => {
    tryPatchSliders();
  });

  if (document.body) {
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    tryPatchSliders();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      bodyObserver.observe(document.body, { childList: true, subtree: true });
      tryPatchSliders();
    });
  }

  console.log("[MiniFeather] Render Distance patcher loaded");
})();
