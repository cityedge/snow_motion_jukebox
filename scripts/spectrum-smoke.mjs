import assert from 'node:assert/strict';
import { SpectrumDisplay } from '../src/spectrum.js';

globalThis.window = { devicePixelRatio: 1 };

const calls = { clear: 0, fill: 0, stroke: 0, fillRects: [] };
const context = {
  clearRect() { calls.clear++; },
  fillRect(...args) { calls.fill++; calls.fillRects.push(args); },
  strokeRect() { calls.stroke++; },
  set lineWidth(value) { this._lineWidth = value; },
  set strokeStyle(value) { this._strokeStyle = value; },
  set fillStyle(value) { this._fillStyle = value; },
};
const canvas = {
  width: 0,
  height: 0,
  classList: { toggle() {} },
  getContext: () => context,
  getBoundingClientRect: () => ({ width: 640, height: 86 }),
};
const analyser = {
  frequencyBinCount: 1024,
  value: -35,
  getFloatFrequencyData(target) {
    target.fill(this.value);
  },
};

const spectrum = new SpectrumDisplay(canvas);
spectrum.connect(analyser);
spectrum.update(0, true);
assert.equal(canvas.width, 640);
assert.equal(canvas.height, 86);
assert.equal(calls.fill, 64);
assert.equal(calls.stroke, 64);
assert.ok(spectrum.barLevels[0] > 0.6, 'spectrum attack should be immediate');
assert.ok(
  new Set(spectrum.binRanges.slice(0, 16).map(range => range.join(':'))).size >= 8,
  'lower bands should not collapse onto only a few FFT-bin ranges'
);
const [firstRect, secondRect] = calls.fillRects;
const measuredGap = secondRect[0] - (firstRect[0] + firstRect[2]);
assert.ok(
  Math.abs(measuredGap / firstRect[2] - 0.65) < 1e-6,
  'bar gap should be 65% of bar width'
);

spectrum.update(10, true);
assert.equal(calls.fill, 64, 'spectrum should be throttled below 30 fps');
spectrum.update(34, true);
assert.equal(calls.fill, 128);

analyser.value = -68;
spectrum.update(68, true);
spectrum.update(102, true);
spectrum.update(136, true);
assert.ok(spectrum.barLevels[0] < 0.02, 'spectrum release should return quickly to zero');
spectrum.update(170, true);
const fillsAfterRelease = calls.fill;
spectrum.update(204, true);
assert.equal(calls.fill, fillsAfterRelease, 'quiet bands below the noise floor should disappear');

spectrum.setEnabled(false);
spectrum.update(180, true);
const fillsBeforeDisabledUpdate = calls.fill;
spectrum.update(220, true);
assert.equal(calls.fill, fillsBeforeDisabledUpdate, 'disabled spectrum should not draw');

console.log('Spectrum smoke test passed for 64 bars at a 30 fps cap.');
