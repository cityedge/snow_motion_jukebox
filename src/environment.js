const clamp01 = value => Math.max(0, Math.min(1, value));

export const DEFAULT_ENVIRONMENT_PROFILE = Object.freeze({
  transitionEnd: 1,
  sunAzimuthDeg: -18,
  sunRevealStart: null,
  start: Object.freeze({
    skyZenithColor: 0x7fa2b6,
    skyHorizonColor: 0xb6d0dc,
    horizonGlowColor: 0xffc18f,
    horizonGlowStrength: 0,
    fogColor: 0xb6d0dc,
    fogDensityScale: 1,
    snowColor: 0xeaf4f7,
    hemisphereSkyColor: 0xeaf7ff,
    hemisphereGroundColor: 0x6b8490,
    hemisphereIntensity: 2.0,
    sunLightColor: 0xffffff,
    sunLightIntensity: 2.35,
    sunDiscColor: 0xfff4d6,
    sunHaloColor: 0xffd39c,
    sunElevationDeg: 11,
    sunOpacity: 0.82,
  }),
  end: Object.freeze({
    skyZenithColor: 0x7fa2b6,
    skyHorizonColor: 0xb6d0dc,
    horizonGlowColor: 0xffc18f,
    horizonGlowStrength: 0,
    fogColor: 0xb6d0dc,
    fogDensityScale: 1,
    snowColor: 0xeaf4f7,
    hemisphereSkyColor: 0xeaf7ff,
    hemisphereGroundColor: 0x6b8490,
    hemisphereIntensity: 2.0,
    sunLightColor: 0xffffff,
    sunLightIntensity: 2.35,
    sunDiscColor: 0xfff4d6,
    sunHaloColor: 0xffd39c,
    sunElevationDeg: 11,
    sunOpacity: 0.82,
  }),
});

const COLOR_KEYS = new Set([
  'skyZenithColor',
  'skyHorizonColor',
  'horizonGlowColor',
  'fogColor',
  'snowColor',
  'hemisphereSkyColor',
  'hemisphereGroundColor',
  'sunLightColor',
  'sunDiscColor',
  'sunHaloColor',
]);

function mixNumber(a, b, amount) {
  return a + (b - a) * amount;
}

function mixColor(a, b, amount) {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(mixNumber(ar, br, amount));
  const g = Math.round(mixNumber(ag, bg, amount));
  const blue = Math.round(mixNumber(ab, bb, amount));
  return (r << 16) | (g << 8) | blue;
}

function smoothRange(value, start, end) {
  const linear = clamp01((value - start) / Math.max(0.0001, end - start));
  return linear * linear * (3 - 2 * linear);
}

const CLEAR_SKY_ZENITH = 0x4098c9;
const CLEAR_SKY_HORIZON = 0xb8dff0;
const OVERCAST_SKY_ZENITH = 0xcbd5d8;
const OVERCAST_SKY_HORIZON = 0xe4e8e8;
const STORM_SKY_ZENITH = 0x8f999d;
const STORM_SKY_HORIZON = 0xb2b8ba;

export function clearSkyPresentationAt(
  environment,
  weather,
  visibleNearMistOpacity = weather?.nearMist ?? 0
) {
  const elevation = environment?.sunElevationDeg ?? -20;
  const phase = environment?.phase ?? 0;
  const horizonGlow = environment?.horizonGlowStrength ?? 0;

  // Existing daylight cues determine whether blue sky is possible. Normal
  // morning/day profiles become clearer as the sun rises. The dawn profile
  // keeps its warm horizon until late in its transition, then may resolve into
  // blue when the weather itself is also clear. Sunset and night never qualify.
  const daylightPotential = smoothRange(elevation, 8, 18);
  const dawnPotential = smoothRange(phase, 0.35, 0.92)
    * smoothRange(elevation, -4, -1)
    * (1 - smoothRange(horizonGlow, 0.025, 0.16));
  const timePotential = Math.max(daylightPotential, dawnPotential);

  // A small amount of either snow or visibly presented mist is enough to end
  // blue sky. Snow still reaches the storm palette quickly, while fog alone
  // remains bright overcast until the on-screen veil is genuinely dense.
  const snowPressure = clamp01(((weather?.snowfall ?? 0) - 0.015) / 0.085);
  const mistPressure = clamp01((visibleNearMistOpacity - 0.015) / 0.24);
  const weatherPressure = Math.max(snowPressure, mistPressure);
  const clearWeight = 1 - smoothRange(weatherPressure, 0, 0.28);
  const snowStormWeight = smoothRange(snowPressure, 0.58, 1);
  const fogStormWeight = smoothRange(mistPressure, 0.82, 1);
  const stormWeight = Math.max(snowStormWeight, fogStormWeight);
  const overcastWeight = smoothRange(weatherPressure, 0, 0.28) * (1 - stormWeight);
  const presentationStrength = clamp01(timePotential * 0.92);

  const preStormZenith = mixColor(CLEAR_SKY_ZENITH, OVERCAST_SKY_ZENITH, 1 - clearWeight);
  const preStormHorizon = mixColor(CLEAR_SKY_HORIZON, OVERCAST_SKY_HORIZON, 1 - clearWeight);
  // A true daytime storm ends at neutral grey. Dawn uses its original muted
  // palette so Track 1's accepted snowy morning is not recolored wholesale.
  const stormZenith = mixColor(environment.skyZenithColor, STORM_SKY_ZENITH, daylightPotential);
  const stormHorizon = mixColor(environment.skyHorizonColor, STORM_SKY_HORIZON, daylightPotential);
  const weatherZenith = mixColor(preStormZenith, stormZenith, stormWeight);
  const weatherHorizon = mixColor(preStormHorizon, stormHorizon, stormWeight);
  const amount = presentationStrength * clearWeight;

  return {
    amount,
    overcastAmount: presentationStrength * overcastWeight,
    weatherPressure,
    skyZenithColor: mixColor(environment.skyZenithColor, weatherZenith, presentationStrength),
    skyHorizonColor: mixColor(environment.skyHorizonColor, weatherHorizon, presentationStrength),
  };
}

export function environmentPhaseAt(profile, progress) {
  const transitionEnd = Math.max(0.01, profile?.transitionEnd ?? 1);
  const linear = clamp01(progress / transitionEnd);
  return linear * linear * (3 - 2 * linear);
}

export function sampleEnvironment(profile, progress) {
  const source = profile ?? DEFAULT_ENVIRONMENT_PROFILE;
  const start = { ...DEFAULT_ENVIRONMENT_PROFILE.start, ...(source.start ?? {}) };
  const end = { ...DEFAULT_ENVIRONMENT_PROFILE.end, ...(source.end ?? {}) };
  const phase = environmentPhaseAt(source, progress);
  const sample = {
    phase,
    sunAzimuthDeg: source.sunAzimuthDeg ?? DEFAULT_ENVIRONMENT_PROFILE.sunAzimuthDeg,
  };

  for (const key of Object.keys(start)) {
    sample[key] = COLOR_KEYS.has(key)
      ? mixColor(start[key], end[key], phase)
      : mixNumber(start[key], end[key], phase);
  }
  if (Number.isFinite(source.sunTransitionEnd)) {
    const sunPhase = environmentPhaseAt({ transitionEnd: source.sunTransitionEnd }, progress);
    sample.sunElevationDeg = mixNumber(
      start.sunElevationDeg,
      end.sunElevationDeg,
      sunPhase
    );
  }
  if (Number.isFinite(source.sunRevealStart)) {
    const revealStart = clamp01(source.sunRevealStart);
    const revealLinear = revealStart >= 1
      ? 0
      : clamp01((progress - revealStart) / (1 - revealStart));
    const revealPhase = revealLinear * revealLinear * (3 - 2 * revealLinear);
    sample.sunOpacity *= revealPhase;
  }
  if (Number.isFinite(source.sunFadeEnd)) {
    const fadeStart = clamp01(source.sunFadeStart ?? 0);
    const fadeEnd = Math.max(fadeStart + 0.001, clamp01(source.sunFadeEnd));
    const fadeLinear = clamp01((progress - fadeStart) / (fadeEnd - fadeStart));
    const fadePhase = fadeLinear * fadeLinear * (3 - 2 * fadeLinear);
    sample.sunOpacity *= 1 - fadePhase;
  }
  return sample;
}
