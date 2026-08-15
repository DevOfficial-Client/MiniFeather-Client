#version 330


#define DIMENSION_MAIN


#include "/Lib/UniformDeclare.glsl"
#include "/Lib/Utilities.glsl"


/*
const int 	colortex0Format         = RGBA8;
const vec4 	colortex0ClearColor 	= vec4(0.0, 0.0, 0.0, 1.0);
const int 	colortex1Format         = RGBA16;
const int 	colortex2Format         = RGBA16;
const int 	colortex3Format 		= RGBA16;
const int 	colortex4Format 		= RGBA16;
const int 	colortex5Format 		= RGBA16;
const int 	colortex6Format 		= RGBA16;
const int 	colortex7Format 		= RGBA16;
const int 	colortex8Format 		= RGBA8;

const bool	colortex0Clear          = true;
const bool	colortex1Clear          = false;
const bool	colortex2Clear          = false;
const bool	colortex3Clear          = true;
const bool	colortex4Clear          = true;
const bool	colortex5Clear          = true;
const bool	colortex6Clear          = true;
const bool	colortex7Clear          = false;

const float shadowIntervalSize 			= 4.0;
const float shadowDistanceRenderMul 	= 1.0;

const bool 	shadowHardwareFiltering1 	= true;
const bool 	shadowtex0Mipmap 			= true;
const bool 	shadowtex0Nearest 			= false;
const bool 	shadowtex1Mipmap 			= false;
const bool 	shadowtex1Nearest 			= false;
const bool 	shadowcolor0Mipmap 			= false;
const bool 	shadowcolor0Nearest 		= false;
const bool 	shadowcolor1Mipmap 			= false;
const bool 	shadowcolor1Nearest 		= false;


const int 	noiseTextureResolution 	= 64;

const float wetnessHalflife 		= 200.0; 	//[10.0 20.0 30.0 50.0 75.0 100.0 150.0 200.0 300.0 500.0]
const float drynessHalflife 		= 50.0; 	//[10.0 20.0 30.0 50.0 75.0 100.0 150.0 200.0 300.0 500.0]
const float eyeBrightnessHalflife 	= 10.0;

const float sunPathRotation 		= -30.0; 	// [-90.0 -89.0 -88.0 -87.0 -86.0 -85.0 -84.0 -83.0 -82.0 -81.0 -80.0 -79.0 -78.0 -77.0 -76.0 -75.0 -74.0 -73.0 -72.0 -71.0 -70.0 -69.0 -68.0 -67.0 -66.0 -65.0 -64.0 -63.0 -62.0 -61.0 -60.0 -59.0 -58.0 -57.0 -56.0 -55.0 -54.0 -53.0 -52.0 -51.0 -50.0 -49.0 -48.0 -47.0 -46.0 -45.0 -44.0 -43.0 -42.0 -41.0 -40.0 -39.0 -38.0 -37.0 -36.0 -35.0 -34.0 -33.0 -32.0 -31.0 -30.0 -29.0 -28.0 -27.0 -26.0 -25.0 -24.0 -23.0 -22.0 -21.0 -20.0 -19.0 -18.0 -17.0 -16.0 -15.0 -14.0 -13.0 -12.0 -11.0 -10.0 -9.0 -8.0 -7.0 -6.0 -5.0 -4.0 -3.0 -2.0 -1.0 0.0 1.0 2.0 3.0 4.0 5.0 6.0 7.0 8.0 9.0 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0 21.0 22.0 23.0 24.0 25.0 26.0 27.0 28.0 29.0 30.0 31.0 32.0 33.0 34.0 35.0 36.0 37.0 38.0 39.0 40.0 41.0 42.0 43.0 44.0 45.0 46.0 47.0 48.0 49.0 50.0 51.0 52.0 53.0 54.0 55.0 56.0 57.0 58.0 59.0 60.0 61.0 62.0 63.0 64.0 65.0 66.0 67.0 68.0 69.0 70.0 71.0 72.0 73.0 74.0 75.0 76.0 77.0 78.0 79.0 80.0 81.0 82.0 83.0 84.0 85.0 86.0 87.0 88.0 89.0 90.0]

const float ambientOcclusionLevel 	= 1.0;
const int 	superSamplingLevel 		= 0;
*/


const int 	shadowMapResolution 		= 2048; 	// [1024 2048 4096 8192 16384 32768]
const float shadowDistance 				= 192.0; 	// [64.0 96.0 128.0 192.0 256.0 384.0 512.0 768.0 1024.0 1536.0 2048.0]


uniform sampler2D shadowtex0;
uniform sampler2DShadow shadowtex1;
uniform sampler2D shadowcolor0;
uniform sampler2D shadowcolor1;


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
#include "/Lib/Uniform/ShadowTransforms.glsl"

#include "/Lib/BasicFounctions/TemporalNoise.glsl"
#include "/Lib/BasicFounctions/PrecomputedAtmosphere.glsl"
#include "/Lib/BasicFounctions/Blocklight.glsl"
#include "/Lib/BasicFounctions/Sunlight_Shadow.glsl"

#include "/Lib/IndividualFounctions/GTAO.glsl"
#include "/Lib/IndividualFounctions/CloudShadow.glsl"

vec3 SkyLighting(vec3 worldNormal, float lightmap, float cloudShadow){
	float lightmapFalloff = saturate(lightmap * 2.5 - 0.2);
	lightmapFalloff = curve(lightmapFalloff) * 0.6 + 0.4;

	float SdotN = dot(worldNormal, normalize(worldSunVector + vec3(0.0, 1.0, 0.0))) * lightmapFalloff;
	float MdotN = dot(worldNormal, normalize(worldMoonVector + vec3(0.0, 1.0, 0.0))) * lightmapFalloff;


	vec3 skylight = colorSunSkylight * (SdotN * 0.35 + 0.65);
	skylight += colorMoonSkylight * (MdotN * 0.35 + 0.65);

	vec3 skySunLight = (worldNormal.y * 0.4 * lightmapFalloff + 0.6) * colorShadowlight * 0.025;

	#ifdef GI_RSM
		skylight += skySunLight;
	#else
		skylight += skySunLight * 1.5;
	#endif

	#ifdef VOLUMETRIC_CLOUDS
		float coverage = mix(CLOUD_CLEAR_COVERY, CLOUD_RAIN_COVERY, wetness);
		skylight += skySunLight * ((1.0 - wetness) * saturate(coverage * 4.0 - 0.6));
		#ifdef CLOUD_SHADOW
			float LdotN = dot(worldNormal, worldShadowVector) * lightmapFalloff * 0.4 + 0.6;
			skylight += colorShadowlight * (LdotN * (0.05 - 0.05 * cloudShadow) * (1.0 - wetness));
		#endif
	#endif

	skylight = mix(skylight, colorShadowlight * (SdotN * 0.012 + 0.015), wetness * 0.8);

	return skylight * max(float(isEyeInWater == 1) * 0.003, lightmap * 0.2 * SKYLIGHT_INTENSITY);
}


////////////////////////////// Main //////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////// Main //////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////// Main //////////////////////////////////////////////////////////////////////////////////////////////////////////////////

void main(){
	GbufferData gbuffer 			= GetGbufferData();
	MaterialMask materialMask 		= CalculateMasks(gbuffer.materialIDW);
	MaterialMask materialMaskSoild 	= CalculateMasks(gbuffer.materialIDL);

	compositeOutput1 = texelFetch(colortex1, texelCoord, 0);

//////////////////// Soild /////////////////////////////////////////////////////////////////////////
//////////////////// Soild /////////////////////////////////////////////////////////////////////////

	if (materialMaskSoild.sky < 0.5){
		FixParticleMask(materialMaskSoild, materialMask, gbuffer.depthL, gbuffer.depthW);

		vec3 viewPos 					= ViewPos_From_ScreenPos(texCoord, gbuffer.depthL);

		#ifdef DISTANT_HORIZONS
			bool isDH = gbuffer.depthL == 1.0;
			if (isDH){
				gbuffer.depthL 			= texelFetch(dhDepthTex1, texelCoord, 0).x;
				viewPos 				= ViewPos_From_ScreenPos_DH(texCoord, gbuffer.depthL);
			}
		#endif

		vec3 worldPos					= mat3(gbufferModelViewInverse) * viewPos;

		vec3 viewDir 					= normalize(viewPos);
		vec3 worldDir 					= normalize(worldPos);
		vec3 worldNormal 				= mat3(gbufferModelViewInverse) * gbuffer.normalL;

		#ifdef DISTANT_HORIZONS
			float farDist 				= max(dhFarPlane, 1024.0);
		#else
			float farDist 				= max(far * 1.2, 1024.0);
		#endif
		float opaqueDist 				= gbuffer.depthL < 1.0 ? length(viewPos) : farDist;


		#ifdef VOLUMETRIC_CLOUDS
			#ifdef CLOUD_SHADOW
				float cloudShadow = CloudShadowFromTex(worldPos);
			#else
				float cloudShadow = 1.0 - wetness * RAIN_SHADOW;
			#endif
		#else
			float cloudShadow = 1.0;
		#endif

		vec3 sunlightMult = colorShadowlight * (SUNLIGHT_INTENSITY * mix(cloudShadow, 1.0, 0.03 - wetness * 0.015));

		#ifdef CAVE_MODE
			sunlightMult *= mix(1.0, 0.1, eyeBrightnessZeroSmooth);
		#endif

		vec3 waterTint = vec3(1.0);

		#ifdef UNDERWATER_FOG
			if (isEyeInWater == 1) waterTint = vec3(0.55, 0.75, 1.0) / max(3.0, opaqueDist * 0.1 * WATERFOG_DENSITY);
			sunlightMult *= waterTint;
		#endif

		#ifndef CAUSTICS
			if (materialMask.water > 0.5 || isEyeInWater == 1) sunlightMult *= 0.75;
		#endif


		gbuffer.material.scattering *= saturate(1.0 - materialMaskSoild.leaves - materialMaskSoild.grass);

		#ifdef DISTANT_HORIZONS
			#ifdef DH_SHADOW
				materialMaskSoild.leaves *= saturate(3.2 - opaqueDist / min(shadowDistance, far) * 4.0) * 0.65 + 0.35;
			#else
				materialMaskSoild.leaves *= saturate(3.2 - opaqueDist / min(shadowDistance, far) * 4.0 - float(isDH) * 1e10) * 0.65 + 0.35;
			#endif
		#else
			materialMaskSoild.leaves *= saturate(3.2 - opaqueDist / min(shadowDistance, far) * 4.0) * 0.6 + 0.4;
		#endif

		worldNormal = normalize(mix(worldNormal, vec3(0.0, 1.0, 0.0), materialMaskSoild.grass * 0.49));


		#ifdef CAVE_MODE
			vec3 finalComposite = vec3(0.83, 0.87, 1.0) * ((worldNormal.y * 0.25 + 0.75) * max(NOLIGHT_BRIGHTNESS, 0.00003));
		#else
			vec3 finalComposite = vec3(0.86, 0.94, 1.19) * ((worldNormal.y * 0.3 + 0.8) * NOLIGHT_BRIGHTNESS);
		#endif
		finalComposite += SkyLighting(worldNormal, gbuffer.lightmapL.g, cloudShadow) * waterTint;

		vec4 gi = compositeOutput1;
		gi = mix(gi, vec4(0.0, 0.0, 0.0, 1.0), materialMask.particle);

		vec3 rsm = CurveToLinear(gi.rgb);
		rsm *= sunlightMult * (8.0 * GI_BRIGHTNESS);
		#ifdef SUNLIGHT_LEAK_FIX
			#ifdef GI_SKYLIGHT_FALLOFF
				rsm *= saturate(gbuffer.lightmapL.g * 4.0 + float(isEyeInWater == 1));
			#else
				rsm *= saturate(gbuffer.lightmapL.g * 1e3 + float(isEyeInWater == 1));
			#endif
		#endif

		#if defined DISABLE_HAND_GI && defined DISABLE_PLAYER_GI
			if (materialMaskSoild.hand < 0.5 && materialMaskSoild.entityPlayer < 0.5)
		#elif defined DISABLE_HAND_GI
			if (materialMaskSoild.hand < 0.5)
		#elif defined DISABLE_PLAYER_GI
			if (materialMaskSoild.entityPlayer < 0.5)
		#endif
			finalComposite += rsm;

		#ifdef GTAO
			#ifdef GTAO_MULTIBOUNCE
				vec3 ao = GTAOMultiBounce(gi.a, gbuffer.albedo);
			#else
				vec3 ao = vec3(gi.a);
			#endif
		#else
			vec3 ao = vec3(1.0);
		#endif
		finalComposite *= ao;
		
		if(heldBlockLightValue + heldBlockLightValue2 > 0.0)
			finalComposite += HeldLighting(viewPos, viewDir, gbuffer.normalL, gbuffer.material.roughness, ao, materialMask.hand > 0.5);

		finalComposite += BlockLighting(gbuffer.lightmapL.r, ao, materialMaskSoild);
		finalComposite += TextureLighting(gbuffer.albedo, gbuffer.lightmapL.r, gbuffer.material.emissiveness, materialMaskSoild);


		float sunlight = Fd_Burley(worldNormal, -worldDir, worldShadowVector, gbuffer.material.roughness);

		float sunlightTrans = saturate(materialMaskSoild.leaves * 3.0) * 0.25 + materialMask.particle * 0.4 + materialMaskSoild.grass * 0.15;
		sunlight = mix(sunlight, 0.6, sunlightTrans);
		gbuffer.parallaxShadow = saturate(gbuffer.parallaxShadow + sunlightTrans * 1e10);


		vec3 shadow = vec3(1.0);

		#ifdef SUNLIGHT_LEAK_FIX
			float occludedWater = gbuffer.waterMask * materialMask.stainedGlass;
			float lightMask = saturate(gbuffer.lightmapL.g * mix(1e4, 1.0, occludedWater) + float(isEyeInWater == 1));
			shadow *= lightMask;
		#endif
		
		vec3 specularHighlight = vec3(0.0);
		vec3 sss = vec3(0.0);
	
		if ((sunlight + gbuffer.material.scattering) * shadow.x > 0.0){
			shadow *= VariablePenumbraShadow(worldPos, worldNormal, sunlight, gbuffer.albedo, gbuffer.material.scattering, materialMaskSoild, sss);
			#ifdef SUNLIGHT_LEAK_FIX
 				sss *= lightMask;
			#endif
			finalComposite += sss * sunlightMult;
		}

		#if PARALLAX_MODE > 0
			shadow *= gbuffer.parallaxShadow;
		#endif

		float metalnessMask = gbuffer.material.metalness;
		float skylightmap = min(smoothstep(0.3, 0.8, gbuffer.lightmapL.g), float(isEyeInWater == 0));
		metalnessMask *= 0.1 * skylightmap + 0.9;
		metalnessMask = 1.0 - metalnessMask * 0.985;

		if (any(greaterThan(sunlight * shadow, vec3(0.0)))){
			#ifdef SCREEN_SPACE_SHADOWS
				#ifdef DISABLE_PLAYER_SCREEN_SPACE_SHADOWS
					#if PARALLAX_MODE > 0
						if (materialMaskSoild.leaves + materialMaskSoild.hand + materialMaskSoild.entitiesSnow + materialMaskSoild.entityPlayer < 1.0)
					#else
						if (materialMaskSoild.leaves + materialMaskSoild.hand + materialMaskSoild.entitiesSnow + materialMaskSoild.entityPlayer < 1.0 && gbuffer.parallaxShadow > 0.0)
					#endif
				#else
					#if PARALLAX_MODE > 0
						if (materialMaskSoild.leaves + materialMaskSoild.hand + materialMaskSoild.entitiesSnow < 1.0)
					#else
						if (materialMaskSoild.leaves + materialMaskSoild.hand + materialMaskSoild.entitiesSnow < 1.0 && gbuffer.parallaxShadow > 0.0)
					#endif
				#endif
					shadow *= mix(ScreenSpaceShadow(viewPos, viewDir, gbuffer.normalL, materialMaskSoild), 1.0, saturate(materialMaskSoild.leaves * 1.67 - 0.67));
			#endif

			#ifdef CAUSTICS
				if (materialMask.water > 0.5 || isEyeInWater == 1)
					shadow *= CalculateWaterCaustics(worldPos);
			#endif

			shadow *= sunlightMult;
	
			finalComposite += shadow * (sunlight * metalnessMask);

			if (materialMask.water + materialMask.ice < 0.5){
				float highlightGGX = SpecularGGX(gbuffer.normalL, -viewDir, shadowVector, clamp(gbuffer.material.roughness, 0.0015, 0.9), gbuffer.material.f0);
				highlightGGX *= saturate(4.0 - gbuffer.material.roughness * 3.5);
				highlightGGX *= 0.07 - materialMaskSoild.grass * 0.035;
				specularHighlight = mix(vec3(1.0), gbuffer.albedo, vec3(gbuffer.material.metalness)) * shadow * highlightGGX;
			}
		}

		finalComposite *= gbuffer.albedo;

		finalComposite *= metalnessMask;

		finalComposite += specularHighlight;

		finalComposite += vec3(1.0) * materialMaskSoild.lightning;


		finalComposite /= MAIN_OUTPUT_FACTOR;
		finalComposite = LinearToCurve(finalComposite);
		compositeOutput1 = vec4(finalComposite, 0.0);
	}
}
