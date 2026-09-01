import assert from 'node:assert/strict';
import {
  clampMasterVolume,
  DEFAULT_MASTER_VOLUME_VALUE,
  MASTER_VOLUME_STORAGE_KEY,
  readMasterVolume,
  writeMasterVolume,
} from '../src/volume-settings.js';

const values = new Map();
const storage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, value),
};

assert.equal(readMasterVolume(storage), DEFAULT_MASTER_VOLUME_VALUE);
assert.equal(writeMasterVolume(0.35, storage), 0.35);
assert.equal(values.get(MASTER_VOLUME_STORAGE_KEY), '0.35');
assert.equal(readMasterVolume(storage), 0.35);
assert.equal(clampMasterVolume(-2), 0);
assert.equal(clampMasterVolume(4), 1);
assert.equal(clampMasterVolume('invalid'), DEFAULT_MASTER_VOLUME_VALUE);

console.log('volume settings smoke ok');
