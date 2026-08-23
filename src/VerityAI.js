(function () {
    'use strict';

    const TAG = '[MiniFeather VerityAI]';

    // ─── Providers de chat ───────────────────────────────────────────
    // puter (default, gratis sin key) | openrouter | glm
    const PROVIDERS = {
        puter: {
            label: 'puter.js (gratis, sin API key)',
            needsKey: false
        },
        openrouter: {
            label: 'OpenRouter (openrouter.ai/api/v1)',
            needsKey: true,
            endpoint: 'https://openrouter.ai/api/v1/chat/completions',
            defaultModel: 'openai/gpt-4o-mini',
            keyHeader: 'Authorization',
            keyPrefix: 'Bearer '
        },
        glm: {
            label: 'GLM / Zhipu (api.z.ai/api/paas/v4)',
            needsKey: true,
            endpoint: 'https://api.z.ai/api/paas/v4/chat/completions',
            defaultModel: 'glm-4.7',
            keyHeader: 'Authorization',
            keyPrefix: 'Bearer '
        }
    };

    const CFG_KEY = 'minifeather_verity_ai';

    const state = {
        loaded: false,
        loading: false,
        history: [],
        speaking: false,
        persona: 'Eres Verity, la companera del jugador en Miniblox. Respondes corto y divertido, en espanol.',
        voice: null,
        rate: 1,
        enabled: true,
        provider: 'puter',
        apiKey: '',
        model: '',
        // config persistida (provider/apiKey/model) se carga abajo
    };

    try {
        const saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
        if (saved.provider && PROVIDERS[saved.provider]) state.provider = saved.provider;
        if (saved.apiKey) state.apiKey = saved.apiKey;
        if (saved.model) state.model = saved.model;
    } catch {}

    function saveCfg() {
        try {
            localStorage.setItem(CFG_KEY, JSON.stringify({
                provider: state.provider,
                apiKey: state.apiKey,
                model: state.model
            }));
        } catch {}
    }

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

    // ─── Chat via API directa (openrouter / glm) ─────────────────────
    async function chatViaApi(text) {
        const prov = PROVIDERS[state.provider];
        if (!prov?.endpoint) throw new Error('provider sin endpoint');
        if (prov.needsKey && !state.apiKey) {
            throw new Error('falta API key: usa MF_Verity.config({ apiKey: "..." }) o /verity key <key>');
        }
        state.history.push({ role: 'user', content: text });
        if (state.history.length > 20) state.history = state.history.slice(-20);
        const msgs = [{ role: 'system', content: state.persona }, ...state.history];
        const model = state.model || prov.defaultModel;
        const headers = { 'Content-Type': 'application/json' };
        headers[prov.keyHeader] = prov.keyPrefix + state.apiKey;
        log('chatViaApi:', state.provider, 'model=' + model, 'keyLen=' + (state.apiKey || '').length, 'header=' + prov.keyHeader + ': ' + prov.keyPrefix + (state.apiKey || '').slice(0, 4) + '...');
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 15000);
        let resp;
        try {
            resp = await fetch(prov.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({ model, messages: msgs, max_tokens: 300 }),
                signal: ac.signal
            });
        } finally { clearTimeout(timer); }
        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error('HTTP ' + resp.status + ' de ' + state.provider + (errText ? ': ' + errText.slice(0, 200) : ''));
        }
        const data = await resp.json();
        const out = data?.choices?.[0]?.message?.content ?? '';
        state.history.push({ role: 'assistant', content: out });
        return out;
    }

    async function chat(text) {
        if (!state.enabled) return null;
        if (state.provider !== 'puter') return chatViaApi(text);
        const ok = await loadPuter();
        if (!ok) throw new Error('puter.js no disponible');
        state.history.push({ role: 'user', content: text });
        if (state.history.length > 20) state.history = state.history.slice(-20);
        const msgs = [{ role: 'system', content: state.persona }, ...state.history];
        const resp = await globalThis.puter.ai.chat(msgs, { model: state.model || 'gpt-5-nano' });
        const content = typeof resp === 'string' ? resp : (resp?.message?.content ?? resp?.text ?? '');
        const out = typeof content === 'string' ? content : String(content ?? '');
        state.history.push({ role: 'assistant', content: out });
        return out;
    }

    let talkKeeper = null;

    function startTalk(ms) {
        try { MF_CustomModels?.playAnim?.('verity', 'talk', ms || 2000); } catch {}
    }
    // mantiene la anim talk viva mientras suena el audio: la re-extiende
    // hasta que llegue 'ended'/'pause' del elemento (o expire el keep-alive)
    function keepTalkWhileAudio(audio) {
        if (!audio || typeof audio.addEventListener !== 'function') return;
        stopTalkKeeper();
        const until = () => { try { audio.pause?.(); } catch {} stopTalkKeeper(); };
        talkKeeper = setInterval(() => {
            if (audio.ended || audio.paused) { until(); return; }
            startTalk(700);
        }, 500);
        audio.addEventListener('ended', until, { once: true });
        audio.addEventListener('pause', until, { once: true });
    }
    function stopTalkKeeper() {
        if (talkKeeper) { clearInterval(talkKeeper); talkKeeper = null; }
    }

    async function speak(text) {
        if (!state.enabled) return null;
        const ok = await loadPuter();
        if (!ok) throw new Error('puter.js no disponible (TTS)');
        state.speaking = true;
        try {
            const opts = { rate: state.rate };
            if (state.voice) opts.voice = state.voice;
            const audio = await globalThis.puter.ai.txt2speech(text, opts);
            // anim talk desde que el audio empieza, extendida mientras suene
            startTalk(Math.max(1500, Math.min(8000, text.length * 65)));
            keepTalkWhileAudio(audio);
            if (audio && typeof audio.play === 'function') {
                try { audio.play(); } catch {}
            }
            return audio;
        } finally {
            state.speaking = false;
        }
    }

    async function say(text) {
        return speak(text);
    }

    async function ask(text) {
        log('pensando... (' + state.provider + (state.provider !== 'puter' ? '/' + (state.model || PROVIDERS[state.provider].defaultModel) : '') + ')');
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
        // ─── config de providers ───
        get provider() { return state.provider; },
        get model() { return state.model || (PROVIDERS[state.provider]?.defaultModel || ''); },
        get providers() { return Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, { label: p.label, needsKey: p.needsKey, defaultModel: p.defaultModel || null }])); },
        config(opts = {}) {
            if (opts.provider != null) {
                const p = String(opts.provider).toLowerCase();
                if (!PROVIDERS[p]) throw new Error('provider desconocido: ' + p + ' (usa: ' + Object.keys(PROVIDERS).join(', ') + ')');
                const prevProv = PROVIDERS[state.provider];
                const prevDefault = prevProv?.defaultModel || '';
                state.provider = p;
                const newDefault = PROVIDERS[p].defaultModel || '';
                // si el modelo era el default del provider anterior, cambiar al del nuevo
                if (!state.model || state.model === prevDefault) {
                    state.model = newDefault;
                }
            }
            if (opts.apiKey != null) state.apiKey = String(opts.apiKey).trim();
            if (opts.model != null) state.model = String(opts.model).trim();
            saveCfg();
            log('config guardada: provider=' + state.provider + ' model=' + (state.model || '(default)') + ' key=' + (state.apiKey ? state.apiKey.slice(0, 8) + '...' : 'ninguna'));
            return { provider: state.provider, model: this.model, hasKey: !!state.apiKey };
        },
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
    log("  MF_Verity.config({ provider: 'openrouter', apiKey: 'sk-or-...', model: 'openai/gpt-4o-mini' })");
    log("  MF_Verity.config({ provider: 'glm', apiKey: '...', model: 'glm-4.6' })");
    if (state.provider !== 'puter') {
        log('provider activo: ' + state.provider + ' / ' + (state.model || PROVIDERS[state.provider].defaultModel) + (state.apiKey ? ' (key guardada)' : ' (SIN KEY!)'));
    }
})();
