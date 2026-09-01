import assert from 'node:assert/strict';
import { findTrack } from '../src/track-manifest.js';
import {
  fogLayersAt,
  nearMistPresentationAt,
  sampleWeather,
  tunnelWeatherVisibilityAt,
} from '../src/weather.js';

const profile = findTrack('05').visualProfile.weather;
const start = sampleWeather(profile, 0);
const early = sampleWeather(profile, 0.1);
const quarter = sampleWeather(profile, 0.25);
const middle = sampleWeather(profile, 0.5);
const late = sampleWeather(profile, 0.75);
const end = sampleWeather(profile, 1);

assert.equal(start.snowfall, 0.2, 'the lodge approach should begin with light snow');
assert.equal(end.snowfall, 2, 'the weather preview should end at double snow density');
assert.ok(middle.snowfall > start.snowfall && middle.snowfall < end.snowfall,
  'snow should intensify across the song');
assert.ok(early.snowfall > 0.25 && early.snowfall < 0.27,
  'exponential snowfall should begin gently');
assert.ok(quarter.snowfall > 0.37 && quarter.snowfall < 0.39,
  'exponential snowfall should remain light in the first quarter');
assert.ok(middle.snowfall > 0.68 && middle.snowfall < 0.70,
  'exponential snowfall should still be below half density at mid-song');
assert.ok(late.snowfall > 1.18 && late.snowfall < 1.20,
  'exponential snowfall should accelerate in the final quarter');
assert.ok(end.nearMist > start.nearMist, 'near-camera mist should intensify with the fog');
assert.equal(start.wind, 0.1, 'the lodge approach should begin in light crosswind');
assert.equal(end.wind, 0.65, 'the lodge approach should end in strong crosswind');
assert.ok(middle.wind > start.wind && middle.wind < end.wind, 'wind should interpolate');

const clear = fogLayersAt(0, 1, 0);
const fog50 = fogLayersAt(0.5, 1, 0);
const harshFog50 = fogLayersAt(0.5, 2.2, end.nearMist);
assert.equal(clear.distanceScale, 1, 'FOG 0 should retain the reduced baseline');
assert.ok(fog50.distanceScale < 1.15, 'stage fog should only gently increase distance fog');
assert.ok(fog50.nearMist >= 0.2, 'stage fog should visibly affect the near veil');
assert.ok(harshFog50.nearMist > 0.9, 'harsh track fog should strongly affect nearby air');
assert.ok(harshFog50.distanceScale < 1.6, 'harsh fog should preserve distant course information');

const moderateMist = nearMistPresentationAt(0.52);
const acceptedMaximum = nearMistPresentationAt(0.92);
const whiteout = nearMistPresentationAt(1);
assert.ok(moderateMist.opacity > 0.2 && moderateMist.opacity < 0.3,
  'mid-strength near fog should remain a translucent veil');
assert.deepEqual(whiteout, acceptedMaximum,
  'near fog should stop increasing at the accepted 80% gameplay frame');
assert.ok(whiteout.opacity > 0.74 && whiteout.opacity < 0.75,
  'maximum near fog should retain a little more route information');
assert.ok(whiteout.whiteness > 0.77 && whiteout.whiteness < 0.79,
  'maximum near fog should remain a restrained whiteout');

const tunnelWeather = tunnelWeatherVisibilityAt(1);
assert.equal(tunnelWeather.snowfall, 0, 'the tunnel roof should block local snowfall');
assert.equal(tunnelWeather.nearMist, 1,
  'tunnel entry should not remove the outside atmosphere visible through its exit');

console.log('weather smoke test passed');
