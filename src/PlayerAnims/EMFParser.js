// EMFParser.js - Parser de archivos .jem/.jpm (formato CEM de OptiFine extendido por EMF).
// Extrae SOLO lo que v1 necesita: líneas de animación por parte (ignora geometría,
// porque v1 reutiliza el rig vanilla de Miniblox en vez de construir cubos).

(function () {
    'use strict';

    const Expr = () => globalThis.MF_EMFExpr;

    // Partes cuyo destino es codo/rodilla — excluidas de v1 (requisito del usuario:
    // "quitar la rotación de codos y rodillas, como VanillaAnimations.js").
    const EXCLUDED_PART_RE = /:(elbow|knee)$/;

    /**
     * Parsea un .jem/.jpm (objeto JSON ya cargado) y devuelve:
     * { lines: [{key, target, channel, fn}] } donde key es 'var.x' / 'part.channel'.
     */
    function parseModel(json) {
        const out = { lines: [] };
        walkModels(json, out);
        return out;
    }

    function walkModels(node, out) {
        if (!node || typeof node !== 'object') return;

        // Referencia a archivo externo: la resolvió el loader (inline gana, se maneja aparte)
        if (Array.isArray(node.animations)) {
            for (const block of node.animations) {
                if (!block || typeof block !== 'object') continue;
                for (const [key, formula] of Object.entries(block)) {
                    addLine(out, key, formula, node.part);
                }
            }
        }

        if (Array.isArray(node.submodels)) {
            for (const sub of node.submodels) walkModels(sub, out);
        }
        if (Array.isArray(node.models)) {
            for (const m of node.models) walkModels(m, out);
        }
    }

    function addLine(out, key, formula, part) {
        let target, channel;
        const dot = key.lastIndexOf('.');
        if (dot === -1) return;
        target = key.slice(0, dot);
        channel = key.slice(dot + 1); // rx ry rz tx ty tz sx sy sz visible

        // Exclusión v1: codos y rodillas (congelados a 0 por MF_PlayerAnims)
        if (EXCLUDED_PART_RE.test(target)) return;

        let fn;
        try {
            fn = Expr().compile(formula);
        } catch {
            // Líneas con sintaxis que v1 no soporta (nbt con regex crudo, etc.)
            out.skipped = (out.skipped || 0) + 1;
            return;
        }
        out.lines.push({ key, target, channel, fn });
    }

    /**
     * Carga el "pack": player.jem + sus .jpm referenciados.
     * files: { 'a_player_variables.jpm': <json>, ... } — el loader los resuelve.
     * Devuelve la lista ORDENADA de líneas a evaluar por frame (variables primero,
     * luego capas, luego combinadores de player.jem).
     */
    function loadPack(jem, jpmFiles) {
        const E = Expr();
        const out = { lines: [] };

        // 1. Los 5 submodelos "root" de player.jem cargan los .jpm en orden.
        const layerOrder = [];
        for (const m of jem?.models || []) {
            if (m?.part === 'root' && m?.model && jpmFiles[m.model]) {
                layerOrder.push(m.model);
            }
        }

        // Orden de evaluación: variables → idle → equipment → movement (firstperson excluido v1)
        const priority = {
            'a_player_variables.jpm': 0,
            'a_player_idle.jpm': 1,
            'a_player_equipment.jpm': 2,
            'a_player_movement.jpm': 3
        };

        layerOrder.sort((a, b) => (priority[a] ?? 9) - (priority[b] ?? 9));

        for (const file of layerOrder) {
            const parsed = parseModel(jpmFiles[file]);
            out.lines.push(...parsed.lines);
        }

        // 2. Bloques de player.jem mismo (combinadores + partes) — después de las capas.
        const jemLines = parseModel(jem);
        // Los submodelos "root" solo cargaban .jpm; sus animaciones inline (si las
        // hubiera) ya vienen en jemLines. Filtrar duplicados var.21_2_plus etc. no es
        // necesario: evaluación secuencial, la última escritura gana (EMF igual).
        out.lines.push(...jemLines.lines);

        return out;
    }

    globalThis.MF_EMFParser = { parseModel, loadPack };
})();
