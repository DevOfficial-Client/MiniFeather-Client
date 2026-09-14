#version 330

#moj_import <minecraft:fog.glsl>
#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:projection.glsl>

const int FLAG_MASK_DIR = 7;
const int FLAG_INSIDE_FACE = 1 << 4;
const int FLAG_USE_TOP_COLOR = 1 << 5;
const int FLAG_EXTRA_Z = 1 << 6;
const int FLAG_EXTRA_X = 1 << 7;

layout(std140) uniform CloudInfo {
    vec4 CloudColor;
    vec3 CloudOffset;
    vec3 CellSize;
};

uniform isamplerBuffer CloudFaces;

out float vertexDistance;
out vec4 vertexColor;
out float cloudLocalY;
flat out float storyCloud;
flat out float whiteFadeCloud;
flat out float cloudFace;
out vec2 cloudFaceUv;
flat out float cloudRimStrength;
flat out float cloudRimThickness;
flat out float cloudRimColorInfluence;
flat out float cloudRimStyle;

const float WHITE_FADE_STYLE_HEIGHT_OFFSET = 1024.0;
const float CLOUD_RIM_PACK_BASE = 2048.0;
const float CLOUD_RIM_PACK_STEPS = 63.0;
const float CLOUD_RIM_STRENGTH_MAX = 2.0;
const float CLOUD_RIM_THICKNESS_MAX = 5.0;
const float CLOUD_RIM_COLOR_INFLUENCE_MAX = 2.0;

const vec3[] vertices = vec3[](
    vec3(1, 0, 0), vec3(1, 0, 1), vec3(0, 0, 1), vec3(0, 0, 0),
    vec3(0, 1, 0), vec3(0, 1, 1), vec3(1, 1, 1), vec3(1, 1, 0),
    vec3(0, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0), vec3(1, 0, 0),
    vec3(1, 0, 1), vec3(1, 1, 1), vec3(0, 1, 1), vec3(0, 0, 1),
    vec3(0, 0, 1), vec3(0, 1, 1), vec3(0, 1, 0), vec3(0, 0, 0),
    vec3(1, 0, 0), vec3(1, 1, 0), vec3(1, 1, 1), vec3(1, 0, 1)
);

const vec4[] faceColors = vec4[](
    vec4(0.76, 0.76, 0.76, 1.0),
    vec4(1.00, 1.00, 1.00, 1.0),
    vec4(0.88, 0.88, 0.88, 1.0),
    vec4(0.88, 0.88, 0.88, 1.0),
    vec4(0.94, 0.94, 0.94, 1.0),
    vec4(0.94, 0.94, 0.94, 1.0)
);

float decodeCloudRimBucket(float encoded, out float original) {
    float bucket = floor((encoded + CLOUD_RIM_PACK_BASE * 0.5) / CLOUD_RIM_PACK_BASE);
    if (bucket < 1.0) {
        original = encoded;
        return 0.0;
    }
    original = encoded - bucket * CLOUD_RIM_PACK_BASE;
    return max(bucket - 1.0, 0.0);
}

void main() {
    int quadVertex = gl_VertexID % 4;
    int index = (gl_VertexID / 4) * 3;

    int cellX = texelFetch(CloudFaces, index).r;
    int cellZ = texelFetch(CloudFaces, index + 1).r;
    int dirAndFlags = texelFetch(CloudFaces, index + 2).r;
    int direction = dirAndFlags & FLAG_MASK_DIR;
    bool isInsideFace = (dirAndFlags & FLAG_INSIDE_FACE) == FLAG_INSIDE_FACE;
    bool useTopColor = (dirAndFlags & FLAG_USE_TOP_COLOR) == FLAG_USE_TOP_COLOR;
    cellX = (cellX << 1) | ((dirAndFlags & FLAG_EXTRA_X) >> 7);
    cellZ = (cellZ << 1) | ((dirAndFlags & FLAG_EXTRA_Z) >> 6);

    vec3 faceVertex = vertices[(direction * 4) + (isInsideFace ? 3 - quadVertex : quadVertex)];
    float encodedHeight = CellSize.y;
    whiteFadeCloud = encodedHeight > WHITE_FADE_STYLE_HEIGHT_OFFSET ? 1.0 : 0.0;
    float decodedHeight = whiteFadeCloud > 0.5 ? encodedHeight - WHITE_FADE_STYLE_HEIGHT_OFFSET : encodedHeight;
    storyCloud = decodedHeight > 0.0 ? 1.0 : 0.0;

    float decodedOffsetX = CloudOffset.x;
    float decodedOffsetY = CloudOffset.y;
    float decodedOffsetZ = CloudOffset.z;
    cloudRimStyle = 0.0;
    cloudRimStrength = 0.0;
    cloudRimThickness = 0.0;
    cloudRimColorInfluence = 0.0;
    bool packedCloudRim = any(greaterThan(abs(CloudOffset), vec3(CLOUD_RIM_PACK_BASE * 0.5)));
    if (packedCloudRim) {
        float strengthBucket = decodeCloudRimBucket(CloudOffset.x, decodedOffsetX);
        cloudRimStyle = floor(strengthBucket / (CLOUD_RIM_PACK_STEPS + 1.0));
        cloudRimStrength = clamp(mod(strengthBucket, CLOUD_RIM_PACK_STEPS + 1.0) / CLOUD_RIM_PACK_STEPS, 0.0, 1.0) * CLOUD_RIM_STRENGTH_MAX;
        cloudRimThickness = clamp(decodeCloudRimBucket(CloudOffset.y, decodedOffsetY) / CLOUD_RIM_PACK_STEPS, 0.0, 1.0) * CLOUD_RIM_THICKNESS_MAX;
        cloudRimColorInfluence = clamp(decodeCloudRimBucket(CloudOffset.z, decodedOffsetZ) / CLOUD_RIM_PACK_STEPS, 0.0, 1.0) * CLOUD_RIM_COLOR_INFLUENCE_MAX;
    }

    vec3 renderCellSize = vec3(CellSize.x, max(abs(decodedHeight), 0.001), CellSize.z);
    vec3 pos = (faceVertex * renderCellSize) + (vec3(cellX, 0, cellZ) * renderCellSize) + vec3(decodedOffsetX, decodedOffsetY, decodedOffsetZ);
    gl_Position = ProjMat * ModelViewMat * vec4(pos, 1.0);

    vertexDistance = fog_spherical_distance(pos);
    vec4 faceColor = (useTopColor ? faceColors[1] : faceColors[direction]) * CloudColor;
    vertexColor = mix(faceColor, CloudColor, storyCloud * 0.90);
    cloudLocalY = clamp(faceVertex.y, 0.0, 1.0);
    cloudFace = float(direction);
    if (direction <= 1) {
        cloudFaceUv = faceVertex.xz;
    } else if (direction <= 3) {
        cloudFaceUv = faceVertex.xy;
    } else {
        cloudFaceUv = faceVertex.zy;
    }
}
