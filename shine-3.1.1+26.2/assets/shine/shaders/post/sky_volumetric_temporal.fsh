#version 330

uniform sampler2D CurrentSampler;
uniform sampler2D HistorySampler;
uniform sampler2D CurrentDepthSampler;
uniform sampler2D PreviousDepthSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 CurrentSize;
    vec2 HistorySize;
    vec2 CurrentDepthSize;
    vec2 PreviousDepthSize;
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

float linearizeDepth(float depth, float nearPlane, float farPlane) {
    float zNdc = depth * 2.0 - 1.0;
    return (2.0 * nearPlane * farPlane) / max(farPlane + nearPlane - zNdc * (farPlane - nearPlane), 1.0e-5);
}

float unpackDepth(vec2 encodedPair) {
    vec2 bytes = floor(encodedPair * 255.0 + 0.5);
    return (bytes.x * 256.0 + bytes.y) / 65535.0;
}

vec3 currentViewDirection(vec2 uv) {
    vec2 ndc = uv * 2.0 - 1.0;
    float tanHalfFov = max(SkyCameraParams.x, 1.0e-4);
    float aspect = max(SkyCameraParams.y, 1.0e-4);
    return normalize(
        SkyCameraForward.xyz
        + (-SkyCameraLeft.xyz) * ndc.x * aspect * tanHalfFov
        + SkyCameraUp.xyz * ndc.y * tanHalfFov
    );
}

bool projectPrevious(vec3 previousRelativePosition, out vec2 uv, out float viewZ) {
    float tanHalfFov = max(SkyPreviousParams.x, 1.0e-4);
    float aspect = max(SkyPreviousParams.y, 1.0e-4);
    float viewX = dot(previousRelativePosition, -SkyPreviousLeft.xyz);
    float viewY = dot(previousRelativePosition, SkyPreviousUp.xyz);
    viewZ = dot(previousRelativePosition, SkyPreviousForward.xyz);
    if (viewZ <= 0.05) {
        uv = vec2(-2.0);
        return false;
    }
    vec2 ndc = vec2(
        viewX / (viewZ * aspect * tanHalfFov),
        viewY / (viewZ * tanHalfFov)
    );
    uv = ndc * 0.5 + 0.5;
    return all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
}

void main() {
    vec2 uv = texCoord;
    vec4 current = texture(CurrentSampler, uv);
    if (SkyVolumetricEnabled < 0.5 || SkyCameraDelta.w < 0.5 || SkyVolumetricTemporalStability <= 1.0e-4) {
        fragColor = current;
        return;
    }

    float currentRawDepth = unpackDepth(texture(CurrentDepthSampler, uv).rg);
    bool currentSky = currentRawDepth >= 0.999995;
    float currentNear = max(SkyCameraParams.z, 1.0e-4);
    float currentFar = max(SkyCameraParams.w, currentNear + 1.0);
    vec3 rayDirection = currentViewDirection(uv);
    vec2 texel = 1.0 / max(CurrentSize, vec2(1.0));
    float neighborhoodMinRay = current.r;
    float neighborhoodMaxRay = current.r;
    float neighborhoodMinAlpha = current.a;
    float neighborhoodMaxAlpha = current.a;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec4 neighborValue = texture(CurrentSampler, clamp(uv + vec2(float(x), float(y)) * texel, vec2(0.0), vec2(1.0)));
            neighborhoodMinRay = min(neighborhoodMinRay, neighborValue.r);
            neighborhoodMaxRay = max(neighborhoodMaxRay, neighborValue.r);
            neighborhoodMinAlpha = min(neighborhoodMinAlpha, neighborValue.a);
            neighborhoodMaxAlpha = max(neighborhoodMaxAlpha, neighborValue.a);
        }
    }

    // Reproject the scattering-weighted point inside the air volume. This works
    // for both sky and terrain receivers; scene depth is not a valid anchor for
    // airborne light, and the former sky bypass left the most visible shafts raw.
    float resolvedRay = current.r;
    float resolvedMoment = current.g;
    float resolvedMomentWeight = current.b;
    float currentMomentWeight = max(current.b, 0.0);
    float currentConfidence = clamp(currentMomentWeight, 0.0, 1.0);
    float currentNormalizedDistance = clamp(
        current.g / max(currentMomentWeight, 1.0e-5),
        0.0,
        1.0
    );
    float currentVolumeDistance = currentNormalizedDistance * max(SkyVolumetricVolumeDistance, 1.0);
    if (currentMomentWeight > 1.0e-5 && currentVolumeDistance > 0.05) {
        vec3 currentVolumeRelative = rayDirection * currentVolumeDistance;
        vec3 previousVolumeRelative = currentVolumeRelative + SkyCameraDelta.xyz;
        vec2 previousVolumeUv;
        float expectedPreviousVolumeViewZ;
        float expectedPreviousDistance = length(previousVolumeRelative);
        if (
            expectedPreviousDistance > 0.05
            && projectPrevious(previousVolumeRelative, previousVolumeUv, expectedPreviousVolumeViewZ)
        ) {
            vec4 historyVolume = texture(HistorySampler, previousVolumeUv);
            float historyMomentWeight = max(historyVolume.b, 0.0);
            float historyConfidence = clamp(historyMomentWeight, 0.0, 1.0);
            float historyNormalizedDistance = clamp(
                historyVolume.g / max(historyMomentWeight, 1.0e-5),
                0.0,
                1.0
            );
            float historyDistance = historyNormalizedDistance * max(SkyVolumetricVolumeDistance, 1.0);
            float distanceTolerance = max(2.0, expectedPreviousDistance * 0.12);
            float volumeDepthValid = 1.0 - smoothstep(
                distanceTolerance,
                distanceTolerance * 2.5,
                abs(historyDistance - expectedPreviousDistance)
            );

            // Reject a reprojected air point that was hidden behind the scene in
            // the previous frame. Without this disocclusion test, foliage edges
            // can pull an old shaft through a newly visible tree or sky opening.
            float previousRawDepth = unpackDepth(texture(PreviousDepthSampler, previousVolumeUv).rg);
            if (previousRawDepth < 0.999995) {
                float previousNear = max(SkyPreviousParams.z, 1.0e-4);
                float previousFar = max(SkyPreviousParams.w, previousNear + 1.0);
                float previousSceneViewZ = linearizeDepth(previousRawDepth, previousNear, previousFar);
                float occlusionTolerance = max(0.4, previousSceneViewZ * 0.012);
                float behindScene = expectedPreviousVolumeViewZ - previousSceneViewZ;
                volumeDepthValid *= 1.0 - smoothstep(
                    occlusionTolerance,
                    occlusionTolerance * 2.0,
                    behindScene
                );
            }

            float unclampedHistoryRay = max(historyVolume.r, 0.0);
            float historyRay = clamp(unclampedHistoryRay, neighborhoodMinRay, neighborhoodMaxRay);
            // G/B describe the beam independently from 8-bit ray brightness.
            // Clamping radiance must not rescale this metadata or faint shafts
            // would lose their world anchor again.
            float historyMoment = historyVolume.g;
            float historyWeight = historyVolume.b;
            float rayDifference = abs(current.r - historyRay);
            float rayResponsiveness = 1.0 - smoothstep(0.06, 0.42, rayDifference);
            float confidenceGate = smoothstep(
                0.04,
                0.30,
                min(currentConfidence, historyConfidence)
            );
            float rayHistoryWeight = clamp(SkyVolumetricTemporalStability, 0.0, 0.965)
                * volumeDepthValid
                * confidenceGate
                * mix(0.55, 1.0, rayResponsiveness);
            resolvedRay = mix(current.r, historyRay, rayHistoryWeight);
            resolvedMoment = mix(current.g, historyMoment, rayHistoryWeight);
            resolvedMomentWeight = mix(current.b, historyWeight, rayHistoryWeight);
        }
    }

    // Surface receivers use the exact current bobbed projection in the render
    // pass. There is no previous-frame bob matrix in this history buffer, so
    // reprojecting alpha with the unbobbed camera basis makes shadows bounce while
    // walking. Keep receiver alpha current and retain temporal history only for
    // the independent air-ray RGB channels.
    float resolvedAlpha = current.a;

    float outputMomentWeight = clamp(resolvedMomentWeight, 0.0, 1.0);
    float outputMoment = clamp(resolvedMoment, 0.0, outputMomentWeight);
    fragColor = vec4(resolvedRay, outputMoment, outputMomentWeight, resolvedAlpha);
}
