import assert from 'node:assert/strict';
import { environmentPhaseAt, sampleEnvironment } from '../src/environment.js';
import { DISTANT_MOUNTAIN_CONFIGS, distantMountainRidgeAt } from '../src/course.js';
import {
  ACTIVE_TRACK,
  DAWN_ENVIRONMENT_PROFILE,
  DEFAULT_TRACK,
  MIDDAY_ENVIRONMENT_PROFILE,
  NIGHT_ENVIRONMENT_PROFILE,
  SUNSET_ENVIRONMENT_PROFILE,
  TRACKS,
} from '../src/track-manifest.js';

function samples(profile) {
  return {
    start: sampleEnvironment(profile, 0),
    middle: sampleEnvironment(profile, profile.transitionEnd * 0.5),
    end: sampleEnvironment(profile, 1),
  };
}

const dawn = samples(DAWN_ENVIRONMENT_PROFILE);
assert.equal(environmentPhaseAt(DAWN_ENVIRONMENT_PROFILE, 0), 0);
assert.equal(environmentPhaseAt(DAWN_ENVIRONMENT_PROFILE, 1), 1);
assert.equal(dawn.start.sunOpacity, 0);
assert.equal(dawn.middle.sunOpacity, 0);
assert.equal(dawn.end.sunOpacity, 0);
assert.ok(dawn.middle.horizonGlowStrength < dawn.start.horizonGlowStrength);
assert.ok(dawn.middle.horizonGlowStrength > dawn.end.horizonGlowStrength);
assert.ok(dawn.middle.snowColor > dawn.start.snowColor);
assert.ok(dawn.middle.fogDensityScale < dawn.start.fogDensityScale);
assert.ok(dawn.middle.fogDensityScale > dawn.end.fogDensityScale);
assert.equal(dawn.end.fogDensityScale, 1);

const sunset = samples(SUNSET_ENVIRONMENT_PROFILE);
assert.ok(sunset.start.sunOpacity > 0.8);
assert.ok(sunset.middle.sunElevationDeg < sunset.start.sunElevationDeg);
assert.ok(Math.abs(sunset.middle.sunElevationDeg - sunset.end.sunElevationDeg) < 1e-9);
assert.ok(sunset.middle.horizonGlowStrength < sunset.start.horizonGlowStrength);
assert.ok(sunset.middle.horizonGlowStrength > sunset.end.horizonGlowStrength);
assert.ok(sunset.middle.fogDensityScale > sunset.start.fogDensityScale);
assert.ok(sunset.middle.fogDensityScale < sunset.end.fogDensityScale);
assert.ok(Math.abs(sunset.end.fogDensityScale - 1.35) < 1e-9);
assert.ok(((sunset.end.fogColor >> 16) & 0xff) < 0x90);
assert.ok(((sunset.end.fogColor >> 8) & 0xff) < 0x90);
assert.ok((sunset.end.fogColor & 0xff) < 0x90);
const sunsetAt20 = sampleEnvironment(SUNSET_ENVIRONMENT_PROFILE, 0.20);
const sunsetAt30 = sampleEnvironment(SUNSET_ENVIRONMENT_PROFILE, 0.30);
assert.ok(sunsetAt20.sunOpacity > 0);
assert.equal(sunsetAt30.sunOpacity, 0);
assert.ok(Math.abs(sunsetAt30.sunElevationDeg + 4.5) < 1e-9);

function averageColorChannel(color) {
  return (((color >> 16) & 0xff) + ((color >> 8) & 0xff) + (color & 0xff)) / 3;
}

const midday = samples(MIDDAY_ENVIRONMENT_PROFILE);
assert.ok(
  averageColorChannel(midday.start.hemisphereGroundColor) >= 160,
  'midday ground fill must keep vertical scenery from collapsing into silhouette'
);
assert.ok(
  averageColorChannel(midday.end.hemisphereGroundColor) >= 160,
  'midday ground fill must remain readable through the whole track'
);

const night = samples(NIGHT_ENVIRONMENT_PROFILE);
assert.equal(TRACKS.length, 8);
assert.equal(DEFAULT_TRACK, TRACKS[0]);
assert.equal(ACTIVE_TRACK, DEFAULT_TRACK);
assert.equal(DEFAULT_TRACK.visualProfile.environment, DAWN_ENVIRONMENT_PROFILE);
assert.equal(TRACKS[5].visualProfile.environment, SUNSET_ENVIRONMENT_PROFILE);
assert.equal(TRACKS[6].visualProfile.environment, NIGHT_ENVIRONMENT_PROFILE);
assert.equal(night.start.sunOpacity, 0);
assert.equal(night.end.sunOpacity, 0);
assert.ok(night.end.hemisphereIntensity < night.start.hemisphereIntensity);
assert.ok(night.end.fogDensityScale > night.start.fogDensityScale);
assert.equal(TRACKS[6].visualProfile.nightLighting.enabled, true);
assert.equal(TRACKS[6].visualProfile.nightLighting.activeLightCount, 24);

for (const mountain of DISTANT_MOUNTAIN_CONFIGS) {
  assert.ok(
    mountain.width >= mountain.patternWidth * 1.75,
    'distant mountain does not cover wide-screen vistas'
  );
  for (const x of [-mountain.width * 0.47, 0, mountain.width * 0.47]) {
    assert.ok(Number.isFinite(distantMountainRidgeAt(mountain, x)));
  }
}

console.log('Environment smoke test passed for dawn, midday, sunset, and night profiles.');
