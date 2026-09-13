#version 330

#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:fog.glsl>

uniform sampler2D Sampler0;

in float sphericalVertexDistance;
in float cylindricalVertexDistance;
in vec2 texCoord0;
in vec4 vertexColor;

out vec4 fragColor;

const float SPARKLE_EDGE_WINDOW = 0.025;
const vec3 SPARKLE_GRAY_PURPLE_BIAS = vec3(0.96, 0.88, 1.08);

float sparkleEdgeCoverage(float alpha) {
    float edge = clamp(alpha / SPARKLE_EDGE_WINDOW, 0.0, 1.0);
    return edge * edge * (3.0 - 2.0 * edge);
}

void main() {
    vec4 texel = texture(Sampler0, texCoord0);
    float alpha = texel.a * vertexColor.a * ColorModulator.a;
    if (alpha <= 0.001) {
        discard;
    }
    alpha *= sparkleEdgeCoverage(alpha);

    float lowest = min(min(texel.r, texel.g), texel.b);
    float highest = max(max(texel.r, texel.g), texel.b);
    float chroma = highest - lowest;
    float whiteMask = smoothstep(0.965, 0.995, lowest) * (1.0 - smoothstep(0.02, 0.08, chroma));
    float luminance = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 purpleGray = clamp(vec3(luminance) * SPARKLE_GRAY_PURPLE_BIAS, 0.0, 1.0);
    vec3 color = mix(purpleGray, texel.rgb, clamp(whiteMask, 0.0, 1.0));
    color *= ColorModulator.rgb;

    fragColor = apply_fog(
        vec4(color, alpha),
        sphericalVertexDistance,
        cylindricalVertexDistance,
        FogEnvironmentalStart,
        FogEnvironmentalEnd,
        FogRenderDistanceStart,
        FogRenderDistanceEnd,
        FogColor
    );
}
