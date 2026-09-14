#version 330

#moj_import <minecraft:fog.glsl>
#moj_import <minecraft:dynamictransforms.glsl>

uniform sampler2D Sampler0;

in float sphericalVertexDistance;
in float cylindricalVertexDistance;
in vec2 texCoord0;
in vec4 vertexColor;
in float bloomStrength;

out vec4 fragColor;

float shinePackBloomSourceAlpha(float strengthAlpha) {
	return floor(clamp(strengthAlpha, 0.0, 1.0) * 63.0 + 0.5) / 255.0;
}

void main() {
    if (bloomStrength <= 1.0e-5) {
        discard;
    }

    vec4 color = texture(Sampler0, texCoord0) * vertexColor * ColorModulator;
    if (color.a < 0.1) {
        discard;
    }

    vec4 foggedColor = apply_fog(
        color,
        sphericalVertexDistance,
        cylindricalVertexDistance,
        FogEnvironmentalStart,
        FogEnvironmentalEnd,
        FogRenderDistanceStart,
        FogRenderDistanceEnd,
        FogColor
    );
    float fogValue = total_fog_value(
        sphericalVertexDistance,
        cylindricalVertexDistance,
        FogEnvironmentalStart,
        FogEnvironmentalEnd,
        FogRenderDistanceStart,
        FogRenderDistanceEnd
    );
    float fogAttenuation = 1.0 - fogValue;
	fragColor = vec4(foggedColor.rgb * foggedColor.a * fogAttenuation, shinePackBloomSourceAlpha(clamp(bloomStrength / 5.0, 0.0, 1.0)));
}
