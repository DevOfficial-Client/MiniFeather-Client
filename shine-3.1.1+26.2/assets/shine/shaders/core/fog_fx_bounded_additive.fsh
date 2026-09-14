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

float shineDaylightVisibilityBoost() {
    float environmentLuminance = dot(
        clamp(FogColor.rgb, vec3(0.0), vec3(1.0)),
        vec3(0.2126, 0.7152, 0.0722)
    );
    float daylight = smoothstep(0.28, 0.72, environmentLuminance);
    return mix(1.0, 2.4, daylight);
}

void main() {
    vec4 particleColor = apply_fog(
        shineParticleLayerColor(),
        sphericalVertexDistance,
        cylindricalVertexDistance,
        FogEnvironmentalStart,
        FogEnvironmentalEnd,
        FogRenderDistanceStart,
        FogRenderDistanceEnd,
        FogColor
    );
    float stabilizedCoverage = clamp(
        particleColor.a * shineDaylightVisibilityBoost(),
        0.0,
        1.0
    );
    particleColor.rgb *= stabilizedCoverage;
    fragColor = particleColor;
}
