#version 330

uniform sampler2D Sampler0;

in vec2 texCoord0;
in vec4 vertexColor;

out vec4 fragColor;

const float EDGE_WINDOW = 0.06;
const float ALPHA_CUTOFF = 0.01;

float softCoverage(float alpha) {
    float edge = clamp(alpha / EDGE_WINDOW, 0.0, 1.0);
    return edge * edge * (3.0 - 2.0 * edge);
}

void main() {
    vec4 texel = texture(Sampler0, texCoord0);
    float alpha = texel.a * vertexColor.a * softCoverage(texel.a);
    if (alpha <= ALPHA_CUTOFF) {
        discard;
    }

    fragColor = vec4(texel.rgb * vertexColor.rgb, alpha);
}
