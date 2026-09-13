#version 330

#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:fog.glsl>

uniform sampler2D Sampler0;
uniform sampler2D ShineTerrainDepthSampler;

layout(std140) uniform ShineFogFxSkyStabilizer {
    float OpenSkyOpacity;
    float Reserved0;
    float Reserved1;
    float Reserved2;
};

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

float shineOpenSkyOpacity() {
    ivec2 depthSize = textureSize(ShineTerrainDepthSampler, 0);
    if (depthSize.x <= 0 || depthSize.y <= 0) {
        return 1.0;
    }

    ivec2 pixel = clamp(ivec2(gl_FragCoord.xy), ivec2(0), depthSize - ivec2(1));
    float terrainDepth = texelFetch(ShineTerrainDepthSampler, pixel, 0).r;
    float openSky = step(0.999999, terrainDepth);
    return mix(1.0, clamp(OpenSkyOpacity, 0.0, 1.0), openSky);
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

    tinted.a *= shineOpenSkyOpacity();
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
