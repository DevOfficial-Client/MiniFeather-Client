#version 330

#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:projection.glsl>

layout(std140) uniform ShineWorldHaze {
    vec4 HazeLowerDensity;
    vec4 HazeMiddleFalloff;
    vec4 HazeUpperAccentDensity;
    vec4 HazeAccentLayer;
    vec4 HazeShape;
};

in vec3 Position;

out vec4 vertexColor;

float saturate(float value) {
    return clamp(value, 0.0, 1.0);
}

float smooth01(float value) {
    float t = saturate(value);
    return t * t * (3.0 - 2.0 * t);
}

float quantize8(float value) {
    return floor(saturate(value) * 255.0 + 0.5) / 255.0;
}

vec3 quantize8(vec3 value) {
    return floor(clamp(value, vec3(0.0), vec3(1.0)) * 255.0 + vec3(0.5)) / 255.0;
}

void main() {
    float t = saturate(Position.y);
    float bottomY = HazeShape.x;
    float middleY = HazeShape.y;
    float topY = HazeShape.z;
    float baseRadius = HazeShape.w;
    float span = topY - bottomY;
    float middle = span <= 0.001 ? 0.5 : clamp((middleY - bottomY) / span, 0.08, 0.92);
    float radius = baseRadius * (0.98 + t * t * 0.08);
    vec3 localPosition = vec3(Position.x * radius, mix(bottomY, topY, t), Position.z * radius);

    bool accent = HazeAccentLayer.w > 0.5;
    vec3 color;
    if (accent) {
        color = HazeAccentLayer.rgb;
    } else if (t <= middle) {
        float amount = middle <= 0.001 ? 1.0 : smooth01(t / middle);
        color = mix(HazeLowerDensity.rgb, HazeMiddleFalloff.rgb, amount);
    } else {
        float amount = smooth01((t - middle) / max(0.001, 1.0 - middle));
        color = mix(HazeMiddleFalloff.rgb, HazeUpperAccentDensity.rgb, amount);
    }

    float rise = middle <= 0.001 ? 1.0 : smooth01(t / middle);
    float fade = 1.0 - smooth01((t - middle) / max(0.001, 1.0 - middle));
    float exponent = clamp(1.0 / max(0.35, HazeMiddleFalloff.w), 0.45, 2.25);
    float density = accent ? HazeUpperAccentDensity.w : HazeLowerDensity.w;
    float alpha = quantize8(density * rise * pow(fade, exponent));

    vertexColor = vec4(quantize8(color), alpha);
    gl_Position = ProjMat * ModelViewMat * vec4(localPosition, 1.0);
}
