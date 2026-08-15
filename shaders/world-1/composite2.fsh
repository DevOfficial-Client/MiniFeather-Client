#version 330


#define DIMENSION_NETHER


#include "/Lib/UniformDeclare.glsl"
#include "/Lib/Utilities.glsl"


/* DRAWBUFFERS:3 */
layout(location = 0) out vec4 compositeOutput3;


ivec2 texelCoord = ivec2(gl_FragCoord.xy);
vec2 texCoord = gl_FragCoord.xy * pixelSize;


#include "/Lib/GbufferData.glsl"
#include "/Lib/Uniform/GbufferTransforms.glsl"

#include "/Lib/BasicFounctions/TemporalNoise.glsl"
#include "/Lib/BasicFounctions/NetherColor.glsl"

#include "/Lib/IndividualFounctions/Reflections/SSR.glsl"


vec3 NetherFog(vec2 dist){
	dist = min(dist, vec2(far * 1.2));

	float fogDensity = NetherFogColor().w;
	vec2 fogFactor = 1.0 - exp2(-dist * fogDensity);
	fogFactor *= fogFactor;

	vec3 fogColor = NetherFogColor().xyz * 0.0125;

	return max(fogFactor.x - fogFactor.y, 0.0) * fogColor;
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

	reflection = mix(vec3(0.0), reflection, float(hit));

	float dist = length(viewPos);
	float rDist = 80.0;

	if(hit){
		float hitDepth = textureLod(depthtex0, screenPos.xy, 0.0).x;
		vec3 hitPos = ViewPos_From_ScreenPos(screenPos.xy, hitDepth);
		rDist = dist + distance(hitPos, viewPos);

		if(!isSmooth) hitDist = saturate(max(rDist * 2.0, 3.0 * material.roughness));
	}
	
	reflection += NetherFog(vec2(rDist, dist)) / MAIN_OUTPUT_FACTOR;

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
