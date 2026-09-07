// FeatherLite — panel minimalista (ISOLATED world)
// una lista de toggles. nada de pestañas, nada de configuración:
// cada cosa que se enciende, simplemente funciona.
(function () {
    'use strict';
    if (window.__FEATHER_LITE_PANEL__) return;
    window.__FEATHER_LITE_PANEL__ = true;

    const LS = 'featherlite.settings.v1';
    const I18N = {
        es: {
            title: 'FeatherLite', hint: 'enciende lo que quieras — todo funciona solo',
            facial: 'Caras animadas', facialD: 'parpadeo, mirada y cejas 🤨 en todas las skins',
            vanilla: 'Animaciones vanilla', vanillaD: 'codos y rodillas se doblan al caminar',
            cam: 'Cámara premium', camD: 'muelles e inercia suaves al moverte',
            hand: 'Balanceo de mano', handD: 'la mano sigue tu movimiento',
            weather: 'Sin lluvia', weatherD: 'desactiva lluvia y tormentas',
            cross: 'Mira dinámica', crossD: 'la mira se adapta según apuntes',
            p2pHost: 'Hostear', p2pJoin: 'Unirse', p2pCode: 'código…',
            hostReady: 'código copiado:', joined: 'conectado',
            skins: 'Skin:', skinLoading: 'cargando…', skinDefault: '— normal —',
        },
        en: {
            title: 'FeatherLite', hint: 'toggle what you want — everything just works',
            facial: 'Animated faces', facialD: 'blink, look-around and 🤨 brows on every skin',
            vanilla: 'Vanilla animations', vanillaD: 'elbows and knees bend when walking',
            cam: 'Premium camera', camD: 'smooth springs and inertia when moving',
            hand: 'Hand sway', handD: 'your hand follows your movement',
            weather: 'No rain', weatherD: 'disables rain and thunderstorms',
            cross: 'Dynamic crosshair', crossD: 'crosshair adapts as you aim',
            p2pHost: 'Host', p2pJoin: 'Join', p2pCode: 'code…',
            hostReady: 'code copied:', joined: 'connected',
            skins: 'Skin:', skinLoading: 'loading…', skinDefault: '— default —',
        }
    };
    const lang = (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
    const T = I18N[lang];

    // ── settings (localStorage, compartido con MAIN world) ──
    let settings = { facial: true, vanilla: true, cam: true, hand: true, weather: true, cross: true };
    try { Object.assign(settings, JSON.parse(localStorage.getItem(LS) || '{}')); } catch {}
    function save() { try { localStorage.setItem(LS, JSON.stringify(settings)); } catch {} }

    // ── puente ISOLATED→MAIN: script inline (CSP permite inline? miniblox
    // usa CSP sin unsafe-inline → usar CustomEvent, que sí cruza worlds) ──
    function mainCall(js) {
        // CustomEvent cruza worlds y el listener vive en LiteBoot (MAIN)
        document.dispatchEvent(new CustomEvent('featherlite:call', { detail: js }));
    }

    const emit = (name, obj) => document.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(obj) }));

    function applyFacial(on) {
        // persistir para que MF_Facial lo reanude al cargar
        try {
            localStorage.setItem('minifeather_facials_v1_others', JSON.stringify({ on: !!on, intervalMinMs: 2500, intervalMaxMs: 6500 }));
            localStorage.setItem('minifeather_facials_v1_last', on ? 'auto' : '');
        } catch {}
        mainCall(`try{if(${!!on})MF_Facial.autoStart();else MF_Facial.autoStop()}catch(e){}`);
    }
    function applyVanilla(on) { emit('minifeather:vanillaanimations-config', { enabled: !!on }); }
    function applyCam(on) { emit('minifeather:cameraoverhaul-config', { enabled: !!on, bind: '' }); }
    function applyHand(on) { try { localStorage.setItem('miniblox_handsway', on ? 'true' : 'false'); } catch {} }
    function applyWeather(on) { emit('minifeather:no-weather-config', { enabled: !!on }); }
    function applyCross(on) {
        emit('minifeather:dynamiccrosshair-config', {
            enabled: !!on, size: 28,
            crosshairs: {}, // vacío → el módulo usa su DEFAULT_MAP
            assetBaseUrl: chrome.runtime.getURL('assets/crosshair/')
        });
    }

    const APPLY = { facial: applyFacial, vanilla: applyVanilla, cam: applyCam, hand: applyHand, weather: applyWeather, cross: applyCross };

    // ── UI ──
    const style = document.createElement('style');
    style.textContent = `
#fl-panel{position:fixed;top:14px;right:14px;z-index:2147483646;width:250px;background:#17171dF2;color:#eee;
 border:1px solid #2e2e38;border-radius:12px;font:12px/1.45 system-ui,Segoe UI,sans-serif;
 box-shadow:0 8px 28px #0009;backdrop-filter:blur(6px);user-select:none}
#fl-panel header{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:grab;border-bottom:1px solid #26262f}
#fl-panel header b{color:#ff8b4d;letter-spacing:.5px;font-size:13px}
#fl-panel header .dot{width:8px;height:8px;border-radius:50%;background:#5ad07a;box-shadow:0 0 6px #5ad07a}
#fl-panel .hint{padding:8px 12px 2px;color:#9a9aa5;font-size:11px}
#fl-panel .rows{padding:4px 8px 8px;display:flex;flex-direction:column;gap:2px}
#fl-panel .row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;cursor:pointer}
#fl-panel .row:hover{background:#ffffff0d}
#fl-panel .row .info{flex:1;min-width:0}
#fl-panel .row .name{font-weight:600;font-size:12.5px}
#fl-panel .row .desc{color:#8f8f9a;font-size:10.5px;margin-top:1px}
#fl-panel .sw{width:34px;height:19px;border-radius:10px;background:#3a3a45;position:relative;transition:.18s;flex-shrink:0}
#fl-panel .sw::after{content:'';position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#c9c9d2;transition:.18s}
#fl-panel .row.on .sw{background:#ff8b4d}
#fl-panel .row.on .sw::after{left:17px;background:#fff}
#fl-panel footer{display:flex;gap:6px;padding:8px 10px;border-top:1px solid #26262f}
#fl-panel footer button{flex:1;padding:6px;border:1px solid #3a3a46;background:#22222b;color:#ddd;border-radius:7px;cursor:pointer;font-size:11px}
#fl-panel footer button:hover{border-color:#ff8b4d;color:#ff8b4d}
#fl-panel footer input{flex:1;min-width:0;padding:6px 8px;border:1px solid #3a3a46;background:#1d1d25;color:#eee;border-radius:7px;font-size:11px;outline:none}
#fl-panel .status{padding:0 12px 8px;color:#7fb3ff;font-size:10.5px;display:none;word-break:break-all}
#fl-panel .skins{padding:6px 12px;border-top:1px solid #26262f}
#fl-panel .skinrow{display:flex;align-items:center;gap:8px}
#fl-panel .skinlbl{color:#9a9aa5;font-size:11px;flex-shrink:0}
#fl-panel .skinrow select{flex:1;min-width:0;padding:5px 6px;background:#1d1d25;color:#eee;border:1px solid #3a3a46;border-radius:7px;font-size:11px;outline:none;cursor:pointer}
#fl-panel.min .rows,#fl-panel.min .hint,#fl-panel.min footer,#fl-panel.min .skins{display:none}
`;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'fl-panel';

    const FEATURES = [
        { id: 'facial', name: T.facial, desc: T.facialD },
        { id: 'vanilla', name: T.vanilla, desc: T.vanillaD },
        { id: 'cam', name: T.cam, desc: T.camD },
        { id: 'hand', name: T.hand, desc: T.handD },
        { id: 'weather', name: T.weather, desc: T.weatherD },
        { id: 'cross', name: T.cross, desc: T.crossD },
    ];

    root.innerHTML = `
<header><span class="dot"></span><b>${T.title}</b></header>
<div class="hint">${T.hint}</div>
<div class="rows">${FEATURES.map(f => `
  <div class="row" data-f="${f.id}">
    <div class="info"><div class="name">${f.name}</div><div class="desc">${f.desc}</div></div>
    <div class="sw"></div>
  </div>`).join('')}
</div>
<div class="skins" id="fl-skins">
  <div class="skinrow">
    <span class="skinlbl">${T.skins}</span>
    <select id="fl-skin"><option value="">${T.skinLoading}</option></select>
  </div>
</div>
<div class="status" id="fl-status"></div>
<footer>
  <button id="fl-host">${T.p2pHost}</button>
  <input id="fl-code" placeholder="${T.p2pCode}">
  <button id="fl-join">${T.p2pJoin}</button>
</footer>`;

    document.documentElement.appendChild(root);

    const statusEl = root.querySelector('#fl-status');
    function status(msg) { statusEl.style.display = msg ? 'block' : 'none'; statusEl.textContent = msg || ''; }

    root.querySelectorAll('.row').forEach(row => {
        const id = row.dataset.f;
        const set = (on, saveIt = true) => {
            settings[id] = on;
            row.classList.toggle('on', on);
            if (saveIt) { save(); APPLY[id]?.(on); }
        };
        set(!!settings[id], false);
        row.addEventListener('click', () => set(!settings[id]));
    });

    root.querySelector('header').addEventListener('dblclick', () => root.classList.toggle('min'));

    const header = root.querySelector('header');
    let drag = null;
    header.addEventListener('pointerdown', e => {
        drag = { x: e.clientX, y: e.clientY, r: root.getBoundingClientRect() };
        header.setPointerCapture?.(e.pointerId);
    });
    header.addEventListener('pointermove', e => {
        if (!drag) return;
        root.style.left = (drag.r.left + e.clientX - drag.x) + 'px';
        root.style.top = (drag.r.top + e.clientY - drag.y) + 'px';
        root.style.right = 'auto';
    });
    header.addEventListener('pointerup', () => drag = null);

    // ── skins custom: selector de packs (mypacks + ZIPs importados) ──
    const skinSel = root.querySelector('#fl-skin');
    const LS_SKIN = 'featherlite.skin.v1';
    document.addEventListener('featherlite:skins-data', e => {
        let packs = [];
        try { packs = JSON.parse(e.detail); } catch { return; }
        if (!Array.isArray(packs)) return;
        skinSel.innerHTML = `<option value="">${T.skinDefault}</option>` +
            packs.map(p => `<option value="${p.id}">${p.name}${p.server ? '' : ' ★'}</option>`).join('');
        // marcar la actual (persistida). LiteBoot re-aplica al cargar juego.
        const saved = localStorage.getItem(LS_SKIN) || '';
        if (saved && packs.some(p => p.id === saved)) {
            skinSel.value = saved;
        } else if (saved) {
            localStorage.removeItem(LS_SKIN);
        }
    });
    skinSel.addEventListener('change', () => {
        const id = skinSel.value;
        try {
            if (id) {
                localStorage.setItem(LS_SKIN, id);
                // volver a auto-aplicar esta skin en la próxima carga
                sessionStorage.removeItem('featherlite.skin.released');
            } else {
                // "— normal —": el usuario soltó la custom → su skin del
                // server (p.ej. chris) manda, no re-aplicar al reload
                localStorage.removeItem(LS_SKIN);
                sessionStorage.setItem('featherlite.skin.released', '');
            }
        } catch {}
        document.dispatchEvent(new CustomEvent('featherlite:skin-apply', { detail: id }));
    });
    // pedir la lista cuando el juego esté listo (y tras cargar los packs)
    const askSkins = () => document.dispatchEvent(new CustomEvent('featherlite:skins-list'));
    askSkins();
    setTimeout(askSkins, 3000); setTimeout(askSkins, 8000);
    root.querySelector('#fl-host').addEventListener('click', () => {
        const code = Math.random().toString(36).slice(2, 8);
        mainCall(`try{MF_Peer.host('${code}')}catch(e){}`);
        status(T.hostReady + ' mf-' + code);
        try { navigator.clipboard?.writeText?.('mf-' + code); } catch {}
    });
    root.querySelector('#fl-join').addEventListener('click', () => {
        const raw = root.querySelector('#fl-code').value.trim().replace(/^mf-/, '').replace(/[^a-z0-9-]/gi, '');
        if (!raw) return;
        mainCall(`try{MF_Peer.join('${raw}')}catch(e){}`);
        status('…');
    });
    // respuesta de MAIN (LiteBoot re-emite el resultado como CustomEvent)
    document.addEventListener('featherlite:facial', () => {});
    document.addEventListener('featherlite:p2p-status', e => {
        try {
            const d = JSON.parse(e.detail);
            status(d.ok ? '✓ ' + (d.msg || T.joined) : (d.msg || '✗'));
        } catch {}
    });

    // re-aplicar todo cuando el juego cargue (canvas presente)
    let tries = 0;
    const boot = setInterval(() => {
        tries++;
        let ready = false;
        try { ready = !!document.querySelector('canvas'); } catch {}
        if (ready || tries > 120) {
            clearInterval(boot);
            for (const f of FEATURES) if (settings[f.id]) APPLY[f.id]?.(true);
        }
    }, 500);

    // F2 mostrar/ocultar
    window.addEventListener('keydown', e => {
        if (e.key === 'F2') { e.preventDefault(); root.style.display = root.style.display === 'none' ? '' : 'none'; }
    }, true);

    console.log('[FeatherLite] panel listo — F2 muestra/oculta');
})();
