import assert from 'node:assert/strict';

import { createRandomStageSeed, normalizeStageMode, STAGE_MODE } from '../src/run-mode.js';

assert.equal(normalizeStageMode('random'), STAGE_MODE.RANDOM);
assert.equal(normalizeStageMode('authored'), STAGE_MODE.AUTHORED);
assert.equal(normalizeStageMode('anything-else'), STAGE_MODE.AUTHORED);
assert.equal(normalizeStageMode(null), STAGE_MODE.AUTHORED);

const fakeCrypto = {
  getRandomValues(values) {
    values[0] = 0x0123abcd;
    values[1] = 0xfedc9876;
    return values;
  },
};

assert.equal(
  createRandomStageSeed('03-shiro-ni-kasanaru-kido', fakeCrypto),
  'random-03-shiro-ni-kasanaru-kido-0123abcdfedc9876'
);

console.log('run mode smoke ok');
