#version 330

uniform sampler2D Profile0Sampler;
uniform sampler2D Profile1Sampler;
uniform sampler2D Profile2Sampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 Profile0Size;
    vec2 Profile1Size;
    vec2 Profile2Size;
};

layout(std140) uniform BloomProfileCombineConfig {
    float Profile0Active;
    float Profile1Active;
    float Profile2Active;
    float Padding;
};

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / OutSize;
    vec3 bloom = vec3(0.0);
    if (Profile0Active > 0.5) {
        vec3 encoded = texture(Profile0Sampler, uv).rgb;
        bloom += encoded * encoded;
    }
    if (Profile1Active > 0.5) {
        vec3 encoded = texture(Profile1Sampler, uv).rgb;
        bloom += encoded * encoded;
    }
    if (Profile2Active > 0.5) {
        vec3 encoded = texture(Profile2Sampler, uv).rgb;
        bloom += encoded * encoded;
    }
    // Every profile is companded before its RGBA8 resolved target so faint
    // gradients retain the same precision regardless of the visible-profile
    // mask. Decode, add in linear light, then encode once for final composite.
    fragColor = vec4(sqrt(max(bloom, vec3(0.0))), 1.0);
}
