/*
 * MiniFeather — test de consola para Fresh Animations (paste-and-go).
 * Uso: abre miniblox.io en una pestaña con mundo, F12 → Console, pega TODO este
 * archivo y dale enter. Reporta PASS/FAIL paso a paso y termina con veredicto.
 * Si MF_FreshAnims no existe, el paso 0 te dice exactamente por qué.
 */
(async () => {
    const TAG = '%c[FA-TEST]';
    const CSS = 'background:#ef3b3b;color:#fff;padding:1px 5px;border-radius:3px;font-weight:bold';
    const ok = (n, extra) => console.log(TAG, CSS, `%cPASS`, 'color:#22c55e;font-weight:bold', n, extra || '');
    const bad = (n, hint) => console.log(TAG, CSS, `%cFAIL`, 'color:#ef4444;font-weight:bold', n, hint ? '→ ' + hint : '');
    const info = (n, extra) => console.log(TAG, CSS, `%cINFO`, 'color:#facc15;font-weight:bold', n, extra || '');
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const R = {};

    // --- 0. ¿el módulo existe en este client? -----------------------------------
    const FA = globalThis.MF_FreshAnims;
    R.modulo = !!FA;
    if (!FA) {
        bad('MF_FreshAnims no está cargado en esta página',
            'tu client todavía no recibió el módulo. El mirror hot-updates desde la rama MAIN del repo: si el merge beta→main acaba de hacerse, recarga la página (F5) y vuelve a pegar este test. Si usas la extensión instalada, también puede tardar hasta 15 min en traer el mirror nuevo.');
        console.log(TAG, CSS, 'veredicto: SIN MÓDULO — nada más que probar aquí hasta recargar');
        return R;
    }
    ok('MF_FreshAnims cargado', `(versión del motor con import por zip)`);

    // --- 1. extras ---------------------------------------------------------------
    console.log(TAG, CSS, 'headLag presente:', !!globalThis.MF_HeadLag ? 'sí' : 'no (otro feature de hoy)');

    // --- 2. ¿hay juego y entidades? ----------------------------------------------
    let game = null;
    try {
        const local = globalThis.__MINIFEATHER_LOCAL_GAMES__;
        game = (local?.active && local.game?.player) ? local.game : null;
        if (!game) {
            const react = document.querySelector('#react');
            if (react) for (const root of Object.values(react)) {
                const g = root?.updateQueue?.baseState?.element?.props?.game;
                if (g?.player) { game = g; break; }
            }
        }
    } catch {}
    R.game = !!game;
    if (!game) { bad('no encuentro el juego', 'entra a un MUNDO (no vale el menú) y vuelve a correr el test'); return R; }
    ok('juego encontrado');

    const ents = [...(game.world?.entities?.values?.() || [])];
    const byType = {};
    for (const e of ents) if (e?.mesh && e !== game.player) byType[e.type] = (byType[e.type] || 0) + 1;
    const tipos = Object.keys(byType);
    R.entidades = tipos;
    if (!tipos.length) { bad('cero entidades alrededor', 'spawnea/acércate a un mob y repite el test'); return R; }
    ok('entidades cerca:', tipos.map(t => `${t}×${byType[t]}`).join(', '));

    // --- 3. pack importado? -------------------------------------------------------
    let status = FA.getStatus();
    info('estado:', status.status, '| pack:', status.packName || '(ninguno)');
    if (!status.mobs) {
        info('no hay pack importado — intentando bajar Fresh Animations v1.10.5 desde Modrinth...');
        let buf = null;
        try {
            const res = await fetch('https://cdn.modrinth.com/data/50dA9Sha/versions/RGIzA5em/FreshAnimations_v1.10.5.zip', { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            buf = await res.arrayBuffer();
        } catch (e) {
            info('fetch directo bloqueado por CORS (' + e.message + ') — elige el zip a mano');
            buf = await new Promise(resolve => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.zip';
                input.style.cssText = 'position:fixed;inset:0;z-index:999999;opacity:.8;background:#111;color:#fff;font-size:20px;padding:40px';
                input.addEventListener('change', () => {
                    input.remove();
                    resolve(input.files?.[0]?.arrayBuffer().then(ab => ab) || null);
                });
                document.body.appendChild(input);
            });
        }
        if (!buf) { bad('sin zip, sin test'); return R; }
        try {
            const n = await FA.importPackFile({ arrayBuffer: async () => buf, name: 'FreshAnimations_v1.10.5.zip' });
            ok(`pack importado: ${n} mobs`);
        } catch (e) {
            bad('import falló: ' + (e?.message || e));
            return R;
        }
    } else {
        ok('pack ya importado:', status.mobs + ' mobs');
    }

    // --- 4. encender y esperar el swap ---------------------------------------------
    document.dispatchEvent(new CustomEvent('minifeather:freshanims-config', {
        detail: JSON.stringify({ enabled: true })
    }));
    info('módulo encendido — esperando 2.5s a que los mobs cercanos hagan swap...');
    await sleep(2500);
    status = FA.getStatus();
    R.status = status;
    console.table([status]);
    if (status.tickStats.errors > 0) bad(`${status.tickStats.errors} errores en el tick (mirá los warns 'animate error' arriba)`);
    if (!status.applied) {
        bad('0 mobs con rig montado',
            'posibles causas: (a) ninguno de los mobs cercanos tiene modelo en el pack, (b) el mesh nativo no dio constructores THREE, (c) textura no resuelta. Corré de nuevo parado al lado de una vaca o un zombie.');
        return R;
    }
    ok(`${status.applied} mob(s) con rig de Fresh Animations montado`);

    // --- 5. inspección del primer rig -----------------------------------------------
    let inspected = 0;
    for (const ent of ents) {
        const mesh = ent.mesh;
        if (!mesh || mesh === game.player?.mesh) continue;
        const root = (mesh.children || []).find(c => c.__mfFreshRoot);
        if (!root) continue;
        const parts = [];
        root.traverse(c => { if (c.__mfPart) parts.push(c.__mfPart + ` (rot ${c.rotation.x.toFixed(2)},${c.rotation.y.toFixed(2)})`); });
        ok(`rig de ${ent.type}: ${parts.length} partes con nombre`, parts.slice(0, 8).join(' · '));
        if (++inspected >= 3) break;
    }

    // --- veredicto --------------------------------------------------------------------
    console.log(TAG, CSS, '%cVEREDICTO: el motor vive. Mirá los mobs — deberían verse con modelos Fresh Animations.',
        'color:#22c55e;font-weight:bold;font-size:14px');
    info('si se ven DEFORMADOS o espejados, decime qué mob y cómo — eso es un signo de eje (fix de 1 línea)');
    info('para apagar: panel → RENDER → freshAnims, o /toggle freshanims');
    return R;
})();
