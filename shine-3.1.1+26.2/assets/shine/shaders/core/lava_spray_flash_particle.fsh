#version 330

#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:fog.glsl>

uniform sampler2D Sampler0;

in float sphericalVertexDistance;
in float cylindricalVertexDistance;
in vec2 texCoord0;
in vec4 vertexColor;

out vec4 fragColor;

void main() {
    vec4 texel = texture(Sampler0, texCoord0);
    vec3 color = texel.rgb * vertexColor.rgb * ColorModulator.rgb;
    float sourceAlpha = clamp(texel.a * 8.0, 0.0, 1.0);
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
