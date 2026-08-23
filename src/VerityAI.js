(function () {
    'use strict';

    const TAG = '[MiniFeather VerityAI]';
    const state = {
        loaded: false,
        loading: false,
        history: [],
        speaking: false,
        persona: 'Eres Verity, la companera del jugador en Miniblox. Respondes corto y divertido, en espanol.',
        voice: null,
        rate: 1,
        enabled: true
    };

    function log(...a) { console.log(TAG, ...a); }
    function warn(...a) { console.warn(TAG, ...a); }

    function loadPuter() {
        if (state.loaded) return Promise.resolve(true);
        if (state.loading) return state.loading;
        state.loading = new Promise((resolve) => {
            if (globalThis.puter) { state.loaded = true; return resolve(true); }
            const s = document.createElement('script');
            s.src = 'https://js.puter.com/v2/';
            s.onload = () => { state.loaded = !!globalThis.puter; log('puter.js cargado'); resolve(state.loaded); };
            s.onerror = () => { warn('no se pudo cargar puter.js'); resolve(false); };
            document.head.appendChild(s);
        });
        return state.loading;
    }

    async function chat(text) {
        if (!state.enabled) return null;
        const ok = await loadPuter();
        if (!ok) throw new Error('puter.js no disponible');
        state.history.push({ role: 'user', content: text });
        if (state.history.length > 20) state.history = state.history.slice(-20);
        const msgs = [{ role: 'system', content: state.persona }, ...state.history];
        const resp = await globalThis.puter.ai.chat(msgs, { model: 'gpt-5-nano' });
        const content = typeof resp === 'string' ? resp : (resp?.message?.content ?? resp?.text ?? '');
        const out = typeof content === 'string' ? content : String(content ?? '');
        state.history.push({ role: 'assistant', content: out });
        return out;
    }

    async function speak(text) {
        if (!state.enabled) return null;
        const ok = await loadPuter();
        if (!ok) throw new Error('puter.js no disponible');
        state.speaking = true;
        try {
            const opts = { rate: state.rate };
            if (state.voice) opts.voice = state.voice;
            await globalThis.puter.ai.txt2speech(text, opts);
            return true;
        } finally {
            state.speaking = false;
        }
    }

    function talkAnim(ms) {
        try { MF_CustomModels?.playAnim?.('verity', 'talk', ms || 2000); } catch {}
    }

    async function say(text) {
        const dur = Math.max(1500, Math.min(8000, text.length * 65));
        talkAnim(dur);
        return speak(text);
    }

    async function ask(text) {
        log('pensando...');
        const reply = await chat(text);
        if (!reply) return null;
        log('verity:', reply);
        say(reply).catch((e) => warn('tts fallo:', e?.message || e));
        return reply;
    }

    window.MF_Verity = {
        get enabled() { return state.enabled; },
        set enabled(v) { state.enabled = !!v; log('enabled=' + state.enabled); },
        get history() { return state.history; },
        set persona(p) { state.persona = String(p); log('persona actualizada'); },
        get persona() { return state.persona; },
        set voice(v) { state.voice = v; log('voice=' + v); },
        set rate(r) { state.rate = Math.max(0.5, Math.min(2, +r || 1)); },
        ask,
        say,
        chat,
        speak,
        spawn() { return MF_CustomModels?.followVerity?.(); },
        despawn() { return MF_CustomModels?.despawn?.('verity'); },
        reset() { state.history = []; log('historial limpio'); }
    };

    log('cargado. Ejemplos:');
    log("  MF_Verity.spawn()                          // verity te sigue");
    log("  await MF_Verity.ask('hola verity')         // chat + voz");
    log("  MF_Verity.say('que bien se ve esto')       // solo voz");
    log('  MF_Verity.persona = "..."                  // cambiar personalidad');
})();
