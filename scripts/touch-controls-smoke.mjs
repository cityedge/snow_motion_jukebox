import assert from 'node:assert/strict';

import { touchControlAt } from '../src/touch-controls.js';

const bounds = { left: 20, top: 40, width: 1000, height: 800 };

assert.equal(touchControlAt(500, 199, bounds), 'pause');
assert.equal(touchControlAt(500, 200, bounds), 'left');
assert.equal(touchControlAt(750, 200, bounds), 'right');
assert.equal(touchControlAt(19, 200, bounds), null);
assert.equal(touchControlAt(500, 841, bounds), null);
assert.equal(touchControlAt(0, 0, { left: 0, top: 0, width: 0, height: 800 }), null);

console.log('touch controls smoke ok');
