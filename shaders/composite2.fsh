#version 330


#define DIMENSION_MAIN
#define VFOG_LQ


#include "/Lib/UniformDeclare.glsl"
#include "/Lib/Utilities.glsl"


const float shadowDistance = 192.0; // [64.0 96.0 128.0 192.0 256.0 384.0 512.0 768.0 1024.0 1536.0 2048.0]

uniform sampler2D shadowtex0;
#ifdef MC_GL_VENDOR_NVIDIA
	uniform sampler2D shadowtex1;
#endif
uniform sampler2D shadowcolor0;
uniform sampler2D shadowcolor1;


/* DRAWBUFFERS:3 */
layout(location = 0) out vec4 compositeOutput3;


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

in float shadowHighlightStrength;


#include "/Lib/GbufferData.glsl"
#include "/Lib/Uniform/GbufferTransforms.glsl"
#include "/Lib/Uniform/ShadowTransforms.glsl"

#include "/Lib/BasicFounctions/TemporalNoise.glsl"
#include "/Lib/BasicFounctions/PrecomputedAtmosphere.glsl"

#include "/Lib/IndividualFounctions/Reflections/SSR.glsl"
#include "/Lib/IndividualFounctions/CloudShadow.glsl"
#include "/Lib/IndividualFounctions/VolumetricFog.glsl"
#include "/Lib/IndividualFounctions/UnderwaterVolumetricFog.glsl"


vec3 ComputeFakeSkyReflection(vec3 reflectWorldDir){
	float tileSize = min(SKY_IMAGE_RESOLUTION, floor(min(screenSize.x / 3.3, screenSize.y * 0.45)));
	vec2 skyImageCoord = ProjectSky(reflectWorldDir, tileSize);
	vec4 skyImage = textureLod(colortex2, skyImageCoord, 0.0);
	skyImage.rgb = CurveToLinear(skyImage.rgb);

	#ifdef MOON_TEXTURE
		if (isEyeInWater == 0){
			float moonDisc = RenderMoonDiscReflection(reflectWorldDir, worldMoonVector);
			moonDisc *= mix(1.0, skyImage.a, RAIN_SHADOW);
			moonDisc *= (15.0 * SKY_TEXTURE_BRIGHTNESS / MAIN_OUTPUT_FACTOR);
			skyImage.rgb += colorMoonlight * moonDisc;
		} 
	#endif

	return skyImage.rgb;
}


vec4 CalculateSpecularReflections(vec3 viewPos, vec3 worldPos, vec3 viewDir, vec3 normal, float gbufferdepth, vec3 albedo, Material material, float skylight, bool isHand, bool isSmooth, float highlightStrength){
	bool totalInternalReflection = texelFetch(colortex1, texelCoord, 0).a > 0.5;
	skylight = smoothstep(0.3, 0.8, skylight);

	float NdotV = saturate(dot(-viewDir, normal));
	#ifdef TAA
		vec2 noise = BlueNoiseTemproal();
	#else
		vec2 noise = BlueNoise();
	#endif

	#ifdef DISTANT_HORIZONS
		vec3 screenPos = ScreenPos_From_ViewPos(viewPos);
	#else
		vec3 screenPos = vec3(texCoord, gbufferdepth);
	#endif


	vec3 reflection;
	float hitDist = 1.0;
	vec3 rayDir;

	bool hit;

	if(isSmooth){
		rayDir = reflect(viewDir, normal);
		float minLength = (3e-4 - viewPos.z * 7e-6 * saturate(NdotV * 500.0 - 1.0)) * gbufferProjection[1][1];

		hit = ScreenSpaceTracer(viewPos, rayDir, NdotV, noise.x, minLength, isHand, screenPos);

		hitDist = 0.0;
	}else{
		vec3 normalUp = normalize(vec3(0.0, normal.z, -normal.y));
		mat3 toTangent = mat3(cross(normalUp, normal), normalUp, normal);
		vec3 tangentView = viewDir * toTangent;

		vec3 visibleNormal = toTangent * sampleGGXVNDF(-tangentView, material.roughness, noise);
		rayDir = reflect(viewDir, visibleNormal);

		hit = ScreenSpaceTracer(viewPos, rayDir, NdotV, noise.x, 0.015, isHand, screenPos);
	}

	vec3 rayWorldDir = mat3(gbufferModelViewInverse) * rayDir;


	bool isSky = true;

	float highlightGGX = 0.0;

	if(hit){
		isSky = floor(textureLod(colortex5, screenPos.xy, 0.0).b * 255.0) < 0.5;
		reflection = CurveToLinear(textureLod(colortex1, screenPos.xy, 0.0).rgb);
	}
	
	if(isSky && isSmooth && highlightStrength > 0.0) highlightGGX = SpecularGGX(normal, -viewDir, shadowVector, 0.002, 0.06) * highlightStrength;
	
	if(!hit){
		if(totalInternalReflection){
			reflection = CurveToLinear(texelFetch(colortex1, texelCoord, 0).rgb);
		}else if (isEyeInWater == 0 && skylight > 0.0){
			reflection = ComputeFakeSkyReflection(rayWorldDir);
			float skylightFalloff = skylight * (saturate((dot(normal, gbufferModelView[1].xyz) + 0.7) * 2.0) * 0.75 + 0.25);
			reflection *= skylightFalloff;
			highlightGGX *= skylightFalloff;
		}
	}

	#ifdef MOON_TEXTURE
		reflection += colorSunlight * highlightGGX;
	#else
		reflection += colorShadowlight * highlightGGX;
	#endif


	#if (defined LANDSCATTERING && (defined LANDSCATTERING_REFLECTION || defined DISTANT_HORIZONS)) || (defined VFOG && defined VFOG_REFLECTION)
		float dist = length(viewPos);
		float rDist = 1e10;

		if(hit){
			if(!isSky){
				vec3 hitPos = ViewPos_From_ScreenPos(screenPos.xy, screenPos.z);
				rDist = distance(hitPos, viewPos);
			}

			if(!isSmooth) hitDist = saturate(max(rDist * 2.0, 3.0 * material.roughness));
		}

		if (isEyeInWater == 1) skylight = 1.0;

		if (skylight > 0.0){
			#ifdef DISTANT_HORIZONS
				float farDist = max(float(dhRenderDistance), far) * 1.4;
				#ifdef DH_LIMIT_VFOG_DIST
					farDist = min(2048.0, farDist);
				#endif
			#else
				float farDist = far * 1.4;
			#endif
			rDist = max(min(rDist + dist, farDist) - dist, 0.0);


			if (rDist > 0.0){
				reflection *= MAIN_OUTPUT_FACTOR;
				vec3 volumetricReflection = reflection;

				vec3 endPos = worldPos + rayWorldDir * rDist;

			
				#ifdef LANDSCATTERING
					#ifdef DISTANT_HORIZONS
						LandAtmosphericScattering(volumetricReflection, rDist, worldPos, endPos, rayWorldDir, isSky);
					#else
						#ifdef LANDSCATTERING_REFLECTION
							LandAtmosphericScattering(volumetricReflection, rDist, worldPos, endPos, rayWorldDir, isSky);
						#endif
					#endif
				#endif
			

				#ifdef VFOG
					#ifdef VFOG_REFLECTION
						float globalCloudShadow = GetSmoothCloudShadow();

						#ifdef UNDERWATER_VFOG
							if (isEyeInWater == 1) volumetricReflection += UnderwaterVolumetricFog(worldPos, endPos, rayWorldDir, globalCloudShadow);
						#endif

						float fogTimeFactor = 1.0;
						#ifndef VFOG_IGNORE_WORLDTIME
							#ifndef DISABLE_LOCAL_PRECIPITATION
								fogTimeFactor *= mix(1.0 - timeNoon, 1.0, wetness * (1.0 - eyeNoPrecipitationSmooth * 0.7));
							#else
								fogTimeFactor *= mix(1.0 - timeNoon, 1.0, wetness);
							#endif
						#endif
						
						float fogTransmittance = 1.0;
						if (fogTimeFactor > 0.01 && isEyeInWater == 0) VolumetricFog(volumetricReflection, worldPos, endPos, rayWorldDir, globalCloudShadow, fogTimeFactor, fogTransmittance);
					#endif
				#endif


				reflection = mix(reflection, volumetricReflection, skylight);
				reflection /= MAIN_OUTPUT_FACTOR;
			}
		}
	#else
		if(hit && !isSmooth){
			vec3 hitPos = ViewPos_From_ScreenPos(screenPos.xy, textureLod(depthtex0, screenPos.xy, 0.0).x);
			float rDist = distance(hitPos, viewPos);

			hitDist = saturate(max(rDist * 2.0, 3.0 * material.roughness));
		}
	#endif

	return vec4(LinearToCurve(reflection.rgb), hitDist);
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

	vec3 viewPos = ViewPos_From_ScreenPos(texCoord, gbuffer.depthW);

	#ifdef DISTANT_HORIZONS
		if (gbuffer.depthW == 1.0){
			gbuffer.depthW = texelFetch(dhDepthTex0, texelCoord, 0).x;
			viewPos = ViewPos_From_ScreenPos_DH(texCoord, gbuffer.depthW);
		}
	#endif

	vec3 worldPos = mat3(gbufferModelViewInverse) * viewPos;
	vec3 viewDir = normalize(viewPos);

	float highlightStrength = float((isEyeInWater != 1 || materialMask.water < 0.5) && gbuffer.lightmapW.g > 0.0) * shadowHighlightStrength;

	compositeOutput3 = vec4(0.0);
	
	if (gbuffer.material.reflectionStrength > 0.0) 
		compositeOutput3 = CalculateSpecularReflections(viewPos, worldPos, viewDir, gbuffer.normalW, gbuffer.depthW, gbuffer.albedo, gbuffer.material, gbuffer.lightmapW.g, materialMask.hand > 0.5, isSmooth, highlightStrength);
}
