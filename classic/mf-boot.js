// MiniFeather classic port boot stubs — replaces the old site's inline
// ad/analytics scripts (blocked by the extension page CSP).
// Provides no-op aiptag/aipPlayer/gtag so the old client's ad checks pass.

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
