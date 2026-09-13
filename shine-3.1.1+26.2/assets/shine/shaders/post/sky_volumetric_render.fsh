#version 330

uniform sampler2D MainDepthSampler;
uniform sampler2D LightShadowSampler;
uniform sampler2D LightApertureSampler;
uniform sampler2D FarLightShadowSampler;
uniform sampler2D FarLightApertureSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 MainDepthSize;
    vec2 LightShadowSize;
    vec2 LightApertureSize;
    vec2 FarLightShadowSize;
    vec2 FarLightApertureSize;
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

layout(std140) uniform SkyVolumetricFarShadow {
    vec4 SkyFarLightViewProjection0;
    vec4 SkyFarLightViewProjection1;
    vec4 SkyFarLightViewProjection2;
    vec4 SkyFarLightViewProjection3;
    vec4 SkyFarCameraFromLightEye;
    vec4 SkyFarShadowParams;
};

in vec2 texCoord;
out vec4 fragColor;

// The volume is traversed in grouped cells of the actual light-aperture map.
// Unlike camera-normalized depth slices or an unrelated world lattice, these
// boundaries share the aperture's exact snapped light-space phase. A receiver
// getting nearer or farther therefore cannot stretch the shaft silhouette.
const int MAX_VOLUME_INTERVALS = 96;

float saturate(float value) {
    return clamp(value, 0.0, 1.0);
}

float linearizeDepth(float depth, float nearPlane, float farPlane) {
    float zNdc = depth * 2.0 - 1.0;
    return (2.0 * nearPlane * farPlane) / max(farPlane + nearPlane - zNdc * (farPlane - nearPlane), 1.0e-5);
}

vec3 viewDirection(vec2 uv) {
    vec2 ndc = uv * 2.0 - 1.0;
    float tanHalfFov = max(SkyCameraParams.x, 1.0e-4);
    float aspect = max(SkyCameraParams.y, 1.0e-4);
    return normalize(
        SkyCameraForward.xyz
        + (-SkyCameraLeft.xyz) * ndc.x * aspect * tanHalfFov
        + SkyCameraUp.xyz * ndc.y * tanHalfFov
    );
}

vec3 relativeSurfacePosition(vec2 uv, float rawDepth) {
    // World depth is rendered with Minecraft's exact current projection,
    // including walking bob, hurt tilt, and other view transforms. Unprojecting
    // with that same matrix keeps terrain receivers fixed in the world while
    // leaving the independent air-ray lattice unchanged.
    mat4 inverseViewProjection = mat4(
        SkyInverseViewProjection0,
        SkyInverseViewProjection1,
        SkyInverseViewProjection2,
        SkyInverseViewProjection3
    );
    vec4 relative = inverseViewProjection * vec4(uv * 2.0 - 1.0, rawDepth * 2.0 - 1.0, 1.0);
    return relative.xyz / max(abs(relative.w), 1.0e-6) * sign(relative.w);
}

float worldDensityPattern(vec3 relativePosition, vec3 lightDirection) {
    float scale = max(SkyVolumetricWorldScale, 1.0);
    vec3 worldPosition = mod(SkyCameraWorld.xyz + relativePosition + vec3(4096.0), vec3(4096.0));
    // Match the exact tangent-basis selector used by the light capture and
    // fixed DDA grid so both volume fields rotate together at the pole branch.
    vec3 referenceAxis = abs(lightDirection.y) > 0.94 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 shaftRight = normalize(cross(referenceAxis, lightDirection));
    vec3 shaftUp = normalize(cross(lightDirection, shaftRight));
    vec3 shaftCoordinates = vec3(
        dot(worldPosition, shaftRight),
        dot(worldPosition, shaftUp),
        dot(worldPosition, lightDirection) * 0.13
    );
    vec3 noisePosition = shaftCoordinates / scale;
    float waveA = sin(noisePosition.x * 1.37 + noisePosition.y * 0.61 + noisePosition.z * 0.23);
    float waveB = sin(noisePosition.x * -0.73 + noisePosition.y * 1.19 + noisePosition.z * 0.41 + 2.17);
    float waveC = sin(noisePosition.x * 0.39 - noisePosition.y * 0.52 + noisePosition.z * 0.87 + 4.71);
    float combined = saturate(0.5 + 0.5 * (waveA * 0.55 + waveB * 0.30 + waveC * 0.15));
    float contrast = saturate(SkyVolumetricShaftContrast * 0.5);
    float shaped = smoothstep(mix(0.38, 0.58, contrast), mix(0.88, 0.72, contrast), combined);
    return mix(0.90, 1.10, shaped);
}

float hash31(vec3 value) {
    value = fract(value * 0.1031);
    value += dot(value, value.zyx + 31.32);
    return fract((value.x + value.y) * value.z);
}

float dustModulation(vec3 relativePosition) {
    float amount = saturate(SkyVolumetricDustAmount);
    if (amount <= 1.0e-5) {
        return 1.0;
    }
    vec3 worldPosition = mod(SkyCameraWorld.xyz + relativePosition + vec3(4096.0), vec3(4096.0));
    // The old smooth four-cells-per-block value noise became broad stretched
    // bands because one interpolated value represented an entire camera ray.
    // Use a fixed 1/16-block world grid instead: it reads as very fine dust,
    // remains anchored in the world, and never changes the shaft silhouette.
    float grain = hash31(floor(worldPosition * 16.0));
    float centeredGrain = grain * 2.0 - 1.0;
    float sparseHighlight = smoothstep(0.94, 1.0, grain);
    return 1.0 + amount * (centeredGrain * 0.045 + sparseHighlight * 0.10);
}

mat4 lightViewProjection(
    vec4 projection0,
    vec4 projection1,
    vec4 projection2,
    vec4 projection3
) {
    return mat4(projection0, projection1, projection2, projection3);
}

float bilinearShadowComparison(
    sampler2D shadowSampler,
    vec2 filterUv,
    vec2 shadowSize,
    float comparisonDepth
) {
    shadowSize = max(shadowSize, vec2(1.0));
    vec2 texel = 1.0 / shadowSize;
    filterUv = clamp(filterUv, texel * 0.5, vec2(1.0) - texel * 1.5);
    vec2 pixelPosition = filterUv * shadowSize - 0.5;
    vec2 basePixel = floor(pixelPosition);
    vec2 fraction = fract(pixelPosition);
    vec2 baseUv = (basePixel + 0.5) * texel;
    float comparison00 = step(comparisonDepth, texture(shadowSampler, baseUv).r);
    float comparison10 = step(comparisonDepth, texture(shadowSampler, baseUv + vec2(texel.x, 0.0)).r);
    float comparison01 = step(comparisonDepth, texture(shadowSampler, baseUv + vec2(0.0, texel.y)).r);
    float comparison11 = step(comparisonDepth, texture(shadowSampler, baseUv + texel).r);
    return mix(
        mix(comparison00, comparison10, fraction.x),
        mix(comparison01, comparison11, fraction.x),
        fraction.y
    );
}

float nearestShadowComparison(
    sampler2D shadowSampler,
    vec2 filterUv,
    vec2 shadowSize,
    float comparisonDepth
) {
    shadowSize = max(shadowSize, vec2(1.0));
    vec2 texel = 1.0 / shadowSize;
    vec2 pixel = clamp(floor(filterUv * shadowSize), vec2(0.0), shadowSize - vec2(1.0));
    vec2 sampleUv = (pixel + 0.5) * texel;
    return step(comparisonDepth, texture(shadowSampler, sampleUv).r);
}

bool projectedLightCoordinates(
    vec3 relativePosition,
    mat4 viewProjection,
    vec4 cameraFromLightEye,
    out vec2 uv,
    out float receiverDepth
) {
    if (cameraFromLightEye.w < 0.5) {
        uv = vec2(-1.0);
        receiverDepth = 1.0;
        return false;
    }

    vec3 relativeFromLightEye = relativePosition + cameraFromLightEye.xyz;
    vec4 clip = viewProjection * vec4(relativeFromLightEye, 1.0);
    if (abs(clip.w) <= 1.0e-6) {
        uv = vec2(-1.0);
        receiverDepth = 1.0;
        return false;
    }
    vec3 ndc = clip.xyz / clip.w;
    uv = ndc.xy * 0.5 + 0.5;
    receiverDepth = ndc.z * 0.5 + 0.5;
    if (
        receiverDepth <= 0.0 || receiverDepth >= 1.0
        || any(lessThanEqual(uv, vec2(0.001)))
        || any(greaterThanEqual(uv, vec2(0.999)))
    ) {
        return false;
    }
    return true;
}

float softShadowVisibility(
    sampler2D shadowSampler,
    vec2 requestedShadowSize,
    float shadowBias,
    vec2 uv,
    float receiverDepth,
    float receiverBias,
    float sharpnessLimit
) {
    vec2 shadowSize = max(requestedShadowSize, vec2(1.0));
    vec2 texel = 1.0 / shadowSize;
    float radius = mix(0.35, 2.25, saturate(SkyVolumetricSkySpread));
	float bias = max(shadowBias, 1.0e-5) + receiverBias;
	float comparisonDepth = receiverDepth - bias;
	float sharpness = min(saturate(SkyVolumetricShadowSharpness), saturate(sharpnessLimit));
	if (sharpness >= 0.9999) {
		return nearestShadowComparison(shadowSampler, uv, shadowSize, comparisonDepth);
	}

    // Interpolate comparison results, not stored depths. The former weighted
    // 3x3 filter could only return multiples of 0.1; the volume shader then
    // exposed those levels as visible stair steps. Each of these three taps is
    // itself a continuous manual bilinear shadow comparison.
    vec2 filterStep = texel * radius;
    float visible = bilinearShadowComparison(
        shadowSampler,
        uv + vec2(0.0, -0.5773503) * filterStep,
        shadowSize,
        comparisonDepth
    );
    visible += bilinearShadowComparison(
        shadowSampler,
        uv + vec2(0.5, 0.2886751) * filterStep,
        shadowSize,
        comparisonDepth
    );
    visible += bilinearShadowComparison(
        shadowSampler,
        uv + vec2(-0.5, 0.2886751) * filterStep,
        shadowSize,
        comparisonDepth
    );
	float softVisibility = visible / 3.0;
	if (sharpness <= 1.0e-4) {
		return softVisibility;
	}
	float pixelVisibility = nearestShadowComparison(shadowSampler, uv, shadowSize, comparisonDepth);
	return mix(softVisibility, pixelVisibility, sharpness);
}

void surfaceLightVisibility(
    vec3 relativePosition,
    float receiverBiasScale,
    out float mapVisibility,
    out float beamVisibility,
    out float captureCoverage
) {
    vec2 nearUv;
    float nearReceiverDepth;
    bool nearAvailable = projectedLightCoordinates(
        relativePosition,
        lightViewProjection(
            SkyLightViewProjection0,
            SkyLightViewProjection1,
            SkyLightViewProjection2,
            SkyLightViewProjection3
        ),
        SkyCameraFromLightEye,
        nearUv,
        nearReceiverDepth
    );

    // Surface receivers deliberately use only the pixel-dense capture. The old
    // near/far handoff blended independently snapped maps with different texel
    // densities and filtering. That authored a camera-following line and made
    // leaf silhouettes change into coarse block squares as the line crossed
    // them. Air shafts still use their own aperture path below.
    mapVisibility = 1.0;
    beamVisibility = 0.0;
    captureCoverage = 0.0;
    if (!nearAvailable) {
        return;
    }

    float contrastAmount = saturate(SkyVolumetricShaftContrast * 0.5);
    float nearMapVisibility = softShadowVisibility(
        LightShadowSampler,
        LightShadowSize,
        SkyShadowParams.y,
        nearUv,
        nearReceiverDepth,
        SkyShadowParams.y * receiverBiasScale,
        1.0
    );
    float nearCenterGate = smoothstep(
        mix(0.02, 0.04, contrastAmount),
        mix(0.45, 0.65, contrastAmount),
        nearMapVisibility
    );
    float nearBeamVisibility = texture(LightApertureSampler, nearUv).g * nearCenterGate;
    float nearUvEdge = min(min(nearUv.x, 1.0 - nearUv.x), min(nearUv.y, 1.0 - nearUv.y));
    float nearEdgeWorld = nearUvEdge * max(SkyShadowParams.z, 1.0) * 2.0;
    float nearEdgeFeather = max(8.0, max(SkyShadowParams.z, 1.0) * 0.25);
    mapVisibility = nearMapVisibility;
    beamVisibility = nearBeamVisibility;
    captureCoverage = smoothstep(0.0, nearEdgeFeather, nearEdgeWorld);
}

void lightAndBeamVisibility(
    vec3 relativePosition,
    float receiverBias,
    float broadApertureMix,
    out float centerVisibility,
    out float beamVisibility
) {
    vec2 uv;
    float receiverDepth;
    if (!projectedLightCoordinates(
        relativePosition,
        lightViewProjection(
            SkyLightViewProjection0,
            SkyLightViewProjection1,
            SkyLightViewProjection2,
            SkyLightViewProjection3
        ),
        SkyCameraFromLightEye,
        uv,
        receiverDepth
    )) {
        centerVisibility = 0.0;
        beamVisibility = 0.0;
        return;
    }

    vec2 shadowSize = max(LightShadowSize, vec2(1.0));
    float bias = max(SkyShadowParams.y, 1.0e-5) + receiverBias;
    float comparisonDepth = receiverDepth - bias;
    centerVisibility = bilinearShadowComparison(
        LightShadowSampler,
        uv,
        shadowSize,
        comparisonDepth
    );

    // The aperture prepass derives a sparse, symmetric cross-section entirely
    // in light-map UV space. Center visibility only clips that fixed column at
    // real blockers; it must remain permissive for sub-texel leaf openings.
    float contrastAmount = saturate(SkyVolumetricShaftContrast * 0.5);
    float centerGate = smoothstep(
        mix(0.02, 0.04, contrastAmount),
        mix(0.45, 0.65, contrastAmount),
        centerVisibility
    );
    vec3 aperture = texture(LightApertureSampler, uv).rgb;
    // Localized shaft energy must not be attenuated by the empty-sky control.
    // B is the broad baseline; admit only that component with the slider.
    float broadAperture = min(aperture.b, aperture.r);
    float selectedAperture = clamp(
        aperture.g + broadAperture * saturate(broadApertureMix),
        0.0,
        1.0
    );
    beamVisibility = selectedAperture * centerGate;
}

void volumeBeamSample(
    vec3 rayDirection,
    float sampleDistance,
    bool fadeAtVolumeCap,
    float marchEnd,
    float nearFade,
    float nearTransition,
    float farTransition,
    out float beamVisibility,
    out float distanceWeight
) {
    float centerVisibility;
    lightAndBeamVisibility(
        rayDirection * sampleDistance,
        SkyShadowParams.y * 0.30,
        // Localized shaft contrast is identical on both sides of a
        // sky/geometry silhouette. This slider admits only the broad/DC part.
        SkyVolumetricSkyVisibility,
        centerVisibility,
        beamVisibility
    );
    float nearWeight = smoothstep(nearFade, nearFade + nearTransition, sampleDistance);
    float farWeight = fadeAtVolumeCap
        ? 1.0 - smoothstep(max(0.0, marchEnd - farTransition), marchEnd, sampleDistance)
        : 1.0;
    distanceWeight = nearWeight * farWeight;
}

void integrateVolumeSegment(
    vec3 rayDirection,
    float segmentStart,
    float segmentEnd,
    bool fadeAtVolumeCap,
    float marchEnd,
    float nearFade,
    float nearTransition,
    float farTransition,
    float density,
    float beamSourceScale,
    inout float transmittance,
    inout float beamContributionSum,
    inout float weightedDistance,
    inout float weightedDistanceSquared
) {
    float segmentLength = max(segmentEnd - segmentStart, 0.0);
    if (segmentLength <= 1.0e-6) {
        return;
    }

    const float GAUSS_OFFSET = 0.2886751345948129;
    float segmentMid = 0.5 * (segmentStart + segmentEnd);
    float sampleOffset = segmentLength * GAUSS_OFFSET;
    float sampleDistanceA = segmentMid - sampleOffset;
    float sampleDistanceB = segmentMid + sampleOffset;
    float beamVisibilityA;
    float distanceWeightA;
    volumeBeamSample(
        rayDirection,
        sampleDistanceA,
        fadeAtVolumeCap,
        marchEnd,
        nearFade,
        nearTransition,
        farTransition,
        beamVisibilityA,
        distanceWeightA
    );
    float beamVisibilityB;
    float distanceWeightB;
    volumeBeamSample(
        rayDirection,
        sampleDistanceB,
        fadeAtVolumeCap,
        marchEnd,
        nearFade,
        nearTransition,
        farTransition,
        beamVisibilityB,
        distanceWeightB
    );

    float emissionA = beamVisibilityA * distanceWeightA;
    float emissionB = beamVisibilityB * distanceWeightB;
    float distanceWeight = 0.5 * (distanceWeightA + distanceWeightB);
    float integratedEmission = 0.5 * (emissionA + emissionB);
    // Extinction remains uniform inside a shaft. Aperture selection controls
    // only emission, never the shape or density of the medium itself.
    float sigma = density * 0.008 * distanceWeight;
    float beamSource = distanceWeight > 1.0e-6
        ? integratedEmission / distanceWeight * beamSourceScale
        : 0.0;
    float segmentTau = sigma * segmentLength;
    float segmentAbsorption = 1.0 - exp(-segmentTau);
    float beamContribution = transmittance * segmentAbsorption * beamSource;
    beamContributionSum += beamContribution;

    float sampleEnergy = emissionA + emissionB;
    float segmentMeanDistance = segmentMid;
    float segmentMeanDistanceSquared = segmentMid * segmentMid;
    if (sampleEnergy > 1.0e-6) {
        segmentMeanDistance = (
            emissionA * sampleDistanceA + emissionB * sampleDistanceB
        ) / sampleEnergy;
        segmentMeanDistanceSquared = (
            emissionA * sampleDistanceA * sampleDistanceA
            + emissionB * sampleDistanceB * sampleDistanceB
        ) / sampleEnergy;
    }
    weightedDistance += beamContribution * segmentMeanDistance;
    weightedDistanceSquared += beamContribution * segmentMeanDistanceSquared;
    transmittance *= exp(-segmentTau);
}

vec3 reconstructedSurfaceNormal(vec2 uv, vec3 centerPosition, out float depthContinuity) {
    vec2 texel = 1.0 / max(MainDepthSize, vec2(1.0));
    vec2 leftUv = clamp(uv - vec2(texel.x, 0.0), vec2(0.0), vec2(1.0));
    vec2 rightUv = clamp(uv + vec2(texel.x, 0.0), vec2(0.0), vec2(1.0));
    vec2 downUv = clamp(uv - vec2(0.0, texel.y), vec2(0.0), vec2(1.0));
    vec2 upUv = clamp(uv + vec2(0.0, texel.y), vec2(0.0), vec2(1.0));
    float leftDepth = texture(MainDepthSampler, leftUv).r;
    float rightDepth = texture(MainDepthSampler, rightUv).r;
    float downDepth = texture(MainDepthSampler, downUv).r;
    float upDepth = texture(MainDepthSampler, upUv).r;

    vec3 fallbackRight = -SkyCameraLeft.xyz * max(length(centerPosition) * texel.x, 0.01);
    vec3 fallbackUp = SkyCameraUp.xyz * max(length(centerPosition) * texel.y, 0.01);
    vec3 dx = fallbackRight;
    vec3 dy = fallbackUp;
    bool leftValid = leftDepth < 0.999995;
    bool rightValid = rightDepth < 0.999995;
    float centerDistance = length(centerPosition);
    float continuityTolerance = max(0.75, centerDistance * 0.025);
    depthContinuity = (leftValid && rightValid) ? 1.0 : 0.0;
    if (leftValid || rightValid) {
        vec3 leftPosition = leftValid ? relativeSurfacePosition(leftUv, leftDepth) : centerPosition - fallbackRight;
        vec3 rightPosition = rightValid ? relativeSurfacePosition(rightUv, rightDepth) : centerPosition + fallbackRight;
        if (leftValid) {
            depthContinuity *= 1.0 - smoothstep(
                continuityTolerance,
                continuityTolerance * 3.0,
                abs(length(leftPosition) - centerDistance)
            );
        }
        if (rightValid) {
            depthContinuity *= 1.0 - smoothstep(
                continuityTolerance,
                continuityTolerance * 3.0,
                abs(length(rightPosition) - centerDistance)
            );
        }
        if (leftValid && rightValid) {
            dx = abs(length(rightPosition) - length(centerPosition)) <= abs(length(leftPosition) - length(centerPosition))
                ? rightPosition - centerPosition
                : centerPosition - leftPosition;
        } else {
            dx = rightValid ? rightPosition - centerPosition : centerPosition - leftPosition;
        }
    }
    bool downValid = downDepth < 0.999995;
    bool upValid = upDepth < 0.999995;
    depthContinuity *= (downValid && upValid) ? 1.0 : 0.0;
    if (downValid || upValid) {
        vec3 downPosition = downValid ? relativeSurfacePosition(downUv, downDepth) : centerPosition - fallbackUp;
        vec3 upPosition = upValid ? relativeSurfacePosition(upUv, upDepth) : centerPosition + fallbackUp;
        if (downValid) {
            depthContinuity *= 1.0 - smoothstep(
                continuityTolerance,
                continuityTolerance * 3.0,
                abs(length(downPosition) - centerDistance)
            );
        }
        if (upValid) {
            depthContinuity *= 1.0 - smoothstep(
                continuityTolerance,
                continuityTolerance * 3.0,
                abs(length(upPosition) - centerDistance)
            );
        }
        if (downValid && upValid) {
            dy = abs(length(upPosition) - length(centerPosition)) <= abs(length(downPosition) - length(centerPosition))
                ? upPosition - centerPosition
                : centerPosition - downPosition;
        } else {
            dy = upValid ? upPosition - centerPosition : centerPosition - downPosition;
        }
    }

    vec3 normal = cross(dx, dy);
    normal = dot(normal, normal) <= 1.0e-8 ? -normalize(centerPosition) : normalize(normal);
    if (dot(normal, -centerPosition) < 0.0) {
        normal = -normal;
    }
    return normal;
}

void main() {
    if (
        SkyVolumetricEnabled < 0.5
        || SkyVolumetricIntensity <= 1.0e-5
        || SkyCameraFromLightEye.w < 0.5
    ) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.5);
        return;
    }

    vec2 uv = texCoord;
    float nearPlane = max(SkyCameraParams.z, 1.0e-4);
    float farPlane = max(SkyCameraParams.w, nearPlane + 1.0);
    float rawDepth = texture(MainDepthSampler, uv).r;
    bool skyPixel = rawDepth >= 0.999995;
    vec3 rayDirection = viewDirection(uv);
    float forwardAmount = max(dot(rayDirection, SkyCameraForward.xyz), 0.05);
    float surfaceDistance = skyPixel
        ? SkyVolumetricVolumeDistance
        : linearizeDepth(rawDepth, nearPlane, farPlane) / forwardAmount;
    float marchEnd = min(max(SkyVolumetricVolumeDistance, 1.0), surfaceDistance);
    if (marchEnd <= 0.05) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.5);
        return;
    }

    float volumeDistance = max(SkyVolumetricVolumeDistance, 1.0);
    int configuredIntervals = int(clamp(round(SkyVolumetricSamples), 1.0, float(MAX_VOLUME_INTERVALS)));
    vec3 lightDirection = normalize(SkyLightDirection.xyz);
    // Project the camera ray into the same orthographic light map sampled by
    // lightAndBeamVisibility(). The capture anchor is snapped by whole light-map
    // texels, so grouped texel boundaries remain fixed on the represented world
    // even when the capture recenters around the player.
    mat4 nearLightMatrix = lightViewProjection(
        SkyLightViewProjection0,
        SkyLightViewProjection1,
        SkyLightViewProjection2,
        SkyLightViewProjection3
    );
    vec4 lightClipOrigin = nearLightMatrix * vec4(SkyCameraFromLightEye.xyz, 1.0);
    vec4 lightClipVelocity = nearLightMatrix * vec4(rayDirection, 0.0);
    float lightClipW = abs(lightClipOrigin.w) > 1.0e-6 ? lightClipOrigin.w : 1.0;
    float inverseLightClipW = 1.0 / lightClipW;
    vec2 lightUvOrigin = lightClipOrigin.xy * inverseLightClipW * 0.5 + 0.5;
    vec2 lightUvVelocity = 0.5 * (
        lightClipVelocity.xy * lightClipW
        - lightClipOrigin.xy * lightClipVelocity.w
    ) * (inverseLightClipW * inverseLightClipW);
    vec2 apertureMapSize = max(LightApertureSize, vec2(1.0));
    vec2 apertureTexelOrigin = lightUvOrigin * apertureMapSize;
    vec2 apertureTexelVelocity = lightUvVelocity * apertureMapSize;

    // Two Gauss evaluations are used per crossed group. Cell width is an integer
    // texel count, preserving the light-map phase at every quality setting. The
    // diagonal bound guarantees the fixed loop can still consume the full ray.
    float apertureResolution = max(min(apertureMapSize.x, apertureMapSize.y), 1.0);
    float apertureTexelWorld = max(SkyShadowParams.z, 1.0) * 2.0 / apertureResolution;
    float requestedCellWorld = volumeDistance / max(float(configuredIntervals), 1.0);
    float boundedCellWorld = volumeDistance * 1.41421356237 / float(MAX_VOLUME_INTERVALS - 4);
    float gridCellTexels = max(
        1.0,
        ceil(max(requestedCellWorld, boundedCellWorld) / apertureTexelWorld - 1.0e-5)
    );
    float desiredRaySpacing = gridCellTexels * apertureTexelWorld;
    float contrastAmount = saturate(SkyVolumetricShaftContrast * 0.5);
    float density = max(SkyVolumetricAirDensity, 0.0);
    float beamSourceScale = mix(0.160, 0.520, contrastAmount);
    float nearFade = min(max(SkyVolumetricNearFade, 0.0), marchEnd);
    float nearTransition = max(1.0, desiredRaySpacing * 1.5);
    float farTransition = max(2.0, desiredRaySpacing * 4.0);
    // A real surface ends the ray sharply because it is an occluder. Empty sky
    // and geometry beyond the configured volume instead need a smooth cap.
    bool fadeAtVolumeCap = surfaceDistance >= volumeDistance - 1.0e-3;
    float transmittance = 1.0;
    float beamContributionSum = 0.0;
    float weightedDistance = 0.0;
    float weightedDistanceSquared = 0.0;

    const float DDA_INFINITY = 1.0e20;
    const float DDA_EPSILON = 1.0e-5;
    vec2 gridCell = floor(apertureTexelOrigin / gridCellTexels);
    vec2 nextBoundaryDistance = vec2(DDA_INFINITY);
    vec2 boundaryDistanceStep = vec2(DDA_INFINITY);
    if (apertureTexelVelocity.x > DDA_EPSILON) {
        nextBoundaryDistance.x = (
            (gridCell.x + 1.0) * gridCellTexels - apertureTexelOrigin.x
        ) / apertureTexelVelocity.x;
        boundaryDistanceStep.x = gridCellTexels / apertureTexelVelocity.x;
    } else if (apertureTexelVelocity.x < -DDA_EPSILON) {
        nextBoundaryDistance.x = (
            gridCell.x * gridCellTexels - apertureTexelOrigin.x
        ) / apertureTexelVelocity.x;
        boundaryDistanceStep.x = -gridCellTexels / apertureTexelVelocity.x;
    }
    if (apertureTexelVelocity.y > DDA_EPSILON) {
        nextBoundaryDistance.y = (
            (gridCell.y + 1.0) * gridCellTexels - apertureTexelOrigin.y
        ) / apertureTexelVelocity.y;
        boundaryDistanceStep.y = gridCellTexels / apertureTexelVelocity.y;
    } else if (apertureTexelVelocity.y < -DDA_EPSILON) {
        nextBoundaryDistance.y = (
            gridCell.y * gridCellTexels - apertureTexelOrigin.y
        ) / apertureTexelVelocity.y;
        boundaryDistanceStep.y = -gridCellTexels / apertureTexelVelocity.y;
    }
    if (nextBoundaryDistance.x <= DDA_EPSILON) {
        nextBoundaryDistance.x += boundaryDistanceStep.x;
    }
    if (nextBoundaryDistance.y <= DDA_EPSILON) {
        nextBoundaryDistance.y += boundaryDistanceStep.y;
    }

    float segmentStart = 0.0;
    for (int intervalIndex = 0; intervalIndex < MAX_VOLUME_INTERVALS; intervalIndex++) {
        if (segmentStart >= marchEnd - DDA_EPSILON) {
            break;
        }
        float segmentEnd = min(
            marchEnd,
            min(nextBoundaryDistance.x, nextBoundaryDistance.y)
        );
        // The global cell-size bound should make this unnecessary, but always
        // finish the volume on the final iteration rather than exposing a hard
        // loop-limit plane if floating-point ties add an extra crossing.
        if (intervalIndex == MAX_VOLUME_INTERVALS - 1) {
            segmentEnd = marchEnd;
        }
        integrateVolumeSegment(
            rayDirection,
            segmentStart,
            segmentEnd,
            fadeAtVolumeCap,
            marchEnd,
            nearFade,
            nearTransition,
            farTransition,
            density,
            beamSourceScale,
            transmittance,
            beamContributionSum,
            weightedDistance,
            weightedDistanceSquared
        );

        bool crossedX = nextBoundaryDistance.x <= segmentEnd + DDA_EPSILON;
        bool crossedY = nextBoundaryDistance.y <= segmentEnd + DDA_EPSILON;
        if (crossedX) {
            nextBoundaryDistance.x += boundaryDistanceStep.x;
        }
        if (crossedY) {
            nextBoundaryDistance.y += boundaryDistanceStep.y;
        }
        segmentStart = segmentEnd;
    }

    // A ground-level view crosses less lit volume than a view down the shaft.
    // Boost only energy that was actually integrated. The former max-sample
    // floor turned one aliased hit into a bright rectangle and could wash the
    // entire frame white even when the real intersection length was tiny.
    float lightAxisAgreement = abs(dot(rayDirection, lightDirection));
    float sideOnAmount = sqrt(max(1.0 - lightAxisAgreement * lightAxisAgreement, 0.0));
    float sideOnWeight = smoothstep(0.25, 0.90, sideOnAmount);
    float sideVisibility = clamp(SkyVolumetricSideVisibility, 0.0, 4.0);
    float sideMultiplier = 1.0 + sideOnWeight * sideVisibility * 0.35;
    float visibleBeamEnergy = beamContributionSum * sideMultiplier;
    float shaftGain = clamp(SkyVolumetricIntensity, 0.0, 10.0) * mix(0.65, 1.00, contrastAmount);
    // Only actual aperture-defined beam energy reaches the visible channel.
    // The former broad air pedestal was effectively a second fog pass and
    // recolored the configured sky, clouds, and distance fog.
    float shaftScalar = 1.0 - exp(-max(visibleBeamEnergy * shaftGain, 0.0));
    float meanDistance = beamContributionSum > 1.0e-6
        ? weightedDistance / beamContributionSum
        : marchEnd * 0.5;
	// Grain is applied only after the world-space shaft has been integrated. It
	// changes particulate brightness, never aperture selection, shadow geometry,
	// fog, or the configured sky color.
	shaftScalar = saturate(shaftScalar * dustModulation(rayDirection * meanDistance));
    float meanDistanceSquared = beamContributionSum > 1.0e-6
        ? weightedDistanceSquared / beamContributionSum
        : meanDistance * meanDistance;
    float distanceDeviation = sqrt(max(meanDistanceSquared - meanDistance * meanDistance, 0.0));
    float normalizedDistance = saturate(meanDistance / max(SkyVolumetricVolumeDistance, 1.0));
    float normalizedSpread = distanceDeviation / max(SkyVolumetricVolumeDistance, 1.0);
    float historyConfidence = smoothstep(0.00020, 0.0040, beamContributionSum)
        * (1.0 - smoothstep(0.30, 0.60, normalizedSpread));

    float surfaceSignal = 0.0;
    if (!skyPixel) {
        vec3 surfacePosition = relativeSurfacePosition(uv, rawDepth);
        float surfaceDepthContinuity;
        vec3 surfaceNormal = reconstructedSurfaceNormal(uv, surfacePosition, surfaceDepthContinuity);
        vec3 receiverPosition = surfacePosition + surfaceNormal * 0.08 + lightDirection * 0.10;
        float mapVisibility;
        float receiverBeamVisibility;
        float captureCoverage;
        surfaceLightVisibility(
            receiverPosition,
            0.45,
            mapVisibility,
            receiverBeamVisibility,
            captureCoverage
        );
        float visibility = mix(1.0, mapVisibility, saturate(SkyVolumetricSurfaceOcclusion));
        float directional = 0.18 + 0.82 * max(dot(surfaceNormal, lightDirection), 0.0);
        float pattern = worldDensityPattern(receiverPosition, lightDirection);
        float lit = receiverBeamVisibility
            * visibility
            * directional
            * mix(0.82, 1.18, saturate((pattern - 0.68) / 0.60))
            * surfaceDepthContinuity;
        float shadow = (1.0 - visibility) * saturate(SkyVolumetricSurfaceShadow);
        surfaceSignal = clamp(
            lit - shadow,
            -1.0,
            1.0
        ) * captureCoverage;
    }

    // R = monochromatic shaft intensity. RGBA8 does not have enough precision
    // to multiply the depth metadata by a faint ray value, so B stores beam
    // confidence and G stores distance premultiplied by that confidence. Empty
    // uniform air has zero confidence because the moment is built only from the
    // local beam contribution. Bilinear filtering therefore combines only real
    // shaft depths without reducing them to one or two 8-bit codes. A remains
    // the independent surface signal.
    fragColor = vec4(
        saturate(shaftScalar),
        normalizedDistance * historyConfidence,
        historyConfidence,
        0.5 + surfaceSignal * 0.5
    );
}
