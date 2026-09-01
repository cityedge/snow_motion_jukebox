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
