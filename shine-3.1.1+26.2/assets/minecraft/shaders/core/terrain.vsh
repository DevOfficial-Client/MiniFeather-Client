#version 330

#moj_import <minecraft:fog.glsl>
#moj_import <minecraft:globals.glsl>
#moj_import <minecraft:chunksection.glsl>
#moj_import <minecraft:projection.glsl>
#moj_import <minecraft:sample_lightmap.glsl>

#ifdef VULKAN

in vec3 Position;
in vec4 Color;
in vec2 UV0;
in ivec2 UV2;

uniform sampler2D Sampler2;

out float sphericalVertexDistance;
out float cylindricalVertexDistance;
out vec4 vertexColor;
out vec2 texCoord0;

void main() {
    vec3 pos = Position + (ChunkPosition - CameraBlockPos) + CameraOffset;
    gl_Position = ProjMat * ModelViewMat * vec4(pos, 1.0);

    sphericalVertexDistance = fog_spherical_distance(pos);
    cylindricalVertexDistance = fog_cylindrical_distance(pos);
    vertexColor = Color * sample_lightmap(Sampler2, UV2);
    texCoord0 = UV0;
}

#else

in vec3 Position;
in vec4 Color;
in vec2 UV0;
in ivec2 UV2;
in vec3 Normal;

uniform sampler2D Sampler2;
uniform sampler2D ShineFoliageWindMaskSampler;
uniform sampler2D ShineGrassBladeInteractionSampler;
uniform int u_ShineGrassBladeInteractionEnabled;
uniform vec3 u_ShineGrassBladeInteractionOrigin;
uniform float u_ShineGrassBladeInteractionWorldSize;
uniform float u_ShineGrassBladeInteractionMaxOffset;
uniform float u_ShineTerrainInteractionTickAlpha;
uniform float u_ShineFoliageInteractionTickAlpha;
uniform int u_ShineFoliageInteractionEnabled;
uniform float u_ShineFoliageInteractionBend;
uniform vec4 u_ShineFoliageInteractionBounds;
uniform int u_ShineGrassBladeLodEnabled;
uniform float u_ShineGrassBladeLodFullDetail;
uniform float u_ShineGrassBladeLodRenderDistance;
uniform float u_ShineGrassBladeLodFarDensity;
uniform int u_ShineGrassBladeWindEnabled;
uniform float u_ShineGrassBladeWindResponse;
uniform float u_ShineGrassBladeWindStiffness;
uniform float u_ShineGrassBladeWindStiffnessVariation;
uniform float u_ShineGrassBladeWindPhaseVariation;
uniform float u_ShineGrassBladeWindTipLag;
uniform int u_ShineColoredLightCount;
uniform vec4 u_ShineColoredLightPosRadius[64];
uniform vec4 u_ShineColoredLightColor[64];
uniform float u_ShineColoredLightMinBlock[64];
uniform int u_ShineColoredLightHasMinBlock;
uniform int u_ShineFoliageWindEnabled;
uniform int u_ShineFoliageWindMode;
uniform float u_ShineFoliageWindTime;
uniform float u_ShineFoliageWindPhase;
uniform float u_ShineFoliageWindStrength;
uniform float u_ShineFoliageWindSpeed;
uniform float u_ShineFoliageWindFrameRate;
uniform float u_ShineFoliageWindMaxOffset;
uniform float u_ShineFoliageWindDirection;
uniform float u_ShineFoliageWindLeafWave;
uniform float u_ShineFoliageWindLeafDrift;
uniform float u_ShineFoliageWindGrassSlice;
uniform float u_ShineFoliageWindGrassDrift;
uniform float u_ShineFoliageWindTopBias;
uniform float u_ShineFoliageWindGust;
uniform int u_ShineFoliageWindGroundEnabled;
uniform int u_ShineFoliageWindLeavesEnabled;
uniform float u_ShineFoliageWindLeafStrength;
uniform float u_ShineFoliageWindLeafSpeed;
uniform float u_ShineFoliageWindLeafMaxOffset;
uniform float u_ShineFoliageWindLeafFlutter;
uniform int u_ShineBlockMotionEnabled;
uniform float u_ShineBlockMotionTime;
uniform int u_ShineBlockMotionProfileCount;
uniform vec4 u_ShineBlockMotionProfileA[16];
uniform vec4 u_ShineBlockMotionProfileB[16];

out float sphericalVertexDistance;
out float cylindricalVertexDistance;
out vec4 vertexColor;
out vec4 shineUnlitVertexColor;
out vec2 texCoord0;
out float bloomStrength;
flat out int bloomRadiusProfile;
out float rimLightIncluded;
out vec3 shineWorldPos;
out float shineTopFace;
out float shineTerrainCausticsWaterMask;
out float shineTerrainCausticsSkyLight;
flat out int shineWaterSurface;
flat out int shineShoreFoamEdges;
flat out int shineShoreFoamProfile;
flat out int shineBiomeLavaColor;
flat out int shineBlockMotionProfile;
flat out int shineFoliageWindCandidate;
out vec3 shineBlockMotionWorldPos;

vec2 minecraft_lightmap_uv(ivec2 uv) {
    ivec2 vanillaUv = ivec2(uv.x & 0xFF, uv.y & 0xFF);
    return clamp((vanillaUv / 256.0) + 0.5 / 16.0, vec2(0.5 / 16.0), vec2(15.5 / 16.0));
}

vec4 minecraft_sample_lightmap(sampler2D lightMap, ivec2 uv) {
    return texture(lightMap, minecraft_lightmap_uv(uv));
}

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

vec3 shine_colored_light_tonemap(vec3 c) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 tc = c / (c + 1.0);
    return mix(c / (l + 1.0), tc, tc);
}

vec4 shine_apply_colored_light(vec3 position, vec4 baseColor, vec2 lightUv) {
    if (u_ShineColoredLightCount <= 0) {
        return baseColor;
    }
    float blockLight = smoothstep(0.5 / 16.0, 20.5 / 16.0, clamp(lightUv.x, 0.0, 1.0));
    if (blockLight <= 0.0 && u_ShineColoredLightHasMinBlock == 0) {
        return baseColor;
    }

    vec3 lightColor = vec3(0.0);
    for (int i = 0; i < u_ShineColoredLightCount; ++i) {
        vec4 posRadius = u_ShineColoredLightPosRadius[i];
        vec3 delta = posRadius.xyz - position;
        float distSq = dot(delta, delta);
        float radiusSq = posRadius.w * posRadius.w;
        if (distSq >= radiusSq) {
            continue;
        }
        vec4 colorIntensity = u_ShineColoredLightColor[i];
        float lightScale = max(blockLight, clamp(u_ShineColoredLightMinBlock[i], 0.0, 1.0)) * 3.5;
        if (lightScale <= 0.0) {
            continue;
        }
        float intensity = smoothstep(0.0, 1.0, 1.0 - sqrt(distSq) * colorIntensity.a);
        lightColor = max(lightColor, colorIntensity.rgb * intensity * lightScale);
    }

    if (dot(lightColor, vec3(1.0)) <= 0.0) {
        return baseColor;
    }
    return vec4(baseColor.rgb + clamp(shine_colored_light_tonemap(lightColor), 0.0, 1.0), baseColor.a);
}

vec3 shineSampleFoliageWindMaskVertex(vec2 uv) {
    ivec2 maskSize = textureSize(ShineFoliageWindMaskSampler, 0);
    ivec2 texel = ivec2(floor(uv * vec2(maskSize)));
    texel = clamp(texel, ivec2(0), maskSize - ivec2(1));
    return texelFetch(ShineFoliageWindMaskSampler, texel, 0).rgb;
}

float shineGrassMaskSubtype(vec4 categorySample) {
    return floor(floor(categorySample.r * 255.0 + 0.5) / 64.0);
}

float shineGrassMaskLocalX(vec4 categorySample) {
    return mod(floor(categorySample.r * 255.0 + 0.5), 64.0) / 63.0;
}

float shineFoliageWindSampleTime(float sourceTime) {
    float frameRate = max(u_ShineFoliageWindFrameRate, 0.0);
    if (frameRate < 0.5) {
        return sourceTime;
    }
    return floor(sourceTime * frameRate) / frameRate;
}

float shineGrassBladeMarker(vec2 uv, float encodedMarker) {
    if (encodedMarker < 0.5) {
        return 0.0;
    }
    ivec2 maskSize = textureSize(ShineFoliageWindMaskSampler, 0);
    vec2 maxMaskTexel = vec2(max(maskSize - ivec2(1), ivec2(0)));
    vec2 maskTexel = floor(clamp(uv * vec2(maskSize) - vec2(0.001), vec2(0.0), maxMaskTexel));
    vec4 categorySample = texelFetch(ShineFoliageWindMaskSampler, ivec2(maskTexel), 0);
    float customBladeMask = step(2.5, shineGrassMaskSubtype(categorySample)) * step(0.5, categorySample.b);
    return encodedMarker * customBladeMask;
}

ivec2 shineGrassBladeOwnerBlock(vec2 worldXZ, float bladeInteractionCode) {
    const int interactionSubdivisions = 4;
    int packedCode = int(floor(bladeInteractionCode + 0.5));
    int anchorCode = packedCode & 15;
    ivec2 bladeCell = ivec2(anchorCode % interactionSubdivisions, anchorCode / interactionSubdivisions);
    vec2 bladeRootAnchor = (vec2(bladeCell) + vec2(0.5)) / float(interactionSubdivisions);
    ivec2 bladeBlock = ivec2(floor(worldXZ - bladeRootAnchor + vec2(0.5)));
    ivec2 expectedParity = ivec2((packedCode >> 4) & 1, (packedCode >> 5) & 1);
    vec2 residual = worldXZ - (vec2(bladeBlock) + bladeRootAnchor);
    if ((bladeBlock.x & 1) != expectedParity.x) {
        bladeBlock.x += residual.x >= 0.0 ? 1 : -1;
    }
    if ((bladeBlock.y & 1) != expectedParity.y) {
        bladeBlock.y += residual.y >= 0.0 ? 1 : -1;
    }
    return bladeBlock;
}

vec3 shineGrassBladeInteractionOffset(vec3 worldPos, vec2 uv, float bladeVertexMarker, float bladeInteractionCode) {
    if (u_ShineGrassBladeInteractionEnabled == 0 || bladeVertexMarker < 0.5) {
        return vec3(0.0);
    }

	// Both markers are required: the encoded vertex alpha identifies generated
	// geometry, while this atlas-only marker proves it uses Shine's blade sprite.
    // Keeping both checks here prevents any ordinary ground vertex from moving.
    ivec2 maskSize = textureSize(ShineFoliageWindMaskSampler, 0);
    vec2 maxMaskTexel = vec2(max(maskSize - ivec2(1), ivec2(0)));
    vec2 maskTexel = floor(clamp(uv * vec2(maskSize) - vec2(0.001), vec2(0.0), maxMaskTexel));
    vec4 categorySample = texelFetch(ShineFoliageWindMaskSampler, ivec2(maskTexel), 0);
    float customBladeMask = step(2.5, shineGrassMaskSubtype(categorySample)) * step(0.5, categorySample.b);
    if (customBladeMask < 0.5) {
        return vec3(0.0);
    }

    const int interactionSubdivisions = 4;
    int anchorCode = int(floor(bladeInteractionCode + 0.5)) & 15;
    ivec2 bladeCell = ivec2(anchorCode % interactionSubdivisions, anchorCode / interactionSubdivisions);
    ivec2 bladeBlock = shineGrassBladeOwnerBlock(worldPos.xz, bladeInteractionCode);
    ivec2 worldCell = bladeBlock * interactionSubdivisions + bladeCell;
    ivec2 fieldSize = textureSize(ShineGrassBladeInteractionSampler, 0);
    ivec2 fieldOrigin = ivec2(floor(u_ShineGrassBladeInteractionOrigin.xz)) * interactionSubdivisions;
    ivec2 fieldTexel = worldCell - fieldOrigin;
    int fieldExtent = min(min(fieldSize.x, fieldSize.y), int(max(u_ShineGrassBladeInteractionWorldSize, 1.0) * float(interactionSubdivisions)));
    if (any(lessThan(fieldTexel, ivec2(0))) || any(greaterThanEqual(fieldTexel, ivec2(fieldExtent)))) {
        return vec3(0.0);
    }

    ivec2 physicalTexel = fieldTexel;
    vec4 currentInteraction = texelFetch(ShineGrassBladeInteractionSampler, physicalTexel, 0);
    vec4 previousInteraction = texelFetch(ShineGrassBladeInteractionSampler, physicalTexel + ivec2(fieldExtent, 0), 0);
    vec4 interaction = mix(previousInteraction, currentInteraction, clamp(u_ShineTerrainInteractionTickAlpha, 0.0, 1.0));
    if (interaction.a < 0.5) {
        return vec3(0.0);
    }

    float surfaceY = u_ShineGrassBladeInteractionOrigin.y + floor(interaction.b * 255.0 + 0.5) / 4.0;
    float heightAboveSurface = worldPos.y - surfaceY;
    if (heightAboveSurface < -0.08 || heightAboveSurface > 7.55) {
        return vec3(0.0);
    }

    vec2 signedOffset = ((interaction.rg * 255.0 - vec2(127.5)) / 127.5)
        * max(u_ShineGrassBladeInteractionMaxOffset, 0.0);
    float individualSeed = dot(vec3(vec2(bladeBlock), float(anchorCode) + 1.0), vec3(12.9898, 78.233, 37.719));
    float individualA = fract(sin(individualSeed) * 43758.5453);
    float individualB = fract(sin(individualSeed + 19.19) * 24634.6345);
    float individualAngle = (individualA - 0.5) * 0.24;
    float individualCos = cos(individualAngle);
    float individualSin = sin(individualAngle);
    signedOffset = mat2(individualCos, individualSin, -individualSin, individualCos)
        * signedOffset * mix(0.88, 1.12, individualB);
    float bladeHeight = clamp(categorySample.a, 0.0, 1.0);
    float rootAnchoredFlex = bladeHeight * bladeHeight * (3.0 - 2.0 * bladeHeight);
    return vec3(signedOffset.x, 0.0, signedOffset.y) * rootAnchoredFlex;
}

vec3 shineFoliageInteractionOffset(vec3 worldPos, float foliageMarkerCode) {
    if (u_ShineFoliageInteractionEnabled == 0 || foliageMarkerCode < 0.0 || foliageMarkerCode >= 40.0) {
        return vec3(0.0);
    }

    int packedCode = int(floor(foliageMarkerCode + 0.5));
    int groupCode = packedCode / 5;
    bool doublePlant = (groupCode & 1) != 0;
    int parityCode = groupCode >> 1;
    ivec2 expectedParity = ivec2(parityCode & 1, (parityCode >> 1) & 1);
    vec2 parityCenter = vec2(expectedParity) + vec2(0.5);
    ivec2 ownerBlock = ivec2(floor((worldPos.xz - parityCenter) * 0.5 + vec2(0.5))) * 2 + expectedParity;
    if (float(ownerBlock.x) < u_ShineFoliageInteractionBounds.x
        || float(ownerBlock.y) < u_ShineFoliageInteractionBounds.y
        || float(ownerBlock.x) > u_ShineFoliageInteractionBounds.z
        || float(ownerBlock.y) > u_ShineFoliageInteractionBounds.w) {
        return vec3(0.0);
    }
    ivec2 fieldOrigin = ivec2(floor(u_ShineGrassBladeInteractionOrigin.xz));
    ivec2 fieldTexel = ownerBlock - fieldOrigin;
    int worldExtent = int(max(u_ShineGrassBladeInteractionWorldSize, 1.0));
    int grassFieldExtent = worldExtent * 4;
    if (any(lessThan(fieldTexel, ivec2(0))) || any(greaterThanEqual(fieldTexel, ivec2(worldExtent)))) {
        return vec3(0.0);
    }
    float bestScore = -1.0;
    vec4 bestInteraction = vec4(0.0);
    float bestProgress = 0.0;

    // Resolve exactly one parity-constrained owner. A neighborhood search can
    // see two cells with the same parity and make separate plants share a bend.
    int vertexFloorY = int(floor(worldPos.y + 0.0001));
    for (int rootOffset = 0; rootOffset < 4; ++rootOffset) {
        if (!doublePlant && rootOffset == 3) {
            continue;
        }
        int rootY = vertexFloorY + (doublePlant ? rootOffset - 2 : rootOffset - 1);
        int slot = rootY & 15;
        ivec2 currentTexel = ivec2(
            fieldTexel.x + (slot & 3) * worldExtent,
            grassFieldExtent + fieldTexel.y + (slot >> 2) * worldExtent
        );
        vec4 currentInteraction = texelFetch(ShineGrassBladeInteractionSampler, currentTexel, 0);
        vec4 previousInteraction = texelFetch(ShineGrassBladeInteractionSampler, currentTexel + ivec2(grassFieldExtent, 0), 0);
        if (max(currentInteraction.a, previousInteraction.a) < 0.5) {
            continue;
        }
        float surfaceY = u_ShineGrassBladeInteractionOrigin.y + floor(currentInteraction.b * 255.0 + 0.5) / 4.0;
        if (abs(surfaceY - float(rootY)) > 0.13) {
            continue;
        }
        float height = worldPos.y - surfaceY;
        float progress = doublePlant ? height * 0.5 : height;
        if (progress < -0.08 || progress > 1.08) {
            continue;
        }
        float score = 4.0 - abs(clamp(progress, 0.0, 1.0) - progress) * 8.0;
        if (score > bestScore) {
            bestScore = score;
            vec2 currentCompact = (currentInteraction.rg * 255.0 - vec2(127.5)) / 127.5;
            vec2 previousCompact = (previousInteraction.rg * 255.0 - vec2(127.5)) / 127.5;
            vec2 currentState = sign(currentCompact) * currentCompact * currentCompact * 6.0;
            vec2 previousState = sign(previousCompact) * previousCompact * previousCompact * 6.0;
            bestInteraction = vec4(
                mix(previousState, currentState, clamp(u_ShineFoliageInteractionTickAlpha, 0.0, 1.0)),
                0.0,
                1.0
            );
            bestProgress = progress;
        }
    }

    if (bestScore < 0.0 || bestProgress <= 0.04) {
        return vec3(0.0);
    }
    float weight = min(1.0, bestProgress * bestProgress);
    return vec3(bestInteraction.x, 0.0, bestInteraction.y) * max(u_ShineFoliageInteractionBend, 0.0) * weight;
}

float shineGrassBladeWindHash(vec3 seed) {
    return fract(sin(dot(seed, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

vec3 shineSmoothFoliageWindOffset(vec3 worldPos, vec2 uv, float windCandidateMarker, float bladeVertexMarker, float bladeInteractionCode, float bladeIdentityCode) {
    if (u_ShineFoliageWindEnabled == 0 || (windCandidateMarker < 0.5 && bladeVertexMarker < 0.5)) {
        return vec3(0.0);
    }

	ivec2 maskSize = textureSize(ShineFoliageWindMaskSampler, 0);
	vec2 maxMaskTexel = vec2(max(maskSize - ivec2(1), ivec2(0)));
	vec2 maskTexel = floor(clamp(uv * vec2(maskSize) - vec2(0.001), vec2(0.0), maxMaskTexel));
    vec4 categorySample = texelFetch(ShineFoliageWindMaskSampler, ivec2(maskTexel), 0);
    vec3 categoryMask = categorySample.rgb;
	float categoryPresence = max(categoryMask.r, max(categoryMask.g, categoryMask.b));
	if (categoryPresence <= 0.5) {
		return vec3(0.0);
	}
	float leafMask = step(0.5, categoryMask.g);
	float grassSubtype = shineGrassMaskSubtype(categorySample);
	float customBladeMask = step(2.5, grassSubtype) * step(0.5, categoryMask.b);
	float generatedBlade = customBladeMask * bladeVertexMarker;
	float grassMask = step(0.5, categoryMask.b) * (1.0 - leafMask) * (1.0 - customBladeMask) + generatedBlade;
	float genericMask = step(0.5, categoryMask.r) * (1.0 - leafMask) * (1.0 - grassMask);
	if (u_ShineFoliageWindMode != 1 && generatedBlade < 0.5) {
		return vec3(0.0);
	}
	float tallGrassBottom = grassMask * (1.0 - step(0.5, abs(grassSubtype - 1.0))) * (1.0 - generatedBlade);
	float tallGrassTop = grassMask * (1.0 - step(0.5, abs(grassSubtype - 2.0))) * (1.0 - generatedBlade);
	float tallGrassMask = max(tallGrassBottom, tallGrassTop);
	float leafWeight = leafMask * float(u_ShineFoliageWindLeavesEnabled != 0);
	float groundWeight = max(grassMask, genericMask * 0.55) * float(u_ShineFoliageWindGroundEnabled != 0);
	if (max(leafWeight, groundWeight) <= 0.5) {
		return vec3(0.0);
	}
    float speed = max(u_ShineFoliageWindSpeed, 0.0);
	float time = u_ShineFoliageWindPhase;
    vec2 windDirection = normalize(vec2(cos(radians(u_ShineFoliageWindDirection)), sin(radians(u_ShineFoliageWindDirection))) + vec2(1.0e-5, 0.0));
	vec2 crossDirection = vec2(-windDirection.y, windDirection.x);
	vec2 horizontalWorldRaw;
	float verticalWorldRaw;
	if (leafWeight > 0.5) {
		vec2 blockCell = floor(worldPos.xz);
		float blockPhase = dot(blockCell, vec2(0.37, 0.61)) + floor(worldPos.y) * 0.17;
		float gustWave = 0.5 + 0.5 * sin(time * 0.43 + blockPhase * 0.7);
		gustWave = clamp(gustWave + 0.22 * sin(time * 0.17 + blockPhase * 1.9), 0.0, 1.0);
		float gust = mix(1.0, 0.35 + gustWave * 1.35, clamp(u_ShineFoliageWindGust, 0.0, 1.0));
		float leafTime = time * (speed > 1.0e-5 ? max(u_ShineFoliageWindLeafSpeed, 0.0) / speed : 0.0);
		// Smooth leaves deform only geometry. This continuous world-space field gives
		// identical offsets to shared canopy vertices, keeping textures locked.
		float leafTravel = dot(worldPos.xz, windDirection) * 0.95 + dot(worldPos.xz, crossDirection) * 0.21 + worldPos.y * 0.63;
		float leafPhase = leafTime * 0.74 - leafTravel;
		float canopy = sin(leafPhase) + 0.32 * sin(leafTime * 0.31 - dot(worldPos.xz, crossDirection) * 1.13 + worldPos.y * 0.47);
		float flutter = sin(leafTime * 3.35 + dot(worldPos, vec3(1.70, 1.13, 1.41))) * u_ShineFoliageWindLeafFlutter;
		float swayControl = sqrt(max(u_ShineFoliageWindLeafDrift, 0.0));
		float liftControl = sqrt(max(u_ShineFoliageWindLeafWave, 0.0));
		float leafAlong = canopy * swayControl * 0.78 + flutter * 0.18;
		float leafAcross = sin(leafPhase * 0.61 + worldPos.y * 0.83) * swayControl * 0.18 + flutter * 0.06;
		float leafLift = sin(leafPhase * 0.79 + worldPos.x * 0.52) * liftControl * 0.24 + flutter * 0.055;
		float leafAmount = max(u_ShineFoliageWindLeafStrength, 0.0) * max(u_ShineFoliageWindLeafMaxOffset, 0.0) * gust;
		horizontalWorldRaw = (windDirection * leafAlong + crossDirection * leafAcross) * leafWeight * leafAmount * 0.075;
		verticalWorldRaw = leafLift * leafWeight * leafAmount * 0.045;
	} else {
		ivec2 generatedBladeOwner = ivec2(floor(worldPos.xz));
		float bladeStiffness = 0.0;
		float bladePhaseOffset = 0.0;
		float bladeTipLagScale = 0.0;
		float localGrassResponse = 1.0;
		if (generatedBlade > 0.5) {
			generatedBladeOwner = shineGrassBladeOwnerBlock(worldPos.xz, bladeInteractionCode);
			float identitySeed = float(generatedBladeOwner.x) * 0.75487769
				+ float(generatedBladeOwner.y) * 0.56984029
				+ bladeIdentityCode * 1.61803399
				+ bladeInteractionCode * 0.117;
			float bladePhaseHash = shineGrassBladeWindHash(vec3(vec2(generatedBladeOwner), identitySeed + 1.0));
			float bladeStiffnessHash = shineGrassBladeWindHash(vec3(vec2(generatedBladeOwner.yx), identitySeed + 19.19));
			bladeStiffness = clamp(
				u_ShineGrassBladeWindStiffness
					+ (bladeStiffnessHash * 2.0 - 1.0) * u_ShineGrassBladeWindStiffnessVariation,
				0.0,
				1.0
			);
			bladePhaseOffset = (bladePhaseHash - 0.5) * 6.2831853 * clamp(u_ShineGrassBladeWindPhaseVariation, 0.0, 1.0);
			bladeTipLagScale = clamp(u_ShineGrassBladeWindTipLag, 0.0, 1.0) * mix(1.05, 0.45, bladeStiffness);
			localGrassResponse = u_ShineGrassBladeWindEnabled != 0
				? max(u_ShineGrassBladeWindResponse, 0.0) * mix(1.35, 0.35, bladeStiffness)
				: 0.0;
		}

		float localGrassX = shineGrassMaskLocalX(categorySample);
		float topBias = clamp(u_ShineFoliageWindTopBias, 0.0, 3.0) / 3.0;
		float singleBladeHeight = clamp(categorySample.a, 0.0, 1.0);
		float bladeHeight = mix(singleBladeHeight, singleBladeHeight * 0.5, tallGrassBottom);
		bladeHeight = mix(bladeHeight, 0.5 + singleBladeHeight * 0.5, tallGrassTop);
		float bladeTextureY = 1.0 - bladeHeight;
		float bladeFlex = smoothstep(mix(0.02, 0.48, topBias), 1.0, bladeHeight);
		bladeFlex = pow(bladeFlex, mix(0.85, 2.20, topBias));
		if (generatedBlade > 0.5) {
			bladeFlex = pow(max(bladeFlex, 0.0), 1.0 + bladeStiffness * 1.65);
		}
		float bladeBody = smoothstep(mix(0.08, 0.42, topBias), 0.92, bladeFlex);
		float bladeTip = smoothstep(mix(0.36, 0.68, topBias), 1.0, bladeFlex);
		float bladeTipLag = bladeTipLagScale * bladeFlex;
		vec2 blockCell = generatedBlade > 0.5 ? vec2(generatedBladeOwner) : floor(worldPos.xz);
		float blockPhase = dot(blockCell, vec2(0.37, 0.61)) + floor(worldPos.y) * 0.17 * (1.0 - tallGrassMask);
		float windDelay = dot(blockCell, windDirection) * 0.76 + dot(blockCell, vec2(-windDirection.y, windDirection.x)) * 0.12;
		float gustWave = 0.5 + 0.5 * sin(time * 0.43 + blockPhase * 0.7);
		gustWave = clamp(gustWave + 0.22 * sin(time * 0.17 + blockPhase * 1.9), 0.0, 1.0);
		float gust = mix(1.0, 0.35 + gustWave * 1.35, clamp(u_ShineFoliageWindGust, 0.0, 1.0));
		float amount = max(u_ShineFoliageWindStrength, 0.0) * max(u_ShineFoliageWindMaxOffset, 0.0) * gust;
		float grassPhase = time * 0.92 - windDelay + 0.32 * sin(time * 0.31 + blockPhase * 0.41)
			+ bladePhaseOffset - bladeTipLag;
		float grassSway = sin(grassPhase) + 0.24 * sin(grassPhase * 0.47 + blockPhase * 0.8 + 1.1);
		grassSway = clamp(grassSway * 0.68, -1.0, 1.0);
		float sliceTravel = grassPhase * 0.46 + 0.28 * sin(grassPhase * 0.19 + blockPhase);
		float sliceWave = sin((bladeTextureY * 0.92 + localGrassX * 0.18) * 6.2831853 - sliceTravel);
		sliceWave += 0.24 * sin((bladeTextureY * 1.84 - localGrassX * 0.22) * 6.2831853 - sliceTravel * 0.62 + blockPhase * 0.37);
		float sliceControl = u_ShineFoliageWindGrassSlice / (1.0 + max(u_ShineFoliageWindGrassSlice - 0.75, 0.0) * 0.45);
		float grassLoad = abs(grassSway * u_ShineFoliageWindGrassDrift * amount * 0.026) / 0.18;
		float sliceDamp = mix(1.0, 0.35, smoothstep(0.65, 1.35, grassLoad));
		float grassMove = (grassSway * 0.90 * bladeFlex + sliceWave * 0.18 * bladeBody * sliceControl * sliceDamp) * u_ShineFoliageWindGrassDrift * localGrassResponse;
		float grassLift = (sin(grassPhase * 0.72 + localGrassX * 1.60) * 0.45 * bladeTip - sliceWave * 0.08 * bladeBody * sliceDamp) * sliceControl * localGrassResponse;
		horizontalWorldRaw = windDirection * (grassMove * groundWeight * amount * 0.026);
		verticalWorldRaw = grassLift * groundWeight * amount * 0.010;
	}

    float horizontalLimit = 0.26;
	float horizontalLength = length(horizontalWorldRaw);
	float horizontalLimitRatio = horizontalLength / horizontalLimit;
	float horizontalSoftLength = horizontalLength / pow(1.0 + horizontalLimitRatio * horizontalLimitRatio * horizontalLimitRatio * horizontalLimitRatio, 0.25);
	vec2 xzOffset = horizontalLength > 1.0e-6 ? horizontalWorldRaw * (horizontalSoftLength / horizontalLength) : vec2(0.0);
    float verticalLimit = 0.08;
    float verticalLimitRatio = abs(verticalWorldRaw) / verticalLimit;
    float verticalWorld = verticalWorldRaw / pow(1.0 + verticalLimitRatio * verticalLimitRatio * verticalLimitRatio * verticalLimitRatio, 0.25);
    return vec3(xzOffset.x, verticalWorld, xzOffset.y);
}

float shineBlockMotionHash(vec3 cell) {
    return fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

vec3 shineBlockMotionOffset(vec3 worldPos, vec3 normal, float topFace, int profile) {
    if (u_ShineBlockMotionEnabled == 0 || profile <= 0 || profile >= 16) {
        return vec3(0.0);
    }

    vec4 a = u_ShineBlockMotionProfileA[profile];
    vec4 b = u_ShineBlockMotionProfileB[profile];
    float amplitude = max(a.x, 0.0);
    float speed = max(a.y, 0.0);
    if (amplitude <= 0.00001 || speed <= 0.00001) {
        return vec3(0.0);
    }
    if (b.x > 0.5 && topFace <= 0.5) {
        return vec3(0.0);
    }

    float scale = max(a.z, 0.0001);
    float randomness = clamp(a.w, 0.0, 1.0);
    vec3 cell = floor(worldPos + vec3(0.01));
    float randomPhase = shineBlockMotionHash(cell) * 6.2831853 * randomness;
    float spatialPhase = dot(cell, vec3(0.53, 0.37, 0.61)) * scale;
    float breath = sin(u_ShineBlockMotionTime * speed + spatialPhase + randomPhase);
    vec3 direction = dot(normal, normal) > 0.0001 ? normalize(normal) : vec3(0.0, 1.0, 0.0);
    return direction * breath * amplitude;
}

bool shineGrassBladeLodCulled(vec2 sectionWorldOrigin, vec2 sectionCameraRelative, float bladeVertexMarker, float bladeInteractionCode, float bladeIdentityCode) {
    if (u_ShineGrassBladeLodEnabled == 0 || bladeVertexMarker < 0.5) {
        return false;
    }

    // Use only per-section and per-blade-code inputs here. Reconstructing an
    // owner from each already-leaning vertex can disagree at tall blade tips,
    // which would cull only part of a quad and stretch it across the screen.
    // Section origin/distance are invariant across every segment and face.
    float distanceToCamera = length(sectionCameraRelative + vec2(8.0));
    float fullDetail = max(u_ShineGrassBladeLodFullDetail, 0.0);
    float renderDistance = max(u_ShineGrassBladeLodRenderDistance, fullDetail + 1.0);
    if (distanceToCamera <= fullDetail) {
        return false;
    }

    float lodProgress = clamp((distanceToCamera - fullDetail) / (renderDistance - fullDetail), 0.0, 1.0);
    float densityBlend = smoothstep(0.0, 0.72, lodProgress);
    float retention = mix(1.0, clamp(u_ShineGrassBladeLodFarDensity, 0.0, 1.0), densityBlend);
    retention *= 1.0 - smoothstep(0.82, 1.0, lodProgress);
    // The model bakes a deterministic, uniformly distributed 5-bit LOD rank.
    // Reusing it avoids an expensive transcendental hash for every blade vertex.
    float stableSelection = (bladeIdentityCode + 0.5) / 32.0;
    return stableSelection >= retention;
}

void main() {
    vec3 worldPos = Position + ChunkPosition;
    vec3 stableWorldPos = worldPos;
    float vertexTopFace = Normal.y > 0.5 ? 1.0 : 0.0;
    float grassBladeAlphaByte = floor(Color.a * 255.0 + 0.5);
    float blockMotionBottomSkirtMarker = 1.0 - step(0.5, abs(grassBladeAlphaByte - 147.0));
    // Terrain builders write this reserved range only for fully opaque quads
    // from known interactive foliage blocks. Keeping the
    // discriminator in color avoids consuming packed-light metadata used by
    // bloom, rim light, caustics, and other terrain effects.
    float foliageInteractionMarker = step(149.5, grassBladeAlphaByte)
        * (1.0 - step(189.5, grassBladeAlphaByte));
    float foliageInteractionCode = grassBladeAlphaByte - 150.0;
    float foliageInteractionFlags = mod(floor(foliageInteractionCode + 0.5), 5.0);
    float foliageInteractionWind = foliageInteractionMarker * step(0.5, mod(foliageInteractionFlags, 2.0));
	float foliageWindCandidateMarker = max(
		max(
			1.0 - step(0.5, abs(grassBladeAlphaByte - 148.0)),
			1.0 - step(0.5, abs(grassBladeAlphaByte - 149.0))
		),
		foliageInteractionWind
	);
    float grassBladeEncodedMarker = step(190.5, grassBladeAlphaByte) * (1.0 - step(254.5, grassBladeAlphaByte));
    float grassBladeVertexMarker = shineGrassBladeMarker(UV0, grassBladeEncodedMarker);
    float grassBladeInteractionCode = max(grassBladeAlphaByte - 191.0, 0.0);
    float grassBladeIdentityCode = float((UV2.y >> 8) & 31);
    vec3 baseCameraRelativePos = Position + (ChunkPosition - CameraBlockPos) + CameraOffset;
    vec2 grassBladeSectionCameraRelative = (ChunkPosition - CameraBlockPos + CameraOffset).xz;
    if (shineGrassBladeLodCulled(ChunkPosition.xz, grassBladeSectionCameraRelative, grassBladeVertexMarker, grassBladeInteractionCode, grassBladeIdentityCode)) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    vec4 shineTerrainVertexColor = Color;
    shineTerrainVertexColor.a = mix(
        Color.a,
        1.0,
        max(max(max(grassBladeVertexMarker, foliageInteractionMarker), foliageWindCandidateMarker), blockMotionBottomSkirtMarker)
    );
    vec3 smoothOffset = shineSmoothFoliageWindOffset(worldPos, UV0, foliageWindCandidateMarker, grassBladeVertexMarker, grassBladeInteractionCode, grassBladeIdentityCode);
    vec3 grassBladeInteractionOffset = shineGrassBladeInteractionOffset(worldPos, UV0, grassBladeVertexMarker, grassBladeInteractionCode);
    vec3 foliageInteractionOffset = shineFoliageInteractionOffset(worldPos, foliageInteractionMarker > 0.5 ? foliageInteractionCode : -1.0);
    int blockMotionProfile = ((UV2.x & 0x200) == 0) ? ((UV2.x >> 10) & 15) : 0;
    vec3 blockMotionSampleWorldPos = worldPos + vec3(0.0, blockMotionBottomSkirtMarker * 0.17, 0.0);
    vec3 blockMotionOffset = shineBlockMotionOffset(blockMotionSampleWorldPos, Normal, vertexTopFace, blockMotionProfile);
    vec3 terrainOffset = smoothOffset + grassBladeInteractionOffset + foliageInteractionOffset + blockMotionOffset;
    vec3 pos = baseCameraRelativePos + terrainOffset;
    worldPos += terrainOffset;
    gl_Position = ProjMat * ModelViewMat * vec4(pos, 1.0);

    sphericalVertexDistance = fog_spherical_distance(pos);
    cylindricalVertexDistance = fog_cylindrical_distance(pos);
    vertexColor = shine_apply_colored_light(pos, shineTerrainVertexColor * minecraft_sample_lightmap(Sampler2, UV2), minecraft_lightmap_uv(UV2));
    shineUnlitVertexColor = shineTerrainVertexColor;
    texCoord0 = UV0;
	bloomStrength = shine_decode_bloom_strength(UV2);
	bloomRadiusProfile = ((UV2.x & 0x8000) != 0 ? 1 : 0) + ((UV2.y & 0x8000) != 0 ? 2 : 0);
    rimLightIncluded = ((UV2.x & 0x100) != 0) ? 1.0 : 0.0;
    shineWorldPos = worldPos;
    shineTopFace = vertexTopFace;
    shineTerrainCausticsWaterMask = ((UV2.x & 0x200) != 0) ? 1.0 : 0.0;
    shineTerrainCausticsSkyLight = float((UV2.y & 0xF0) >> 4);
    shineWaterSurface = ((UV2.x & 0x200) != 0)
        && ((UV2.x & 0x4000) == 0)
        && floor(Color.a * 255.0 + 0.5) < 254.5
        ? 1
        : 0;
    shineShoreFoamEdges = (UV2.x >> 10) & 15;
    shineShoreFoamProfile = (UV2.y >> 8) & 127;
    shineBiomeLavaColor = ((UV2.x & 0x4000) != 0) ? 1 : 0;
    shineBlockMotionProfile = blockMotionProfile;
	shineFoliageWindCandidate = max(foliageWindCandidateMarker, grassBladeVertexMarker) > 0.5 ? 1 : 0;
    shineBlockMotionWorldPos = stableWorldPos + vec3(0.0, blockMotionBottomSkirtMarker * 0.17, 0.0);
}

#endif
