#version 330

uniform sampler2D MainSampler;
uniform sampler2D MainDepthSampler;
uniform sampler2D HistorySampler;
uniform sampler2D RbLensWideSampler;
uniform sampler2D RbLensHaloSampler;
uniform sampler2D RbLensDotASampler;
uniform sampler2D RbLensDotBSampler;
uniform sampler2D RbLensDotCSampler;
uniform sampler2D RbLensVerticalASampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 MainSize;
    vec2 MainDepthSize;
    vec2 HistorySize;
    vec2 RbLensWideSize;
    vec2 RbLensHaloSize;
    vec2 RbLensDotASize;
    vec2 RbLensDotBSize;
    vec2 RbLensDotCSize;
    vec2 RbLensVerticalASize;
};

layout(std140) uniform ExperimentalConfig {
    float Saturation;
    float Vibrance;
    float Contrast;
    float Warmth;
    float Lift;
    float Gain;
    float HeatEnabled;
    float HeatStrength;
    float HeatScale;
    float HeatSpeed;
    float HeatDistance;
    float HeatSourceBias;
    float HeatDepthFade;
    float HeatDimensionMultiplier;
    float Time;
    float Rain;
    float DayFactor;
    float TwilightFactor;
    float DimensionId;
    float NearPlane;
    float FarPlane;
    float HeatMode;
    float HeatShimmerIntensity;
    float HeatShimmerSpeed;
    float HeatShimmerFrequency;
    float HeatShimmerMinDistance;
    float HeatShimmerMaxDistance;
    float HeatShimmerVerticalScale;
    float HeatShimmerTime;
    float HeatShimmerAmplitude;
    float HeatShimmerHorizontalScale;
    float HeatShimmerDetail;
    float HeatShimmerBlend;
    float HeatCameraAnchorX;

    float ReservedAtmosphere0;
    float ReservedAtmosphere1;
    float ReservedAtmosphere2;
    float ReservedAtmosphere3;
    float ReservedAtmosphere4;
    float ReservedAtmosphere5;
    float BiomeFogEnabled;
    float BiomeFogDensity;
    float BiomeFogStart;
    float BiomeFogEnd;
    float BiomeFogColorBias;
    float BiomeFogBlend;
    float SkyEnabled;
    float SkyIntensity;
    float SkyHorizon;
    float SkyZenith;
    float SkyNight;
    float SkyWarmth;
    float GradientEnabled;
    float GradientIntensity;
    float GradientCurve;
    float GradientTilt;
    float GradientDither;
    float GradientSkyReach;
    float GradientNightSkyReach;
    float GradientSoftness;
    float CloudLayerEnabled;
    float CloudStyle;
    float CloudOpacity;
    float CloudScale;
    float CloudSpeed;
    float CloudNightDarkening;
    float CloudFogMix;
    float WorldBiomeFogColorR;
    float WorldBiomeFogColorG;
    float WorldBiomeFogColorB;
    float WorldBiomeSkyHorizonColorR;
    float WorldBiomeSkyHorizonColorG;
    float WorldBiomeSkyHorizonColorB;
    float WorldBiomeSkyZenithColorR;
    float WorldBiomeSkyZenithColorG;
    float WorldBiomeSkyZenithColorB;
    float WorldBiomeSkyTwilightSunColorR;
    float WorldBiomeSkyTwilightSunColorG;
    float WorldBiomeSkyTwilightSunColorB;
    float WorldBiomeSkyTwilightZenithColorR;
    float WorldBiomeSkyTwilightZenithColorG;
    float WorldBiomeSkyTwilightZenithColorB;
    float WorldBiomeSkyTwilightMoonColorR;
    float WorldBiomeSkyTwilightMoonColorG;
    float WorldBiomeSkyTwilightMoonColorB;
    float WorldBiomeGradientTopColorR;
    float WorldBiomeGradientTopColorG;
    float WorldBiomeGradientTopColorB;
    float WorldBiomeGradientBottomColorR;
    float WorldBiomeGradientBottomColorG;
    float WorldBiomeGradientBottomColorB;
    float WorldBiomeSkyIntensityScale;
    float WorldBiomeGradientIntensityScale;

    // Retained only to preserve the established std140 layout for following fields.
    float RetiredPostPadding0;
    float RetiredPostPadding1;
    float RetiredPostPadding2;

    float WetWeatherEnabled;
    float WetWeatherSpecularBoost;
    float WetWeatherBloomBoost;

    float UnderwaterPolishEnabled;
    float UnderwaterCausticStrength;
    float UnderwaterColorRolloff;
    float UnderwaterFlag;

    float GodRaysEnabled;
    float GodRaysStrength;
    float GodRaysDecay;
    float GodRaysSamples;
    float GodRaysExposure;
    float GodRaysDensity;
    float GodRaysWeight;
    float GodRaysSunSize;
    float GodRaysSunGlow;
    float GodRaysTransitionDegrees;
    float GodRaysMoonStrength;
    float GodRaysRainCutoff;

    // Retired standalone temporal-filter slots. Kept as padding so following
    // camera-effect uniforms retain their established layout.
    float RetiredTemporalPadding0;
    float RetiredTemporalPadding1;
    float RetiredTemporalPadding2;

    float DepthOfFieldEnabled;
    float DepthOfFieldIntensity;
    float DepthOfFieldSamples;
    float DepthOfFieldAutoFocus;
    float DepthOfFieldBlurWithoutTarget;
    float DepthOfFieldFocusDistance;
    float DepthOfFieldFocusRange;
    float DepthOfFieldMaxBlur;
    float DepthOfFieldHitFocusDistance;
    float DepthOfFieldFade;

	float ReservedCameraEffect0;
	float ReservedCameraEffect1;
	float ReservedCameraEffect2;
	float ReservedCameraEffect3;
	float ReservedCameraEffect4;
	float ReservedCameraEffect5;
	float ReservedCameraEffect6;
	float ReservedCameraEffect7;
	float ReservedCameraEffect8;

    float CameraNoiseEnabled;
    float CameraNoiseIntensity;
    float CameraNoiseSize;
    float CameraNoiseSpeed;
    float CameraNoiseColor;

    float MotionBlurEnabled;
    float MotionBlurStrength;
    float MotionBlurSamples;
    float MotionBlurMaxRadius;
    float MotionBlurVectorX;
    float MotionBlurVectorY;
    float LayeredAtmosphereEnabled;
    float LayeredAtmosphereStrength;
    float LayeredAtmosphereStartDistance;
    float LayeredAtmosphereLayerSpacing;
    float LayeredAtmosphereMaxDistance;
    float LayeredAtmosphereNearStrength;
    float LayeredAtmosphereMidStrength;
    float LayeredAtmosphereFarStrength;
    float LayeredAtmosphereNearScale;
    float LayeredAtmosphereMidScale;
    float LayeredAtmosphereFarScale;
    float LayeredAtmosphereSpeed;
    float LayeredAtmosphereHorizontal;
    float LayeredAtmosphereDetail;
    float LayeredAtmosphereBlend;
    float LayeredAtmosphereMirageStrength;
    float LayeredAtmosphereMirageHorizon;
    float LayeredAtmosphereMirageFade;
    float LayeredAtmosphereCameraAnchorX;
    float ColdRefractionEnabled;
    float ColdRefractionStrength;
    float ColdRefractionScale;
    float ColdRefractionSpeed;
    float ColdRefractionStartDistance;
    float ColdRefractionMaxDistance;
    float ColdRefractionHorizontal;
    float ColdRefractionSharpness;
    float ColdRefractionDetail;
    float ColdRefractionBlend;
    float ColdRefractionSnowMultiplier;
    float ColdRefractionNightMultiplier;
    float ColdRefractionCameraAnchorX;
    float ChromaticRefractionEnabled;
    float ChromaticRefractionStrength;
    float ChromaticRefractionSeparation;
    float ChromaticRefractionScale;
    float ChromaticRefractionSpeed;
    float ChromaticRefractionStartDistance;
    float ChromaticRefractionMaxDistance;
    float ChromaticRefractionHorizontal;
    float ChromaticRefractionDetail;
    float ChromaticRefractionBlend;
    float ChromaticRefractionCameraAnchorX;
    float ChromaticRefractionCrestsEnabled;
    float ChromaticRefractionCrestThreshold;
    float ChromaticRefractionCrestSoftness;
    float ChromaticRefractionCrestSeparation;
    float ChromaticRefractionLensEnabled;
    float ChromaticRefractionLensStrength;
    float ChromaticRefractionLensScale;
    float ChromaticRefractionScintillationEnabled;
    float ChromaticRefractionScintillationStrength;
    float ChromaticRefractionScintillationSpeed;
    float ChromaticRefractionEndFlashAmount;
    float ChromaticRefractionEndFlashStrengthMultiplier;
    float ChromaticRefractionEndFlashSeparationMultiplier;
    float ChromaticRefractionEndFlashBlendMultiplier;
    float PsychedelicRefractionEnabled;
    float PsychedelicRefractionStrength;
    float PsychedelicRefractionScale;
    float PsychedelicRefractionSpeed;
    float PsychedelicRefractionStartDistance;
    float PsychedelicRefractionMaxDistance;
    float PsychedelicRefractionHorizontal;
    float PsychedelicRefractionDetail;
    float PsychedelicRefractionBlend;
    float PsychedelicRefractionPeripheral;
    float PsychedelicRefractionCameraAnchorX;
    float PsychedelicRefractionCameraAnchorY;
    float PsychedelicAfterimageEnabled;
    float PsychedelicAfterimageStrength;
    float PsychedelicAfterimageIntervalSeconds;
    float PsychedelicAfterimageDurationSeconds;
    float PsychedelicAfterimageChance;
    float PsychedelicAfterimageOffsetPixels;
    float PsychedelicAfterimageColorSplit;
    float PsychedelicAfterimagePulse;
    float LowLightDesaturationEnabled;
    float LowLightDesaturationStrength;
    float LowLightDesaturationStart;
    float LowLightDesaturationFull;
    float LowLightDesaturationCurve;
    float LowLightSaturationFloor;
    float LowLightDesaturationAffectSky;
	float AdaptivePaletteDitherStyle;
	vec4 AdaptivePaletteSettings;
	vec4 AdaptivePaletteColors[32];
	vec4 VignetteShape;
	vec4 VignettePlacement;
	vec4 VignetteColorBorder;
	vec4 ColorGradeBasic0;
	vec4 ColorGradeBasic1;
	vec4 ColorGradeBasic2;
	vec4 ColorGradeBasic3;
	vec4 ColorGradeShadow;
	vec4 ColorGradeMidtone;
	vec4 ColorGradeHighlight;
	vec4 ColorGradeToneLuminance;
	vec4 ColorGradeAdvanced;
	vec4 ColorGradeRolloff;
};

layout(std140) uniform GroundFogConfig {
    float GroundFogEnabled;
    float GroundFogDayR;
    float GroundFogDayG;
    float GroundFogDayB;
    float GroundFogNightR;
    float GroundFogNightG;
    float GroundFogNightB;
    float GroundFogOpacity;
    float GroundFogDensity;
    float GroundFogStartDistance;
    float GroundFogEndDistance;
    float GroundFogVerticalOffset;
    float GroundFogThickness;
    float GroundFogEdgeSoftness;
    float GroundFogForwardY;
    float GroundFogUpY;
    float GroundFogLeftY;
    float GroundFogTanHalfFov;
    float GroundFogHeightLagOffset;
    float GroundFogPadding1;
};

layout(std140) uniform GodRayGlobals {
    vec4 GodRaySunLight;
    vec4 GodRayMoonLight;
    vec4 GodRaySceneData;
    vec4 GodRaySunColor;
};

layout(std140) uniform LensFlareConfig {
    float LensFlareBrightness;
    float LensFlareSaturation;
    float LensFlareHueShift;
    float LensFlareSize;
    float LensFlareEdgeFade;
    float LensFlareGhostSpread;
    float LensFlareOpacity;
	float LensFlareGhostCount;
	float LensFlareGhostPixelation;
	float LensFlareVerticalScatter;
	float LensFlareWideSize;
	float LensFlareHaloSize;
	float LensFlareGhost1Size;
	float LensFlareGhost2Size;
	float LensFlareGhost3Size;
	float LensFlareGhost4Size;
	float LensFlareGhost5Size;
	float LensFlareGhost6Size;
	float LensFlareVerticalSize;
	float LensFlareWideOffsetX;
	float LensFlareWideOffsetY;
	float LensFlareHaloOffsetX;
	float LensFlareHaloOffsetY;
	float LensFlareGhost1OffsetX;
	float LensFlareGhost1OffsetY;
	float LensFlareGhost2OffsetX;
	float LensFlareGhost2OffsetY;
	float LensFlareGhost3OffsetX;
	float LensFlareGhost3OffsetY;
	float LensFlareGhost4OffsetX;
	float LensFlareGhost4OffsetY;
	float LensFlareGhost5OffsetX;
	float LensFlareGhost5OffsetY;
	float LensFlareGhost6OffsetX;
	float LensFlareGhost6OffsetY;
	float LensFlareVerticalOffsetX;
	float LensFlareVerticalOffsetY;
	float LensFlareWideHeightScale;
	float LensFlareReserved1;
	float LensFlareReserved2;
};

out vec4 fragColor;

float saturate(float value) {
    return clamp(value, 0.0, 1.0);
}

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float hash11(float value) {
    return hash21(vec2(value, value * 0.731 + 13.17));
}

const float PI = 3.14159265;
const int MAX_GOD_RAY_SAMPLES = 64;
const int MAX_DOF_SAMPLES = 40;
const int MAX_MOTION_BLUR_SAMPLES = 16;
const float GOLDEN_ANGLE = 2.39996323;
const float REVERSED_Z_CLEAR_EPSILON = 0.000001;

const vec3 SUN_GLOW_COLOR = vec3(1.0, 0.7, 0.3);
const vec3 MOON_GLOW_COLOR = vec3(0.5, 0.6, 1.0);

float interleavedGradientNoise(vec2 uv) {
    return fract(52.9829189 * fract(dot(uv, vec2(0.06711056, 0.00583715))));
}

float linearizeDepth(float depth) {
    // Minecraft 26.2 renders the level with reversed Z: the depth buffer is
    // cleared to 0, distant geometry approaches 0, and the near plane is 1.
    float denominator = NearPlane + depth * (FarPlane - NearPlane);
    return (NearPlane * FarPlane) / max(denominator, 1.0e-5);
}

float clearSkyDepthMask(float rawDepth) {
    return 1.0 - step(REVERSED_Z_CLEAR_EPSILON, rawDepth);
}

float geometryDepthMask(float rawDepth) {
    return step(REVERSED_Z_CLEAR_EPSILON, rawDepth);
}

float depthNorm(float linearDepth) {
    return saturate((linearDepth - NearPlane) / max(FarPlane - NearPlane, 1.0e-4));
}

float sceneLuma(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

float getGodRayCoreShape(vec2 uv, vec2 lightUv, float aspect) {
    vec2 delta = uv - lightUv;
    delta.x *= aspect;
    float dist = length(delta);

    float coreEdge = max(GodRaysSunSize * 0.8, 1.0e-4);
    return smoothstep(GodRaysSunSize, coreEdge, dist);
}

float getGodRayDirectGlow(vec2 uv, vec2 lightUv, float screenFade, float aspect) {
    if (screenFade <= 0.0) {
        return 0.0;
    }

    vec2 delta = uv - lightUv;
    delta.x *= aspect;
    float dist = length(delta);

    float coreEdge = max(GodRaysSunSize * 0.8, 1.0e-4);
    float core = smoothstep(GodRaysSunSize, coreEdge, dist) * 0.35;
    float glowRadius = max(GodRaysSunSize * max(GodRaysSunGlow, 0.01), 1.0e-4);
    float glow = exp(-dist / glowRadius) * GodRaysSunGlow;
    return (core + glow) * screenFade;
}

vec3 computeGodRays(vec2 uv, vec2 lightUv, float screenFade, vec3 lightColor, float aspect) {
    if (screenFade <= 0.0) {
        return vec3(0.0);
    }

    int sampleCount = int(clamp(round(GodRaysSamples), 1.0, float(MAX_GOD_RAY_SAMPLES)));
    float invSamples = 1.0 / float(sampleCount);
    vec2 delta = (uv - lightUv) * invSamples * GodRaysDensity;
    vec2 coord = uv + delta * interleavedGradientNoise(gl_FragCoord.xy);

    vec3 acc = vec3(0.0);
    float decayAcc = 1.0;

    for (int i = 0; i < MAX_GOD_RAY_SAMPLES; i++) {
        if (i >= sampleCount) {
            break;
        }

        coord -= delta;

        vec2 b0 = smoothstep(vec2(0.0), vec2(0.08), coord);
        vec2 b1 = smoothstep(vec2(1.0), vec2(0.92), coord);
        float borderMask = b0.x * b0.y * b1.x * b1.y;

        float depth = texture(MainDepthSampler, coord).r;
        float shape = getGodRayCoreShape(coord, lightUv, aspect);
        float skyLight = clearSkyDepthMask(depth);
        float storyCloud = saturate(CloudLayerEnabled)
            * step(0.5, CloudStyle)
            * (1.0 - skyLight)
            * (1.0 - smoothstep(0.0002, 0.015, depth));
        float light = max(skyLight, storyCloud * 0.16) * shape;
        acc += lightColor * light * decayAcc * GodRaysWeight * borderMask;
        decayAcc *= GodRaysDecay;
    }

    float sampleEnergyNormalization = min(1.0, 30.0 / max(float(sampleCount), 1.0));
    return acc * GodRaysExposure * screenFade * sampleEnergyNormalization;
}

void getLightWeights(float angle, out float sunW, out float moonW) {
    float transitionWidth = radians(max(GodRaysTransitionDegrees, 0.1));
    float t = mod(angle + PI, 2.0 * PI);

    if (t < transitionWidth) {
        sunW = t / transitionWidth;
    } else if (t < PI - transitionWidth) {
        sunW = 1.0;
    } else if (t < PI + transitionWidth) {
        sunW = 1.0 - (t - (PI - transitionWidth)) / (2.0 * transitionWidth);
    } else if (t < 2.0 * PI - transitionWidth) {
        sunW = 0.0;
    } else {
        sunW = (t - (2.0 * PI - transitionWidth)) / transitionWidth;
    }

    moonW = 1.0 - sunW;
}

vec3 applyWarmth(vec3 color, float warmth) {
    vec3 tint = vec3(1.0 + warmth * 0.16, 1.0, 1.0 - warmth * 0.12);
    color *= tint;
    color += vec3(warmth * 0.035, warmth * 0.01, -warmth * 0.02);
    return color;
}

vec3 applyVibrance(vec3 color, float vibrance) {
    float maxChannel = max(max(color.r, color.g), color.b);
    float minChannel = min(min(color.r, color.g), color.b);
    float chroma = maxChannel - minChannel;
    float luma = sceneLuma(color);
    float boost = vibrance * (1.0 - saturate(chroma * 2.0));
	return mix(vec3(luma), color, 1.0 + boost);
}

vec3 rotateColorHue(vec3 color, float degrees) {
	float angle = radians(degrees);
	float cosine = cos(angle);
	float sine = sin(angle);
	mat3 hueMatrix = mat3(
		0.299 + 0.701 * cosine + 0.168 * sine,
		0.587 - 0.587 * cosine + 0.330 * sine,
		0.114 - 0.114 * cosine - 0.497 * sine,
		0.299 - 0.299 * cosine - 0.328 * sine,
		0.587 + 0.413 * cosine + 0.035 * sine,
		0.114 - 0.114 * cosine + 0.292 * sine,
		0.299 - 0.300 * cosine + 1.250 * sine,
		0.587 - 0.588 * cosine - 1.050 * sine,
		0.114 + 0.886 * cosine - 0.203 * sine
	);
	return hueMatrix * color;
}

vec3 applyTonalWheel(vec3 color, vec3 wheelColor, float strength, float luminance, float mask) {
	float wheelLuma = sceneLuma(wheelColor);
	vec3 chromaShift = wheelColor - vec3(wheelLuma);
	color += chromaShift * strength * mask * 0.72;
	color += vec3(luminance * mask * 0.22);
	return color;
}

vec3 applyColorGrade(vec3 color) {
	float gradeAmount = saturate(ColorGradeBasic0.x);
	if (gradeAmount <= 0.0001) {
		return color;
	}
	vec3 sourceColor = color;

	float blackPoint = min(ColorGradeAdvanced.y, ColorGradeAdvanced.z - 0.01);
	float whitePoint = max(ColorGradeAdvanced.z, blackPoint + 0.01);
	color = max((color - blackPoint) / (whitePoint - blackPoint), vec3(0.0));
	color *= exp2(ColorGradeBasic0.y);
	color = applyWarmth(color, ColorGradeBasic1.w);
	color *= vec3(1.0 + ColorGradeBasic2.x * 0.055, 1.0 - ColorGradeBasic2.x * 0.085, 1.0 + ColorGradeBasic2.x * 0.055);

	float luma = sceneLuma(max(color, vec3(0.0)));
	float balanceOffset = ColorGradeBasic3.z * 0.16;
	float blend = clamp(ColorGradeBasic3.w, 0.10, 1.0);
	float shadowEnd = 0.54 + balanceOffset;
	float highlightStart = 0.46 + balanceOffset;
	float shadowMask = 1.0 - smoothstep(max(0.0, shadowEnd - blend * 0.34), min(1.0, shadowEnd + blend * 0.34), luma);
	float highlightMask = smoothstep(max(0.0, highlightStart - blend * 0.34), min(1.0, highlightStart + blend * 0.34), luma);
	float midtoneMask = saturate(1.0 - max(shadowMask, highlightMask));
	float maskSum = max(shadowMask + midtoneMask + highlightMask, 1.0e-4);
	shadowMask /= maskSum;
	midtoneMask /= maskSum;
	highlightMask /= maskSum;

	float shadowTone = ColorGradeBasic1.x * shadowMask * 0.34;
	float highlightTone = ColorGradeBasic0.w * highlightMask * 0.34;
	float blackTone = ColorGradeBasic1.z * shadowMask * shadowMask * 0.20;
	float whiteTone = ColorGradeBasic1.y * highlightMask * highlightMask * 0.20;
	color += vec3(shadowTone + highlightTone + blackTone + whiteTone);

	color = applyTonalWheel(color, ColorGradeShadow.rgb, ColorGradeShadow.a, ColorGradeToneLuminance.x, shadowMask);
	color = applyTonalWheel(color, ColorGradeMidtone.rgb, ColorGradeMidtone.a, ColorGradeToneLuminance.y, midtoneMask);
	color = applyTonalWheel(color, ColorGradeHighlight.rgb, ColorGradeHighlight.a, ColorGradeToneLuminance.z, highlightMask);

	float shadowRolloff = saturate(ColorGradeAdvanced.w);
	float highlightRolloff = saturate(ColorGradeRolloff.x);
	vec3 shadowCurve = color * color * (3.0 - 2.0 * color);
	color = mix(color, shadowCurve, shadowRolloff * shadowMask);
	vec3 highlightCurve = vec3(1.0) - exp(-max(color, vec3(0.0)));
	color = mix(color, highlightCurve, highlightRolloff * highlightMask);

	color = max(color, vec3(0.0));
	color = pow(color, vec3(1.0 / max(ColorGradeBasic2.w, 0.05)));
	color = applyVibrance(color, ColorGradeBasic2.y);
	luma = sceneLuma(color);
	color = mix(vec3(luma), color, ColorGradeBasic2.z);
	color = rotateColorHue(color, ColorGradeBasic3.y);
	color = (color - 0.5) * ColorGradeBasic0.z + 0.5;
	color = (color + ColorGradeToneLuminance.w) * ColorGradeAdvanced.x;
	color = mix(color, vec3(0.5), saturate(ColorGradeBasic3.x) * 0.35);
	return mix(sourceColor, max(color, vec3(0.0)), gradeAmount);
}

float hotColorMask(vec3 color) {
    float warm = max(color.r - color.b, 0.0);
    float lavaLike = smoothstep(0.12, 0.45, warm) * smoothstep(0.08, 0.40, color.r - color.g * 0.6);
    float brightHot = smoothstep(0.35, 0.95, color.r) * smoothstep(0.15, 0.75, color.g);
    float ember = smoothstep(0.20, 0.62, color.r) * (1.0 - smoothstep(0.40, 0.92, color.b));
    float nightBias = mix(1.15, 0.95, DayFactor);
    return saturate(max(lavaLike, brightHot * 0.72) + ember * 0.28) * nightBias;
}

vec3 skyBaseColor(float v) {
    vec3 horizonDay = vec3(0.93, 0.78, 0.62);
    vec3 zenithDay = vec3(0.34, 0.61, 0.94);
    vec3 horizonNight = vec3(0.07, 0.10, 0.20);
    vec3 zenithNight = vec3(0.02, 0.03, 0.09);
    vec3 daySky = mix(horizonDay, zenithDay, v);
    vec3 nightSky = mix(horizonNight, zenithNight, v);
    vec3 base = mix(nightSky, daySky, DayFactor);
    return applyWarmth(base, SkyWarmth);
}

float sampleDepthLinear(vec2 uv) {
    return linearizeDepth(texture(MainDepthSampler, clamp(uv, vec2(0.0), vec2(1.0))).r);
}

float dofSceneDistance(float rawDepth) {
    if (rawDepth <= REVERSED_Z_CLEAR_EPSILON) {
        return FarPlane;
    }
    return linearizeDepth(rawDepth);
}

float dofFocusDistance() {
    if (DepthOfFieldAutoFocus > 0.5) {
        if (DepthOfFieldHitFocusDistance > NearPlane) {
            return clamp(DepthOfFieldHitFocusDistance, NearPlane, FarPlane);
        }

        if (DepthOfFieldBlurWithoutTarget > 0.5) {
            float centerDepth = texture(MainDepthSampler, vec2(0.5)).r;
            if (centerDepth > REVERSED_Z_CLEAR_EPSILON) {
                return dofSceneDistance(centerDepth);
            }
        }

        return -1.0;
    }

    return clamp(DepthOfFieldFocusDistance, NearPlane, FarPlane);
}

float dofBlurRadiusPixels(float rawDepth) {
    if (DepthOfFieldFade <= 1.0e-4) {
        return 0.0;
    }
    float sceneDistance = dofSceneDistance(rawDepth);
    float focusDistance = dofFocusDistance();
    if (focusDistance < NearPlane) {
        return 0.0;
    }
    float focusRange = max(DepthOfFieldFocusRange, 0.05);
    float focusMiss = smoothstep(0.0, focusRange, abs(sceneDistance - focusDistance));
    if (rawDepth <= REVERSED_Z_CLEAR_EPSILON && focusDistance < FarPlane * 0.98) {
        focusMiss = max(focusMiss, 0.85);
    }
    float foregroundDamping = sceneDistance < focusDistance ? 0.65 : 1.0;
    return min(DepthOfFieldMaxBlur, focusMiss * DepthOfFieldMaxBlur * DepthOfFieldIntensity * foregroundDamping) * DepthOfFieldFade;
}

vec3 applyDepthOfField(vec2 uv, vec3 centerColor, float rawDepth) {
    int sampleCount = int(clamp(round(DepthOfFieldSamples), 1.0, float(MAX_DOF_SAMPLES)));
    float radiusPixels = dofBlurRadiusPixels(rawDepth);
    if (sampleCount <= 1 || radiusPixels <= 0.15) {
        return centerColor;
    }

    float centerDistance = dofSceneDistance(rawDepth);
    vec2 pixel = 1.0 / max(MainSize, vec2(1.0));
    float theta = interleavedGradientNoise(gl_FragCoord.xy + vec2(Time * 24000.0, HeatShimmerTime)) * PI * 2.0;
    vec3 accum = centerColor;
    float weightSum = 1.0;

    for (int i = 0; i < MAX_DOF_SAMPLES; i++) {
        if (i >= sampleCount) {
            break;
        }

        float fi = float(i) + 0.5;
        float sampleRadius = sqrt(fi / float(sampleCount));
        float angle = theta + fi * GOLDEN_ANGLE;
        vec2 offset = vec2(cos(angle), sin(angle)) * sampleRadius * radiusPixels * pixel;
        vec2 sampleUv = clamp(uv + offset, vec2(0.0), vec2(1.0));
        float sampleDistance = dofSceneDistance(texture(MainDepthSampler, sampleUv).r);
        float reject = smoothstep(DepthOfFieldFocusRange * 0.35, DepthOfFieldFocusRange * 2.5, abs(sampleDistance - centerDistance));
        float weight = mix(1.0, 0.25, reject);

        accum += texture(MainSampler, sampleUv).rgb * weight;
        weightSum += weight;
    }

    return accum / max(weightSum, 1.0e-4);
}

vec3 applyMotionBlur(vec2 uv, vec3 centerColor) {
    vec2 motion = vec2(MotionBlurVectorX, MotionBlurVectorY);
    float motionLength = length(motion);
    int sampleCount = int(clamp(round(MotionBlurSamples), 2.0, float(MAX_MOTION_BLUR_SAMPLES)));
    vec2 pixel = 1.0 / max(MainSize, vec2(1.0));
    float motionActivity = smoothstep(0.0015, 0.075, motionLength);
    float radiusPixels = max(MotionBlurMaxRadius, 0.0) * motionActivity;
    vec2 trailUv = motionLength > 1.0e-5
        ? normalize(motion) * radiusPixels * pixel
        : vec2(0.0);

    vec2 neighborhoodStep = pixel * 1.5;
    vec3 neighborhoodMin = centerColor;
    vec3 neighborhoodMax = centerColor;
    vec3 neighborX0 = texture(MainSampler, clamp(uv - vec2(neighborhoodStep.x, 0.0), vec2(0.0), vec2(1.0))).rgb;
    vec3 neighborX1 = texture(MainSampler, clamp(uv + vec2(neighborhoodStep.x, 0.0), vec2(0.0), vec2(1.0))).rgb;
    vec3 neighborY0 = texture(MainSampler, clamp(uv - vec2(0.0, neighborhoodStep.y), vec2(0.0), vec2(1.0))).rgb;
    vec3 neighborY1 = texture(MainSampler, clamp(uv + vec2(0.0, neighborhoodStep.y), vec2(0.0), vec2(1.0))).rgb;
    neighborhoodMin = min(neighborhoodMin, min(min(neighborX0, neighborX1), min(neighborY0, neighborY1)));
    neighborhoodMax = max(neighborhoodMax, max(max(neighborX0, neighborX1), max(neighborY0, neighborY1)));
    float clampMargin = 0.06 + saturate(MotionBlurStrength) * 0.18;
    neighborhoodMin -= vec3(clampMargin);
    neighborhoodMax += vec3(clampMargin);

    vec3 accum = vec3(0.0);
    float weightSum = 0.0;

    for (int i = 0; i < MAX_MOTION_BLUR_SAMPLES; i++) {
        if (i >= sampleCount) {
            break;
        }

        float t = (float(i) + 0.5) / float(sampleCount);
        float weight = 1.0 - t * 0.55;
        vec2 historyUv = clamp(uv - trailUv * t, vec2(0.0), vec2(1.0));
        vec2 currentUv = clamp(uv - trailUv * t * 0.20, vec2(0.0), vec2(1.0));
        vec3 historyColor = clamp(texture(HistorySampler, historyUv).rgb, neighborhoodMin, neighborhoodMax);
        vec3 currentTrailColor = texture(MainSampler, currentUv).rgb;
        vec3 temporalSample = mix(currentTrailColor, historyColor, 0.78);
        accum += temporalSample * weight;
        weightSum += weight;
    }

    vec3 temporalColor = accum / max(weightSum, 1.0e-4);
    float temporalAmount = saturate(MotionBlurStrength) * mix(0.55, 0.90, motionActivity);
    return mix(centerColor, temporalColor, saturate(temporalAmount));
}

vec3 applyVignette(vec2 uv, vec3 color) {
	float exponent = mix(8.0, 2.0, saturate(VignettePlacement.x));
	vec2 center = vec2(0.5) + VignettePlacement.yz;
	vec2 offset = abs((uv - center) * 2.0);
	float edgeDistance = pow(
		pow(offset.x, exponent) + pow(offset.y, exponent),
		1.0 / exponent
	);
	float radius = max(VignetteShape.z, 0.0);
	float softness = max(VignetteShape.w, 1.0e-3);
	float edgeMask = smoothstep(radius, radius + softness, edgeDistance);
	float localDarknessBoost = max(VignettePlacement.w, 0.0);
	float borderAmount = saturate(VignetteColorBorder.w);
	float normalAmount = saturate(VignetteShape.y * (1.0 + localDarknessBoost));
	float opacity = saturate(edgeMask * max(normalAmount, borderAmount));
	vec3 edgeColor = mix(clamp(VignetteColorBorder.rgb, vec3(0.0), vec3(1.0)), vec3(1.0, 0.0, 0.0), borderAmount);
	return mix(color, edgeColor, opacity);
}

float cameraNoiseHash(vec3 value) {
    value = fract(value * vec3(0.1031, 0.1030, 0.0973));
    value += dot(value, value.yxz + 33.33);
    return fract((value.x + value.y) * value.z);
}

float cameraNoiseSignal(vec2 noiseCell, float frameIndex, float channelSeed) {
    float fine = cameraNoiseHash(vec3(noiseCell, frameIndex + channelSeed));
    float clustered = cameraNoiseHash(vec3(floor(noiseCell * 0.5), frameIndex + channelSeed + 137.0));
    float signal = mix(fine, clustered, 0.12);
    return smoothstep(0.16, 0.84, signal);
}

vec3 applyCameraNoise(vec3 color) {
    float intensity = saturate(CameraNoiseIntensity);
    if (intensity <= 1.0e-4) {
        return color;
    }

    float grainSize = max(CameraNoiseSize, 1.0);
    float frameIndex = floor(HeatShimmerTime * max(CameraNoiseSpeed, 0.0));
    vec2 noiseCell = floor(gl_FragCoord.xy / grainSize);
    float monochrome = cameraNoiseSignal(noiseCell, frameIndex, 11.0);
    vec3 colored = vec3(
        cameraNoiseSignal(noiseCell, frameIndex, 29.0),
        cameraNoiseSignal(noiseCell, frameIndex, 71.0),
        cameraNoiseSignal(noiseCell, frameIndex, 113.0)
    );
    vec3 staticSignal = mix(vec3(monochrome), colored, saturate(CameraNoiseColor));
    vec3 signedNoise = staticSignal * 2.0 - 1.0;

    float luma = sceneLuma(color);
    float grainAmplitude = mix(0.42, 0.28, smoothstep(0.08, 0.92, luma));
    vec3 grainOverlay = clamp(color + signedNoise * grainAmplitude, vec3(0.0), vec3(1.0));
    vec3 noisyScene = mix(color, grainOverlay, intensity);

    // The upper half of the slider progressively becomes literal television snow.
    float staticTakeover = smoothstep(0.50, 1.0, intensity) * 0.92;
    return mix(noisyScene, staticSignal, staticTakeover);
}

vec3 applyLowLightDesaturation(vec3 color, float rawDepth) {
    float fullPoint = max(LowLightDesaturationFull, 0.0);
    float startPoint = max(LowLightDesaturationStart, fullPoint + 1.0e-4);
    float perceivedLight = sceneLuma(max(color, vec3(0.0)));
    float darkness = 1.0 - smoothstep(fullPoint, startPoint, perceivedLight);
    darkness = pow(saturate(darkness), max(LowLightDesaturationCurve, 0.05));

    float skyPixel = clearSkyDepthMask(rawDepth);
    float targetMask = mix(1.0 - skyPixel, 1.0, saturate(LowLightDesaturationAffectSky));
    float maximumRemoval = min(
        saturate(LowLightDesaturationStrength),
        1.0 - saturate(LowLightSaturationFloor)
    );
    float amount = darkness * targetMask * maximumRemoval;
    float luma = sceneLuma(color);
    return mix(color, vec3(luma), saturate(amount));
}

float adaptivePaletteDistance(vec3 color, vec3 candidate) {
    vec3 delta = color - candidate;
    float lumaDelta = dot(delta, vec3(0.299, 0.587, 0.114));
    return dot(delta * delta, vec3(1.0, 1.45, 0.72)) + lumaDelta * lumaDelta * 0.85;
}

float adaptivePaletteBayer2(vec2 cell) {
    vec2 bit = mod(floor(cell), 2.0);
    if (bit.y < 0.5) {
        return bit.x < 0.5 ? 0.0 : 2.0;
    }
    return bit.x < 0.5 ? 3.0 : 1.0;
}

float adaptivePaletteBayer8(vec2 cell) {
    vec2 wrapped = mod(floor(cell), 8.0);
    float value = adaptivePaletteBayer2(wrapped) * 16.0
        + adaptivePaletteBayer2(floor(wrapped * 0.5)) * 4.0
        + adaptivePaletteBayer2(floor(wrapped * 0.25));
    return (value + 0.5) / 64.0;
}

float adaptivePaletteFloydSteinberg(vec2 cell, float coverage) {
    ivec2 target = ivec2(mod(floor(cell), 4.0));
    float rowErrors[6];
    float nextErrors[6];
    for (int index = 0; index < 6; index++) {
        rowErrors[index] = 0.0;
        nextErrors[index] = 0.0;
    }

    float selected = 0.0;
    for (int row = 0; row < 4; row++) {
        for (int index = 0; index < 6; index++) {
            nextErrors[index] = 0.0;
        }
        for (int column = 0; column < 4; column++) {
            int errorIndex = column + 1;
            float value = clamp(coverage + rowErrors[errorIndex], 0.0, 1.0);
            float outputValue = value >= 0.5 ? 1.0 : 0.0;
            if (column == target.x && row == target.y) {
                selected = outputValue;
            }

            float quantizationError = value - outputValue;
            rowErrors[errorIndex + 1] += quantizationError * (7.0 / 16.0);
            nextErrors[errorIndex - 1] += quantizationError * (3.0 / 16.0);
            nextErrors[errorIndex] += quantizationError * (5.0 / 16.0);
            nextErrors[errorIndex + 1] += quantizationError * (1.0 / 16.0);
        }
        for (int index = 0; index < 6; index++) {
            rowErrors[index] = nextErrors[index];
        }
    }
    return selected;
}

vec3 applyAdaptivePalette(vec3 color) {
    int colorCount = int(clamp(floor(AdaptivePaletteSettings.y + 0.5), 2.0, 32.0));
    float bestDistance = 1.0e20;
    float secondDistance = 1.0e20;
    vec3 bestColor = AdaptivePaletteColors[0].rgb;
    vec3 secondColor = AdaptivePaletteColors[1].rgb;

    for (int paletteIndex = 0; paletteIndex < 32; paletteIndex++) {
        if (paletteIndex >= colorCount) {
            break;
        }
        vec3 candidate = AdaptivePaletteColors[paletteIndex].rgb;
        float distanceValue = adaptivePaletteDistance(color, candidate);
        if (distanceValue < bestDistance) {
            secondDistance = bestDistance;
            secondColor = bestColor;
            bestDistance = distanceValue;
            bestColor = candidate;
        } else if (distanceValue < secondDistance) {
            secondDistance = distanceValue;
            secondColor = candidate;
        }
    }

    float ditherAmount = saturate(AdaptivePaletteSettings.z);
    if (ditherAmount <= 1.0e-4) {
        return bestColor;
    }

    float bestLinearDistance = sqrt(max(bestDistance, 0.0));
    float secondLinearDistance = sqrt(max(secondDistance, 0.0));
    float secondColorChance = bestLinearDistance / max(bestLinearDistance + secondLinearDistance, 1.0e-5);
    float ditherScale = max(floor(AdaptivePaletteSettings.w + 0.5), 1.0);
    vec2 ditherCell = floor(gl_FragCoord.xy / ditherScale);
    if (AdaptivePaletteDitherStyle > 0.5) {
        float secondColorCoverage = secondColorChance * ditherAmount;
        return adaptivePaletteFloydSteinberg(ditherCell, secondColorCoverage) > 0.5 ? secondColor : bestColor;
    }
    float threshold = adaptivePaletteBayer8(ditherCell);
    return threshold < secondColorChance * ditherAmount ? secondColor : bestColor;
}

float skyDepthMask(float rawDepth) {
    // Use a soft far-depth gate so haze transitions do not form a hard seam.
    return 1.0 - smoothstep(0.0, 0.0008, rawDepth);
}

float rbLensSunVisibility(vec2 lightUv) {
    vec2 inMin = step(vec2(0.0), lightUv);
    vec2 inMax = step(lightUv, vec2(1.0));
    float inBounds = inMin.x * inMin.y * inMax.x * inMax.y;
    if (inBounds < 0.5) {
        return 0.0;
    }

    vec2 texel = 2.0 / max(MainDepthSize, vec2(1.0));
    float visible = 0.0;
    visible += 1.0 - step(0.00025, texture(MainDepthSampler, clamp(lightUv, vec2(0.0), vec2(1.0))).r);
    visible += 1.0 - step(0.00025, texture(MainDepthSampler, clamp(lightUv + vec2(texel.x, 0.0), vec2(0.0), vec2(1.0))).r);
    visible += 1.0 - step(0.00025, texture(MainDepthSampler, clamp(lightUv - vec2(texel.x, 0.0), vec2(0.0), vec2(1.0))).r);
    visible += 1.0 - step(0.00025, texture(MainDepthSampler, clamp(lightUv + vec2(0.0, texel.y), vec2(0.0), vec2(1.0))).r);
    visible += 1.0 - step(0.00025, texture(MainDepthSampler, clamp(lightUv - vec2(0.0, texel.y), vec2(0.0), vec2(1.0))).r);
    return visible * 0.2;
}

vec2 rbLensSpriteUv(vec2 uv, vec2 center, vec2 size, float rotation) {
    vec2 delta = uv - center;
    float c = cos(rotation);
    float s = sin(rotation);
    vec2 rotated = vec2(
        c * delta.x + s * delta.y,
        -s * delta.x + c * delta.y
    );
    return rotated / max(size, vec2(1.0e-4)) + 0.5;
}

vec2 rbLensRoundSize(float diameter, float aspect) {
    return vec2(diameter / max(aspect, 1.0e-4), diameter);
}

float rbLensSpriteBounds(vec2 uv, vec2 center, vec2 size, float rotation) {
    vec2 spriteUv = rbLensSpriteUv(uv, center, size, rotation);
    vec2 inMin = step(vec2(0.0), spriteUv);
    vec2 inMax = step(spriteUv, vec2(1.0));
    return inMin.x * inMin.y * inMax.x * inMax.y;
}

vec3 rbLensSprite(sampler2D spriteSampler, vec2 uv, vec2 center, vec2 size, float rotation, vec3 tint, float opacity) {
    vec2 spriteUv = rbLensSpriteUv(uv, center, size, rotation);
    if (spriteUv.x < 0.0 || spriteUv.x > 1.0 || spriteUv.y < 0.0 || spriteUv.y > 1.0) {
        return vec3(0.0);
    }

    vec4 sprite = texture(spriteSampler, spriteUv);
    float mask = smoothstep(0.01, 0.18, max(max(sprite.r, sprite.g), sprite.b)) * sprite.a;
	float boundsDistance = min(min(spriteUv.x, 1.0 - spriteUv.x), min(spriteUv.y, 1.0 - spriteUv.y));
	float textureEdgeFade = smoothstep(0.0, 0.18, boundsDistance);
	mask *= mix(1.0, textureEdgeFade * mask, saturate(LensFlareEdgeFade));
    return sprite.rgb * tint * mask * opacity;
}

vec3 rbLensShiftHue(vec3 color, float hueTurns) {
    float angle = hueTurns * PI * 2.0;
    float cosine = cos(angle);
    float sine = sin(angle);
    vec3 axis = vec3(0.57735026919);
    return color * cosine
        + cross(axis, color) * sine
        + axis * dot(axis, color) * (1.0 - cosine);
}

vec2 rbLensPixelateGhostUv(vec2 uv) {
	float pixelSize = max(LensFlareGhostPixelation, 0.0);
	if (pixelSize < 0.5) {
		return uv;
	}
	vec2 cellSize = vec2(pixelSize) / max(MainSize, vec2(1.0));
	return (floor(uv / cellSize) + 0.5) * cellSize;
}

vec3 applyGroundFog(vec2 uv, vec3 sceneColor, float rawDepth, float linearDepth) {
    if (GroundFogEnabled <= 1.0e-4 || GroundFogOpacity <= 1.0e-4 || UnderwaterFlag > 0.5) {
        return sceneColor;
    }

    vec2 ndc = uv * 2.0 - 1.0;
    float aspect = OutSize.x / max(OutSize.y, 1.0);
    float tanHalfFov = max(GroundFogTanHalfFov, 0.01);
    float horizontal = ndc.x * aspect * tanHalfFov;
    float vertical = ndc.y * tanHalfFov;
    float rayLength = sqrt(1.0 + horizontal * horizontal + vertical * vertical);
    float rayY = (
        GroundFogForwardY
        + horizontal * GroundFogLeftY
        + vertical * GroundFogUpY
    ) / max(rayLength, 1.0e-4);
    float sceneDistance = rawDepth <= REVERSED_Z_CLEAR_EPSILON
        ? FarPlane * rayLength
        : linearDepth * rayLength;
    float topOffset = GroundFogVerticalOffset + GroundFogHeightLagOffset;
    float bottomOffset = topOffset + max(GroundFogThickness, 1.0);
    float layerTopY = -topOffset;
    float layerBottomY = -bottomOffset;
    float layerMinY = min(layerBottomY, layerTopY);
    float layerMaxY = max(layerBottomY, layerTopY);
    float startDistance = max(GroundFogStartDistance, 0.0);
    float endDistance = max(startDistance + 1.0, GroundFogEndDistance);
    float edgeSoftness = max(GroundFogEdgeSoftness, 0.005);
    float edgeDistance = max(8.0, max(startDistance + 4.0, GroundFogThickness * 0.75));
    float intersectionLayerMaxY = layerMaxY + edgeSoftness * edgeDistance;
    bool cameraInsideIntersectionLayer = layerMinY <= 0.0 && intersectionLayerMaxY >= 0.0;
    float slabStart = 0.0;
    float slabEnd = sceneDistance;
    if (abs(rayY) <= 1.0e-5) {
        if (!cameraInsideIntersectionLayer) {
            return sceneColor;
        }
    } else {
        float t0 = layerMinY / rayY;
        float t1 = intersectionLayerMaxY / rayY;
        float entryDistance = min(t0, t1);
        float exitDistance = max(t0, t1);
        slabStart = max(entryDistance, 0.0);
        slabEnd = min(exitDistance, sceneDistance);
    }
    float pathLength = max(slabEnd - slabStart, 0.0);
    if (pathLength <= 1.0e-4) {
        return sceneColor;
    }

    float distanceMask = smoothstep(startDistance, endDistance, sceneDistance);
    float entryWidth = max(1.0, (endDistance - startDistance) * 0.08);
    float entryMask = smoothstep(0.0, entryWidth, sceneDistance - slabStart);
    float edgeCenter = layerTopY / edgeDistance;
    float heightMask = 1.0 - smoothstep(edgeCenter - edgeSoftness, edgeCenter + edgeSoftness, rayY);
    float volumeMask = 1.0 - exp(-pathLength * max(GroundFogDensity, 0.005));
    float alpha = saturate(GroundFogEnabled)
        * saturate(GroundFogOpacity)
        * distanceMask
        * entryMask
        * heightMask
        * volumeMask;

    vec3 dayColor = vec3(GroundFogDayR, GroundFogDayG, GroundFogDayB);
    vec3 nightColor = vec3(GroundFogNightR, GroundFogNightG, GroundFogNightB);
    vec3 groundColor = mix(nightColor, dayColor, saturate(DayFactor));
    return mix(sceneColor, groundColor, saturate(alpha));
}

vec3 computeWorldAmbienceLensFlare(vec2 uv, vec2 lightUv, float screenFade, float visible, float amount, float aspect, float rawDepth) {
    if (amount <= 1.0e-4 || visible <= 0.5 || screenFade <= 1.0e-4) {
        return vec3(0.0);
    }

    vec2 center = vec2(0.5);
    vec2 axis = lightUv - center;
	float configuredSize = max(LensFlareSize, 0.01);
	float wideSize = configuredSize * max(LensFlareWideSize, 0.0);
	float haloSize = configuredSize * max(LensFlareHaloSize, 0.0);
	float ghost1Size = configuredSize * max(LensFlareGhost1Size, 0.0);
	float ghost2Size = configuredSize * max(LensFlareGhost2Size, 0.0);
	float ghost3Size = configuredSize * max(LensFlareGhost3Size, 0.0);
	float ghost4Size = configuredSize * max(LensFlareGhost4Size, 0.0);
	float ghost5Size = configuredSize * max(LensFlareGhost5Size, 0.0);
	float ghost6Size = configuredSize * max(LensFlareGhost6Size, 0.0);
	float verticalSize = configuredSize * max(LensFlareVerticalSize, 0.0);
	float configuredSpread = max(LensFlareGhostSpread, 0.01);
	float configuredScatter = max(LensFlareVerticalScatter, 0.0);
	int configuredGhostCount = int(clamp(floor(LensFlareGhostCount + 0.5), 3.0, 6.0));
	vec2 ghostUv = rbLensPixelateGhostUv(uv);
	vec2 wideCenter = lightUv + vec2(LensFlareWideOffsetX, LensFlareWideOffsetY);
	vec2 haloCenter = lightUv + vec2(LensFlareHaloOffsetX, LensFlareHaloOffsetY);
    float axisDistance = length(vec2(axis.x * aspect, axis.y));
    float ghostFade = mix(0.28, 1.0, smoothstep(0.015, 0.28, axisDistance));
    float axisAngle = atan(axis.y, axis.x);
	vec2 ghostA = center - axis * (0.32 * configuredSpread) + vec2(0.0, -0.016 * configuredScatter) + vec2(LensFlareGhost1OffsetX, LensFlareGhost1OffsetY);
	vec2 ghostB = center - axis * (0.64 * configuredSpread) + vec2(0.0, 0.012 * configuredScatter) + vec2(LensFlareGhost2OffsetX, LensFlareGhost2OffsetY);
	vec2 ghostC = center - axis * (0.96 * configuredSpread) + vec2(0.0, -0.028 * configuredScatter) + vec2(LensFlareGhost3OffsetX, LensFlareGhost3OffsetY);
	vec2 ghostD = center - axis * (1.18 * configuredSpread) + vec2(LensFlareVerticalOffsetX, LensFlareVerticalOffsetY);
	vec2 ghostE = center + axis * (0.18 * configuredSpread) + vec2(0.0, 0.022 * configuredScatter) + vec2(LensFlareGhost4OffsetX, LensFlareGhost4OffsetY);
	vec2 ghostF = center + axis * (0.42 * configuredSpread) + vec2(0.0, -0.012 * configuredScatter) + vec2(LensFlareGhost5OffsetX, LensFlareGhost5OffsetY);
	vec2 ghostG = center + axis * (0.70 * configuredSpread) + vec2(0.0, 0.034 * configuredScatter) + vec2(LensFlareGhost6OffsetX, LensFlareGhost6OffsetY);

    float spriteCandidate = 0.0;
		spriteCandidate = max(spriteCandidate, rbLensSpriteBounds(uv, wideCenter, vec2(0.42 * wideSize, 0.070 * wideSize * max(LensFlareWideHeightScale, 0.0)), 0.0));
		spriteCandidate = max(spriteCandidate, rbLensSpriteBounds(uv, haloCenter, rbLensRoundSize(0.125, aspect) * haloSize, 0.0));
		spriteCandidate = max(spriteCandidate, rbLensSpriteBounds(ghostUv, ghostA, rbLensRoundSize(0.078, aspect) * ghost1Size, 0.0));
		spriteCandidate = max(spriteCandidate, rbLensSpriteBounds(ghostUv, ghostB, rbLensRoundSize(0.095, aspect) * ghost2Size, 0.0));
		spriteCandidate = max(spriteCandidate, rbLensSpriteBounds(ghostUv, ghostC, rbLensRoundSize(0.070, aspect) * ghost3Size, 0.0));
	if (configuredGhostCount >= 4) {
		spriteCandidate = max(spriteCandidate, rbLensSpriteBounds(ghostUv, ghostE, rbLensRoundSize(0.052, aspect) * ghost4Size, 0.0));
	}
	if (configuredGhostCount >= 5) {
		spriteCandidate = max(spriteCandidate, rbLensSpriteBounds(ghostUv, ghostF, rbLensRoundSize(0.062, aspect) * ghost5Size, 0.0));
	}
	if (configuredGhostCount >= 6) {
		spriteCandidate = max(spriteCandidate, rbLensSpriteBounds(ghostUv, ghostG, rbLensRoundSize(0.048, aspect) * ghost6Size, 0.0));
	}
		spriteCandidate = max(spriteCandidate, rbLensSpriteBounds(uv, ghostD, vec2(0.038 / max(aspect, 1.0e-4), 0.155) * verticalSize, axisAngle + PI * 0.5));
    if (spriteCandidate <= 0.5) {
        return vec3(0.0);
    }

    float sunVisible = rbLensSunVisibility(lightUv);
    if (sunVisible <= 1.0e-4) {
        return vec3(0.0);
    }

    float rainFade = 1.0 - clamp(GodRaySceneData.y * 0.9, 0.0, 1.0);
    float receiver = mix(0.22, 1.0, skyDepthMask(rawDepth));
    float strength = amount * screenFade * sunVisible * rainFade * receiver;

    vec3 flare = vec3(0.0);
	flare += rbLensSprite(
		RbLensWideSampler,
		uv,
		wideCenter,
		vec2(0.42 * wideSize, 0.070 * wideSize * max(LensFlareWideHeightScale, 0.0)),
        0.0,
        vec3(0.56, 0.74, 1.0),
        0.34
    );
	flare += rbLensSprite(
		RbLensHaloSampler,
		uv,
		haloCenter,
		rbLensRoundSize(0.125, aspect) * haloSize,
        0.0,
        vec3(1.0, 0.82, 0.55),
        0.24
    );
    flare += rbLensSprite(
        RbLensDotASampler,
        ghostUv,
        ghostA,
		rbLensRoundSize(0.078, aspect) * ghost1Size,
        0.0,
        vec3(1.0, 0.92, 0.54),
        0.42 * ghostFade
    );
    flare += rbLensSprite(
        RbLensDotBSampler,
        ghostUv,
        ghostB,
		rbLensRoundSize(0.095, aspect) * ghost2Size,
        0.0,
        vec3(1.0, 0.70, 0.48),
        0.34 * ghostFade
    );
    flare += rbLensSprite(
        RbLensDotCSampler,
        ghostUv,
        ghostC,
		rbLensRoundSize(0.070, aspect) * ghost3Size,
        0.0,
        vec3(0.82, 1.0, 0.55),
        0.26 * ghostFade
    );
    flare += rbLensSprite(
        RbLensVerticalASampler,
        uv,
        ghostD,
		vec2(0.038 / max(aspect, 1.0e-4), 0.155) * verticalSize,
        axisAngle + PI * 0.5,
        vec3(0.48, 0.72, 1.0),
        0.14 * ghostFade
    );
	if (configuredGhostCount >= 4) {
		flare += rbLensSprite(
			RbLensDotASampler,
			ghostUv,
			ghostE,
			rbLensRoundSize(0.052, aspect) * ghost4Size,
			0.0,
			vec3(0.62, 0.82, 1.0),
			0.30 * ghostFade
		);
	}
	if (configuredGhostCount >= 5) {
		flare += rbLensSprite(
			RbLensDotBSampler,
			ghostUv,
			ghostF,
			rbLensRoundSize(0.062, aspect) * ghost5Size,
			0.0,
			vec3(1.0, 0.62, 0.78),
			0.24 * ghostFade
		);
	}
	if (configuredGhostCount >= 6) {
		flare += rbLensSprite(
			RbLensDotCSampler,
			ghostUv,
			ghostG,
			rbLensRoundSize(0.048, aspect) * ghost6Size,
			0.0,
			vec3(0.72, 0.66, 1.0),
			0.20 * ghostFade
		);
	}

	float flareLuma = dot(flare, vec3(0.2126, 0.7152, 0.0722));
	flare = mix(vec3(flareLuma), flare, max(LensFlareSaturation, 0.0));
	flare = max(rbLensShiftHue(flare, LensFlareHueShift), vec3(0.0));
	float configuredBrightness = max(LensFlareBrightness, 0.0);
	float highlightLift = max(configuredBrightness - 1.0, 0.0);
	flare = flare * configuredBrightness + pow(max(flare, vec3(0.0)), vec3(0.65)) * highlightLift * 0.35;
	return flare * strength * max(LensFlareOpacity, 0.0);
}

void computeCurrentHeatOffset(vec2 uv, vec3 sceneColor, float linearDepth, out vec2 offset, out float blend) {
    offset = vec2(0.0);
    blend = 0.0;
    if (HeatEnabled <= 1.0e-4 || HeatStrength <= 1.0e-4) {
        return;
    }

    if (HeatMode > 0.5) {
        float frequency = max(HeatShimmerFrequency, 1.0);
        float depthStart = HeatShimmerMinDistance;
        float depthEnd = max(depthStart + 1.0, HeatShimmerMaxDistance);
        float depthFactor = pow(saturate(smoothstep(depthStart, depthEnd, linearDepth)), 0.85);
        float shimmerTime = HeatShimmerTime * max(HeatShimmerSpeed, 0.0);
        float aspect = OutSize.x / max(OutSize.y, 1.0);
        vec2 centeredUv = (uv - 0.5) * vec2(aspect, 1.0);
        centeredUv.x += HeatCameraAnchorX;
        vec2 basisA = mat2(0.86, -0.51, 0.51, 0.86) * centeredUv;
        vec2 basisB = mat2(0.31, 0.95, -0.95, 0.31) * centeredUv;
        vec2 driftA = vec2(0.10, -0.035) * shimmerTime;
        vec2 driftB = vec2(-0.055, 0.09) * shimmerTime;
        float mainScale = frequency * 0.72;
        float slowBand = sin((basisA.x * 0.78 + basisA.y * 0.18 + driftA.x) * mainScale + shimmerTime * 1.28);
        float midBand = sin((basisB.x * 0.42 - basisA.y * 0.64 + driftB.y) * mainScale * 0.63 - shimmerTime * 0.91 + slowBand * 0.85);
        float rollBand = sin((basisA.x - basisB.y * 0.35) * mainScale * 0.31 + shimmerTime * 0.43 + midBand * 1.15);
        float fineRipple = sin((basisA.y + slowBand * 0.04) * mainScale * 1.35 - shimmerTime * 1.75 + midBand * 0.45);
        float grainAnchorX = HeatCameraAnchorX * OutSize.y * 0.29;
        float grain = interleavedGradientNoise(gl_FragCoord.xy * 0.29 + vec2(shimmerTime * 11.0 + grainAnchorX, slowBand * 17.0)) - 0.5;
        float detail = HeatShimmerDetail * (fineRipple * 0.28 + grain * 0.42);
        float verticalWave = slowBand * 0.66 + midBand * 0.28 + rollBand * 0.16 + detail;
        float horizontalWave = (midBand - slowBand * 0.55 + rollBand * 0.25 + grain * 0.60) * HeatShimmerHorizontalScale;
        float pixelAmplitude = (3.0 + sqrt(max(HeatShimmerIntensity, 0.0)) * 72.0)
            * HeatShimmerVerticalScale
            * HeatShimmerAmplitude
            * depthFactor;
        float biomeAmount = saturate(HeatEnabled);
        offset = vec2(horizontalWave, verticalWave) * pixelAmplitude * biomeAmount / max(OutSize, vec2(1.0));
        blend = saturate((0.55 + HeatShimmerIntensity * 1.8) * depthFactor * HeatShimmerBlend) * biomeAmount;
        return;
    }

    float aspect = OutSize.x / max(OutSize.y, 1.0);
    vec2 anchoredUv = uv + vec2(HeatCameraAnchorX / max(aspect, 1.0e-4), 0.0);
    float distanceMask = 1.0 - smoothstep(HeatDistance * 0.25, HeatDistance, linearDepth);
    float heatDistanceFade = mix(1.0, distanceMask, HeatDepthFade);
    float mask = smoothstep(HeatSourceBias, 1.0, hotColorMask(sceneColor));
    float animatedTime = Time * 24000.0 * HeatSpeed * 0.025;
    float noise = hash21(anchoredUv * (HeatScale * 0.37) + vec2(animatedTime * 0.17, -animatedTime * 0.11));
    float waveX = sin((anchoredUv.y * HeatScale + animatedTime) * 6.2831853 + noise * 6.2831853);
    float waveY = cos((anchoredUv.x * (HeatScale * 0.72) - animatedTime * 1.31) * 6.2831853 + noise * 4.0);
    vec2 flow = normalize(vec2(waveX, waveY + 0.2));
    float rainFade = mix(1.0, 0.75, Rain);
    float distortionStrength = HeatStrength * HeatDimensionMultiplier * rainFade;
    float pixelAmplitude = (0.4 + distortionStrength * 2.8) * mask * heatDistanceFade;
    float biomeAmount = saturate(HeatEnabled);
    offset = flow * (pixelAmplitude * biomeAmount / max(OutSize, vec2(1.0)));
    blend = saturate(distortionStrength * mask * heatDistanceFade) * biomeAmount;
}

vec2 layeredAtmosphereWave(vec2 position, float scale, float animationTime, float seed) {
    float primary = sin((position.y * 0.82 + position.x * 0.16) * scale + animationTime + seed);
    float cross = sin((position.x * 0.47 - position.y * 0.31) * scale * 0.63 - animationTime * 0.71 + seed * 1.73 + primary * 0.72);
    float roll = sin((position.y - position.x * 0.22) * scale * 0.29 + animationTime * 0.38 + cross * 1.05 + seed * 0.41);
    float fine = sin((position.y + primary * 0.035) * scale * 1.57 - animationTime * 1.33 + cross * 0.48);
    float vertical = primary * 0.68 + cross * 0.25 + roll * 0.14 + fine * LayeredAtmosphereDetail * 0.28;
    float horizontal = (cross - primary * 0.42 + fine * LayeredAtmosphereDetail * 0.20) * LayeredAtmosphereHorizontal;
    return vec2(horizontal, vertical);
}

void computeLayeredAtmosphereOffset(vec2 uv, float linearDepth, out vec2 offset, out float blend) {
    offset = vec2(0.0);
    blend = 0.0;
    if (LayeredAtmosphereEnabled <= 1.0e-4 || LayeredAtmosphereStrength <= 1.0e-4) {
        return;
    }

    float startDistance = max(LayeredAtmosphereStartDistance, NearPlane);
    float spacing = max(LayeredAtmosphereLayerSpacing, 1.0);
    float middleStart = startDistance + spacing;
    float farStart = middleStart + spacing;
    float maxDistance = max(farStart + 1.0, LayeredAtmosphereMaxDistance);
    float entranceWidth = max(2.0, spacing * 0.35);
    float nearMask = smoothstep(startDistance, startDistance + entranceWidth, linearDepth);
    float middleMask = smoothstep(middleStart, middleStart + entranceWidth, linearDepth);
    float farMask = smoothstep(farStart, farStart + entranceWidth, linearDepth);
    float distanceFade = 1.0 - smoothstep(maxDistance - max(8.0, spacing), maxDistance, linearDepth);
    float aspect = OutSize.x / max(OutSize.y, 1.0);
    vec2 position = (uv - 0.5) * vec2(aspect, 1.0);
    position.x += LayeredAtmosphereCameraAnchorX;
    float animationTime = HeatShimmerTime * max(LayeredAtmosphereSpeed, 0.0);

    vec2 closeWave = layeredAtmosphereWave(position, LayeredAtmosphereNearScale, animationTime * 1.00, 0.37);
    vec2 middleWave = layeredAtmosphereWave(mat2(0.91, -0.41, 0.41, 0.91) * position, LayeredAtmosphereMidScale, animationTime * 0.62, 2.13);
    vec2 farWave = layeredAtmosphereWave(mat2(0.72, 0.69, -0.69, 0.72) * position, LayeredAtmosphereFarScale, animationTime * 0.34, 4.71);
    vec2 combinedWave = closeWave * LayeredAtmosphereNearStrength * nearMask
        + middleWave * LayeredAtmosphereMidStrength * middleMask
        + farWave * LayeredAtmosphereFarStrength * farMask;

    float lowerHorizonMask = 1.0 - smoothstep(
        LayeredAtmosphereMirageHorizon,
        LayeredAtmosphereMirageHorizon + max(LayeredAtmosphereMirageFade, 1.0e-3),
        uv.y
    );
    float mirageDepthMask = smoothstep(middleStart, farStart + entranceWidth, linearDepth);
    float mirageWave = sin(position.x * LayeredAtmosphereFarScale * 0.44 + animationTime * 0.46)
        + sin(position.x * LayeredAtmosphereMidScale * 0.21 - animationTime * 0.29 + farWave.y * 0.75);
    combinedWave.y += mirageWave * 0.5 * LayeredAtmosphereMirageStrength * lowerHorizonMask * mirageDepthMask;

    float pixelAmplitude = (1.0 + LayeredAtmosphereStrength * 6.0) * distanceFade;
    float biomeAmount = saturate(LayeredAtmosphereEnabled);
    offset = combinedWave * pixelAmplitude * biomeAmount / max(OutSize, vec2(1.0));
    float activeMask = saturate(max(nearMask * LayeredAtmosphereNearStrength, max(middleMask * LayeredAtmosphereMidStrength, farMask * LayeredAtmosphereFarStrength)));
    activeMask = max(activeMask, lowerHorizonMask * mirageDepthMask * LayeredAtmosphereMirageStrength * 0.5);
    blend = saturate(LayeredAtmosphereBlend * LayeredAtmosphereStrength * activeMask * distanceFade) * biomeAmount;
}

float sharpenColdFacet(float value) {
    float exponent = mix(1.0, 0.28, saturate(ColdRefractionSharpness));
    return sign(value) * pow(max(abs(value), 1.0e-4), exponent);
}

void computeColdRefractionOffset(vec2 uv, float linearDepth, out vec2 offset, out float blend) {
    offset = vec2(0.0);
    blend = 0.0;
    if (ColdRefractionEnabled <= 1.0e-4 || ColdRefractionStrength <= 1.0e-4) {
        return;
    }

    float startDistance = max(ColdRefractionStartDistance, NearPlane);
    float maxDistance = max(startDistance + 1.0, ColdRefractionMaxDistance);
    float fadeInWidth = max(2.0, min(12.0, (maxDistance - startDistance) * 0.12));
    float fadeOutWidth = max(8.0, min(28.0, (maxDistance - startDistance) * 0.22));
    float depthMask = smoothstep(startDistance, startDistance + fadeInWidth, linearDepth)
        * (1.0 - smoothstep(maxDistance - fadeOutWidth, maxDistance, linearDepth));
    float aspect = OutSize.x / max(OutSize.y, 1.0);
    vec2 position = (uv - 0.5) * vec2(aspect, 1.0);
    position.x += ColdRefractionCameraAnchorX;
    float animationTime = HeatShimmerTime * max(ColdRefractionSpeed, 0.0);
    float scale = max(ColdRefractionScale, 1.0);

    float facetA = sin((position.x * 0.38 + position.y * 0.92) * scale + animationTime * 0.46);
    float facetB = sin((-position.x * 0.84 + position.y * 0.35) * scale * 0.73 - animationTime * 0.31 + 1.71);
    float facetC = sin((position.x * 0.66 + position.y * 0.58) * scale * 0.41 + animationTime * 0.19 + facetA * 0.34);
    facetA = sharpenColdFacet(facetA);
    facetB = sharpenColdFacet(facetB);
    facetC = sharpenColdFacet(facetC);
    float fineFacet = sin((position.x - position.y * 1.17) * scale * 1.83 - animationTime * 0.67 + facetB * 0.58);
    fineFacet = sharpenColdFacet(fineFacet) * ColdRefractionDetail;

    float vertical = facetA * 0.54 + facetB * 0.31 - facetC * 0.22 + fineFacet * 0.18;
    float horizontal = (facetB * 0.48 - facetA * 0.26 + facetC * 0.20 + fineFacet * 0.12) * ColdRefractionHorizontal;
    float snowfallScale = mix(1.0, ColdRefractionSnowMultiplier, saturate(Rain));
    float nightScale = mix(1.0, ColdRefractionNightMultiplier, saturate(1.0 - DayFactor));
    float intensity = ColdRefractionStrength * snowfallScale * nightScale;
    float pixelAmplitude = (0.25 + intensity * 2.25) * depthMask;
    float biomeAmount = saturate(ColdRefractionEnabled);
    offset = vec2(horizontal, vertical) * pixelAmplitude * biomeAmount / max(OutSize, vec2(1.0));
    blend = saturate(ColdRefractionBlend * (0.35 + intensity) * depthMask) * biomeAmount;
}

void computeChromaticRefraction(
    vec2 uv,
    float linearDepth,
    out vec2 centerOffset,
    out vec2 channelOffset,
    out vec2 lensOffset,
    out float scintillation,
    out float blend
) {
    centerOffset = vec2(0.0);
    channelOffset = vec2(0.0);
    lensOffset = vec2(0.0);
    scintillation = 0.0;
    blend = 0.0;
    if (
        ChromaticRefractionEnabled <= 1.0e-4
        || (
            ChromaticRefractionStrength <= 1.0e-4
            && ChromaticRefractionSeparation <= 1.0e-4
            && (ChromaticRefractionCrestsEnabled <= 0.5 || ChromaticRefractionCrestSeparation <= 1.0e-4)
            && (ChromaticRefractionLensEnabled <= 0.5 || ChromaticRefractionLensStrength <= 1.0e-4)
            && (ChromaticRefractionScintillationEnabled <= 0.5 || ChromaticRefractionScintillationStrength <= 1.0e-4)
        )
    ) {
        return;
    }

    float startDistance = max(ChromaticRefractionStartDistance, NearPlane);
    float maxDistance = max(startDistance + 1.0, ChromaticRefractionMaxDistance);
    float depthSpan = maxDistance - startDistance;
    float fadeInWidth = max(2.0, min(14.0, depthSpan * 0.14));
    float fadeOutWidth = max(8.0, min(32.0, depthSpan * 0.24));
    float depthMask = smoothstep(startDistance, startDistance + fadeInWidth, linearDepth)
        * (1.0 - smoothstep(maxDistance - fadeOutWidth, maxDistance, linearDepth));
    if (depthMask <= 1.0e-4) {
        return;
    }

    float endFlashAmount = saturate(ChromaticRefractionEndFlashAmount);
    float endFlashStrengthMultiplier = max(ChromaticRefractionEndFlashStrengthMultiplier, 0.0);
    float endFlashSeparationMultiplier = max(ChromaticRefractionEndFlashSeparationMultiplier, 0.0);
    float endFlashBlendMultiplier = max(ChromaticRefractionEndFlashBlendMultiplier, 0.0);
    float effectiveStrength = ChromaticRefractionStrength * (1.0 + endFlashAmount * endFlashStrengthMultiplier);
    float effectiveSeparation = ChromaticRefractionSeparation * (1.0 + endFlashAmount * endFlashSeparationMultiplier);
    float effectiveBlend = ChromaticRefractionBlend * (1.0 + endFlashAmount * endFlashBlendMultiplier);

    float aspect = OutSize.x / max(OutSize.y, 1.0);
    vec2 position = (uv - 0.5) * vec2(aspect, 1.0);
    position.x += ChromaticRefractionCameraAnchorX;
    float animationTime = HeatShimmerTime * max(ChromaticRefractionSpeed, 0.0);
    float scale = max(ChromaticRefractionScale, 1.0);

    float waveA = sin((position.x * 0.34 + position.y * 0.94) * scale + animationTime * 0.61);
    float waveB = sin((-position.x * 0.78 + position.y * 0.42) * scale * 0.57 - animationTime * 0.39 + 2.17);
    float waveC = sin((position.x * 0.61 + position.y * 0.69) * scale * 0.29 + animationTime * 0.23 + waveA * 0.45);
    float fineWave = sin((position.x - position.y * 1.31) * scale * 1.37 - animationTime * 0.77 + waveB * 0.52)
        * ChromaticRefractionDetail;

    float vertical = waveA * 0.58 + waveB * 0.29 - waveC * 0.21 + fineWave * 0.16;
    float horizontal = (waveB * 0.44 - waveA * 0.24 + waveC * 0.27 + fineWave * 0.13)
        * ChromaticRefractionHorizontal;
    vec2 refractionDirection = vec2(horizontal, vertical);
    float directionLength = length(refractionDirection);
    vec2 separationDirection = directionLength > 1.0e-4
        ? refractionDirection / directionLength
        : vec2(0.0, 1.0);
    float crestSignal = saturate(abs(waveA * 0.58 + waveB * 0.31 - waveC * 0.24 + fineWave * 0.12));
    float crestSoftness = max(ChromaticRefractionCrestSoftness, 1.0e-3);
    float crestMask = smoothstep(
        ChromaticRefractionCrestThreshold - crestSoftness,
        ChromaticRefractionCrestThreshold + crestSoftness,
        crestSignal
    );

    float centerPixels = (0.35 + effectiveStrength * 3.5) * depthMask;
    centerOffset = refractionDirection * centerPixels / max(OutSize, vec2(1.0));
    float separationPixels = effectiveSeparation
        * (0.45 + 0.55 * abs(waveC))
        * depthMask;
    if (ChromaticRefractionCrestsEnabled > 0.5) {
        separationPixels += ChromaticRefractionCrestSeparation * (1.0 + endFlashAmount * endFlashSeparationMultiplier) * crestMask * depthMask;
    }
    channelOffset = separationDirection * separationPixels / max(OutSize, vec2(1.0));

    if (ChromaticRefractionLensEnabled > 0.5 && ChromaticRefractionLensStrength > 1.0e-4) {
        float lensFrequency = max(scale * 0.16 * ChromaticRefractionLensScale, 0.25);
        vec2 lensPosition = position * lensFrequency
            + vec2(animationTime * 0.025, -animationTime * 0.018);
        vec2 lensCell = fract(lensPosition) - 0.5;
        float lensRadius = length(lensCell);
        float lensEnvelope = 1.0 - smoothstep(0.08, 0.52, lensRadius);
        vec2 lensDirection = lensRadius > 1.0e-4 ? lensCell / lensRadius : vec2(0.0);
        float compressionPhase = sin((waveA - waveB) * 2.4 + waveC * 1.7);
        float lensPixels = ChromaticRefractionLensStrength
            * lensEnvelope
            * compressionPhase
            * (0.35 + crestSignal * 0.65)
            * depthMask;
        lensOffset = lensDirection * lensPixels / max(OutSize, vec2(1.0));
    }

    if (ChromaticRefractionScintillationEnabled > 0.5 && ChromaticRefractionScintillationStrength > 1.0e-4) {
        float scintillationTime = HeatShimmerTime * ChromaticRefractionScintillationSpeed;
        float shimmerWave = sin(
            scintillationTime * 2.7
            + waveA * 2.2
            - waveB * 1.4
            + position.x * scale * 0.11
        );
        float shimmerGrain = interleavedGradientNoise(
            gl_FragCoord.xy * 0.23 + vec2(scintillationTime * 5.7, -scintillationTime * 3.1)
        ) - 0.5;
        scintillation = ChromaticRefractionScintillationStrength
            * (shimmerWave * 0.72 + shimmerGrain * 0.56)
            * (0.35 + crestSignal * 0.65)
            * depthMask;
    }

    blend = saturate(
        effectiveBlend
        * (0.30 + max(effectiveStrength, effectiveSeparation * 0.35))
        * depthMask
    );
    float biomeAmount = saturate(ChromaticRefractionEnabled);
    centerOffset *= biomeAmount;
    channelOffset *= biomeAmount;
    lensOffset *= biomeAmount;
    scintillation *= biomeAmount;
    blend *= biomeAmount;
}

void computePsychedelicRefractionOffset(vec2 uv, float linearDepth, out vec2 offset, out float blend) {
    offset = vec2(0.0);
    blend = 0.0;
    if (PsychedelicRefractionEnabled <= 1.0e-4 || PsychedelicRefractionStrength <= 1.0e-4) {
        return;
    }

    float startDistance = max(PsychedelicRefractionStartDistance, NearPlane);
    float maxDistance = max(startDistance + 1.0, PsychedelicRefractionMaxDistance);
    float depthSpan = maxDistance - startDistance;
    float fadeInWidth = max(0.25, min(3.0, depthSpan * 0.04));
    float fadeOutWidth = max(6.0, min(24.0, depthSpan * 0.20));
    float depthMask = smoothstep(startDistance, startDistance + fadeInWidth, linearDepth)
        * (1.0 - smoothstep(maxDistance - fadeOutWidth, maxDistance, linearDepth));
    if (depthMask <= 1.0e-4) {
        return;
    }

    float aspect = OutSize.x / max(OutSize.y, 1.0);
    vec2 centered = uv - 0.5;
    vec2 position = centered * vec2(aspect, 1.0);
    position.x += PsychedelicRefractionCameraAnchorX;
    position.y += PsychedelicRefractionCameraAnchorY;
    float animationTime = HeatShimmerTime * max(PsychedelicRefractionSpeed, 0.0);
    float scale = max(PsychedelicRefractionScale, 1.0);

    float slowBreath = sin(animationTime * 0.37 + length(position) * scale * 0.18);
    vec2 warpedPosition = position;
    warpedPosition += vec2(
        sin(position.y * scale * 0.18 + animationTime * 0.41),
        cos(position.x * scale * 0.14 - animationTime * 0.33)
    ) * (0.014 + PsychedelicRefractionDetail * 0.024);

    float waveA = sin((warpedPosition.x * 0.41 + warpedPosition.y * 0.91) * scale + animationTime * 0.58 + slowBreath * 0.72);
    float waveB = sin((-warpedPosition.x * 0.76 + warpedPosition.y * 0.38) * scale * 0.61 - animationTime * 0.43 + 2.11 + waveA * 0.48);
    float waveC = sin((warpedPosition.x * 0.59 + warpedPosition.y * 0.64) * scale * 0.31 + animationTime * 0.27 + waveB * 0.63);
    float fineWave = sin((warpedPosition.x - warpedPosition.y * 1.24) * scale * 1.43 - animationTime * 0.81 + waveC * 0.77)
        * PsychedelicRefractionDetail;

    float vertical = waveA * 0.50 + waveB * 0.30 - waveC * 0.24 + fineWave * 0.18 + slowBreath * 0.18;
    float horizontal = (waveB * 0.46 - waveA * 0.22 + waveC * 0.32 + fineWave * 0.16)
        * PsychedelicRefractionHorizontal;

    float radialDistance = length(centered * vec2(aspect, 1.0));
    float edgeMask = smoothstep(0.08, 0.72, radialDistance);
    float peripheralMask = mix(1.0, edgeMask, saturate(PsychedelicRefractionPeripheral));
    float breathingPulse = 0.92 + 0.16 * sin(animationTime * 0.29 + waveC * 0.65);
    float pixelAmplitude = (0.65 + PsychedelicRefractionStrength * 10.0)
        * depthMask
        * peripheralMask
        * breathingPulse;
    float biomeAmount = saturate(PsychedelicRefractionEnabled);
    offset = vec2(horizontal, vertical) * pixelAmplitude * biomeAmount / max(OutSize, vec2(1.0));
    blend = saturate(PsychedelicRefractionBlend * (0.25 + PsychedelicRefractionStrength * 0.85) * depthMask * peripheralMask) * biomeAmount;
}

void main() {
    vec2 uv = gl_FragCoord.xy / OutSize;
    vec4 sceneSample = texture(MainSampler, uv);
    vec3 color = sceneSample.rgb;

    float rawDepth = texture(MainDepthSampler, uv).r;
    float linearDepth = linearizeDepth(rawDepth);
    float normDepth = depthNorm(linearDepth);

    if (DepthOfFieldEnabled > 0.5 && DepthOfFieldIntensity > 1.0e-4 && DepthOfFieldFade > 1.0e-4) {
        color = applyDepthOfField(uv, color, rawDepth);
    }

    if (MotionBlurEnabled > 0.5 && MotionBlurStrength > 1.0e-4) {
        color = applyMotionBlur(uv, color);
    }

	color = applyColorGrade(color);

    if ((HeatEnabled > 1.0e-4 || LayeredAtmosphereEnabled > 1.0e-4 || ColdRefractionEnabled > 1.0e-4 || ChromaticRefractionEnabled > 1.0e-4 || PsychedelicRefractionEnabled > 1.0e-4) && rawDepth > 0.0001) {
        vec2 currentHeatOffset;
        float currentHeatBlend;
        computeCurrentHeatOffset(uv, color, linearDepth, currentHeatOffset, currentHeatBlend);
        vec2 layeredOffset;
        float layeredBlend;
        computeLayeredAtmosphereOffset(uv, linearDepth, layeredOffset, layeredBlend);
        vec2 coldOffset;
        float coldBlend;
        computeColdRefractionOffset(uv, linearDepth, coldOffset, coldBlend);
        vec2 chromaticCenterOffset;
        vec2 chromaticChannelOffset;
        vec2 chromaticLensOffset;
        float chromaticScintillation;
        float chromaticBlend;
        computeChromaticRefraction(
            uv,
            linearDepth,
            chromaticCenterOffset,
            chromaticChannelOffset,
            chromaticLensOffset,
            chromaticScintillation,
            chromaticBlend
        );
        vec2 psychedelicOffset;
        float psychedelicBlend;
        computePsychedelicRefractionOffset(uv, linearDepth, psychedelicOffset, psychedelicBlend);
        vec2 combinedOffset = currentHeatOffset + layeredOffset + coldOffset + chromaticCenterOffset + chromaticLensOffset + psychedelicOffset;
        float combinedBlend = max(currentHeatBlend, max(layeredBlend, max(coldBlend, max(chromaticBlend, psychedelicBlend))));
        float distortionMagnitude = dot(combinedOffset, combinedOffset)
            + dot(chromaticChannelOffset, chromaticChannelOffset)
            + abs(chromaticScintillation);
        if (combinedBlend > 1.0e-4 && distortionMagnitude > 1.0e-12) {
            vec2 centerUv = clamp(uv + combinedOffset, vec2(0.0), vec2(1.0));
            vec3 distorted;
            if (chromaticBlend > 1.0e-4 && dot(chromaticChannelOffset, chromaticChannelOffset) > 1.0e-12) {
                vec2 redUv = clamp(centerUv + chromaticChannelOffset, vec2(0.0), vec2(1.0));
                vec2 blueUv = clamp(centerUv - chromaticChannelOffset, vec2(0.0), vec2(1.0));
                distorted = vec3(
                    texture(MainSampler, redUv).r,
                    texture(MainSampler, centerUv).g,
                    texture(MainSampler, blueUv).b
                );
            } else {
                distorted = texture(MainSampler, centerUv).rgb;
            }
            distorted *= max(0.0, 1.0 + chromaticScintillation);
            color = mix(color, distorted, saturate(combinedBlend));
        }
    }

    if (GradientEnabled > 0.5 && GradientIntensity > 1.0e-4) {
        float nightReach = GradientNightSkyReach * (1.0 - DayFactor);
        float reach = clamp(GradientSkyReach + nightReach, 0.0, 3.0);
        float softness = max(GradientSoftness, 0.25);
        float hazeVertical = clamp((1.0 - uv.y) * (1.0 + reach) + reach * 0.24 + GradientTilt * 0.35, 0.0, 1.0);
        float hazeCurve = pow(hazeVertical, max(GradientCurve / softness, 0.08));

        vec3 hazeBottom = vec3(WorldBiomeGradientBottomColorR, WorldBiomeGradientBottomColorG, WorldBiomeGradientBottomColorB);
        vec3 hazeTop = vec3(WorldBiomeGradientTopColorR, WorldBiomeGradientTopColorG, WorldBiomeGradientTopColorB);
        vec3 twilightSun = vec3(WorldBiomeSkyTwilightSunColorR, WorldBiomeSkyTwilightSunColorG, WorldBiomeSkyTwilightSunColorB);
        vec3 twilightZenith = vec3(WorldBiomeSkyTwilightZenithColorR, WorldBiomeSkyTwilightZenithColorG, WorldBiomeSkyTwilightZenithColorB);
        float twilight = saturate(TwilightFactor);
        hazeBottom = applyWarmth(hazeBottom, -0.0708);
        hazeTop = applyWarmth(hazeTop, 0.009);
        float nightMix = (1.0 - DayFactor) * (1.0 - twilight * 0.82);
        hazeBottom = mix(hazeBottom, vec3(0.09, 0.10, 0.14), nightMix);
        hazeTop = mix(hazeTop, vec3(0.13, 0.15, 0.24), nightMix);
        hazeBottom = mix(hazeBottom, twilightSun, twilight * 0.88);
        hazeTop = mix(hazeTop, twilightZenith, twilight * 0.45);
        vec3 hazeColor = mix(hazeTop, hazeBottom, hazeCurve);

        float skyPixel = skyDepthMask(rawDepth);
        float depthStart = max(BiomeFogStart * 0.55, NearPlane + 1.0);
        float depthEnd = max(depthStart + 1.0, BiomeFogEnd);
        float depthMask = smoothstep(depthStart, depthEnd, linearDepth);
        float hazeMask = depthMask * (1.0 - skyPixel);
        hazeMask *= GradientIntensity * WorldBiomeGradientIntensityScale;

        float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) * (GradientDither / 255.0);
        color = mix(color, hazeColor + dither, saturate(hazeMask));
    }

    color = applyGroundFog(uv, color, rawDepth, linearDepth);

    if (WetWeatherEnabled > 0.5 && Rain > 1.0e-4) {
        float wetMask = Rain * saturate(1.0 - normDepth * 0.6);
        float highlight = pow(saturate(sceneLuma(color)), 3.4);
        color += highlight * WetWeatherSpecularBoost * wetMask;
        color += vec3(0.03, 0.035, 0.045) * WetWeatherBloomBoost * wetMask;
    }

    if (UnderwaterPolishEnabled > 0.5 && UnderwaterFlag > 0.5) {
        float caustic = sin((uv.x + uv.y) * 42.0 + HeatShimmerTime * 3.6)
            + sin((uv.x - uv.y * 1.25) * 64.0 - HeatShimmerTime * 2.8);
        caustic = 0.5 + 0.5 * (caustic * 0.5);
        float causticMask = UnderwaterCausticStrength * saturate(1.0 - normDepth * 0.5);
        float causticDaylight = smoothstep(0.0, 0.35, saturate(DayFactor));
        causticMask *= mix(0.08, 1.0, causticDaylight);
        color += vec3(0.02, 0.06, 0.08) * caustic * causticMask;
        float rolloff = UnderwaterColorRolloff * saturate(normDepth * 1.4 + 0.2);
        vec3 underwaterTint = vec3(0.10, 0.26, 0.38);
        color = mix(color, underwaterTint, rolloff);
    }

    if (GodRaysEnabled > 0.5 && GodRaySceneData.z > 0.5 && GodRaySceneData.y <= GodRaysRainCutoff) {
        float sunW = GodRaySunLight.w;
        float moonW = GodRayMoonLight.w;

        float aspect = MainSize.x / max(MainSize.y, 1.0);
        vec3 rays = vec3(0.0);

        if (sunW > 0.5) {
            vec3 sunGlowColor = max(GodRaySunColor.rgb, vec3(0.0));
            float sunSourceVisibility = clamp(GodRaySunColor.a, 0.0, 1.0);
            vec3 sunRays = computeGodRays(uv, GodRaySunLight.xy, GodRaySunLight.z, sunGlowColor, aspect) * sunW * GodRaysStrength;
            sunRays += sunGlowColor * getGodRayDirectGlow(uv, GodRaySunLight.xy, GodRaySunLight.z, aspect) * sunW * GodRaysStrength * GodRaysExposure;
            vec2 sunDelta = uv - GodRaySunLight.xy;
            sunDelta.x *= aspect;
            float sunDistance = length(sunDelta);
            float discProtection = 1.0 - smoothstep(
                max(GodRaysSunSize * 0.55, 1.0e-4),
                max(GodRaysSunSize * 1.45, 2.0e-4),
                sunDistance
            );
            sunRays = mix(sunRays, min(sunRays, vec3(0.10)), discProtection);
            float sunRayPeak = max(sunRays.r, max(sunRays.g, sunRays.b));
            if (sunRayPeak > 0.32) {
                sunRays *= 0.32 / sunRayPeak;
            }
            rays += sunRays * sunSourceVisibility;
        }

        if (moonW > 0.5) {
            rays += computeGodRays(uv, GodRayMoonLight.xy, GodRayMoonLight.z, MOON_GLOW_COLOR, aspect) * moonW * GodRaysMoonStrength;
            rays += MOON_GLOW_COLOR * getGodRayDirectGlow(uv, GodRayMoonLight.xy, GodRayMoonLight.z, aspect) * moonW * GodRaysMoonStrength * GodRaysExposure;
        }

        float geometryMask = geometryDepthMask(rawDepth);
        float clearSkyMask = clearSkyDepthMask(rawDepth);
        float storyCloudMask = saturate(CloudLayerEnabled)
            * step(0.5, CloudStyle)
            * geometryMask
            * (1.0 - smoothstep(REVERSED_Z_CLEAR_EPSILON, 0.015, rawDepth))
            * smoothstep(0.32, 0.55, uv.y);
        vec2 cloudEdgeTexel = 2.5 / max(MainSize, vec2(1.0));
        float nearbySky = (
            clearSkyDepthMask(texture(MainDepthSampler, clamp(uv + vec2(cloudEdgeTexel.x, 0.0), vec2(0.0), vec2(1.0))).r)
            + clearSkyDepthMask(texture(MainDepthSampler, clamp(uv - vec2(cloudEdgeTexel.x, 0.0), vec2(0.0), vec2(1.0))).r)
            + clearSkyDepthMask(texture(MainDepthSampler, clamp(uv + vec2(0.0, cloudEdgeTexel.y), vec2(0.0), vec2(1.0))).r)
            + clearSkyDepthMask(texture(MainDepthSampler, clamp(uv - vec2(0.0, cloudEdgeTexel.y), vec2(0.0), vec2(1.0))).r)
        ) * 0.25;
        float cloudTransmission = mix(0.16, 0.72, smoothstep(0.0, 0.75, nearbySky));
        float receiverMask = max(clearSkyMask, geometryMask * mix(1.0, cloudTransmission, storyCloudMask));
        vec3 rayContribution = rays * receiverMask;
        vec3 rayHeadroom = max(vec3(0.0), (vec3(0.98) - clamp(color, vec3(0.0), vec3(1.0))) * 0.20);
        rayContribution = min(rayContribution, rayHeadroom);
        color += rayContribution;
    }

    if (GodRaySceneData.w > 1.0e-4 && GodRaySceneData.z > 0.5) {
        float lensAspect = MainSize.x / max(MainSize.y, 1.0);
        vec3 lensFlare = computeWorldAmbienceLensFlare(
            uv,
            GodRaySunLight.xy,
            GodRaySunLight.z,
            GodRaySunLight.w,
            GodRaySceneData.w,
            lensAspect,
            rawDepth
        );
        color += lensFlare * (1.0 - min(color, vec3(0.92)) * 0.35);
    }

    if (LowLightDesaturationEnabled > 0.5 && LowLightDesaturationStrength > 1.0e-4) {
        color = applyLowLightDesaturation(color, rawDepth);
    }

	if (CameraNoiseEnabled > 0.5 && CameraNoiseIntensity > 1.0e-4) {
		color = applyCameraNoise(color);
	}

	if (VignetteShape.x > 0.5) {
		color = applyVignette(uv, color);
	}

    if (AdaptivePaletteSettings.x > 0.5) {
        color = applyAdaptivePalette(clamp(color, vec3(0.0), vec3(1.0)));
    }

    fragColor = vec4(max(color, vec3(0.0)), sceneSample.a);
}
