#version 330


#define DIMENSION_MAIN
#define COLORTEX_CLOUDNOISE


#include "/Lib/UniformDeclare.glsl"
#include "/Lib/Utilities.glsl"


/* DRAWBUFFERS:12 */
layout(location = 0) out vec4 compositeOutput1;
layout(location = 1) out vec4 compositeOutput2;


ivec2 texelCoord = ivec2(gl_FragCoord.xy);
vec2 texCoord = gl_FragCoord.xy * pixelSize;

in vec3 worldShadowVector;
in vec3 shadowVector;
in vec3 worldSunVector;
in vec3 worldMoonVector;

in vec3 colorShadowlight;
in vec3 colorSunlight;
in vec3 colorMoonlight;

in vec3 colorSkylight;
in vec3 colorSunSkylight;
in vec3 colorMoonSkylight;

in vec3 colorTorchlight;

in float timeNoon;
in float timeMidnight;


#include "/Lib/Uniform/GbufferTransforms.glsl"

#include "/Lib/BasicFounctions/TemporalNoise.glsl"
#include "/Lib/BasicFounctions/PrecomputedAtmosphere.glsl"

#include "/Lib/IndividualFounctions/NUBIS.glsl"
#include "/Lib/IndividualFounctions/PlanarClouds.glsl"


vec3 CalculateStars(vec3 worldDir){
	const float scale = 384.0;
	const float coverage = 0.007;
	const float maxLuminance = 0.05;
	const float minTemperature = 4000.0;
	const float maxTemperature = 8000.0;

	float cosine = dot(worldSunVector,  vec3(0, 0, 1));
	vec3 axis = cross(worldSunVector,  vec3(0, 0, 1));
	float cosecantSquared = 1.0 / dot(axis, axis);
	worldDir = cosine * worldDir + cross(axis, worldDir) + (cosecantSquared - cosecantSquared * cosine) * dot(axis, worldDir) * axis;

	vec3  p = worldDir * scale;
	ivec3 i = ivec3(floor(p));
	vec3  f = p - i;
	float r = dot(f - 0.5, f - 0.5);

	vec3 i3 = fract(i * vec3(443.897, 441.423, 437.195));
	i3 += dot(i3, i3.yzx + 19.19);
	vec2 hash = fract((i3.xx + i3.yz) * i3.zy);
	hash.y = 2.0 * hash.y - 4.0 * hash.y * hash.y + 3.0 * hash.y * hash.y * hash.y;

	float c = remapSaturate(hash.x, 1.0 - coverage, 1.0);
	return (maxLuminance * remapSaturate(r, 0.25, 0.0) * c * c) * Blackbody(mix(minTemperature, maxTemperature, hash.y));
}


vec3 UnprojectSky(vec2 texel, float tileSize){
	float tileSizeDivide = 1.0 / (0.5 * tileSize - 1.5);

	vec3 direction = vec3(0.0);

	if (texel.x < tileSize) {
		direction.x = step(tileSize, texel.y) * 2.0 - 1.0;
		direction.y = (texel.x - tileSize * 0.5) * tileSizeDivide;
		direction.z = (texel.y - tileSize * (step(tileSize, texel.y) + 0.5)) * tileSizeDivide;
	} else if (texel.x < 2.0 * tileSize) {
		direction.x = (texel.x - tileSize * 1.5) * tileSizeDivide;
		direction.y = step(tileSize, texel.y) * 2.0 - 1.0;
		direction.z = (texel.y - tileSize * (step(tileSize, texel.y) + 0.5)) * tileSizeDivide;
	} else {
		direction.x = (texel.x - tileSize * 2.5) * tileSizeDivide;
		direction.y = (texel.y - tileSize * (step(tileSize, texel.y) + 0.5)) * tileSizeDivide;
		direction.z = step(tileSize, texel.y) * 2.0 - 1.0;
	}

	return normalize(direction);
}

////////////////////////////// Main //////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////// Main //////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////// Main //////////////////////////////////////////////////////////////////////////////////////////////////////////////////

void main(){
	float depth 					= texelFetch(depthtex1, texelCoord, 0).x;
	vec3 viewPos 					= ViewPos_From_ScreenPos(texCoord, depth);

	#ifdef DISTANT_HORIZONS
		if (depth == 1.0){
			depth 					= texelFetch(dhDepthTex0, texelCoord, 0).x;
			viewPos 				= ViewPos_From_ScreenPos_DH(texCoord, depth);
		}
	#endif

	vec3 worldPos					= mat3(gbufferModelViewInverse) * viewPos;

	vec3 viewDir 					= normalize(viewPos);
	vec3 worldDir 					= normalize(worldPos);

	#ifdef DISTANT_HORIZONS
		float farDist 				= max(dhFarPlane, 1024.0);
	#else
		float farDist 				= max(far * 1.2, 1024.0);
	#endif
	float cloudShadow 				= 1.0;

	#ifdef ATMO_HORIZON
		vec3 camera = vec3(0.0, max(cameraPosition.y, ATMO_MIN_ALTITUDE) * 0.001 + atmosphereModel_bottom_radius, 0.0);
	#else
		vec3 camera = vec3(0.0, max(cameraPosition.y, 63.0) * 0.001 + atmosphereModel_bottom_radius, 0.0);
	#endif

	vec3 cameraSkyBox = vec3(0.0, max(cameraPosition.y, ATMO_SKYBOX_MIN_ALTITUDE) * 0.001 + atmosphereModel_bottom_radius, 0.0);

	vec2 noise_0  = vec2(bayer64(gl_FragCoord.xy), 0.5);
	vec2 noise_1 = BlueNoiseTemproal().xy;

	vec2 cloudAltitude = vec2(mix(CLOUD_CLEAR_ALTITUDE, CLOUD_RAIN_ALTITUDE, wetness));
	cloudAltitude.y += mix(CLOUD_CLEAR_THICKNESS, CLOUD_RAIN_THICKNESS, wetness);

	float wind = 0.0005 * (frameTimeCounter * CLOUD_SPEED + 10.0 * FTC_OFFSET);
	vec3 windDirection = vec3(1.0, wetness * 0.1 - 0.05, -0.4) * wind;


	compositeOutput1 = texelFetch(colortex1, texelCoord, 0);


//////////////////// Sky ///////////////////////////////////////////////////////////////////////////
//////////////////// Sky ///////////////////////////////////////////////////////////////////////////

	if (depth == 1.0){
		vec3 finalComposite = vec3(0.0);

		vec3 transmittance = vec3(1.0);

		#ifdef ATMO_HORIZON
			bool horizon = true;
		#else
			bool horizon = false;
		#endif
		bool ray_r_mu_intersects_ground;
		vec3 atmosphere = GetSkyRadiance(camera, worldDir, worldSunVector, worldMoonVector, horizon, transmittance, ray_r_mu_intersects_ground);

		finalComposite += atmosphere;

		float cloudTransmittance = 1.0;
		#ifdef VOLUMETRIC_CLOUDS
			if ((cameraPosition.y > cloudAltitude.x || !ray_r_mu_intersects_ground) && (cameraPosition.y < cloudAltitude.y || worldDir.y < 0.0))
				NubisCumulus(finalComposite, worldDir, cloudAltitude, windDirection, camera, noise_1, cloudTransmittance);
		#endif

		#ifdef PLANAR_CLOUDS
			if (cameraPosition.y < PC_ALTITUDE && !ray_r_mu_intersects_ground)
				PlanarClouds(finalComposite, worldDir, camera, noise_1.y, cloudTransmittance);
		#endif


		vec3 celestial = GammaToLinear(texelFetch(colortex0, texelCoord, 0).rgb) * (SKY_TEXTURE_BRIGHTNESS * 0.2);

		#if STAR_TYPE == 1
			celestial += CalculateStars(worldDir);
		#endif

		celestial *= NIGHT_BRIGHTNESS;

		vec3 sunDisc = RenderSunDisc(worldDir, worldSunVector) * (0.2 + timeNoon * 3.0);
		vec3 moonDisc = vec3(0.8886, 1.0019, 1.3095) * (RenderMoonDisc(worldDir, worldMoonVector) * NIGHT_BRIGHTNESS);

		#ifdef MOON_TEXTURE
			celestial = mix(celestial * cloudTransmittance + sunDisc + moonDisc,
							(celestial + sunDisc + moonDisc * float(isEyeInWater != 0)) * cloudTransmittance,
							mix(1.0, RAIN_SHADOW, wetness));
		#else
			celestial = mix(celestial * cloudTransmittance + sunDisc + moonDisc,
							(celestial + sunDisc + moonDisc) * cloudTransmittance,
							mix(1.0, RAIN_SHADOW, wetness));
		#endif

		finalComposite += celestial * transmittance * 200.0;

		#ifdef CAVE_MODE
			finalComposite = mix(finalComposite, vec3(max(NOLIGHT_BRIGHTNESS, 0.00007) * 0.05), saturate(eyeBrightnessZeroSmooth));
		#endif
			
		finalComposite /= MAIN_OUTPUT_FACTOR;
		finalComposite = LinearToCurve(finalComposite);

		compositeOutput1 = vec4(finalComposite, 1.0);
	}


//////////////////// Sky Image /////////////////////////////////////////////////////////////////////
//////////////////// Sky Image /////////////////////////////////////////////////////////////////////


	compositeOutput2 = texelFetch(colortex2, texelCoord, 0);

	float tileSize = min(SKY_IMAGE_RESOLUTION, floor(min(screenSize.x / 3.3, screenSize.y * 0.45)));
	vec2 skyImageTexel = gl_FragCoord.xy;
	skyImageTexel.y -= ceil(screenSize.y * 0.5 + 1.0);
	vec2 boundary = tileSize * vec2(3.0, 2.0);

	if (clamp(skyImageTexel, vec2(0.0), boundary) == skyImageTexel){
		vec3 skyImage = vec3(0.0);

		vec3 viewVector = UnprojectSky(skyImageTexel, tileSize);

		#ifdef ATMO_REFLECTION_HORIZON
			bool horizon = true;
		#else
			bool horizon = false;
		#endif
		vec3 transmittance = vec3(1.0);
		bool ray_r_mu_intersects_ground;
		vec3 atmosphere = GetSkyRadiance(cameraSkyBox, viewVector, worldSunVector, worldMoonVector, horizon, transmittance, ray_r_mu_intersects_ground);

		skyImage += atmosphere;

		float cloudTransmittance = 1.0;
		#ifdef VOLUMETRIC_CLOUDS
			if ((cameraPosition.y > cloudAltitude.x || !ray_r_mu_intersects_ground) && (cameraPosition.y < cloudAltitude.y || worldDir.y < 0.0))
				NubisCumulus(skyImage, viewVector, cloudAltitude, windDirection, camera, noise_0, cloudTransmittance);
		#endif

		#ifdef PLANAR_CLOUDS
			if (cameraPosition.y < PC_ALTITUDE && !ray_r_mu_intersects_ground)
				PlanarClouds(skyImage, viewVector, cameraSkyBox, noise_0.x, cloudTransmittance);
		#endif

		#ifdef CAVE_MODE
			skyImage = mix(skyImage, vec3(max(NOLIGHT_BRIGHTNESS, 0.00005) * 0.07), eyeBrightnessZeroSmooth);
		#endif

		skyImage /= MAIN_OUTPUT_FACTOR;
		skyImage = LinearToCurve(skyImage);
		compositeOutput2 = vec4(skyImage, cloudTransmittance);
	}

	#ifdef CLOUD_SHADOW
		vec2 shadowTexel = screenSize - gl_FragCoord.xy;
		float shadowTexSize = floor(min(screenSize.y * 0.45, CLOUD_SHADOWTEX_SIZE));
		shadowTexel /= shadowTexSize;

		if (saturate(shadowTexel) == shadowTexel){
			compositeOutput2.r = CloudShadowTex(shadowTexel, cloudAltitude, windDirection);
		}
	#endif
}
