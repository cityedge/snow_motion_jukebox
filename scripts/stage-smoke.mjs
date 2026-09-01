import assert from 'node:assert/strict';
import { generateStage } from '../src/stage.js';
import {
  DEFAULT_RUN_DURATION_SECONDS,
  MAX_RIDE_SPEED,
  WORLD_TIME_SCALE,
  courseLengthForDuration,
  normalizeRunDuration,
} from '../src/run-config.js';

assert.equal(normalizeRunDuration(null), DEFAULT_RUN_DURATION_SECONDS);
assert.equal(normalizeRunDuration(''), DEFAULT_RUN_DURATION_SECONDS);

const seeds = [
  '1080',
  '64',
  '1998',
  '842299840',
  '843019908',
  '869038312',
  '16',
  ...Array.from({ length: 300 }, (_, i) => String(i)),
];

function overlaps(a0, a1, b0, b1, margin = 0) {
  return !(a1 + margin < b0 || a0 - margin > b1);
}

for (const seed of seeds) {
  const stage = generateStage(seed);
  const repeat = generateStage(seed);

  assert.deepEqual(repeat, stage, `seed ${seed} is not deterministic`);
  assert.equal(stage.length, 1500);
  assert.ok(stage.renderHalfWidth >= 60);
  assert.ok(stage.personality.atmosphere >= 0 && stage.personality.atmosphere <= 1);

  let previousS = -Infinity;
  for (const [s, headingDeg] of stage.headingKeysDeg) {
    assert.ok(s >= previousS, `seed ${seed}: heading keys are not sorted`);
    assert.ok(Math.abs(headingDeg) <= 55, `seed ${seed}: heading exceeds safety envelope`);
    previousS = s;
  }

  previousS = -Infinity;
  for (const [s, grade] of stage.gradeKeys) {
    assert.ok(s >= previousS, `seed ${seed}: grade keys are not sorted`);
    assert.ok(grade >= 0.04 && grade <= 0.31, `seed ${seed}: grade outside clamp`);
    previousS = s;
  }

  for (const tunnel of stage.tunnels) {
    assert.ok(tunnel.start > 0 && tunnel.end < stage.length);
    assert.ok(tunnel.end > tunnel.start);
    for (const vista of stage.vistas) {
      assert.ok(
        !overlaps(tunnel.start, tunnel.end, vista.start, vista.end, 0),
        `seed ${seed}: tunnel overlaps vista`
      );
    }
  }

  for (const feature of stage.terrainFeatures) {
    assert.ok(feature.centerS > 0 && feature.centerS < stage.length);
    if (feature.kind === 'jump') {
      for (const tunnel of stage.tunnels) {
        assert.ok(
          feature.centerS <= tunnel.start - 34 || feature.centerS >= tunnel.end + 34,
          `seed ${seed}: jump is too close to tunnel`
        );
      }
    }
  }
}

const durationCases = [188.572, 210, 240];
for (const duration of durationCases) {
  const length = courseLengthForDuration(duration);
  const stage = generateStage(`duration-${duration}`, { length });
  const repeat = generateStage(`duration-${duration}`, { length });

  assert.deepEqual(repeat, stage, `duration ${duration}: long stage is not deterministic`);
  assert.equal(stage.length, length);
  assert.ok(
    stage.length > duration * WORLD_TIME_SCALE * MAX_RIDE_SPEED,
    `duration ${duration}: course cannot cover maximum possible travel`
  );
  assert.equal(stage.headingKeysDeg.at(-1)[0], length);
  assert.equal(stage.gradeKeys.at(-1)[0], length);

  for (const collection of [stage.vistas, stage.tunnels]) {
    for (const feature of collection) {
      assert.ok(feature.start > 0 && feature.end < length);
      assert.ok(feature.end > feature.start);
    }
  }
  for (const feature of stage.terrainFeatures) {
    assert.ok(feature.centerS > 0 && feature.centerS < length);
  }
}

const fixedProfileA = generateStage('layout-a', { profileSeed: 'track-profile' });
const fixedProfileB = generateStage('layout-b', { profileSeed: 'track-profile' });
const fixedProfileARepeat = generateStage('layout-a', { profileSeed: 'track-profile' });
assert.deepEqual(fixedProfileARepeat, fixedProfileA, 'split profile/layout stage is not deterministic');
assert.deepEqual(fixedProfileA.personality, fixedProfileB.personality);
assert.equal(fixedProfileA.archetype, fixedProfileB.archetype);
assert.equal(fixedProfileA.name, fixedProfileB.name);
assert.equal(fixedProfileA.vistas.length, fixedProfileB.vistas.length);
assert.equal(fixedProfileA.tunnels.length, fixedProfileB.tunnels.length);
assert.equal(fixedProfileA.terrainFeatures.length, fixedProfileB.terrainFeatures.length);
assert.notDeepEqual(fixedProfileA.headingKeysDeg, fixedProfileB.headingKeysDeg);
assert.notDeepEqual(fixedProfileA.gradeKeys, fixedProfileB.gradeKeys);
assert.notEqual(fixedProfileA.seeds.trees, fixedProfileB.seeds.trees);
assert.notEqual(fixedProfileA.seeds.rocks, fixedProfileB.seeds.rocks);

console.log(
  `Stage smoke test passed for ${seeds.length} legacy seeds and `
  + `${durationCases.length} variable-length runs.`
);
