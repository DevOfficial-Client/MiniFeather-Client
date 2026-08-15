#version 330


//deferred.fsh


/* DRAWBUFFERS:46 */
layout(location = 0) out vec4 deferredOutput4;
layout(location = 1) out vec4 deferredOutput6;


uniform sampler2D colortex3;
uniform sampler2D colortex5;


ivec2 texelCoord = ivec2(gl_FragCoord.xy);


void main(){
	vec4 data3 = texelFetch(colortex3, texelCoord, 0);
	vec4 data5 = texelFetch(colortex5, texelCoord, 0);

	deferredOutput4 = data3;
	deferredOutput6 = vec4(0.0, 0.0, data5.z, 0.0);
}
