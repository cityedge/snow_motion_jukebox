import assert from 'node:assert/strict';

import {
  createRandomStageTrack,
  createRandomVisualProfile,
  RANDOM_SCENARIO_IDS,
} from '../src/random-profile.js';
import { TRACKS } from '../src/track-manifest.js';

const seenScenarios = new Set();
const seenLeadStates = new Set();
const seenTrackStates = new Set();
const seenLightCounts = new Set();

for (let index = 0; index < 4000; index += 1) {
  const seed = `random-profile-smoke-${index}`;
  const profile = createRandomVisualProfile(seed);
  const repeated = createRandomVisualProfile(seed);
  assert.deepEqual(profile, repeated);
  assert.ok(Object.isFrozen(profile));
  assert.ok(RANDOM_SCENARIO_IDS.includes(profile.randomScenario.id));
  seenScenarios.add(profile.randomScenario.id);
  seenLeadStates.add(profile.leadBoarder.enabled);
  seenTrackStates.add(profile.snowSurface.priorTracks);

  for (const sample of [profile.weather.start, profile.weather.end]) {
    assert.ok(sample.snowfall >= 0 && sample.snowfall <= 2);
    assert.ok(sample.nearMist >= 0 && sample.nearMist <= 0.92);
    assert.ok(sample.wind >= 0 && sample.wind <= 1);
  }

  if (profile.randomScenario.id === 'clear-dawn') {
    assert.equal(profile.snowSurface.priorTracks, false);
  }
  if (profile.randomScenario.id === 'night-resort') {
    assert.equal(profile.nightLighting.enabled, true);
    assert.equal(profile.nightLighting.groomedCourse, true);
    assert.ok(profile.nightLighting.activeLightCount >= 18);
    assert.ok(profile.nightLighting.activeLightCount <= 28);
    seenLightCounts.add(profile.nightLighting.activeLightCount);
  } else {
    assert.equal(profile.nightLighting.enabled, false);
  }
  if (profile.leadBoarder.enabled) {
    assert.ok(profile.leadBoarder.distanceAhead >= 34 && profile.leadBoarder.distanceAhead <= 58);
    assert.ok(profile.leadBoarder.carveAmplitude >= 3 && profile.leadBoarder.carveAmplitude <= 5.2);
  }
}

assert.deepEqual([...seenScenarios].sort(), [...RANDOM_SCENARIO_IDS].sort());
assert.deepEqual([...seenLeadStates].sort(), [false, true]);
assert.deepEqual([...seenTrackStates].sort(), [false, true]);
assert.ok(seenLightCounts.size >= 8);

const sourceTrack = TRACKS[2];
const randomTrack = createRandomStageTrack(sourceTrack, 'derived-track-smoke');
assert.equal(randomTrack.id, sourceTrack.id);
assert.equal(randomTrack.audioUrl, sourceTrack.audioUrl);
assert.equal(randomTrack.subtitlesUrl, sourceTrack.subtitlesUrl);
assert.equal(randomTrack.durationSeconds, sourceTrack.durationSeconds);
assert.equal(randomTrack.seed, 'derived-track-smoke');
assert.notEqual(randomTrack.visualProfile, sourceTrack.visualProfile);

console.log('random profile smoke ok');
