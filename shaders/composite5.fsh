#version 330


#define DIMENSION_MAIN


#include "/Lib/UniformDeclare.glsl"
#include "/Lib/Utilities.glsl"


const float shadowDistance = 192.0; // [64.0 96.0 128.0 192.0 256.0 384.0 512.0 768.0 1024.0 1536.0 2048.0]

uniform sampler2D shadowtex0;
#ifdef MC_GL_VENDOR_NVIDIA
	uniform sampler2D shadowtex1;
#endif
uniform sampler2D shadowcolor0;
uniform sampler2D shadowcolor1;


/* DRAWBUFFERS:13 */
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

#if defined LENS_GLARE || defined LENS_FLARE || (defined VFOG && defined VFOG_BLOOM && !defined DOF)
	layout(location = 1) out vec4 compositeOutput3;
	in vec2 sunCoord;
	in float sunVisibility;
#endif


#include "/Lib/GbufferData.glsl"
#include "/Lib/Uniform/GbufferTransforms.glsl"
#include "/Lib/Uniform/ShadowTransforms.glsl"

#include "/Lib/BasicFounctions/TemporalNoise.glsl"
#include "/Lib/BasicFounctions/PrecomputedAtmosphere.glsl"
#include "/Lib/BasicFounctions/Blocklight.glsl"
#include "/Lib/BasicFounctions/VanillaComposite.glsl"

#include "/Lib/IndividualFounctions/WaterWaves.glsl"
#include "/Lib/IndividualFounctions/Reflections/SSR.glsl"
#include "/Lib/IndividualFounctions/CloudShadow.glsl"
#include "/Lib/IndividualFounctions/VolumetricFog.glsl"
#include "/Lib/IndividualFounctions/UnderwaterVolumetricFog.glsl"
#include "/Lib/IndividualFounctions/DOF.glsl"
#include "/Lib/IndividualFounctions/LensGlareFlare.glsl"


void WaterRefractionLite(inout vec3 color, MaterialMask mask, vec3 normal, vec3 worldPos, vec3 viewPos, float waterDist, float opaqueDist, float fogTimeFactor, float cloudShadow){
	vec2 refractCoord = texCoord;

	float waterDeep = opaqueDist - waterDist;

	if (mask.water > 0.5){
		float NdotU = dot(normal, gbufferModelView[1].xyz) + float(isEyeInWater == 1) * 2.0;
		vec3 wavesNormal = GetWavesNormal(worldPos + cameraPosition, step(0.05, NdotU) * 18.0).xzy;
		vec4 wnv = gbufferModelView * vec4(wavesNormal.xyz, 0.0);
		vec3 wavesNormalView = normalize(wnv.xyz);

		vec4 nv = gbufferModelView * vec4(0.0, 1.0, 0.0, 0.0);
		nv.xyz = normalize(nv.xyz);

		refractCoord = nv.xy - wavesNormalView.xy;
		refractCoord *= saturate(waterDeep) * 0.5 / (waterDist + 0.0001);
		refractCoord += texCoord;
	}else{
		vec3 refractDir = refract(normalize(viewPos), normal, 0.66);
		refractDir = refractDir / saturate(dot(refractDir, -normal));
		refractDir *= saturate(waterDeep * 2.0) * 0.125;

		vec4 refractPos = vec4(viewPos + refractDir, 0.0);
		refractPos = gbufferProjection * refractPos;

		refractCoord = refractPos.xy / refractPos.w * 0.5 + 0.5;
	}

	float currentDepth = texelFetch(depthtex0, texelCoord, 0).x;
	float refractDepth = textureLod(depthtex1, refractCoord, 0.0).x;
	if(refractDepth < currentDepth) refractCoord = texCoord;

	refractCoord = mix(texCoord, refractCoord, float(saturate(refractCoord) == refractCoord));

	color = CurveToLinear(textureLod(colortex1, refractCoord, 0.0).rgb);

	#if (defined LANDSCATTERING && defined LANDSCATTERING_REFRACTION) || (defined VFOG && defined VFOG_REFRACTION)
		if (mask.stainedGlass > 0.5){
			float rDepth = textureLod(depthtex1, refractCoord, 0.0).x;
			vec3 rViewPos = ViewPos_From_ScreenPos(refractCoord, rDepth);
			#ifdef DISTANT_HORIZONS
				if (rDepth == 1.0){
					rDepth = textureLod(dhDepthTex1, refractCoord, 0.0).x;
					rViewPos = ViewPos_From_ScreenPos_DH(refractCoord, rDepth);
				}
				float farDist = max(float(dhRenderDistance), far) * 1.4;
				#ifdef DH_LIMIT_VFOG_DIST
					farDist = min(2048.0, farDist);
				#endif			
			#else
				float farDist = far * 1.4;
			#endif

			float rDist = min(length(rViewPos) + float(rDepth == 1.0) * 1e10, farDist);
			rDist = max(rDist - waterDist, 0.0);

			vec3 rWorldPos = mat3(gbufferModelViewInverse) * rViewPos;
			vec3 rWorldDir = normalize(rWorldPos);

			vec3 endPos = rWorldDir * rDist;

			color *= MAIN_OUTPUT_FACTOR;

			#ifdef LANDSCATTERING
				#ifdef LANDSCATTERING_REFRACTION
					LandAtmosphericScattering(color, rDist, worldPos, endPos, rWorldDir, rDepth == 1.0);
				#endif
			#endif

			#ifdef VFOG
				#ifdef VFOG_REFRACTION
					float fogTransmittance = 1.0;
					if (fogTimeFactor > 0.01 && isEyeInWater == 0) VolumetricFog(color, worldPos, endPos, rWorldDir, cloudShadow, fogTimeFactor, fogTransmittance);
				#endif
			#endif

			color /= MAIN_OUTPUT_FACTOR;
		}
	#endif
}


void TransparentAbsorption(inout vec3 color, vec4 stainedGlassAlbedo, float waterAbsorption){
	vec3 stainedGlassColor = normalize(stainedGlassAlbedo.rgb + 0.0001) * fsqrt(length(stainedGlassAlbedo.rgb));
	stainedGlassAlbedo.a = pow(stainedGlassAlbedo.a, 0.2);

	#ifdef UNDERWATER_FOG
		if (isEyeInWater == 1) stainedGlassAlbedo.a = mix(0.0, stainedGlassAlbedo.a, waterAbsorption);
	#endif

	color *= GammaToLinear(mix(vec3(1.0), stainedGlassColor, stainedGlassAlbedo.a));
}


void Rain(inout vec3 color, float rainMask){
	vec3 rainSunlight = colorShadowlight * (5.0 - RAIN_SHADOW * 4.0);
	vec3 rainColor = colorSkylight + rainSunlight * 0.1;

	#ifndef DISABLE_LOCAL_PRECIPITATION
		color = mix(color, rainColor * (eyeSnowySmooth * 0.07 + 0.01), rainMask * (0.2 * eyeSnowySmooth + 0.15) * wetness * RAIN_VISIBILITY);
	#else
		color = mix(color, rainColor * 0.01, saturate(rainMask * wetness * (RAIN_VISIBILITY * 0.15)));
	#endif
}


void PurkinjeEffect(inout vec3 color){
	float luminance = Luminance(color);
	color = mix(color, luminance * vec3(0.7777, 1.0004, 1.6190), saturate((PURKINJE_EFFECT_THRESHOLD - luminance) * PURKINJE_EFFECT_STRENGTH / PURKINJE_EFFECT_THRESHOLD));
}


/////////////////////////MAIN//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////MAIN//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
void main(){
	GbufferData gbuffer 			= GetGbufferData();
	MaterialMask materialMaskSoild 	= CalculateMasks(gbuffer.materialIDL);
	MaterialMask materialMask 		= CalculateMasks(gbuffer.materialIDW);

	FixParticleMask(materialMaskSoild, materialMask);
	bool isSmooth = false;
	ApplyMaterial(gbuffer.material, materialMask, isSmooth);


	vec3 viewPos 					= ViewPos_From_ScreenPos(texCoord, gbuffer.depthW);
	vec3 viewPosSoild 				= ViewPos_From_ScreenPos(texCoord, gbuffer.depthL);

	#ifdef DISTANT_HORIZONS
		if (gbuffer.depthW == 1.0){
			gbuffer.depthW 			= texelFetch(dhDepthTex0, texelCoord, 0).x;
			viewPos 				= ViewPos_From_ScreenPos_DH(texCoord, gbuffer.depthW);
		}
		
		if (gbuffer.depthL == 1.0){
			gbuffer.depthL 			= texelFetch(dhDepthTex1, texelCoord, 0).x;
			viewPosSoild 			= ViewPos_From_ScreenPos_DH(texCoord, gbuffer.depthL);
		}
	#endif

	vec3 worldPos					= mat3(gbufferModelViewInverse) * viewPos;
	vec3 viewDir 					= normalize(viewPos.xyz);
	vec3 worldDir 					= normalize(worldPos.xyz);

	#ifdef DISTANT_HORIZONS
		float farDist 				= clamp(dhFarPlane, 1024.0, 2048.0);
	#else
		float farDist 				= max(far * 1.4, 1024.0);
	#endif
	float opaqueDist 				= min(length(viewPosSoild) + float(gbuffer.depthL == 1.0) * 1e10, farDist);
	float waterDist 				= min(length(viewPos) + float(gbuffer.depthW == 1.0) * 1e10, farDist);

	float fogTimeFactor = 1.0;
	#ifndef VFOG_IGNORE_WORLDTIME
		#ifndef DISABLE_LOCAL_PRECIPITATION
			fogTimeFactor *= mix(1.0 - timeNoon, 1.0, wetness * (1.0 - eyeNoPrecipitationSmooth * 0.7));
		#else
			fogTimeFactor *= mix(1.0 - timeNoon, 1.0, wetness);
		#endif
	#endif

	float globalCloudShadow	= GetSmoothCloudShadow();


	vec3 color = CurveToLinear(texelFetch(colortex1, texelCoord, 0).rgb);


	if (materialMask.water + materialMask.ice + materialMask.stainedGlass > 0.5)
		WaterRefractionLite(color, materialMask, gbuffer.normalW, worldPos, viewPos, waterDist, opaqueDist, fogTimeFactor, globalCloudShadow);

	float waterAbsorption = 1.0;
	if (isEyeInWater == 1) waterAbsorption = saturate(exp2(-waterDist * 0.06 * WATERFOG_DENSITY));

	if (materialMask.stainedGlass > 0.5)
		TransparentAbsorption(color, gbuffer.albedoW, waterAbsorption);

	if (gbuffer.material.reflectionStrength > 0.0)
		CalculateSpecularReflections(color, viewDir, gbuffer.normalW, gbuffer.albedo, waterAbsorption, gbuffer.material);


	color *= MAIN_OUTPUT_FACTOR;

	#ifdef SPECULAR_HELDLIGHT
		if (heldBlockLightValue + heldBlockLightValue2 > 0.0 && materialMask.sky < 0.5)
			TorchSpecularHighlight(color, viewPos, viewDir, waterDist, gbuffer.albedo, gbuffer.normalW, gbuffer.material);	
	#endif

	#ifdef DISTANT_HORIZONS
		#ifdef DH_LIMIT_VFOG_DIST
			vec3 rayWorldPos = worldDir * min(waterDist, max(float(dhRenderDistance), far) * 1.4);
		#else
			vec3 rayWorldPos = worldDir * min(length(worldPos) + float(gbuffer.depthW == 1.0) * 1e10, max(float(dhRenderDistance), far) * 1.4);
		#endif
	#else
		vec3 rayWorldPos = worldDir * min(waterDist, far * 1.4);
	#endif

	#ifdef LANDSCATTERING
		LandAtmosphericScattering(color, waterDist, vec3(0.0), rayWorldPos, worldDir, materialMask.sky > 0.5);
	#endif

	#ifdef VFOG
		#ifdef UNDERWATER_VFOG
			if (isEyeInWater == 1) color += UnderwaterVolumetricFog(vec3(0.0), worldPos, worldDir, globalCloudShadow);
		#endif

		float fogTransmittance = 1.0;
		if (fogTimeFactor > 0.01 && isEyeInWater == 0) VolumetricFog(color, vec3(0.0), rayWorldPos, worldDir, globalCloudShadow, fogTimeFactor, fogTransmittance);
	#endif


	if(isEyeInWater == 0.0 && wetness > 0.0) Rain(color, gbuffer.rainAlpha);

	VanillaFog(color, waterDist);

	SelectionBox(color, gbuffer.albedo, materialMaskSoild.selection > 0.5 && isEyeInWater < 3);

	#ifdef PURKINJE_EFFECT
		PurkinjeEffect(color);
	#endif

	color /= MAIN_OUTPUT_FACTOR;
	color = LinearToCurve(color);

	#ifdef DOF
		compositeOutput1 = vec4(color.rgb, CoCSpread());
	#else
		compositeOutput1 = vec4(color.rgb, 0.0);
	#endif

	#if defined LENS_GLARE || defined LENS_FLARE || (defined VFOG && defined VFOG_BLOOM && !defined DOF)
		compositeOutput3 = vec4(0.0);

		#if defined LENS_GLARE || defined LENS_FLARE
			if (sunVisibility > 0.0 && isEyeInWater == 0) compositeOutput3.rgb = LensFlare();
		#endif

		#if defined VFOG && defined VFOG_BLOOM && !defined DOF
			compositeOutput3.a = 1.0 - fogTransmittance;
		#endif
	#endif
}
