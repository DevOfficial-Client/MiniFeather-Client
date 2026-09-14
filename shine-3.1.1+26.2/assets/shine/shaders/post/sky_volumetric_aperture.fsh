#version 330

uniform sampler2D LightShadowSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 LightShadowSize;
};

layout(std140) uniform SkyVolumetricConfig {
    float SkyVolumetricEnabled;
    float SkyVolumetricIntensity;
    float SkyVolumetricSamples;
    float SkyVolumetricAirDensity;
    float SkyVolumetricTemporalStability;
    float SkyVolumetricSurfaceLight;
    float SkyVolumetricSourceMode;
    float SkyVolumetricSourceBlend;
    float SkyVolumetricVolumeDistance;
    float SkyVolumetricShaftContrast;
    float SkyVolumetricWorldScale;
    float SkyVolumetricSkySpread;
    float SkyVolumetricSkyElevation;
    float SkyVolumetricNearFade;
    float SkyVolumetricLightR;
    float SkyVolumetricLightG;
    float SkyVolumetricLightB;
    float SkyVolumetricDayFactor;
    float SkyVolumetricFrameIndex;
    float SkyVolumetricSkyVisibility;
    float SkyVolumetricDustAmount;
    float SkyVolumetricSurfaceOcclusion;
    float SkyVolumetricSurfaceShadow;
    float SkyVolumetricShadowSharpness;
    float SkyVolumetricSideVisibility;
    float SkyVolumetricPadding0;
    float SkyVolumetricPadding1;
    float SkyVolumetricPadding2;
};

layout(std140) uniform SkyVolumetricCamera {
    vec4 SkyCameraForward;
    vec4 SkyCameraUp;
    vec4 SkyCameraLeft;
    vec4 SkyCameraParams;
    vec4 SkyCameraWorld;
    vec4 SkyLightDirection;
    vec4 SkyPreviousForward;
    vec4 SkyPreviousUp;
    vec4 SkyPreviousLeft;
    vec4 SkyPreviousParams;
    vec4 SkyCameraDelta;
    vec4 SkyLightViewProjection0;
    vec4 SkyLightViewProjection1;
    vec4 SkyLightViewProjection2;
    vec4 SkyLightViewProjection3;
    vec4 SkyCameraFromLightEye;
    vec4 SkyShadowParams;
    vec4 SkyLatticeCamera;
    vec4 SkyInverseViewProjection0;
    vec4 SkyInverseViewProjection1;
    vec4 SkyInverseViewProjection2;
    vec4 SkyInverseViewProjection3;
};

in vec2 texCoord;
out vec4 fragColor;

float saturate(float value) {
    return clamp(value, 0.0, 1.0);
}

mat4 lightViewProjection() {
    return mat4(
        SkyLightViewProjection0,
        SkyLightViewProjection1,
        SkyLightViewProjection2,
        SkyLightViewProjection3
    );
}

void main() {
    if (SkyVolumetricEnabled < 0.5 || SkyCameraFromLightEye.w < 0.5) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec2 uv = texCoord;
    float extent = max(SkyShadowParams.z, 1.0);
    float radiusWorld = mix(1.25, 4.0, saturate(SkyVolumetricSkySpread));
    float radiusUv = radiusWorld / (extent * 2.0);
    vec2 cardinalX = vec2(radiusUv, 0.0);
    vec2 cardinalY = vec2(0.0, radiusUv);
    vec2 diagonal = vec2(0.70710678 * radiusUv);
    vec2 lightTexel = 1.0 / max(LightShadowSize, vec2(1.0));
    vec2 sampleMin = lightTexel * 0.5;
    vec2 sampleMax = vec2(1.0) - sampleMin;

    float centerDepth = texture(LightShadowSampler, uv).r;

    // Preserve small alpha-cut foliage openings as their own signal. Keeping
    // this separate from the broad multi-block aperture is important: promoting
    // a one-texel leaf opening to a full-strength broad aperture made dense
    // canopies merge into thick, visibly stepped slabs.
    float fineEastDepth = texture(LightShadowSampler, clamp(uv + vec2(lightTexel.x, 0.0), sampleMin, sampleMax)).r;
    float fineWestDepth = texture(LightShadowSampler, clamp(uv - vec2(lightTexel.x, 0.0), sampleMin, sampleMax)).r;
    float fineNorthDepth = texture(LightShadowSampler, clamp(uv + vec2(0.0, lightTexel.y), sampleMin, sampleMax)).r;
    float fineSouthDepth = texture(LightShadowSampler, clamp(uv - vec2(0.0, lightTexel.y), sampleMin, sampleMax)).r;
    float fineNorthEastDepth = texture(LightShadowSampler, clamp(uv + lightTexel, sampleMin, sampleMax)).r;
    float fineSouthWestDepth = texture(LightShadowSampler, clamp(uv - lightTexel, sampleMin, sampleMax)).r;
    float fineSouthEastDepth = texture(LightShadowSampler, clamp(uv + vec2(lightTexel.x, -lightTexel.y), sampleMin, sampleMax)).r;
    float fineNorthWestDepth = texture(LightShadowSampler, clamp(uv + vec2(-lightTexel.x, lightTexel.y), sampleMin, sampleMax)).r;
    // An opening needs nearby occlusion on both sides of at least one axis.
    // Averaging eight unrelated depths let one distant outlier carve a hole or
    // lobe into the aperture. Opposing-pair support remains symmetric while
    // rejecting ordinary one-sided terrain silhouettes.
    float fineRingDepth = min(
        min(
            max(fineEastDepth, fineWestDepth),
            max(fineNorthDepth, fineSouthDepth)
        ),
        min(
            max(fineNorthEastDepth, fineSouthWestDepth),
            max(fineNorthWestDepth, fineSouthEastDepth)
        )
    );

    float eastDepth = texture(LightShadowSampler, clamp(uv + cardinalX, sampleMin, sampleMax)).r;
    float westDepth = texture(LightShadowSampler, clamp(uv - cardinalX, sampleMin, sampleMax)).r;
    float northDepth = texture(LightShadowSampler, clamp(uv + cardinalY, sampleMin, sampleMax)).r;
    float southDepth = texture(LightShadowSampler, clamp(uv - cardinalY, sampleMin, sampleMax)).r;
    float northEastDepth = texture(LightShadowSampler, clamp(uv + diagonal, sampleMin, sampleMax)).r;
    float southWestDepth = texture(LightShadowSampler, clamp(uv - diagonal, sampleMin, sampleMax)).r;
    float southEastDepth = texture(LightShadowSampler, clamp(uv + vec2(diagonal.x, -diagonal.y), sampleMin, sampleMax)).r;
    float northWestDepth = texture(LightShadowSampler, clamp(uv + vec2(-diagonal.x, diagonal.y), sampleMin, sampleMax)).r;
    float ringDepth = min(
        min(max(eastDepth, westDepth), max(northDepth, southDepth)),
        min(
            max(northEastDepth, southWestDepth),
            max(northWestDepth, southEastDepth)
        )
    );

    // Orthographic light depth is linear. Converting the symmetric depth relief
    // to blocks makes the aperture threshold independent of capture distance.
    mat4 lightMatrix = lightViewProjection();
    vec3 depthRow = vec3(lightMatrix[0][2], lightMatrix[1][2], lightMatrix[2][2]);
    float depthPerBlock = max(length(depthRow) * 0.5, 1.0e-6);
    float reliefBlocks = (centerDepth - ringDepth) / depthPerBlock;
    float fineReliefBlocks = (centerDepth - fineRingDepth) / depthPerBlock;
    float contrastAmount = saturate(SkyVolumetricShaftContrast * 0.5);
    float reliefLow = mix(1.25, 0.35, contrastAmount);
    float reliefHigh = mix(3.00, 1.50, contrastAmount);
    float broadAperture = smoothstep(reliefLow, reliefHigh, reliefBlocks);
    // A stricter threshold rejects ordinary one-sided depth edges. Transparent
    // leaf openings still have a large positive center-to-ring relief, but no
    // longer become an unconditional full-strength replacement for the broad
    // shaft field.
    float fineAperture = smoothstep(
        mix(0.90, 0.45, contrastAmount),
        mix(2.20, 1.25, contrastAmount),
        fineReliefBlocks
    );

    // R is the smooth broad opening. G is the fine foliage opening. They are
    // combined only after each has received an appropriate spatial treatment.
    // Both remain entirely in snapped light-map space.
    fragColor = vec4(broadAperture, fineAperture, 0.0, 1.0);
}
