import assert from 'node:assert/strict';

import { MENU_AUDIO_TIMING } from '../src/menu-audio.js';
import { TRACKS } from '../src/track-manifest.js';

const playbackPoints = [53.370, 44.690, 44.280, 48.200, 51.790, 37.870, 36.890, 46.760];

assert.equal(playbackPoints.length, TRACKS.length);
playbackPoints.forEach((point, index) => {
  const track = TRACKS[index];
  assert.equal(point, track.previewPointSeconds);
  assert.ok(track.previewPointSeconds - MENU_AUDIO_TIMING.previewLeadInSeconds >= 0);
  assert.ok(track.previewPointSeconds + 10 < track.durationSeconds);
});

assert.equal(MENU_AUDIO_TIMING.ambientVolume, 0);
assert.equal(MENU_AUDIO_TIMING.previewVolume, 0.88);
assert.equal(MENU_AUDIO_TIMING.fadeDurationMs, 500);
assert.equal(MENU_AUDIO_TIMING.previewDurationMs, 10_000);
assert.equal(MENU_AUDIO_TIMING.previewLeadInSeconds, 0.5);

console.log('menu audio smoke ok');
