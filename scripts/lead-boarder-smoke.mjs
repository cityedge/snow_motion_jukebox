import assert from 'node:assert/strict';
import { COURSE } from '../src/course.js';
import {
  sampleLeadBoarderDeparture,
  sampleLeadBoarderJump,
  sampleLeadBoarderMotion,
} from '../src/lead-boarder.js';

const config = {
  enabled: true,
  startProgress: 0,
  endProgress: 1,
  distanceAhead: 46,
  carveAmplitude: 4.2,
  carveWavelength: 240,
  phase: 0.35,
};

assert.equal(sampleLeadBoarderMotion(100, 0, config).visible, true);
assert.equal(sampleLeadBoarderMotion(100, 0.5, config).visible, true);
assert.equal(sampleLeadBoarderMotion(100, 1, config).visible, true);

const departureStartS = sampleLeadBoarderMotion(100, 1, config).s;
const departureStart = sampleLeadBoarderDeparture(departureStartS, 0, config);
const departureMiddle = sampleLeadBoarderDeparture(departureStartS, 2, config);
const departureEnd = sampleLeadBoarderDeparture(departureStartS, 6, config);
assert.equal(departureStart.visible, true);
assert.ok(departureMiddle.s > departureStart.s, 'lead must continue downhill after the player stops');
assert.equal(departureEnd.visible, false, 'lead may hide only after reaching the distant vista');

for (const playerS of [12, 240, 980, 2600]) {
  const sample = sampleLeadBoarderMotion(playerS, 0.5, config);
  assert.equal(sample.s - playerS, 46, 'lead distance must remain uncatachable');
  assert.ok(Math.abs(sample.d) <= config.carveAmplitude + 0.001, 'carve must remain in bounds');
  assert.ok(sample.carve >= -1 && sample.carve <= 1, 'carve phase must be normalized');
}

// Every authored feature produces a long, visible flight rather than a short
// terrain-following hop.
let airborneSamples = 0;
let highestArc = 0;
let firstFlight = null;
for (let s = 0; s < 5000; s += 0.5) {
  const jump = sampleLeadBoarderJump(s);
  if (!jump.airborne) continue;
  firstFlight ??= { takeoffS: jump.takeoffS, landingS: jump.landingS };
  airborneSamples += 1;
  highestArc = Math.max(highestArc, jump.height);
  const expectedLength = jump.kind === 'jump' ? 72.8 : 49.4;
  const nominalPeak = jump.kind === 'jump' ? 2.8 : 1.92;
  const expectedPeak = nominalPeak * (jump.flightLength / expectedLength);
  assert.ok(jump.flightLength <= expectedLength);
  assert.ok(Math.abs(jump.peakHeight - expectedPeak) < 1e-9);
  assert.ok(Math.abs(
    jump.landingS - jump.takeoffS - jump.flightLength
  ) < 1e-9, 'flight must cover the configured distance');
  assert.ok(jump.height >= 0, 'flight height must not pass below the snow');
}
assert.ok(airborneSamples > 0, 'the generated course must exercise lead-rider flight');
assert.ok(highestArc >= 1.91, 'the flight must retain a readable but low arc');

const arcHeights = Array.from({ length: 101 }, (_, index) => {
  const u = index / 100;
  const s = firstFlight.takeoffS
    + (firstFlight.landingS - firstFlight.takeoffS) * u;
  return sampleLeadBoarderJump(s).height;
});
const apexIndex = arcHeights.indexOf(Math.max(...arcHeights));
assert.ok(apexIndex > 0 && apexIndex < arcHeights.length - 1);
for (let index = 1; index <= apexIndex; index += 1) {
  assert.ok(arcHeights[index] >= arcHeights[index - 1], 'flight may only rise before its apex');
}
for (let index = apexIndex + 1; index < arcHeights.length; index += 1) {
  assert.ok(arcHeights[index] <= arcHeights[index - 1], 'flight may only descend after its apex');
}

// A shortened flight must complete close to the snow before nearest-feature
// ownership changes. This guards against the former multi-metre vertical snap.
let verifiedShortenedFlight = false;
for (let s = 0; s < COURSE.length; s += 0.5) {
  const jump = sampleLeadBoarderJump(s);
  if (!jump.airborne || !jump.shortened) continue;
  const justBeforeLanding = sampleLeadBoarderJump(jump.landingS - 0.01);
  const justAfterLanding = sampleLeadBoarderJump(jump.landingS + 0.01);
  assert.equal(justBeforeLanding.airborne, true);
  assert.ok(justBeforeLanding.height < 0.01, 'shortened flight must descend to the snow');
  assert.equal(justAfterLanding.airborne, false, 'shortened flight must finish before hand-off');
  verifiedShortenedFlight = true;
  break;
}
assert.equal(verifiedShortenedFlight, true, 'close features must exercise shortened lead-rider flight');

console.log('lead boarder smoke test passed');
