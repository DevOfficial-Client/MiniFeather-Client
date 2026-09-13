#version 330

uniform sampler2D TerrainDepthSampler;
uniform sampler2D OccluderDepthSampler;
uniform sampler2D SourceSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 TerrainDepthSize;
    vec2 OccluderDepthSize;
    vec2 SourceSize;
};

layout(std140) uniform BloomExtractConfig {
    float Threshold;
    float HighlightClamp;
    float SoftKnee;
    float MaxDistance;
    float NearPlane;
    float FarPlane;
    float SourceStrengthScale;
    float DistanceFadeRange;
    float SelectedProfile;
    float ActiveProfileMask;
};

out vec4 fragColor;

const float REVERSED_Z_CLEAR_EPSILON = 0.0001;

float linearize_depth(float depth) {
    float denominator = NearPlane + depth * (FarPlane - NearPlane);
    return (NearPlane * FarPlane) / max(denominator, 1.0e-6);
}

void decode_source_alpha(float packedAlpha, out float strength, out int profile) {
    float code = floor(clamp(packedAlpha, 0.0, 1.0) * 255.0 + 0.5);
    profile = clamp(int(floor(code / 64.0)), 0, 2);
    strength = mod(code, 64.0) / 63.0;
}

float visible_source_mask(vec2 uv, float sourceDepth) {
    float occluderDepth = texture(OccluderDepthSampler, uv).r;
    if (occluderDepth <= REVERSED_Z_CLEAR_EPSILON) {
        return 1.0;
    }
    if (sourceDepth <= REVERSED_Z_CLEAR_EPSILON) {
        return 0.0;
    }

    float occluderDistance = linearize_depth(occluderDepth);
    float sourceDistance = linearize_depth(sourceDepth);
    float occlusionDelta = sourceDistance - occluderDistance;
    float bias = max(0.08, sourceDistance * 0.004);
    float feather = max(0.20, sourceDistance * 0.012);
    return 1.0 - smoothstep(bias, bias + feather, occlusionDelta);
}

float distance_limit(float depth, float sceneDistance) {
    if (depth <= REVERSED_Z_CLEAR_EPSILON) {
        return 1.0;
    }
    return 1.0 - smoothstep(MaxDistance, MaxDistance + DistanceFadeRange, sceneDistance);
}

vec3 extract_source_pixel(ivec2 sourcePixel) {
    ivec2 sourceLimit = ivec2(max(SourceSize, vec2(1.0))) - ivec2(1);
    ivec2 clampedPixel = clamp(sourcePixel, ivec2(0), sourceLimit);
    vec2 uv = (vec2(clampedPixel) + 0.5) / max(SourceSize, vec2(1.0));
    // Use the same normalized source sampling path as the proven full-size
    // extractor. The source input is nearest-filtered, so this is still one
    // exact packed-alpha texel rather than a profile-corrupting interpolation.
    vec4 source = texture(SourceSampler, uv);

    float strength;
    int profile;
    decode_source_alpha(source.a, strength, profile);
    if (strength <= 0.0) {
        return vec3(0.0);
    }
    if (SelectedProfile >= -0.5) {
        int selected = int(floor(SelectedProfile + 0.5));
        int activeMask = int(floor(ActiveProfileMask + 0.5));
        bool intendedProfileActive = (activeMask & (1 << profile)) != 0;
        // Profile 0 is always present. If discovery misses a configured profile,
        // let the default pass carry that source instead of dropping the block.
        if (profile != selected && (selected != 0 || intendedProfileActive)) {
            return vec3(0.0);
        }
    }

    float terrainDepth = texture(TerrainDepthSampler, uv).r;
    float visible = visible_source_mask(uv, terrainDepth);
    float encodedStrength = strength * visible;
    if (encodedStrength <= 1.0e-5) {
        return vec3(0.0);
    }

    vec3 rawSourceColor = source.rgb * visible;
    float rawBrightness = max(max(rawSourceColor.r, rawSourceColor.g), rawSourceColor.b);
    if (rawBrightness <= 1.0e-6) {
        return vec3(0.0);
    }

    float clampedRawBrightness = min(rawBrightness, HighlightClamp);
    float highlightScale = clampedRawBrightness / rawBrightness;
    float bloomMask = smoothstep(Threshold, Threshold + max(SoftKnee, 1.0e-4), clampedRawBrightness);
    float terrainDistance = linearize_depth(terrainDepth);
    float distanceMask = distance_limit(terrainDepth, terrainDistance);
    return rawSourceColor * highlightScale * bloomMask * encodedStrength * SourceStrengthScale * distanceMask;
}

float bloom_luma(vec3 color) {
    return max(max(color.r, color.g), color.b);
}

float anti_flicker_weight(vec3 color) {
    float luma = bloom_luma(color);
    float risk = smoothstep(0.9, 4.0, luma);
    float damp = 1.0 / (1.0 + luma * 0.35);
    return mix(1.0, damp, 0.45 * risk);
}

void main() {
    // A complete 4x4 source-texel footprint covers every source pixel for the
    // optimized path's supported <=4:1 reduction. Unlike point extraction,
    // this cannot drop a one-pixel block mask between low-resolution samples.
    vec2 sourceCenter = (gl_FragCoord.xy / OutSize) * SourceSize - 0.5;
    ivec2 firstPixel = ivec2(floor(sourceCenter)) - ivec2(1);
    vec3 color = vec3(0.0);
    vec3 strongest = vec3(0.0);
    float strongestLuma = 0.0;
    float totalWeight = 0.0;
    for (int y = 0; y < 4; y++) {
        for (int x = 0; x < 4; x++) {
            vec3 sampleColor = extract_source_pixel(firstPixel + ivec2(x, y));
            float sampleLuma = bloom_luma(sampleColor);
            if (sampleLuma > strongestLuma) {
                strongest = sampleColor;
                strongestLuma = sampleLuma;
            }
            float weight = anti_flicker_weight(sampleColor);
            color += sampleColor * weight;
            totalWeight += weight;
        }
    }
    vec3 filtered = color / max(totalWeight, 1.0e-6);
    // Match the legacy extraction's 25% neighbor-coverage floor. A thin mask
    // remains visible without changing solid regions, where filtered already
    // equals the strongest source sample.
    filtered = max(filtered, strongest * 0.25);
    fragColor = vec4(filtered, 1.0);
}
