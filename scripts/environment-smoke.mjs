import assert from 'node:assert/strict';
import {
  clearSkyPresentationAt,
  environmentPhaseAt,
  sampleEnvironment,
} from '../src/environment.js';
import { DISTANT_MOUNTAIN_CONFIGS, distantMountainRidgeAt } from '../src/course.js';
import { DISTANT_SUN_DISTANCE, distantSunLocalPosition } from '../src/scenery.js';
import {
  fogLayersAt,
  nearMistPresentationAt,
} from '../src/weather.js';
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

const clearMiddaySky = clearSkyPresentationAt(
  midday.middle,
  { snowfall: 0, nearMist: 0.05 },
  0.01
);
assert.ok(clearMiddaySky.amount > 0.85, 'clear midday must produce a strong blue-sky correction');
assert.ok(
  (clearMiddaySky.skyZenithColor & 0xff) > ((clearMiddaySky.skyZenithColor >> 16) & 0xff),
  'clear midday zenith must be visibly bluer than red'
);
const overcastMiddaySky = clearSkyPresentationAt(
  midday.middle,
  { snowfall: 0.05, nearMist: 0.05 },
  0.05
);
assert.ok(overcastMiddaySky.amount < 0.05, 'light snowfall must end the blue-sky window quickly');
assert.ok(overcastMiddaySky.overcastAmount > 0.85, 'light snowfall must produce bright overcast');
const overcastZenithRed = (overcastMiddaySky.skyZenithColor >> 16) & 0xff;
const overcastZenithGreen = (overcastMiddaySky.skyZenithColor >> 8) & 0xff;
const overcastZenithBlue = overcastMiddaySky.skyZenithColor & 0xff;
assert.ok(
  Math.max(overcastZenithRed, overcastZenithGreen, overcastZenithBlue)
    - Math.min(overcastZenithRed, overcastZenithGreen, overcastZenithBlue) < 24,
  'overcast sky must be neutral rather than blue-grey'
);
assert.ok(
  (overcastZenithRed + overcastZenithGreen + overcastZenithBlue) / 3 > 190,
  'overcast sky must retain daylight brightness'
);
const mistyMiddaySky = clearSkyPresentationAt(
  midday.middle,
  { snowfall: 0, nearMist: 0.18 },
  0.12
);
assert.ok(mistyMiddaySky.amount < 0.05, 'a modest rise in FOG must end blue sky quickly');
assert.ok(mistyMiddaySky.overcastAmount > 0.85, 'moderate FOG must produce bright overcast');

const trackThreeStartFog = fogLayersAt(0.80, midday.start.fogDensityScale, 0.12);
const trackThreeStartMist = nearMistPresentationAt(trackThreeStartFog.nearMist);
const trackThreeStartSky = clearSkyPresentationAt(
  midday.start,
  { snowfall: 0, nearMist: 0.12 },
  trackThreeStartMist.opacity
);
assert.ok(
  trackThreeStartSky.overcastAmount > 0.85,
  'Track 3 FOG 80 start must read as bright overcast rather than a grey storm'
);
assert.ok(
  averageColorChannel(trackThreeStartSky.skyZenithColor) > 190,
  'Track 3 FOG 80 start must retain a bright daytime sky'
);
assert.equal(
  clearSkyPresentationAt(midday.middle, { snowfall: 0.5, nearMist: 0.05 }, 0.05).amount,
  0,
  'snowfall must suppress blue sky'
);
const stormMiddaySky = clearSkyPresentationAt(
  midday.middle,
  { snowfall: 0.5, nearMist: 0.05 },
  0.05
);
const stormChannels = [
  (stormMiddaySky.skyZenithColor >> 16) & 0xff,
  (stormMiddaySky.skyZenithColor >> 8) & 0xff,
  stormMiddaySky.skyZenithColor & 0xff,
];
assert.ok(
  Math.max(...stormChannels) - Math.min(...stormChannels) < 22,
  'severe daytime weather must end at neutral grey'
);
assert.equal(
  clearSkyPresentationAt(midday.middle, { snowfall: 0, nearMist: 0.6 }, 0.6).amount,
  0,
  'thick fog must suppress blue sky'
);

const clearDawnStart = clearSkyPresentationAt(dawn.start, { snowfall: 0, nearMist: 0 }, 0);
const clearDawnEnd = clearSkyPresentationAt(dawn.end, { snowfall: 0, nearMist: 0 }, 0);
assert.equal(clearDawnStart.amount, 0, 'dawn must retain its sunrise color at the start');
assert.ok(clearDawnEnd.amount > 0.5, 'a clear dawn must resolve toward blue after the glow fades');
assert.ok(
  clearSkyPresentationAt(dawn.end, { snowfall: 0.20, nearMist: 0.15 }, 0.35).amount < 0.03,
  'the authored snowy dawn must retain its existing muted sky'
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
assert.equal(
  clearSkyPresentationAt(sunset.middle, { snowfall: 0, nearMist: 0 }, 0).amount,
  0,
  'sunset must not be recolored as daytime blue sky'
);
assert.equal(
  clearSkyPresentationAt(night.middle, { snowfall: 0, nearMist: 0 }, 0).amount,
  0,
  'night must never receive a blue-sky correction'
);

for (const mountain of DISTANT_MOUNTAIN_CONFIGS) {
  assert.ok(mountain.radius >= 700, 'distant mountain ring is too close for far-scene fog');
  const circumference = mountain.radius * Math.PI * 2;
  for (const arc of [0, circumference * 0.25, circumference * 0.5, circumference * 0.75]) {
    assert.ok(Number.isFinite(distantMountainRidgeAt(mountain, arc)));
  }
  assert.ok(
    Math.abs(
      distantMountainRidgeAt(mountain, 0)
      - distantMountainRidgeAt(mountain, circumference)
    ) < 1e-9,
    '360-degree mountain ridge must close without a visible seam'
  );
}

for (const azimuth of [-Math.PI, -1.2, 0, 0.9, Math.PI]) {
  const sun = distantSunLocalPosition(azimuth, 2.2);
  assert.ok(
    Math.abs(Math.hypot(sun.x, sun.z) - DISTANT_SUN_DISTANCE) < 1e-9,
    'sun must stay on the outside of the distant mountain rings'
  );
  assert.ok(
    Math.abs(Math.atan2(sun.x, sun.z) - azimuth) < 1e-9,
    'sun billboard must preserve its world azimuth instead of following steering'
  );
}

console.log('Environment smoke test passed for dawn, midday, sunset, and night profiles.');
