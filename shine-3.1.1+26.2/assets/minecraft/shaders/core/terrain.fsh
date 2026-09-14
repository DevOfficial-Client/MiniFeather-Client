#version 330

#moj_import <minecraft:fog.glsl>
#moj_import <minecraft:globals.glsl>
#moj_import <minecraft:chunksection.glsl>

#ifdef VULKAN

uniform sampler2D Sampler0;

in float sphericalVertexDistance;
in float cylindricalVertexDistance;
in vec4 vertexColor;
in vec2 texCoord0;

out vec4 fragColor;

vec4 shineVanillaSampleNearest(sampler2D source, vec2 uv, vec2 pixelSize, vec2 du, vec2 dv, vec2 texelScreenSize) {
    vec2 uvTexelCoords = uv / pixelSize;
    vec2 texelCenter = round(uvTexelCoords) - 0.5f;
    vec2 texelOffset = uvTexelCoords - texelCenter;
    texelOffset = (texelOffset - 0.5f) * pixelSize / texelScreenSize + 0.5f;
    texelOffset = clamp(texelOffset, 0.0f, 1.0f);
    uv = (texelCenter + texelOffset) * pixelSize;
    return textureGrad(source, uv, du, dv);
}

vec4 shineVanillaSampleNearest(sampler2D source, vec2 uv, vec2 pixelSize) {
    vec2 du = dFdx(uv);
    vec2 dv = dFdy(uv);
    vec2 texelScreenSize = sqrt(du * du + dv * dv);
    return shineVanillaSampleNearest(source, uv, pixelSize, du, dv, texelScreenSize);
}

vec4 shineVanillaSampleRgss(sampler2D source, vec2 uv, vec2 pixelSize) {
    vec2 du = dFdx(uv);
    vec2 dv = dFdy(uv);
    vec2 texelScreenSize = sqrt(du * du + dv * dv);
    float maxTexelSize = max(texelScreenSize.x, texelScreenSize.y);
    float minPixelSize = min(pixelSize.x, pixelSize.y);
    float blendFactor = smoothstep(minPixelSize, minPixelSize * 2.0, maxTexelSize);
    float duLength = length(du);
    float dvLength = length(dv);
    float mipLevelExact = max(0.0, log2(sqrt(min(duLength, dvLength) * max(duLength, dvLength)) / minPixelSize));
    float mipLevelLow = floor(mipLevelExact);
    float mipLevelHigh = mipLevelLow + 1.0;
    float mipBlend = fract(mipLevelExact);
    const vec2 offsets[4] = vec2[](
        vec2(0.125, 0.375),
        vec2(-0.125, -0.375),
        vec2(0.375, -0.125),
        vec2(-0.375, 0.125)
    );
    vec4 rgssColorLow = vec4(0.0);
    vec4 rgssColorHigh = vec4(0.0);
    for (int i = 0; i < 4; ++i) {
        vec2 sampleUv = uv + offsets[i] * pixelSize;
        rgssColorLow += textureLod(source, sampleUv, mipLevelLow);
        rgssColorHigh += textureLod(source, sampleUv, mipLevelHigh);
    }
    vec4 rgssColor = mix(rgssColorLow * 0.25, rgssColorHigh * 0.25, mipBlend);
    vec4 nearestColor = shineVanillaSampleNearest(source, uv, pixelSize, du, dv, texelScreenSize);
    return mix(nearestColor, rgssColor, blendFactor);
}

void main() {
    vec2 pixelSize = 1.0f / TextureSize;
    vec4 color = (UseRgss == 1
        ? shineVanillaSampleRgss(Sampler0, texCoord0, pixelSize)
        : shineVanillaSampleNearest(Sampler0, texCoord0, pixelSize)) * vertexColor;
    color = mix(FogColor * vec4(1, 1, 1, color.a), color, ChunkVisibility);
#ifdef ALPHA_CUTOUT
    if (color.a < ALPHA_CUTOUT) {
        discard;
    }
#endif
    fragColor = apply_fog(color, sphericalVertexDistance, cylindricalVertexDistance, FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
}

#else

uniform sampler2D Sampler0;
uniform sampler2D MaskSampler;
uniform sampler2D ShineWaterCausticsSampler;
uniform sampler2D ShineWaterEdgeFoamSampler;
uniform sampler2D ShineFoliageWindMaskSampler;
uniform int u_ShineTerrainCausticsEnabled;
uniform int u_ShineTerrainCausticsTopFacesOnly;
uniform int u_ShineTerrainCausticsRequireSunlight;
uniform float u_ShineTerrainCausticsSunlightThreshold;
uniform float u_ShineTerrainCausticsShadeFade;
uniform float u_ShineTerrainCausticsDayFactor;
uniform float u_ShineTerrainCausticsStrength;
uniform float u_ShineTerrainCausticsScale;
uniform float u_ShineTerrainCausticsSpeed;
uniform float u_ShineTerrainCausticsMinY;
uniform float u_ShineTerrainCausticsMaxY;
uniform float u_ShineTerrainCausticsTime;
uniform int u_ShineShoreFoamEnabled;
uniform float u_ShineShoreFoamOpacity;
uniform float u_ShineShoreFoamThickness;
uniform float u_ShineShoreFoamSpeed;
uniform float u_ShineShoreFoamScale;
uniform float u_ShineShoreFoamBreakup;
uniform vec3 u_ShineShoreFoamColor;
uniform int u_ShineFoliageWindEnabled;
uniform int u_ShineFoliageWindMode;
uniform float u_ShineFoliageWindTime;
uniform float u_ShineFoliageWindPhase;
uniform float u_ShineFoliageWindStrength;
uniform float u_ShineFoliageWindSpeed;
uniform float u_ShineFoliageWindFrameRate;
uniform float u_ShineFoliageWindMaxOffset;
uniform float u_ShineFoliageWindDirection;
uniform float u_ShineFoliageWindLeafWave;
uniform float u_ShineFoliageWindLeafDrift;
uniform float u_ShineFoliageWindGrassSlice;
uniform float u_ShineFoliageWindGrassDrift;
uniform float u_ShineFoliageWindTopBias;
uniform float u_ShineFoliageWindGust;
uniform int u_ShineFoliageWindGroundEnabled;
uniform int u_ShineFoliageWindLeavesEnabled;
uniform float u_ShineFoliageWindLeafStrength;
uniform float u_ShineFoliageWindLeafSpeed;
uniform float u_ShineFoliageWindLeafMaxOffset;
uniform float u_ShineFoliageWindLeafFlutter;
uniform int u_ShineBlockMotionEnabled;
uniform float u_ShineBlockMotionTime;
uniform int u_ShineBlockMotionProfileCount;
uniform vec4 u_ShineBlockMotionProfileA[16];
uniform vec4 u_ShineBlockMotionProfileB[16];

in float sphericalVertexDistance;
in float cylindricalVertexDistance;
in vec4 vertexColor;
in vec4 shineUnlitVertexColor;
in vec2 texCoord0;
in float bloomStrength;
flat in int bloomRadiusProfile;
in vec3 shineWorldPos;
in float shineTopFace;
in float shineTerrainCausticsWaterMask;
in float shineTerrainCausticsSkyLight;
flat in int shineWaterSurface;
flat in int shineShoreFoamEdges;
flat in int shineShoreFoamProfile;
flat in int shineBiomeLavaColor;
flat in int shineBlockMotionProfile;
flat in int shineFoliageWindCandidate;
in vec3 shineBlockMotionWorldPos;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 bloomColor;

float shinePackBloomSourceAlpha(float strengthAlpha, int radiusProfile) {
	float strengthCode = floor(clamp(strengthAlpha, 0.0, 1.0) * 63.0 + 0.5);
	return (strengthCode + float(clamp(radiusProfile, 0, 2) * 64)) / 255.0;
}

vec4 sampleBaseTexel(sampler2D sampler, vec2 uv) {
    ivec2 atlasSize = textureSize(sampler, 0);
    ivec2 texel = ivec2(floor(uv * vec2(atlasSize)));
    texel = clamp(texel, ivec2(0), atlasSize - ivec2(1));
    return texelFetch(sampler, texel, 0);
}

vec2 nearestUv(vec2 uv, vec2 pixelSize) {
    vec2 du = dFdx(uv);
    vec2 dv = dFdy(uv);
    vec2 texelScreenSize = sqrt(du * du + dv * dv);
    vec2 safeTexelScreenSize = max(texelScreenSize, vec2(1.0e-6));
    vec2 uvTexelCoords = uv / pixelSize;
    vec2 texelCenter = round(uvTexelCoords) - 0.5f;
    vec2 texelOffset = uvTexelCoords - texelCenter;

    texelOffset = (texelOffset - 0.5f) * pixelSize / safeTexelScreenSize + 0.5f;
    texelOffset = clamp(texelOffset, 0.0f, 1.0f);

    return (texelCenter + texelOffset) * pixelSize;
}

vec4 sampleNearest(sampler2D sampler, vec2 uv, vec2 pixelSize, vec2 du, vec2 dv, vec2 texelScreenSize) {
    vec2 safeTexelScreenSize = max(texelScreenSize, vec2(1.0e-6));
    vec2 uvTexelCoords = uv / pixelSize;
    vec2 texelCenter = round(uvTexelCoords) - 0.5f;
    vec2 texelOffset = uvTexelCoords - texelCenter;

    texelOffset = (texelOffset - 0.5f) * pixelSize / safeTexelScreenSize + 0.5f;
    texelOffset = clamp(texelOffset, 0.0f, 1.0f);

    uv = (texelCenter + texelOffset) * pixelSize;
    return textureGrad(sampler, uv, du, dv);
}

vec4 sampleNearest(sampler2D source, vec2 uv, vec2 pixelSize) {
    vec2 du = dFdx(uv);
    vec2 dv = dFdy(uv);
    vec2 texelScreenSize = sqrt(du * du + dv * dv);
    return sampleNearest(source, uv, pixelSize, du, dv, texelScreenSize);
}

vec4 sampleRGSS(sampler2D source, vec2 uv, vec2 pixelSize) {
    vec2 du = dFdx(uv);
    vec2 dv = dFdy(uv);

    vec2 texelScreenSize = sqrt(du * du + dv * dv);
    float maxTexelSize = max(texelScreenSize.x, texelScreenSize.y);

    float minPixelSize = min(pixelSize.x, pixelSize.y);
    float transitionStart = minPixelSize * 1.0;
    float transitionEnd = minPixelSize * 2.0;
    float blendFactor = smoothstep(transitionStart, transitionEnd, maxTexelSize);

    float duLength = length(du);
    float dvLength = length(dv);
    float minDerivative = min(duLength, dvLength);
    float maxDerivative = max(duLength, dvLength);
    float effectiveDerivative = sqrt(minDerivative * maxDerivative);
    float shineRgssDerivativeRatio = effectiveDerivative / minPixelSize;
    float mipLevelExact = 0.0;
    if (shineRgssDerivativeRatio > 1.0 && !isinf(shineRgssDerivativeRatio)) {
        mipLevelExact = log2(shineRgssDerivativeRatio);
    }

    float mipLevelLow = floor(mipLevelExact);
    float mipLevelHigh = mipLevelLow + 1.0;
    float mipBlend = fract(mipLevelExact);

    const vec2 offsets[4] = vec2[](
        vec2(0.125, 0.375),
        vec2(-0.125, -0.375),
        vec2(0.375, -0.125),
        vec2(-0.375, 0.125)
    );

    vec4 rgssColorLow = vec4(0.0);
    vec4 rgssColorHigh = vec4(0.0);
    for (int i = 0; i < 4; ++i) {
        vec2 sampleUV = uv + offsets[i] * pixelSize;
        rgssColorLow += textureLod(source, sampleUV, mipLevelLow);
        rgssColorHigh += textureLod(source, sampleUV, mipLevelHigh);
    }
    rgssColorLow *= 0.25;
    rgssColorHigh *= 0.25;

    vec4 rgssColor = mix(rgssColorLow, rgssColorHigh, mipBlend);
    vec4 nearestColor = sampleNearest(source, uv, pixelSize, du, dv, texelScreenSize);

    return mix(nearestColor, rgssColor, blendFactor);
}

vec4 shineSampleFoliageWindMaskData(vec2 uv) {
    ivec2 maskSize = textureSize(ShineFoliageWindMaskSampler, 0);
    ivec2 texel = ivec2(floor(uv * vec2(maskSize)));
    texel = clamp(texel, ivec2(0), maskSize - ivec2(1));
    return texelFetch(ShineFoliageWindMaskSampler, texel, 0);
}

vec3 shineSampleFoliageWindMask(vec2 uv) {
    return shineSampleFoliageWindMaskData(uv).rgb;
}

float shineGrassMaskSubtype(vec4 categorySample) {
    return floor(floor(categorySample.r * 255.0 + 0.5) / 64.0);
}

float shineGrassMaskLocalX(vec4 categorySample) {
    return mod(floor(categorySample.r * 255.0 + 0.5), 64.0) / 63.0;
}

vec4 shineOriginalGrassMaskData = vec4(0.0);

bool shineIsGrassFoliageWind(vec2 uv) {
    return shineSampleFoliageWindMask(uv).b > 0.5;
}

float shineFoliageWindSampleTime(float sourceTime) {
    float frameRate = max(u_ShineFoliageWindFrameRate, 0.0);
    if (frameRate < 0.5) {
        return sourceTime;
    }
    return floor(sourceTime * frameRate) / frameRate;
}

vec4 shineFetchGrassWindTexel(sampler2D source, ivec2 texel, ivec2 originalTexel, ivec2 atlasSize, vec4 fallback) {
	if (any(lessThan(texel, ivec2(0))) || any(greaterThanEqual(texel, atlasSize))) {
        return fallback;
    }
    vec2 sampleUv = (vec2(texel) + vec2(0.5)) / vec2(atlasSize);
    vec4 color = texelFetch(source, texel, 0);
    vec4 shiftedMask = shineSampleFoliageWindMaskData(sampleUv);
    if (shiftedMask.b <= 0.5 || color.a <= 0.05 || abs(shineGrassMaskSubtype(shiftedMask) - shineGrassMaskSubtype(shineOriginalGrassMaskData)) > 0.5) {
        return fallback;
    }
	ivec2 offset = texel - originalTexel;
	float originalX = shineGrassMaskLocalX(shineOriginalGrassMaskData);
	float shiftedX = shineGrassMaskLocalX(shiftedMask);
	if ((offset.x > 0 && shiftedX + 0.02 < originalX) || (offset.x < 0 && shiftedX - 0.02 > originalX)) {
		return fallback;
	}
	if ((offset.y > 0 && shiftedMask.a > shineOriginalGrassMaskData.a + 0.12) || (offset.y < 0 && shiftedMask.a + 0.12 < shineOriginalGrassMaskData.a)) {
		return fallback;
	}
    return color;
}

vec4 shineSampleGrassFoliageWindColor(sampler2D source, vec2 originalUv, vec2 windUv) {
    ivec2 atlasSize = textureSize(source, 0);
    ivec2 originalTexel = ivec2(floor(originalUv * vec2(atlasSize)));
    originalTexel = clamp(originalTexel, ivec2(0), atlasSize - ivec2(1));
    vec4 fallback = vec4(0.0);
    ivec2 snappedTexel = originalTexel + ivec2(round(windUv * vec2(atlasSize) - originalUv * vec2(atlasSize)));
	return shineFetchGrassWindTexel(source, snappedTexel, originalTexel, atlasSize, fallback);
}

vec2 shineApplyFoliagePixelWind(vec2 uv, vec3 worldPos, float windCandidate) {
    if (u_ShineFoliageWindEnabled == 0 || u_ShineFoliageWindMode == 1 || windCandidate < 0.5) {
        return uv;
    }

	vec4 categorySample = shineSampleFoliageWindMaskData(uv);
	shineOriginalGrassMaskData = categorySample;
	vec3 categoryMask = categorySample.rgb;
	float categoryPresence = max(categoryMask.r, max(categoryMask.g, categoryMask.b));
	if (categoryPresence <= 0.5) {
		return uv;
	}
	float leafMask = step(0.5, categoryMask.g);
	float grassMask = step(0.5, categoryMask.b) * (1.0 - leafMask);
	float genericMask = step(0.5, categoryMask.r) * (1.0 - leafMask) * (1.0 - grassMask);
	float grassSubtype = shineGrassMaskSubtype(categorySample);
	float tallGrassBottom = grassMask * (1.0 - step(0.5, abs(grassSubtype - 1.0)));
	float tallGrassTop = grassMask * (1.0 - step(0.5, abs(grassSubtype - 2.0)));
	float tallGrassMask = max(tallGrassBottom, tallGrassTop);
	float leafWeight = leafMask * float(u_ShineFoliageWindLeavesEnabled != 0);
	float groundWeight = max(grassMask, genericMask) * float(u_ShineFoliageWindGroundEnabled != 0);
	if (max(leafWeight, groundWeight) <= 0.5) {
		return uv;
	}

    ivec2 atlasSize = textureSize(Sampler0, 0);
    vec2 pixelSize = 1.0 / vec2(max(atlasSize, ivec2(1)));
    vec2 blockCell = floor(worldPos.xz);
    vec2 atlasCoord = uv * vec2(atlasSize);
    vec2 atlasPixel = floor(atlasCoord);
    float speed = max(u_ShineFoliageWindSpeed, 0.0);
	float sampledTime = shineFoliageWindSampleTime(u_ShineFoliageWindTime);
	float time = u_ShineFoliageWindPhase;
	float leafTime = time * (speed > 1.0e-5 ? max(u_ShineFoliageWindLeafSpeed, 0.0) / speed : 0.0);
	float blockPhase = dot(blockCell, vec2(0.37, 0.61)) + floor(worldPos.y) * 0.17 * (1.0 - tallGrassMask);
    float gustWave = 0.5 + 0.5 * sin(time * 0.43 + blockPhase * 0.7);
    gustWave = clamp(gustWave + 0.22 * sin(time * 0.17 + blockPhase * 1.9), 0.0, 1.0);
    float gust = mix(1.0, 0.35 + gustWave * 1.35, clamp(u_ShineFoliageWindGust, 0.0, 1.0));
    vec2 direction = normalize(vec2(cos(radians(u_ShineFoliageWindDirection)), sin(radians(u_ShineFoliageWindDirection))) + vec2(1.0e-5, 0.0));
	vec2 crossDirection = vec2(-direction.y, direction.x);

	if (leafWeight > 0.5) {
		float leafTravel = dot(worldPos.xz, direction) * 0.95 + dot(worldPos.xz, crossDirection) * 0.21 + worldPos.y * 0.63;
		float leafPhase = leafTime * 0.74 - leafTravel;
		float canopy = sin(leafPhase) + 0.32 * sin(leafTime * 0.31 - dot(worldPos.xz, crossDirection) * 1.13 + worldPos.y * 0.47);
		float flutter = sin(leafTime * 3.35 + dot(worldPos, vec3(1.70, 1.13, 1.41))) * u_ShineFoliageWindLeafFlutter;
		float swayControl = sqrt(max(u_ShineFoliageWindLeafDrift, 0.0));
		float liftControl = sqrt(max(u_ShineFoliageWindLeafWave, 0.0));
		float leafAmount = max(u_ShineFoliageWindLeafStrength, 0.0) * max(u_ShineFoliageWindLeafMaxOffset, 0.0) * gust;
		vec2 leafRawOffset = direction * (canopy * swayControl * 0.78 + flutter * 0.18)
			+ crossDirection * (sin(leafPhase * 0.61 + worldPos.y * 0.83) * swayControl * 0.18 + flutter * 0.06)
			+ vec2(0.0, (sin(leafPhase * 0.79 + worldPos.x * 0.52) * liftControl * 0.30 + flutter * 0.08));
		vec2 leafTexelOffset = round(leafRawOffset * leafAmount);
		if (dot(leafTexelOffset, leafTexelOffset) < 0.25) {
			return uv;
		}
		vec2 shiftedLeaf = uv + leafTexelOffset * pixelSize;
		return shineSampleFoliageWindMask(shiftedLeaf).g > 0.5 ? shiftedLeaf : uv;
	}

	float localGrassX = shineGrassMaskLocalX(categorySample);
	float topBias = clamp(u_ShineFoliageWindTopBias, 0.0, 3.0) / 3.0;
	float singleBladeHeight = clamp(categorySample.a, 0.0, 1.0);
	float bladeHeight = mix(singleBladeHeight, singleBladeHeight * 0.5, tallGrassBottom);
	bladeHeight = mix(bladeHeight, 0.5 + singleBladeHeight * 0.5, tallGrassTop);
	float bladeTextureY = 1.0 - bladeHeight;
    float bladeFlex = smoothstep(mix(0.02, 0.48, topBias), 1.0, bladeHeight);
    bladeFlex = pow(bladeFlex, mix(0.85, 2.20, topBias));
    float bladeBody = smoothstep(mix(0.08, 0.42, topBias), 0.92, bladeFlex);
    float bladeTip = smoothstep(mix(0.36, 0.68, topBias), 1.0, bladeFlex);
    float windDelay = dot(blockCell, direction) * 0.76 + dot(blockCell, vec2(-direction.y, direction.x)) * 0.12;
    float grassFrameTime = sampledTime;
    float grassEnergyTime = grassFrameTime * 0.12 + time * 0.035;
    float grassEnergyWave = 0.54
        + 0.34 * sin(grassEnergyTime + blockPhase * 0.23)
        + 0.18 * sin(grassEnergyTime * 2.37 - blockPhase * 0.31 + 1.4);
    float grassEnergy = mix(0.18, 1.0, smoothstep(0.12, 0.94, clamp(grassEnergyWave, 0.0, 1.0)));
    float grassPhase = grassFrameTime * 0.22 + time * 0.20 - windDelay
        + 0.32 * sin(grassEnergyTime * 1.61 + blockPhase * 0.41);
    float grassLoop = sin(grassPhase) + 0.22 * sin(grassPhase * 0.47 + blockPhase * 0.8 + 1.1);
    float easedSway = clamp(grassLoop * 0.68 * grassEnergy, -1.0, 1.0);
    float sliceTravel = grassPhase * 0.46 + 0.28 * sin(grassPhase * 0.19 + blockPhase);
	float highResWave = sin((bladeTextureY * 0.92 + localGrassX * 0.18) * 6.2831853 - sliceTravel);
	highResWave += 0.24 * sin((bladeTextureY * 1.84 - localGrassX * 0.22) * 6.2831853 - sliceTravel * 0.62 + blockPhase * 0.37);
    float sliceSide = clamp(highResWave * 0.72, -1.0, 1.0);
    float sliceControl = u_ShineFoliageWindGrassSlice / (1.0 + max(u_ShineFoliageWindGrassSlice - 0.75, 0.0) * 0.45);
    vec2 grassSideAxis = vec2(1.0, 0.0);
    float grassDrift = (easedSway * 0.44 * bladeFlex + easedSway * 0.14 * bladeTip) * u_ShineFoliageWindGrassDrift;
    float grassSliceShift = sliceSide * bladeBody * grassEnergy * 0.10 * sliceControl;
	vec2 grassOffset = grassSideAxis * (grassDrift + grassSliceShift)
		+ vec2(0.0, (sin(grassPhase * 0.72 + localGrassX * 1.60) * 0.06 * bladeFlex - sliceSide * bladeBody * grassEnergy * 0.015) * sliceControl);

	float grassAmount = max(u_ShineFoliageWindStrength, 0.0) * max(1.0, u_ShineFoliageWindMaxOffset) * gust;
	vec2 rawOffset = grassOffset * groundWeight * grassAmount;
    if (grassMask > 0.5 && u_ShineFoliageWindGroundEnabled != 0) {
        vec2 grassRawOffset = rawOffset;
        float grassLimit = max(1.0, u_ShineFoliageWindMaxOffset);
        grassRawOffset = clamp(grassRawOffset, vec2(-grassLimit), vec2(grassLimit));
        vec2 grassTexelOffset = round(grassRawOffset);
		grassTexelOffset = clamp(atlasPixel + grassTexelOffset, vec2(0.0), vec2(atlasSize - ivec2(1))) - atlasPixel;
        if (dot(grassTexelOffset, grassTexelOffset) < 0.25) {
            return uv;
        }
        return uv + grassTexelOffset * pixelSize;
    }

    vec2 texelOffset = round(rawOffset);
    if (dot(texelOffset, texelOffset) < 0.25) {
        return uv;
    }
    vec2 shifted = uv + texelOffset * pixelSize;
    vec3 shiftedMask = shineSampleFoliageWindMask(shifted);
    bool shiftedGeneric = shiftedMask.g <= 0.5 && shiftedMask.b <= 0.5 && shiftedMask.r > 0.5;
    return shiftedGeneric ? shifted : uv;
}

vec2 shineApplyFoliageSmoothRootAnchor(vec2 uv, vec3 worldPos, float windCandidate) {
    float anchorControl = clamp(u_ShineFoliageWindTopBias / 3.0, 0.0, 1.0);
	if (u_ShineFoliageWindEnabled == 0 || u_ShineFoliageWindGroundEnabled == 0 || u_ShineFoliageWindMode != 1 || windCandidate < 0.5 || anchorControl <= 0.0 || !shineIsGrassFoliageWind(uv)) {
        return uv;
    }

    ivec2 atlasSize = textureSize(Sampler0, 0);
    vec2 atlasSizeFloat = vec2(max(atlasSize, ivec2(1)));
    vec2 atlasCoord = uv * atlasSizeFloat;
    vec2 atlasPixel = floor(clamp(atlasCoord - vec2(0.001), vec2(0.0), atlasSizeFloat - vec2(1.0)));
	vec4 categorySample = shineSampleFoliageWindMaskData(uv);
	vec3 categoryMask = categorySample.rgb;
    float grassMask = step(0.5, categoryMask.b) * (1.0 - step(0.5, categoryMask.g));
	float grassSubtype = shineGrassMaskSubtype(categorySample);
	float tallGrassBottom = grassMask * (1.0 - step(0.5, abs(grassSubtype - 1.0)));
	float tallGrassTop = grassMask * (1.0 - step(0.5, abs(grassSubtype - 2.0)));
	float tallGrassMask = max(tallGrassBottom, tallGrassTop);
	float rootSide = smoothstep(mix(0.58, 0.20, anchorControl), 0.98, 1.0 - categorySample.a) * (1.0 - tallGrassTop);
    float anchor = rootSide * anchorControl;
    if (anchor <= 0.001) {
        return uv;
    }

    float speed = max(u_ShineFoliageWindSpeed, 0.0);
    float time = u_ShineFoliageWindPhase;
    vec2 blockCell = floor(worldPos.xz);
    vec2 direction = normalize(vec2(cos(radians(u_ShineFoliageWindDirection)), sin(radians(u_ShineFoliageWindDirection))) + vec2(1.0e-5, 0.0));
    float blockPhase = dot(blockCell, vec2(0.37, 0.61)) + floor(worldPos.y) * 0.17 * (1.0 - tallGrassMask);
    float windDelay = dot(blockCell, direction) * 0.76 + dot(blockCell, vec2(-direction.y, direction.x)) * 0.12;
    float gustWave = 0.5 + 0.5 * sin(time * 0.43 + blockPhase * 0.7);
    gustWave = clamp(gustWave + 0.22 * sin(time * 0.17 + blockPhase * 1.9), 0.0, 1.0);
    float gust = mix(1.0, 0.35 + gustWave * 1.35, clamp(u_ShineFoliageWindGust, 0.0, 1.0));
    float amount = max(u_ShineFoliageWindStrength, 0.0) * max(u_ShineFoliageWindMaxOffset, 0.0) * gust;
    float grassPhase = time * 0.92 - windDelay + 0.32 * sin(time * 0.31 + blockPhase * 0.41);
    float grassSway = sin(grassPhase) + 0.24 * sin(grassPhase * 0.47 + blockPhase * 0.8 + 1.1);
    grassSway = clamp(grassSway * 0.68, -1.0, 1.0);
    float compensationPixels = clamp(grassSway * u_ShineFoliageWindGrassDrift * amount * mix(0.55, 1.15, anchorControl) * anchor, -5.0, 5.0);
    vec2 shiftedCoord = atlasCoord - vec2(compensationPixels, 0.0);
	shiftedCoord = clamp(shiftedCoord, vec2(0.5), atlasSizeFloat - vec2(0.5));
    return shiftedCoord / atlasSizeFloat;
}

float shineTerrainCausticsYMask(float worldY) {
    float lower = smoothstep(u_ShineTerrainCausticsMinY - 0.5, u_ShineTerrainCausticsMinY + 0.5, worldY);
    float upper = 1.0 - smoothstep(u_ShineTerrainCausticsMaxY - 0.5, u_ShineTerrainCausticsMaxY + 0.5, worldY);
    return clamp(lower * upper, 0.0, 1.0);
}

float shineTerrainCausticsSunlightMask(float skyLight) {
    if (u_ShineTerrainCausticsRequireSunlight == 0) {
        return 1.0;
    }
    float threshold = clamp(u_ShineTerrainCausticsSunlightThreshold, 0.0, 15.0);
    float fade = max(u_ShineTerrainCausticsShadeFade, 0.0);
    if (fade <= 1.0e-4) {
        return step(threshold, skyLight);
    }
    return smoothstep(threshold - fade, threshold, skyLight);
}

float shineTerrainCausticsDaylightMask() {
    // Packed sky light describes open-sky exposure, not whether the sun is up:
    // an exposed block still reports level 15 at midnight. Keep a subtle
    // moonlit trace while preventing the additive caustics from glowing.
    float daylight = smoothstep(0.0, 0.35, clamp(u_ShineTerrainCausticsDayFactor, 0.0, 1.0));
    return mix(0.08, 1.0, daylight);
}

vec4 shineSampleTerrainCaustics(vec3 worldPos, float topFace, float waterMask) {
    if (u_ShineTerrainCausticsEnabled == 0) {
        return vec4(0.0);
    }
    if (waterMask < 0.5) {
        return vec4(0.0);
    }
    // This flat primitive marker is decoded before vertex-color interpolation.
    // Biome blending therefore cannot turn a water surface into caustic terrain.
    if (shineWaterSurface != 0) {
        return vec4(0.0);
    }
    // The water-surface quad carries the shore-foam edge mask. It retains the
    // shared water marker for shoreline rendering, but it is not underwater
    // geometry and must never receive terrain caustics.
    if (shineShoreFoamEdges != 0) {
        return vec4(0.0);
    }
    if (u_ShineTerrainCausticsTopFacesOnly != 0 && topFace < 0.5) {
        return vec4(0.0);
    }

    float sunlightMask = shineTerrainCausticsSunlightMask(shineTerrainCausticsSkyLight);
    if (sunlightMask <= 1.0e-4) {
        return vec4(0.0);
    }

    float yMask = shineTerrainCausticsYMask(worldPos.y);
    if (yMask <= 0.0) {
        return vec4(0.0);
    }

    float animatedTime = u_ShineTerrainCausticsTime * u_ShineTerrainCausticsSpeed;
    ivec2 causticsSize = textureSize(ShineWaterCausticsSampler, 0);
    int frameSize = max(causticsSize.x, 1);
    int frameCount = max(causticsSize.y / frameSize, 1);
    int frame = int(floor(mod(animatedTime * 20.0, float(frameCount))));
    vec2 patternUv = worldPos.xz * u_ShineTerrainCausticsScale;
    ivec2 texel = ivec2(
        int(floor(fract(patternUv.x) * float(frameSize))),
        frame * frameSize + int(floor(fract(patternUv.y) * float(frameSize)))
    );
    texel = clamp(texel, ivec2(0), causticsSize - ivec2(1));
    vec4 caustic = texelFetch(ShineWaterCausticsSampler, texel, 0);
    caustic.a *= sunlightMask * shineTerrainCausticsDaylightMask() * yMask * u_ShineTerrainCausticsStrength;
    return caustic;
}

vec4 shineApplyTerrainCaustics(vec4 color, vec3 worldPos, float topFace) {
    vec4 caustic = shineSampleTerrainCaustics(worldPos, topFace, shineTerrainCausticsWaterMask);
    color.rgb = min(color.rgb + caustic.rgb * caustic.a * color.a, vec3(1.5));
    return color;
}

float shineDerivedTopFace(vec3 worldPos, float vertexTopFace) {
    vec3 dx = dFdx(worldPos);
    vec3 dy = dFdy(worldPos);
    vec3 normal = cross(dx, dy);
    float normalLengthSquared = dot(normal, normal);
    if (!(normalLengthSquared > 1.0e-8) || isinf(normalLengthSquared)) {
        return vertexTopFace;
    }
    float derivedTopFace = step(0.35, abs(normalize(normal).y));
    return max(vertexTopFace, derivedTopFace);
}

int shineShoreFoamTile(int edgeMask) {
    if (edgeMask == 1) return 0;
    if (edgeMask == 2) return 1;
    if (edgeMask == 4) return 2;
    if (edgeMask == 8) return 3;
    if (edgeMask == 3) return 4;
    if (edgeMask == 5) return 5;
    if (edgeMask == 9) return 6;
    if (edgeMask == 6) return 7;
    if (edgeMask == 10) return 8;
    if (edgeMask == 12) return 9;
    if (edgeMask == 7) return 10;
    if (edgeMask == 11) return 11;
    if (edgeMask == 13) return 12;
    if (edgeMask == 14) return 13;
    return 14;
}

vec4 shineSampleShoreFoam(vec3 worldPos, float topFace, int edgeMask) {
    int profileIndex = clamp(shineShoreFoamProfile, 0, 127);
    ivec2 foamSize = textureSize(ShineWaterEdgeFoamSampler, 0);
    int profileRow = foamSize.y - 3;
    vec4 profileColorEnabled = texelFetch(ShineWaterEdgeFoamSampler, ivec2(profileIndex, profileRow), 0);
    vec4 profileParams = texelFetch(ShineWaterEdgeFoamSampler, ivec2(profileIndex, profileRow + 1), 0);
    if (profileColorEnabled.a <= 0.5 || shineTerrainCausticsWaterMask <= 0.5 || edgeMask == 0 || topFace < 0.5) {
        return vec4(0.0);
    }

    float profileSpeed = mix(0.0, 4.0, profileParams.b);
    int frameSize = max(foamSize.x / 15, 1);
    int frameCount = max(profileRow / frameSize, 1);
    int edgeTile = shineShoreFoamTile(edgeMask);
    int frame = int(floor(mod(u_ShineTerrainCausticsTime * profileSpeed * 20.0, float(frameCount))));
    vec2 local = fract(worldPos.xz);
    ivec2 texel = ivec2(
        edgeTile * frameSize + clamp(int(floor(local.x * float(frameSize))), 0, frameSize - 1),
        frame * frameSize + clamp(int(floor(local.y * float(frameSize))), 0, frameSize - 1)
    );
    texel = clamp(texel, ivec2(0), foamSize - ivec2(1));
    vec4 foam = texelFetch(ShineWaterEdgeFoamSampler, texel, 0);
    foam.rgb *= profileColorEnabled.rgb;
    foam.a *= profileParams.r;
    return foam;
}

vec4 shineApplyShoreFoam(vec4 color, vec3 worldPos, float topFace) {
    vec4 foam = shineSampleShoreFoam(worldPos, topFace, shineShoreFoamEdges);
    vec3 foamLighting = clamp(vertexColor.rgb / max(shineUnlitVertexColor.rgb, vec3(0.05)), vec3(0.0), vec3(1.0));
    color.rgb = mix(color.rgb, foam.rgb * foamLighting, foam.a);
    return color;
}

bool shineHasBiomeLavaColor() {
    return shineBiomeLavaColor != 0;
}

bool shineHasWaterCloudiness() {
    return shineWaterSurface != 0;
}

vec4 shineApplyWaterCloudiness(vec4 color) {
    if (!shineHasWaterCloudiness()) {
        return color;
    }
    float encodedByte = floor(vertexColor.a * 255.0 + 0.5);
    float cloudiness = clamp((encodedByte - 127.0) / 127.0, 0.0, 1.0);
    float sourceAlpha = clamp(color.a / max(vertexColor.a, 1.0 / 255.0), 0.0, 1.0);
    color.a = mix(sourceAlpha, 1.0, cloudiness);
    return color;
}

float shineBlockMotionHash(vec3 cell) {
    return fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

vec2 shineApplyBlockMotionTexture(vec2 uv, vec3 worldPos) {
    int profile = shineBlockMotionProfile;
    if (u_ShineBlockMotionEnabled == 0 || profile <= 0 || profile >= 16) {
        return uv;
    }

    vec4 a = u_ShineBlockMotionProfileA[profile];
    vec4 b = u_ShineBlockMotionProfileB[profile];
    float textureStrength = clamp(b.y, 0.0, 4.0);
    float speed = max(a.y, 0.0);
    if (textureStrength <= 0.0001 || speed <= 0.0001) {
        return uv;
    }
    if (b.x > 0.5 && shineTopFace <= 0.5) {
        return uv;
    }

    ivec2 atlasSizeInt = max(textureSize(Sampler0, 0), ivec2(1));
    vec2 atlasSize = vec2(atlasSizeInt);
    vec2 atlasCoord = uv * atlasSize;
    vec2 sourceTexel = floor(clamp(atlasCoord, vec2(0.0), atlasSize - vec2(1.0)));
    vec2 cellMin = floor(sourceTexel / 16.0) * 16.0;
    vec2 cellMax = min(cellMin + vec2(15.0), atlasSize - vec2(1.0));

    vec3 cell = floor(worldPos + vec3(0.01));
    float scale = max(a.z, 0.0001);
    float randomness = clamp(a.w, 0.0, 1.0);
    float phase = u_ShineBlockMotionTime * speed
        + dot(cell, vec3(0.53, 0.37, 0.61)) * scale
        + shineBlockMotionHash(cell) * 6.2831853 * randomness;
    vec2 pixelOffset = round(vec2(sin(phase * 1.07), cos(phase * 0.93 + 1.7)) * textureStrength);
    if (dot(pixelOffset, pixelOffset) < 0.25) {
        return uv;
    }
    vec2 shiftedCoord = clamp(atlasCoord + pixelOffset, cellMin + vec2(0.5), cellMax + vec2(0.5));
    return shiftedCoord / atlasSize;
}

vec3 shineRgbToHsv(vec3 color) {
    vec4 k = vec4(0.0, -0.3333333333, 0.6666666667, -1.0);
    vec4 p = mix(vec4(color.bg, k.wz), vec4(color.gb, k.xy), step(color.b, color.g));
    vec4 q = mix(vec4(p.xyw, color.r), vec4(color.r, p.yzx), step(p.x, color.r));
    float delta = q.x - min(q.w, q.y);
    float epsilon = 1.0e-6;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * delta + epsilon)), delta / (q.x + epsilon), q.x);
}

vec3 shineHsvToRgb(vec3 color) {
    vec3 p = abs(fract(color.xxx + vec3(0.0, 0.6666666667, 0.3333333333)) * 6.0 - 3.0);
    return color.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), color.y);
}

vec4 shineApplyBiomeLavaColor(vec4 lavaSample, vec3 targetHsv, float tintAlpha) {
    vec3 sourceHsv = shineRgbToHsv(clamp(lavaSample.rgb, 0.0, 1.0));
    const float baseLavaHue = 0.0666666556;
    sourceHsv.x = fract(sourceHsv.x + targetHsv.x - baseLavaHue + 1.0);
    sourceHsv.y = clamp(sourceHsv.y * targetHsv.y, 0.0, 1.0);
    sourceHsv.z = clamp(sourceHsv.z * targetHsv.z, 0.0, 1.0);
    vec3 recolored = shineHsvToRgb(sourceHsv);
    vec3 lumaWeights = vec3(0.2126, 0.7152, 0.0722);
    float originalLuma = dot(clamp(lavaSample.rgb, 0.0, 1.0), lumaWeights);
    float recoloredLuma = dot(recolored, lumaWeights);
    if (recoloredLuma > originalLuma && recoloredLuma > 1.0e-6) {
        recolored *= originalLuma / recoloredLuma;
    }
    return vec4(recolored, lavaSample.a * tintAlpha);
}

vec4 shineLimitBiomeLavaBloom(vec4 recolored, vec4 originalSample) {
    float originalEnergy = dot(originalSample.rgb, vec3(0.3333333333));
    float recoloredEnergy = dot(recolored.rgb, vec3(0.3333333333));
    float energyScale = recoloredEnergy > originalEnergy && recoloredEnergy > 1.0e-6
        ? originalEnergy / recoloredEnergy
        : 1.0;
    // Bloom extraction clamps by the strongest RGB channel. Without compensating
    // for the other channels, cyan and green-tinted lava can contribute almost
    // twice the additive energy of an equally strong red tint. Preserve the hue,
    // but normalize multi-channel energy to one dominant channel. This changes
    // only the Bloom source; the visible recolored lava remains untouched.
    vec3 positiveColor = max(recolored.rgb, vec3(0.0));
    float peakChannel = max(max(positiveColor.r, positiveColor.g), positiveColor.b);
    float additiveEnergy = positiveColor.r + positiveColor.g + positiveColor.b;
    float chromaEnergyScale = additiveEnergy > peakChannel && additiveEnergy > 1.0e-6
        ? peakChannel / additiveEnergy
        : 1.0;
    return vec4(recolored.rgb * energyScale * chromaEnergyScale, recolored.a);
}

void main() {
    vec2 pixelSize = 1.0f / TextureSize;
    vec2 originalNearestUv = nearestUv(texCoord0, pixelSize);
    float foliageWindCandidate = float(shineFoliageWindCandidate);
    vec2 foliageTexCoord0 = shineApplyFoliagePixelWind(texCoord0, shineWorldPos, foliageWindCandidate);
    foliageTexCoord0 = shineApplyFoliageSmoothRootAnchor(foliageTexCoord0, shineWorldPos, foliageWindCandidate);
    foliageTexCoord0 = shineApplyBlockMotionTexture(foliageTexCoord0, shineBlockMotionWorldPos);
    vec2 bloomTexCoord = shineApplyBlockMotionTexture(originalNearestUv, shineBlockMotionWorldPos);
    ivec2 maskSize = textureSize(MaskSampler, 0);
    ivec2 maskTexel = ivec2(floor(originalNearestUv * vec2(maskSize)));
    maskTexel = clamp(maskTexel, ivec2(0), maskSize - ivec2(1));
    float maskValue = texelFetch(MaskSampler, maskTexel, 0).r;
    float emissiveMaskValue = texelFetch(MaskSampler, maskTexel, 0).a;
    bool biomeLavaColor = shineHasBiomeLavaColor();
	bool grassFoliageWind = shineFoliageWindCandidate != 0 && u_ShineFoliageWindEnabled != 0 && u_ShineFoliageWindGroundEnabled != 0 && u_ShineFoliageWindMode != 1 && shineIsGrassFoliageWind(texCoord0) && length(foliageTexCoord0 - texCoord0) > min(pixelSize.x, pixelSize.y) * 0.01;
    vec4 foliageSample = grassFoliageWind ? shineSampleGrassFoliageWindColor(Sampler0, texCoord0, foliageTexCoord0) : (UseRgss == 1 ? sampleRGSS(Sampler0, foliageTexCoord0, pixelSize) : sampleNearest(Sampler0, foliageTexCoord0, pixelSize));
    vec4 bloomSample = sampleBaseTexel(Sampler0, bloomTexCoord);
    vec4 absoluteEmissiveColor = vec4(foliageSample.rgb, foliageSample.a * shineUnlitVertexColor.a);
    vec4 absoluteEmissiveBloomColor = vec4(bloomSample.rgb, bloomSample.a * shineUnlitVertexColor.a);
    vec4 color;
    vec4 bloomSourceColor;
    if (biomeLavaColor) {
        // The mask atlas stores emissive alpha as exactly zero or one. Select the
        // final tint before the nonlinear HSV conversion so each sample is
        // recolored once instead of once for both the lit and unlit variants.
        vec4 biomeLavaTint = emissiveMaskValue > 0.5 ? shineUnlitVertexColor : vertexColor;
        vec3 biomeLavaTargetHsv = shineRgbToHsv(clamp(biomeLavaTint.rgb, 0.0, 1.0));
        color = shineApplyBiomeLavaColor(foliageSample, biomeLavaTargetHsv, biomeLavaTint.a);
        bloomSourceColor = shineApplyBiomeLavaColor(bloomSample, biomeLavaTargetHsv, biomeLavaTint.a);
    } else {
        color = foliageSample * vertexColor;
        bloomSourceColor = bloomSample * vertexColor;
    }
    color = shineApplyWaterCloudiness(color);
    bloomSourceColor = shineApplyWaterCloudiness(bloomSourceColor);
    absoluteEmissiveColor = shineApplyWaterCloudiness(absoluteEmissiveColor);
    absoluteEmissiveBloomColor = shineApplyWaterCloudiness(absoluteEmissiveBloomColor);
    if (biomeLavaColor) {
        bloomSourceColor = shineLimitBiomeLavaBloom(bloomSourceColor, bloomSample);
    }
    // Preserve chunk visibility fading while bypassing all baked and dynamic
    // terrain lighting for emissive pixels.
    vec4 visibleAbsoluteEmissiveColor = mix(FogColor * vec4(1, 1, 1, absoluteEmissiveColor.a), absoluteEmissiveColor, ChunkVisibility);
    vec4 visibleAbsoluteEmissiveBloomColor = mix(FogColor * vec4(1, 1, 1, absoluteEmissiveBloomColor.a), absoluteEmissiveBloomColor, ChunkVisibility);
    color = mix(FogColor * vec4(1, 1, 1, color.a), color, ChunkVisibility);
    bloomSourceColor = mix(FogColor * vec4(1, 1, 1, bloomSourceColor.a), bloomSourceColor, ChunkVisibility);
    color = mix(color, visibleAbsoluteEmissiveColor, emissiveMaskValue);
    bloomSourceColor = mix(bloomSourceColor, visibleAbsoluteEmissiveBloomColor, emissiveMaskValue);
#ifdef ALPHA_CUTOUT
    if (color.a < ALPHA_CUTOUT) {
        discard;
    }
#endif
    if (!biomeLavaColor) {
        color = shineApplyTerrainCaustics(color, shineWorldPos, shineTopFace);
        color = shineApplyShoreFoam(color, shineWorldPos, shineTopFace);
    }
    color = mix(color, visibleAbsoluteEmissiveColor, emissiveMaskValue);
    bloomSourceColor = mix(bloomSourceColor, visibleAbsoluteEmissiveBloomColor, emissiveMaskValue);

    fragColor = apply_fog(color, sphericalVertexDistance, cylindricalVertexDistance, FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
    if (maskValue <= 0.5 || bloomStrength <= 1.0e-5) {
        bloomColor = vec4(0.0);
    } else {
        float fogValue = total_fog_value(sphericalVertexDistance, cylindricalVertexDistance, FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd);
        float fogAttenuation = 1.0 - fogValue;
        vec4 foggedBloomSource = apply_fog(bloomSourceColor, sphericalVertexDistance, cylindricalVertexDistance, FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
		// Source alpha stores configured bloom strength and radius metadata. Keep it
		// independent of biome recoloring so crossing a biome-blend boundary cannot
		// abruptly weaken otherwise identical magma or lava sources.
		float sourceAlpha = clamp((bloomStrength * maskValue) / 5.0, 0.0, 1.0);
		bloomColor = vec4(foggedBloomSource.rgb * foggedBloomSource.a * fogAttenuation, shinePackBloomSourceAlpha(sourceAlpha, bloomRadiusProfile));
    }
}

#endif
