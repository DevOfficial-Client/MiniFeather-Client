#version 330

uniform sampler2D MainSampler;
uniform sampler2D BloomSampler;
uniform sampler2D DepthSampler;
uniform sampler2D TerrainDepthSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 MainSize;
    vec2 BloomSize;
    vec2 DepthSize;
    vec2 TerrainDepthSize;
};

layout(std140) uniform BloomCompositeConfig {
    float Strength;
};

layout(std140) uniform BloomCompositeDistanceConfig {
    float MaxDistance;
    float NearPlane;
    float FarPlane;
    float DistanceFadeRange;
};

out vec4 fragColor;

const float REVERSED_Z_CLEAR_EPSILON = 0.0001;

float linearize_depth(float depth) {
    float denominator = NearPlane + depth * (FarPlane - NearPlane);
    return (NearPlane * FarPlane) / max(denominator, 1.0e-6);
}

float distance_limit(float depth, float sceneDistance) {
    if (depth <= REVERSED_Z_CLEAR_EPSILON) {
        return 1.0;
    }
    return 1.0 - smoothstep(MaxDistance, MaxDistance + DistanceFadeRange, sceneDistance);
}

float bloom_receiver_visibility(float sceneDepth, float sourceDepth) {
    if (sceneDepth <= REVERSED_Z_CLEAR_EPSILON) {
        return 1.0;
    }
    if (sourceDepth <= REVERSED_Z_CLEAR_EPSILON) {
        return 0.0;
    }

    float sceneDistance = linearize_depth(sceneDepth);
    float sourceDistance = linearize_depth(sourceDepth);
    float occlusionDelta = sourceDistance - sceneDistance;
    float bias = max(0.08, sourceDistance * 0.004);
    float feather = max(0.20, sourceDistance * 0.012);
    return 1.0 - smoothstep(bias, bias + feather, occlusionDelta);
}

void main() {
    vec2 uv = gl_FragCoord.xy / OutSize;
    vec4 sceneColor = texture(MainSampler, uv);
    float depth = texture(DepthSampler, uv).r;
    float terrainDepth = texture(TerrainDepthSampler, uv).r;
    float sceneDistance = linearize_depth(depth);
    float terrainDistance = linearize_depth(terrainDepth);
    float distanceMask = max(distance_limit(terrainDepth, terrainDistance), distance_limit(depth, sceneDistance));
    float receiverVisibility = bloom_receiver_visibility(depth, terrainDepth);
    vec3 encodedBloom = texture(BloomSampler, uv).rgb;
    vec3 bloom = encodedBloom * encodedBloom * Strength * distanceMask * receiverVisibility;
    fragColor = vec4(sceneColor.rgb + bloom, sceneColor.a);
}
