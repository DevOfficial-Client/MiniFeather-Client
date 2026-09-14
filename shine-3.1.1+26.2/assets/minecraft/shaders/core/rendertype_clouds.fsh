#version 330

#moj_import <minecraft:fog.glsl>

in float vertexDistance;
in vec4 vertexColor;
in float cloudLocalY;
flat in float storyCloud;
flat in float whiteFadeCloud;
flat in float cloudFace;
in vec2 cloudFaceUv;
flat in float cloudRimStrength;
flat in float cloudRimThickness;
flat in float cloudRimColorInfluence;
flat in float cloudRimStyle;

out vec4 fragColor;

float saturate(float value) {
    return clamp(value, 0.0, 1.0);
}

void main() {
    vec4 color = vertexColor;
    float fogFade = 1.0 - linear_fog_value(vertexDistance, 0.0, FogCloudsEnd);
    if (storyCloud < 0.5) {
        color.a *= fogFade;
        fragColor = color;
        return;
    }

    float y = clamp(cloudLocalY, 0.0, 1.0);
    bool isBottomFace = cloudFace < 0.5;
    bool isTopFace = cloudFace >= 0.5 && cloudFace < 1.5;
    bool isSideFace = !isBottomFace && !isTopFace;
    float bottomFace = isBottomFace ? 1.0 : 0.0;
    float topFace = isTopFace ? 1.0 : 0.0;
    float sideFace = isSideFace ? 1.0 : 0.0;
    bool isWhiteFade = whiteFadeCloud > 0.5;
    vec3 cloudTint = color.rgb;
    vec3 upperFade;
    vec3 storyColor;
    float heightRamp = 0.0;
    float upperFeather = 0.0;

    if (isWhiteFade) {
        upperFade = vec3(1.0);
        if (isTopFace) {
            storyColor = upperFade;
        } else {
            vec3 whiteUnderside = clamp(mix(cloudTint, vec3(1.0), 0.22) * vec3(0.94, 0.96, 1.0), 0.0, 1.0);
            if (isBottomFace) {
                storyColor = whiteUnderside;
            } else {
                float whiteSideRamp = smoothstep(0.06, 0.88, y);
                vec3 whiteSideLower = mix(whiteUnderside, cloudTint, 0.45);
                storyColor = mix(whiteSideLower, vec3(1.0), 0.04 + whiteSideRamp * 0.86);
            }
        }
    } else {
        float warmTint = smoothstep(0.05, 0.38, cloudTint.r - cloudTint.b);
        vec3 warmFade = vec3(
            mix(cloudTint.r * 0.58, cloudTint.r, 0.18),
            cloudTint.g * 0.72,
            max(cloudTint.b * 1.08, cloudTint.r * 0.62)
        );
        vec3 neutralFade = mix(cloudTint, vec3(0.72, 0.84, 1.0), 0.18);
        upperFade = mix(neutralFade, warmFade, warmTint);
        if (isTopFace) {
            storyColor = upperFade;
        } else {
            vec3 lowerCloud = max(cloudTint, vec3(0.08)) * 1.08;
            if (isBottomFace) {
                storyColor = lowerCloud;
            } else {
                heightRamp = smoothstep(0.02, 0.98, y);
                upperFeather = smoothstep(0.70, 1.0, y);
                storyColor = mix(lowerCloud, upperFade, heightRamp);
            }
        }
    }

    if (!isWhiteFade || !isTopFace) {
        float farBlend = smoothstep(0.25, 1.0, clamp(vertexDistance / max(FogCloudsEnd, 1.0), 0.0, 1.0));
        storyColor = mix(storyColor, upperFade, farBlend * (isWhiteFade ? 0.04 : 0.16));
    }

    float rimStrength = saturate(cloudRimStrength * 0.5) * clamp(storyCloud, 0.0, 1.0);
    if (rimStrength > 0.001) {
        float thickness = saturate(cloudRimThickness / 5.0);
        float edgeDistance = min(min(cloudFaceUv.x, 1.0 - cloudFaceUv.x), min(cloudFaceUv.y, 1.0 - cloudFaceUv.y));
        float rimWidth = mix(0.018, 0.70, thickness);
        float cellRimMask = 1.0 - smoothstep(rimWidth * 0.32, rimWidth, edgeDistance);
        float faceMask = sideFace + topFace * 0.72 + bottomFace * 0.26;
        float heightMask = mix(0.58, 1.0, smoothstep(0.10, 0.92, y));
        cellRimMask *= faceMask * heightMask;

        float sideSurfaceRim = sideFace * mix(0.85, 1.35, thickness) * heightMask;
        float capSurfaceRim = (topFace * mix(0.20, 0.48, thickness) + bottomFace * mix(0.16, 0.40, thickness)) * smoothstep(0.04, 0.42, thickness);
        float blobRimMask = saturate(sideSurfaceRim + capSurfaceRim);
        float rimMask = mix(cellRimMask, blobRimMask, step(0.5, cloudRimStyle));

        vec3 cloudWeightedRim = max(storyColor, vec3(0.0));
        vec3 rimTint = mix(vec3(1.0), max(cloudWeightedRim * 1.20, vec3(0.32)), saturate(cloudRimColorInfluence));
        if (cloudRimColorInfluence > 1.0) {
            rimTint = mix(rimTint, max(cloudWeightedRim * 1.55, vec3(0.52)), saturate(cloudRimColorInfluence - 1.0));
        }
        vec3 rimLight = clamp(rimTint * rimMask * cloudRimStrength, 0.0, 1.0);
        storyColor = 1.0 - (1.0 - storyColor) * (1.0 - rimLight);
    }
    color.rgb = storyColor;

    float storyAlpha = 1.0;
    if (!isWhiteFade) {
        if (isTopFace) {
            storyAlpha = 0.06;
        } else if (isSideFace) {
            storyAlpha = mix(1.0, 0.24, heightRamp) * mix(1.0, 0.18, upperFeather);
        }
    }
    color.a *= fogFade * storyAlpha;
    fragColor = color;
}
