#version 330


#define DIMENSION_MAIN
#define COLORTEX_CLOUDNOISE


#include "/Lib/UniformDeclare.glsl"
#include "/Lib/Utilities.glsl"


/* DRAWBUFFERS:2 */
layout(location = 0) out vec4 compositeOutput2;


ivec2 texelCoord = ivec2(gl_FragCoord.xy);


vec4 AxialGaussianBlur(){
	ivec4 shadowTexBorder = ivec4(screenSize - floor(min(screenSize.y * 0.45, CLOUD_SHADOWTEX_SIZE)), screenSize - 1.0);

	//float weights[3] = float[3](0.434320, 0.195152, 0.087688);

	//float weights[4] = float[4](0.329966, 0.181090, 0.099384, 0.054543);

	vec4 blur = vec4(0.0);

	ivec2 sampleCoord = clamp(ivec2(texelCoord.x - 3, texelCoord.y), shadowTexBorder.xy, shadowTexBorder.zw);
	blur.r += texelFetch(colortex2, sampleCoord, 0).r * 0.054543;

	sampleCoord = clamp(ivec2(texelCoord.x - 2, texelCoord.y), shadowTexBorder.xy, shadowTexBorder.zw);
	blur.r += texelFetch(colortex2, sampleCoord, 0).r * 0.099384;

	sampleCoord = clamp(ivec2(texelCoord.x - 1, texelCoord.y), shadowTexBorder.xy, shadowTexBorder.zw);
	blur.r += texelFetch(colortex2, sampleCoord, 0).r * 0.181090;

	vec4 data2 = texelFetch(colortex2, texelCoord, 0);
	blur.r += data2.r * 0.329966;
	blur.gba += data2.gba;

	sampleCoord = clamp(ivec2(texelCoord.x + 1, texelCoord.y), shadowTexBorder.xy, shadowTexBorder.zw);
	blur.r += texelFetch(colortex2, sampleCoord, 0).r * 0.181090;

	sampleCoord = clamp(ivec2(texelCoord.x + 2, texelCoord.y), shadowTexBorder.xy, shadowTexBorder.zw);
	blur.r += texelFetch(colortex2, sampleCoord, 0).r * 0.099384;

	sampleCoord = clamp(ivec2(texelCoord.x + 3, texelCoord.y), shadowTexBorder.xy, shadowTexBorder.zw);
	blur.r += texelFetch(colortex2, sampleCoord, 0).r * 0.054543;

	return blur;
}


void main(){
	compositeOutput2 = AxialGaussianBlur();
}
