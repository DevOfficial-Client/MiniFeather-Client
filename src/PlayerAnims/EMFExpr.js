// EMFExpr.js - Intérprete de fórmulas EMF (Entity Model Features) portado a JS.
// Fidelidad al MathExpressionParser de EMF (Java):
//  - Booleanos: true = +Infinity, false = -Infinity
//  - && y || con la MISMA precedencia, asociativos a izquierda
//  - Sin operador ^ (usar pow(a,b))
//  - Menos unario y "!" prefijo
//  - if(cond, a, b[, c, d, ...]) evalúa pares condición/valor
//  - Variables de parte legibles (part.rx) y var.*/varb.*/global_var.*

(function () {
    'use strict';

    const TRUE = Infinity;
    const FALSE = -Infinity;

    const isBool = (v) => v === TRUE || v === FALSE;
    const toBool = (v) => (isBool(v) ? v === TRUE : v > 0);
    const fromBool = (b) => (b ? TRUE : FALSE);

    // ---------- Tokenizer ----------
    const TWO_CHAR_OPS = ['==', '!=', '<=', '>=', '&&', '||'];

    function tokenize(src) {
        const tokens = [];
        let i = 0;
        const n = src.length;
        while (i < n) {
            const c = src[i];
            if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
            const two = src.slice(i, i + 2);
            if (TWO_CHAR_OPS.includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
            if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
                let j = i;
                while (j < n && /[0-9.]/.test(src[j])) j++;
                tokens.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
                i = j; continue;
            }
            if (/[A-Za-z_]/.test(c)) {
                let j = i;
                while (j < n && /[A-Za-z0-9_.:]/.test(src[j])) j++;
                tokens.push({ t: 'id', v: src.slice(i, j) });
                i = j; continue;
            }
            if ('+-*/%<>!(),'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
            throw new Error('EMF tokenizer: carácter inesperado "' + c + '" en: ' + src.slice(Math.max(0, i - 10), i + 10));
        }
        return tokens;
    }

    // ---------- Parser a AST ----------
    // Precedencia (EMF): && y || igual precedencia; luego == != < > <= >=; luego + -; luego * / %
    // Menos unario y ! más ligados que * /.

    function parseExpression(tokens) {
        let pos = 0;

        function peek() { return tokens[pos]; }
        function next() { return tokens[pos++]; }

        function expect(v) {
            const tk = next();
            if (!tk || tk.t !== 'op' || tk.v !== v) throw new Error('EMF parser: se esperaba "' + v + '"');
        }

        function parsePrimary() {
            const tk = next();
            if (!tk) throw new Error('EMF parser: fin inesperado');
            if (tk.t === 'num') return { k: 'num', v: tk.v };
            if (tk.t === 'id') {
                if (peek() && peek().t === 'op' && peek().v === '(') {
                    next(); // (
                    const args = [];
                    if (peek() && !(peek().t === 'op' && peek().v === ')')) {
                        args.push(parseLogic());
                        while (peek() && peek().t === 'op' && peek().v === ',') { next(); args.push(parseLogic()); }
                    }
                    expect(')');
                    return { k: 'call', fn: tk.v, args };
                }
                return { k: 'var', name: tk.v };
            }
            if (tk.t === 'op') {
                if (tk.v === '(') { const e = parseLogic(); expect(')'); return e; }
                if (tk.v === '-') return { k: 'neg', e: parsePrimary() };
                if (tk.v === '!') return { k: 'not', e: parsePrimary() };
                if (tk.v === '+') return parsePrimary();
            }
            throw new Error('EMF parser: token inesperado ' + JSON.stringify(tk));
        }

        function parseTerm() {
            let e = parsePrimary();
            while (peek() && peek().t === 'op' && '*/%'.includes(peek().v)) {
                const op = next().v;
                e = { k: 'bin', op, a: e, b: parsePrimary() };
            }
            return e;
        }

        function parseSum() {
            let e = parseTerm();
            while (peek() && peek().t === 'op' && '+-'.includes(peek().v)) {
                const op = next().v;
                e = { k: 'bin', op, a: e, b: parseTerm() };
            }
            return e;
        }

        function parseCompare() {
            let e = parseSum();
            while (peek() && peek().t === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(peek().v)) {
                const op = next().v;
                e = { k: 'cmp', op, a: e, b: parseSum() };
            }
            return e;
        }

        function parseLogic() {
            // && y || misma precedencia, asociativos a izquierda (fidelidad EMF)
            let e = parseCompare();
            while (peek() && peek().t === 'op' && (peek().v === '&&' || peek().v === '||')) {
                const op = next().v;
                e = { k: 'log', op, a: e, b: parseCompare() };
            }
            return e;
        }

        const ast = parseLogic();
        if (pos !== tokens.length) throw new Error('EMF parser: tokens sobrantes');
        return ast;
    }

    // ---------- Compilación a closure (evaluación nativa) ----------
    function compile(src) {
        const clean = String(src).replace(/\s+/g, '');
        const ast = parseExpression(tokenize(clean));
        return buildClosure(ast);
    }

    function buildClosure(ast) {
        switch (ast.k) {
            case 'num': { const v = ast.v; return () => v; }
            case 'var': return makeVarReader(ast.name);
            case 'neg': { const e = buildClosure(ast.e); return (c) => -e(c); }
            case 'not': { const e = buildClosure(ast.e); return (c) => fromBool(!toBool(e(c))); }
            case 'bin': {
                const a = buildClosure(ast.a), b = buildClosure(ast.b);
                // Booleanos EMF son ±Infinity SOLO para condiciones. En
                // aritmética el pack usa "is_on_ground * 1" esperando 1/0
                // (como EMF Java) → normalizar antes de operar, si no el
                // resultado es Infinity y la escritura se dropea.
                const na = (v) => (v === TRUE ? 1 : v === FALSE ? 0 : v);
                switch (ast.op) {
                    case '+': return (c) => na(a(c)) + na(b(c));
                    case '-': return (c) => na(a(c)) - na(b(c));
                    case '*': return (c) => na(a(c)) * na(b(c));
                    case '/': return (c) => safeDiv(na(a(c)), na(b(c)));
                    case '%': return (c) => safeMod(na(a(c)), na(b(c)));
                }
                break;
            }
            case 'cmp': {
                const a = buildClosure(ast.a), b = buildClosure(ast.b);
                const na = (v) => (v === TRUE ? 1 : v === FALSE ? 0 : v);
                switch (ast.op) {
                    case '==': return (c) => fromBool(a(c) === b(c));
                    case '!=': return (c) => fromBool(a(c) !== b(c));
                    case '<': return (c) => fromBool(na(a(c)) < na(b(c)));
                    case '>': return (c) => fromBool(na(a(c)) > na(b(c)));
                    case '<=': return (c) => fromBool(na(a(c)) <= na(b(c)));
                    case '>=': return (c) => fromBool(na(a(c)) >= na(b(c)));
                }
                break;
            }
            case 'log': {
                // EMF: a && b = if bool(a) then b else a; igual para ||
                const a = buildClosure(ast.a), b = buildClosure(ast.b);
                if (ast.op === '&&') {
                    return (c) => {
                        const va = a(c);
                        return toBool(va) ? b(c) : va;
                    };
                }
                return (c) => {
                    const va = a(c);
                    return toBool(va) ? va : b(c);
                };
            }
            case 'call': return makeCall(ast.fn, ast.args.map(buildClosure));
        }
        throw new Error('EMF: nodo AST desconocido');
    }

    function safeDiv(a, b) { return b === 0 ? 0 : a / b; }
    function safeMod(a, b) { return b === 0 ? 0 : a % b; }

    function makeVarReader(name) {
        // Resolución diferida: el contexto define cómo leer variables.
        if (name === 'true') return () => TRUE;
        if (name === 'false') return () => FALSE;
        if (name === 'pi') return () => Math.PI;
        if (name === 'e') return () => Math.E;
        if (name.startsWith('var.') || name.startsWith('varb.') || name.startsWith('global_var.')) {
            const key = name;
            return (c) => c.readVar(key, 0);
        }
        // Variable de entorno (limb_swing, head_pitch, is_gliding, ...) o de parte (head.rx)
        return (c) => c.readEnv(name);
    }

    // ---------- Funciones EMF ----------
    function torad(d) { return d * Math.PI / 180; }
    function todeg(r) { return r * 180 / Math.PI; }
    function frac(v) { return v - Math.floor(v); }
    function signum(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
    function wrapdeg(d) { let x = (d + 180) % 360; if (x < 0) x += 360; return x - 180; }
    function wraprad(r) { let x = (r + Math.PI) % (2 * Math.PI); if (x < 0) x += 2 * Math.PI; return x - Math.PI; }
    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function inr(v, a, b) { return fromBool(v >= a && v <= b); }
    function between(v, a, b) { return fromBool(v >= a && v <= b); }
    function equals(a, b, eps) { return fromBool(Math.abs(a - b) <= (eps === undefined ? 1e-4 : eps)); }
    function ifFn(...args) {
        // if(c1, v1, c2, v2, ..., [else]) — devuelve -Infinity si no hay match y no hay else
        let i = 0;
        while (i + 1 < args.length) {
            if (toBool(args[i])) return args[i + 1];
            i += 2;
        }
        if (i < args.length) return args[i];
        return FALSE;
    }

    const FUNCS = {
        sin: Math.sin, cos: Math.cos, tan: Math.tan,
        asin: (x) => Math.asin(clamp(x, -1, 1)),
        acos: (x) => Math.acos(clamp(x, -1, 1)),
        atan: Math.atan,
        atan2: Math.atan2,
        abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
        log: Math.log, exp: Math.exp, sqrt: Math.sqrt,
        pow: Math.pow, fmod: safeMod, frac, signum, torad, todeg,
        max: Math.max, min: Math.min, clamp, lerp,
        random: (seed) => {
            // random determinista por seed (como EMF usa hash del seed)
            if (seed === undefined) return Math.random();
            let h = 1779033703 ^ Math.floor(seed * 1000);
            for (let j = 0; j < 8; j++) { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); }
            return ((h ^= h >>> 16) >>> 0) / 4294967296;
        },
        randomb(seed) { return fromBool(FUNCS.random(seed) > 0.5); },
        if: ifFn,
        ifb: (...a) => { const r = ifFn(...a); return isBool(r) ? r : fromBool(r > 0); },
        in: inr,
        between,
        equals,
        wrapdeg, wraprad,
        degdiff: (a, b) => wrapdeg(a - b),
        raddiff: (a, b) => wraprad(a - b),
        print: (v) => v,
        catch: (v, fallback) => (Number.isFinite(v) ? v : fallback),
        // nbt: en Miniblox no hay NBT — siempre sin match (false).
        // Mantiene vivas las líneas de var.laying / var.is_flying etc.
        nbt: () => FALSE,
        // Curvas y easings (los usados por FA+)
        catmullrom: (p0, p1, p2, p3, t) => {
            const t2 = t * t, t3 = t2 * t;
            return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        },
        hermite: (a, b, m1, m2, t) => {
            const t2 = t * t, t3 = t2 * t;
            return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * b + (t3 - t2) * m2;
        },
        keyframe: (...a) => a[a.length - 1],
        keyframeloop: (...a) => a[a.length - 1],
        'easeinoutexpo': (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2
    };

    function makeCall(fn, argFns) {
        const impl = FUNCS[fn];
        if (!impl) throw new Error('EMF: función desconocida "' + fn + '"');
        switch (argFns.length) {
            case 0: return (c) => impl();
            case 1: { const a = argFns[0]; return (c) => impl(a(c)); }
            case 2: { const [a, b] = argFns; return (c) => impl(a(c), b(c)); }
            case 3: { const [a, b, d] = argFns; return (c) => impl(a(c), b(c), d(c)); }
            case 4: { const [a, b, d, e] = argFns; return (c) => impl(a(c), b(c), d(c), e(c)); }
            default: return (c) => impl(...argFns.map(f => f(c)));
        }
    }

    globalThis.MF_EMFExpr = {
        TRUE, FALSE,
        isBool, toBool, fromBool,
        compile,
        FUNCS
    };
})();
