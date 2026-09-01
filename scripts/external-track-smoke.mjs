import assert from 'node:assert/strict';

import {
  createExternalTrack,
  fileStem,
  findExternalTrackFiles,
  isAudioFile,
  releaseExternalTrack,
  EXTERNAL_TRACK_MAX_PLAYBACK_DURATION_SECONDS,
} from '../src/external-track.js';

const audioFile = { name: '夜のテスト曲.ogg', type: 'audio/ogg' };
const subtitleFile = { name: '夜のテスト曲.SRT', type: 'application/x-subrip' };
const unrelatedSubtitle = { name: '別の曲.srt', type: 'application/x-subrip' };

assert.equal(fileStem(audioFile.name), '夜のテスト曲');
assert.equal(isAudioFile(audioFile), true);
assert.equal(isAudioFile({ name: 'fallback.FLAC', type: '' }), true);
assert.equal(isAudioFile(subtitleFile), false);
assert.deepEqual(
  findExternalTrackFiles([audioFile, unrelatedSubtitle, subtitleFile]),
  { audioFile, subtitleFile }
);
assert.throws(() => findExternalTrackFiles([subtitleFile]), /NO_AUDIO_FILE/);
assert.throws(() => findExternalTrackFiles([audioFile, { name: 'second.mp3', type: '' }]), /MULTIPLE_AUDIO_FILES/);

const createdUrls = [];
const track = await createExternalTrack([audioFile, subtitleFile], {
  createObjectURL: file => {
    const url = `blob:test/${file.name}`;
    createdUrls.push(url);
    return url;
  },
  metadataReader: async () => ({
    common: { title: 'タグ内タイトル', artist: 'タグ内アーティスト' },
    format: { duration: 212.5 },
  }),
  durationReader: async () => {
    throw new Error('metadata duration should be preferred');
  },
});

assert.equal(track.external, true);
assert.equal(track.title, 'タグ内タイトル');
assert.equal(track.artist, 'タグ内アーティスト');
assert.equal(track.durationSeconds, 212.5);
assert.equal(track.subtitlesUrl, 'blob:test/夜のテスト曲.SRT');
assert.deepEqual(createdUrls, [
  'blob:test/夜のテスト曲.ogg',
  'blob:test/夜のテスト曲.SRT',
]);

const fallbackTrack = await createExternalTrack([audioFile], {
  createObjectURL: file => `blob:fallback/${file.name}`,
  metadataReader: async () => ({ common: {}, format: {} }),
  durationReader: async () => 198.25,
});
assert.equal(fallbackTrack.title, '夜のテスト曲');
assert.equal(fallbackTrack.artist, 'EXTERNAL');
assert.equal(fallbackTrack.durationSeconds, 198.25);
assert.equal(fallbackTrack.subtitlesUrl, null);

const longTrack = await createExternalTrack([audioFile], {
  createObjectURL: file => `blob:long/${file.name}`,
  metadataReader: async () => ({
    common: { title: '2時間のテスト曲' },
    format: { duration: 2 * 60 * 60 },
  }),
});
assert.equal(longTrack.sourceDurationSeconds, 2 * 60 * 60);
assert.equal(longTrack.durationSeconds, EXTERNAL_TRACK_MAX_PLAYBACK_DURATION_SECONDS);
assert.equal(longTrack.playbackLimitSeconds, EXTERNAL_TRACK_MAX_PLAYBACK_DURATION_SECONDS);

const revoked = [];
releaseExternalTrack(track, url => revoked.push(url));
assert.deepEqual(revoked, [track.audioUrl, track.subtitlesUrl]);

console.log('external track smoke ok');
