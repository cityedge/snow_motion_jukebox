const BAR_COUNT = 64;
const GAP_TO_BAR_RATIO = 0.65;
const FRAME_INTERVAL_MS = 1000 / 30;
const FREQ_MIN = 80;
const FREQ_MAX = 12000;
const ATTACK = 0.95;
const RELEASE = 0.72;
const MIN_DB = -62;
const MAX_DB = -8;
const GAIN_DB = 9;
const BASE_CUT = 0.08;
const GAMMA = 0.78;

export class SpectrumDisplay {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.analyser = null;
    this.frequencyData = null;
    this.barLevels = new Float32Array(BAR_COUNT);
    this.binRanges = [];
    this.enabled = true;
    this.lastDrawTime = -Infinity;
    this.width = 0;
    this.height = 0;
  }

  connect(analyser) {
    this.analyser = analyser;
    this.frequencyData = new Float32Array(analyser.frequencyBinCount);
    this.binRanges = this.buildBinRanges(analyser);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.canvas.classList.toggle('disabled', !enabled);
    if (!enabled) this.clear();
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));
    if (width === this.width && height === this.height) return;
    this.width = this.canvas.width = width;
    this.height = this.canvas.height = height;
  }

  update(now, active) {
    if (!this.enabled || !this.context) return;
    if (now - this.lastDrawTime < FRAME_INTERVAL_MS) return;
    this.lastDrawTime = now;
    this.resize();

    if (!active || !this.analyser || !this.frequencyData) {
      this.clear();
      return;
    }

    this.analyser.getFloatFrequencyData(this.frequencyData);
    this.drawBars();
  }

  clear() {
    this.context?.clearRect(0, 0, this.width, this.height);
    this.barLevels.fill(0);
  }

  drawBars() {
    const ctx = this.context;
    const width = this.width;
    const height = this.height;
    ctx.clearRect(0, 0, width, height);

    const barWidth = width / (BAR_COUNT + (BAR_COUNT - 1) * GAP_TO_BAR_RATIO);
    const gap = barWidth * GAP_TO_BAR_RATIO;
    ctx.lineWidth = Math.max(1, width / 900);
    ctx.strokeStyle = 'rgba(38, 88, 113, 0.62)';
    ctx.fillStyle = 'rgba(112, 193, 224, 0.72)';

    for (let i = 0; i < BAR_COUNT; i++) {
      const [startBin, endBin] = this.binRanges[i];
      let sumPower = 0;
      for (let bin = startBin; bin < endBin; bin++) {
        // The analyser supplies dB per FFT bin. Convert back to linear power
        // before averaging so many quiet bins cannot lift an entire band.
        sumPower += Math.pow(10, this.frequencyData[bin] / 10);
      }
      const bandDb = 10 * Math.log10(sumPower / Math.max(1, endBin - startBin));
      const normalized = Math.max(
        0,
        Math.min(1, (bandDb + GAIN_DB - MIN_DB) / (MAX_DB - MIN_DB))
      );
      const cut = Math.max(0, (normalized - BASE_CUT) / (1 - BASE_CUT));
      const target = Math.pow(cut, GAMMA);
      const previous = this.barLevels[i];
      const response = target >= previous ? ATTACK : RELEASE;
      const level = previous + (target - previous) * response;
      this.barLevels[i] = level;

      const barHeight = level * height * 0.90;
      if (barHeight < 0.5) continue;
      const x = i * (barWidth + gap);
      const y = height - barHeight;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.strokeRect(x, y, barWidth, barHeight);
    }
  }

  buildBinRanges(analyser) {
    const sampleRate = analyser.context?.sampleRate ?? 48000;
    const nyquist = sampleRate * 0.5;
    const maxFrequency = Math.min(FREQ_MAX, nyquist);
    const binHz = nyquist / analyser.frequencyBinCount;
    const ratio = maxFrequency / FREQ_MIN;
    const ranges = [];

    for (let i = 0; i < BAR_COUNT; i++) {
      const startFrequency = FREQ_MIN * Math.pow(ratio, i / BAR_COUNT);
      const endFrequency = FREQ_MIN * Math.pow(ratio, (i + 1) / BAR_COUNT);
      const startBin = Math.max(
        1,
        Math.min(analyser.frequencyBinCount - 1, Math.floor(startFrequency / binHz))
      );
      const endBin = Math.max(
        startBin + 1,
        Math.min(analyser.frequencyBinCount, Math.ceil(endFrequency / binHz))
      );
      ranges.push([startBin, endBin]);
    }
    return ranges;
  }
}
