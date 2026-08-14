// MiniFeather — Custom Shader System
// Inyecta GLSL custom en los materiales del juego vía Three.js onBeforeCompile.
//
// Settings (localStorage):
//   miniblox_customshader          → 'true' | 'false'
//   miniblox_customshader_preset   → 'rainbow' | 'wobble' | 'greyscale' | 'nightvision' | 'celshade' | 'xray'
//   miniblox_customshader_strength → '0.0' .. '1.0'

(function () {
    'use strict';

    const TAG = '[MiniFeather CustomShader]';

    if (window.__MF_CUSTOM_SHADER__) return;
    window.__MF_CUSTOM_SHADER__ = true;

    const state = {
        enabled: localStorage.getItem('miniblox_customshader') === 'true',
        preset: localStorage.getItem('miniblox_customshader_preset') || 'rainbow',
        strength: parseFloat(localStorage.getItem('miniblox_customshader_strength') || '0.5'),
        game: null,
        scene: null,
        hooked: new Map(),
        scanTimer: null,
        lastScan: 0
    };

    // ─── Catálogo de presets ─────────────────────────────────────────
    // Cada preset:
    //   uniforms:     { name: {value} }  — uniforms a inyectar (ambos shaders)
    //   vertexCode:   string  — declaraciones GLSL prependadas al vertex shader
    //   vertexMain:   string  — código a inyectar tras #include <begin_vertex>
    //   fragmentCode: string  — declaraciones GLSL prependadas al fragment shader
    //   postMain:     string  — código ejecutado después del main original (modifica gl_FragColor)
    //   update:       fn(uniforms, dt)   — actualiza uniforms cada frame
    const PRESETS = {
        rainbow: {
            uniforms: { uCsTime: { value: 0 }, uCsStrength: { value: 0.5 } },
            vertexCode: `
                uniform float uCsTime;
                uniform float uCsStrength;
                varying vec3 mfCsWorldPos;
            `,
            vertexMain: `
                mfCsWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
            `,
            fragmentCode: `
                uniform float uCsTime;
                uniform float uCsStrength;
                varying vec3 mfCsWorldPos;
                vec3 mfCsRainbow(float t) {
                    return 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + t));
                }
            `,
            postMain: `
                float mfWave = sin(mfCsWorldPos.x * 2.0 + uCsTime * 2.0)
                             + cos(mfCsWorldPos.z * 2.0 + uCsTime * 1.5);
                mfWave = mfWave * 0.25 + 0.5;
                vec3 mfRC = mfCsRainbow(mfWave + uCsTime * 0.1);
                gl_FragColor.rgb = mix(gl_FragColor.rgb, mfRC, uCsStrength);
            `,
            update: (u, dt) => { u.uCsTime.value += dt; u.uCsStrength.value = state.strength; }
        },

        wobble: {
            uniforms: { uCsTime: { value: 0 }, uCsStrength: { value: 0.05 } },
            vertexCode: `
                uniform float uCsTime;
                uniform float uCsStrength;
            `,
            vertexMain: `
                transformed.x += sin(position.y * 4.0 + uCsTime * 3.0) * uCsStrength;
                transformed.z += cos(position.y * 4.0 + uCsTime * 2.5) * uCsStrength;
            `,
            fragmentCode: ``,
            postMain: ``,
            update: (u, dt) => { u.uCsTime.value += dt; u.uCsStrength.value = state.strength * 0.15; }
        },

        greyscale: {
            uniforms: { uCsStrength: { value: 0.5 } },
            vertexCode: ``,
            vertexMain: ``,
            fragmentCode: `
                uniform float uCsStrength;
            `,
            postMain: `
                float mfLum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
                gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(mfLum), uCsStrength);
            `,
            update: (u) => { u.uCsStrength.value = state.strength; }
        },

        nightvision: {
            uniforms: { uCsTime: { value: 0 }, uCsStrength: { value: 0.5 } },
            vertexCode: `
                uniform float uCsTime;
                uniform float uCsStrength;
                varying vec3 mfCsViewPos;
            `,
            vertexMain: `
                mfCsViewPos = (modelViewMatrix * vec4(transformed, 1.0)).xyz;
            `,
            fragmentCode: `
                uniform float uCsTime;
                uniform float uCsStrength;
                varying vec3 mfCsViewPos;
            `,
            postMain: `
                float mfLum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
                float mfBoost = 1.0 + (1.0 - mfLum) * 2.5 * uCsStrength;
                vec3 mfGreen = vec3(0.1, mfLum * mfBoost * 1.4, 0.05);
                gl_FragColor.rgb = mix(gl_FragColor.rgb, mfGreen, uCsStrength);
                float mfVig = smoothstep(1.2, 0.3, length(mfCsViewPos.xy * 0.02));
                gl_FragColor.rgb *= mix(1.0, mfVig, uCsStrength);
            `,
            update: (u, dt) => { u.uCsTime.value += dt; u.uCsStrength.value = state.strength; }
        },

        celshade: {
            uniforms: { uCsStrength: { value: 0.7 } },
            vertexCode: ``,
            vertexMain: ``,
            fragmentCode: `
                uniform float uCsStrength;
            `,
            postMain: `
                float mfLum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
                float mfBands = 4.0;
                float mfCel = floor(mfLum * mfBands + 0.5) / mfBands;
                float mfFactor = mix(1.0, mfCel / max(mfLum, 0.001), uCsStrength);
                gl_FragColor.rgb *= mfFactor;
            `,
            update: (u) => { u.uCsStrength.value = state.strength; }
        },

        xray: {
            uniforms: { uCsStrength: { value: 0.5 } },
            vertexCode: `
                uniform float uCsStrength;
                varying float mfCsDepth;
            `,
            vertexMain: `
                vec4 mfCsMvPos = modelViewMatrix * vec4(transformed, 1.0);
                mfCsDepth = -mfCsMvPos.z;
            `,
            fragmentCode: `
                uniform float uCsStrength;
                varying float mfCsDepth;
            `,
            postMain: `
                float mfFade = clamp(1.0 - mfCsDepth / 40.0, 0.0, 1.0);
                gl_FragColor.a = mix(gl_FragColor.a, mfFade, uCsStrength);
            `,
            onHook: (mat) => { mat.transparent = true; mat.depthWrite = false; },
            onUnhook: (mat) => { mat.transparent = false; mat.depthWrite = true; },
            update: (u) => { u.uCsStrength.value = state.strength; }
        },

        // ─── TERROR ──────────────────────────────────────────────────
        // Niebla oscura que se cierra sobre el jugador, desaturación profunda,
        // grano de película animado, viñeta palpitante y destellos rojos
        // esporádicos. El efecto se intensifica con la distancia.
        horror: {
            uniforms: {
                uCsTime: { value: 0 },
                uCsStrength: { value: 0.8 }
            },
            vertexCode: `
                uniform float uCsTime;
                uniform float uCsStrength;
                varying vec3 mfCsWorldPos;
                varying float mfCsDepth;
            `,
            vertexMain: `
                mfCsWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vec4 mfCsMvPos = modelViewMatrix * vec4(transformed, 1.0);
                mfCsDepth = -mfCsMvPos.z;
            `,
            fragmentCode: `
                uniform float uCsTime;
                uniform float uCsStrength;
                varying vec3 mfCsWorldPos;
                varying float mfCsDepth;

                // Hash determinístico para grano de película
                float mfHash(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }
            `,
            postMain: `
                // --- 1. Desaturación profunda: el mundo pierde color ---
                float mfLum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
                vec3 mfDesat = mix(vec3(mfLum), vec3(0.08, 0.06, 0.1), 0.7);
                gl_FragColor.rgb = mix(gl_FragColor.rgb, mfDesat, uCsStrength * 0.85);

                // --- 2. Niebla que se cierra: oscurece con la distancia ---
                // El rango de visión es corto, ~20-30 bloques antes de oscuridad total
                float mfFog = clamp(1.0 - mfCsDepth / 28.0, 0.0, 1.0);
                mfFog = mfFog * mfFog; // caída más brusca
                gl_FragColor.rgb *= mix(1.0, mfFog, uCsStrength * 0.9);

                // --- 3. Grano de película animado (siempre activo, sutil) ---
                // Screen-space hash usando gl_FragCoord para que cada pixel tenga ruido
                vec2 mfGrainUv = gl_FragCoord.xy * 0.7 + vec2(uCsTime * 17.0, uCsTime * 11.0);
                float mfGrain = mfHash(floor(mfGrainUv)) - 0.5;
                gl_FragColor.rgb += mfGrain * 0.18 * uCsStrength;

                // --- 4. Viñeta palpitante: respira lenta e irregularmente ---
                // Usa el centro de la pantalla como aproximación del jugador
                vec2 mfScreenUv = gl_FragCoord.xy / vec2(1600.0, 900.0);
                float mfDist = distance(mfScreenUv, vec2(0.5));
                float mfPulse = 0.5 + 0.5 * sin(uCsTime * 0.7) + 0.15 * sin(uCsTime * 3.3);
                float mfVig = smoothstep(0.75, 0.25, mfDist * (0.85 + 0.15 * mfPulse));
                gl_FragColor.rgb *= mix(1.0, mfVig, uCsStrength * 0.8);

                // --- 5. Flash rojo esporádico: como un relámpago de sangre ---
                // Pulsos irregulares cada ~6-10 segundos, duran ~0.3s
                float mfCycle = mod(uCsTime, 7.3);
                float mfFlash = smoothstep(0.0, 0.05, mfCycle) * smoothstep(0.3, 0.15, mfCycle);
                gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.5, 0.02, 0.0), mfFlash * uCsStrength * 0.5);
            `,
            update: (u, dt) => {
                u.uCsTime.value += dt;
                u.uCsStrength.value = state.strength;
            }
        },

        // ─── VHS ANTIGUO ─────────────────────────────────────────────
        // Cinta VHS degradada: separación de canales RGB (chroma shift),
        // líneas de escaneo, tracking noise, parpadeo de brillo, viñeta CRT,
        // manchas de polvo y bandas de color
        vhs: {
            uniforms: {
                uCsTime: { value: 0 },
                uCsStrength: { value: 0.7 },
                uCsResolution: { value: null }
            },
            vertexCode: `
                uniform float uCsTime;
                uniform float uCsStrength;
                varying float mfCsDepth;
            `,
            vertexMain: `
                vec4 mfCsMvPos = modelViewMatrix * vec4(transformed, 1.0);
                mfCsDepth = -mfCsMvPos.z;
            `,
            fragmentCode: `
                uniform float uCsTime;
                uniform float uCsStrength;
                varying float mfCsDepth;

                float mfHash(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }
            `,
            postMain: `
                vec2 mfUv = gl_FragCoord.xy / vec2(1600.0, 900.0);
                float mfPx = 1.0 / 1600.0;

                // --- 1. Chroma shift (separación RGB) ---
                // Los canales R y B se desplazan horizontalmente, como una cinta desalineada
                float mfShift = 3.0 * uCsStrength;
                // El desplazamiento varía con el tiempo — parpadeo de tracking
                float mfJitter = mfHash(vec2(floor(uCsTime * 12.0), floor(mfUv.y * 100.0))) * 2.0 - 1.0;
                float mfShiftR = (mfShift + mfJitter * 1.5) * mfPx;
                float mfShiftB = (-mfShift + mfJitter * 1.2) * mfPx;

                // No podemos releer texturas aquí (ya estamos post-main), así que
                // simulamos el chroma shift multiplicando por offsets en el color base
                float mfChroma = uCsStrength * 0.35;
                float mfRShift = sin(uCsTime * 8.0 + mfUv.y * 40.0) * mfChroma;
                vec3 mfChromaColor = vec3(
                    gl_FragColor.r * (1.0 + mfRShift),
                    gl_FragColor.g,
                    gl_FragColor.b * (1.0 - mfRShift)
                );
                gl_FragColor.rgb = mix(gl_FragColor.rgb, mfChromaColor, uCsStrength);

                // --- 2. Scanlines ---
                float mfScan = sin(mfUv.y * 900.0 * 3.14159) * 0.5 + 0.5;
                mfScan = mix(1.0, mfScan, uCsStrength * 0.25);
                gl_FragColor.rgb *= mfScan;

                // --- 3. Tracking noise (la barra que se mueve verticalmente) ---
                // Una banda horizontal que recorre la pantalla lentamente
                float mfTrackY = fract(uCsTime * 0.12);
                float mfTrackBand = smoothstep(0.0, 0.05, abs(mfUv.y - mfTrackY)) * smoothstep(0.1, 0.05, abs(mfUv.y - mfTrackY));
                gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.5), mfTrackBand * uCsStrength * 0.3);

                // --- 4. Parpadeo de brillo (flicker) ---
                float mfFlicker = 1.0 + (mfHash(vec2(floor(uCsTime * 30.0), 0.0)) - 0.5) * 0.15 * uCsStrength;
                gl_FragColor.rgb *= mfFlicker;

                // --- 5. Bandas de color horizontales (color bleeding) ---
                float mfBands = sin(mfUv.y * 50.0 + uCsTime * 2.0) * 0.04 * uCsStrength;
                gl_FragColor.r += mfBands;
                gl_FragColor.b -= mfBands;

                // --- 6. Viñeta CRT ---
                float mfDist = distance(mfUv, vec2(0.5));
                float mfVig = smoothstep(0.85, 0.35, mfDist);
                gl_FragColor.rgb *= mix(1.0, mfVig, uCsStrength * 0.5);

                // --- 7. Grano de polvo ---
                vec2 mfGrainUv = gl_FragCoord.xy * 0.5 + vec2(uCsTime * 23.0, uCsTime * 17.0);
                float mfGrain = mfHash(floor(mfGrainUv)) - 0.5;
                gl_FragColor.rgb += mfGrain * 0.12 * uCsStrength;

                // --- 8. Tinte amarillento de cinta vieja ---
                vec3 mfVhsTint = vec3(1.0, 0.95, 0.82);
                gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * mfVhsTint, uCsStrength * 0.3);
            `,
            update: (u, dt) => {
                u.uCsTime.value += dt;
                u.uCsStrength.value = state.strength;
            }
        },

        // ─── VHS DEGRADADO / ERRÁTICO ────────────────────────────────
        // Cinta a punto de romperse: glitches verticales, saltos de frame,
        // bloqueos de color, static bursts, tearing y micro-cortes
        vhsGlitch: {
            uniforms: {
                uCsTime: { value: 0 },
                uCsStrength: { value: 0.7 },
                uCsGlitchSeed: { value: 0 }
            },
            vertexCode: `
                uniform float uCsTime;
                uniform float uCsStrength;
                varying vec3 mfCsWorldPos;
                varying float mfCsDepth;
            `,
            vertexMain: `
                mfCsWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vec4 mfCsMvPos = modelViewMatrix * vec4(transformed, 1.0);
                mfCsDepth = -mfCsMvPos.z;
            `,
            fragmentCode: `
                uniform float uCsTime;
                uniform float uCsStrength;
                uniform float uCsGlitchSeed;
                varying vec3 mfCsWorldPos;
                varying float mfCsDepth;

                float mfHash(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }
                float mfHash1(float n) {
                    return fract(sin(n) * 43758.5453);
                }
            `,
            postMain: `
                vec2 mfUv = gl_FragCoord.xy / vec2(1600.0, 900.0);
                float mfT = uCsTime;

                // --- 1. Saltos de frame repentidos ---
                // Cada cierto intervalo "aleatorio", la imagen se congela o salta
                float mfFrameJump = step(0.82, mfHash1(floor(mfT * 3.0)));
                mfT += mfFrameJump * (mfHash1(floor(mfT * 3.0) + 1.0) - 0.5) * 0.5;

                // --- 2. Glitches verticales (tearing) ---
                // Bandas horizontales que se desplazan bruscamente
                float mfRow = floor(mfUv.y * 80.0);
                float mfRowHash = mfHash1(mfRow + floor(mfT * 18.0));
                float mfGlitchTrigger = step(0.72, mfHash1(floor(mfT * 4.0)));
                float mfTearOffset = (mfRowHash - 0.5) * 0.08 * mfGlitchTrigger;
                // Desplazar coordenadas de color simulando el salto
                gl_FragColor.r = mix(gl_FragColor.r, gl_FragColor.r * (1.0 + mfTearOffset * 8.0), mfGlitchTrigger * uCsStrength);
                gl_FragColor.b = mix(gl_FragColor.b, gl_FragColor.b * (1.0 - mfTearOffset * 8.0), mfGlitchTrigger * uCsStrength);

                // --- 3. Bloqueos de color (datamosh) ---
                // Cuadrados de color sólido que aparecen aleatoriamente
                vec2 mfBlockUv = floor(mfUv * vec2(40.0, 24.0));
                float mfBlockHash = mfHash(mfBlockUv + floor(mfT * 2.0));
                float mMfBlockTrigger = step(0.93, mfHash1(floor(mfT * 1.5)));
                if (mfBlockHash > 0.7 && mMfBlockTrigger > 0.5) {
                    vec3 mfBlockColor = vec3(mfHash(mfBlockUv + 1.0), mfHash(mfBlockUv + 2.0), mfHash(mfBlockUv + 3.0));
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, mfBlockColor, uCsStrength * 0.6);
                }

                // --- 4. Static bursts (ráfagas de estática) ---
                // Pantalla llena de ruido blanco por instantes breves
                float mfStaticTrigger = step(0.88, mfHash1(floor(mfT * 6.0)));
                float mfStatic = mfHash(gl_FragCoord.xy + floor(mfT * 30.0));
                gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(mfStatic), mfStaticTrigger * uCsStrength * 0.7);

                // --- 5. Micro-cortes (blackouts instantes) ---
                // La pantalla se va a negro por un par de frames
                float mfBlackout = step(0.94, mfHash1(floor(mfT * 9.0)));
                gl_FragColor.rgb *= 1.0 - mfBlackout * uCsStrength * 0.85;

                // --- 6. Chroma shift violento ---
                float mfChromaShift = sin(mfT * 15.0 + mfUv.y * 60.0) * 0.4 * uCsStrength;
                float mfChromaJitter = (mfHash1(floor(mfT * 20.0)) - 0.5) * 0.3 * uCsStrength;
                gl_FragColor.r += mfChromaShift + mfChromaJitter;
                gl_FragColor.b -= mfChromaShift - mfChromaJitter;

                // --- 7. Bandas RGB que se desplazan (rainbow roll) ---
                float mfRoll = sin(mfT * 1.3 + mfUv.y * 8.0) * 0.5 + 0.5;
                gl_FragColor.r += sin(mfT * 2.0 + mfUv.y * 3.0) * 0.05 * uCsStrength;
                gl_FragColor.g += sin(mfT * 2.0 + mfUv.y * 3.0 + 2.0) * 0.05 * uCsStrength;
                gl_FragColor.b += sin(mfT * 2.0 + mfUv.y * 3.0 + 4.0) * 0.05 * uCsStrength;

                // --- 8. Scanlines densas y vibrando ---
                float mfScanY = mfUv.y + sin(mfT * 5.0) * 0.003;
                float mfScan = sin(mfScanY * 1200.0 * 3.14159) * 0.5 + 0.5;
                gl_FragColor.rgb *= mix(1.0, mfScan, uCsStrength * 0.3);

                // --- 9. Viñeta CRT extrema que pulsa erráticamente ---
                float mfDist = distance(mfUv, vec2(0.5));
                float mfVigPulse = mfHash1(floor(mfT * 8.0));
                float mfVig = smoothstep(0.8 - mfVigPulse * 0.15, 0.3, mfDist);
                gl_FragColor.rgb *= mix(1.0, mfVig, uCsStrength * 0.6);

                // --- 10. Grano de estática constante ---
                float mfGrain = mfHash(gl_FragCoord.xy * 1.3 + vec2(mfT * 47.0, mfT * 31.0)) - 0.5;
                gl_FragColor.rgb += mfGrain * 0.25 * uCsStrength;
            `,
            update: (u, dt) => {
                u.uCsTime.value += dt;
                u.uCsStrength.value = state.strength;
            }
        },

        // ─── TV VIEJA (CRT) ──────────────────────────────────────────
        // Pantalla de tubo CRT: esquinas redondeadas, viñeta pronunciada,
        // curvatura de pantalla, scanlines, resplandor fósforo y reflejo
        crt: {
            uniforms: {
                uCsTime: { value: 0 },
                uCsStrength: { value: 0.7 }
            },
            vertexCode: `
                uniform float uCsTime;
                uniform float uCsStrength;
            `,
            vertexMain: ``,
            fragmentCode: `
                uniform float uCsTime;
                uniform float uCsStrength;

                float mfHash(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }

                // Distancia con curvatura de pantalla (tubo convexo)
                vec2 mfCurve(vec2 uv) {
                    vec2 c = uv - 0.5;
                    float r2 = dot(c, c);
                    return uv + c * r2 * 0.15 * uCsStrength;
                }

                // SDF de rectángulo redondeado para las esquinas del tubo
                float mfRoundedBox(vec2 uv, vec2 size, float radius) {
                    vec2 d = abs(uv) - size + vec2(radius);
                    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
                }
            `,
            postMain: `
                vec2 mfUv = gl_FragCoord.xy / vec2(1600.0, 900.0);
                float mfAspect = 1600.0 / 900.0;

                // --- 1. Curvatura del tubo ---
                vec2 mfCurvedUv = mfCurve(mfUv);

                // --- 2. Esquinas redondeadas ---
                // SDF del rectángulo redondeado centrado, el borde se va a negro
                vec2 mfBoxUv = (mfCurvedUv - 0.5) * vec2(mfAspect, 1.0);
                float mfRadius = 0.18 * uCsStrength;
                float mfSdf = mfRoundedBox(mfBoxUv, vec2(0.5), mfRadius);
                float mfCornerMask = smoothstep(-0.02, 0.04, -mfSdf);

                // --- 3. Viñeta pronunciada del tubo ---
                float mfDist = distance(mfCurvedUv, vec2(0.5));
                float mfVig = smoothstep(0.75, 0.28, mfDist);
                gl_FragColor.rgb *= mix(1.0, mfVig, uCsStrength * 0.8);

                // --- 4. Resplandor de fósforo verde ---
                vec3 mfPhosphor = vec3(0.85, 1.0, 0.88);
                gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * mfPhosphor, uCsStrength * 0.15);

                // --- 5. Scanlines ---
                float mfScan = sin(mfCurvedUv.y * 900.0 * 3.14159) * 0.5 + 0.5;
                gl_FragColor.rgb *= mix(1.0, mfScan, uCsStrength * 0.2);

                // --- 6. Línea de refresco que baja ---
                float mfRollY = fract(uCsTime * 0.15);
                float mfRollBand = smoothstep(0.0, 0.03, abs(mfCurvedUv.y - mfRollY))
                                 * smoothstep(0.06, 0.03, abs(mfCurvedUv.y - mfRollY));
                gl_FragColor.rgb += vec3(0.08, 0.1, 0.06) * mfRollBand * uCsStrength;

                // --- 7. Reflejo del cristal (de arriba a la derecha) ---
                vec2 mfReflectUv = (mfCurvedUv - vec2(0.75, 0.8)) * 2.0;
                float mfReflect = exp(-dot(mfReflectUv, mfReflectUv) * 3.0) * 0.12;
                gl_FragColor.rgb += vec3(mfReflect);

                // --- 8. Grano sutil ---
                float mfGrain = mfHash(gl_FragCoord.xy * 0.8 + vec2(uCsTime * 19.0, uCsTime * 13.0)) - 0.5;
                gl_FragColor.rgb += mfGrain * 0.06 * uCsStrength;

                // --- 9. Máscara de esquinas: fuera del rectángulo = negro puro ---
                gl_FragColor.rgb *= mfCornerMask;
            `,
            update: (u, dt) => {
                u.uCsTime.value += dt;
                u.uCsStrength.value = state.strength;
            }
        }
    };

    // ─── Encontrar el game object (React fiber mining) ───────────────
    function findGame() {
        const react = document.getElementById('react');
        if (!react) return null;

        for (const root of Object.values(react)) {
            try {
                const game = root?.updateQueue?.baseState?.element?.props?.game;
                if (game && game.player) return game;
            } catch (_) {}
        }
        return null;
    }

    function getScene(game) {
        return game?.gameScene?.scene ||
               game?.scene?.scene ||
               game?.gameScene ||
               game?.scene ||
               null;
    }

    // ─── BFS manual sobre el scene graph ─────────────────────────────
    function collectMeshes(root) {
        const result = [];
        const seen = new WeakSet();
        const queue = [root];
        let visited = 0;

        while (queue.length && visited < 2000) {
            const obj = queue.shift();
            if (!obj || seen.has(obj)) continue;
            seen.add(obj);
            visited++;

            if (obj.isMesh === true && obj.material) {
                result.push(obj);
            }

            if (Array.isArray(obj.children)) {
                for (const child of obj.children) {
                    queue.push(child);
                }
            }
        }

        return result;
    }

    // ─── Inyección GLSL: wrapper de main() para post-procesado ───────
    // Renombra la primera ocurrencia de "void main() {" → "void mfCsMain() {"
    // y añade un nuevo main() que llama al original y luego ejecuta postMain.
    function wrapMain(src, postMainCode) {
        const mainPattern = /void\s+main\s*\(\s*\)\s*\{/;
        const match = src.match(mainPattern);
        if (!match) return src;

        const originalMain = src.replace(mainPattern, 'void mfCsMain() {');

        return originalMain + '\n' +
               'void main() {\n' +
               '    mfCsMain();\n' +
               postMainCode + '\n' +
               '}\n';
    }

    // ─── Hookear onBeforeCompile de un material ──────────────────────
    function hookMaterial(material) {
        if (state.hooked.has(material)) return false;
        if (typeof material.onBeforeCompile !== 'function') return false;

        const preset = PRESETS[state.preset];
        if (!preset) return false;

        const originalOnBeforeCompile = material.onBeforeCompile.bind(material);
        const originalCacheKey = material.customProgramCacheKey;

        const liveUniforms = {};
        for (const key in preset.uniforms) {
            liveUniforms[key] = { value: preset.uniforms[key].value };
        }

        material.onBeforeCompile = function (shader) {
            // 1. Llamar al onBeforeCompile original del juego (GI, wind, etc.)
            originalOnBeforeCompile(shader);

            // 2. Inyectar uniforms
            for (const key in liveUniforms) {
                shader.uniforms[key] = liveUniforms[key];
            }

            // 3. Vertex shader: prependar declaraciones
            if (preset.vertexCode) {
                shader.vertexShader = preset.vertexCode + '\n' + shader.vertexShader;
            }

            // 4. Vertex shader: inyectar lógica tras begin_vertex
            if (preset.vertexMain) {
                if (shader.vertexShader.includes('#include <begin_vertex>')) {
                    shader.vertexShader = shader.vertexShader.replace(
                        '#include <begin_vertex>',
                        '#include <begin_vertex>\n' + preset.vertexMain
                    );
                } else {
                    shader.vertexShader = shader.vertexShader.replace(
                        /void\s+main\s*\(\s*\)\s*\{/,
                        'void main() {\n' + preset.vertexMain
                    );
                }
            }

            // 5. Fragment shader: prependar declaraciones
            if (preset.fragmentCode) {
                shader.fragmentShader = preset.fragmentCode + '\n' + shader.fragmentShader;
            }

            // 6. Fragment shader: envolver main con post-procesado
            if (preset.postMain) {
                shader.fragmentShader = wrapMain(shader.fragmentShader, preset.postMain);
            }
        };

        material.customProgramCacheKey = function () {
            const base = originalCacheKey ? originalCacheKey.call(material) : '';
            return 'mfcs_' + state.preset + '_' + base;
        };

        material.needsUpdate = true;

        // Callback del preset (ej: xray necesita transparent=true)
        if (preset.onHook) {
            try { preset.onHook(material); } catch (_) {}
        }

        state.hooked.set(material, {
            liveUniforms,
            originalOnBeforeCompile,
            originalCacheKey,
            update: preset.update || (() => {}),
            onUnhook: preset.onUnhook || null
        });

        return true;
    }

    function unhookMaterial(material) {
        const entry = state.hooked.get(material);
        if (!entry) return;

        // Restaurar propiedades del material modificadas por onHook
        if (entry.onUnhook) {
            try { entry.onUnhook(material); } catch (_) {}
        }

        material.onBeforeCompile = entry.originalOnBeforeCompile;
        if (entry.originalCacheKey) {
            material.customProgramCacheKey = entry.originalCacheKey;
        } else {
            material.customProgramCacheKey = undefined;
        }
        material.needsUpdate = true;
        state.hooked.delete(material);
    }

    // ─── Loop de animación de uniforms ───────────────────────────────
    let lastTime = performance.now();
    let rafId = null;

    function animate() {
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        for (const [, entry] of state.hooked) {
            try {
                entry.update(entry.liveUniforms, dt);
            } catch (_) {}
        }

        rafId = requestAnimationFrame(animate);
    }

    // ─── Escanear y aplicar hooks ────────────────────────────────────
    function scan() {
        if (!state.enabled) return;

        if (!state.game) {
            state.game = findGame();
            if (!state.game) return;
        }

        const scene = getScene(state.game);
        if (!scene) return;
        state.scene = scene;

        const meshes = collectMeshes(scene);
        let hooked = 0;

        for (const mesh of meshes) {
            const mat = mesh.material;
            if (!mat) continue;

            if (Array.isArray(mat)) {
                for (const m of mat) {
                    if (hookMaterial(m)) hooked++;
                }
            } else {
                if (hookMaterial(mat)) hooked++;
            }
        }

        if (hooked > 0) {
            console.log(`${TAG} ✓ ${hooked} materiales hookeados (preset: ${state.preset}).`);
            if (!rafId) {
                lastTime = performance.now();
                animate();
            }
        }
    }

    function disable() {
        for (const mat of state.hooked.keys()) {
            unhookMaterial(mat);
        }

        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }

        console.log(`${TAG} Shaders custom desactivados.`);
    }

    function switchPreset() {
        disable();
        if (state.enabled) {
            setTimeout(scan, 100);
        }
    }

    // ─── API pública ─────────────────────────────────────────────────
    window.MF_CustomShader = {
        enable() {
            state.enabled = true;
            localStorage.setItem('miniblox_customshader', 'true');
            scan();
        },
        disable() {
            state.enabled = false;
            localStorage.setItem('miniblox_customshader', 'false');
            disable();
        },
        setPreset(name) {
            if (!PRESETS[name]) {
                console.warn(`${TAG} Preset desconocido: ${name}`);
                return;
            }
            state.preset = name;
            localStorage.setItem('miniblox_customshader_preset', name);
            switchPreset();
        },
        setStrength(val) {
            state.strength = Math.max(0, Math.min(1, parseFloat(val) || 0));
            localStorage.setItem('miniblox_customshader_strength', String(state.strength));
        },
        listPresets() {
            return Object.keys(PRESETS);
        },
        getState() {
            return {
                enabled: state.enabled,
                preset: state.preset,
                strength: state.strength,
                hookedCount: state.hooked.size
            };
        }
    };

    // ─── Eventos ─────────────────────────────────────────────────────
    window.addEventListener('message', (event) => {
        if (event.data?.type === 'MINIBLOX_REFRESH_CUSTOM_SHADER') {
            if (state.enabled) scan();
        }
    });

    document.addEventListener('minifeather:custom-shader-config', (event) => {
        let cfg;
        try {
            cfg = typeof event.detail === 'string'
                ? JSON.parse(event.detail)
                : event.detail;
        } catch (_) {
            return;
        }

        if (typeof cfg.enabled === 'boolean') {
            cfg.enabled ? window.MF_CustomShader.enable() : window.MF_CustomShader.disable();
        }
        if (cfg.preset) {
            window.MF_CustomShader.setPreset(cfg.preset);
        }
        if (cfg.strength !== undefined) {
            window.MF_CustomShader.setStrength(cfg.strength);
        }
    });

    // ─── Bucle de escaneo periódico ──────────────────────────────────
    state.scanTimer = setInterval(() => {
        if (!state.enabled) {
            clearInterval(state.scanTimer);
            return;
        }

        if (state.hooked.size > 0) {
            if (performance.now() - state.lastScan > 10000) {
                state.lastScan = performance.now();
                scan();
            }
            return;
        }

        scan();
        state.lastScan = performance.now();
    }, 2000);

    if (state.enabled) {
        setTimeout(scan, 3000);
        console.log(`${TAG} Sistema iniciado. Preset: ${state.preset}, Strength: ${state.strength}`);
    }
})();
