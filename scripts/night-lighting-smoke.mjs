import assert from 'node:assert/strict';
import { COURSE } from '../src/course.js';
import { generateStage } from '../src/stage.js';
import {
  isNightLightStationAllowed,
  nightLightActiveStations,
  nightLightSideAt,
  nightLightStationLayout,
} from '../src/night-lighting.js';

const config = { spacing: 34, stationCount: 24 };
for (const courseS of [0, 100, COURSE.length * 0.5, COURSE.length - 1]) {
  const stations = nightLightStationLayout(courseS, config);
  assert.equal(stations.length, config.stationCount);
  assert.ok(stations[0] >= 2);
  assert.ok(stations.at(-1) <= COURSE.length - 2);
  for (let i = 1; i < stations.length; i++) {
    assert.equal(stations[i] - stations[i - 1], config.spacing);
  }
}

const middle = COURSE.length * 0.5;
const middleStations = nightLightStationLayout(middle, config);
const active = nightLightActiveStations(middle, middleStations, 24);
assert.equal(active.length, 24);
assert.ok(active[0] <= middle);
assert.ok(middle - active[0] < config.spacing);
assert.equal(nightLightSideAt(2, config.spacing), -1);
assert.equal(nightLightSideAt(2 + config.spacing * 9, config.spacing), -1);
assert.equal(nightLightSideAt(2 + config.spacing * 10, config.spacing), 1);
assert.equal(nightLightSideAt(2 + config.spacing * 20, config.spacing), -1);

let tunnelStage = null;
for (let seed = 0; seed < 1000 && !tunnelStage; seed += 1) {
  const candidate = generateStage(`night-tunnel-${seed}`);
  if (candidate.tunnels.length > 0) tunnelStage = candidate;
}
assert.ok(tunnelStage, 'expected to find a deterministic tunnel seed');
const tunnel = tunnelStage.tunnels[0];
assert.equal(isNightLightStationAllowed((tunnel.start + tunnel.end) * 0.5, tunnelStage), false);
assert.equal(isNightLightStationAllowed(tunnel.start - 5, tunnelStage), false);
assert.equal(isNightLightStationAllowed(tunnel.start - 20, tunnelStage), true);

console.log('night lighting smoke: ok');
