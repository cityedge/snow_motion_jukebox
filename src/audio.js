import { tunnelAmountAt } from './stage.js';
import { clampMasterVolume } from './volume-settings.js';

const clamp01 = value => Math.max(0, Math.min(1, value));

/** Procedural wind/ride audio with explicit stereo tunnel reflections. */
export class RideAudio {
  constructor(masterVolume = 1) {
    this.masterVolume = clampMasterVolume(masterVolume);
    this.ctx = null;
    this.master = null;
    this.dryBus = null;

    this.windGain = null;
    this.windFilter = null;
    this.rideGain = null;
    this.rideFilter = null;

    this.tunnelInput = null;
    this.tunnelBoost = null;
    this.tunnelTaps = [];

    this.lastLanding = 0;
    this.lastCollision = 0;
    this.nextFlutterTime = 0;
    this.musicActive = false;
    this.musicElement = null;
    this.musicSource = null;
    this.musicAnalyser = null;
    this.musicGain = null;
    this.paused = false;
  }

  activate() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) this.build(new AudioCtx());
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  build(ctx) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = (this.musicActive ? 0.38 : 0.58) * this.masterVolume;
    this.master.connect(ctx.destination);

    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 1;
    this.dryBus.connect(this.master);

    this.tunnelInput = ctx.createGain();
    this.tunnelBoost = ctx.createGain();
    this.tunnelBoost.gain.value = 0;
    this.tunnelInput.connect(this.tunnelBoost).connect(this.master);

    // Asymmetric slapback taps make the tunnel read as a stereo enclosure.
    // Later reflections invert phase to add a hollow side-to-side character.
    const tapDefs = [
      { delay: 0.052, pan: -0.92, phase: 1, cutoff: 1750, level: 0.72 },
      { delay: 0.083, pan: 0.92, phase: 1, cutoff: 1500, level: 0.62 },
      { delay: 0.154, pan: -0.68, phase: -1, cutoff: 1150, level: 0.38 },
      { delay: 0.226, pan: 0.70, phase: -1, cutoff: 930, level: 0.28 },
    ];

    for (const def of tapDefs) {
      const delay = ctx.createDelay(0.45);
      delay.delayTime.value = def.delay;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = def.cutoff;
      filter.Q.value = 0.55;

      const phase = ctx.createGain();
      phase.gain.value = def.phase;

      const pan = ctx.createStereoPanner();
      pan.pan.value = def.pan;

      const wet = ctx.createGain();
      wet.gain.value = 0;

      this.tunnelInput
        .connect(delay)
        .connect(filter)
        .connect(phase)
        .connect(pan)
        .connect(wet)
        .connect(this.master);

      this.tunnelTaps.push({
        delay,
        wet,
        baseDelay: def.delay,
        level: def.level,
      });
    }

    const windBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const windData = windBuffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < windData.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.025 * white) / 1.025;
      windData[i] = Math.max(-1, Math.min(1, brown * 3.7));
    }

    const rideBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const rideData = rideBuffer.getChannelData(0);
    for (let i = 0; i < rideData.length; i++) {
      rideData[i] = Math.random() * 2 - 1;
    }

    const wind = ctx.createBufferSource();
    wind.buffer = windBuffer;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 430;
    this.windFilter.Q.value = 0.45;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain);
    this.windGain.connect(this.dryBus);
    this.windGain.connect(this.tunnelInput);
    wind.start();

    const ride = ctx.createBufferSource();
    ride.buffer = rideBuffer;
    ride.loop = true;
    this.rideFilter = ctx.createBiquadFilter();
    this.rideFilter.type = 'bandpass';
    this.rideFilter.frequency.value = 850;
    this.rideFilter.Q.value = 0.52;
    this.rideGain = ctx.createGain();
    this.rideGain.gain.value = 0;
    ride.connect(this.rideFilter).connect(this.rideGain);
    this.rideGain.connect(this.dryBus);
    this.rideGain.connect(this.tunnelInput);
    ride.start();
  }

  setMusicActive(active) {
    this.musicActive = active;
    if (!this.ctx || !this.master) return;
    const target = (this.paused ? 0 : active ? 0.38 : 0.58) * this.masterVolume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  setPaused(paused) {
    this.paused = paused;
    if (!this.ctx || !this.master) return;
    const target = (paused ? 0 : this.musicActive ? 0.38 : 0.58) * this.masterVolume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.055);
  }

  attachMusicElement(element) {
    if (!this.ctx) return null;
    if (this.musicElement === element && this.musicAnalyser) return this.musicAnalyser;
    if (this.musicSource) {
      throw new Error('A different music element is already connected.');
    }

    this.musicElement = element;
    this.musicSource = this.ctx.createMediaElementSource(element);
    this.musicAnalyser = this.ctx.createAnalyser();
    // Match the reference renderer's effective frequency resolution:
    // 1024 samples at 24 kHz is equivalent to 2048 samples at ~48 kHz.
    this.musicAnalyser.fftSize = 2048;
    // Equivalent to analyzing -62..-8 dB after the reference renderer's
    // +9 dB gain. Keep native smoothing almost off; SpectrumDisplay applies
    // explicit fast attack/release per bar instead.
    this.musicAnalyser.minDecibels = -71;
    this.musicAnalyser.maxDecibels = -17;
    this.musicAnalyser.smoothingTimeConstant = 0.05;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 1;

    this.musicSource
      .connect(this.musicAnalyser)
      .connect(this.musicGain)
      .connect(this.ctx.destination);
    return this.musicAnalyser;
  }

  update(player) {
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const speed01 = clamp01((player.speed - 8) / 30);
    const carve = Math.min(1, Math.abs(player.steer));
    const grounded = player.state === 'GROUND';

    const windLevel = player.finished ? 0 : 0.030 + speed01 * speed01 * 0.245;
    const rideLevel = grounded && !player.finished
      ? 0.020 + speed01 * 0.072 + carve * speed01 * 0.060
      : 0;

    this.windGain.gain.setTargetAtTime(windLevel, now, 0.10);
    this.rideGain.gain.setTargetAtTime(rideLevel, now, 0.045);
    this.windFilter.frequency.setTargetAtTime(330 + speed01 * 420, now, 0.10);
    this.rideFilter.frequency.setTargetAtTime(690 + speed01 * 430 + carve * 160, now, 0.055);

    const tunnel = tunnelAmountAt(player.courseS);

    // Reduce the untreated path while raising delayed reflections so entering a
    // tunnel changes timbre/spatial character, not just overall loudness.
    this.dryBus.gain.setTargetAtTime(1 - tunnel * 0.20, now, 0.06);
    this.tunnelBoost.gain.setTargetAtTime(tunnel * 0.42, now, 0.05);

    for (let i = 0; i < this.tunnelTaps.length; i++) {
      const tap = this.tunnelTaps[i];
      tap.wet.gain.setTargetAtTime(tunnel * tap.level, now, 0.045 + i * 0.008);
      tap.delay.delayTime.setTargetAtTime(
        tap.baseDelay + tunnel * (0.006 + i * 0.004),
        now,
        0.08
      );
    }

    // Delayed continuous noise can read only as "louder". A quiet periodic
    // reflection provides a more explicit tunnel cue while fully enclosed.
    if (tunnel > 0.62 && now >= this.nextFlutterTime) {
      this.tunnelFlutter(0.030 + speed01 * 0.032);
      this.nextFlutterTime = now + 0.28 + Math.random() * 0.18;
    }

    if (player.landingImpact > 0.17 && this.lastLanding <= 0.17) {
      this.hit(72, 0.045 + player.landingImpact * 0.085, 0.12, 'triangle', tunnel);
      this.noiseBurst(0.035 + player.landingImpact * 0.055, 0.075, tunnel);
    }

    if (player.collisionImpact > 0.20 && this.lastCollision <= 0.20) {
      this.hit(115, 0.10, 0.10, 'square', tunnel);
      this.noiseBurst(0.08, 0.11, tunnel);
    }

    this.lastLanding = player.landingImpact;
    this.lastCollision = player.collisionImpact;
  }

  tunnelFlutter(gain) {
    const now = this.ctx.currentTime;
    const frames = Math.floor(this.ctx.sampleRate * 0.075);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frames; i++) {
      const env = Math.sin(Math.PI * i / frames);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.75;

    const level = this.ctx.createGain();
    level.gain.value = gain;

    source.connect(filter).connect(level).connect(this.tunnelInput);
    source.start(now);
  }

  hit(freq, gain, duration, type, tunnel = 0) {
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    const level = this.ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, freq * 0.55), now + duration);

    level.gain.setValueAtTime(gain, now);
    level.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(level).connect(this.master);
    if (tunnel > 0.15) level.connect(this.tunnelInput);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  noiseBurst(gain, duration, tunnel = 0) {
    const now = this.ctx.currentTime;
    const frames = Math.max(64, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;

    const level = this.ctx.createGain();
    level.gain.value = gain;

    source.connect(filter).connect(level).connect(this.master);
    if (tunnel > 0.15) level.connect(this.tunnelInput);
    source.start(now);
  }
}
