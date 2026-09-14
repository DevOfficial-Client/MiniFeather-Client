#version 330

uniform sampler2D LightApertureSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 LightApertureSize;
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

void main() {
    vec2 apertureChannels = texture(LightApertureSampler, texCoord).rg;
    float rawAperture = apertureChannels.r;
    float rawFineAperture = apertureChannels.g;
    if (SkyVolumetricEnabled < 0.5 || SkyCameraFromLightEye.w < 0.5) {
        fragColor = vec4(rawAperture, 0.0, 0.0, 1.0);
        return;
    }

    // Keep this pass monotonic: a brighter opening may only produce at least as
    // much shaft energy. The previous long-range baseline subtraction compared
    // each texel with eight points many blocks away. Its result changed sign as
    // the snapped capture moved, manufacturing travelling holes, rectangles,
    // and ragged ray edges while the player approached a shaft.

    // Focus the existing broad opening without subtracting or inventing spatial
    // structure. The core of a real shaft remains visible at eye level while
    // the aperture silhouette stays tied to the light-space capture.
    float contrastAmount = saturate(SkyVolumetricShaftContrast * 0.5);
    float localizedBroadAperture = smoothstep(
        mix(0.04, 0.08, contrastAmount),
        mix(0.78, 0.48, contrastAmount),
        rawAperture
    );

    // A leaf opening can be narrower than one volume traversal cell. Widen only
    // the fine channel by a small symmetric tent in light space. This footprint
    // is sub-block sized and isotropic, so it cannot inject a max-filtered square
    // or long cardinal cross into the volume.
    vec2 texel = 1.0 / max(LightApertureSize, vec2(1.0));
    vec2 sampleMin = texel * 0.5;
    vec2 sampleMax = vec2(1.0) - sampleMin;
    vec2 fineX = vec2(texel.x, 0.0);
    vec2 fineY = vec2(0.0, texel.y);
    vec2 fineDiagonal = texel;
    float fineFiltered = rawFineAperture * 0.25;
    fineFiltered += texture(LightApertureSampler, clamp(texCoord + fineX, sampleMin, sampleMax)).g * 0.125;
    fineFiltered += texture(LightApertureSampler, clamp(texCoord - fineX, sampleMin, sampleMax)).g * 0.125;
    fineFiltered += texture(LightApertureSampler, clamp(texCoord + fineY, sampleMin, sampleMax)).g * 0.125;
    fineFiltered += texture(LightApertureSampler, clamp(texCoord - fineY, sampleMin, sampleMax)).g * 0.125;
    fineFiltered += texture(LightApertureSampler, clamp(texCoord + fineDiagonal, sampleMin, sampleMax)).g * 0.0625;
    fineFiltered += texture(LightApertureSampler, clamp(texCoord - fineDiagonal, sampleMin, sampleMax)).g * 0.0625;
    fineFiltered += texture(LightApertureSampler, clamp(texCoord + vec2(texel.x, -texel.y), sampleMin, sampleMax)).g * 0.0625;
    fineFiltered += texture(LightApertureSampler, clamp(texCoord + vec2(-texel.x, texel.y), sampleMin, sampleMax)).g * 0.0625;
    float localizedFineAperture = smoothstep(0.04, 0.35, fineFiltered) * 0.20;
    float localizedAperture = clamp(
        localizedBroadAperture
            + localizedFineAperture * (1.0 - localizedBroadAperture),
        0.0,
        1.0
    );
    // R and B retain the same unmodified broad aperture. G contains the focused
    // shaft field. Keeping B monotonic preserves the Sky Visibility control
    // without reintroducing a sparse long-distance baseline.
    fragColor = vec4(rawAperture, localizedAperture, rawAperture, 1.0);
}
