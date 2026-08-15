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
        }
    };

    // â”€â”€â”€â”€â”€â”€ DefiniciÃ³n de sub-efectos persistibles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Compartido por presets: nombre de la GUI â†’ uniform + lÃ­mite.
    const EFFECT_DEFS = {
        vhs: { key: 'uCsVhs', max: 1 },
        crt: { key: 'uCsCrt', max: 1 },
        cel: { key: 'uCsCel', max: 1 },
        fog: { key: 'uCsFog', max: 1 },
        grain: { key: 'uCsGrain', max: 1 },
        glitch: { key: 'uCsGlitch', max: 1 },
        flash: { key: 'uCsFlash', max: 1 },
        sharp: { key: 'uCsSharp', max: 1 },
        ufsat: { key: 'uUfSat', max: 2 },
        ufcontrast: { key: 'uUfContrast', max: 1 },
        uftone: { key: 'uUfTone', max: 1 },
        phagx: { key: 'uPhAgx', max: 1 },
        phfog: { key: 'uPhFog', max: 1 },
        phend: { key: 'uPhEnd', max: 1 },
        phbh: { key: 'uPhBH', max: 1 },
        phbhsize: { key: 'uPhBHSize', max: 1 },
        phbhspin: { key: 'uPhBHSpin', max: 3 }
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
            } catch (_) { }
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
                } catch (_) { }
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
        const game = state.game || findGame();
        if (!game) return false;

        const renderer = resolveRenderer(game);
        if (!renderer) {
            console.warn(`${TAG} WebGLRenderer no encontrado para render scale.`);
            return false;
        }

        const clamped = Math.max(0.5, Math.min(1.0, parseFloat(scale) || 1.0));

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
        } catch (_) { }

        state.renderScale = clamped;
        return true;
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

            // 3. Vertex shader: prependar declaraciones
            if (preset.vertexCode) {
                shader.vertexShader = preset.vertexCode + '\n' + shader.vertexShader;
            }

            // 4. Vertex shader: inyectar lÃ³gica tras begin_vertex.
            // Solo si existe el include (garantiza que 'transformed' existe).
            if (preset.vertexMain && shader.vertexShader.includes('#include <begin_vertex>')) {
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    '#include <begin_vertex>\n' + preset.vertexMain
                );
            }

            // 5. Fragment shader: prependar declaraciones
            if (preset.fragmentCode) {
                shader.fragmentShader = preset.fragmentCode + '\n' + shader.fragmentShader;
            }

            // 6. Fragment shader: inyectar postMain antes del cierre de main()
            if (preset.postMain) {
                shader.fragmentShader = injectBeforeMainEnd(shader.fragmentShader, preset.postMain);
            }
        };

        material.customProgramCacheKey = function () {
            const base = originalCacheKey ? originalCacheKey.call(material) : '';
            return 'mfcs_' + state.preset + '_' + base;
        };

        material.needsUpdate = true;

        // Callback del preset (ej: xray necesita transparent=true)
        if (preset.onHook) {
            try { preset.onHook(material); } catch (_) { }
        }

        state.hooked.set(material, {
            liveUniforms,
            originalOnBeforeCompile,
            originalCacheKey,
            update: preset.update || (() => { }),
            onUnhook: preset.onUnhook || null
        });

        return true;
    }

    function unhookMaterial(material) {
        const entry = state.hooked.get(material);
        if (!entry) return;

        // Restaurar propiedades del material modificadas por onHook
        if (entry.onUnhook) {
            try { entry.onUnhook(material); } catch (_) { }
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
                entry.update(entry.liveUniforms, dt);
            } catch (_) { }
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
            console.log(`${TAG} âœ“ ${hooked} materiales hookeados (preset: ${state.preset}).`);
            if (!rafId) {
                lastTime = performance.now();
                animate();
            }
        }

        // Re-aplicar la forma de nubes dibujada si el juego recreó el mesh
        // (p.ej. al cambiar de mundo). Barato si ya está parcheado.
        if (localStorage.getItem(LS_SHAPE)) {
            try { applyCloudsShapeToMesh(); } catch (_) { }
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
            if (!applied) {
                console.warn(`${TAG} El uniform ${def.key} no existe en el preset ${state.preset}.`);
            }
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
                // Al desactivar, restaurar resoluciÃ³n nativa
                if (state.renderScale < 1.0) applyRenderScale(1.0);
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
