import { parseBlob } from 'music-metadata';

const AUDIO_EXTENSIONS = new Set([
  'aac', 'aif', 'aiff', 'alac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'webm',
]);
const FALLBACK_DURATION_SECONDS = 180;
const MAX_PLAYBACK_DURATION_SECONDS = 10 * 60;

function extensionOf(fileName) {
  const match = String(fileName ?? '').match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

export function fileStem(fileName) {
  return String(fileName ?? '').replace(/\.[^.]+$/, '');
}

export function isAudioFile(file) {
  return String(file?.type ?? '').toLowerCase().startsWith('audio/')
    || AUDIO_EXTENSIONS.has(extensionOf(file?.name));
}

export function findExternalTrackFiles(fileList) {
  const files = [...(fileList ?? [])];
  const audioFiles = files.filter(isAudioFile);
  if (audioFiles.length !== 1) {
    throw new Error(audioFiles.length === 0 ? 'NO_AUDIO_FILE' : 'MULTIPLE_AUDIO_FILES');
  }

  const audioFile = audioFiles[0];
  const expectedSubtitleName = `${fileStem(audioFile.name)}.srt`.toLocaleLowerCase();
  const subtitleFile = files.find(file => (
    extensionOf(file.name) === 'srt'
    && String(file.name).toLocaleLowerCase() === expectedSubtitleName
  )) ?? null;

  return { audioFile, subtitleFile };
}

function readAudioDuration(audioUrl) {
  return new Promise(resolve => {
    const audio = new Audio(audioUrl);
    const finish = value => {
      audio.removeAttribute('src');
      audio.load?.();
      resolve(value);
    };
    audio.addEventListener('loadedmetadata', () => {
      finish(Number.isFinite(audio.duration) ? audio.duration : null);
    }, { once: true });
    audio.addEventListener('error', () => finish(null), { once: true });
    audio.preload = 'metadata';
  });
}

export async function createExternalTrack(fileList, dependencies = {}) {
  const { audioFile, subtitleFile } = findExternalTrackFiles(fileList);
  const createObjectURL = dependencies.createObjectURL ?? (file => URL.createObjectURL(file));
  const metadataReader = dependencies.metadataReader ?? (file => parseBlob(file, {
    duration: true,
    skipCovers: true,
  }));
  const durationReader = dependencies.durationReader ?? readAudioDuration;
  const audioUrl = createObjectURL(audioFile);
  const subtitlesUrl = subtitleFile ? createObjectURL(subtitleFile) : null;

  let metadata = null;
  try {
    metadata = await metadataReader(audioFile);
  } catch (error) {
    console.warn(`Could not read audio tags from ${audioFile.name}`, error);
  }

  let durationSeconds = Number(metadata?.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    try {
      durationSeconds = Number(await durationReader(audioUrl));
    } catch {
      durationSeconds = FALLBACK_DURATION_SECONDS;
    }
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    durationSeconds = FALLBACK_DURATION_SECONDS;
  }

  const fallbackTitle = fileStem(audioFile.name);
  const title = String(metadata?.common?.title ?? '').trim() || fallbackTitle;
  const artist = String(metadata?.common?.artist ?? '').trim() || 'EXTERNAL';

  const sourceDurationSeconds = durationSeconds;
  const playbackLimited = sourceDurationSeconds > MAX_PLAYBACK_DURATION_SECONDS;

  return Object.freeze({
    id: `external-${fallbackTitle}`,
    external: true,
    title,
    artist,
    durationSeconds: Math.min(sourceDurationSeconds, MAX_PLAYBACK_DURATION_SECONDS),
    sourceDurationSeconds,
    playbackLimitSeconds: playbackLimited ? MAX_PLAYBACK_DURATION_SECONDS : null,
    previewPointSeconds: null,
    seed: `external-${audioFile.name}`,
    audioUrl,
    subtitlesUrl,
    fileName: audioFile.name,
    subtitleFileName: subtitleFile?.name ?? null,
  });
}

export function releaseExternalTrack(track, revokeObjectURL = value => URL.revokeObjectURL(value)) {
  if (!track?.external) return;
  if (track.audioUrl) revokeObjectURL(track.audioUrl);
  if (track.subtitlesUrl) revokeObjectURL(track.subtitlesUrl);
}

export const EXTERNAL_TRACK_FALLBACK_DURATION_SECONDS = FALLBACK_DURATION_SECONDS;
export const EXTERNAL_TRACK_MAX_PLAYBACK_DURATION_SECONDS = MAX_PLAYBACK_DURATION_SECONDS;
