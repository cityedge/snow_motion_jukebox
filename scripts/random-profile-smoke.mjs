import assert from 'node:assert/strict';

import {
  createRandomStageTrack,
  createRandomVisualProfile,
  normalizeRandomScenarioId,
  RANDOM_SCENARIO_SHORTCUTS,
  RANDOM_SCENARIO_IDS,
  randomScenarioIdForShortcut,
} from '../src/random-profile.js';
import { TRACKS } from '../src/track-manifest.js';

const seenScenarios = new Set();
const seenLeadStates = new Set();
const seenTrackStates = new Set();
const seenLightCounts = new Set();
const litScenarioIds = new Set(['night-resort', 'night-storm']);

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
  if (litScenarioIds.has(profile.randomScenario.id)) {
    assert.equal(profile.nightLighting.enabled, true);
    assert.equal(profile.nightLighting.groomedCourse, true);
    assert.ok(profile.nightLighting.activeLightCount >= 18);
    assert.ok(profile.nightLighting.activeLightCount <= 28);
    seenLightCounts.add(profile.nightLighting.activeLightCount);
  } else {
    assert.equal(profile.nightLighting.enabled, false);
  }
  if (profile.randomScenario.id === 'clear-sunset') {
    assert.ok(profile.weather.start.snowfall <= 0.14);
    assert.ok(profile.weather.end.nearMist <= 0.22);
    assert.ok(profile.weather.end.wind <= 0.28);
  }
  if (profile.randomScenario.id === 'night-storm') {
    assert.ok(profile.weather.start.snowfall >= 0.46);
    assert.ok(profile.weather.end.snowfall >= 0.82);
    assert.ok(profile.weather.end.nearMist >= 0.42);
    assert.ok(profile.weather.end.wind >= 0.48);
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

assert.equal(RANDOM_SCENARIO_SHORTCUTS.length, 10);
RANDOM_SCENARIO_SHORTCUTS.forEach((scenarioId, shortcut) => {
  assert.equal(randomScenarioIdForShortcut(shortcut), scenarioId);
  assert.equal(normalizeRandomScenarioId(scenarioId), scenarioId);
  const forced = createRandomVisualProfile(`forced-scenario-${shortcut}`, scenarioId);
  assert.equal(forced.randomScenario.id, scenarioId);
});
assert.equal(randomScenarioIdForShortcut('x'), null);
assert.equal(normalizeRandomScenarioId('not-a-scenario'), null);

const sourceTrack = TRACKS[2];
const randomTrack = createRandomStageTrack(sourceTrack, 'derived-track-smoke');
assert.equal(randomTrack.id, sourceTrack.id);
assert.equal(randomTrack.audioUrl, sourceTrack.audioUrl);
assert.equal(randomTrack.subtitlesUrl, sourceTrack.subtitlesUrl);
assert.equal(randomTrack.durationSeconds, sourceTrack.durationSeconds);
assert.equal(randomTrack.seed, 'derived-track-smoke');
assert.notEqual(randomTrack.visualProfile, sourceTrack.visualProfile);
const forcedTrack = createRandomStageTrack(sourceTrack, 'forced-track-smoke', 'night-storm');
assert.equal(forcedTrack.visualProfile.randomScenario.id, 'night-storm');

console.log('random profile smoke ok');
