// MiniFeather â€” Custom Shader System
// Inyecta GLSL custom en los materiales del juego vÃ­a Three.js onBeforeCompile.
//
// Settings (localStorage):
//   miniblox_customshader          â†’ 'true' | 'false'
//   miniblox_customshader_preset   → 'spooklementary' (preset combinado: greyscale + cel + horror + vhs + glitch + crt + linterna + sharpen)
//   miniblox_customshader_strength â†’ '0.0' .. '1.0'

(function () {
    'use strict';

    const TAG = '[MiniFeather CustomShader]';

    if (window.__MF_CUSTOM_SHADER__) return;
    window.__MF_CUSTOM_SHADER__ = true;

    const state = {
        enabled: localStorage.getItem('miniblox_customshader') === 'true',
        preset: localStorage.getItem('miniblox_customshader_preset') || 'spooklementary',
        strength: parseFloat(localStorage.getItem('miniblox_customshader_strength') || '0.5'),
        renderScale: parseFloat(localStorage.getItem('miniblox_customshader_renderscale') || '1.0'),
        game: null,
        scene: null,
        renderer: null,
        cloudsMesh: null,
        hooked: new Map(),
        scanTimer: null,
        lastScan: 0
    };

    // â”€â”€â”€ CatÃ¡logo de presets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Cada preset:
    //   uniforms:     { name: {value} }  â€” uniforms a inyectar (ambos shaders)
    //   vertexCode:   string  â€” declaraciones GLSL prependadas al vertex shader
    //   vertexMain:   string  â€” cÃ³digo a inyectar tras #include <begin_vertex>
    //   fragmentCode: string  â€” declaraciones GLSL prependadas al fragment shader
    //   postMain:     string  â€” cÃ³digo ejecutado despuÃ©s del main original (modifica gl_FragColor)
    //   update:       fn(uniforms, dt)   â€” actualiza uniforms cada frame
    const PRESETS = {
        // â”€â”€â”€ SPOOKLEMENTARY (combinado) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Greyscale + Cel Shading + Horror + VHS + VHS Glitch + CRT +
        // Flashlight + Sharpen, cada uno con su propio uniform de mezcla.
        // uCsStrength controla el conjunto; uCsVhs y uCsCrt son los
        // controles finos de VHS y TV pedidos.
        spooklementary: {
            uniforms: {
                uCsTime: { value: 0 },
                uCsStrength: { value: 0.8 },   // mezcla global
                uCsVhs: { value: 0.6 },        // intensidad de VHS (0 = off)
                uCsCrt: { value: 0.6 },        // intensidad de TV/CRT (0 = off)
                uCsCel: { value: 0.6 },        // cuantizaciÃ³n de bandas
                uCsFog: { value: 0.7 },        // niebla que se cierra
                uCsGrain: { value: 0.5 },      // grano/ruido
                uCsGlitch: { value: 0.4 },     // datamosh/static/blackout
                uCsFlash: { value: 0.5 },      // flashes rojos esporÃ¡dicos
                uCsLightOn: { value: 0 },      // linterna (tecla F)
                uCsLightRadius: { value: 20.0 },
                uCsConeAngle: { value: 0.35 },
                uCsSharp: { value: 0.5 },      // afilado CAS
                uCsResolution: { value: [1600.0, 900.0] } // resolución real (se actualiza cada frame)
            },
            vertexCode: `
                uniform float uCsTime;
                uniform float uCsStrength;
                uniform float uCsLightOn;
                uniform float uCsLightRadius;
                uniform float uCsConeAngle;
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
                uniform float uCsVhs;
                uniform float uCsCrt;
                uniform float uCsCel;
                uniform float uCsFog;
                uniform float uCsGrain;
                uniform float uCsGlitch;
                uniform float uCsFlash;
                uniform float uCsLightOn;
                uniform float uCsLightRadius;
                uniform float uCsConeAngle;
                uniform float uCsSharp;
                uniform vec2 uCsResolution;
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

                // Cono de linterna (spotlight hacia donde miras)
                float mfFlashlight(vec3 wp) {
                    vec3 mfCamDir = normalize(cameraPosition - wp);
                    vec3 mfCamForward = -vec3(viewMatrix[0].z, viewMatrix[1].z, viewMatrix[2].z);
                    float mfDist = distance(wp, cameraPosition);
                    float mfCone = dot(mfCamDir, mfCamForward);
                    float mfMask = smoothstep(uCsConeAngle, uCsConeAngle + 0.12, mfCone);
                    float mfAtten = 1.0 - smoothstep(uCsLightRadius * 0.3, uCsLightRadius, mfDist);
                    float mfHot = smoothstep(uCsConeAngle + 0.25, 1.0, mfCone);
                    return mfMask * mfAtten * (0.6 + 0.4 * mfHot);
                }

                // Curvatura + esquinas redondeadas del tubo CRT
                vec2 mfCurve(vec2 uv, float amount) {
                    vec2 c = uv - 0.5;
                    float r2 = dot(c, c);
                    return uv + c * r2 * 0.15 * amount;
                }
                float mfRoundedBox(vec2 uv, vec2 size, float radius) {
                    vec2 d = abs(uv) - size + vec2(radius);
                    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
                }
            `,
            postMain: `
                vec2 mfUv = gl_FragCoord.xy / uCsResolution;
                float mfT = uCsTime;

                // â•â•â• 1. LINTERNA (base de iluminaciÃ³n) â•â•â•
                // Solo oscurece cuando estÃ¡ ENCENDIDA; apagada = luz normal
                float mfLight = mfFlashlight(mfCsWorldPos);
                float mfBright = mix(1.0, mix(0.08, 1.0, mfLight), uCsLightOn);
                gl_FragColor.rgb *= mfBright;
                gl_FragColor.rgb += vec3(1.0, 0.93, 0.7) * mfLight * uCsLightOn * 0.4;

                // â•â•â• 2. GREYSCALE + tinte terror â•â•â•
                float mfLum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
                vec3 mfDesat = mix(vec3(mfLum), vec3(mfLum) * vec3(0.72, 0.66, 0.92), 0.7);
                gl_FragColor.rgb = mix(gl_FragColor.rgb, mfDesat, uCsStrength * 0.85);

                // â•â•â• 3. NIEBLA QUE SE CIERRA (horror) â•â•â•
                float mfFogMask = clamp(1.0 - mfCsDepth / 56.0, 0.0, 1.0);
                gl_FragColor.rgb *= mix(1.0, mfFogMask, uCsFog * 0.75);

                // â•â•â• 4. CEL SHADING (bandas) â•â•â•
                if (uCsCel > 0.001) {
                    float mfCel = floor(mfLum * 4.0 + 0.5) / 4.0;
                    float mfCelFactor = mix(1.0, mfCel / max(mfLum, 0.001), uCsCel);
                    gl_FragColor.rgb *= mfCelFactor;
                }

                // â•â•â• 5. VHS (chroma shift + scanlines + flicker + tint) â•â•â•
                if (uCsVhs > 0.001) {
                    float mfRShift = sin(mfT * 8.0 + mfUv.y * 40.0) * 0.35 * uCsVhs;
                    float mfJit = (mfHash1(floor(mfT * 12.0)) - 0.5) * 0.2 * uCsVhs;
                    gl_FragColor.r += mfRShift + mfJit;
                    gl_FragColor.b -= mfRShift - mfJit;

                    float mfScan = sin(mfUv.y * 900.0 * 3.14159) * 0.5 + 0.5;
                    gl_FragColor.rgb *= mix(1.0, mfScan, uCsVhs * 0.25);

                    float mfFlicker = 1.0 + (mfHash1(floor(mfT * 30.0)) - 0.5) * 0.15 * uCsVhs;
                    gl_FragColor.rgb *= mfFlicker;

                    // Tracking: banda que recorre la pantalla
                    float mfTrackY = fract(mfT * 0.12);
                    float mfTrackBand = smoothstep(0.0, 0.05, abs(mfUv.y - mfTrackY))
                                      * smoothstep(0.1, 0.05, abs(mfUv.y - mfTrackY));
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.5), mfTrackBand * uCsVhs * 0.3);

                    // Tinte de cinta vieja
                    gl_FragColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.95, 0.82), uCsVhs * 0.3);
                }

                // â•â•â• 6. VHS GLITCH (errÃ¡tico) â•â•â•
                if (uCsGlitch > 0.001) {
                    // Tearing por filas
                    float mfRow = floor(mfUv.y * 80.0);
                    float mfRowHash = mfHash1(mfRow + floor(mfT * 18.0));
                    float mfGlitchTrig = step(0.72, mfHash1(floor(mfT * 4.0)));
                    float mfTear = (mfRowHash - 0.5) * 0.08 * mfGlitchTrig * uCsGlitch;
                    gl_FragColor.r += mfTear * 8.0;
                    gl_FragColor.b -= mfTear * 8.0;

                    // Datamosh: bloques de color
                    vec2 mfBlockUv = floor(mfUv * vec2(40.0, 24.0));
                    float mfBlockHash = mfHash(mfBlockUv + floor(mfT * 2.0));
                    float mfBlockTrig = step(0.93, mfHash1(floor(mfT * 1.5)));
                    if (mfBlockHash > 0.7 && mfBlockTrig > 0.5) {
                        vec3 mfBC = vec3(mfHash(mfBlockUv + 1.0), mfHash(mfBlockUv + 2.0), mfHash(mfBlockUv + 3.0));
                        gl_FragColor.rgb = mix(gl_FragColor.rgb, mfBC, uCsGlitch * 0.6);
                    }

                    // RÃ¡fagas de estÃ¡tica
                    float mfStaticTrig = step(0.88, mfHash1(floor(mfT * 6.0)));
                    float mfStatic = mfHash(gl_FragCoord.xy + floor(mfT * 30.0));
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(mfStatic), mfStaticTrig * uCsGlitch * 0.7);

                    // Micro-cortes a negro
                    float mfBlackout = step(0.94, mfHash1(floor(mfT * 9.0)));
                    gl_FragColor.rgb *= 1.0 - mfBlackout * uCsGlitch * 0.85;
                }

                // â•â•â• 7. CRT / TV ANTIGUA (curvatura + esquinas) â•â•â•
                if (uCsCrt > 0.001) {
                    vec2 mfCurvedUv = mfCurve(mfUv, uCsCrt);
                    float mfAspect = uCsResolution.x / uCsResolution.y;
                    vec2 mfBoxUv = (mfCurvedUv - 0.5) * vec2(mfAspect, 1.0);
                    // Half-size = aspect/2 en X para cubrir TODO el ancho (no un cuadrado central)
                    float mfSdf = mfRoundedBox(mfBoxUv, vec2(mfAspect * 0.5, 0.5), 0.18 * uCsCrt);
                    float mfCornerMask = smoothstep(-0.02, 0.04, -mfSdf);

                    // ViÃ±eta del tubo
                    float mfDist = distance(mfCurvedUv, vec2(0.5));
                    float mfVig = smoothstep(0.75, 0.28, mfDist);
                    gl_FragColor.rgb *= mix(1.0, mfVig, uCsCrt * 0.8);

                    // Resplandor de fÃ³sforo + lÃ­nea de refresco
                    gl_FragColor.rgb *= mix(vec3(1.0), vec3(0.85, 1.0, 0.88), uCsCrt * 0.15);
                    float mfRollY = fract(mfT * 0.15);
                    float mfRollBand = smoothstep(0.0, 0.03, abs(mfCurvedUv.y - mfRollY))
                                     * smoothstep(0.06, 0.03, abs(mfCurvedUv.y - mfRollY));
                    gl_FragColor.rgb += vec3(0.08, 0.1, 0.06) * mfRollBand * uCsCrt;

                    // Reflejo del cristal
                    vec2 mfReflectUv = (mfCurvedUv - vec2(0.75, 0.8)) * 2.0;
                    gl_FragColor.rgb += vec3(exp(-dot(mfReflectUv, mfReflectUv) * 3.0) * 0.12);

                    // MÃ¡scara final: fuera del tubo = negro
                    gl_FragColor.rgb *= mfCornerMask;
                }

                // â•â•â• 8. FLASHES ROJOS (horror) â•â•â•
                float mfCycle = mod(mfT, 7.3);
                float mfFlashRed = smoothstep(0.0, 0.05, mfCycle) * smoothstep(0.3, 0.15, mfCycle);
                gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.5, 0.02, 0.0), mfFlashRed * uCsFlash * 0.5);

                // â•â•â• 9. GRANO + viÃ±eta palpitante (horror) â•â•â•
                vec2 mfGrainUv = gl_FragCoord.xy * 0.7 + vec2(mfT * 17.0, mfT * 11.0);
                float mfGrain = mfHash(floor(mfGrainUv)) - 0.5;
                gl_FragColor.rgb += mfGrain * 0.18 * uCsGrain;
                float mfPulse = 0.5 + 0.5 * sin(mfT * 0.7) + 0.15 * sin(mfT * 3.3);
                float mfVigPulse = smoothstep(0.95, 0.45, distance(mfUv, vec2(0.5)) * (0.85 + 0.15 * mfPulse));
                gl_FragColor.rgb *= mix(1.0, mfVigPulse, uCsStrength * 0.55);

                // â•â•â• 10. SHARPEN CAS (final: recupera nitidez) â•â•â•
                if (uCsSharp > 0.001) {
                    float mfSLum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
                    float mfSdx = dFdx(mfSLum);
                    float mfSdy = dFdy(mfSLum);
                    float mfSEdge = sqrt(mfSdx * mfSdx + mfSdy * mfSdy);
                    float mfSBoost = clamp(mfSEdge * 6.0, 0.0, 1.0) * uCsSharp;
                    gl_FragColor.rgb += (gl_FragColor.rgb - vec3(mfSLum)) * mfSBoost;
                }
            `,
            update: (u, dt) => {
                u.uCsTime.value += dt;
                u.uCsStrength.value = state.strength;
            }
        },

        // â”€â”€â”€â”€â”€â”€ ULTRAFAST (ligero y bonito) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Look estilizado con coste casi nulo: vibrance + contraste en
        // curva S + split-tone cinematogrÃ¡fico. Todo ALU puro â€” cero
        // texturas, cero bucles, cero derivadas, ni siquiera vertex extra.
        // Pensado para ganar FPS, sobre todo junto a Render Scale.
        ultrafast: {
            uniforms: {
                uUfStrength: { value: 0.8 },   // mezcla global (slider Intensidad)
                uUfSat: { value: 1.35 },       // vibrance (1 = neutro, >1 vibrante)
                uUfContrast: { value: 0.45 },  // profundidad de la curva S
                uUfTone: { value: 0.35 }       // split-tone sombras frÃ­as / luces cÃ¡lidas
            },
            fragmentCode: `
                uniform float uUfStrength;
                uniform float uUfSat;
                uniform float uUfContrast;
                uniform float uUfTone;
            `,
            postMain: `
                // â”€â”€ Vibrance: satura lo apagado, respeta lo ya saturado â”€â”€
                float mfUfLum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
                float mfUfMaxC = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);
                float mfUfMinC = min(min(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);
                float mfUfChroma = mfUfMaxC - mfUfMinC;
                vec3 mfUfCol = mix(vec3(mfUfLum), gl_FragColor.rgb,
                                   1.0 + (uUfSat - 1.0) * (1.0 - mfUfChroma));

                // â”€â”€ Contraste en curva S (ALU puro) â”€â”€
                mfUfCol = mix(mfUfCol, mfUfCol * mfUfCol * (3.0 - 2.0 * mfUfCol), uUfContrast);

                // â”€â”€ Split-tone cine: sombras frÃ­as, luces cÃ¡lidas â”€â”€
                vec3 mfUfTint = mix(vec3(0.95, 0.99, 1.07), vec3(1.07, 1.01, 0.94),
                                    smoothstep(0.15, 0.85, mfUfLum));
                mfUfCol *= mix(vec3(1.0), mfUfTint, uUfTone);

                gl_FragColor.rgb = mix(gl_FragColor.rgb, mfUfCol, uUfStrength);
            `,
            update: (u) => {
                u.uUfStrength.value = state.strength;
            }
        },

        // ─────────── PHOTON (port del shaderpack de Minecraft) ───────────
        // Porte del look de Photon (SixthSurge): tonemapping AgX con las
        // matrices EXACTAS del pack (Lib/Programs/Final.glsl, AGX_EV=13),
        // niebla atmosférica estilo VolumetricFog y un agujero negro
        // interactivo (horizonte de sucesos + disco de acreción + lente
        // gravitacional) como efecto de pantalla.
        photon: {
            uniforms: {
                uPhTime: { value: 0 },
                uPhStrength: { value: 0.6 },   // mezcla global (slider Intensidad)
                uPhAgx: { value: 0.8 },        // cantidad de tonemap AgX
                uPhFog: { value: 0.5 },        // niebla atmosférica
                uPhEnd: { value: 0.0 },        // cielo del End (0 = off)
                uPhBH: { value: 0.0 },         // agujero negro (0 = off)
                uPhBHSize: { value: 0.35 },    // radio angular de la sombra
                uPhBHSpin: { value: 1.0 },     // velocidad del disco de acreción
                uPhCamPos: { value: [0.0, 0.0, 0.0] }, // cámara (coords de mundo)
                uPhResolution: { value: [1600.0, 900.0] }
            },
            vertexCode: `
                uniform float uPhTime;
                varying vec3 mfPhWorldPos;
                varying float mfPhDepth;
            `,
            vertexMain: `
                mfPhWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vec4 mfPhMvPos = modelViewMatrix * vec4(transformed, 1.0);
                mfPhDepth = -mfPhMvPos.z;
            `,
            fragmentCode: `
                uniform float uPhTime;
                uniform float uPhStrength;
                uniform float uPhAgx;
                uniform float uPhFog;
                uniform float uPhEnd;
                uniform float uPhBH;
                uniform float uPhBHSize;
                uniform float uPhBHSpin;
                uniform vec2 uPhResolution;
                uniform vec3 uPhCamPos;
                varying vec3 mfPhWorldPos;
                varying float mfPhDepth;

                float mfPhHash(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }

                // ─── AgX (Photon, Lib/Programs/Final.glsl) ───
                // Matrices y curva exactas del shaderpack.
                vec3 mfAgxDefaultContrastApprox(vec3 x) {
                    return (((((15.5 * x - 40.14) * x + 31.96) * x - 6.868) * x + 0.4298) * x + 0.1191) * x - 0.00232;
                }

                vec3 mfAgX(vec3 color) {
                    color *= 2.3;

                    color *= mat3(
                        0.842479062253094, 0.0784335999999992, 0.0792237451477643,
                        0.0423282422610123, 0.878468636469772, 0.0791661274605434,
                        0.0423756549057051, 0.0784336, 0.879142973793104);

                    const float hev = 6.5; // AGX_EV(13) * 0.5
                    const float middle_grey = 0.18;
                    color = clamp(log2(color / middle_grey), -6.5, 6.5);
                    color = (color + 6.5) / 13.0;

                    color = mfAgxDefaultContrastApprox(color);

                    color *= mat3(
                        1.19687900512017, -0.0980208811401368, -0.0990297440797205,
                        -0.0528968517574562, 1.15190312990417, -0.0989611768448433,
                        -0.0529716355144438, -0.0980434501171241, 1.15107367264116);

                    return color;
                }

                // ─── Cielo del End (DIMENSION_END de Photon) ───
                // Void oscuro + nebulosa ender púrpura + estrellas densas.
                // Direccional: usa la posición de mundo del fragmento.
                vec3 mfEndSky(vec3 color, vec3 wpos, vec3 camPos) {
                    if (uPhEnd < 0.001) return color;

                    vec3 dir = normalize(wpos - camPos);
                    float h = dir.y;                       // -1 (nadir) .. 1 (cenit)

                    // Void: casi negro arriba, tinte púrpura al horizonte
                    vec3 voidCol = mix(vec3(0.035, 0.02, 0.05),
                                       vec3(0.10, 0.05, 0.14),
                                       smoothstep(-0.1, 0.45, h));
                    // Nebulosa ender: bandas de ruido púrpura
                    vec2 nUv = dir.xz / max(abs(dir.y) + 0.18, 0.12);
                    float n1 = sin(nUv.x * 3.1 + sin(nUv.y * 2.3) * 1.7) * 0.5 + 0.5;
                    float n2 = sin(nUv.y * 4.7 - sin(nUv.x * 1.9) * 2.1) * 0.5 + 0.5;
                    float neb = pow(n1 * n2, 2.2);
                    vec3 nebCol = vec3(0.28, 0.10, 0.38) * neb * 1.4;

                    // Estrellas densas: hash por dirección (celda proyectada)
                    vec2 sUv = dir.xz * (1.6 / max(abs(h) + 0.25, 0.08));
                    vec2 cell = floor(sUv * 14.0);
                    float star = mfPhHash(cell);
                    float star2 = step(0.955, star);
                    float twinkle = 0.75 + 0.25 * sin(uPhTime * 1.7 + star * 40.0);
                    vec3 stars = vec3(0.9, 0.85, 1.0) * star2 * twinkle * 1.2;

                    vec3 sky = voidCol + nebCol + stars;
                    return mix(color, sky, uPhEnd);
                }

                // ─── Agujero negro (direccional, anclado al mundo) ───
                // Sombras grav. + anillo de fotones + disco de acreción con
                // espiral animada y Doppler beaming. Dirección fija NE-arriba.
                vec3 mfBlackHoleDir(vec3 color, vec3 wpos, vec3 camPos) {
                    if (uPhBH < 0.001) return color;

                    // Dirección del BH en el cielo (fija, como un astro)
                    vec3 bhDir = normalize(vec3(0.45, 0.38, -0.8));
                    vec3 dir = normalize(wpos - camPos);

                    // Radio angular del impacto del rayo vs el centro del BH
                    float impact = length(cross(dir, bhDir)); // sin(ángulo), ~ángulo
                    float shadowR = uPhBHSize * 0.62;         // radio angular de la sombra

                    // ── Disco de acreción ──
                    // Anillo alrededor del BH en el plano que pasa por su
                    // centro, perpendicular a la vista (aprox. skybox).
                    float ang = atan(dir.y * 0.9 - bhDir.y * 0.9, dot(dir.xz, vec2(1.0, 0.0)) - bhDir.x);
                    float r = impact;
                    float inR = shadowR * 1.15;
                    float outR = shadowR * 3.4;
                    float disk = 0.0;
                    if (r > inR && r < outR) {
                        float swirl = ang + uPhTime * uPhBHSpin * 1.5 + 3.2 * log(r / inR);
                        float bands = 0.55 + 0.45 * sin(swirl * 3.0);
                        float fall = smoothstep(inR, inR * 1.25, r) * smoothstep(outR, outR * 0.55, r);
                        disk = bands * fall;
                    }

                    // Doppler: lado que se acerca (tangente al disco) más brillante
                    vec3 tang = normalize(cross(bhDir, vec3(0.0, 1.0, 0.0)));
                    float dop = 1.0 + 0.6 * dot(normalize(dir - bhDir), tang);

                    // Colores: interior blanco-azulado → exterior naranja
                    vec3 diskCol = mix(vec3(1.75, 1.35, 0.95), vec3(1.2, 0.35, 0.05),
                                       smoothstep(inR, outR, r));
                    diskCol *= (0.35 + 0.65 * disk) * (0.8 + 0.4 * dop);

                    // Anillo de fotones: aro fino en el borde de la sombra
                    float ring = exp(-pow((r - shadowR * 1.02) / (shadowR * 0.055), 2.0));

                    // Halo de lente (arco de Einstein)
                    float halo = exp(-pow((r - shadowR * 1.6) / (shadowR * 0.75), 2.0)) * 0.18;

                    vec3 out3 = color;
                    out3 += diskCol * disk;
                    out3 += vec3(1.9, 1.5, 1.0) * ring * 1.4 * dop;
                    out3 += color * halo * 2.0;

                    // Sombra: negro puro dentro del horizonte
                    out3 *= 1.0 - smoothstep(shadowR, shadowR * 0.9, r);

                    return out3 * uPhBH + color * (1.0 - uPhBH);
                }
            `,
            postMain: `
                vec2 mfPhUv = gl_FragCoord.xy / uPhResolution;

                // ─── 1. Cielo del End (direccional) ───
                gl_FragColor.rgb = mfEndSky(gl_FragColor.rgb, mfPhWorldPos, uPhCamPos);

                // ─── 2. Agujero negro (direccional) ───
                gl_FragColor.rgb = mfBlackHoleDir(gl_FragColor.rgb, mfPhWorldPos, uPhCamPos);

                // ─── 3. Niebla atmosférica (VolumetricFog-style) ───
                // Niebla exponencial azul-grisácea con densidad por distancia.
                if (uPhFog > 0.001) {
                    float mfPhFogAmt = 1.0 - exp(-mfPhDepth * 0.012 * uPhFog);
                    vec3 mfPhFogCol = mix(vec3(0.55, 0.62, 0.72), vec3(0.68, 0.73, 0.80),
                                          smoothstep(0.0, 1.0, mfPhUv.y));
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, mfPhFogCol, mfPhFogAmt * 0.85);
                }

                // ─── 4. Tonemap AgX (Photon exact) ───
                if (uPhAgx > 0.001) {
                    vec3 mfPhAgxCol = mfAgX(max(gl_FragColor.rgb, 0.0));
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, mfPhAgxCol, uPhAgx);
                }
            `,
            update: (u, dt) => {
                u.uPhTime.value += dt;
                u.uPhStrength.value = state.strength;

                // Posición de cámara (mundo) para efectos direccionales
                const cam = state.camera || state.game?.camera ||
                    state.game?.gameScene?.camera;
                if (cam && Number.isFinite(cam.x)) {
                    u.uPhCamPos.value[0] = cam.x;
                    u.uPhCamPos.value[1] = cam.y;
                    u.uPhCamPos.value[2] = cam.z;
                }
            }
        },

        // ─────────── CEMENTERIO (graveyard) ───────────
        // Niebla densa gris-verdosa con poca visibilidad, color frío
        // desaturado, grano sutil y luz que muere rápido con la
        // distancia. Look de cementerio al amanecer.
        graveyard: {
            version: 2,
            uniforms: {
                uGvTime: { value: 0 },
                uGvStrength: { value: 0.7 },   // mezcla global
                uGvFog: { value: 0.8 },        // densidad de la niebla
                uGvFogDist: { value: 30.0 },   // distancia (bloques) de visibilidad
                uGvDesat: { value: 0.55 },     // desaturación del color
                uGvBlue: { value: 0.35 },      // tinte frío azulado
                uGvGrain: { value: 0.3 },      // grano de película vieja
                uGvLight: { value: 0.3 }       // luz cenital pálida (difusa)
            },
            vertexCode: `
                varying vec3 mfGvWorldPos;
                varying float mfGvDepth;
            `,
            vertexMain: `
                mfGvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vec4 mfGvMvPos = modelViewMatrix * vec4(transformed, 1.0);
                mfGvDepth = -mfGvMvPos.z;
            `,
            fragmentCode: `
                uniform float uGvTime;
                uniform float uGvStrength;
                uniform float uGvFog;
                uniform float uGvFogDist;
                uniform float uGvDesat;
                uniform float uGvBlue;
                uniform float uGvGrain;
                uniform float uGvLight;
                varying vec3 mfGvWorldPos;
                varying float mfGvDepth;

                float mfGvHash(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }
                float mfGvNoise(vec2 p) {
                    vec2 i = floor(p), f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    float a = mfGvHash(i);
                    float b = mfGvHash(i + vec2(1.0, 0.0));
                    float c = mfGvHash(i + vec2(0.0, 1.0));
                    float d = mfGvHash(i + vec2(1.0, 1.0));
                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }
                // FBM ligero para bancos de niebla a la deriva
                float mfGvFbm(vec2 p) {
                    float v = 0.0, a = 0.5;
                    for (int i = 0; i < 3; i++) {
                        v += a * mfGvNoise(p);
                        p = p * 2.02 + vec2(11.7, 7.3);
                        a *= 0.5;
                    }
                    return v;
                }
            `,
            postMain: `
                vec3 mfGvOrig = gl_FragColor.rgb;

                // ─── 1. Color base frío, desaturado y MUY OSCURO ───
                float mfGvLum = dot(mfGvOrig, vec3(0.2126, 0.7152, 0.0722));
                vec3 mfGvBase = mix(mfGvOrig, vec3(mfGvLum), uGvDesat);
                // Oscurecimiento global: noche cerrada sin luna
                mfGvBase *= 0.30;
                // Tinte frío: sombras hacia azul-gris
                mfGvBase = mix(mfGvBase, mfGvBase * vec3(0.82, 0.90, 1.08), uGvBlue);
                // Luz pálida: aplastar a casi negro salvo el residuo frío
                mfGvBase = mix(mfGvBase, mfGvBase * 0.25 + 0.008, uGvLight);

                // ─── 2. Niebla densa por distancia ───
                // Exponencial dura: visibilidad ~uGvFogDist bloques
                float mfGvFogAmt = 1.0 - exp(-pow(mfGvDepth / uGvFogDist, 2.2) * uGvFog * 4.0);

                // Bancos de niebla animados (proyectados sobre el mundo)
                vec2 mfGvFogUv = mfGvWorldPos.xz * 0.035 + vec2(uGvTime * 0.015, uGvTime * 0.008);
                float mfGvBanks = mfGvFbm(mfGvFogUv);
                mfGvFogAmt = clamp(mfGvFogAmt + (mfGvBanks - 0.5) * 0.25 * uGvFog, 0.0, 1.0);

                // Color de niebla: verde-gris casi negro (noche en el cementerio)
                vec3 mfGvFogCol = vec3(0.075, 0.095, 0.088);
                mfGvBase = mix(mfGvBase, mfGvFogCol, mfGvFogAmt);

                // ─── 3. Grano de película vieja ───
                if (uGvGrain > 0.001) {
                    float mfGvG = mfGvHash(gl_FragCoord.xy + fract(uGvTime) * 100.0);
                    mfGvBase += (mfGvG - 0.5) * uGvGrain * 0.08;
                }

                // ─── 4. Mezcla con la intensidad del slider ───
                gl_FragColor.rgb = mix(mfGvOrig, mfGvBase, uGvStrength);
            `,
            update: (u, dt) => {
                u.uGvTime.value += dt;
                u.uGvStrength.value = state.strength;
            }
        },

        // ─────────── COMPLEMENTARY REIMAGINED (port del pack r5.8.1) ───────────
        // Port de la matemática exacta de Complementary Shaders (EminGT):
        //  - DoCompTonemap (composite5.glsl:36): Lottes 2016 modificado
        //    con darkLift, path-to-white y desaturación de sombras.
        //    Defaults: TM_EXPOSURE=1.0, TM_CONTRAST=1.05,
        //    TM_DARK_DESATURATION=0.25, TM_WHITE_PATH=1.0
        //  - DoBSLColorSaturation (composite5.glsl:89): vibrance real BSL.
        //  - Viñeta VIGNETTE_R (final.glsl:153): modulada por luminancia.
        //  - Niebla: adaptación del look (tinte por altura).
        complementaryInspired: {
            uniforms: {
                uCrStrength: { value: 0.8 },    // mezcla global (slider Intensidad)
                uCrTonemap: { value: 0.8 },     // cantidad de Lottes tonemap
                uCrExposure: { value: 1.0 },    // TM_EXPOSURE
                uCrContrast: { value: 1.05 },   // TM_CONTRAST
                uCrSaturation: { value: 1.0 },  // T_SATURATION
                uCrVibrance: { value: 1.0 },    // T_VIBRANCE
                uCrVignette: { value: 0.5 },    // VIGNETTE_R amount
                uCrFog: { value: 0.4 },         // ATM_FOG_MULT adaptado
                uCrDayFactor: { value: 1.0 },   // 0=noche 1=día (desde el juego)
                uCrDither: { value: 1.0 },      // dither final (final.glsl:159)
                uCrTime: { value: 0 },
                uCrResolution: { value: [1600.0, 900.0] }
            },
            vertexCode: `
                varying float mfCrDepth;
                varying vec3 mfCrWorldPos;
            `,
            vertexMain: `
                vec4 mfCrMvPos = modelViewMatrix * vec4(transformed, 1.0);
                mfCrDepth = -mfCrMvPos.z;
                mfCrWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
            `,
            fragmentCode: `
                uniform float uCrStrength;
                uniform float uCrTonemap;
                uniform float uCrExposure;
                uniform float uCrContrast;
                uniform float uCrSaturation;
                uniform float uCrVibrance;
                uniform float uCrVignette;
                uniform float uCrFog;
                uniform float uCrDayFactor;
                uniform float uCrDither;
                uniform vec2 uCrResolution;
                varying float mfCrDepth;
                varying vec3 mfCrWorldPos;

                float mfCrGetLuminance(vec3 color) {
                    return dot(color, vec3(0.299, 0.587, 0.114));
                }
                float mfCrMax0(float x) {
                    return max(x, 0.0);
                }
                float mfCrPow2(float x) {
                    return x * x;
                }

                // LinearToRGB (composite5.glsl:31)
                vec3 mfCrLinearToRGB(vec3 color) {
                    const vec3 k = vec3(0.055);
                    return mix((vec3(1.0) + k) * pow(color, vec3(1.0 / 2.4)) - k,
                               12.92 * color,
                               vec3(lessThan(color, vec3(0.0031308))));
                }

                // DoCompTonemap (composite5.glsl:36) — Lottes modificado
                vec3 mfCrDoCompTonemap(vec3 color) {
                    color = uCrExposure * color;

                    float initialLuminance = mfCrGetLuminance(color);

                    vec3 a      = vec3(uCrContrast);
                    vec3 d      = vec3(1.0);
                    vec3 hdrMax = vec3(8.0);
                    vec3 midIn  = vec3(0.25);
                    vec3 midOut = vec3(0.25);

                    vec3 a_d = a * d;
                    vec3 hdrMaxA = pow(hdrMax, a);
                    vec3 hdrMaxAD = pow(hdrMax, a_d);
                    vec3 midInA = pow(midIn, a);
                    vec3 midInAD = pow(midIn, a_d);
                    vec3 HM1 = hdrMaxA * midOut;
                    vec3 HM2 = hdrMaxAD - midInAD;

                    vec3 b = (-midInA + HM1) / (HM2 * midOut);
                    vec3 c = (hdrMaxAD * midInA - HM1 * midInAD) / (HM2 * midOut);

                    vec3 colorOut = pow(color, a) / (pow(color, a_d) * b + c);

                    colorOut = mfCrLinearToRGB(colorOut);

                    // Dark lift para legibilidad
                    const float darkLiftStart = 0.1;
                    const float darkLiftMix = 0.75;
                    float darkLift = smoothstep(darkLiftStart, 0.0, initialLuminance);
                    vec3 smoothColor = pow(color, vec3(1.0 / 2.2));
                    colorOut = mix(colorOut, smoothColor,
                                   darkLift * darkLiftMix *
                                   mfCrMax0(0.55 - abs(1.05 - uCrContrast)) / 0.55);

                    // Path to white
                    const float wpInputCurveStart = 0.0;
                    const float wpInputCurveMax = 16.0;
                    float modifiedLuminance = pow(initialLuminance / wpInputCurveMax,
                                                  2.0 - 1.0) * wpInputCurveMax;
                    float whitePath = smoothstep(wpInputCurveStart, wpInputCurveMax,
                                                 modifiedLuminance);
                    colorOut = mix(colorOut, vec3(1.0), whitePath);

                    // Desaturar sombras
                    const float dpInputCurveStart = 0.1;
                    const float dpInputCurveMax = 0.0;
                    float desaturatePath = smoothstep(dpInputCurveStart, dpInputCurveMax,
                                                      initialLuminance);
                    colorOut = mix(colorOut, vec3(mfCrGetLuminance(colorOut)),
                                   desaturatePath * 0.25);

                    return clamp(colorOut, 0.0, 1.0);
                }

                // DoBSLColorSaturation (composite5.glsl:89)
                vec3 mfCrDoBSLSaturation(vec3 color) {
                    float saturationFactor = uCrSaturation + 0.07;

                    float grayVibrance = (color.r + color.g + color.b) / 3.0;
                    float graySaturation = grayVibrance;
                    if (saturationFactor < 1.00) {
                        graySaturation = mfCrGetLuminance(color);
                    }

                    float mn = min(color.r, min(color.g, color.b));
                    float mx = max(color.r, max(color.g, color.b));
                    float sat = (1.0 - (mx - mn)) * (1.0 - mx) * grayVibrance * 5.0;
                    vec3 lightness = vec3((mn + mx) * 0.5);

                    color = mix(color, mix(color, lightness, 1.0 - uCrVibrance), sat);
                    color = mix(color, lightness,
                                (1.0 - lightness) * (2.0 - uCrVibrance) / 2.0 *
                                abs(uCrVibrance - 1.0));
                    color = color * saturationFactor -
                            graySaturation * (saturationFactor - 1.0);
                    return color;
                }

                // GetAtmFogColor (mainFog.glsl:94) — colores reales del pack
                vec3 mfCrGetAtmFogColor(float altitudeFactorRaw, float VdotS, float dayFactor) {
                    float nightFogMult = 2.5 - 0.625 * max(mfCrPow2(mfCrPow2(altitudeFactorRaw)), 0.0);
                    float dayNightFogBlend = pow(1.0 - dayFactor, 4.0 - VdotS - 2.5 * dayFactor * dayFactor);
                    // skyColors.glsl: nightUpSkyColor y dayDownSkyColor
                    vec3 nightUpSkyColor = vec3(0.0005, 0.0008, 0.0019);
                    vec3 dayDownSkyColor = vec3(0.22, 0.35, 0.56);
                    return mix(
                        nightUpSkyColor * (nightFogMult - dayNightFogBlend * nightFogMult),
                        dayDownSkyColor * (0.9 + 0.3 * dayFactor),
                        dayNightFogBlend
                    );
                }

                // DoAtmosphericFog (mainFog.glsl:120) — adaptado a forward
                vec3 mfCrDoAtmosphericFog(vec3 color, float lViewPos, float altitude) {
                    // SRATA=63.1, CRFTM=60 (defaults del pack en overworld)
                    float atmFogSRATA = 63.1;
                    float atmFogCRFTM = 60.0;

                    // renDisFactor: renderDistance 192 default, sin DH/VOXY
                    float renDisFactor = min(192.0 / 160.0, 1.0);
                    float fog = 1.0 - exp(-pow(lViewPos * 0.001, 2.0) * lViewPos * renDisFactor);

                    float altitudeFactorRaw = mfCrPow2(1.0 - clamp(altitude - atmFogSRATA, 0.0, atmFogCRFTM) / atmFogCRFTM);
                    float altitudeFactor = altitudeFactorRaw * 0.9 + 0.1;

                    fog *= uCrFog - 0.1;

                    // VdotS sin datos del sol en forward: 0 neutral
                    vec3 fogColor = mfCrGetAtmFogColor(altitudeFactorRaw, 0.0, uCrDayFactor);

                    float fogAmount = fog * altitudeFactor;
                    return mix(color, fogColor, clamp(fogAmount, 0.0, 1.0));
                }
            `,
            postMain: `
                // ─── 1. Tonemap Lottes (DoCompTonemap) ───
                if (uCrTonemap > 0.001) {
                    vec3 mfCrTm = mfCrDoCompTonemap(gl_FragColor.rgb);
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, mfCrTm, uCrTonemap);
                }

                // ─── 2. Saturación BSL (DoBSLColorSaturation) ───
                gl_FragColor.rgb = mfCrDoBSLSaturation(gl_FragColor.rgb);

                // ─── 3. Niebla atmosférica (DoAtmosphericFog del pack) ───
                if (uCrFog > 0.001) {
                    gl_FragColor.rgb = mfCrDoAtmosphericFog(
                        gl_FragColor.rgb, mfCrDepth, mfCrWorldPos.y);
                }

                // ─── 4. Viñeta del pack (VIGNETTE_R, final.glsl:153) ───
                if (uCrVignette > 0.001) {
                    vec2 mfCrUvV = gl_FragCoord.xy / uCrResolution;
                    vec2 texCoordMin = mfCrUvV - 0.5;
                    float mfCrVig = 1.0 - dot(texCoordMin, texCoordMin) *
                                    (1.0 - mfCrGetLuminance(gl_FragColor.rgb));
                    gl_FragColor.rgb *= mix(1.0, mfCrVig, uCrVignette);
                }

                // ─── 5. Dither final (final.glsl:159) — quita banding ───
                if (uCrDither > 0.001) {
                    float mfCrDith = fract(sin(dot(gl_FragCoord.xy,
                                     vec2(12.9898, 78.233))) * 43758.5453);
                    gl_FragColor.rgb += vec3((mfCrDith - 0.25) / 128.0);
                }
            `,
            update: (u, dt) => {
                u.uCrTime.value += dt;
                u.uCrStrength.value = state.strength;
                // worldTime: 0-24000 ticks; día 6000-18000, noche 18000-6000
                // Convertir a factor 0=noche 1=día para el fog del pack
                try {
                    const wt = Number(state.game?.world?.worldTime ?? 12000);
                    // Coseno: 6000=mediodía(1.0), 18000=medianoche(0.0)
                    const dayF = 0.5 + 0.5 * Math.cos((wt - 6000) / 24000 * Math.PI * 2);
                    u.uCrDayFactor.value = dayF;
                } catch (_) {}
            }
        },
    };


    // â”€â”€â”€â”€â”€â”€ DefiniciÃ³n de sub-efectos persistibles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Compartido por presets: nombre de la GUI â†’ uniform + lÃ­mite.
    const EFFECT_DEFS = {
        vhs:        { key: 'uCsVhs',      max: 1 },
        crt:        { key: 'uCsCrt',      max: 1 },
        cel:        { key: 'uCsCel',      max: 1 },
        fog:        { key: 'uCsFog',      max: 1 },
        grain:      { key: 'uCsGrain',    max: 1 },
        glitch:     { key: 'uCsGlitch',   max: 1 },
        flash:      { key: 'uCsFlash',    max: 1 },
        sharp:      { key: 'uCsSharp',    max: 1 },
        ufsat:      { key: 'uUfSat',      max: 2 },
        ufcontrast: { key: 'uUfContrast', max: 1 },
        uftone:     { key: 'uUfTone',     max: 1 },
        phagx:      { key: 'uPhAgx',      max: 1 },
        phfog:      { key: 'uPhFog',      max: 1 },
        phend:      { key: 'uPhEnd',      max: 1 },
        phbh:       { key: 'uPhBH',       max: 1 },
        phbhsize:   { key: 'uPhBHSize',   max: 1 },
        phbhspin:   { key: 'uPhBHSpin',   max: 3 },
        crtm:       { key: 'uCrTonemap',  max: 1 },
        crexp:      { key: 'uCrExposure', max: 2.8 },
        crc:        { key: 'uCrContrast', max: 2 },
        crsat:      { key: 'uCrSaturation', max: 2 },
        crvib:      { key: 'uCrVibrance', max: 2 },
        crvig:      { key: 'uCrVignette', max: 1 },
        crfog:      { key: 'uCrFog',      max: 1 },
        crdith:     { key: 'uCrDither',   max: 1 },
        gvfog:      { key: 'uGvFog',      max: 1 },
        gvdist:     { key: 'uGvFogDist',  max: 120 },
        gvdesat:    { key: 'uGvDesat',    max: 1 },
        gvblue:     { key: 'uGvBlue',     max: 1 },
        gvgrain:    { key: 'uGvGrain',    max: 1 },
        gvlight:    { key: 'uGvLight',    max: 1 }
    };

    // â”€â”€â”€ Tecla F para toggle de linterna + rueda para radio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Solo se activa cuando el preset 'flashlight' estÃ¡ en uso
    if (!window.__MF_FLASHLIGHT_KEYS__) {
        window.__MF_FLASHLIGHT_KEYS__ = true;
        const keyHandler = (e) => {
            const flashlightActive = state.enabled &&
                (state.preset === 'flashlight' || state.preset === 'spooklementary');
            if (!flashlightActive) return;
            if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                for (const [, entry] of state.hooked) {
                    const u = entry.liveUniforms;
                    if (u.uCsLightOn) {
                        u.uCsLightOn.value = u.uCsLightOn.value > 0.5 ? 0 : 1;
                        console.log(`${TAG} Linterna: ${u.uCsLightOn.value > 0.5 ? 'ON' : 'OFF'}`);
                    }
                }
            }
        };
        const wheelHandler = (e) => {
            const flashlightActive = state.enabled &&
                (state.preset === 'flashlight' || state.preset === 'spooklementary');
            if (!flashlightActive) return;
            e.preventDefault();
            for (const [, entry] of state.hooked) {
                const u = entry.liveUniforms;
                if (u.uCsLightRadius) {
                    u.uCsLightRadius.value = Math.max(3, Math.min(40,
                        u.uCsLightRadius.value - Math.sign(e.deltaY) * 1.5
                    ));
                }
            }
        };
        window.addEventListener('keydown', keyHandler);
        window.addEventListener('wheel', wheelHandler, { passive: false });
    }

    // â”€â”€â”€ Encontrar el game object (React fiber mining) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€â”€ Resolver el WebGLRenderer de Three.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Duck-typing: isWebGLRenderer === true o presencia de
    // setPixelRatio + setSize + domElement (canvas).
    function looksLikeRenderer(value) {
        if (!value || typeof value !== 'object') return false;
        if (value.isWebGLRenderer === true) return true;
        return typeof value.setPixelRatio === 'function' &&
               typeof value.setSize === 'function' &&
               value.domElement instanceof HTMLCanvasElement;
    }

    // Rutas directas candidatas primero; BFS de respaldo si fallan.
    function resolveRenderer(game) {
        if (looksLikeRenderer(state.renderer)) return state.renderer;

        const direct = [
            game?.renderer,
            game?.gameScene?.renderer,
            game?.scene?.renderer,
            game?.engine?.renderer,
            game?.graphics?.renderer,
            game?.gameScene?.scene?.renderer
        ];
        for (const cand of direct) {
            if (looksLikeRenderer(cand)) {
                state.renderer = cand;
                return cand;
            }
        }

        // BFS de respaldo sobre el game object (patrÃ³n resolveCamera de TitanTiny)
        const queue = [{ value: game, depth: 0 }];
        const seen = new WeakSet();
        let visited = 0;

        while (queue.length && visited < 1200) {
            const { value, depth } = queue.shift();
            if (!value || typeof value !== 'object' || seen.has(value)) continue;
            seen.add(value);
            visited++;

            if (looksLikeRenderer(value)) {
                state.renderer = value;
                return value;
            }

            if (depth >= 3) continue;
            let keys;
            try { keys = Object.keys(value); } catch (_) { continue; }
            for (const key of keys) {
                if (key === 'parent' || key === 'world' || key === 'entities') continue;
                try {
                    const child = value[key];
                    if (child && typeof child === 'object' &&
                        child !== window && child !== document &&
                        !(child instanceof Element)) {
                        queue.push({ value: child, depth: depth + 1 });
                    }
                } catch (_) {}
            }
        }

        return null;
    }

    // â”€â”€â”€ Render Scale (modo DLSS-style) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Reduce la resoluciÃ³n interna del renderer para ganar FPS.
    // 1.0 = resoluciÃ³n nativa, 0.5 = mitad de pÃ­xeles (4x menos trabajo).
    //
    // IMPORTANTE: el juego llama a setPixelRatio/setSize en su propio bucle
    // de resize, lo que revertirÃ­a un cambio puntual. Por eso hookeamos
    // setPixelRatio de forma persistente: TODO valor que el juego establezca
    // se multiplica por el factor de escala. AsÃ­ sobrevive a cualquier
    // resize del juego o de la ventana.
    function applyRenderScale(scale) {
        const clamped = Math.max(0.5, Math.min(1.0, parseFloat(scale) || 1.0));

        // A escala nativa no hay nada que escalar: evitar el warning
        // del renderer (el juego no lo expone fuera de su closure).
        if (clamped >= 1.0) {
            // Si había un hook activo con factor < 1, restaurar nativo
            const g = state.game || findGame();
            const r = g ? resolveRenderer(g) : null;
            if (r && r.__mfScaleHook) {
                r.__mfScaleHook.factor = 1.0;
                r.__mfScaleHook.originalSetPixelRatio(window.devicePixelRatio || 1);
            }
            state.renderScale = 1.0;
            localStorage.setItem('miniblox_customshader_renderscale', '1.0');
            return true;
        }

        const game = state.game || findGame();
        if (!game) return false;

        const renderer = resolveRenderer(game);
        if (!renderer) {
            console.warn(`${TAG} WebGLRenderer no encontrado para render scale.`);
            return false;
        }

        // Instalar el hook persistente una sola vez
        if (!renderer.__mfScaleHook) {
            const originalSetPixelRatio = renderer.setPixelRatio.bind(renderer);
            renderer.__mfScaleHook = {
                factor: 1.0,
                originalSetPixelRatio
            };

            renderer.setPixelRatio = function (value) {
                const factor = renderer.__mfScaleHook.factor;
                return originalSetPixelRatio(value * factor);
            };
        }

        const hook = renderer.__mfScaleHook;

        if (clamped >= 1.0) {
            hook.factor = 1.0;
            // Restaurar resoluciÃ³n nativa
            hook.originalSetPixelRatio(window.devicePixelRatio || 1);
            console.log(`${TAG} Render scale restaurado a nativo (1.0).`);
        } else {
            hook.factor = clamped;
            hook.originalSetPixelRatio((window.devicePixelRatio || 1) * clamped);
            console.log(`${TAG} Render scale aplicado: ${clamped.toFixed(2)} â€” se mantiene tras resizes del juego.`);
        }

        // Forzar reajuste del tamaÃ±o del buffer con el nuevo ratio
        try {
            const canvas = renderer.domElement;
            const w = canvas.clientWidth || window.innerWidth;
            const h = canvas.clientHeight || window.innerHeight;
            renderer.setSize(w, h, false);
        } catch (_) {}

        state.renderScale = clamped;
        return true;
    }

    // ══════════════════════════════════════════════════════════════════
    // POSTFX: pass full-screen propio (raw WebGL, sin clases THREE)
    // ══════════════════════════════════════════════════════════════════
    // Desbloquea efectos que requieren muestrear píxeles vecinos:
    // bloom, aberración cromática real, DOF radial, lens dirt.
    //
    // Estrategia: hookear renderer.render(). Tras el render del juego:
    //   1. copiar el framebuffer a una textura nuestra
    //   2. dibujar un quad con un shader que mezcla: base + bloom blur
    //      + aberración cromática + DOF radial + lens dirt animado
    // Todo en UN solo fragment (una pasada, mínimo coste).
    //
    // Raw WebGL: el juego puede no exponer THREE global, así que usamos
    // el contexto GL del canvas directamente (compatible siempre).
    const postfx = {
        enabled: false,
        gl: null,
        program: null,
        uniforms: null,
        quad: null,
        sceneTex: null,
        origRender: null,
        time: 0,
        lastT: performance.now(),
        params: { bloom: 0.35, ca: 0.0, dof: 0.0, dirt: 0.0, vignette: 0.0 },
        active: false
    };

    const POSTFX_FS_SRC = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uScene;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform float uBloom;
        uniform float uCA;
        uniform float uDof;
        uniform float uDirt;
        uniform float uVignette;

        float mfPxHash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }
        float mfPxBright(vec3 c) {
            return dot(c, vec3(0.2126, 0.7152, 0.0722));
        }

        // Blur de 12 taps (2 anillos de 6): aprox gaussiano para bloom/DOF
        vec3 mfRingBlur(vec2 uv, float radiusPx) {
            vec2 px = radiusPx / uResolution;
            vec3 sum = vec3(0.0);
            for (int i = 0; i < 6; i++) {
                float a = float(i) * 1.0472 + 0.26;
                vec2 dir = vec2(cos(a), sin(a));
                sum += texture2D(uScene, uv + dir * px).rgb;
                sum += texture2D(uScene, uv - dir * px * 1.6).rgb;
            }
            return sum / 12.0;
        }

        void main() {
            vec2 uv = vUv;
            vec2 fromCenter = uv - 0.5;
            float r = length(fromCenter);

            // ── 1. Aberración cromática: samplear R y B con offset radial ──
            vec3 col;
            if (uCA > 0.001) {
                vec2 off = fromCenter * uCA * 0.012;
                col.r = texture2D(uScene, uv - off).r;
                col.g = texture2D(uScene, uv).g;
                col.b = texture2D(uScene, uv + off).b;
            } else {
                col = texture2D(uScene, uv).rgb;
            }

            // ── 2. Bloom: extraer brillo, difuminar, sumar suave ──
            if (uBloom > 0.001) {
                vec3 blur = mfRingBlur(uv, 6.0);
                float lum = mfPxBright(blur);
                vec3 brightPart = blur * smoothstep(0.55, 0.85, lum);
                // segundo anillo más ancho = halo grande
                vec3 wide = mfRingBlur(uv, 16.0);
                brightPart += wide * smoothstep(0.65, 0.95, mfPxBright(wide)) * 0.5;
                col += brightPart * uBloom * 0.8;
            }

            // ── 3. DOF radial: mezclar blur según distancia al centro ──
            if (uDof > 0.001) {
                float focusMask = smoothstep(0.18, 0.62, r) * uDof;
                vec3 blurred = mfRingBlur(uv, 4.0);
                col = mix(col, blurred, focusMask * 0.85);
            }

            // ── 4. Lens dirt: manchas procedurales que brillan con bloom ──
            if (uDirt > 0.001) {
                vec2 dirtUv = uv * 3.0 + vec2(uTime * 0.008, uTime * 0.005);
                float d = mfPxHash(floor(dirtUv * 40.0));
                float spots = smoothstep(0.82, 1.0, d);
                float glow = mfPxBright(col);
                col += vec3(0.9, 0.85, 0.75) * spots * glow * uDirt * 0.6;
            }

            // ── 5. Viñeta ──
            if (uVignette > 0.001) {
                col *= 1.0 - r * r * uVignette;
            }

            gl_FragColor = vec4(col, 1.0);
        }
    `;

    const POSTFX_VS_SRC = `
        attribute vec2 aPos;
        varying vec2 vUv;
        void main() {
            vUv = aPos * 0.5 + 0.5;
            gl_Position = vec4(aPos, 0.0, 1.0);
        }
    `;

    function postfxCompile(gl, type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.warn('[MiniFeather PostFX] Shader error:', gl.getShaderInfoLog(sh));
            gl.deleteShader(sh);
            return null;
        }
        return sh;
    }

    // Instalar el pass. El renderer del juego NO es alcanzable desde el
    // objeto game (vive en un closure del módulo) — lo verificado con BFS
    // exhaustivo (7000+ objetos). En su lugar: el canvas principal + su
    // contexto GL + un rAF encadenado. Si registramos nuestro rAF callback
    // en cada frame DESPUÉS de que el juego registre el suyo, corremos
    // tras su render en el mismo frame (antes del compositing del browser)
    // y podemos leer/escribir el framebuffer.
    function findMainGameCanvas() {
        // Vía preferida: registro temprano de canvases GL (TextureInterceptor
        // hookea getContext desde document_start). El primer canvas GL grande
        // creado por el juego es el principal.
        const registry = window.__MF_GL_CANVASES__;
        if (Array.isArray(registry) && registry.length) {
            const live = registry.filter(c =>
                c.isConnected && !c.__mfIsHUD &&
                c.width >= 300 && c.height >= 200);
            // El del mayor área (el juego escala el principal al viewport)
            live.sort((a, b) => b.width * b.height - a.width * a.height);
            if (live[0]) return live[0];
        }
        // Fallback: heurística por tamaño (sesiones sin el registro)
        const canvases = [...document.querySelectorAll('canvas')];
        return canvases
            .filter(c => c.width >= 300 && c.height >= 200)
            .sort((a, b) => b.width * b.height - a.width * a.height)[0] || null;
    }

    function installPostFx() {
        if (postfx.active) return true;

        const canvas = findMainGameCanvas();
        if (!canvas) return false;

        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) {
            console.warn('[MiniFeather PostFX] Sin contexto WebGL en el canvas principal.');
            return false;
        }

        const vs = postfxCompile(gl, gl.VERTEX_SHADER, POSTFX_VS_SRC);
        const fs = postfxCompile(gl, gl.FRAGMENT_SHADER, POSTFX_FS_SRC);
        if (!vs || !fs) return false;

        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn('[MiniFeather PostFX] Link error:', gl.getProgramInfoLog(prog));
            return false;
        }

        const quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1
        ]), gl.STATIC_DRAW);

        const sceneTex = gl.createTexture();

        // VAO propio: aísla el estado de vertex attribs del juego para
        // que nuestro quad no contamine sus draw calls posteriores.
        let vao = null;
        if (typeof gl.createVertexArray === 'function') {
            vao = gl.createVertexArray();
            gl.bindVertexArray(vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            const aPos = gl.getAttribLocation(prog, 'aPos');
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
            gl.bindVertexArray(null);
        }

        postfx.gl = gl;
        postfx.program = prog;
        postfx.quad = quad;
        postfx.sceneTex = sceneTex;
        postfx.vao = vao;
        postfx.uniforms = {
            uScene: gl.getUniformLocation(prog, 'uScene'),
            uResolution: gl.getUniformLocation(prog, 'uResolution'),
            uTime: gl.getUniformLocation(prog, 'uTime'),
            uBloom: gl.getUniformLocation(prog, 'uBloom'),
            uCA: gl.getUniformLocation(prog, 'uCA'),
            uDof: gl.getUniformLocation(prog, 'uDof'),
            uDirt: gl.getUniformLocation(prog, 'uDirt'),
            uVignette: gl.getUniformLocation(prog, 'uVignette')
        };
        postfx.active = true;
        postfx.canvas = canvas;

        // rAF encadenado: nuestro callback corre después del render del
        // juego en el mismo frame. Nos re-registramos cada frame para
        // mantenernos SIEMPRE al final de la cola de callbacks.
        const loop = () => {
            if (!postfx.active) return;
            try { postfxDraw(gl); } catch (_) {}
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);

        console.log('[MiniFeather PostFX] ✓ Pass full-screen instalado vía canvas+rAF (bloom/CA/DOF/dirt).');
        return true;
    }

    function postfxDraw(gl) {
        if (!postfx.active || !postfx.enabled) return;
        if (gl.isContextLost()) return;

        // ¿Algún efecto activo? Si no, ni gastar un frame.
        const p = postfx.params;
        if (p.bloom <= 0.001 && p.ca <= 0.001 && p.dof <= 0.001 &&
            p.dirt <= 0.001 && p.vignette <= 0.001) return;

        const canvas = gl.canvas;
        const w = canvas.width, h = canvas.height;
        if (!w || !h) return;

        const now = performance.now();
        postfx.time += (now - postfx.lastT) / 1000;
        postfx.lastT = now;

        // ── Guardar TODO el estado GL que tocamos ──────────────────
        // Three.js cachea el estado GL: si cambiamos algo detrás de su
        // espalda sin restaurar, su caché miente y el juego se rompe
        // (texturas negras, reflejos corruptos, feedback loops).
        const lastProg = gl.getParameter(gl.CURRENT_PROGRAM);
        const lastActiveTex = gl.getParameter(gl.ACTIVE_TEXTURE);
        const lastFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const lastViewport = gl.getParameter(gl.VIEWPORT);
        const lastArrayBuf = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        const lastVao = gl.VERTEX_ARRAY_BINDING !== undefined
            ? gl.getParameter(gl.VERTEX_ARRAY_BINDING) : null;

        // Binding de textura de la unidad 0 (la única que tocamos)
        gl.activeTexture(gl.TEXTURE0);
        const lastTex0 = gl.getParameter(gl.TEXTURE_BINDING_2D);

        let lastEnabled = [];
        [gl.BLEND, gl.DEPTH_TEST, gl.CULL_FACE, gl.SCISSOR_TEST].forEach(cap => {
            if (gl.isEnabled(cap)) lastEnabled.push(cap);
        });

        try {
            // ── 1. Copiar la imagen final (framebuffer por defecto) ──
            // copyTexSubImage2D lee del READ framebuffer: bindear null
            // garantiza que leemos el canvas visible, no un FBO interno
            // del juego (reflexiones/pases). Es GPU→GPU, sin readback.
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, w, h);

            // Bindear NUESTRA textura ANTES de copiar (copyTex* escribe a
            // la textura bindeada — sería copiar dentro de la del juego)
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, postfx.sceneTex);

            const sizeChanged = postfx.texW !== w || postfx.texH !== h;
            if (sizeChanged) {
                gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, w, h, 0);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                postfx.texW = w;
                postfx.texH = h;
            } else {
                gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
            }

            // ── 2. Dibujar el quad al framebuffer por defecto ──
            gl.disable(gl.BLEND);
            gl.disable(gl.DEPTH_TEST);
            gl.disable(gl.CULL_FACE);
            gl.useProgram(postfx.program);

            // VAO propio: el estado de vertex attribs queda aislado
            if (postfx.vao) gl.bindVertexArray(postfx.vao);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, postfx.sceneTex);
            gl.uniform1i(postfx.uniforms.uScene, 0);
            gl.uniform2f(postfx.uniforms.uResolution, w, h);
            gl.uniform1f(postfx.uniforms.uTime, postfx.time);
            gl.uniform1f(postfx.uniforms.uBloom, p.bloom);
            gl.uniform1f(postfx.uniforms.uCA, p.ca);
            gl.uniform1f(postfx.uniforms.uDof, p.dof);
            gl.uniform1f(postfx.uniforms.uDirt, p.dirt);
            gl.uniform1f(postfx.uniforms.uVignette, p.vignette);

            gl.drawArrays(gl.TRIANGLES, 0, 6);

            if (postfx.vao) gl.bindVertexArray(null);
        } finally {
            // ── 3. Restaurar TODO el estado en orden inverso ──
            gl.bindFramebuffer(gl.FRAMEBUFFER, lastFbo);
            gl.bindBuffer(gl.ARRAY_BUFFER, lastArrayBuf);
            if (lastVao !== null && gl.bindVertexArray) gl.bindVertexArray(lastVao);
            gl.useProgram(lastProg);
            lastEnabled.forEach(cap => gl.enable(cap));
            [gl.BLEND, gl.DEPTH_TEST, gl.CULL_FACE, gl.SCISSOR_TEST].forEach(cap => {
                if (!lastEnabled.includes(cap)) gl.disable(cap);
            });
            gl.viewport(lastViewport[0], lastViewport[1], lastViewport[2], lastViewport[3]);
            // Textura original de la unidad 0 (Three cachea esto)
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, lastTex0);
            gl.activeTexture(lastActiveTex);
        }
    }

    function setPostFx(cfg) {
        if (cfg) {
            if (cfg.bloom !== undefined) postfx.params.bloom = Math.max(0, Math.min(1, +cfg.bloom || 0));
            if (cfg.ca !== undefined) postfx.params.ca = Math.max(0, Math.min(1, +cfg.ca || 0));
            if (cfg.dof !== undefined) postfx.params.dof = Math.max(0, Math.min(1, +cfg.dof || 0));
            if (cfg.dirt !== undefined) postfx.params.dirt = Math.max(0, Math.min(1, +cfg.dirt || 0));
            if (cfg.vignette !== undefined) postfx.params.vignette = Math.max(0, Math.min(1, +cfg.vignette || 0));
        }
        postfx.enabled = !!(postfx.params.bloom > 0 || postfx.params.ca > 0 ||
            postfx.params.dof > 0 || postfx.params.dirt > 0 || postfx.params.vignette > 0);
        if (postfx.enabled && !postfx.active) {
            // El renderer puede no existir aún: reintentar breve
            const retry = setInterval(() => {
                if (installPostFx() || !postfx.enabled) clearInterval(retry);
            }, 1000);
            setTimeout(() => clearInterval(retry), 30000);
        }
    }

    // ─── NUBES: localizar el mesh 'clouds' y ajustar sus uniforms ────
    // El juego usa un ShaderMaterial con uCoverage, uNoiseScale, uWind,
    // uThickness, uCloudY, uOpacity sobre un PlaneGeometry de 8000x8000.
    function resolveClouds() {
        if (state.cloudsMesh && state.cloudsMesh.parent) return state.cloudsMesh;

        const game = state.game || findGame();
        if (!game) return null;

        const scene = getScene(game);
        if (!scene) return null;

        const queue = [scene];
        const seen = new WeakSet();
        while (queue.length) {
            const obj = queue.shift();
            if (!obj || seen.has(obj)) continue;
            seen.add(obj);

            if (obj.name === 'clouds' && obj.material?.uniforms?.uCoverage) {
                state.cloudsMesh = obj;
                return obj;
            }
            if (Array.isArray(obj.children)) {
                for (const child of obj.children) queue.push(child);
            }
        }
        return null;
    }

    // ─── NUBES: forma custom por dibujo (máscara 2D extruida a textura 3D) ───
    // El usuario dibuja en un canvas de la GUI (blanco = nube, negro = cielo).
    // El dibujo se convierte en Data3DTexture (depth=1) y se inyecta en el
    // fragment shader del material de nubes: cloudShape / cloudDensity /
    // cloudShadowDensity mezclan el FBM procedural con la máscara dibujada.
    const LS_SHAPE = 'miniblox_clouds_shape';
    const LS_SHAPE_MIX = 'miniblox_clouds_shape_mix';
    const LS_SHAPE_TILE = 'miniblox_clouds_shape_tile';

    const cloudsShape = {
        mix: Math.max(0, Math.min(1, parseFloat(localStorage.getItem(LS_SHAPE_MIX) || '0.85') || 0.85)),
        tile: Math.max(64, Math.min(4000, parseFloat(localStorage.getItem(LS_SHAPE_TILE) || '512') || 512)),
        texture: null,
        textureFor: null
    };

    // GLSL ES 3.00 (el material usa glslVersion GLSL3 como el resto del juego).
    // La máscara se muestrea en coords de mundo XZ absolutas (fijas en el mundo)
    // con el mismo desplazamiento de viento que el FBM, y se repite en tiles.
    const MF_SHAPE_GLSL = `
  uniform sampler3D uMfShapeTex;
  uniform float uMfShapeMix;
  uniform float uMfShapeTile;
  float mfMixShape(float mfBase, vec2 mfXz) {
    if (uMfShapeMix < 0.001) return mfBase;
    float mfWindOff = uTime * uWind / max(uNoiseScale, 0.00001);
    vec2 mfUv = fract((mfXz - vec2(mfWindOff, 0.0)) / uMfShapeTile);
    float mfMask = texture(uMfShapeTex, vec3(mfUv, 0.5)).r;
    return mix(mfBase, mfMask, uMfShapeMix);
  }
`;

    // Crea una Data3DTexture con la clase real del juego (Data3DTexture),
    // accesible via el constructor de su textura de ruido.
    function makeShapeTexture(data, size) {
        const noiseTex = state.cloudsMesh?.material?.uniforms?.uNoiseTex?.value;
        if (!noiseTex || typeof noiseTex.constructor !== 'function') return null;
        try {
            const tex = new noiseTex.constructor(data, size, size, 1);
            tex.format = noiseTex.format;
            tex.type = noiseTex.type;
            tex.minFilter = noiseTex.minFilter;
            tex.magFilter = noiseTex.magFilter;
            tex.wrapS = noiseTex.wrapS;
            tex.wrapT = noiseTex.wrapT;
            tex.wrapR = noiseTex.wrapR;
            tex.unpackAlignment = 1;
            tex.needsUpdate = true;
            return tex;
        } catch (err) {
            console.warn(`${TAG} No se pudo crear la textura de forma:`, err);
            return null;
        }
    }

    // Parchea el fragment shader UNA sola vez. Si algún ancla del shader del
    // juego cambia (update del bundle), aborta sin romper el material.
    function ensureCloudsShapePatch(mat) {
        if (mat.__mfCloudShapePatched) return true;
        const orig = mat.fragmentShader;

        const anchor = 'float cloudShape(vec2 xz) {';
        if (!orig.includes(anchor) ||
            !orig.includes('return cloudFbm(q);') ||
            !orig.includes('smoothstep(uCoverage, uCoverage + 0.25, cloudFbm(q))') ||
            !orig.includes('smoothstep(uCoverage, uCoverage + 0.25, n)')) {
            console.warn(`${TAG} Shader de nubes no coincide con lo esperado; forma custom omitida.`);
            return false;
        }

        let frag = orig;
        frag = frag.replace(anchor, MF_SHAPE_GLSL + '\n' + anchor);
        // cloudShape (modo Fast)
        frag = frag.replace('return cloudFbm(q);', 'return mfMixShape(cloudFbm(q), xz);');
        // cloudDensity (modo Fancy)
        frag = frag.replace(
            'smoothstep(uCoverage, uCoverage + 0.25, cloudFbm(q))',
            'smoothstep(uCoverage, uCoverage + 0.25, mfMixShape(cloudFbm(q), p.xz))'
        );
        // cloudShadowDensity (auto-sombra del sol)
        frag = frag.replace(
            'smoothstep(uCoverage, uCoverage + 0.25, n)',
            'smoothstep(uCoverage, uCoverage + 0.25, mfMixShape(n, p.xz))'
        );

        // Placeholder negro (sin nube) mientras se decodifica el dibujo:
        // así el sampler nunca es null.
        const placeholder = makeShapeTexture(new Uint8Array(8 * 8), 8);
        if (!placeholder) return false;

        mat.__mfOriginalFragmentShader = orig;
        mat.fragmentShader = frag;
        mat.uniforms.uMfShapeTex = { value: placeholder };
        mat.uniforms.uMfShapeMix = { value: cloudsShape.mix };
        mat.uniforms.uMfShapeTile = { value: cloudsShape.tile };
        mat.needsUpdate = true;
        mat.__mfCloudShapePatched = true;
        return true;
    }

    // Decodifica un dataURL PNG → textura (canal R = máscara 0..255).
    function decodeShapeTexture(dataUrl, cb) {
        const img = new Image();
        img.onload = () => {
            try {
                const cv = document.createElement('canvas');
                cv.width = img.width;
                cv.height = img.height;
                const cx = cv.getContext('2d');
                cx.drawImage(img, 0, 0);
                const px = cx.getImageData(0, 0, cv.width, cv.height).data;
                const size = cv.width;
                const data = new Uint8Array(size * size);
                for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
                cb(makeShapeTexture(data, size));
            } catch (err) {
                console.warn(`${TAG} Error decodificando el dibujo:`, err);
                cb(null);
            }
        };
        img.onerror = () => cb(null);
        img.src = dataUrl;
    }

    function applyCloudsShapeToMesh() {
        const mesh = resolveClouds();
        if (!mesh) return false;
        const mat = mesh.material;
        if (!ensureCloudsShapePatch(mat)) return false;

        const dataUrl = localStorage.getItem(LS_SHAPE);
        if (dataUrl && cloudsShape.textureFor !== dataUrl) {
            decodeShapeTexture(dataUrl, (tex) => {
                if (!tex) return;
                cloudsShape.texture = tex;
                cloudsShape.textureFor = dataUrl;
                if (mat.uniforms.uMfShapeTex) mat.uniforms.uMfShapeTex.value = tex;
            });
        }
        if (mat.uniforms.uMfShapeMix) mat.uniforms.uMfShapeMix.value = cloudsShape.mix;
        if (mat.uniforms.uMfShapeTile) mat.uniforms.uMfShapeTile.value = cloudsShape.tile;
        return true;
    }

    function clearCloudsShape() {
        localStorage.removeItem(LS_SHAPE);
        let mesh = (state.cloudsMesh && state.cloudsMesh.parent) ? state.cloudsMesh : null;
        if (!mesh) mesh = resolveClouds();
        const mat = mesh?.material;
        if (mat?.__mfCloudShapePatched) {
            mat.fragmentShader = mat.__mfOriginalFragmentShader;
            delete mat.__mfOriginalFragmentShader;
            delete mat.uniforms.uMfShapeTex;
            delete mat.uniforms.uMfShapeMix;
            delete mat.uniforms.uMfShapeTile;
            mat.needsUpdate = true;
            mat.__mfCloudShapePatched = false;
        }
        cloudsShape.texture = null;
        cloudsShape.textureFor = null;
    }

    // ─── NUBES: texturas 3D reales del pack Photon ──────────────────────
    // CloudNoise_128_128_128.bin (RGBA, 128³, 8MB) reemplaza el ruido
    // procedural (uNoiseTex). El formato se deriva del tamaño real del
    // archivo: el pack usa RGBA en 128³; si un .bin viniera en RGB se
    // expande a RGBA (formato garantizado por Data3DTexture del juego).
    const LS_PACK_NOISE = 'miniblox_clouds_packnoise';

    const packNoise = {
        enabled: localStorage.getItem(LS_PACK_NOISE) === 'true',
        texture: null,
        loading: false,
        failed: false
    };

    function fetchPackTexture(file) {
        const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL
            ? chrome.runtime.getURL('assets/shadertextures/' + file)
            : null;
        if (!url) return Promise.resolve(null);
        return fetch(url)
            .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
            .then(buf => new Uint8Array(buf));
    }

    // Construye la Data3DTexture con la clase real del juego (misma clase
    // que su uNoiseTex), derivando el formato del conteo de bytes.
    function buildPack3DTexture(bytes, w, h, d) {
        const noiseTex = state.cloudsMesh?.material?.uniforms?.uNoiseTex?.value;
        if (!noiseTex || typeof noiseTex.constructor !== 'function') return null;
        const voxels = w * h * d;
        const bytesPerVoxel = bytes.length / voxels;
        let format, type;
        if (bytesPerVoxel === 4) {
            format = 1023;  // THREE.RGBAFormat
            type = 1009;    // THREE.UnsignedByteType
        } else if (bytesPerVoxel === 3) {
            // RGB → RGBA (Data3DTexture sólo soporta 1/2/4 canales)
            const rgba = new Uint8Array(voxels * 4);
            for (let i = 0; i < voxels; i++) {
                const s = i * 3, t = i * 4;
                rgba[t] = bytes[s];
                rgba[t + 1] = bytes[s + 1];
                rgba[t + 2] = bytes[s + 2];
                rgba[t + 3] = 255;
            }
            bytes = rgba;
            format = 1023;
            type = 1009;
        } else if (bytesPerVoxel === 1) {
            format = 1022;  // THREE.RedFormat
            type = 1009;
        } else {
            console.warn(`${TAG} Bytes por vóxel inesperados: ${bytesPerVoxel}`);
            return null;
        }
        try {
            const tex = new noiseTex.constructor(bytes, w, h, d);
            tex.format = format;
            tex.type = type;
            tex.minFilter = noiseTex.minFilter;
            tex.magFilter = noiseTex.magFilter;
            tex.wrapS = noiseTex.wrapS;
            tex.wrapT = noiseTex.wrapT;
            tex.wrapR = noiseTex.wrapR;
            tex.unpackAlignment = 1;
            tex.needsUpdate = true;
            return tex;
        } catch (err) {
            console.warn(`${TAG} Textura 3D del pack falló:`, err);
            return null;
        }
    }

    function applyPackNoiseToMesh() {
        if (!packNoise.enabled || !packNoise.texture) return false;
        const mesh = resolveClouds();
        if (!mesh) return false;
        const u = mesh.material?.uniforms;
        if (u?.uNoiseTex && packNoise.texture) {
            if (u.uNoiseTex.value !== packNoise.texture) {
                u.uNoiseTex.value = packNoise.texture;
                console.log(`${TAG} ✓ Ruido de nubes del pack aplicado (128³ RGBA).`);
            }
            return true;
        }
        return false;
    }

    function setPackNoise(enabled) {
        packNoise.enabled = !!enabled;
        localStorage.setItem(LS_PACK_NOISE, String(packNoise.enabled));

        if (packNoise.enabled && !packNoise.texture && !packNoise.loading && !packNoise.failed) {
            packNoise.loading = true;
            fetchPackTexture('CloudNoise_128_128_128.bin')
                .then(bytes => {
                    packNoise.texture = bytes
                        ? buildPack3DTexture(bytes, 128, 128, 128)
                        : null;
                    packNoise.failed = packNoise.texture === null;
                })
                .catch(() => { packNoise.failed = true; })
                .finally(() => {
                    packNoise.loading = false;
                    applyPackNoiseToMesh();
                });
        } else if (packNoise.enabled && packNoise.texture) {
            applyPackNoiseToMesh();
        } else if (!packNoise.enabled && packNoise.texture) {
            // Desactivado: marcar needsUpdate no basta si el material fue
            // recreado por el juego; el sampler seguirá con nuestra textura
            // hasta que el usuario recargue. Aceptable para un toggle.
            const mesh = resolveClouds();
            const u = mesh?.material?.uniforms;
            if (u?.uNoiseTex) u.uNoiseTex.value.needsUpdate = true;
        }
    }

    // cfg: { dataUrl: string|null|undefined, mix, tile }
    //   string  → aplicar ese dibujo
    //   null    → quitar la forma (restaura shader original)
    //   undefined → no tocar la forma (solo mix/tile)
    function handleCloudsShape(cfg) {
        if (cfg.dataUrl === null) {
            clearCloudsShape();
            return;
        }
        if (cfg.dataUrl) localStorage.setItem(LS_SHAPE, cfg.dataUrl);
        if (cfg.mix !== undefined) {
            cloudsShape.mix = Math.max(0, Math.min(1, parseFloat(cfg.mix) || 0));
            localStorage.setItem(LS_SHAPE_MIX, String(cloudsShape.mix));
        }
        if (cfg.tile !== undefined) {
            cloudsShape.tile = Math.max(64, Math.min(4000, parseFloat(cfg.tile) || 512));
            localStorage.setItem(LS_SHAPE_TILE, String(cloudsShape.tile));
        }
        if (!localStorage.getItem(LS_SHAPE)) return;

        if (!applyCloudsShapeToMesh()) {
            const retry = setInterval(() => {
                if (!localStorage.getItem(LS_SHAPE)) { clearInterval(retry); return; }
                if (applyCloudsShapeToMesh()) clearInterval(retry);
            }, 2000);
            setTimeout(() => clearInterval(retry), 60000);
        }
    }

    // cfg: { coverage, scale, wind, thickness, height, opacity } — undefined = no tocar
    function applyClouds(cfg) {
        const mesh = resolveClouds();
        if (!mesh) {
            console.warn(`${TAG} Mesh de nubes no encontrado.`);
            return false;
        }
        const u = mesh.material.uniforms;
        if (cfg.coverage !== undefined) u.uCoverage.value = Math.max(0, Math.min(1, cfg.coverage));
        if (cfg.scale !== undefined) u.uNoiseScale.value = Math.max(0.001, Math.min(0.1, cfg.scale));
        if (cfg.wind !== undefined) u.uWind.value = Math.max(0, Math.min(0.5, cfg.wind));
        if (cfg.thickness !== undefined) u.uThickness.value = Math.max(1, Math.min(200, cfg.thickness));
        if (cfg.height !== undefined) u.uCloudY.value = Math.max(0, Math.min(500, cfg.height));
        if (cfg.opacity !== undefined) u.uOpacity.value = Math.max(0, Math.min(1, cfg.opacity));
        return true;
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

            // Cualquier objeto con material sirve (Mesh, Sprite, Points,
            // sky domes custom). El filtro isMesh dejaba el cielo fuera.
            if (obj.material) {
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

    // â”€â”€â”€ InyecciÃ³n GLSL: insertar antes del cierre de main() â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Busca el Ãºltimo "}" del shader (que cierra main) e inserta el cÃ³digo
    // justo antes. Esto mantiene intacto el main original y funciona con
    // cualquier material de Three.js.
    function injectBeforeMainEnd(src, code) {
        // Encontrar el Ãºltimo cierre de llave (fin de main)
        const lastBrace = src.lastIndexOf('}');
        if (lastBrace < 0) return src;

        return src.slice(0, lastBrace) +
               '\n' + code + '\n' +
               src.slice(lastBrace);
    }

    // â”€â”€â”€ Hookear onBeforeCompile de un material â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function hookMaterial(material) {
        if (state.hooked.has(material)) return false;
        if (typeof material.onBeforeCompile !== 'function') return false;

        const preset = PRESETS[state.preset];
        if (!preset) return false;

        // Solo hookear materiales de geometrÃ­a estÃ¡ndar de Three.js.
        // Los ShaderMaterial de post-procesado (bloom, HDR, agua, cielo) no
        // comparten las varyings/#include estÃ¡ndar y romperÃ­an la compilaciÃ³n.
        const matType = material.type || material.constructor?.name || '';
        const SAFE_MATERIALS = [
            'MeshLambertMaterial', 'MeshStandardMaterial', 'MeshBasicMaterial',
            'MeshPhongMaterial', 'MeshToonMaterial', 'MeshNormalMaterial',
            'PointsMaterial', 'LineBasicMaterial'
        ];
        if (!SAFE_MATERIALS.includes(matType)) return false;

        // ── Desenredar hooks de una sesión anterior de la extensión ──
        // Recargar la extensión sin F5 deja materiales hookeados: nuestro
        // hook nuevo capturaría el viejo como "original" y las uniforms
        // se inyectarían DOS veces (redefinition → link fail).
        if (material.__mfHooked) {
            // Restaurar el onBeforeCompile ORIGINAL del juego guardado
            // por la sesión previa y limpiar la marca.
            material.onBeforeCompile = material.__mfOriginalOnBeforeCompile || material.onBeforeCompile;
            if (material.__mfOriginalCacheKey !== undefined) {
                material.customProgramCacheKey = material.__mfOriginalCacheKey;
            }
            delete material.__mfHooked;
        }

        const originalOnBeforeCompile = material.onBeforeCompile.bind(material);
        const originalCacheKey = material.customProgramCacheKey;

        const liveUniforms = {};
        // Mapa inverso uniform → nombre GUI (para restaurar valores guardados)
        const lsNameByUniform = {};
        for (const [fxName, def] of Object.entries(EFFECT_DEFS)) {
            if (preset.uniforms[def.key]) lsNameByUniform[def.key] = fxName;
        }
        for (const key in preset.uniforms) {
            let initial = preset.uniforms[key].value;
            // Restaurar valores de sub-efectos persistidos
            const fxName = lsNameByUniform[key];
            if (fxName) {
                const saved = parseFloat(localStorage.getItem('miniblox_customshader_fx_' + fxName));
                if (!isNaN(saved)) initial = Math.min(EFFECT_DEFS[fxName].max, saved);
            }
            liveUniforms[key] = { value: initial };
        }

        material.onBeforeCompile = function (shader) {
            // 1. Llamar al onBeforeCompile original del juego (GI, wind, etc.)
            originalOnBeforeCompile(shader);

            // 2. Inyectar uniforms
            for (const key in liveUniforms) {
                shader.uniforms[key] = liveUniforms[key];
            }

            // 3. Vertex: prepend declaraciones — solo si no hay inyección
            // previa de otra sesión de la extensión (evita redefinition).
            // La marca es una varying única que TODO preset declara primero.
            if (preset.vertexCode && !shader.vertexShader.includes('uPhTime') &&
                !shader.vertexShader.includes('uCsTime') &&
                !shader.vertexShader.includes('mfCrDepth') &&
                !shader.vertexShader.includes('uGvTime')) {
                shader.vertexShader = preset.vertexCode + '\n' + shader.vertexShader;
            }

            // 4. Vertex shader: inyectar lÃ³gica tras begin_vertex.
            // Solo si existe el include (garantiza que 'transformed' existe).
            if (preset.vertexMain && shader.vertexShader.includes('#include <begin_vertex>') &&
                !shader.vertexShader.includes('mfCrMvPos =') &&
                !shader.vertexShader.includes('mfPhDepth =') &&
                !shader.vertexShader.includes('mfGvDepth =')) {
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    '#include <begin_vertex>\n' + preset.vertexMain
                );
            }

            // 5. Fragment: prepend declaraciones — solo si no hay inyección
            // previa (la marca es un identificador único de cada preset)
            if (preset.fragmentCode && !shader.fragmentShader.includes('mfPhHash') &&
                !shader.fragmentShader.includes('mfHash') &&
                !shader.fragmentShader.includes('mfCrGetLuminance') &&
                !shader.fragmentShader.includes('mfUfHash') &&
                !shader.fragmentShader.includes('mfXrayColor') &&
                !shader.fragmentShader.includes('mfGvHash')) {
                shader.fragmentShader = preset.fragmentCode + '\n' + shader.fragmentShader;
            }

            // 6. Fragment shader: inyectar postMain antes del cierre de main()
            // Guarda idempotente: el marcador local evita doble inyección si
            // una sesión anterior de la extensión ya inyectó su postMain.
            if (preset.postMain && !shader.fragmentShader.includes('mfPostMainInjected')) {
                shader.fragmentShader = injectBeforeMainEnd(
                    shader.fragmentShader,
                    'float mfPostMainInjected = 1.0;\n' + preset.postMain
                );
            }
        };

        // Marca de hookeado + originales: si se recarga la extensión sin
        // F5, la sesión nueva restaura el ORIGINAL DEL JUEGO (no nuestro
        // hook viejo) — evita inyectar el preset dos veces
        material.__mfHooked = true;
        material.__mfOriginalOnBeforeCompile = originalOnBeforeCompile;
        material.__mfOriginalCacheKey = originalCacheKey;

        material.customProgramCacheKey = function () {
            const base = originalCacheKey ? originalCacheKey.call(material) : '';
            // La versión del preset invalida el caché de programas de
            // Three.js: al cambiar el GLSL del preset (tweaks), la clave
            // cambia y fuerza recompilación en vez de reusar el viejo.
            return 'mfcs_' + state.preset + '_v' + (preset.version || 1) + '_' + base;
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

    // â”€â”€â”€ Loop de animaciÃ³n de uniforms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let lastTime = performance.now();
    let rafId = null;

    function animate() {
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        // Resolución real del canvas (para CRT/VHS a pantalla completa)
        let resX = 0, resY = 0;
        const dom = state.renderer?.domElement;
        if (dom) {
            resX = dom.width || dom.clientWidth || 0;
            resY = dom.height || dom.clientHeight || 0;
        }

        for (const [, entry] of state.hooked) {
            try {
                if (resX > 0 && entry.liveUniforms.uCsResolution) {
                    entry.liveUniforms.uCsResolution.value[0] = resX;
                    entry.liveUniforms.uCsResolution.value[1] = resY;
                }
                if (resX > 0 && entry.liveUniforms.uPhResolution) {
                    entry.liveUniforms.uPhResolution.value[0] = resX;
                    entry.liveUniforms.uPhResolution.value[1] = resY;
                }
                if (resX > 0 && entry.liveUniforms.uCrResolution) {
                    entry.liveUniforms.uCrResolution.value[0] = resX;
                    entry.liveUniforms.uCrResolution.value[1] = resY;
                }
                entry.update(entry.liveUniforms, dt);
            } catch (_) {}
        }

        rafId = requestAnimationFrame(animate);
    }

    // â”€â”€â”€ Escanear y aplicar hooks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function scan() {
        if (!state.enabled) return;

        if (!state.game) {
            state.game = findGame();
            if (!state.game) return;
        }

        const scene = getScene(state.game);
        if (!scene) return;
        state.scene = scene;

        // Recolectar de la escena Y de la cámara (el skybox de Miniblox
        // puede colgar de la cámara en vez de la escena).
        const meshes = collectMeshes(scene);
        const cam = state.camera || state.game?.camera ||
            state.game?.gameScene?.camera;
        if (cam) {
            for (const extra of collectMeshes(cam)) {
                if (!meshes.includes(extra)) meshes.push(extra);
            }
        }
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
            console.log(`${TAG} âœ“ ${hooked} materiales hookeados (preset: ${state.preset}).`);
            if (!rafId) {
                lastTime = performance.now();
                animate();
            }
        }

        // Re-aplicar la forma de nubes dibujada si el juego recreó el mesh
        // (p.ej. al cambiar de mundo). Barato si ya está parcheado.
        if (localStorage.getItem(LS_SHAPE)) {
            try { applyCloudsShapeToMesh(); } catch (_) {}
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

    // â”€â”€â”€ API pÃºblica â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        // Sub-controles de presets. name ∈ vhs|crt|cel|fog|grain|glitch|
        // flash|sharp|ufsat|ufcontrast|uftone (solo aplica si el uniform
        // existe en el preset activo)
        setEffect(name, val) {
            const def = EFFECT_DEFS[name];
            if (!def) {
                console.warn(`${TAG} Efecto desconocido: ${name}`);
                return;
            }
            const value = Math.max(0, Math.min(def.max, parseFloat(val) || 0));
            let applied = false;
            for (const [, entry] of state.hooked) {
                if (entry.liveUniforms[def.key]) {
                    entry.liveUniforms[def.key].value = value;
                    applied = true;
                }
            }
            // Uniforms de otros presets (ej. sliders VHS al usar Complementary)
            // son esperados: no loguear warning.
            if (!applied) return;
            // Persistir para restaurarlo al recargar
            localStorage.setItem('miniblox_customshader_fx_' + name, String(value));
        },
        getEffect(name) {
            const def = EFFECT_DEFS[name];
            if (!def) return null;
            for (const [, entry] of state.hooked) {
                if (entry.liveUniforms[def.key]) return entry.liveUniforms[def.key].value;
            }
            const fallbackDefault = PRESETS[state.preset]?.uniforms?.[def.key]?.value;
            return parseFloat(localStorage.getItem('miniblox_customshader_fx_' + name) ?? String(fallbackDefault ?? 0));
        },
        setRenderScale(val) {
            const clamped = Math.max(0.5, Math.min(1.0, parseFloat(val) || 1.0));
            localStorage.setItem('miniblox_customshader_renderscale', String(clamped));
            applyRenderScale(clamped);
        },
        // Nubes: cfg con { coverage, scale, wind, thickness, height, opacity }
        setClouds(cfg) {
            return applyClouds(cfg || {});
        },
        // Forma custom por dibujo: { dataUrl, mix, tile } — dataUrl: string
        // (aplicar) | null (quitar) | undefined (solo ajustar mix/tile)
        setCloudsShape(cfg) {
            handleCloudsShape(cfg || {});
        },
        getCloudsShape() {
            return {
                active: !!localStorage.getItem(LS_SHAPE),
                mix: cloudsShape.mix,
                tile: cloudsShape.tile
            };
        },
        getClouds() {
            const mesh = resolveClouds();
            if (!mesh) return null;
            const u = mesh.material.uniforms;
            return {
                coverage: u.uCoverage.value,
                scale: u.uNoiseScale.value,
                wind: u.uWind.value,
                thickness: u.uThickness.value,
                height: u.uCloudY.value,
                opacity: u.uOpacity.value
            };
        },
        listPresets() {
            return Object.keys(PRESETS);
        },
        getState() {
            return {
                enabled: state.enabled,
                preset: state.preset,
                strength: state.strength,
                renderScale: state.renderScale,
                hookedCount: state.hooked.size
            };
        }
    };

    // â”€â”€â”€ Eventos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // Orden correcto: actualizar estado ANTES de escanear/hookear,
        // asÃ­ enable() ya usa el preset/strength nuevos.
        let needsRescan = false;

        if (cfg.preset && PRESETS[cfg.preset] && cfg.preset !== state.preset) {
            state.preset = cfg.preset;
            localStorage.setItem('miniblox_customshader_preset', cfg.preset);
            // Si ya hay materiales hookeados, hay que rehacerlos con el nuevo preset
            if (state.hooked.size > 0) {
                disable();
                needsRescan = true;
            }
        }

        if (cfg.strength !== undefined) {
            state.strength = Math.max(0, Math.min(1, parseFloat(cfg.strength) || 0));
            localStorage.setItem('miniblox_customshader_strength', String(state.strength));
            // Los updates de cada frame ya leen state.strength, no hace falta re-scan
        }

        // Render scale es independiente del preset: funciona siempre que
        // el mÃ³dulo estÃ© activo (modo DLSS-style: bajar resoluciÃ³n + afilar)
        if (cfg.renderScale !== undefined) {
            state.renderScale = Math.max(0.5, Math.min(1.0, parseFloat(cfg.renderScale) || 1.0));
            localStorage.setItem('miniblox_customshader_renderscale', String(state.renderScale));
            applyRenderScale(state.renderScale);
        }

        // Sub-efectos configurables del preset (vhs, crt, cel, fog, grain, glitch, flash, sharp)
        if (cfg.effects && typeof cfg.effects === 'object') {
            for (const [fxName, fxVal] of Object.entries(cfg.effects)) {
                window.MF_CustomShader.setEffect(fxName, fxVal);
            }
        }

        // Nubes: forma y comportamiento del cielo
        if (cfg.clouds && typeof cfg.clouds === 'object') {
            const pending = () => applyClouds(cfg.clouds);
            if (!pending()) {
                // El mesh de nubes puede no existir aún: reintentar al escanear
                const retry = setInterval(() => {
                    if (applyClouds(cfg.clouds) || !state.enabled) clearInterval(retry);
                }, 2000);
                setTimeout(() => clearInterval(retry), 60000);
            }
        }

        // Nubes: forma custom por dibujo (máscara)
        if (cfg.cloudsShape && typeof cfg.cloudsShape === 'object') {
            handleCloudsShape(cfg.cloudsShape);
        }

        // Nubes: ruido 3D del pack Photon (CloudNoise 128³)
        if (cfg.cloudsPackNoise !== undefined) {
            setPackNoise(!!cfg.cloudsPackNoise);
        }

        // PostFX: pass full-screen (bloom, aberración cromática, DOF, dirt)
        if (cfg.postfx && typeof cfg.postfx === 'object') {
            setPostFx(cfg.postfx);
        }

        if (typeof cfg.enabled === 'boolean') {
            if (cfg.enabled) {
                state.enabled = true;
                localStorage.setItem('miniblox_customshader', 'true');
                scan();
                // Aplicar render scale pendiente si viene de un arranque con settings guardados
                if (state.renderScale < 1.0) {
                    setTimeout(() => applyRenderScale(state.renderScale), 500);
                }
            } else {
                // Al desactivar, restaurar resolución nativa + apagar PostFX
                if (state.renderScale < 1.0) applyRenderScale(1.0);
                postfx.enabled = false;
                window.MF_CustomShader.disable();
                return;
            }
        }

        if (needsRescan) {
            setTimeout(scan, 100);
        }
    });

    // â”€â”€â”€ Bucle de escaneo periÃ³dico â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    state.scanTimer = setInterval(() => {
        if (!state.enabled) return; // no cancelar: se reanuda al reactivar

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

    // ─── Diagnóstico de link GLSL ─────────────────────────────────────
    // El build de producción del juego desactiva checkShaderErrors de
    // Three.js, así que un programa que falla al linkear NO se loguea:
    // solo explota después como "useProgram: program not valid" (×256).
    // Este hook revela el error real de compilación/link la primera vez.
    (function installLinkDiagnostic() {
        if (window.__MF_LINK_DIAG__) return;
        window.__MF_LINK_DIAG__ = true;
        const proto = WebGL2RenderingContext?.prototype || WebGLRenderingContext.prototype;

        // Mapa shader → fuente (para poder volcar el GLSL que falla)
        const shaderSources = new WeakMap();

        const origShaderSource = proto.shaderSource;
        proto.shaderSource = function (shader, source) {
            try { shaderSources.set(shader, source); } catch (_) {}
            return origShaderSource.call(this, shader, source);
        };

        const origCompile = proto.compileShader;
        proto.compileShader = function (shader) {
            origCompile.call(this, shader);
            if (this.getShaderParameter(shader, this.COMPILE_STATUS)) return;
            try {
                const log = this.getShaderInfoLog(shader) || 'sin log';
                const src = shaderSources.get(shader) || '';
                // Marcar las líneas para ubicar el error citado en el log
                const numbered = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
                console.error('[MiniFeather] Shader falló al COMPILAR. Log:', log,
                    '\n— Fuente numerada —\n', numbered.slice(0, 4000));
            } catch (_) {}
        };

        const origLink = proto.linkProgram;
        proto.linkProgram = function (program) {
            origLink.call(this, program);
            try {
                if (!this.getProgramParameter(program, this.LINK_STATUS)) {
                    const info = this.getProgramInfoLog(program) || 'sin log';
                    console.error('[MiniFeather] Programa GLSL falló al linkear:', info);
                }
            } catch (_) {}
        };
    })();

    if (state.enabled) {
        setTimeout(scan, 3000);
        // Restaurar forma de nubes dibujada guardada (si el mesh tarda en
        // existir, el reintento interno lo aplica luego)
        if (localStorage.getItem(LS_SHAPE)) {
            setTimeout(() => handleCloudsShape({}), 4000);
        }
        console.log(`${TAG} Sistema iniciado. Preset: ${state.preset}, Strength: ${state.strength}`);
    }
})();
