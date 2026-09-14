#version 330

uniform sampler2D Level1Sampler;
uniform sampler2D Level2Sampler;
uniform sampler2D Level3Sampler;
uniform sampler2D Level4Sampler;
uniform sampler2D Level5Sampler;
uniform sampler2D Level6Sampler;
uniform sampler2D Level7Sampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 Level1Size;
    vec2 Level2Size;
    vec2 Level3Size;
    vec2 Level4Size;
    vec2 Level5Size;
    vec2 Level6Size;
    vec2 Level7Size;
};

layout(std140) uniform BloomResolveWeights {
    float Weight1;
    float Weight2;
    float Weight3;
    float Weight4;
    float Weight5;
    float Weight6;
    float Weight7;
    float PerceptualEncoding;
};

out vec4 fragColor;

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

vec3 sample_level_smooth(sampler2D texSampler, vec2 uv, vec2 levelSize) {
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
    vec2 p00 = clamp((base + vec2(-1.0 + wx1 / max(gx0, 1.0e-6), -1.0 + wy1 / max(gy0, 1.0e-6)) + 0.5) * invSize, 0.5 * invSize, vec2(1.0) - 0.5 * invSize);
    vec2 p10 = clamp((base + vec2( 1.0 + wx3 / max(gx1, 1.0e-6), -1.0 + wy1 / max(gy0, 1.0e-6)) + 0.5) * invSize, 0.5 * invSize, vec2(1.0) - 0.5 * invSize);
    vec2 p01 = clamp((base + vec2(-1.0 + wx1 / max(gx0, 1.0e-6),  1.0 + wy3 / max(gy1, 1.0e-6)) + 0.5) * invSize, 0.5 * invSize, vec2(1.0) - 0.5 * invSize);
    vec2 p11 = clamp((base + vec2( 1.0 + wx3 / max(gx1, 1.0e-6),  1.0 + wy3 / max(gy1, 1.0e-6)) + 0.5) * invSize, 0.5 * invSize, vec2(1.0) - 0.5 * invSize);
    vec3 s00 = texture(texSampler, p00).rgb;
    vec3 s10 = texture(texSampler, p10).rgb;
    vec3 s01 = texture(texSampler, p01).rgb;
    vec3 s11 = texture(texSampler, p11).rgb;
    vec3 cubic = (s00 * gx0 + s10 * gx1) * gy0 + (s01 * gx0 + s11 * gx1) * gy1;
    return clamp(cubic, min(min(s00, s10), min(s01, s11)), max(max(s00, s10), max(s01, s11)));
}

vec3 sample_weighted_level(sampler2D texSampler, vec2 uv, vec2 levelSize, float encodedWeight) {
    if (encodedWeight == 0.0) {
        return vec3(0.0);
    }
    if (encodedWeight > 0.0) {
        return sample_level_smooth(texSampler, uv, levelSize) * encodedWeight;
    }
    return texture(texSampler, uv).rgb * -encodedWeight;
}

vec3 encode_resolved_bloom(vec3 bloom) {
    vec3 positiveBloom = max(bloom, vec3(0.0));
    if (PerceptualEncoding <= 0.0) {
        return positiveBloom;
    }

    // The optimized graph stores its resolved result in RGBA8. Square-root
    // companding spends far more of those 8 bits on faint halo gradients, then
    // the final composite restores linear light with one multiplication. This
    // removes both amplified color bands and visible dither grain.
    return sqrt(positiveBloom);
}

void main() {
    vec2 uv = gl_FragCoord.xy / OutSize;
    vec3 bloom = sample_weighted_level(Level1Sampler, uv, Level1Size, Weight1);
    bloom += sample_weighted_level(Level2Sampler, uv, Level2Size, Weight2);
    bloom += sample_weighted_level(Level3Sampler, uv, Level3Size, Weight3);
    bloom += sample_weighted_level(Level4Sampler, uv, Level4Size, Weight4);
    bloom += sample_weighted_level(Level5Sampler, uv, Level5Size, Weight5);
    bloom += sample_weighted_level(Level6Sampler, uv, Level6Size, Weight6);
    bloom += sample_weighted_level(Level7Sampler, uv, Level7Size, Weight7);
    fragColor = vec4(encode_resolved_bloom(bloom), 1.0);
}
