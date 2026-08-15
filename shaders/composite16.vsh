#version 330 compatibility


#define DIMENSION_MAIN


#include "/Lib/UniformDeclare.glsl"
#include "/Lib/Utilities.glsl"


void main(){
    vec2 texCoord = gl_Vertex.xy;
    vec2 finalScreenSize = ceil(screenSize / MC_RENDER_QUALITY);
    texCoord *= (finalScreenSize + 2.0) / screenSize * 0.5;

	gl_Position = vec4(texCoord * 2.0 - 1.0, step(1.0, MC_RENDER_QUALITY) * 2.0, 1.0);
}
