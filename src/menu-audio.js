import { clampMasterVolume } from './volume-settings.js';

const PREVIEW_VOLUME = 0.88;
const FADE_DURATION_MS = 500;
const PREVIEW_DURATION_MS = 10_000;
const PREVIEW_LEAD_IN_SECONDS = 0.5;

function clampVolume(value) {
  return Math.max(0, Math.min(1, value));
}

export class MenuAudioController {
  constructor(masterVolume = 1) {
    this.masterVolume = clampMasterVolume(masterVolume);
    this.disposed = false;
    this.previewAudio = null;
    this.previewAudios = new Set();
    this.returnTimer = null;
    this.fadeTimers = new Map();
  }

  setMasterVolume(value) {
    this.masterVolume = clampMasterVolume(value);
    if (this.previewAudio) {
      this.fadeTo(this.previewAudio, PREVIEW_VOLUME * this.masterVolume, 90);
    }
  }

  activate() {
    // Kept as a no-op so pointer/keyboard callers can still establish a user
    // gesture before a track preview. The main menu itself is intentionally silent.
  }

  preview(track) {
    if (this.disposed || !Number.isFinite(track?.previewPointSeconds)) return;
    this.activate();
    this.clearReturnTimer();

    const previousPreview = this.previewAudio;
    const preview = new Audio(track.audioUrl);
    const previewStart = Math.max(0, track.previewPointSeconds - PREVIEW_LEAD_IN_SECONDS);
    preview.preload = 'auto';
    preview.volume = 0;
    this.previewAudios.add(preview);
    this.seek(preview, previewStart);
    this.previewAudio = preview;

    if (previousPreview) {
      this.fadeTo(previousPreview, 0).then(completed => {
        if (completed) {
          previousPreview.pause();
          this.previewAudios.delete(previousPreview);
        }
      });
    }

    const playRequest = preview.play();
    if (!playRequest?.then) {
      this.beginPreviewFade(preview);
      return;
    }

    playRequest.then(() => {
      if (this.previewAudio === preview && !this.disposed) {
        this.beginPreviewFade(preview);
      } else {
        preview.pause();
      }
    }).catch(() => {
      if (this.previewAudio !== preview) return;
      this.previewAudio = null;
      this.previewAudios.delete(preview);
    });
  }

  prepareLaunch(track) {
    const audio = new Audio(track.audioUrl);
    audio.preload = 'auto';
    audio.volume = 0;
    const playRequest = audio.play();
    const unlockPromise = Promise.resolve(playRequest).then(() => {
      audio.pause();
      audio.currentTime = 0;
      return true;
    }).catch(() => false);
    return { audio, unlockPromise };
  }

  beginPreviewFade(preview) {
    this.fadeTo(preview, PREVIEW_VOLUME * this.masterVolume);
    this.returnTimer = window.setTimeout(() => {
      this.returnToSilence(preview);
    }, PREVIEW_DURATION_MS);
  }

  returnToSilence(preview = this.previewAudio) {
    if (this.disposed || !preview || this.previewAudio !== preview) return;
    this.clearReturnTimer();
    this.previewAudio = null;
    this.fadeTo(preview, 0).then(completed => {
      if (completed) {
        preview.pause();
        this.previewAudios.delete(preview);
      }
    });
  }

  seek(audio, seconds) {
    const applySeek = () => {
      try {
        audio.currentTime = seconds;
      } catch {
        // Chromium accepts an early seek; other media backends may need metadata first.
      }
    };
    applySeek();
    audio.addEventListener('loadedmetadata', applySeek, { once: true });
  }

  fadeTo(audio, targetVolume, durationMs = FADE_DURATION_MS) {
    this.cancelFade(audio);
    const target = clampVolume(targetVolume);
    const startVolume = audio.volume;
    if (durationMs <= 0 || Math.abs(startVolume - target) < 0.001) {
      audio.volume = target;
      return Promise.resolve(true);
    }

    return new Promise(resolve => {
      const startTime = performance.now();
      const timer = window.setInterval(() => {
        const progress = Math.min(1, (performance.now() - startTime) / durationMs);
        audio.volume = clampVolume(startVolume + (target - startVolume) * progress);
        if (progress < 1) return;
        window.clearInterval(timer);
        this.fadeTimers.delete(audio);
        resolve(true);
      }, 16);
      this.fadeTimers.set(audio, { timer, resolve });
    });
  }

  cancelFade(audio) {
    const fade = this.fadeTimers.get(audio);
    if (!fade) return;
    window.clearInterval(fade.timer);
    this.fadeTimers.delete(audio);
    fade.resolve(false);
  }

  clearReturnTimer() {
    if (this.returnTimer === null) return;
    window.clearTimeout(this.returnTimer);
    this.returnTimer = null;
  }

  stop() {
    this.disposed = true;
    this.clearReturnTimer();
    for (const audio of [...this.fadeTimers.keys()]) this.cancelFade(audio);
    for (const preview of this.previewAudios) {
      preview.pause();
      preview.currentTime = 0;
    }
    this.previewAudios.clear();
    this.previewAudio = null;
  }
}

export const MENU_AUDIO_TIMING = Object.freeze({
  ambientVolume: 0,
  previewVolume: PREVIEW_VOLUME,
  fadeDurationMs: FADE_DURATION_MS,
  previewDurationMs: PREVIEW_DURATION_MS,
  previewLeadInSeconds: PREVIEW_LEAD_IN_SECONDS,
});
