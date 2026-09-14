#version 330

uniform sampler2D InSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 InSize;
};

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / OutSize;
    vec2 texel = vec2(1.0 / InSize.x, 0.0);

	vec3 color = texture(InSampler, uv).rgb * 0.227027;
	color += texture(InSampler, uv + texel * 1.384615).rgb * 0.316216;
	color += texture(InSampler, uv - texel * 1.384615).rgb * 0.316216;
	color += texture(InSampler, uv + texel * 3.230769).rgb * 0.070270;
	color += texture(InSampler, uv - texel * 3.230769).rgb * 0.070270;
	fragColor = vec4(color, 1.0);
}
