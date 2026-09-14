#version 330

#moj_import <minecraft:dynamictransforms.glsl>

in vec3 localPosition;

out vec4 fragColor;

float saturate(float value) {
    return clamp(value, 0.0, 1.0);
}

float smootherstep(float value) {
    float t = saturate(value);
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

void main() {
    float height = saturate(localPosition.y / 1040.0 + 0.5);
    float curve = smootherstep(height);
    float nightShade = mix(0.578, 0.17, curve);
    float shade = mix(1.0, nightShade, saturate(ColorModulator.a));
    fragColor = vec4(ColorModulator.rgb * shade, 1.0);
}


