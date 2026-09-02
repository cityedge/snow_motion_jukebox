// Every playable song owns its audio, subtitles and visual direction here.
// Use ?track=01 through ?track=08 to preview a specific entry while authoring.

function environmentProfile(options) {
  return Object.freeze({
    ...options,
    start: Object.freeze(options.start),
    end: Object.freeze(options.end),
  });
}

function weatherProfile(start, end, snowfallCurve = 'linear') {
  return Object.freeze({
    transitionEnd: 1,
    snowfallCurve,
    start: Object.freeze(start),
    end: Object.freeze(end),
  });
}

function visualProfile({
  environment,
  weather,
  priorTracks = true,
  leadBoarder = { enabled: false },
  nightLighting = { enabled: false },
}) {
  return Object.freeze({
    environment,
    weather,
    snowSurface: Object.freeze({ priorTracks }),
    leadBoarder: Object.freeze(leadBoarder),
    nightLighting: Object.freeze(nightLighting),
  });
}

const TRACK_PREVIEW_POINTS = Object.freeze([
  53.370,
  44.690,
  44.280,
  48.200,
  51.790,
  37.870,
  36.890,
  46.760,
]);

const TRACK_AUDIO_URLS = Object.freeze([
  new URL('../music_data/01朝をひらくエッジ feat. CYAN.ogg', import.meta.url).href,
  new URL('../music_data/02白を追い越して feat. CYAN.ogg', import.meta.url).href,
  new URL('../music_data/03白に重なる軌道 feat. CYAN.ogg', import.meta.url).href,
  new URL('../music_data/04影を抜ける呼吸 feat. CYAN.ogg', import.meta.url).href,
  new URL('../music_data/05カップ越しの雪 feat. CYAN.ogg', import.meta.url).href,
  new URL('../music_data/06怖さの横に feat. CYAN.ogg', import.meta.url).href,
  new URL('../music_data/07夜の白さを突き抜ける feat. CYAN.ogg', import.meta.url).href,
  new URL('../music_data/08次はもっと近くで feat. CYAN.ogg', import.meta.url).href,
]);

const TRACK_SUBTITLE_URLS = Object.freeze([
  new URL('../music_data/01朝をひらくエッジ feat. CYAN.srt', import.meta.url).href,
  new URL('../music_data/02白を追い越して feat. CYAN.srt', import.meta.url).href,
  new URL('../music_data/03白に重なる軌道 feat. CYAN.srt', import.meta.url).href,
  new URL('../music_data/04影を抜ける呼吸 feat. CYAN.srt', import.meta.url).href,
  new URL('../music_data/05カップ越しの雪 feat. CYAN.srt', import.meta.url).href,
  new URL('../music_data/06怖さの横に feat. CYAN.srt', import.meta.url).href,
  new URL('../music_data/07夜の白さを突き抜ける feat. CYAN.srt', import.meta.url).href,
  new URL('../music_data/08次はもっと近くで feat. CYAN.srt', import.meta.url).href,
]);

function track(number, slug, title, durationSeconds, profile) {
  return Object.freeze({
    id: `${String(number).padStart(2, '0')}-${slug}`,
    title,
    artist: 'CYAN',
    durationSeconds,
    previewPointSeconds: TRACK_PREVIEW_POINTS[number - 1],
    seed: `${String(number).padStart(2, '0')}-${slug}`,
    visualProfile: profile,
    audioUrl: TRACK_AUDIO_URLS[number - 1],
    subtitlesUrl: TRACK_SUBTITLE_URLS[number - 1],
  });
}

export const DAWN_ENVIRONMENT_PROFILE = environmentProfile({
  // Start at the previously approved readable early-dawn frame and slowly
  // release its red horizon into a normal, clear morning. No visible sun disc.
  transitionEnd: 1,
  sunAzimuthDeg: -18,
  start: {
    skyZenithColor: 0x728fa2,
    skyHorizonColor: 0x9cb2bd,
    horizonGlowColor: 0xf0ad90,
    horizonGlowStrength: 0.29,
    fogColor: 0xa0b6c2,
    fogDensityScale: 1.45,
    snowColor: 0xced8db,
    hemisphereSkyColor: 0xb7c6d2,
    hemisphereGroundColor: 0x5a6f7b,
    hemisphereIntensity: 1.63,
    sunLightColor: 0xf5ccb2,
    sunLightIntensity: 1.24,
    sunDiscColor: 0xffe4b9,
    sunHaloColor: 0xfaaf84,
    sunElevationDeg: -2.0,
    sunOpacity: 0,
  },
  end: {
    skyZenithColor: 0x9ebfce,
    skyHorizonColor: 0xc4dce5,
    horizonGlowColor: 0xffd2b4,
    horizonGlowStrength: 0,
    fogColor: 0xb6d0dc,
    fogDensityScale: 1.0,
    snowColor: 0xeaf4f7,
    hemisphereSkyColor: 0xeaf7ff,
    hemisphereGroundColor: 0x6b8490,
    hemisphereIntensity: 2.0,
    sunLightColor: 0xfff1df,
    sunLightIntensity: 2.10,
    sunDiscColor: 0xffedc4,
    sunHaloColor: 0xffc99b,
    sunElevationDeg: -2.0,
    sunOpacity: 0,
  },
});

export const MORNING_ENVIRONMENT_PROFILE = environmentProfile({
  transitionEnd: 1,
  sunAzimuthDeg: -18,
  start: {
    skyZenithColor: 0x8eb4c7, skyHorizonColor: 0xcbe0e7,
    horizonGlowColor: 0xffd8b7, horizonGlowStrength: 0.05,
    fogColor: 0xc2dbe2, fogDensityScale: 0.88, snowColor: 0xeaf6f8,
    hemisphereSkyColor: 0xe6f6fa, hemisphereGroundColor: 0x6c8994,
    hemisphereIntensity: 2.12, sunLightColor: 0xfff7e9, sunLightIntensity: 2.25,
    sunDiscColor: 0xfff4d6, sunHaloColor: 0xffd39c, sunElevationDeg: 11, sunOpacity: 0,
  },
  end: {
    skyZenithColor: 0x82adbf, skyHorizonColor: 0xc4dde5,
    horizonGlowColor: 0xffd8b7, horizonGlowStrength: 0,
    fogColor: 0xc0d9e1, fogDensityScale: 0.82, snowColor: 0xebf7f9,
    hemisphereSkyColor: 0xeaf9fc, hemisphereGroundColor: 0x6a8792,
    hemisphereIntensity: 2.22, sunLightColor: 0xffffff, sunLightIntensity: 2.35,
    sunDiscColor: 0xfff4d6, sunHaloColor: 0xffd39c, sunElevationDeg: 18, sunOpacity: 0,
  },
});

export const MIDDAY_ENVIRONMENT_PROFILE = environmentProfile({
  transitionEnd: 1,
  sunAzimuthDeg: -18,
  start: {
    skyZenithColor: 0x72a6c0, skyHorizonColor: 0xc1e0e9,
    horizonGlowColor: 0xe4f4f7, horizonGlowStrength: 0,
    fogColor: 0xc5e1e8, fogDensityScale: 0.76, snowColor: 0xf0fafb,
    // Midday also drives overcast/storm scenarios. Lift only the ground-side
    // hemisphere fill so vertical tree cards and shaded rock faces retain
    // colour without making the snow or direct highlights glare more strongly.
    hemisphereSkyColor: 0xebfbff, hemisphereGroundColor: 0x9aadb5,
    hemisphereIntensity: 2.32, sunLightColor: 0xffffff, sunLightIntensity: 2.48,
    sunDiscColor: 0xfff4d6, sunHaloColor: 0xffd39c, sunElevationDeg: 28, sunOpacity: 0,
  },
  end: {
    skyZenithColor: 0x78a9c0, skyHorizonColor: 0xc8e2e8,
    horizonGlowColor: 0xe4f4f7, horizonGlowStrength: 0,
    fogColor: 0xc8e0e6, fogDensityScale: 0.80, snowColor: 0xeff9fa,
    hemisphereSkyColor: 0xeaf8fb, hemisphereGroundColor: 0x96a9b1,
    hemisphereIntensity: 2.25, sunLightColor: 0xfffbf2, sunLightIntensity: 2.35,
    sunDiscColor: 0xfff4d6, sunHaloColor: 0xffd39c, sunElevationDeg: 22, sunOpacity: 0,
  },
});

export const AFTERNOON_ENVIRONMENT_PROFILE = environmentProfile({
  transitionEnd: 1,
  sunAzimuthDeg: 22,
  start: {
    skyZenithColor: 0x6f94aa, skyHorizonColor: 0xb9d0d9,
    horizonGlowColor: 0xdbe6e7, horizonGlowStrength: 0.04,
    fogColor: 0xb2cad2, fogDensityScale: 0.98, snowColor: 0xdfedf0,
    hemisphereSkyColor: 0xd8edf3, hemisphereGroundColor: 0x526b78,
    hemisphereIntensity: 1.86, sunLightColor: 0xf5f0df, sunLightIntensity: 1.82,
    sunDiscColor: 0xffefca, sunHaloColor: 0xe5c5a3, sunElevationDeg: 16, sunOpacity: 0,
  },
  end: {
    skyZenithColor: 0x617f94, skyHorizonColor: 0xa9c0ca,
    horizonGlowColor: 0xd0dce0, horizonGlowStrength: 0.02,
    fogColor: 0xa7c0ca, fogDensityScale: 1.08, snowColor: 0xd7e5e9,
    hemisphereSkyColor: 0xcde3ea, hemisphereGroundColor: 0x4c6471,
    hemisphereIntensity: 1.72, sunLightColor: 0xe6ebdf, sunLightIntensity: 1.62,
    sunDiscColor: 0xffefca, sunHaloColor: 0xe5c5a3, sunElevationDeg: 10, sunOpacity: 0,
  },
});

export const LODGE_APPROACH_ENVIRONMENT_PROFILE = environmentProfile({
  transitionEnd: 1,
  sunAzimuthDeg: 22,
  start: {
    skyZenithColor: 0x6e8491, skyHorizonColor: 0xb2bec0,
    horizonGlowColor: 0xe2b799, horizonGlowStrength: 0.14,
    fogColor: 0xa9b7ba, fogDensityScale: 1.08, snowColor: 0xd7e0e1,
    hemisphereSkyColor: 0xcbd9dc, hemisphereGroundColor: 0x516169,
    hemisphereIntensity: 1.58, sunLightColor: 0xf0d6be, sunLightIntensity: 1.36,
    sunDiscColor: 0xffe6bd, sunHaloColor: 0xe6ae8c, sunElevationDeg: 5, sunOpacity: 0,
  },
  end: {
    skyZenithColor: 0x596b78, skyHorizonColor: 0x9da8aa,
    horizonGlowColor: 0xc7a995, horizonGlowStrength: 0.08,
    fogColor: 0x929fa4, fogDensityScale: 1.25, snowColor: 0xc3ced0,
    hemisphereSkyColor: 0xb9c6c9, hemisphereGroundColor: 0x404e57,
    hemisphereIntensity: 1.22, sunLightColor: 0xdcc7b3, sunLightIntensity: 1.04,
    sunDiscColor: 0xffe6bd, sunHaloColor: 0xe6ae8c, sunElevationDeg: 1, sunOpacity: 0,
  },
});

export const SUNSET_ENVIRONMENT_PROFILE = environmentProfile({
  transitionEnd: 1,
  sunTransitionEnd: 0.30,
  sunFadeStart: 0.18,
  sunFadeEnd: 0.30,
  sunAzimuthDeg: 0,
  start: {
    skyZenithColor: 0x9aa9b2, skyHorizonColor: 0xf0b17f,
    horizonGlowColor: 0xff914c, horizonGlowStrength: 0.72,
    fogColor: 0xb58c76, fogDensityScale: 1.0, snowColor: 0xf0cdaa,
    hemisphereSkyColor: 0xf2bb8b, hemisphereGroundColor: 0x77584e,
    hemisphereIntensity: 1.62, sunLightColor: 0xffa45d, sunLightIntensity: 1.72,
    sunDiscColor: 0xfff1bd, sunHaloColor: 0xff914f, sunElevationDeg: 2.20, sunOpacity: 0.90,
  },
  end: {
    // The accepted end point is dusk, not an over-saturated orange night.
    skyZenithColor: 0x53616d, skyHorizonColor: 0x7b7d82,
    horizonGlowColor: 0x9b7668, horizonGlowStrength: 0.12,
    fogColor: 0x6d7780, fogDensityScale: 1.35, snowColor: 0xaeb8bd,
    hemisphereSkyColor: 0x94a2ae, hemisphereGroundColor: 0x384650,
    hemisphereIntensity: 0.98, sunLightColor: 0x9da5ac, sunLightIntensity: 0.78,
    sunDiscColor: 0xffe6b4, sunHaloColor: 0xe98c59, sunElevationDeg: -4.50, sunOpacity: 0.78,
  },
});

export const NIGHT_ENVIRONMENT_PROFILE = environmentProfile({
  transitionEnd: 1,
  sunAzimuthDeg: 0,
  start: {
    skyZenithColor: 0x081326, skyHorizonColor: 0x182b42,
    horizonGlowColor: 0x34516d, horizonGlowStrength: 0.10,
    fogColor: 0x34495d, fogDensityScale: 1.15, snowColor: 0x879cab,
    hemisphereSkyColor: 0x607a96, hemisphereGroundColor: 0x172333,
    hemisphereIntensity: 0.68, sunLightColor: 0x9cbbe0, sunLightIntensity: 0.22,
    sunDiscColor: 0xffffff, sunHaloColor: 0x8fb5e0, sunElevationDeg: -8, sunOpacity: 0,
  },
  end: {
    skyZenithColor: 0x050d1c, skyHorizonColor: 0x122238,
    horizonGlowColor: 0x29445f, horizonGlowStrength: 0.05,
    fogColor: 0x2d4054, fogDensityScale: 1.35, snowColor: 0x758b9a,
    hemisphereSkyColor: 0x516b86, hemisphereGroundColor: 0x111c2a,
    hemisphereIntensity: 0.56, sunLightColor: 0x8ba9cf, sunLightIntensity: 0.16,
    sunDiscColor: 0xffffff, sunHaloColor: 0x8fb5e0, sunElevationDeg: -8, sunOpacity: 0,
  },
});

export const QUIET_NIGHT_ENVIRONMENT_PROFILE = environmentProfile({
  transitionEnd: 1,
  sunAzimuthDeg: 0,
  start: {
    skyZenithColor: 0x0a1729, skyHorizonColor: 0x1d3146,
    horizonGlowColor: 0x3b5972, horizonGlowStrength: 0.08,
    fogColor: 0x3a5064, fogDensityScale: 1.02, snowColor: 0x91a5b3,
    hemisphereSkyColor: 0x6a829d, hemisphereGroundColor: 0x1a2735,
    hemisphereIntensity: 0.76, sunLightColor: 0xaec7e1, sunLightIntensity: 0.30,
    sunDiscColor: 0xffffff, sunHaloColor: 0x9fc7e8, sunElevationDeg: -8, sunOpacity: 0,
  },
  end: {
    skyZenithColor: 0x0b1a2c, skyHorizonColor: 0x20384d,
    horizonGlowColor: 0x48647b, horizonGlowStrength: 0.10,
    fogColor: 0x40586b, fogDensityScale: 0.94, snowColor: 0x9aaebb,
    hemisphereSkyColor: 0x7189a2, hemisphereGroundColor: 0x1d2b39,
    hemisphereIntensity: 0.82, sunLightColor: 0xb9d0e6, sunLightIntensity: 0.34,
    sunDiscColor: 0xffffff, sunHaloColor: 0x9fc7e8, sunElevationDeg: -8, sunOpacity: 0,
  },
});

const DAY_LIGHTS = Object.freeze({ enabled: false });
const NIGHT_LIGHTS = Object.freeze({ enabled: true, groomedCourse: true, activeLightCount: 24 });
const NO_LEAD = Object.freeze({ enabled: false });
const MEETING_LEAD = Object.freeze({
  enabled: true, startProgress: 0, endProgress: 1,
  distanceAhead: 46, carveAmplitude: 4.2, carveWavelength: 240, phase: 0.35,
  departureSpeed: 42, departureDistance: 190,
});
const NIGHT_LEAD = Object.freeze({
  enabled: true, startProgress: 0, endProgress: 1,
  distanceAhead: 38, carveAmplitude: 3.6, carveWavelength: 260, phase: 0.35,
  departureSpeed: 42, departureDistance: 190,
});

export const TRACKS = Object.freeze([
  track(1, 'asa-wo-hiraku-edge', '朝をひらくエッジ', 204.72, visualProfile({
    environment: DAWN_ENVIRONMENT_PROFILE,
    weather: weatherProfile({ snowfall: 0, nearMist: 0.45, wind: 0.05 }, { snowfall: 0.20, nearMist: 0.15, wind: 0.20 }),
    priorTracks: false, leadBoarder: NO_LEAD, nightLighting: DAY_LIGHTS,
  })),
  track(2, 'shiro-wo-oiko-shite', '白を追い越して', 201.24, visualProfile({
    environment: MORNING_ENVIRONMENT_PROFILE,
    weather: weatherProfile({ snowfall: 0, nearMist: 0.08, wind: 0.15 }, { snowfall: 0, nearMist: 0.08, wind: 0.15 }),
    leadBoarder: NO_LEAD, nightLighting: DAY_LIGHTS,
  })),
  track(3, 'shiro-ni-kasanaru-kido', '白に重なる軌道', 203.28, visualProfile({
    environment: MIDDAY_ENVIRONMENT_PROFILE,
    weather: weatherProfile({ snowfall: 0, nearMist: 0.12, wind: 0.10 }, { snowfall: 0.15, nearMist: 0.12, wind: 0.10 }),
    leadBoarder: MEETING_LEAD, nightLighting: DAY_LIGHTS,
  })),
  track(4, 'kage-wo-nukeru-kokyu', '影を抜ける呼吸', 189.141333, visualProfile({
    environment: AFTERNOON_ENVIRONMENT_PROFILE,
    weather: weatherProfile({ snowfall: 0.10, nearMist: 0.20, wind: 0.10 }, { snowfall: 0.25, nearMist: 0.20, wind: 0.10 }),
    leadBoarder: NO_LEAD, nightLighting: DAY_LIGHTS,
  })),
  track(5, 'kappu-goshi-no-yuki', 'カップ越しの雪', 223.210667, visualProfile({
    environment: LODGE_APPROACH_ENVIRONMENT_PROFILE,
    // Snow begins tentatively, then accelerates into the lodge-stop blizzard.
    weather: weatherProfile({ snowfall: 0.20, nearMist: 0.25, wind: 0.10 }, { snowfall: 2.0, nearMist: 0.80, wind: 0.65 }, 'exponential'),
    leadBoarder: NO_LEAD, nightLighting: DAY_LIGHTS,
  })),
  track(6, 'kowasa-no-yoko-ni', '怖さの横に', 183.573333, visualProfile({
    environment: SUNSET_ENVIRONMENT_PROFILE,
    weather: weatherProfile({ snowfall: 1.10, nearMist: 0.72, wind: 0.50 }, { snowfall: 1.40, nearMist: 0.88, wind: 0.80 }),
    leadBoarder: NO_LEAD, nightLighting: DAY_LIGHTS,
  })),
  track(7, 'yoru-no-shirosa-wo-tsukinukeru', '夜の白さを突き抜ける', 181.578667, visualProfile({
    environment: NIGHT_ENVIRONMENT_PROFILE,
    weather: weatherProfile({ snowfall: 0.60, nearMist: 0.30, wind: 0.25 }, { snowfall: 1.0, nearMist: 0.50, wind: 0.40 }),
    leadBoarder: NIGHT_LEAD, nightLighting: NIGHT_LIGHTS,
  })),
  track(8, 'tsugi-wa-motto-chikaku-de', '次はもっと近くで', 200.56, visualProfile({
    environment: QUIET_NIGHT_ENVIRONMENT_PROFILE,
    weather: weatherProfile({ snowfall: 0.25, nearMist: 0.20, wind: 0.10 }, { snowfall: 0.10, nearMist: 0.10, wind: 0 }),
    leadBoarder: NO_LEAD, nightLighting: NIGHT_LIGHTS,
  })),
]);

export const DEFAULT_TRACK = TRACKS[0];

export function findTrack(value) {
  const requested = String(value ?? '').trim().toLowerCase();
  if (!requested) return null;
  const numeric = Number.parseInt(requested, 10);
  return TRACKS.find(item => item.id === requested)
    ?? (Number.isFinite(numeric) ? TRACKS[numeric - 1] ?? null : null);
}

export function nextTrackAfter(value) {
  const current = typeof value === 'object' ? value : findTrack(value);
  const index = TRACKS.findIndex(track => track.id === current?.id);
  if (index < 0) return null;
  return TRACKS[(index + 1) % TRACKS.length];
}

export function isFinalTrack(value) {
  const current = typeof value === 'object' ? value : findTrack(value);
  return current?.id === TRACKS[TRACKS.length - 1].id;
}

const trackQuery = typeof window === 'undefined'
  ? null
  : new URLSearchParams(window.location.search).get('track');

export let ACTIVE_TRACK = findTrack(trackQuery) ?? DEFAULT_TRACK;

export function setActiveTrack(value) {
  ACTIVE_TRACK = typeof value === 'object' && value?.id
    ? value
    : findTrack(value) ?? DEFAULT_TRACK;
  return ACTIVE_TRACK;
}
