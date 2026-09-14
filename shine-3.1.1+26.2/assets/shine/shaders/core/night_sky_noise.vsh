#version 330

#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:projection.glsl>

layout(std140) uniform ShineNightSkyNoise {
    vec4 NightNoiseBaseOpacity;
    vec4 NightNoiseAccent;
};

in vec3 Position;
in vec4 Color;

out vec4 vertexColor;

void main() {
    float accent = Color.r;
    float broad = Color.g;
    float horizon = Color.b;
    vec3 color = mix(NightNoiseBaseOpacity.rgb, NightNoiseAccent.rgb, accent);
    float shade = 0.74 + broad * 0.30 + accent * 0.18;
    float alpha = NightNoiseBaseOpacity.a * horizon * (0.16 + accent * 0.84);
    vertexColor = vec4(clamp(color * shade, vec3(0.0), vec3(1.0)), clamp(alpha, 0.0, 1.0));
    gl_Position = ProjMat * ModelViewMat * vec4(Position, 1.0);
}
