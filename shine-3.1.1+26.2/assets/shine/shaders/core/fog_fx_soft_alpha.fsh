#version 330

#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:fog.glsl>

uniform sampler2D Sampler0;

in float sphericalVertexDistance;
in float cylindricalVertexDistance;
in vec2 texCoord0;
in vec4 vertexColor;

out vec4 fragColor;

const float SHINE_PARTICLE_EDGE_WINDOW = 0.03;
const float FOG_FX_MIN_CONTRIBUTION = 1.0 / 65536.0;

float shineEdgeCoverage(float alpha) {
    float edge = clamp(alpha / SHINE_PARTICLE_EDGE_WINDOW, 0.0, 1.0);
    return edge * edge * (3.0 - 2.0 * edge);
}

vec4 shineParticleLayerColor() {
    vec4 texel = texture(Sampler0, texCoord0);
    if (texel.a == 0.0) {
        discard;
    }

    vec4 tinted = texel * vertexColor * ColorModulator;
    tinted.a *= shineEdgeCoverage(tinted.a);
    if (tinted.a <= FOG_FX_MIN_CONTRIBUTION) {
        discard;
    }
    return tinted;
}

void main() {
    vec4 particleColor = shineParticleLayerColor();
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
