#version 330

// Based on bloom shader code from Shimmer.
// Shimmer Copyright (c) 2022 Low-Drag-MC
// Licensed under the MIT License.
// See THIRD_PARTY_NOTICES.txt for the full license notice.

uniform sampler2D InSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 InSize;
};

out vec4 fragColor;

float bloom_luma(vec3 color) {
    return max(max(color.r, color.g), color.b);
}

float anti_flicker_weight(vec3 color) {
    float luma = bloom_luma(color);
    float risk = smoothstep(0.9, 4.0, luma);
    float damp = 1.0 / (1.0 + luma * 0.35);
    return mix(1.0, damp, 0.45 * risk);
}

void main() {
    vec2 uv = gl_FragCoord.xy / OutSize;
    vec2 texel = 1.0 / InSize;

	vec3 a = texture(InSampler, uv + texel * vec2(-2.0,  2.0)).rgb;
	vec3 b = texture(InSampler, uv + texel * vec2( 0.0,  2.0)).rgb;
	vec3 c = texture(InSampler, uv + texel * vec2( 2.0,  2.0)).rgb;
	vec3 d = texture(InSampler, uv + texel * vec2(-2.0,  0.0)).rgb;
	vec3 e = texture(InSampler, uv).rgb;
	vec3 f = texture(InSampler, uv + texel * vec2( 2.0,  0.0)).rgb;
	vec3 g = texture(InSampler, uv + texel * vec2(-2.0, -2.0)).rgb;
	vec3 h = texture(InSampler, uv + texel * vec2( 0.0, -2.0)).rgb;
	vec3 i = texture(InSampler, uv + texel * vec2( 2.0, -2.0)).rgb;
	vec3 j = texture(InSampler, uv + texel * vec2(-1.0,  1.0)).rgb;
	vec3 k = texture(InSampler, uv + texel * vec2( 1.0,  1.0)).rgb;
	vec3 l = texture(InSampler, uv + texel * vec2(-1.0, -1.0)).rgb;
	vec3 m = texture(InSampler, uv + texel * vec2( 1.0, -1.0)).rgb;

	float wa = anti_flicker_weight(a) * 0.03125;
	float wb = anti_flicker_weight(b) * 0.0625;
	float wc = anti_flicker_weight(c) * 0.03125;
	float wd = anti_flicker_weight(d) * 0.0625;
	float we = anti_flicker_weight(e) * 0.125;
	float wf = anti_flicker_weight(f) * 0.0625;
	float wg = anti_flicker_weight(g) * 0.03125;
	float wh = anti_flicker_weight(h) * 0.0625;
	float wi = anti_flicker_weight(i) * 0.03125;
	float wj = anti_flicker_weight(j) * 0.125;
	float wk = anti_flicker_weight(k) * 0.125;
	float wl = anti_flicker_weight(l) * 0.125;
	float wm = anti_flicker_weight(m) * 0.125;

	vec3 color = a * wa + b * wb + c * wc + d * wd + e * we + f * wf + g * wg + h * wh + i * wi + j * wj + k * wk + l * wl + m * wm;
	float totalWeight = wa + wb + wc + wd + we + wf + wg + wh + wi + wj + wk + wl + wm;
	color /= max(totalWeight, 1.0e-6);
	fragColor = vec4(color, 1.0);
}
