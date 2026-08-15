#version 330


#define DIMENSION_NETHER


#include "/Lib/UniformDeclare.glsl"
#include "/Lib/Utilities.glsl"


layout(location = 0) out vec4 compositeOutput1;


ivec2 texelCoord = ivec2(gl_FragCoord.xy);
vec2 texCoord = gl_FragCoord.xy * pixelSize;

in vec3 colorTorchlight;


#include "/Lib/GbufferData.glsl"
#include "/Lib/Uniform/GbufferTransforms.glsl"

#include "/Lib/BasicFounctions/TemporalNoise.glsl"
#include "/Lib/BasicFounctions/Blocklight.glsl"
#include "/Lib/BasicFounctions/NetherColor.glsl"
#include "/Lib/BasicFounctions/VanillaComposite.glsl"

#include "/Lib/IndividualFounctions/WaterWaves.glsl"
#include "/Lib/IndividualFounctions/Reflections/SSR.glsl"
#include "/Lib/IndividualFounctions/DOF.glsl"


vec3 NetherFog(float dist){
	float fogDensity = NetherFogColor().w;
	float fogFactor = 1.0 - exp2(-dist * fogDensity);
	fogFactor *= fogFactor;

	vec3 fogColor = NetherFogColor().xyz * 0.0125;

	return fogFactor * fogColor;
}


void WaterRefractionLite(inout vec3 color, MaterialMask mask, vec3 normal, vec3 worldPos, vec3 viewPos, float waterDist, float opaqueDepth){
	vec2 refractCoord = texCoord;

	float waterDeep = opaqueDepth - waterDist;

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
	if(refractDepth < currentDepth) refractCoord = texCoord.st;

	refractCoord = mix(texCoord, refractCoord, float(saturate(refractCoord) == refractCoord));

	color = CurveToLinear(textureLod(colortex1, refractCoord.xy, 0.0).rgb);

	float rDist = max(length(ViewPos_From_ScreenPos(refractCoord, textureLod(depthtex1, refractCoord, 0.0).x)) - waterDist, 0.0);

	color += NetherFog(rDist) / MAIN_OUTPUT_FACTOR;
}


void TransparentAbsorption(inout vec3 color, vec4 stainedGlassAlbedo){
	vec3 stainedGlassColor = normalize(stainedGlassAlbedo.rgb + 0.0001) * fsqrt(length(stainedGlassAlbedo.rgb));
	color *= GammaToLinear(mix(vec3(1.0), stainedGlassColor, vec3(pow(stainedGlassAlbedo.a, 0.2))));
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
		bool isDH = gbuffer.depthW == 1.0;
		if (isDH){
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
		float farDist 				= max(far * 1.2, 1024.0);
	#endif
	float opaqueDist 				= min(length(viewPosSoild) + materialMaskSoild.sky * 1e10, farDist);
	float waterDist 				= min(length(viewPos) + materialMask.sky * 1e10, farDist);


	vec3 color = CurveToLinear(texelFetch(colortex1, texelCoord, 0).rgb);

	if (materialMask.ice + materialMask.stainedGlass > 0.5) 
		WaterRefractionLite(color, materialMask, gbuffer.normalW, worldPos, viewPos, waterDist, opaqueDist);

	if (materialMask.stainedGlass > 0.5) 
		TransparentAbsorption(color, gbuffer.albedoW);

	if (materialMask.water + materialMask.ice > 0.5 || isEyeInWater == 1) 
		color *= vec3(0.5, 0.55, 0.7);

	if (gbuffer.material.reflectionStrength > 0.0)
		CalculateSpecularReflections(color, viewDir, gbuffer.normalW, gbuffer.albedo, gbuffer.material);


	color *= MAIN_OUTPUT_FACTOR;


	#ifdef SPECULAR_HELDLIGHT
		if(heldBlockLightValue + heldBlockLightValue2 > 0.0 && materialMask.sky < 0.5)
			TorchSpecularHighlight(color, viewPos, viewDir, waterDist, gbuffer.albedo, gbuffer.normalW, gbuffer.material);
	#endif

	color += NetherFog(waterDist);

	VanillaFog(color, waterDist);

	SelectionBox(color, gbuffer.albedo, materialMaskSoild.selection > 0.5 && isEyeInWater < 3);


	color /= MAIN_OUTPUT_FACTOR ;
	color = LinearToCurve(color);


	#ifdef DOF
		compositeOutput1 = vec4(color.rgb, CoCSpread());
	#else
		#ifdef DISTANT_HORIZONS
			if (isDH) gbuffer.depthW = ScreenDepth_From_DHScreenDepth(gbuffer.depthW);
		#endif
		compositeOutput1 = vec4(color.rgb, gbuffer.depthW);
	#endif
}

/* DRAWBUFFERS:1 */
