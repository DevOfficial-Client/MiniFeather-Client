#version 330


#define DIMENSION_END


#include "/Lib/UniformDeclare.glsl"
#include "/Lib/Utilities.glsl"


/* DRAWBUFFERS:3 */
layout(location = 0) out vec4 compositeOutput3;


ivec2 texelCoord = ivec2(gl_FragCoord.xy);
vec2 texCoord = gl_FragCoord.xy * pixelSize;

in vec3 worldShadowVector;
in vec3 shadowVector;
in vec3 worldSunVector;

in vec3 colorTorchlight;


#include "/Lib/GbufferData.glsl"
#include "/Lib/Uniform/GbufferTransforms.glsl"

#include "/Lib/BasicFounctions/TemporalNoise.glsl"

#include "/Lib/IndividualFounctions/EndSky.glsl"
#include "/Lib/IndividualFounctions/Reflections/SSR.glsl"


vec3 ComputeFakeSkyReflection(vec3 reflectWorldDir, bool isSmooth){
	vec3 sky = vec3(0.0);

	BlackHole_AccretionDisc_Reflection(sky, reflectWorldDir, worldShadowVector);

	PlanetEnd2(sky, vec3(0.0), reflectWorldDir, worldShadowVector);

	return sky / MAIN_OUTPUT_FACTOR;
}


vec4 CalculateSpecularReflections(vec3 viewPos, vec3 viewDir, vec3 normal, float gbufferdepth, vec3 albedo, Material material, bool isHand, bool isSmooth){
	bool totalInternalReflection = texelFetch(colortex1, texelCoord, 0).a > 0.5;

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

	reflection = CurveToLinear(textureLod(colortex1, screenPos.xy, 0.0).rgb);

	vec3 rayDirectionWorld = mat3(gbufferModelViewInverse) * rayDir;
	vec3 skyReflection = vec3(0.0);
	if(!totalInternalReflection && isEyeInWater == 0){
		skyReflection = ComputeFakeSkyReflection(rayDirectionWorld, isSmooth);
		skyReflection *= saturate((dot(normal, gbufferModelView[1].xyz) + 0.7) * 2.0) * 0.75 + 0.25;
	}
	if(totalInternalReflection) skyReflection = CurveToLinear(texelFetch(colortex1, texelCoord, 0).rgb);

	reflection = mix(skyReflection, reflection, float(hit));

	float dist = length(viewPos);
	float rDist = 1e10;

	if(hit){
		vec3 hitPos = ViewPos_From_ScreenPos(screenPos.xy, textureLod(depthtex0, screenPos.xy, 0.0).x);
		rDist = distance(hitPos, viewPos);

		if(!isSmooth) hitDist = saturate(max(rDist * 2.0, 3.0 * material.roughness));
	}

	#ifdef DISTANT_HORIZONS
		float farDist = clamp(dhFarPlane, 1024.0, 2048.0);
	#else
		float farDist = max(far * 1.2, 1024.0);
	#endif
	rDist = max(min(min(rDist + dist, farDist), 512.0) - dist, 0.0);
	
	if (rDist > 0.0) reflection += EndFog(rDist, rayDirectionWorld) / MAIN_OUTPUT_FACTOR;

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

	vec3 viewDir = normalize(viewPos);

	compositeOutput3 = vec4(0.0);

	if (gbuffer.material.reflectionStrength > 0.0) 
		compositeOutput3 = CalculateSpecularReflections(viewPos, viewDir, gbuffer.normalW, gbuffer.depthW, gbuffer.albedo, gbuffer.material, materialMask.hand > 0.5, isSmooth);
}

