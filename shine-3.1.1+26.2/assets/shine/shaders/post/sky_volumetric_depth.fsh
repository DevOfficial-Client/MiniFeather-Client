#version 330

uniform sampler2D MainDepthSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 MainDepthSize;
};

in vec2 texCoord;
out vec4 fragColor;

void main() {
    // This metadata must describe the exact center depth used by the volume
    // render pass. The former four-sample minimum could label a low-resolution
    // texel as geometry while that texel's ray had actually been marched as
    // sky, creating moving silhouettes around clouds and distant terrain.
    float depth = texture(MainDepthSampler, texCoord).r;
    float encoded = floor(clamp(depth, 0.0, 1.0) * 65535.0 + 0.5);
    float highByte = floor(encoded / 256.0);
    float lowByte = encoded - highByte * 256.0;
    fragColor = vec4(highByte / 255.0, lowByte / 255.0, 0.0, 1.0);
}
