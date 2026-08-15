#version 330


#define DIMENSION_MAIN


#include "/Lib/UniformDeclare.glsl"
#include "/Lib/Utilities.glsl"


/* DRAWBUFFERS:3 */
layout(location = 0) out vec4 compositeOutput3;


ivec2 texelCoord = ivec2(gl_FragCoord.xy);
vec2 texCoord = gl_FragCoord.xy * pixelSize;


#include "/Lib/GbufferData.glsl"
#include "/Lib/Uniform/GbufferTransforms.glsl"
#include "/Lib/BasicFounctions/TemporalNoise.glsl"


#include "/Lib/IndividualFounctions/Reflections/ReflectionFilter.glsl"


void main(){
	GbufferData gbuffer = GetGbufferData();

	vec3 viewPos = ViewPos_From_ScreenPos(texCoord, gbuffer.depthW);
	vec3 viewDir = normalize(viewPos);

	vec4 reflectionData = texelFetch(colortex3, texelCoord, 0);
 
	if (gbuffer.material.reflectionStrength > 0.0 && reflectionData.a > 0.0001){
		#ifdef TAA
			vec2 noise = BlueNoiseTemproal() - 0.5;
		#else
			vec2 noise = BlueNoise() - 0.5;
		#endif
		AtrousWaveletFilter(reflectionData, viewPos, viewDir, gbuffer.normalW, gbuffer.material.roughness, 20.0, noise);
	}

	compositeOutput3 = reflectionData;
}