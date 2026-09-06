import assert from 'node:assert/strict';

import { Player } from '../src/player.js';
import { displayedDistance } from '../src/run-config.js';

assert.equal(displayedDistance(0), 0);
assert.equal(displayedDistance(14_000), 2_800);
assert.equal(displayedDistance(Number.NaN), 0);

const player = Object.create(Player.prototype);
player.courseS = 12;
player.resetRunStats();

player.courseS = 512;
player.recordObstacleCollision();
assert.equal(player.collisionCount, 1);
assert.equal(player.longestRunDistance, 500);

player.courseS = 712;
player.recordObstacleCollision();
assert.equal(player.collisionCount, 2);
assert.equal(player.longestRunDistance, 500);

player.courseS = 1_512;
assert.equal(player.longestRunDistance, 800);
player.captureLongestCollisionFreeDistance();
assert.equal(player.longestCollisionFreeDistance, 800);
assert.equal(displayedDistance(player.longestRunDistance), 160);

player.courseS = 12;
player.resetRunStats();
assert.equal(player.collisionCount, 0);
assert.equal(player.longestRunDistance, 0);
player.courseS = 112;
assert.equal(player.longestRunDistance, 100);

console.log('run stats smoke ok');
