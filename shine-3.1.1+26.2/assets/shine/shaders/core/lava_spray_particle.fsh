#version 330

#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:fog.glsl>

uniform sampler2D Sampler0;

in float sphericalVertexDistance;
in float cylindricalVertexDistance;
in vec2 texCoord0;
in vec4 vertexColor;

out vec4 fragColor;

vec3 shineRgbToHsv(vec3 color) {
    vec4 k = vec4(0.0, -0.3333333333, 0.6666666667, -1.0);
    vec4 p = mix(vec4(color.bg, k.wz), vec4(color.gb, k.xy), step(color.b, color.g));
    vec4 q = mix(vec4(p.xyw, color.r), vec4(color.r, p.yzx), step(p.x, color.r));
    float delta = q.x - min(q.w, q.y);
    float epsilon = 1.0e-6;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * delta + epsilon)), delta / (q.x + epsilon), q.x);
}

vec3 shineHsvToRgb(vec3 color) {
    vec3 p = abs(fract(color.xxx + vec3(0.0, 0.6666666667, 0.3333333333)) * 6.0 - 3.0);
    return color.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), color.y);
}

vec3 shineApplyBiomeLavaColor(vec3 lavaSample, vec3 tint) {
    vec3 sourceHsv = shineRgbToHsv(clamp(lavaSample, 0.0, 1.0));
    vec3 targetHsv = shineRgbToHsv(clamp(tint, 0.0, 1.0));
    vec3 baseHsv = shineRgbToHsv(vec3(1.0, 0.4, 0.0));
    sourceHsv.x = fract(sourceHsv.x + targetHsv.x - baseHsv.x + 1.0);
    sourceHsv.y = clamp(sourceHsv.y * targetHsv.y, 0.0, 1.0);
    sourceHsv.z = clamp(sourceHsv.z * targetHsv.z, 0.0, 1.0);
    return shineHsvToRgb(sourceHsv);
}

void main() {
    vec4 texel = texture(Sampler0, texCoord0);
    vec3 targetColor = vertexColor.rgb * ColorModulator.rgb;
    vec3 color = shineApplyBiomeLavaColor(texel.rgb, targetColor);
    float sourceAlpha = clamp(texel.a * 2.5, 0.0, 1.0);
    float alpha = sourceAlpha * vertexColor.a * ColorModulator.a;
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
