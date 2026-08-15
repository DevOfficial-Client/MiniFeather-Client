#version 330


#define DIMENSION_MAIN


#include "/Lib/UniformDeclare.glsl"
#include "/Lib/Utilities.glsl"


/* DRAWBUFFERS:1 */
layout(location = 0) out vec4 compositeOutput1;


ivec2 texelCoord = ivec2(gl_FragCoord.xy);
vec2 texCoord = gl_FragCoord.xy * pixelSize;

in vec3 worldShadowVector;
in vec3 shadowVector;
in vec3 worldSunVector;
in vec3 worldMoonVector;

in vec3 colorShadowlight;
in vec3 colorSunlight;
in vec3 colorMoonlight;

in vec3 colorSkylight;
in vec3 colorSunSkylight;
in vec3 colorMoonSkylight;

in vec3 colorTorchlight;

in float timeNoon;
in float timeMidnight;


#include "/Lib/GbufferData.glsl"
#include "/Lib/Uniform/GbufferTransforms.glsl"

#include "/Lib/IndividualFounctions/Reflections/SSR.glsl"


void WaterFog(inout vec3 color, vec3 viewDir, float opaqueDist, float waterDist, vec3 normal, MaterialMask mask, float occludedWater, float waterSkylight, float totalInternalReflection){
	float distDiff = opaqueDist - waterDist;
	waterDist = isEyeInWater == 0 ? 
				mix(distDiff, min(distDiff * 0.3, 6.0), occludedWater) :
				mix(waterDist, opaqueDist, mask.stainedGlass);

	float eyeWaterDepth = saturate(float(eyeBrightnessSmooth.y) / 120.0 - 0.8);
	waterDist = max(waterDist, totalInternalReflection * eyeWaterDepth * 50.0);

	vec3 shadowVectorRefracted = refract(-shadowVector, gbufferModelView[1].xyz, 1.0 / WATER_REFRACT_IOR);

	vec3 waterFogColor = mix(vec3(0.05, 0.6, 1.0), vec3(0.3, 0.9, 1.5), mask.ice);
	waterFogColor = mix(waterFogColor, vec3(0.5), wetness * 0.6);

	waterFogColor *= dot(vec3(0.33333), colorSkylight);

	if (isEyeInWater == 0){
		waterFogColor *= 0.04 - wetness * 0.032;
		waterFogColor *= waterSkylight;

		vec3 l = normalize(reflect(viewDir, normal));
		vec3 h = normalize(l - viewDir);
		float F = saturate(dot(normal, l)) * saturate(dot(l, h) * 1.5 - 0.5);
		float scatter = 3.0 * F * pow(dot(shadowVectorRefracted, viewDir) * 5.0 + 5.2, -1.4);

		waterFogColor = mix(waterFogColor, colorShadowlight * waterFogColor * 3.0, scatter * saturate(1.0 - wetness - occludedWater));
	}else{
		waterFogColor *= 0.02 - wetness * 0.012;
		float scatter = 1.0 / (dot(shadowVectorRefracted, viewDir) * 5.0 + 5.1);
		vec3 waterSunlightScatter = colorShadowlight * scatter * waterFogColor * 2.0;

		waterFogColor *= dot(viewDir, gbufferModelView[1].xyz) * 0.4 + 0.6;
		waterFogColor += waterSunlightScatter * (eyeWaterDepth * (1.0 - wetness * 0.6));
	}

	float fogDensity = isEyeInWater == 0 ? 0.29 : mask.ice * 0.96 + 0.04;
	float visibility = exp2(-waterDist * fogDensity * WATERFOG_DENSITY);

	visibility = clamp(visibility, 0.35 * mask.ice, 1.0);
	visibility = mix(visibility, 0.7, mask.hand);

	vec3 attenuationColor = isEyeInWater == 0 ? vec3(0.2, 0.5, 0.7) : vec3(0.1, 0.6, 1.0);
	color *= pow(attenuationColor * 0.99, vec3(waterDist * (0.21 * float(isEyeInWater == 0) + 0.04) * WATERFOG_DENSITY));

	color = mix(waterFogColor, color, visibility);
}



////////////////////////////// Main //////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////// Main //////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////// Main //////////////////////////////////////////////////////////////////////////////////////////////////////////////////

void main(){
	GbufferData gbuffer 			= GetGbufferData();
	MaterialMask materialMask 		= CalculateMasks(gbuffer.materialIDW);
	MaterialMask materialMaskSoild 	= CalculateMasks(gbuffer.materialIDL);

	FixParticleMask(materialMaskSoild, materialMask, gbuffer.depthL, gbuffer.depthW);

	vec3 viewPos 					= ViewPos_From_ScreenPos(texCoord, gbuffer.depthL);
	vec3 viewPosTranslucent 		= ViewPos_From_ScreenPos(texCoord, gbuffer.depthW);

	#ifdef DISTANT_HORIZONS
		if (gbuffer.depthL == 1.0){
			gbuffer.depthL 			= texelFetch(dhDepthTex1, texelCoord, 0).x;
			viewPos 				= ViewPos_From_ScreenPos_DH(texCoord, gbuffer.depthL);
		}
		
		if (gbuffer.depthW == 1.0){
			gbuffer.depthW 			= texelFetch(dhDepthTex0, texelCoord, 0).x;
			viewPosTranslucent 		= ViewPos_From_ScreenPos_DH(texCoord, gbuffer.depthW);
		}
	#endif

	vec3 worldPos					= mat3(gbufferModelViewInverse) * viewPos;

	vec3 viewDir 					= normalize(viewPos);
	vec3 worldDir 					= normalize(worldPos);

	#ifdef DISTANT_HORIZONS
		float farDist 				= max(dhFarPlane, 1024.0);
	#else
		float farDist 				= max(far * 1.2, 1024.0);
	#endif
	float opaqueDist 				= gbuffer.depthL < 1.0 ? length(viewPos) : farDist;
	float waterDist 				= gbuffer.depthW < 1.0 ? length(viewPosTranslucent) : farDist;

	float cloudShadow 				= 1.0;


	vec3 finalComposite = CurveToLinear(texelFetch(colortex1, texelCoord, 0).rgb) * MAIN_OUTPUT_FACTOR;

	if (isEyeInWater == 1 && materialMask.water > 0.5){
		worldDir = refract(worldDir, mat3(gbufferModelViewInverse) * gbuffer.normalW, WATER_REFRACT_IOR);
		if (gbuffer.depthL == 1.0){
			float tileSize = min(SKY_IMAGE_RESOLUTION, floor(min(screenSize.x / 3.3, screenSize.y * 0.45)));
			vec2 skyImageCoord = ProjectSky(worldDir, tileSize);
			finalComposite = CurveToLinear(textureLod(colortex2, skyImageCoord, 0.0).rgb) * MAIN_OUTPUT_FACTOR;
		}
	}

	float totalInternalReflection = 0.0;
	if (length(worldDir) < 0.5){
		finalComposite = vec3(0.0);
		totalInternalReflection = 1.0;
	}

	#ifdef UNDERWATER_FOG
		if(gbuffer.waterMask > 0.5 || isEyeInWater == 1 || materialMask.ice > 0.5){
			float occludedWater = gbuffer.waterMask * materialMask.stainedGlass;
			WaterFog(finalComposite, viewDir, opaqueDist, waterDist, gbuffer.normalW, materialMask, occludedWater, gbuffer.lightmapW.g, totalInternalReflection);
		}
	#endif

	finalComposite /= MAIN_OUTPUT_FACTOR;
	finalComposite = LinearToCurve(finalComposite);

	compositeOutput1 = vec4(finalComposite.rgb, totalInternalReflection);
}
