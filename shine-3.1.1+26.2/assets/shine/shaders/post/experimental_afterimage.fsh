#version 330

uniform sampler2D MainSampler;
uniform sampler2D AfterimageEcho0Sampler;
uniform sampler2D AfterimageEcho1Sampler;
uniform sampler2D AfterimageEcho2Sampler;
uniform sampler2D AfterimageEcho3Sampler;
uniform sampler2D AfterimageEcho4Sampler;
uniform sampler2D AfterimageEcho5Sampler;
uniform sampler2D AfterimageEcho6Sampler;
uniform sampler2D AfterimageEcho7Sampler;
uniform sampler2D AfterimageEcho8Sampler;
uniform sampler2D AfterimageEcho9Sampler;
uniform sampler2D AfterimageEcho10Sampler;
uniform sampler2D AfterimageEcho11Sampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 MainSize;
    vec2 AfterimageEcho0Size;
    vec2 AfterimageEcho1Size;
    vec2 AfterimageEcho2Size;
    vec2 AfterimageEcho3Size;
    vec2 AfterimageEcho4Size;
    vec2 AfterimageEcho5Size;
    vec2 AfterimageEcho6Size;
    vec2 AfterimageEcho7Size;
    vec2 AfterimageEcho8Size;
    vec2 AfterimageEcho9Size;
    vec2 AfterimageEcho10Size;
    vec2 AfterimageEcho11Size;
};

layout(std140) uniform AfterimageCompositeConfig {
    float AfterimageCompositeEnabled;
    float AfterimageCompositeStrength;
    float AfterimageCompositeEchoCount;
    float AfterimageCompositeOffsetPixels;
    float AfterimageCompositeColorSplit;
    float AfterimageCompositeWeight0;
    float AfterimageCompositeWeight1;
    float AfterimageCompositeWeight2;
    float AfterimageCompositeWeight3;
    float AfterimageCompositeWeight4;
    float AfterimageCompositeWeight5;
    float AfterimageCompositeWeight6;
    float AfterimageCompositeWeight7;
    float AfterimageCompositeWeight8;
    float AfterimageCompositeWeight9;
    float AfterimageCompositeWeight10;
    float AfterimageCompositeWeight11;
    float AfterimageCompositeAnimationTime;
    float AfterimageCompositeIntervalSeconds;
    float AfterimageCompositePeripheral;
};

out vec4 fragColor;

float saturate(float value) {
    return clamp(value, 0.0, 1.0);
}

vec3 sampleAfterimageEcho(sampler2D echoSampler, vec2 uv, vec2 offset, float split) {
    if (split <= 1.0e-4 || dot(offset, offset) <= 1.0e-12) {
        return texture(echoSampler, uv).rgb;
    }

    return vec3(
        texture(echoSampler, clamp(uv + offset * (1.0 + split), vec2(0.0), vec2(1.0))).r,
        texture(echoSampler, clamp(uv + offset * 0.25, vec2(0.0), vec2(1.0))).g,
        texture(echoSampler, clamp(uv - offset * (1.0 + split), vec2(0.0), vec2(1.0))).b
    );
}

void accumulateAfterimageEcho(
    inout vec3 echoSum,
    inout float amountSum,
    sampler2D echoSampler,
    vec2 uv,
    vec2 offset,
    float split,
    float weight,
    float edgeBoost
) {
    float amount = saturate(AfterimageCompositeStrength * weight * edgeBoost);
    if (amount <= 1.0e-4) {
        return;
    }
    echoSum += sampleAfterimageEcho(echoSampler, uv, offset, split) * amount;
    amountSum += amount;
}

vec3 applyPsychedelicAfterimage(vec2 uv, vec3 color) {
    if (
        AfterimageCompositeEnabled <= 0.5
        || AfterimageCompositeStrength <= 1.0e-4
        || AfterimageCompositeEchoCount < 0.5
        || max(
            max(max(AfterimageCompositeWeight0, AfterimageCompositeWeight1), max(AfterimageCompositeWeight2, AfterimageCompositeWeight3)),
            max(max(max(AfterimageCompositeWeight4, AfterimageCompositeWeight5), max(AfterimageCompositeWeight6, AfterimageCompositeWeight7)),
                max(max(AfterimageCompositeWeight8, AfterimageCompositeWeight9), max(AfterimageCompositeWeight10, AfterimageCompositeWeight11)))
        ) <= 1.0e-4
    ) {
        return color;
    }

    float aspect = OutSize.x / max(OutSize.y, 1.0);
    vec2 centered = uv - 0.5;
    vec2 radial = centered * vec2(aspect, 1.0);
    float radialLength = length(radial);
    vec2 radialDirection = radialLength > 1.0e-4 ? radial / radialLength : vec2(0.0, 1.0);
    float cycle = floor(AfterimageCompositeAnimationTime / max(AfterimageCompositeIntervalSeconds, 0.25));
    vec2 driftDirection = normalize(vec2(
        sin(AfterimageCompositeAnimationTime * 0.47 + cycle * 1.37),
        cos(AfterimageCompositeAnimationTime * 0.39 - cycle * 0.91)
    ));
    vec2 mixedDirection = radialDirection * 0.62 + driftDirection * 0.38;
    vec2 direction = length(mixedDirection) > 1.0e-4 ? normalize(mixedDirection) : radialDirection;
    float split = saturate(AfterimageCompositeColorSplit);
    float offsetPixels = max(AfterimageCompositeOffsetPixels, 0.0) * split;
    vec2 offset = direction * offsetPixels / max(OutSize, vec2(1.0));
    float edgeBoost = mix(1.0, smoothstep(0.08, 0.78, radialLength), saturate(AfterimageCompositePeripheral) * 0.45);
    float echoCount = clamp(round(AfterimageCompositeEchoCount), 1.0, 12.0);

    vec3 echoSum = vec3(0.0);
    float amountSum = 0.0;
    if (echoCount >= 12.0) {
        accumulateAfterimageEcho(echoSum, amountSum, AfterimageEcho11Sampler, uv, offset, split, AfterimageCompositeWeight11, edgeBoost);
    }
    if (echoCount >= 11.0) {
        accumulateAfterimageEcho(echoSum, amountSum, AfterimageEcho10Sampler, uv, offset, split, AfterimageCompositeWeight10, edgeBoost);
    }
    if (echoCount >= 10.0) {
        accumulateAfterimageEcho(echoSum, amountSum, AfterimageEcho9Sampler, uv, offset, split, AfterimageCompositeWeight9, edgeBoost);
    }
    if (echoCount >= 9.0) {
        accumulateAfterimageEcho(echoSum, amountSum, AfterimageEcho8Sampler, uv, offset, split, AfterimageCompositeWeight8, edgeBoost);
    }
    if (echoCount >= 8.0) {
        accumulateAfterimageEcho(echoSum, amountSum, AfterimageEcho7Sampler, uv, offset, split, AfterimageCompositeWeight7, edgeBoost);
    }
    if (echoCount >= 7.0) {
        accumulateAfterimageEcho(echoSum, amountSum, AfterimageEcho6Sampler, uv, offset, split, AfterimageCompositeWeight6, edgeBoost);
    }
    if (echoCount >= 6.0) {
        accumulateAfterimageEcho(echoSum, amountSum, AfterimageEcho5Sampler, uv, offset, split, AfterimageCompositeWeight5, edgeBoost);
    }
    if (echoCount >= 5.0) {
        accumulateAfterimageEcho(echoSum, amountSum, AfterimageEcho4Sampler, uv, offset, split, AfterimageCompositeWeight4, edgeBoost);
    }
    if (echoCount >= 4.0) {
        accumulateAfterimageEcho(echoSum, amountSum, AfterimageEcho3Sampler, uv, offset, split, AfterimageCompositeWeight3, edgeBoost);
    }
    if (echoCount >= 3.0) {
        accumulateAfterimageEcho(echoSum, amountSum, AfterimageEcho2Sampler, uv, offset, split, AfterimageCompositeWeight2, edgeBoost);
    }
    if (echoCount >= 2.0) {
        accumulateAfterimageEcho(echoSum, amountSum, AfterimageEcho1Sampler, uv, offset, split, AfterimageCompositeWeight1, edgeBoost);
    }
    accumulateAfterimageEcho(echoSum, amountSum, AfterimageEcho0Sampler, uv, offset, split, AfterimageCompositeWeight0, edgeBoost);
    if (amountSum <= 1.0e-4) {
        return color;
    }

    vec3 layeredEcho = echoSum / amountSum;
    float opacity = min(amountSum, 0.92);
    return mix(color, layeredEcho, opacity);
}

void main() {
    vec2 uv = gl_FragCoord.xy / OutSize;
    vec4 sceneSample = texture(MainSampler, uv);
    vec3 color = applyPsychedelicAfterimage(uv, sceneSample.rgb);
    fragColor = vec4(max(color, vec3(0.0)), sceneSample.a);
}
