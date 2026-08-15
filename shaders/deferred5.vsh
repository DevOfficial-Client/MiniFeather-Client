#version 330 compatibility


#include "/Lib/Settings.glsl"


uniform vec2 screenSize;
uniform vec2 pixelSize;


void main(){
	vec2 shadowTexSize = pixelSize * floor(min(screenSize.y * 0.45, CLOUD_SHADOWTEX_SIZE));
	vec2 texCoord = gl_Vertex.xy;
    texCoord = texCoord * shadowTexSize + (1.0 - shadowTexSize);
	gl_Position = vec4(texCoord * 2.0 - 1.0, 0.0, 1.0);
}
