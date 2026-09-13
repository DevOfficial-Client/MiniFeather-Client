#version 330

uniform sampler2D Sampler0;

in vec2 texCoord0;
in vec4 vertexColor;
in float rimLightIncluded;

out vec4 fragColor;

void main() {
#ifdef ALPHA_CUTOUT
    if (texture(Sampler0, texCoord0).a < ALPHA_CUTOUT) {
        discard;
    }
#endif

    // The terrain vertex color already contains the local lightmap and ambient
    // occlusion. Keep its brightest channel as a tint-resistant light proxy in
    // the otherwise-unused green mask channel.
    float localLight = clamp(max(max(vertexColor.r, vertexColor.g), vertexColor.b), 0.0, 1.0);
    fragColor = vec4(rimLightIncluded, localLight, 0.0, 1.0);
}
