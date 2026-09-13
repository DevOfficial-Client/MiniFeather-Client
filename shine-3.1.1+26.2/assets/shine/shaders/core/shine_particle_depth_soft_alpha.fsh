#version 330

#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:fog.glsl>

uniform sampler2D Sampler0;
uniform sampler2D ShineTerrainDepthSampler;

layout(std140) uniform ShineParticleDepthSoftness {
    float GroundSoftness;
    float DepthBias;
    float DepthFeather;
    float Reserved0;
};

in float sphericalVertexDistance;
in float cylindricalVertexDistance;
in vec2 texCoord0;
in vec4 vertexColor;

out vec4 fragColor;

const float SHINE_PARTICLE_EDGE_WINDOW = 0.03;

float shineEdgeCoverage(float alpha) {
    float edge = clamp(alpha / SHINE_PARTICLE_EDGE_WINDOW, 0.0, 1.0);
    return edge * edge * (3.0 - 2.0 * edge);
}

float shineGroundDepthFade() {
    float softness = clamp(GroundSoftness, 0.0, 1.0);
    if (softness <= 0.0001) {
        return 1.0;
    }

    ivec2 depthSize = textureSize(ShineTerrainDepthSampler, 0);
    if (depthSize.x <= 0 || depthSize.y <= 0) {
        return 1.0;
    }

    vec2 uv = clamp(gl_FragCoord.xy / vec2(depthSize), vec2(0.0), vec2(1.0));
    float terrainDepth = texture(ShineTerrainDepthSampler, uv).r;
    if (terrainDepth >= 0.999999) {
        return 1.0;
    }

    float depthDelta = terrainDepth - gl_FragCoord.z;
    float fade = smoothstep(max(DepthBias, 0.0), max(DepthBias, 0.0) + max(DepthFeather, 0.000001), depthDelta);
    return mix(1.0, fade, softness);
}

vec4 shineParticleLayerColor() {
    vec4 texel = texture(Sampler0, texCoord0);
    vec4 tinted = texel * vertexColor * ColorModulator;
    tinted.a *= shineEdgeCoverage(tinted.a);
    tinted.a *= shineGroundDepthFade();
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
