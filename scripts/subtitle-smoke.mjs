import assert from 'node:assert/strict';
import { DEFAULT_TRACK } from '../src/track-manifest.js';
import { readFile } from 'node:fs/promises';
import { parseSrt, subtitleAt } from '../src/subtitles.js';

const subtitlePath = new URL(
  '../music_data/01朝をひらくエッジ feat. CYAN.srt',
  import.meta.url
);
const source = await readFile(subtitlePath, 'utf8');
const cues = parseSrt(source);

assert.equal(DEFAULT_TRACK.visualProfile.snowSurface.priorTracks, false);
assert.equal(cues.length, 38);
assert.equal(cues[0].text, '朝のゴンドラ 扉がひらく');
assert.equal(cues.at(-1).text, 'このボードで 今日へ滑り出す');
assert.equal(subtitleAt(cues, 0), null);
assert.equal(subtitleAt(cues, cues[0].start)?.text, cues[0].text);
assert.equal(subtitleAt(cues, cues[0].end)?.text, cues[1].text);
assert.equal(subtitleAt(cues, cues.at(-1).end + 1), null);

class FakeAudio extends EventTarget {
  constructor(url) {
    super();
    this.src = url;
    this.currentTime = 99;
    this.duration = 204.72;
    this.paused = true;
    this.ended = false;
    this.volume = 1;
  }

  pause() {
    this.paused = true;
  }

  play() {
    this.paused = false;
    this.ended = false;
    return Promise.resolve();
  }
}

globalThis.Audio = FakeAudio;
const { Jukebox } = await import('../src/jukebox.js');
let endedCount = 0;
const jukebox = new Jukebox(
  {
    title: 'test',
    audioUrl: 'test.ogg',
    subtitlesUrl: 'test.srt',
    durationSeconds: 204.72,
  },
  { onEnded: () => endedCount++ }
);
jukebox.cues = cues;
await jukebox.playFromStart();
assert.equal(jukebox.audio.currentTime, 0);
assert.equal(jukebox.playbackState().playing, true);
jukebox.audio.currentTime = cues[0].start;
assert.equal(jukebox.playbackState().cue?.text, cues[0].text);
jukebox.pause();
assert.equal(jukebox.playbackState().playing, false);
await jukebox.resume();
assert.equal(jukebox.playbackState().playing, true);
jukebox.audio.dispatchEvent(new Event('ended'));
assert.equal(endedCount, 1);

const noSubtitleJukebox = new Jukebox({
  title: 'external test',
  audioUrl: 'blob:external-test',
  subtitlesUrl: null,
  durationSeconds: 180,
});
assert.deepEqual(await noSubtitleJukebox.loadSubtitles(), []);

let limitedEndedCount = 0;
const limitedJukebox = new Jukebox({
  title: 'long external test',
  audioUrl: 'blob:long-external-test',
  subtitlesUrl: null,
  durationSeconds: 600,
  playbackLimitSeconds: 600,
}, { onEnded: () => limitedEndedCount++ });
limitedJukebox.audio.duration = 7200;
await limitedJukebox.playFromStart();
limitedJukebox.audio.currentTime = 598.5;
let limitedState = limitedJukebox.playbackState();
assert.equal(limitedState.duration, 600);
assert.equal(limitedEndedCount, 0);
assert.ok(Math.abs(limitedJukebox.audio.volume - 0.44) < 0.001);
limitedJukebox.audio.currentTime = 600;
limitedState = limitedJukebox.playbackState();
assert.equal(limitedState.progress, 1);
assert.equal(limitedState.playing, false);
assert.equal(limitedJukebox.audio.volume, 0);
assert.equal(limitedEndedCount, 1);
limitedJukebox.playbackState();
assert.equal(limitedEndedCount, 1);

console.log(`Subtitle and jukebox smoke test passed for ${cues.length} cues.`);
