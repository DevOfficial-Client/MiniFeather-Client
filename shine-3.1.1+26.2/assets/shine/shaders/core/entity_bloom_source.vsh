#version 330

#moj_import <minecraft:fog.glsl>
#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:projection.glsl>

in vec3 Position;
in vec4 Color;
in vec2 UV0;
in vec2 UV1;
in ivec2 UV2;

out float sphericalVertexDistance;
out float cylindricalVertexDistance;
out vec4 vertexColor;
out vec2 texCoord0;
out float bloomStrength;

float shine_decode_bloom_strength(ivec2 uv2) {
    int blockNibble = uv2.x & 0xF;
    int skyNibble = uv2.y & 0xF;
    int legacy = (blockNibble & 0x7) | ((skyNibble & 0x7) << 3);
    int mode = ((blockNibble >> 3) & 1) | (((skyNibble >> 3) & 1) << 1);
    if (mode == 0) {
        return float(legacy) / 63.0;
    }

    int code = (mode - 1) * 64 + legacy + 1;
    float t = float(code - 1) / 191.0;
    return 1.0 + t * 4.0;
}

void main() {
    gl_Position = ProjMat * ModelViewMat * vec4(Position, 1.0);

    sphericalVertexDistance = fog_spherical_distance(Position);
    cylindricalVertexDistance = fog_cylindrical_distance(Position);
    vertexColor = Color;
    texCoord0 = UV0;
    bloomStrength = shine_decode_bloom_strength(UV2);
}
