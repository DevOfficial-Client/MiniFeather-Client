(() => {
  'use strict';

  if (globalThis.MF_InteractionSounds) return;

  const state = {
    context: null,
    master: null,
    intentUntil: 0,
    lastPlayedAt: 0
  };

  function context() {
    if (state.context && state.context.state !== 'closed') return state.context;
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextCtor) return null;
    const ctx = new AudioContextCtor({ latencyHint: 'interactive' });
    const master = ctx.createGain();
    master.gain.value = 0.09;
    master.connect(ctx.destination);
    state.context = ctx;
    state.master = master;
    return ctx;
  }

  function arm() {
    state.intentUntil = performance.now() + 900;
    const ctx = context();
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(ctx, destination, start, duration, fromHz, toHz, volume, type = 'sine') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(start);
    osc.stop(start + duration + 0.015);
  }

  function click(enabled) {
    const now = performance.now();
    if (now - state.lastPlayedAt < 35) return;
    state.lastPlayedAt = now;
    const ctx = context();
    if (!ctx || !state.master || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => click(enabled)).catch(() => {});
      return;
    }

    const t = ctx.currentTime + 0.004;
    if (enabled) {
      tone(ctx, state.master, t, 0.085, 520, 720, 0.26, 'sine');
      tone(ctx, state.master, t + 0.028, 0.075, 760, 980, 0.13, 'triangle');
    } else {
      tone(ctx, state.master, t, 0.090, 610, 430, 0.22, 'sine');
      tone(ctx, state.master, t + 0.022, 0.080, 420, 310, 0.11, 'triangle');
    }
  }

  function moduleSwitch(target) {
    return target instanceof HTMLInputElement && target.classList.contains('mf-switch-hidden') && !!target.closest('#mf-gui .mf-toggle');
  }

  document.addEventListener('pointerdown', event => {
    const target = event.target instanceof Element ? event.target : null;
    const card = target?.closest?.('#mf-gui .mf-toggle');
    if (!card || target.closest('[data-mf-settings],[data-mf-favorite],[data-mf-experimental-level]')) return;
    arm();
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest?.('#mf-gui .mf-toggle')) return;
    arm();
  }, true);

  document.addEventListener('change', event => {
    if (!moduleSwitch(event.target) || performance.now() > state.intentUntil) return;
    state.intentUntil = 0;
    click(event.target.checked);
  }, true);

  globalThis.MF_InteractionSounds = Object.freeze({
    playEnable: () => { arm(); click(true); },
    playDisable: () => { arm(); click(false); },
    destroy() {
      try { state.context?.close?.(); } catch (_) {}
      state.context = null;
      state.master = null;
      try { delete globalThis.MF_InteractionSounds; } catch (_) {}
    }
  });
})();
