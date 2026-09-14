#version 330

#moj_import <minecraft:fog.glsl>
#moj_import <minecraft:globals.glsl>
#moj_import <minecraft:chunksection.glsl>

uniform sampler2D Sampler0;
uniform sampler2D MaskSampler;

in float sphericalVertexDistance;
in float cylindricalVertexDistance;
in vec4 vertexColor;
in vec4 shineUnlitVertexColor;
in vec2 texCoord0;
in float bloomStrength;
flat in int bloomRadiusProfile;

out vec4 fragColor;

float shinePackBloomSourceAlpha(float strengthAlpha, int radiusProfile) {
	float strengthCode = floor(clamp(strengthAlpha, 0.0, 1.0) * 63.0 + 0.5);
	return (strengthCode + float(clamp(radiusProfile, 0, 2) * 64)) / 255.0;
}

vec4 sampleMaskNearest(vec2 uv) {
    ivec2 maskSize = textureSize(MaskSampler, 0);
    ivec2 texel = ivec2(floor(uv * vec2(maskSize)));
    texel = clamp(texel, ivec2(0), maskSize - ivec2(1));
    return texelFetch(MaskSampler, texel, 0);
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

void main() {
    vec2 pixelSize = 1.0f / TextureSize;
    vec4 maskValues = sampleMaskNearest(nearestUv(texCoord0, pixelSize));
    float maskValue = maskValues.r;
    float emissiveMaskValue = maskValues.a;
    if (maskValue <= 0.5) {
        fragColor = vec4(0.0);
        return;
    }

    if (bloomStrength <= 1.0e-5) {
        fragColor = vec4(0.0);
        return;
    }

    vec4 color = sampleBaseTexel(Sampler0, nearestUv(texCoord0, pixelSize)) * vertexColor;
    if (emissiveMaskValue > 0.5) {
        vec4 unlitColor = sampleBaseTexel(Sampler0, nearestUv(texCoord0, pixelSize)) * shineUnlitVertexColor;
        color = mix(color, unlitColor, emissiveMaskValue);
    }
    color = mix(FogColor * vec4(1.0, 1.0, 1.0, color.a), color, ChunkVisibility);
#ifdef ALPHA_CUTOUT
    if (color.a < ALPHA_CUTOUT) {
        discard;
    }
#endif

    vec4 foggedColor = apply_fog(
        color,
        sphericalVertexDistance,
        cylindricalVertexDistance,
        FogEnvironmentalStart,
        FogEnvironmentalEnd,
        FogRenderDistanceStart,
        FogRenderDistanceEnd,
        FogColor
    );
    float fogValue = total_fog_value(
        sphericalVertexDistance,
        cylindricalVertexDistance,
        FogEnvironmentalStart,
        FogEnvironmentalEnd,
        FogRenderDistanceStart,
        FogRenderDistanceEnd
    );
    float fogAttenuation = 1.0 - fogValue;
	fragColor = vec4(foggedColor.rgb * foggedColor.a * fogAttenuation, shinePackBloomSourceAlpha(clamp((bloomStrength * maskValue) / 5.0, 0.0, 1.0), bloomRadiusProfile));
}
