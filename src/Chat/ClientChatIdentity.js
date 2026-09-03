(function () {
  'use strict';

  if (window.top !== window.self) return;

  const REQUEST_EVENT = 'minifeather:client-chat-identity-request';
  const IDENTITY_EVENT = 'minifeather:client-chat-identity';

  function getGame() {
    const direct = [
      globalThis.miniblox,
      globalThis.minibloxGame,
      globalThis.__MINIBLOX_GAME__,
      globalThis.__MB?.game,
      globalThis.game,
      globalThis.__game
    ];
    for (const game of direct) {
      if (game?.player) return game;
    }
    return null;
  }

  function emitIdentity() {
    const game = getGame();
    const profile = game?.player?.profile || {};
    const username = String(profile.username || game?.player?.name || '').trim().slice(0, 24);
    const uuid = String(profile.uuid || '').trim();
    document.dispatchEvent(new CustomEvent(IDENTITY_EVENT, {
      detail: JSON.stringify({ username, uuid })
    }));
  }

  document.addEventListener(REQUEST_EVENT, emitIdentity);
  window.setTimeout(emitIdentity, 500);
  window.setTimeout(emitIdentity, 2000);
})();
