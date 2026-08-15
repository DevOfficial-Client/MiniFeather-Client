#version 330


#define DIMENSION_END


#include "/Lib/Utilities.glsl"
#include "/Lib/UniformDeclare.glsl"


/* DRAWBUFFERS:1 */
layout(location = 0) out vec4 compositeOutput1;


vec2 texCoord = gl_FragCoord.xy * pixelSize;


#include "/Lib/Uniform/GbufferTransforms.glsl"
#include "/Lib/BasicFounctions/TemporalNoise.glsl"


#include "/Lib/IndividualFounctions/DOF.glsl"


void main(){
	#ifdef DOF
		compositeOutput1 = DepthOfField();
	#endif
}
