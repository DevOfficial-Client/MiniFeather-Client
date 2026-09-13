#version 330

#moj_import <minecraft:dynamictransforms.glsl>

uniform sampler2D Sampler0;

in vec2 texCoord0;

out vec4 fragColor;

void main() {
    vec4 texel = texture(Sampler0, texCoord0);
    float peak = max(texel.r, max(texel.g, texel.b));

    // Accept both proper-alpha sprites and black-backed light sprites. This
    // keeps later user-provided sun textures from needing a preprocessing pass.
    bool blackMatteEncoding = texel.a >= 0.999 && peak < 0.999;
    float coverage = blackMatteEncoding ? peak : texel.a;
    vec3 straightColor = blackMatteEncoding && peak > 0.0001
        ? texel.rgb / peak
        : texel.rgb;

    // Preserve the sprite's authored falloff. In particular, do not lift faint
    // black-matte pixels here: doing so turns the subtle outer rays into a
    // broad pale disc before Shine's actual bloom pass is applied.
    coverage = clamp(coverage, 0.0, 1.0);
    vec4 color = vec4(straightColor, coverage) * ColorModulator;
    if (color.a <= 0.0001) {
        discard;
    }

    fragColor = color;
}
