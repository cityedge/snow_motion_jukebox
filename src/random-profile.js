import {
  AFTERNOON_ENVIRONMENT_PROFILE,
  DAWN_ENVIRONMENT_PROFILE,
  LODGE_APPROACH_ENVIRONMENT_PROFILE,
  MIDDAY_ENVIRONMENT_PROFILE,
  MORNING_ENVIRONMENT_PROFILE,
  NIGHT_ENVIRONMENT_PROFILE,
  QUIET_NIGHT_ENVIRONMENT_PROFILE,
  SUNSET_ENVIRONMENT_PROFILE,
} from './track-manifest.js';

function hashSeed(value) {
  const text = String(value ?? 'random-profile');
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seedInput) {
  let state = hashSeed(seedInput);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function between(rand, [minimum, maximum]) {
  return minimum + (maximum - minimum) * rand();
}

function rounded(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function weatherSample(rand, bounds) {
  return Object.freeze({
    snowfall: rounded(between(rand, bounds.snowfall)),
    nearMist: rounded(between(rand, bounds.nearMist)),
    wind: rounded(between(rand, bounds.wind)),
  });
}

function weatherProfile(rand, scenario) {
  const curves = scenario.snowfallCurves ?? ['linear'];
  return Object.freeze({
    transitionEnd: 1,
    snowfallCurve: curves[Math.floor(rand() * curves.length)],
    start: weatherSample(rand, scenario.weather.start),
    end: weatherSample(rand, scenario.weather.end),
  });
}

function leadProfile(rand, chance) {
  if (rand() >= chance) return Object.freeze({ enabled: false });
  return Object.freeze({
    enabled: true,
    startProgress: 0,
    endProgress: 1,
    distanceAhead: rounded(between(rand, [34, 58]), 1),
    carveAmplitude: rounded(between(rand, [3.0, 5.2]), 2),
    carveWavelength: rounded(between(rand, [220, 330]), 1),
    phase: rounded(between(rand, [0, Math.PI * 2]), 3),
    departureSpeed: rounded(between(rand, [38, 50]), 1),
    departureDistance: rounded(between(rand, [160, 240]), 1),
  });
}

function nightLightingProfile(rand, scenario) {
  if (!scenario.nightLights) return Object.freeze({ enabled: false });
  return Object.freeze({
    enabled: true,
    groomedCourse: true,
    activeLightCount: Math.round(between(rand, [18, 28])),
  });
}

const SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'clear-dawn', ja: '晴れた早朝', en: 'CLEAR DAWN',
    environment: DAWN_ENVIRONMENT_PROFILE, priorTrackChance: 0, leadChance: 0.16,
    weather: {
      start: { snowfall: [0, 0.12], nearMist: [0.25, 0.58], wind: [0, 0.18] },
      end: { snowfall: [0, 0.22], nearMist: [0.06, 0.24], wind: [0.05, 0.28] },
    },
  }),
  Object.freeze({
    id: 'clear-morning', ja: '澄んだ朝', en: 'CLEAR MORNING',
    environment: MORNING_ENVIRONMENT_PROFILE, priorTrackChance: 0.45, leadChance: 0.34,
    weather: {
      start: { snowfall: [0, 0.18], nearMist: [0.02, 0.20], wind: [0.02, 0.24] },
      end: { snowfall: [0, 0.28], nearMist: [0.02, 0.22], wind: [0.04, 0.30] },
    },
  }),
  Object.freeze({
    id: 'bright-midday', ja: '明るい昼の雪', en: 'BRIGHT MIDDAY SNOW',
    environment: MIDDAY_ENVIRONMENT_PROFILE, priorTrackChance: 0.64, leadChance: 0.38,
    weather: {
      start: { snowfall: [0, 0.34], nearMist: [0.03, 0.24], wind: [0.04, 0.34] },
      end: { snowfall: [0.08, 0.58], nearMist: [0.04, 0.28], wind: [0.08, 0.45] },
    },
  }),
  Object.freeze({
    id: 'cloudy-afternoon', ja: '曇り始める午後', en: 'CLOUDY AFTERNOON',
    environment: AFTERNOON_ENVIRONMENT_PROFILE, priorTrackChance: 0.70, leadChance: 0.32,
    weather: {
      start: { snowfall: [0.05, 0.40], nearMist: [0.10, 0.34], wind: [0.06, 0.36] },
      end: { snowfall: [0.22, 0.86], nearMist: [0.16, 0.48], wind: [0.15, 0.58] },
    },
  }),
  Object.freeze({
    id: 'lodge-squall', ja: 'ロッジ前の強い雪', en: 'LODGE SQUALL',
    environment: LODGE_APPROACH_ENVIRONMENT_PROFILE, priorTrackChance: 0.72, leadChance: 0.20,
    snowfallCurves: ['exponential'],
    weather: {
      start: { snowfall: [0.18, 0.62], nearMist: [0.18, 0.44], wind: [0.08, 0.38] },
      end: { snowfall: [1.25, 2.0], nearMist: [0.62, 0.92], wind: [0.58, 1.0] },
    },
  }),
  Object.freeze({
    id: 'clear-sunset', ja: '晴れた夕暮れ', en: 'CLEAR SUNSET',
    environment: SUNSET_ENVIRONMENT_PROFILE, priorTrackChance: 0.58, leadChance: 0.30,
    weather: {
      start: { snowfall: [0, 0.14], nearMist: [0.02, 0.16], wind: [0.02, 0.18] },
      end: { snowfall: [0, 0.24], nearMist: [0.03, 0.22], wind: [0.04, 0.28] },
    },
  }),
  Object.freeze({
    id: 'sunset-storm', ja: '夕暮れの荒天', en: 'SUNSET STORM',
    environment: SUNSET_ENVIRONMENT_PROFILE, priorTrackChance: 0.62, leadChance: 0.22,
    snowfallCurves: ['linear', 'exponential'],
    weather: {
      start: { snowfall: [0.28, 0.92], nearMist: [0.28, 0.62], wind: [0.20, 0.62] },
      end: { snowfall: [0.72, 1.62], nearMist: [0.55, 0.90], wind: [0.52, 1.0] },
    },
  }),
  Object.freeze({
    id: 'night-resort', ja: '雪のナイター', en: 'SNOWY NIGHT RESORT',
    environment: NIGHT_ENVIRONMENT_PROFILE, priorTrackChance: 0.82, leadChance: 0.42,
    nightLights: true,
    weather: {
      start: { snowfall: [0.18, 0.62], nearMist: [0.12, 0.38], wind: [0.08, 0.38] },
      end: { snowfall: [0.42, 1.18], nearMist: [0.22, 0.62], wind: [0.18, 0.68] },
    },
  }),
  Object.freeze({
    id: 'night-storm', ja: '荒天のナイター', en: 'STORMY NIGHT RESORT',
    environment: NIGHT_ENVIRONMENT_PROFILE, priorTrackChance: 0.86, leadChance: 0.30,
    nightLights: true,
    snowfallCurves: ['linear', 'exponential'],
    weather: {
      // Strong enough to read as bad weather under the lamps, while staying
      // below the lodge-squall whiteout range so the lit route remains legible.
      start: { snowfall: [0.46, 0.82], nearMist: [0.22, 0.46], wind: [0.24, 0.50] },
      end: { snowfall: [0.82, 1.42], nearMist: [0.42, 0.72], wind: [0.48, 0.82] },
    },
  }),
  Object.freeze({
    id: 'quiet-night', ja: '静かな夜の山', en: 'QUIET NIGHT MOUNTAIN',
    environment: QUIET_NIGHT_ENVIRONMENT_PROFILE, priorTrackChance: 0.38, leadChance: 0.26,
    weather: {
      start: { snowfall: [0, 0.34], nearMist: [0.04, 0.24], wind: [0, 0.22] },
      end: { snowfall: [0, 0.40], nearMist: [0.03, 0.20], wind: [0, 0.28] },
    },
  }),
]);

export const RANDOM_SCENARIO_SHORTCUTS = Object.freeze([
  'clear-dawn',
  'clear-morning',
  'bright-midday',
  'cloudy-afternoon',
  'lodge-squall',
  'clear-sunset',
  'sunset-storm',
  'night-resort',
  'night-storm',
  'quiet-night',
]);

export function randomScenarioIdForShortcut(value) {
  const shortcut = String(value ?? '').trim();
  return /^\d$/.test(shortcut)
    ? RANDOM_SCENARIO_SHORTCUTS[Number(shortcut)] ?? null
    : null;
}

export function normalizeRandomScenarioId(value) {
  const requested = String(value ?? '').trim();
  return SCENARIOS.some(scenario => scenario.id === requested) ? requested : null;
}

export function createRandomVisualProfile(seedInput, scenarioId = null) {
  const rand = seededRandom(`${seedInput}:visual-profile`);
  const normalizedScenarioId = normalizeRandomScenarioId(scenarioId);
  const scenario = normalizedScenarioId
    ? SCENARIOS.find(candidate => candidate.id === normalizedScenarioId)
    : SCENARIOS[Math.floor(rand() * SCENARIOS.length)];
  const priorTracks = rand() < scenario.priorTrackChance;
  return Object.freeze({
    environment: scenario.environment,
    weather: weatherProfile(rand, scenario),
    snowSurface: Object.freeze({ priorTracks }),
    leadBoarder: leadProfile(rand, scenario.leadChance),
    nightLighting: nightLightingProfile(rand, scenario),
    randomScenario: Object.freeze({
      id: scenario.id,
      ja: scenario.ja,
      en: scenario.en,
    }),
  });
}

export function createRandomStageTrack(track, seedInput, scenarioId = null) {
  return Object.freeze({
    ...track,
    seed: String(seedInput),
    visualProfile: createRandomVisualProfile(seedInput, scenarioId),
  });
}

export const RANDOM_SCENARIO_IDS = Object.freeze(SCENARIOS.map(scenario => scenario.id));
