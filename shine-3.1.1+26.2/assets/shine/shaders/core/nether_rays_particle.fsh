#version 330

#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:fog.glsl>

uniform sampler2D Sampler0;

in float sphericalVertexDistance;
in float cylindricalVertexDistance;
in vec2 texCoord0;
in vec4 vertexColor;

out vec4 fragColor;

const float NETHER_RAYS_ALPHA_NORMALIZATION = 4.0;
const float NETHER_RAYS_EDGE_WINDOW = 0.03;

float netherRaysEdgeCoverage(float alpha) {
    float edge = clamp(alpha / NETHER_RAYS_EDGE_WINDOW, 0.0, 1.0);
    return edge * edge * (3.0 - 2.0 * edge);
}

void main() {
    vec4 texel = texture(Sampler0, texCoord0);
    texel.a = clamp(texel.a * NETHER_RAYS_ALPHA_NORMALIZATION, 0.0, 1.0);
    vec4 particleColor = texel * vertexColor * ColorModulator;
    particleColor.a *= netherRaysEdgeCoverage(particleColor.a);
    fragColor = apply_fog(
        particleColor,
        sphericalVertexDistance,
        cylindricalVertexDistance,
        FogEnvironmentalStart,
        FogEnvironmentalEnd,
        FogRenderDistanceStart,
        FogRenderDistanceEnd,
        FogColor
    );
}
