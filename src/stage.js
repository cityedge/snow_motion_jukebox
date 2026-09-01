// Deterministic stage generation.
//
// This module deliberately has no Three.js dependency. A song ID can later be
// substituted for the URL seed without changing the course engine.

import {
  DEFAULT_RUN_DURATION_SECONDS,
  DEFAULT_RUN_SEED,
  courseLengthForDuration,
  normalizeRunDuration,
} from './run-config.js';
import { normalizeStageMode, STAGE_MODE } from './run-mode.js';

export const STAGE_LENGTH = 1500;

export function hashSeed(value) {
  const text = String(value ?? '1080');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

export function deriveSeed(seed, label) {
  return hashSeed(`${seed}:${label}`);
}

export function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Bias a uniform random value toward 0 or 1. This is intentional: a jukebox
// stage should sometimes be very open, very enclosed, jump-heavy, or jump-light
// instead of every seed converging on the same average mountain.
function extreme01(rand) {
  const x = rand();
  if (x < 0.5) return 0.5 * Math.pow(x * 2, 1.8);
  return 1 - 0.5 * Math.pow((1 - x) * 2, 1.8);
}

function samplePiecewise(keys, s) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [s0, v0] = keys[i];
    const [s1, v1] = keys[i + 1];
    if (s <= s1) {
      const t = (s - s0) / Math.max(1e-6, s1 - s0);
      return lerp(v0, v1, t);
    }
  }
  return keys[keys.length - 1][1];
}

function headingChangeNear(keys, s, radius = 55, length = STAGE_LENGTH) {
  const a = samplePiecewise(keys, Math.max(0, s - radius));
  const b = samplePiecewise(keys, Math.min(length, s + radius));
  return Math.abs(b - a);
}

function generateHeadingKeys(rand, curve, length) {
  const keys = [[0, 0], [95, 0]];
  let s = 95;
  let heading = 0;
  let drift = (rand() - 0.5) * 5;
  const maxHeading = lerp(20, 49, curve);
  const maxStep = lerp(5, 18.5, curve);

  while (s < length - 80) {
    // Curve-heavy personalities get more frequent direction changes rather than
    // merely larger steering angles. This is what makes a CANYON run feel busy
    // without requiring a forest of obstacles to create difficulty.
    const spacing = lerp(132, 76, curve) + rand() * lerp(52, 30, curve);
    s = Math.min(length, s + spacing);

    // Correlated random walk gives long bends rather than twitchy zig-zags.
    drift = clamp(drift * 0.56 + (rand() - 0.5) * maxStep * 1.68, -maxStep, maxStep);
    heading = clamp(heading + drift, -maxHeading, maxHeading);
    keys.push([Math.round(s), heading]);
  }

  if (keys[keys.length - 1][0] !== length) {
    keys.push([length, clamp(heading * 0.72, -maxHeading, maxHeading)]);
  }
  return keys;
}

function generateGradeKeys(rand, steep, length) {
  const keys = [];
  let s = 0;
  const base = lerp(0.065, 0.145, steep);
  keys.push([0, clamp(base + (rand() - 0.5) * 0.035, 0.045, 0.20)]);

  while (s < length - 80) {
    s = Math.min(length, s + 105 + rand() * 70);
    let grade = base + (rand() - 0.5) * lerp(0.055, 0.13, steep);
    // Occasional dramatic drops, especially on steep personalities.
    if (rand() < 0.12 + steep * 0.23) grade += 0.08 + rand() * (0.08 + steep * 0.08);
    // Occasional relaxed shelf.
    if (rand() < 0.14) grade *= 0.55 + rand() * 0.20;
    keys.push([Math.round(s), clamp(grade, 0.040, 0.31)]);
  }

  if (keys[keys.length - 1][0] !== length) {
    keys.push([length, clamp(base + (rand() - 0.5) * 0.045, 0.05, 0.21)]);
  }
  return keys;
}

function generateVistas(rand, vistaTrait, length, planRand = rand) {
  // Intentionally allow 0 and 4+ vistas. The stage personality is allowed to
  // be extreme rather than averaging everything together.
  let count;
  if (vistaTrait < 0.16) count = 0;
  else if (vistaTrait > 0.86) count = 4 + (planRand() < 0.45 ? 1 : 0);
  else count = Math.max(0, Math.round(vistaTrait * 4 + (planRand() - 0.5) * 1.4));

  count = Math.round(count * (length / STAGE_LENGTH));

  const vistas = [];
  const maxAttempts = Math.max(80, Math.ceil(80 * length / STAGE_LENGTH));
  for (let attempt = 0; attempt < maxAttempts && vistas.length < count; attempt++) {
    const width = 90 + rand() * 105;
    const start = 145 + rand() * (length - 320 - width);
    const end = start + width;
    if (vistas.some(v => !(end + 55 < v.start || start - 55 > v.end))) continue;
    vistas.push({ start: Math.round(start), end: Math.round(end), feather: 38 + Math.round(rand() * 28) });
  }
  vistas.sort((a, b) => a.start - b.start);
  return vistas;
}


function rangesOverlap(a0, a1, b0, b1, margin = 0) {
  return !(a1 + margin < b0 || a0 - margin > b1);
}

function generateTunnels(
  rand,
  personality,
  archetype,
  vistas,
  headingKeysDeg,
  length,
  planRand = rand
) {
  // Tunnels are a special feature of enclosed runs, not generic decoration.
  // Open mountains almost never get one; canyon personalities get a real chance.
  const enclosure = personality.enclosure;
  if (enclosure < 0.56) return [];

  const chance = Math.min(0.78, 0.08 + enclosure * 0.52 + (archetype === 'CANYON' ? 0.22 : 0));
  if (planRand() > chance) return [];

  let count = 1;
  if (enclosure > 0.84 && planRand() < (archetype === 'CANYON' ? 0.42 : 0.22)) count = 2;
  count = Math.max(1, Math.round(count * length / STAGE_LENGTH));

  const tunnels = [];
  for (let slot = 0; slot < count; slot++) {
    for (let attempt = 0; attempt < 120; attempt++) {
      const tunnelLength = 72 + rand() * 92;
      const start = 155 + rand() * (length - 330 - tunnelLength);
      const end = start + tunnelLength;
      const mid = (start + end) * 0.5;

      if (vistas.some(v => rangesOverlap(start, end, v.start, v.end, 52))) continue;
      if (tunnels.some(t => rangesOverlap(start, end, t.start, t.end, 75))) continue;

      // A tunnel may bend, but a violent S-bend inside a roofed section is too hard
      // to read at speed and looks structurally implausible.
      const headingChange = headingChangeNear(
        headingKeysDeg,
        mid,
        Math.min(72, tunnelLength * 0.42),
        length
      );
      if (headingChange > 20.5) continue;

      tunnels.push({
        start: Math.round(start),
        end: Math.round(end),
        feather: 12,
        roofHeight: 7.8 + rand() * 3.0,
        roofArch: 1.3 + rand() * 1.9,
      });
      break;
    }
  }
  tunnels.sort((a, b) => a.start - b.start);
  return tunnels;
}

function generateTerrainFeatures(
  rand,
  personality,
  headingKeysDeg,
  tunnels = [],
  length,
  planRand = rand
) {
  const features = [];
  const densityScale = length / STAGE_LENGTH;
  const jumpCount = personality.jump < 0.10
    ? 0
    : Math.round((personality.jump * 6.3 + planRand() * 1.2) * densityScale);
  const rollerCount = personality.roller < 0.10
    ? 0
    : Math.round((personality.roller * 7.0 + planRand() * 1.5) * densityScale);

  function safeCandidate(kind) {
    for (let attempt = 0; attempt < 90; attempt++) {
      const centerS = 150 + rand() * (length - 280);
      const change = headingChangeNear(
        headingKeysDeg,
        centerS,
        kind === 'jump' ? 72 : 46,
        length
      );
      // No large air event in the middle of a hard corner or tunnel.
      if (kind === 'jump' && change > 13.5) continue;
      if (kind === 'jump' && tunnels.some(t => centerS > t.start - 34 && centerS < t.end + 34)) continue;
      if (kind === 'roller' && change > 20) continue;
      const spacing = kind === 'jump' ? 115 : 62;
      if (features.some(f => Math.abs(f.centerS - centerS) < spacing)) continue;
      return centerS;
    }
    return null;
  }

  for (let i = 0; i < jumpCount; i++) {
    const centerS = safeCandidate('jump');
    if (centerS == null) continue;
    features.push({
      kind: 'jump',
      centerS: Math.round(centerS),
      halfLength: 16 + rand() * 6,
      height: 1.65 + rand() * 0.95,
      halfWidth: 17 + rand() * 5,
    });
  }

  for (let i = 0; i < rollerCount; i++) {
    const centerS = safeCandidate('roller');
    if (centerS == null) continue;
    features.push({
      kind: 'roller',
      centerS: Math.round(centerS),
      halfLength: 9 + rand() * 4,
      height: 0.58 + rand() * 0.48,
      halfWidth: 13 + rand() * 5,
    });
  }

  features.sort((a, b) => a.centerS - b.centerS);
  return features;
}

function personalityName(p, archetype = 'FREEFORM') {
  if (archetype === 'CANYON' || (p.enclosure > 0.76 && p.curve > 0.68 && p.vista < 0.35)) {
    return 'CANYON / CARVE';
  }
  const pairs = [
    ['OPEN', p.vista],
    ['AIR', p.jump],
    ['CARVE', p.curve],
    ['WALLED', p.enclosure],
    ['FOREST', p.forest],
    ['STEEP', p.steep],
    ['ROLLERS', p.roller],
    ['MIST', p.atmosphere],
  ].sort((a, b) => b[1] - a[1]);
  return `${pairs[0][0]} / ${pairs[1][0]}`;
}

export function generateStage(seedInput = '1080', options = {}) {
  const seedLabel = String(seedInput || '1080');
  const seed = hashSeed(seedLabel);
  const profileSeedLabel = String(options.profileSeed || seedLabel);
  const profileSeed = hashSeed(profileSeedLabel);
  const splitProfileAndLayout = profileSeed !== seed;
  const requestedLength = Number(options.length ?? STAGE_LENGTH);
  const length = Number.isFinite(requestedLength)
    ? Math.max(STAGE_LENGTH, Math.round(requestedLength))
    : STAGE_LENGTH;
  const randPersonality = seededRandom(deriveSeed(profileSeed, 'personality'));

  const personality = {
    vista: extreme01(randPersonality),
    jump: extreme01(randPersonality),
    curve: extreme01(randPersonality),
    enclosure: extreme01(randPersonality),
    forest: extreme01(randPersonality),
    steep: extreme01(randPersonality),
    roller: extreme01(randPersonality),
    // Atmospheric haze is generated from its own sub-seed below so adding this
    // trait does not reshuffle the existing mountain personality for old seeds.
    atmosphere: 0,
    // Obstacles are intentionally a separate trait from forest scenery. A dense
    // forest can live on the banks while the actual riding line stays readable.
    obstacles: 0.14 + extreme01(randPersonality) * 0.54,
  };

  // Atmosphere is deliberately independent from vista/enclosure. A wide-open
  // mountain can be crystal clear or heavily hazed, and a canyon can be either.
  // A derived seed keeps atmosphere independent from the terrain personality.
  const atmosphereRand = seededRandom(deriveSeed(profileSeed, 'atmosphere'));
  personality.atmosphere = extreme01(atmosphereRand);

  // About one seed in five is pushed toward a genuine canyon personality:
  // frequent bends, close banks, few/no vistas and fewer physical obstacles.
  // The rest remain free-form so OPEN, AIR, FOREST, etc. can still be extreme.
  const archetypeRand = seededRandom(deriveSeed(profileSeed, 'archetype'));
  const archetype = archetypeRand() < 0.20 ? 'CANYON' : 'FREEFORM';
  if (archetype === 'CANYON') {
    personality.curve = Math.max(personality.curve, 0.78 + archetypeRand() * 0.18);
    personality.enclosure = Math.max(personality.enclosure, 0.82 + archetypeRand() * 0.16);
    personality.vista *= 0.12 + archetypeRand() * 0.13;
    personality.jump *= 0.45 + archetypeRand() * 0.30;
    personality.obstacles *= 0.30 + archetypeRand() * 0.20;
  }

  const terrainRand = seededRandom(deriveSeed(seed, 'terrain'));
  const headingKeysDeg = generateHeadingKeys(terrainRand, personality.curve, length);
  const gradeKeys = generateGradeKeys(terrainRand, personality.steep, length);
  const vistasRand = seededRandom(deriveSeed(seed, 'vistas'));
  const vistas = generateVistas(
    vistasRand,
    personality.vista,
    length,
    splitProfileAndLayout
      ? seededRandom(deriveSeed(profileSeed, 'vistas'))
      : vistasRand
  );
  // Keep the legacy 'caves' seed namespace so existing URL seeds preserve
  // the same tunnel locations after the terminology cleanup.
  const tunnelsRand = seededRandom(deriveSeed(seed, 'caves'));
  const tunnels = generateTunnels(
    tunnelsRand,
    personality,
    archetype,
    vistas,
    headingKeysDeg,
    length,
    splitProfileAndLayout
      ? seededRandom(deriveSeed(profileSeed, 'caves'))
      : tunnelsRand
  );
  const featuresRand = seededRandom(deriveSeed(seed, 'features'));
  const terrainFeatures = generateTerrainFeatures(
    featuresRand,
    personality,
    headingKeysDeg,
    tunnels,
    length,
    splitProfileAndLayout
      ? seededRandom(deriveSeed(profileSeed, 'features'))
      : featuresRand
  );

  const wallRand = seededRandom(deriveSeed(seed, 'walls'));
  const wall = {
    leftPhaseA: wallRand() * Math.PI * 2,
    leftPhaseB: wallRand() * Math.PI * 2,
    rightPhaseA: wallRand() * Math.PI * 2,
    rightPhaseB: wallRand() * Math.PI * 2,
    asymmetry: (wallRand() - 0.5) * 5.0,
    // Enclosed seeds now get materially closer banks. The playable centre stays
    // wide enough to carve, but ignoring a hard bend can genuinely put you into
    // the wall rather than merely toward a distant background slope.
    baseShoulder: lerp(24.5, 8.6, personality.enclosure),
    strength: lerp(0.32, 1.12, personality.enclosure),
  };

  return {
    version: 5,
    seed,
    seedLabel,
    profileSeed,
    profileSeedLabel,
    archetype,
    name: personalityName(personality, archetype),
    length,
    startHeight: 310,
    renderHalfWidth: 68,
    personality,
    headingKeysDeg,
    gradeKeys,
    vistas,
    tunnels,
    terrainFeatures,
    wall,
    scenery: {
      // Visual forest density and collision-hazard density are deliberately
      // separate. This keeps the mountain alive without turning every run into
      // obstacle slalom.
      sideTreeScale: lerp(0.62, 1.34, personality.forest),
      nearTreeScale: lerp(0.72, 1.08, personality.obstacles),
      nearTreeBias: lerp(0.12, 0.25, personality.obstacles),
      rockScale: lerp(0.50, 0.92, personality.obstacles),
    },
    seeds: {
      trees: deriveSeed(seed, 'trees'),
      rocks: deriveSeed(seed, 'rocks'),
      farForest: deriveSeed(seed, 'far-forest'),
      snowMarks: deriveSeed(seed, 'snow-marks'),
    },
  };
}


export function tunnelAmountAt(s, stage = ACTIVE_STAGE) {
  let amount = 0;
  for (const tunnel of stage.tunnels || []) {
    const feather = tunnel.feather ?? 12;
    if (s < tunnel.start - feather || s > tunnel.end + feather) continue;
    const enter = clamp((s - (tunnel.start - feather)) / Math.max(1, feather), 0, 1);
    const exit = clamp(((tunnel.end + feather) - s) / Math.max(1, feather), 0, 1);
    amount = Math.max(amount, Math.min(enter, exit));
  }
  return amount;
}

export function isTunnelAt(s, margin = 0, stage = ACTIVE_STAGE) {
  return (stage.tunnels || []).some(
    tunnel => s >= tunnel.start - margin && s <= tunnel.end + margin
  );
}

const params = new URLSearchParams(globalThis.location?.search || '');
export const ACTIVE_STAGE_MODE = normalizeStageMode(params.get('mode'));
export const ACTIVE_RUN_DURATION_SECONDS = normalizeRunDuration(
  params.get('duration'),
  DEFAULT_RUN_DURATION_SECONDS
);
const activeLayoutSeed = params.get('seed') || DEFAULT_RUN_SEED;
const activeProfileSeed = ACTIVE_STAGE_MODE === STAGE_MODE.RANDOM
  ? activeLayoutSeed
  : DEFAULT_RUN_SEED;
export const ACTIVE_STAGE = generateStage(activeLayoutSeed, {
  profileSeed: activeProfileSeed,
  length: courseLengthForDuration(ACTIVE_RUN_DURATION_SECONDS),
});
