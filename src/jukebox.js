import { parseSrt, subtitleAt } from './subtitles.js';
import { clampMasterVolume } from './volume-settings.js';

const PLAYBACK_VOLUME = 0.88;
const LIMIT_FADE_SECONDS = 3;

export class Jukebox {
  constructor(track, callbacks = {}) {
    this.track = track;
    this.cues = [];
    this.subtitleLoadPromise = null;
    this.onEnded = callbacks.onEnded ?? (() => {});
    this.onError = callbacks.onError ?? (() => {});
    this.completed = false;
    this.masterVolume = clampMasterVolume(callbacks.masterVolume ?? 1);
    this.playbackLimitSeconds = Number.isFinite(track.playbackLimitSeconds)
      ? track.playbackLimitSeconds
      : null;

    this.audio = callbacks.audioElement ?? new Audio(track.audioUrl);
    this.unlockPromise = callbacks.unlockPromise ?? Promise.resolve(true);
    this.audio.preload = 'auto';
    this.audio.volume = callbacks.audioElement ? 0 : PLAYBACK_VOLUME * this.masterVolume;
    this.audio.addEventListener('ended', () => this.finishPlayback());
    this.audio.addEventListener('error', () => {
      this.onError(new Error(`Failed to load audio: ${track.title}`));
    });
  }

  loadSubtitles() {
    if (this.subtitleLoadPromise) return this.subtitleLoadPromise;
    if (!this.track.subtitlesUrl) {
      this.cues = [];
      this.subtitleLoadPromise = Promise.resolve(this.cues);
      return this.subtitleLoadPromise;
    }
    this.subtitleLoadPromise = fetch(this.track.subtitlesUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load subtitles (${response.status})`);
        }
        return response.text();
      })
      .then(source => {
        this.cues = parseSrt(source);
        return this.cues;
      })
      .catch(error => {
        this.onError(error);
        return [];
      });
    return this.subtitleLoadPromise;
  }

  async playFromStart() {
    await this.unlockPromise;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.volume = PLAYBACK_VOLUME * this.masterVolume;
    this.completed = false;
    await this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  async resume() {
    await this.audio.play();
  }

  finishPlayback() {
    if (this.completed) return;
    this.completed = true;
    this.onEnded();
  }

  applyPlaybackLimit(currentTime) {
    const limit = this.playbackLimitSeconds;
    if (!Number.isFinite(limit) || this.completed) return;
    const fadeStart = Math.max(0, limit - LIMIT_FADE_SECONDS);
    if (currentTime < fadeStart) return;

    const fadeProgress = Math.min(1, (currentTime - fadeStart) / Math.max(0.001, limit - fadeStart));
    this.audio.volume = PLAYBACK_VOLUME * this.masterVolume * (1 - fadeProgress);
    if (currentTime < limit) return;

    this.audio.pause();
    this.finishPlayback();
  }

  playbackState() {
    const currentTime = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
    this.applyPlaybackLimit(currentTime);
    const mediaDuration = Number.isFinite(this.audio.duration)
      ? this.audio.duration
      : this.track.durationSeconds;
    const duration = Number.isFinite(this.playbackLimitSeconds)
      ? Math.min(mediaDuration, this.playbackLimitSeconds)
      : mediaDuration;
    return {
      currentTime,
      duration,
      progress: duration > 0 ? Math.min(1, currentTime / duration) : 0,
      cue: subtitleAt(this.cues, currentTime),
      playing: !this.audio.paused && !this.audio.ended,
    };
  }
}

export const JUKEBOX_PLAYBACK_LIMIT_FADE_SECONDS = LIMIT_FADE_SECONDS;
