#version 330

#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:fog.glsl>

uniform sampler2D Sampler0;

in float sphericalVertexDistance;
in float cylindricalVertexDistance;
in vec2 texCoord0;
in vec4 vertexColor;
in vec4 unlitVertexColor;

out vec4 fragColor;

const float TRAILER_SPLASH_EDGE_WINDOW = 0.03;
const float TRAILER_SPLASH_TINT_LIFT = 0.22;
const float TRAILER_SPLASH_FOAM_START = 0.86;
const float TRAILER_SPLASH_FOAM_END = 0.94;

float trailerSplashEdgeCoverage(float alpha) {
    float edge = clamp(alpha / TRAILER_SPLASH_EDGE_WINDOW, 0.0, 1.0);
    return edge * edge * (3.0 - 2.0 * edge);
}

float trailerSplashFoamMask(vec3 texelRgb) {
    float lowest = min(min(texelRgb.r, texelRgb.g), texelRgb.b);
    float highest = max(max(texelRgb.r, texelRgb.g), texelRgb.b);
    float chroma = highest - lowest;
    float bright = smoothstep(TRAILER_SPLASH_FOAM_START, TRAILER_SPLASH_FOAM_END, lowest);
    float neutral = 1.0 - smoothstep(0.03, 0.12, chroma);
    return clamp(bright * neutral, 0.0, 1.0);
}

void main() {
    vec4 texel = texture(Sampler0, texCoord0);
    float alpha = texel.a * vertexColor.a * ColorModulator.a;
    if (alpha <= 0.001) {
        discard;
    }
    alpha *= trailerSplashEdgeCoverage(alpha);

    float luminance = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
    float bodyShade = mix(0.62, 1.42, pow(clamp(luminance, 0.0, 1.0), 0.75));
    vec3 lighting = clamp(vertexColor.rgb / max(unlitVertexColor.rgb, vec3(0.05)), vec3(0.0), vec3(1.0));
    vec3 waterTint = clamp(unlitVertexColor.rgb * ColorModulator.rgb, 0.0, 1.0);
    waterTint = mix(waterTint, vec3(1.0), TRAILER_SPLASH_TINT_LIFT);
    vec3 waterBody = clamp(waterTint * lighting * bodyShade, 0.0, 1.0);
    vec3 foam = texel.rgb * lighting;
    vec3 color = mix(waterBody, foam, trailerSplashFoamMask(texel.rgb));

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
