// MiniFeather classic port boot stubs — replaces the old site's inline
// ad/analytics scripts (blocked by the extension page CSP).
// Provides no-op aiptag/aipPlayer/gtag so the old client's ad checks pass,
// plus shims for the sandbox environment (opaque origin).

window.aiptag = window.aiptag || {};
aiptag.cmd = aiptag.cmd || [];
aiptag.cmd.display = aiptag.cmd.display || [];
aiptag.cmd.player = aiptag.cmd.player || [];
aiptag.cmp = { show: false, position: 'centered', button: false };

// fake ad player: instantly "completes" prerolls
window.aiptag.cmd.player.push(function () {
  window.aiptag.adplayer = {
    startPreRoll: function (cb) { try { cb && cb(); } catch (_) {} },
    resumeAd: function () {},
    pauseAd: function () {},
    closeEvent: function () {}
  };
});

window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

// ---------------------------------------------------------------------------
// localStorage shim (sandbox pages have an opaque origin; accessing
// window.localStorage throws SecurityError there). In-memory only — the
// parent extension page can persist via chrome.storage if needed later.
// ---------------------------------------------------------------------------
try {
  window.localStorage.getItem('__mf_probe');
} catch (_) {
  var __mfMem = {};
  try {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(__mfMem, k) ? __mfMem[k] : null; },
        setItem: function (k, v) { __mfMem[k] = String(v); },
        removeItem: function (k) { delete __mfMem[k]; },
        clear: function () { __mfMem = {}; },
        key: function (i) { var ks = Object.keys(__mfMem); return i < ks.length ? ks[i] : null; },
        get length() { return Object.keys(__mfMem).length; }
      }
    });
    console.warn('[mf-boot] localStorage unavailable (sandboxed) — using in-memory shim');
  } catch (e2) {
    console.warn('[mf-boot] could not shim localStorage', e2);
  }
}

// ---------------------------------------------------------------------------
// Worker shim. MV3 sandbox pages have an opaque origin and Chrome refuses to
// construct Workers there — throwing a synchronous SecurityError. Detect it
// by probing with a real same-origin worker URL (location.origin is NOT a
// reliable signal on MV3 sandbox pages). In normal contexts the probe spawns
// a harmless worker (this same file) and terminates it immediately.
// The old client spawns CellRenderWorker module workers; that bundle is a
// self-contained DOM-free IIFE that talks via self.addEventListener("message")
// + self.postMessage({result}). Shim: fetch the worker source and execute it
// inside a function scope with `self` bound to a small message-bridge object.
// The sandbox CSP allows 'unsafe-eval', so new Function is available.
// ---------------------------------------------------------------------------
try {
  var __mfWorkerProbe = new Worker('mf-boot.js');
  __mfWorkerProbe.terminate();
} catch (_) {
  var __MF_WORKER_SRC = {};

  function __mfLoadWorkerSource(url) {
    if (__MF_WORKER_SRC[url]) return __MF_WORKER_SRC[url];
    __MF_WORKER_SRC[url] = fetch(url).then(function (r) {
      if (!r.ok) throw new Error('[mf-boot] worker fetch failed ' + r.status + ' ' + url);
      return r.text();
    });
    return __MF_WORKER_SRC[url];
  }

  function MFWorkerShim(url) {
    var shim = this;
    this._listeners = {};
    this._terminated = false;
    this._queue = [];

    var abs = new URL(url, self.location.href || document.baseURI).href;

    __mfLoadWorkerSource(abs).then(function (src) {
      if (shim._terminated) return;
      // worker-global facade the bundle will run against
      var bridge = {
        addEventListener: function (type, fn) {
          if (type === 'message') shim._onMessage = fn;
        },
        removeEventListener: function (type, fn) {
          if (type === 'message' && shim._onMessage === fn) shim._onMessage = null;
        },
        postMessage: function (m) { shim._dispatch(m); },
        close: function () { shim._terminated = true; }
      };
      try {
        // run the worker bundle with `self` pointing at the bridge.
        // NOTE: no "use strict" — the worker bundle (protodef) generates
        // code with legacy-only identifiers that throw under strict mode.
        var fn = new Function('self', 'postMessage', 'addEventListener', src);
        fn(bridge, bridge.postMessage, bridge.addEventListener);
      } catch (e) {
        console.error('[mf-boot] worker shim exec failed for', abs, e);
        shim._dispatchError(e);
        return;
      }
      // flush messages posted before the source finished loading
      var q = shim._queue; shim._queue = [];
      for (var i = 0; i < q.length; i++) shim._postMessage(q[i]);
    }).catch(function (e) {
      console.error('[mf-boot] worker shim load failed for', abs, e);
      shim._dispatchError(e);
    });
  }

  MFWorkerShim.prototype.addEventListener = function (type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  };
  MFWorkerShim.prototype.removeEventListener = function (type, fn) {
    var l = this._listeners[type] || [];
    var i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  };
  MFWorkerShim.prototype._dispatch = function (m) {
    if (this._terminated) return;
    var l = this._listeners.message || [];
    var ev = { data: m, target: this };
    for (var i = 0; i < l.length; i++) {
      try { l[i](ev); } catch (e) { console.error('[mf-boot] worker listener threw', e); }
    }
  };
  MFWorkerShim.prototype._dispatchError = function (e) {
    var l = this._listeners.error || [];
    var ev = { error: e, message: String(e && e.message || e) };
    for (var i = 0; i < l.length; i++) {
      try { l[i](ev); } catch (_) {}
    }
  };
  MFWorkerShim.prototype._postMessage = function (m) {
    if (this._onMessage) {
      try { this._onMessage({ data: m }); } catch (e) { console.error('[mf-boot] worker onmessage threw', e); }
    }
  };
  MFWorkerShim.prototype.postMessage = function (m) {
    if (this._terminated) return;
    if (this._onMessage) {
      // async-ish like a real worker
      var shim = this;
      setTimeout(function () { shim._postMessage(m); }, 0);
    } else {
      this._queue.push(m);
    }
  };
  MFWorkerShim.prototype.terminate = function () {
    this._terminated = true;
    this._onMessage = null;
    this._queue = [];
  };

  window.Worker = MFWorkerShim;
  console.warn('[mf-boot] Worker unavailable (opaque origin) — using in-page fake worker');
}
