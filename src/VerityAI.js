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
        autoReply: false, // responder a TODO lo que escribas en el chat global
        busy: false,      // anti-spam: una consulta a la vez
        // config persistida (provider/apiKey/model) se carga abajo
    };

    try {
        const saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
        if (saved.provider && PROVIDERS[saved.provider]) state.provider = saved.provider;
        if (saved.apiKey) state.apiKey = saved.apiKey;
        if (saved.model) state.model = saved.model;
        if (typeof saved.autoReply === 'boolean') state.autoReply = saved.autoReply;
    } catch {}

    function saveCfg() {
        try {
            localStorage.setItem(CFG_KEY, JSON.stringify({
                provider: state.provider,
                apiKey: state.apiKey,
                model: state.model,
                autoReply: state.autoReply
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

    // Chrome carga las voces de speechSynthesis async (la 1a getVoices() sale vacia).
    // Pedirlas ya y refrescar cuando lleguen.
    try {
        const synth = globalThis.speechSynthesis;
        if (synth) {
            synth.getVoices();
            if (typeof synth.onvoiceschanged !== 'undefined') {
                synth.onvoiceschanged = () => { try { synth.getVoices(); } catch {} };
            }
        }
    } catch {}

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
        // max_tokens bajo: respuestas cortas y evita 402 "can only afford N tokens"
        // en cuentas con pocos creditos (openrouter). Con 402 reintenta con menos.
        let maxTokens = 150;
        for (let attempt = 0; attempt < 2; attempt++) {
            const ac = new AbortController();
            const timer = setTimeout(() => ac.abort(), 15000);
            let resp;
            try {
                resp = await fetch(prov.endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ model, messages: msgs, max_tokens: maxTokens }),
                    signal: ac.signal
                });
            } finally { clearTimeout(timer); }
            if (resp.ok) {
                const data = await resp.json();
                const out = data?.choices?.[0]?.message?.content ?? '';
                state.history.push({ role: 'assistant', content: out });
                return out;
            }
            const errText = await resp.text().catch(() => '');
            // 402: creditos insuficientes para este max_tokens → reintentar con la mitad
            if (resp.status === 402 && attempt === 0) {
                maxTokens = 64;
                log('402 creditos bajos, reintentando con max_tokens=' + maxTokens);
                continue;
            }
            throw new Error('HTTP ' + resp.status + ' de ' + state.provider + (errText ? ': ' + errText.slice(0, 200) : ''));
        }
        return '';
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

    // TTS de respaldo: speechSynthesis del navegador (gratis, offline).
    // Devuelve un pseudo-audio con play/pause/ended para keepTalkWhileAudio.
    function speakBrowser(text) {
        return new Promise((resolve, reject) => {
            try {
                const synth = globalThis.speechSynthesis;
                if (!synth) throw new Error('speechSynthesis no disponible');
                // limpiar estado previo: una utterance pausada/colgada hace
                // que speak() falle con "synthesis-failed"
                try { synth.cancel(); } catch {}
                let voices = [];
                try { voices = synth.getVoices() || []; } catch {}
                // voz preferida: la elegida a mano → espanol femenina → cualquier espanol → null
                const pick = () => {
                    if (state.voiceName) {
                        const chosen = voices.find((v) => v.name === state.voiceName)
                            || voices.find((v) => v.name.includes(state.voiceName));
                        if (chosen) return chosen;
                        warn('voz "' + state.voiceName + '" no encontrada, usando auto');
                    }
                    return voices.find((x) => /es[-_]/i.test(x.lang) && /female|mujer|helena|lucia|elvira|monica|paulina|sabina/i.test(x.name)) ||
                        voices.find((x) => /es[-_]/i.test(x.lang)) ||
                        null;
                };
                const fake = {
                    ended: false, paused: false,
                    play() { try { synth.resume(); } catch {} },
                    pause() { try { synth.pause(); } catch {} }
                };
                let tries = 0;
                const attempt = (voice) => {
                    const u = new SpeechSynthesisUtterance(text);
                    u.rate = (state.rate && state.rate > 0.1 && state.rate <= 10) ? state.rate : 1;
                    u.pitch = 1.05;
                    u.lang = voice ? voice.lang : 'es-ES';
                    if (voice) { u.voice = voice; u.lang = voice.lang; }
                    u.onend = () => { fake.ended = true; };
                    u.onerror = (e) => {
                        // retry 1 vez con voz default del sistema (la voz elegida
                        // puede no estar disponible → "synthesis-failed")
                        if (tries++ === 0 && voice) {
                            warn('voz "' + voice.name + '" fallo (' + (e?.error || '?') + '), reintentando con voz default');
                            try { synth.cancel(); } catch {}
                            setTimeout(() => attempt(null), 60);
                        } else {
                            fake.ended = true;
                            warn('speechSynthesis error:', e?.error || '?', '| voices:', voices.length,
                                voices.slice(0, 5).map((v) => v.name).join(' / '));
                        }
                    };
                    startTalk(Math.max(1500, Math.min(8000, text.length * 65)));
                    keepTalkWhileAudio(fake);
                    synth.speak(u);
                };
                attempt(pick());
                resolve(fake);
            } catch (e) { reject(e); }
        });
    }

    async function speak(text) {
        if (!state.enabled) return null;
        // 1) intentar puter con timeout corto; si cuelga/falla → voz del navegador
        try {
            const ok = await loadPuter();
            if (!ok) throw new Error('puter.js no disponible');
            state.speaking = true;
            try {
                const opts = { rate: state.rate };
                if (state.voice) opts.voice = state.voice;
                // carrera contra timeout: puter puede colgarse (login requerido, red, etc)
                // y sin error el fallback nunca se activaria
                const audio = await Promise.race([
                    Promise.resolve(globalThis.puter.ai.txt2speech(text, opts)),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('puter timeout 8s')), 8000))
                ]);
                log('TTS via puter OK');
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
        } catch (e) {
            warn('puter TTS fallo (' + (e?.message || e) + '), usando voz del navegador');
            try { return await speakBrowser(text); } catch (e2) {
                warn('voz del navegador tambien fallo:', e2?.message || e2,
                    '(synth:', !!globalThis.speechSynthesis,
                    'voices:', globalThis.speechSynthesis?.getVoices?.().length, ')');
                return null;
            }
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

    // respuesta automatica a mensajes del chat global (llamado por el hook de
    // ClientCommands). Ignora comandos; anti-spam con "busy".
    async function autoReplyChat(text) {
        if (!state.autoReply || !state.enabled) return false;
        const clean = String(text || '').trim();
        if (!clean || clean.startsWith('/')) return false;
        if (state.busy) { log('auto-reply ocupado, ignorado:', clean.slice(0, 40)); return false; }
        state.busy = true;
        try {
            log('auto-reply a:', clean.slice(0, 60));
            const reply = await ask(clean);
            if (reply) {
                // mostrar la respuesta tambien en el chat del juego
                try { state.chatHook?.(reply); } catch {}
            }
            return !!reply;
        } catch (e) {
            warn('auto-reply fallo:', e?.message || e);
            return false;
        } finally {
            state.busy = false;
        }
    }

    window.MF_Verity = {
        get enabled() { return state.enabled; },
        set enabled(v) { state.enabled = !!v; log('enabled=' + state.enabled); },
        get history() { return state.history; },
        set persona(p) { state.persona = String(p); log('persona actualizada'); },
        get persona() { return state.persona; },
        set voice(v) {
            if (v && typeof v === 'object' && v.name) {
                state.voiceName = v.name;
                state.voice = null; // para speakBrowser: buscar por nombre
                log('voice=' + v.name);
            } else {
                state.voiceName = String(v || '');
                state.voice = null;
                log('voice=' + state.voiceName);
            }
        },
        // listar voces TTS instaladas en el sistema (para elegir la "loquendo")
        listVoices() {
            const synth = globalThis.speechSynthesis;
            const voices = synth?.getVoices?.() || [];
            const list = voices.map((v) => ({ name: v.name, lang: v.lang, def: v.default }));
            console.table(list);
            return list;
        },
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
        // responder a todo el chat global (on/off, persistido)
        get autoReply() { return state.autoReply; },
        set autoReply(v) {
            state.autoReply = !!v;
            saveCfg();
            log('autoReply=' + state.autoReply + (state.autoReply ? ' — verity respondera a todo lo que escribas (menos comandos /)' : ''));
        },
        autoReplyChat,
        // registrar callback para mostrar respuestas en el chat del juego
        setChatHook(fn) { state.chatHook = typeof fn === 'function' ? fn : null; },
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
