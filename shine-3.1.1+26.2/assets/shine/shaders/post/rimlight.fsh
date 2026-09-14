#version 330

uniform sampler2D MainSampler;
uniform sampler2D MainDepthSampler;
uniform sampler2D RimMaskSampler;
uniform sampler2D RimSettingsSampler;

in vec2 texCoord;
out vec4 fragColor;

float saturate(float v) {
    return clamp(v, 0.0, 1.0);
}

float linearizeDepth(float depth, float nearPlane, float farPlane) {
#ifdef VULKAN
    // Minecraft 26.2's Vulkan projection uses reversed Z: the depth buffer is
    // cleared to 0 and values increase toward the near plane.
    return (nearPlane * farPlane) / max(nearPlane + depth * (farPlane - nearPlane), 1e-5);
#else
    // Minecraft 26.2's OpenGL projection also uses reversed Z. The NDC range
    // differs by backend, but sampled depth still runs from 0 (far) to 1 (near).
    return (nearPlane * farPlane) / max(nearPlane + depth * (farPlane - nearPlane), 1e-5);
#endif
}

float readMode() {
    return texelFetch(RimSettingsSampler, ivec2(0, 0), 0).r * 2.0;
}

float readColorInfluence() {
    return texelFetch(RimSettingsSampler, ivec2(1, 0), 0).r * 2.0;
}

float readThickness() {
    return 1.0 + texelFetch(RimSettingsSampler, ivec2(2, 0), 0).r * 11.0;
}

float readStrength() {
    return 0.1 + texelFetch(RimSettingsSampler, ivec2(3, 0), 0).r * 0.9;
}

float readDepthThreshold() {
    return 0.1 + texelFetch(RimSettingsSampler, ivec2(4, 0), 0).r * 0.9;
}

float readMaxDistance() {
    return 16.0 + texelFetch(RimSettingsSampler, ivec2(5, 0), 0).r * 112.0;
}

float readNearPlane() {
    return 0.01 + texelFetch(RimSettingsSampler, ivec2(6, 0), 0).r * 0.49;
}

float readFarPlane() {
    return 32.0 + texelFetch(RimSettingsSampler, ivec2(7, 0), 0).r * 480.0;
}

float readDayFactor() {
    return texelFetch(RimSettingsSampler, ivec2(8, 0), 0).r;
}

float readRainFactor() {
    return texelFetch(RimSettingsSampler, ivec2(9, 0), 0).r;
}

vec3 readSunTint() {
    return vec3(
        texelFetch(RimSettingsSampler, ivec2(10, 0), 0).r,
        texelFetch(RimSettingsSampler, ivec2(11, 0), 0).r,
        texelFetch(RimSettingsSampler, ivec2(12, 0), 0).r
    );
}

float readDarknessResponse() {
    return texelFetch(RimSettingsSampler, ivec2(13, 0), 0).r;
}

float getRimEdgeMask(vec2 uv, vec2 texelSize, float thickness, float depthThreshold, float nearPlane, float farPlane, float maxDistance) {
    float centerDepthRaw = texture(MainDepthSampler, uv).r;

#ifdef VULKAN
    if (centerDepthRaw <= 1.0e-6) {
#else
    if (centerDepthRaw <= 1.0e-6) {
#endif
        return 0.0;
    }

    float zCenter = linearizeDepth(centerDepthRaw, nearPlane, farPlane);
    float distanceFade = saturate(1.0 - (zCenter / maxDistance));

    if (distanceFade <= 0.0) {
        return 0.0;
    }

    vec2 offset = texelSize * thickness;

    float zTR = linearizeDepth(texture(MainDepthSampler, uv + offset).r, nearPlane, farPlane);
    float zBL = linearizeDepth(texture(MainDepthSampler, uv - offset).r, nearPlane, farPlane);
    float zTL = linearizeDepth(texture(MainDepthSampler, uv + vec2(-offset.x, offset.y)).r, nearPlane, farPlane);
    float zBR = linearizeDepth(texture(MainDepthSampler, uv + vec2(offset.x, -offset.y)).r, nearPlane, farPlane);

    float dzTR = zTR - zCenter;
    float dzBL = zBL - zCenter;
    float dzTL = zTL - zCenter;
    float dzBR = zBR - zCenter;

    float maxBehind = max(max(dzTR, dzBL), max(dzTL, dzBR));

    float diagonal1 = abs(dzTR - dzBL);
    float diagonal2 = abs(dzTL - dzBR);
    float edgeness = max(diagonal1, diagonal2);

    float curvature1 = abs(dzTR + dzBL);
    float curvature2 = abs(dzTL + dzBR);
    float discontinuity = max(curvature1, curvature2);
    float discontinuityRatio = discontinuity / max(edgeness, 1.0e-5);

    float relativeDepth = maxBehind / max(zCenter, 1.0);
    float relativeEdge = edgeness / max(zCenter, 1.0);

    float baseThreshold = depthThreshold * 0.33;
    float planarSuppression = smoothstep(0.18, 0.42, discontinuityRatio);
    float edgeMask = smoothstep(baseThreshold, baseThreshold * 2.2, relativeDepth)
                   * smoothstep(baseThreshold * 0.5, baseThreshold * 1.2, relativeEdge)
                   * planarSuppression;

    return edgeMask * distanceFade;
}

float getFoliageHeuristic(vec3 color, vec2 uv, vec2 texelSize) {
    float greenDominance = max(color.g - color.r, 0.0) + max(color.g - color.b, 0.0);
    float colorMask = smoothstep(0.08, 0.45, greenDominance);

    float dC = texture(MainDepthSampler, uv).r;
    float dN = abs(texture(MainDepthSampler, uv + vec2(0.0, texelSize.y)).r - dC);
    float dS = abs(texture(MainDepthSampler, uv - vec2(0.0, texelSize.y)).r - dC);
    float dE = abs(texture(MainDepthSampler, uv + vec2(texelSize.x, 0.0)).r - dC);
    float dW = abs(texture(MainDepthSampler, uv - vec2(texelSize.x, 0.0)).r - dC);

    float depthNoise = dN + dS + dE + dW;
    float clusterMask = smoothstep(0.006, 0.04, depthNoise);

    return saturate(colorMask * 0.7 + clusterMask * 0.6);
}

void main() {
    vec3 color = texture(MainSampler, texCoord).rgb;

    vec2 invOutSize = 1.0 / vec2(textureSize(MainSampler, 0));

    float thickness = readThickness();
    float depthThreshold = readDepthThreshold();
    float maxDistance = readMaxDistance();
    float nearPlane = readNearPlane();
    float farPlane = readFarPlane();

    float rimFactor = getRimEdgeMask(texCoord, invOutSize, thickness, depthThreshold, nearPlane, farPlane, maxDistance);

    if (rimFactor <= 0.0) {
        fragColor = vec4(max(color, vec3(0.0)), 1.0);
        return;
    }

    vec4 terrainMask = texture(RimMaskSampler, texCoord);
    rimFactor *= step(0.5, terrainMask.r);

    if (rimFactor <= 0.0) {
        fragColor = vec4(max(color, vec3(0.0)), 1.0);
        return;
    }

    float colorInfluence = readColorInfluence();
    float strength = readStrength();
    float darknessResponse = readDarknessResponse();
    float dayFactor = readDayFactor();
    float rainFactor = readRainFactor();
    vec3 sunTint = readSunTint();

    vec3 coolNight = vec3(0.35, 0.45, 0.8);
    vec3 warmTorch = vec3(1.0, 0.82, 0.58);
    vec3 dayLight = mix(coolNight, sunTint, saturate(dayFactor));
    vec3 baseLight = mix(dayLight, warmTorch, saturate((1.0 - dayFactor) * 0.45));

    vec3 sceneWeight = sqrt(max(color, vec3(0.0)));
    vec3 sceneTint = mix(vec3(1.0), normalize(max(sceneWeight + vec3(1e-5), vec3(1e-5))), 0.3);

    vec3 tintedLight = mix(vec3(1.0), baseLight * sceneTint, colorInfluence);

    if (colorInfluence > 1.0) {
        tintedLight = pow(max(tintedLight, vec3(1e-5)), vec3(1.0 / colorInfluence));
    }

    float weatherDim = mix(1.0, 0.78, rainFactor);
    float localLightResponse = smoothstep(0.08, 0.72, terrainMask.g);
    float localLightStrength = mix(1.0, localLightResponse, darknessResponse);
    vec3 glowColor = sceneWeight * tintedLight * strength * weatherDim * localLightStrength;

    vec3 rimComposite = clamp(glowColor * rimFactor, 0.0, 1.0);
    color = 1.0 - (1.0 - color) * (1.0 - rimComposite);

    fragColor = vec4(max(color, vec3(0.0)), 1.0);
}
