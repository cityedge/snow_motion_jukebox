import { DEFAULT_TRACK, findTrack, TRACKS } from './track-manifest.js';
import { MenuAudioController } from './menu-audio.js';
import { STAGE_MODE } from './run-mode.js';
import { createExternalTrack, releaseExternalTrack } from './external-track.js';
import { readMasterVolume, writeMasterVolume } from './volume-settings.js';

const MENU_BACKGROUND_URL = new URL('../music_data/game_menu.png', import.meta.url).href;

const UI_TEXT = Object.freeze({
  ja: Object.freeze({
    heading: '滑走曲を選ぶ',
    startFromBeginning: '最初から滑る',
    selected: '選択中',
    ride: 'この曲で滑る',
    randomRide: 'ランダムステージで滑る',
    loadExternal: '外部の曲をロード',
    volume: '音量',
    external: '外部曲',
    externalLoading: '音源を読み込み中…',
    externalWithSubtitles: '同名SRTを読み込みました',
    externalWithoutSubtitles: '字幕なし（同名SRTは音源と一緒に選択）',
    externalLimited: '10分でフェードアウト',
    noAudioFile: '音源ファイルを選択してください',
    multipleAudioFiles: '音源は1曲だけ選択してください',
    externalLoadFailed: '音源を読み込めませんでした',
    loading: 'コースを準備中…',
    controls: '↑ ↓ 選択　ENTER 決定　SHIFT+ENTER ランダム',
    language: 'EN',
    track: index => `TRACK ${String(index + 1).padStart(2, '0')}`,
  }),
  en: Object.freeze({
    heading: 'SELECT A TRACK',
    startFromBeginning: 'RIDE FROM THE BEGINNING',
    selected: 'SELECTED',
    ride: 'RIDE THIS TRACK',
    randomRide: 'RIDE A RANDOM STAGE',
    loadExternal: 'LOAD EXTERNAL TRACK',
    volume: 'VOLUME',
    external: 'EXTERNAL TRACK',
    externalLoading: 'LOADING AUDIO…',
    externalWithSubtitles: 'MATCHING SRT LOADED',
    externalWithoutSubtitles: 'NO LYRICS · SELECT A MATCHING SRT WITH THE AUDIO',
    externalLimited: '10-MINUTE FADE LIMIT',
    noAudioFile: 'SELECT AN AUDIO FILE',
    multipleAudioFiles: 'SELECT ONE AUDIO TRACK ONLY',
    externalLoadFailed: 'COULD NOT LOAD THE AUDIO FILE',
    loading: 'PREPARING THE COURSE…',
    controls: '↑ ↓ SELECT　ENTER CONFIRM　SHIFT+ENTER RANDOM',
    language: '日本語',
    track: index => `TRACK ${String(index + 1).padStart(2, '0')}`,
  }),
});

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export class MainMenu {
  constructor(root, { initialTrack, onConfirm }) {
    this.root = root;
    this.onConfirm = onConfirm;
    this.language = 'ja';
    this.selectedIndex = Math.max(
      0,
      TRACKS.findIndex(track => track === initialTrack)
    );
    this.cursorIndex = -1;
    this.launching = false;
    this.launchingMode = null;
    this.externalTrack = null;
    this.externalLoading = false;
    this.externalErrorKey = null;
    this.masterVolume = readMasterVolume();
    this.audioController = new MenuAudioController(this.masterVolume);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.render();
    window.addEventListener('keydown', this.handleKeyDown);
  }

  render() {
    this.element = document.createElement('main');
    this.element.className = 'main-menu';
    this.element.style.setProperty('--menu-background', `url("${MENU_BACKGROUND_URL}")`);
    this.element.innerHTML = `
      <section class="menu-panel" aria-labelledby="menu-heading">
        <header class="menu-header">
          <h1 id="menu-heading"></h1>
          <div class="menu-heading-line" aria-hidden="true"></div>
        </header>
        <button class="menu-quick-start-button" type="button"></button>
        <ol class="track-list" aria-label="Track list"></ol>
        <footer class="menu-footer">
          <div class="menu-selection-column">
            <div class="menu-selection-detail">
              <span class="menu-selected-label"></span>
              <strong class="menu-selected-title"></strong>
            </div>
            <button class="menu-external-button" type="button"></button>
            <input class="menu-external-input" type="file" multiple
              accept="audio/*,.aac,.aif,.aiff,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav,.webm,.srt" hidden>
            <label class="menu-volume-control">
              <span class="menu-volume-label"></span>
              <input class="menu-volume-slider" type="range" min="0" max="100" step="5">
              <output class="menu-volume-value"></output>
            </label>
            <div class="menu-external-status" aria-live="polite"></div>
          </div>
          <div class="menu-actions">
            <button class="menu-ride-button" type="button"></button>
            <button class="menu-ride-button menu-random-button" type="button"></button>
          </div>
          <div class="menu-controls"></div>
        </footer>
      </section>
      <button class="menu-language-button" type="button"></button>
    `;
    this.root.appendChild(this.element);
    this.element.addEventListener('pointerdown', this.handlePointerDown);

    this.headingEl = this.element.querySelector('#menu-heading');
    this.quickStartButtonEl = this.element.querySelector('.menu-quick-start-button');
    this.trackListEl = this.element.querySelector('.track-list');
    this.selectedLabelEl = this.element.querySelector('.menu-selected-label');
    this.selectedTitleEl = this.element.querySelector('.menu-selected-title');
    this.rideButtonEl = this.element.querySelector('.menu-ride-button');
    this.randomButtonEl = this.element.querySelector('.menu-random-button');
    this.externalButtonEl = this.element.querySelector('.menu-external-button');
    this.externalInputEl = this.element.querySelector('.menu-external-input');
    this.externalStatusEl = this.element.querySelector('.menu-external-status');
    this.volumeLabelEl = this.element.querySelector('.menu-volume-label');
    this.volumeSliderEl = this.element.querySelector('.menu-volume-slider');
    this.volumeValueEl = this.element.querySelector('.menu-volume-value');
    this.controlsEl = this.element.querySelector('.menu-controls');
    this.languageButtonEl = this.element.querySelector('.menu-language-button');

    TRACKS.forEach((track, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'track-choice';
      button.type = 'button';
      button.dataset.index = String(index);
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML = `
        <span class="track-choice-number"></span>
        <span class="track-choice-title">${track.title}</span>
        <span class="track-choice-duration">${formatDuration(track.durationSeconds)}</span>
      `;
      button.addEventListener('click', () => {
        this.select(index, true, true);
      });
      item.appendChild(button);
      this.trackListEl.appendChild(item);
    });

    this.quickStartButtonEl.addEventListener('click', () => this.quickStart());
    this.rideButtonEl.addEventListener('click', () => this.confirm(STAGE_MODE.AUTHORED));
    this.randomButtonEl.addEventListener('click', () => this.confirm(STAGE_MODE.RANDOM));
    this.externalButtonEl.addEventListener('click', () => this.externalInputEl.click());
    this.externalInputEl.addEventListener('change', event => this.loadExternal(event.target.files));
    this.volumeSliderEl.value = String(Math.round(this.masterVolume * 100));
    this.volumeSliderEl.addEventListener('input', () => {
      this.masterVolume = writeMasterVolume(Number(this.volumeSliderEl.value) / 100);
      this.audioController.setMasterVolume(this.masterVolume);
      this.updateVolumeText();
    });
    this.volumeSliderEl.addEventListener('keydown', event => {
      const step = Number(this.volumeSliderEl.step) || 5;
      const current = Number(this.volumeSliderEl.value);
      let next = null;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = current - step;
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = current + step;
      if (event.key === 'Home') next = Number(this.volumeSliderEl.min);
      if (event.key === 'End') next = Number(this.volumeSliderEl.max);
      if (next === null) return;
      event.preventDefault();
      this.volumeSliderEl.value = String(next);
      this.volumeSliderEl.dispatchEvent(new Event('input', { bubbles: true }));
    });
    this.languageButtonEl.addEventListener('click', () => {
      this.language = this.language === 'ja' ? 'en' : 'ja';
      this.applyLanguage();
    });
    this.applyLanguage();
    this.select(this.selectedIndex, false);
    this.selectQuickStart(true);
  }

  applyLanguage() {
    const text = UI_TEXT[this.language];
    document.documentElement.lang = this.language;
    this.headingEl.textContent = text.heading;
    this.quickStartButtonEl.textContent = text.startFromBeginning;
    this.quickStartButtonEl.disabled = this.launching || this.externalLoading;
    this.selectedLabelEl.textContent = text.selected;
    this.rideButtonEl.textContent = this.launchingMode === STAGE_MODE.AUTHORED
      ? text.loading
      : text.ride;
    this.randomButtonEl.textContent = this.launchingMode === STAGE_MODE.RANDOM
      ? text.loading
      : text.randomRide;
    this.externalButtonEl.textContent = this.externalLoading
      ? text.externalLoading
      : text.loadExternal;
    this.externalButtonEl.disabled = this.launching || this.externalLoading;
    this.volumeSliderEl.disabled = this.launching;
    this.updateVolumeText(text);
    this.rideButtonEl.disabled = this.launching || this.externalLoading || Boolean(this.externalTrack);
    this.randomButtonEl.disabled = this.launching || this.externalLoading;
    this.applyExternalStatus(text);
    this.controlsEl.textContent = text.controls;
    this.languageButtonEl.textContent = text.language;
    this.element.querySelectorAll('.track-choice-number').forEach((element, index) => {
      element.textContent = text.track(index);
    });
  }

  updateVolumeText(text = UI_TEXT[this.language]) {
    const percent = Math.round(this.masterVolume * 100);
    this.volumeLabelEl.textContent = text.volume;
    this.volumeValueEl.value = `${percent}%`;
    this.volumeSliderEl.setAttribute('aria-label', `${text.volume} ${percent}%`);
  }

  select(index, focus = false, preview = false) {
    if (this.externalTrack) releaseExternalTrack(this.externalTrack);
    this.externalTrack = null;
    this.externalErrorKey = null;
    this.cursorIndex = (index + TRACKS.length) % TRACKS.length;
    this.quickStartButtonEl.classList.remove('selected');
    this.quickStartButtonEl.setAttribute('aria-pressed', 'false');
    this.selectedIndex = this.cursorIndex;
    const choices = [...this.element.querySelectorAll('.track-choice')];
    choices.forEach((choice, choiceIndex) => {
      const selected = choiceIndex === this.selectedIndex;
      choice.classList.toggle('selected', selected);
      choice.setAttribute('aria-pressed', String(selected));
      if (selected && focus) choice.focus({ preventScroll: true });
    });
    this.selectedTitleEl.textContent = TRACKS[this.selectedIndex].title;
    this.applyLanguage();
    if (preview) this.audioController.preview(TRACKS[this.selectedIndex]);
  }

  selectQuickStart(focus = false) {
    if (this.externalTrack) releaseExternalTrack(this.externalTrack);
    this.externalTrack = null;
    this.externalErrorKey = null;
    this.cursorIndex = -1;
    this.audioController.returnToSilence();
    this.quickStartButtonEl.classList.add('selected');
    this.quickStartButtonEl.setAttribute('aria-pressed', 'true');
    this.element.querySelectorAll('.track-choice').forEach(choice => {
      choice.classList.remove('selected');
      choice.setAttribute('aria-pressed', 'false');
    });
    this.selectedTitleEl.textContent = TRACKS[0].title;
    this.applyLanguage();
    if (focus) this.quickStartButtonEl.focus({ preventScroll: true });
  }

  applyExternalStatus(text = UI_TEXT[this.language]) {
    if (this.externalErrorKey) {
      this.externalStatusEl.textContent = text[this.externalErrorKey];
      this.externalStatusEl.classList.add('error');
      return;
    }
    this.externalStatusEl.classList.remove('error');
    if (!this.externalTrack) {
      this.externalStatusEl.textContent = '';
      return;
    }
    this.selectedLabelEl.textContent = text.external;
    this.selectedTitleEl.textContent = this.externalTrack.title;
    const status = [];
    if (this.externalTrack.playbackLimitSeconds) status.push(text.externalLimited);
    status.push(this.externalTrack.subtitlesUrl
      ? text.externalWithSubtitles
      : text.externalWithoutSubtitles);
    this.externalStatusEl.textContent = status.join('　/　');
  }

  async loadExternal(files) {
    if (this.launching || !files?.length) return;
    this.externalLoading = true;
    this.externalErrorKey = null;
    this.applyLanguage();
    try {
      const track = await createExternalTrack(files);
      if (this.externalTrack) releaseExternalTrack(this.externalTrack);
      this.externalTrack = track;
      this.cursorIndex = null;
      this.quickStartButtonEl.classList.remove('selected');
      this.quickStartButtonEl.setAttribute('aria-pressed', 'false');
      this.element.querySelectorAll('.track-choice').forEach(choice => {
        choice.classList.remove('selected');
        choice.setAttribute('aria-pressed', 'false');
      });
      this.audioController.returnToSilence();
    } catch (error) {
      this.externalErrorKey = error.message === 'NO_AUDIO_FILE'
        ? 'noAudioFile'
        : error.message === 'MULTIPLE_AUDIO_FILES'
          ? 'multipleAudioFiles'
          : 'externalLoadFailed';
      console.error(error);
    } finally {
      this.externalLoading = false;
      this.externalInputEl.value = '';
      this.applyLanguage();
    }
  }

  handlePointerDown() {
    if (!this.launching) this.audioController.activate();
  }

  handleKeyDown(event) {
    if (this.launching) return;
    if (event.target === this.volumeSliderEl) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      this.audioController.activate();
      if (this.cursorIndex === -1 || this.cursorIndex === null) {
        this.select(TRACKS.length - 1, true, true);
      } else if (this.cursorIndex === 0) {
        this.selectQuickStart(true);
      } else {
        this.select(this.cursorIndex - 1, true, true);
      }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.audioController.activate();
      if (this.cursorIndex === -1 || this.cursorIndex === null) {
        this.select(0, true, true);
      } else if (this.cursorIndex === TRACKS.length - 1) {
        this.selectQuickStart(true);
      } else {
        this.select(this.cursorIndex + 1, true, true);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.cursorIndex === -1 && !this.externalTrack) {
        this.quickStart();
      } else {
        this.confirm(this.externalTrack || event.shiftKey ? STAGE_MODE.RANDOM : STAGE_MODE.AUTHORED);
      }
    }
  }

  quickStart() {
    if (this.launching || this.externalLoading) return;
    this.selectedIndex = 0;
    this.confirm(STAGE_MODE.AUTHORED);
  }

  async confirm(stageMode = STAGE_MODE.AUTHORED) {
    if (this.launching || this.externalLoading) return;
    const selectedTrack = this.externalTrack ?? TRACKS[this.selectedIndex];
    const resolvedMode = selectedTrack.external ? STAGE_MODE.RANDOM : stageMode;
    // Start the selected media element inside the click/key gesture, then hand
    // that same unlocked element to the game after its async 3D setup finishes.
    const launchPlayback = this.audioController.prepareLaunch(selectedTrack);
    this.launching = true;
    this.launchingMode = resolvedMode;
    this.audioController.stop();
    this.element.classList.add('launching');
    this.rideButtonEl.disabled = true;
    this.randomButtonEl.disabled = true;
    this.applyLanguage();
    await this.onConfirm(selectedTrack, { stageMode: resolvedMode, launchPlayback });
  }

  destroy() {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.audioController.stop();
    this.element.remove();
  }
}

export function initialMenuTrack() {
  const requested = new URLSearchParams(window.location.search).get('track');
  return findTrack(requested) ?? DEFAULT_TRACK;
}
