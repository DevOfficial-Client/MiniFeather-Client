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

float visible_source_mask(vec2 uv) {
    float sourceDepth = texture(TerrainDepthSampler, uv).r;
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

void decode_source_alpha(float packedAlpha, out float strength, out int profile) {
    float code = floor(clamp(packedAlpha, 0.0, 1.0) * 255.0 + 0.5);
    profile = clamp(int(floor(code / 64.0)), 0, 2);
    strength = mod(code, 64.0) / 63.0;
}

vec4 sample_visible_source(vec2 uv) {
    vec2 texel = 1.0 / max(SourceSize, vec2(1.0));
    vec2 sampleUv = clamp(uv, 0.5 * texel, vec2(1.0) - 0.5 * texel);
    vec4 source = texture(SourceSampler, sampleUv);
    float strength;
    int profile;
    decode_source_alpha(source.a, strength, profile);
    if (strength <= 0.0) {
        return vec4(0.0);
    }
    if (SelectedProfile >= -0.5 && profile != int(floor(SelectedProfile + 0.5))) {
        return vec4(0.0);
    }
    float visible = visible_source_mask(sampleUv);
    source.rgb *= visible;
    source.a = strength * visible;
    return source;
}

float source_score(vec4 source) {
    return max(max(source.r, source.g), source.b) * clamp(source.a, 0.0, 1.0);
}

void consider_coverage(inout vec4 best, vec4 candidate) {
    // Neighbor coverage only prevents thin terrain sources from disappearing
    // during the first pyramid reduction. Keep it weaker than a direct hit.
    candidate.a *= 0.25;
    if (source_score(candidate) > source_score(best)) {
        best = candidate;
    }
}

vec4 sample_source_with_coverage(vec2 uv) {
    vec4 source = sample_visible_source(uv);
    if (source.a > 1.0e-5) {
        return source;
    }

    vec2 texel = 1.0 / max(SourceSize, vec2(1.0));
    consider_coverage(source, sample_visible_source(uv + vec2(texel.x, 0.0)));
    consider_coverage(source, sample_visible_source(uv - vec2(texel.x, 0.0)));
    consider_coverage(source, sample_visible_source(uv + vec2(0.0, texel.y)));
    consider_coverage(source, sample_visible_source(uv - vec2(0.0, texel.y)));
    return source;
}

float distance_limit(float depth, float sceneDistance) {
    if (depth <= REVERSED_Z_CLEAR_EPSILON) {
        return 1.0;
    }

    return 1.0 - smoothstep(MaxDistance, MaxDistance + DistanceFadeRange, sceneDistance);
}

void main() {
    vec2 uv = gl_FragCoord.xy / OutSize;
    float terrainDepth = texture(TerrainDepthSampler, uv).r;
    float terrainDistance = linearize_depth(terrainDepth);

    vec4 source = sample_source_with_coverage(uv);
    float encodedStrength = clamp(source.a, 0.0, 1.0);
    if (encodedStrength <= 1.0e-5) {
        fragColor = vec4(0.0);
        return;
    }

    vec3 rawSourceColor = source.rgb;
    float rawBrightness = max(max(rawSourceColor.r, rawSourceColor.g), rawSourceColor.b);
    if (rawBrightness <= 1.0e-6) {
        fragColor = vec4(0.0);
        return;
    }

    float clampedRawBrightness = min(rawBrightness, HighlightClamp);
    float highlightScale = clampedRawBrightness / rawBrightness;
    float bloomMask = smoothstep(Threshold, Threshold + max(SoftKnee, 1.0e-4), clampedRawBrightness);
    float distanceMask = distance_limit(terrainDepth, terrainDistance);
    vec3 maskedRawBloom = rawSourceColor * highlightScale * bloomMask;
    float sourceStrength = encodedStrength * SourceStrengthScale;
    vec3 bloomColor = maskedRawBloom * sourceStrength * distanceMask;
    fragColor = vec4(bloomColor, 1.0);
}
