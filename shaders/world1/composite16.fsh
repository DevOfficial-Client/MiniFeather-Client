#version 330 compatibility


#define DIMENSION_END


#include "/Lib/UniformDeclare.glsl"
#include "/Lib/Utilities.glsl"


/* DRAWBUFFERS:8 */
layout(location = 0) out vec4 compositeOutput8;


#include "/Lib/IndividualFounctions/FsrEASU.glsl"


void main(){
    compositeOutput8 = vec4(FsrEasu(gl_FragCoord.xy, screenSize, ceil(screenSize / MC_RENDER_QUALITY)), 0.0);
}