#version 330

uniform sampler2D MainSampler;
uniform sampler2D OpaqueMainSampler;
uniform sampler2D MainDepthSampler;
uniform sampler2D TerrainDepthSampler;
uniform sampler2D VolumeSampler;
uniform sampler2D VolumeDepthSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 MainSize;
    vec2 OpaqueMainSize;
    vec2 MainDepthSize;
    vec2 TerrainDepthSize;
    vec2 VolumeSize;
    vec2 VolumeDepthSize;
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

float linearizeDepth(float depth) {
    float nearPlane = max(SkyCameraParams.z, 1.0e-4);
    float farPlane = max(SkyCameraParams.w, nearPlane + 1.0);
    float zNdc = depth * 2.0 - 1.0;
    return (2.0 * nearPlane * farPlane) / max(farPlane + nearPlane - zNdc * (farPlane - nearPlane), 1.0e-5);
}

float unpackDepth(vec2 encodedPair) {
    vec2 bytes = floor(encodedPair * 255.0 + 0.5);
    return (bytes.x * 256.0 + bytes.y) / 65535.0;
}

float lateLayerMask(float sceneDepth, float terrainDepth) {
    if (sceneDepth >= 0.999995) {
        return 0.0;
    }
    if (terrainDepth >= 0.999995) {
        return 1.0;
    }
    float sceneDistance = linearizeDepth(sceneDepth);
    float terrainDistance = linearizeDepth(terrainDepth);
    float separation = terrainDistance - sceneDistance;
    float tolerance = max(0.35, sceneDistance * 0.006);
    return smoothstep(tolerance, tolerance * 3.0, separation);
}

vec4 depthAwareVolume(vec2 uv, float fullDepth) {
    vec2 volumeSize = max(VolumeSize, vec2(1.0));
    vec2 lowPosition = uv * volumeSize - 0.5;
    vec2 basePixel = floor(lowPosition);
    vec2 fraction = fract(lowPosition);
    vec4 accumulated = vec4(0.0);
    float totalWeight = 0.0;
    bool fullSky = fullDepth >= 0.999995;
    float fullLinearDepth = fullSky ? SkyCameraParams.w : linearizeDepth(fullDepth);

    for (int y = 0; y <= 1; y++) {
        for (int x = 0; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y));
            vec2 sampleUv = (basePixel + offset + 0.5) / volumeSize;
            sampleUv = clamp(sampleUv, vec2(0.0), vec2(1.0));
            float bilinearWeight = mix(1.0 - fraction.x, fraction.x, float(x))
                * mix(1.0 - fraction.y, fraction.y, float(y));
            float sampleDepth = unpackDepth(texture(VolumeDepthSampler, sampleUv).rg);
            bool sampleSky = sampleDepth >= 0.999995;
            float depthWeight;
            if (fullSky || sampleSky) {
                // A sky sample and a geometry sample are different depth
                // classes, not merely far-apart depths. Even a tiny cross-class
                // weight leaks bright terrain shafts into the sky and draws a
                // moving rim around clouds and the distant horizon.
                depthWeight = fullSky == sampleSky ? 1.0 : 0.0;
            } else {
                float sampleLinearDepth = linearizeDepth(sampleDepth);
                float tolerance = max(1.0, fullLinearDepth * 0.035);
                depthWeight = exp(-abs(sampleLinearDepth - fullLinearDepth) / tolerance);
            }
            float weight = bilinearWeight * depthWeight;
            accumulated += texture(VolumeSampler, sampleUv) * weight;
            totalWeight += weight;
        }
    }
    if (totalWeight <= 1.0e-5) {
        // Never fall back to a bilinear sample from the wrong depth class.
        return vec4(0.0, 0.0, 0.0, 0.5);
    }
    return accumulated / totalWeight;
}

void main() {
    vec4 scene = texture(MainSampler, texCoord);
    if (SkyVolumetricEnabled < 0.5) {
        fragColor = scene;
        return;
    }

    vec4 opaqueScene = texture(OpaqueMainSampler, texCoord);

    float rawDepth = texture(MainDepthSampler, texCoord).r;
    float terrainDepth = texture(TerrainDepthSampler, texCoord).r;
    // Clouds, water, and entities are rendered after Shine's terrain-depth
    // snapshot. They already carry their own configured color and lighting and
    // must not be mistaken for solid terrain receivers by this late composite.
    float lateLayer = lateLayerMask(rawDepth, terrainDepth);
    vec4 volume = depthAwareVolume(texCoord, rawDepth);
    // TerrainDepth identifies late-rendered receivers, not empty air. A shaft
    // in front of a cloud, water surface, or entity remains airborne light and
    // must not be cut out at that object's silhouette.
    float shaftScalar = clamp(volume.r, 0.0, 1.0);
    float receiver = (rawDepth < 0.999995 ? 1.0 : 0.0) * (1.0 - lateLayer);
    float surfaceSignal = clamp((volume.a - 0.5) * 2.0, -1.0, 1.0) * receiver;
    float positiveSurface = max(surfaceSignal, 0.0);
    float negativeSurface = max(-surfaceSignal, 0.0);

    // This feature adds neutral illumination over the configured world colors.
    // Reusing the ordinary god-ray color here painted the entire volume with
    // its default warm orange. Ordinary god rays keep their independent color.
    vec3 shaftLight = vec3(shaftScalar);
    // Ray intensity is already applied while integrating the air volume. Keep
    // receiver lighting independent so raising Intensity exposes shafts instead
    // of mostly turning the terrain relighting into a brighter shader-like wash.
    float surfaceGain = positiveSurface
        * clamp(SkyVolumetricSurfaceLight, 0.0, 2.0)
        * 0.45;
    float surfaceDarkening = negativeSurface * 0.42;

    // Relight receivers with a scalar exposure gain. This preserves the block's
    // own hue instead of painting it with the (often warm) shaft color. Bright
    // pixels are guarded because the scene already contains bloom and additive
    // particles by the time this late composite runs.
    float originalPeak = max(opaqueScene.r, max(opaqueScene.g, opaqueScene.b));
    float brightLayerGuard = 1.0 - smoothstep(0.65, 0.92, originalPeak);
    vec3 composed = opaqueScene.rgb * (1.0 - clamp(surfaceDarkening, 0.0, 0.42));
    float receiverPeak = max(composed.r, max(composed.g, composed.b));
    float desiredGain = surfaceGain * brightLayerGuard;
    float safeGain = max(0.0, 0.98 / max(receiverPeak, 1.0e-4) - 1.0);
    composed *= 1.0 + min(desiredGain, safeGain);

    // Main already contains particles and other late layers. No-depth additive
    // mist is indistinguishable from the terrain behind it in either depth
    // buffer, so relighting Main directly brightened the mist twice. Relight the
    // pre-entity opaque snapshot instead, then restore the signed late color.
    // This is exact for additive particles and preserves alpha-blended layers far
    // more faithfully than a brightness threshold. Depth-writing late geometry
    // keeps its original scene color because it has its own independent surface.
    //
    // Restore that final scene before adding the air shaft. The volume march was
    // already stopped by MainDepth, so its remaining shaft value is precisely the
    // air between the camera and the nearest depth-writing water/entity/bird. The
    // old ordering screened the shaft into OpaqueMain first and then restored the
    // late scene over it, which forced every late layer in front of every ray.
    vec3 lateContribution = scene.rgb - opaqueScene.rgb;
    vec3 restoredLateScene = composed + lateContribution;
    vec3 orderedScene = mix(restoredLateScene, scene.rgb, lateLayer);

    // Air shafts are an optical overlay, not another terrain light. Screen them
    // into the final scene so water, entities, foam, and particles no longer win
    // merely because they rendered late. Use the final scene's headroom for the
    // bright-layer guard; this retains additive mist/bloom without brightening it
    // twice while leaving ordinary terrain identical to the previous composite.
    vec3 shaftLayer = clamp(shaftLight, vec3(0.0), vec3(1.0));
    if (rawDepth < 0.999995) {
        float orderedPeak = max(orderedScene.r, max(orderedScene.g, orderedScene.b));
        float orderedBrightGuard = 1.0 - smoothstep(0.65, 0.92, orderedPeak);
        shaftLayer *= orderedBrightGuard;
    }
    vec3 finalColor = vec3(1.0) - (vec3(1.0) - orderedScene) * (vec3(1.0) - shaftLayer);
    fragColor = vec4(clamp(finalColor, vec3(0.0), vec3(1.0)), scene.a);
}
