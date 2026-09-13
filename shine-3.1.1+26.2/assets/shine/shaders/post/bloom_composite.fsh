#version 330

uniform sampler2D MainSampler;
uniform sampler2D Level0Sampler;
uniform sampler2D Level1Sampler;
uniform sampler2D Level2Sampler;
uniform sampler2D Level3Sampler;
uniform sampler2D Level4Sampler;
uniform sampler2D Level5Sampler;
uniform sampler2D Level6Sampler;
uniform sampler2D Level7Sampler;
uniform sampler2D DepthSampler;
uniform sampler2D TerrainDepthSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 MainSize;
    vec2 Level0Size;
    vec2 Level1Size;
    vec2 Level2Size;
    vec2 Level3Size;
    vec2 Level4Size;
    vec2 Level5Size;
    vec2 Level6Size;
    vec2 Level7Size;
    vec2 DepthSize;
    vec2 TerrainDepthSize;
};

layout(std140) uniform BloomCompositeConfig {
    float Strength;
};

layout(std140) uniform BloomCompositeWeights {
	float LowWeight0; float LowWeight1; float LowWeight2; float LowWeight3;
	float LowWeight4; float LowWeight5; float LowWeight6; float LowWeight7;
	float MidWeight0; float MidWeight1; float MidWeight2; float MidWeight3;
	float MidWeight4; float MidWeight5; float MidWeight6; float MidWeight7;
	float HighWeight0; float HighWeight1; float HighWeight2; float HighWeight3;
	float HighWeight4; float HighWeight5; float HighWeight6; float HighWeight7;
	float LowRadiusNorm; float MidRadiusNorm; float HighRadiusNorm; float RadiusProfilesActive;
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

float cubic_w0(float a) {
    return (1.0 / 6.0) * (-a * a * a + 3.0 * a * a - 3.0 * a + 1.0);
}

float cubic_w1(float a) {
    return (1.0 / 6.0) * (3.0 * a * a * a - 6.0 * a * a + 4.0);
}

float cubic_w2(float a) {
    return (1.0 / 6.0) * (-3.0 * a * a * a + 3.0 * a * a + 3.0 * a + 1.0);
}

float cubic_w3(float a) {
    return (1.0 / 6.0) * (a * a * a);
}

vec4 sample_level_smooth(sampler2D texSampler, vec2 uv, vec2 levelSize) {
    vec2 size = max(levelSize, vec2(1.0));
    vec2 invSize = 1.0 / size;
    vec2 pixel = uv * size - 0.5;
    vec2 base = floor(pixel);
    vec2 f = fract(pixel);

    float wx0 = cubic_w0(f.x);
    float wx1 = cubic_w1(f.x);
    float wx2 = cubic_w2(f.x);
    float wx3 = cubic_w3(f.x);
    float wy0 = cubic_w0(f.y);
    float wy1 = cubic_w1(f.y);
    float wy2 = cubic_w2(f.y);
    float wy3 = cubic_w3(f.y);

    float gx0 = wx0 + wx1;
    float gx1 = wx2 + wx3;
    float gy0 = wy0 + wy1;
    float gy1 = wy2 + wy3;

    float hx0 = -1.0 + wx1 / max(gx0, 1.0e-6);
    float hx1 = 1.0 + wx3 / max(gx1, 1.0e-6);
    float hy0 = -1.0 + wy1 / max(gy0, 1.0e-6);
    float hy1 = 1.0 + wy3 / max(gy1, 1.0e-6);

    vec2 minUv = 0.5 * invSize;
    vec2 maxUv = vec2(1.0) - minUv;
    vec2 p00 = clamp((base + vec2(hx0, hy0) + 0.5) * invSize, minUv, maxUv);
    vec2 p10 = clamp((base + vec2(hx1, hy0) + 0.5) * invSize, minUv, maxUv);
    vec2 p01 = clamp((base + vec2(hx0, hy1) + 0.5) * invSize, minUv, maxUv);
    vec2 p11 = clamp((base + vec2(hx1, hy1) + 0.5) * invSize, minUv, maxUv);

	vec4 s00 = texture(texSampler, p00);
	vec4 s10 = texture(texSampler, p10);
	vec4 s01 = texture(texSampler, p01);
	vec4 s11 = texture(texSampler, p11);

	vec4 y0 = s00 * gx0 + s10 * gx1;
	vec4 y1 = s01 * gx0 + s11 * gx1;
	vec4 cubic = y0 * gy0 + y1 * gy1;

    // Clamp cubic reconstruction to local bilinear range to suppress ringing/shimmer.
	vec4 minNeighborhood = min(min(s00, s10), min(s01, s11));
	vec4 maxNeighborhood = max(max(s00, s10), max(s01, s11));
	return clamp(cubic, minNeighborhood, maxNeighborhood);
}

vec3 sample_weighted_level(
	sampler2D texSampler,
	vec2 uv,
	vec2 levelSize,
	float encodedWeight
) {
	if (encodedWeight == 0.0) {
		return vec3(0.0);
	}
	if (encodedWeight > 0.0) {
		return sample_level_smooth(texSampler, uv, levelSize).rgb * encodedWeight;
	}
	return texture(texSampler, uv).rgb * -encodedWeight;
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
    // Use source/terrain depth for bloom distance. Final scene depth includes clouds, water,
    // and other late translucent targets, which should not erase already-extracted bloom.
    float distanceMask = max(distance_limit(terrainDepth, terrainDistance), distance_limit(depth, sceneDistance));
    float receiverVisibility = bloom_receiver_visibility(depth, terrainDepth);
	vec3 bloomColor = sample_weighted_level(Level0Sampler, uv, Level0Size, MidWeight0);
	bloomColor += sample_weighted_level(Level1Sampler, uv, Level1Size, MidWeight1);
	bloomColor += sample_weighted_level(Level2Sampler, uv, Level2Size, MidWeight2);
	bloomColor += sample_weighted_level(Level3Sampler, uv, Level3Size, MidWeight3);
	bloomColor += sample_weighted_level(Level4Sampler, uv, Level4Size, MidWeight4);
	bloomColor += sample_weighted_level(Level5Sampler, uv, Level5Size, MidWeight5);
	bloomColor += sample_weighted_level(Level6Sampler, uv, Level6Size, MidWeight6);
	bloomColor += sample_weighted_level(Level7Sampler, uv, Level7Size, MidWeight7);
    bloomColor *= Strength * distanceMask * receiverVisibility;
    fragColor = vec4(sceneColor.rgb + bloomColor, sceneColor.a);
}
