import * as THREE from 'three';
import { createSnowMarks, createTerrain } from './course.js';
import { Player } from './player.js';
import { ChaseCamera } from './camera.js';
import { Scenery } from './scenery.js';
import { PhysicsWorld } from './physics.js';
import { RideAudio } from './audio.js';
import { ACTIVE_STAGE, ACTIVE_STAGE_MODE, tunnelAmountAt } from './stage.js';
import { WORLD_TIME_SCALE } from './run-config.js';
import { ACTIVE_TRACK, isFinalTrack } from './track-manifest.js';
import { Jukebox } from './jukebox.js';
import { SpectrumDisplay } from './spectrum.js';
import { sampleEnvironment } from './environment.js';
import { fogLayersAt, LocalWeather, sampleWeather } from './weather.js';
import { NightLighting } from './night-lighting.js';
import { LeadBoarder } from './lead-boarder.js';
import { StageDebugPanel } from './debug-panel.js';
import { createRandomStageSeed, STAGE_MODE } from './run-mode.js';
import { randomScenarioIdForShortcut } from './random-profile.js';
import { readMasterVolume } from './volume-settings.js';
import { touchControlAt } from './touch-controls.js';

const FIXED_DT = 1 / 60;
const CAMERA_TIME_SCALE = 1.20;
const MAX_STEPS = 8;

const UI_TEXT = {
  ja: {
    help: 'A / ← 左　 D / → 右　 S / ↓ ブレーキ　 P / ESC ポーズ　 R リスタート　 N 新しいコース　 V スペアナ　 F FPS　 SHIFT+D DEBUG',
    helpNoNewCourse: 'A / ← 左　 D / → 右　 S / ↓ ブレーキ　 P / ESC ポーズ　 R リスタート　 V スペアナ　 F FPS　 SHIFT+D DEBUG',
    distance: '滑走距離',
    speed: 'スピード',
    nowPlaying: '再生中',
    startTitle: 'RIDE WITH MUSIC',
    startDetail: 'クリックまたはキー入力でスタート',
    completeTitle: '滑走終了',
    completeDetail: distance => `滑走距離 ${distance} M`,
    pauseTitle: '一時停止',
    pauseDetail: '音楽と滑走を停止しています',
    resume: '滑走に戻る',
    nextTrack: '次の曲へ',
    firstTrack: '最初の曲へ',
    restart: '最初から滑る',
    returnToMenu: 'メニューに戻る',
    musicErrorTitle: '音楽を再生できません',
    musicErrorDetail: 'もう一度クリックしてください',
    languageButton: 'EN',
  },
  en: {
    help: 'A / ← LEFT　 D / → RIGHT　 S / ↓ BRAKE　 P / ESC PAUSE　 R RESTART　 N NEW COURSE　 V SPECTRUM　 F FPS　 SHIFT+D DEBUG',
    helpNoNewCourse: 'A / ← LEFT　 D / → RIGHT　 S / ↓ BRAKE　 P / ESC PAUSE　 R RESTART　 V SPECTRUM　 F FPS　 SHIFT+D DEBUG',
    distance: 'DISTANCE',
    speed: 'SPEED',
    nowPlaying: 'NOW PLAYING',
    startTitle: 'RIDE WITH MUSIC',
    startDetail: 'PRESS ANY KEY OR CLICK TO START',
    completeTitle: 'RUN COMPLETE',
    completeDetail: distance => `DISTANCE ${distance} M`,
    pauseTitle: 'PAUSED',
    pauseDetail: 'MUSIC AND RIDING ARE PAUSED',
    resume: 'RESUME RIDE',
    nextTrack: 'NEXT TRACK',
    firstTrack: 'FIRST TRACK',
    restart: 'RIDE FROM START',
    returnToMenu: 'RETURN TO MENU',
    musicErrorTitle: 'MUSIC COULD NOT START',
    musicErrorDetail: 'CLICK AGAIN TO RETRY',
    languageButton: '日本語',
  },
};

export class Game {
  constructor(root, RAPIER, callbacks = {}) {
    this.root = root;
    this.RAPIER = RAPIER;
    this.onRequestMenu = callbacks.onRequestMenu ?? (() => {});
    this.onRequestNextTrack = callbacks.onRequestNextTrack ?? (() => {});
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.environmentProfile = ACTIVE_TRACK.visualProfile?.environment;
    this.weatherProfile = ACTIVE_TRACK.visualProfile?.weather;
    this.environmentSample = sampleEnvironment(this.environmentProfile, 0);
    this.weatherSample = sampleWeather(this.weatherProfile, 0);
    this.environmentFogDensityScale = this.environmentSample.fogDensityScale;

    // Mountain-wide atmospheric perspective. The stage trait can only add
    // haze on top of the accepted minimum, never make the mountain clearer.
    this.openFogColor = new THREE.Color(this.environmentSample.fogColor);
    this.atmosphereColor = this.openFogColor.clone();

    // Atmosphere is independent from Vista/Enclosure, so an open mountain can
    // still be heavily hazed and an enclosed run can remain relatively clear.
    this.atmosphereAmount = ACTIVE_STAGE.personality.atmosphere ?? 0;
    // Keep the FOG 0 baseline lower than the original distance-heavy model.
    // Stage/environment fog now mostly strengthens the separate near veil.
    this.openNearFogDensity = 0.00215;
    this.openFarFogDensity = 0.00090;
    this.localFogStrength = 0;
    this.scene.fog = new THREE.FogExp2(this.openFogColor, this.openNearFogDensity);

    this.farScene = new THREE.Scene();
    this.farScene.fog = new THREE.FogExp2(this.openFogColor, this.openFarFogDensity);
    this.farScene.background = null;

    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 2200);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.domElement.classList.add('game-canvas');
    this.root.appendChild(this.renderer.domElement);

    this.input = { left: false, right: false, brake: false };
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.language = 'ja';
    this.runStarted = false;
    this.startingRun = false;
    this.paused = false;
    this.completionMessageReady = true;
    this.musicStartError = false;
    this.currentSubtitleText = '';
    this.spectrumEnabled = true;
    this.fpsEnabled = false;
    this.fpsFrameCount = 0;
    this.fpsElapsedMs = 0;
    this.fpsWorkElapsedMs = 0;
    this.fpsValue = 0;
    this.frameTimeValue = 0;
    this.touchSteerPointerId = null;

    this.buildWorld();
    this.player = new Player(this.scene, this.physics);
    this.leadBoarder = new LeadBoarder(
      this.scene,
      ACTIVE_TRACK.visualProfile?.leadBoarder
    );
    this.leadBoarder.reset(this.player, 0);
    this.horizonGlowWorldAzimuth = this.player.heading
      + THREE.MathUtils.degToRad(this.environmentSample.sunAzimuthDeg);
    this.masterVolume = readMasterVolume();
    this.audio = new RideAudio(this.masterVolume);
    this.jukebox = new Jukebox(ACTIVE_TRACK, {
      onEnded: () => this.completeRun(),
      onError: error => this.handleMusicError(error),
      audioElement: callbacks.launchPlayback?.audio,
      unlockPromise: callbacks.launchPlayback?.unlockPromise,
      masterVolume: this.masterVolume,
    });
    this.jukebox.loadSubtitles();
    this.chaseCamera = new ChaseCamera(this.camera, this.player);
    this.chaseCamera.reset();
    this.weather = new LocalWeather(this.scene, this.camera);
    this.weather.reset();
    this.scenery.update(this.camera, this.player);
    this.nightLighting = new NightLighting(
      this.scene,
      ACTIVE_TRACK.visualProfile?.nightLighting
    );
    this.nightLighting.update(this.player);
    this.updateEnvironment(0);
    this.updateAtmosphere();
    this.buildHud();
    this.bindEvents();

    this.loop = this.loop.bind(this);
    // Compile both render passes before the ride begins. Track 7 is the first
    // authored track that combines 24 spotlights, weather, textured scenery
    // and a lead rider; compiling those shader variants on their first visible
    // frame caused two large startup stalls.
    this.renderReady = this.prepareRenderer().finally(() => {
      this.lastTime = performance.now();
      requestAnimationFrame(this.loop);
    });
  }

  async prepareRenderer() {
    await Promise.all([
      this.renderer.compileAsync(this.farScene, this.camera),
      this.renderer.compileAsync(this.scene, this.camera),
    ]);
    // compileAsync prepares programs, but drivers may still defer texture
    // upload and final pipeline work until an actual draw. Render the same two
    // passes once while startRun is waiting so that cost cannot interrupt the
    // first seconds of motion.
    this.renderer.clear();
    this.renderer.render(this.farScene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clear();
  }

  buildWorld() {
    this.hemiLight = new THREE.HemisphereLight(
      this.environmentSample.hemisphereSkyColor,
      this.environmentSample.hemisphereGroundColor,
      this.environmentSample.hemisphereIntensity
    );
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(
      this.environmentSample.sunLightColor,
      this.environmentSample.sunLightIntensity
    );
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunLight, this.sunTarget);
    this.sunLight.target = this.sunTarget;

    this.terrain = createTerrain(this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.terrain);
    // Fine surface streaks are always present as a speed cue. Paired carve
    // grooves are narrative evidence of earlier riders and are track-controlled.
    this.scene.add(createSnowMarks({
      showPriorTracks: ACTIVE_TRACK.visualProfile?.snowSurface?.priorTracks ?? true,
    }));

    this.physics = new PhysicsWorld(this.RAPIER, this.terrain.geometry);
    this.scenery = new Scenery(this.scene, this.farScene, {
      maxAnisotropy: this.renderer.capabilities.getMaxAnisotropy(),
    });
  }

  buildHud() {
    const hud = document.createElement('div');
    hud.className = 'hud';
    hud.innerHTML = `
      <div class="brand">SNOW / MOTION · JUKEBOX v1.1.1</div>
      <div class="help"></div>
      <div class="stage-info">SEED ${ACTIVE_STAGE.seedLabel} · ${ACTIVE_STAGE.name} · FOG ${Math.round((ACTIVE_STAGE.personality.atmosphere ?? 0) * 100)}</div>
      <div class="fps-readout disabled" aria-hidden="true">FPS -- · CPU -- MS · MAX --</div>
      <div class="distance-readout">
        <div class="distance-label"></div>
        <div class="distance-value">0 M</div>
      </div>
      <div class="speed-meter">
        <div class="speed-label"></div>
        <div class="speed-track"><div class="speed-fill"></div></div>
      </div>
      <div class="now-playing">
        <div class="now-playing-label"></div>
        <div class="track-title">${ACTIVE_TRACK.title}</div>
        <div class="track-artist">${ACTIVE_TRACK.artist}</div>
        <div class="music-progress"><div class="music-progress-fill"></div></div>
      </div>
      <canvas class="spectrum-canvas" aria-hidden="true"></canvas>
      <div class="subtitle" aria-live="polite"></div>
      <button class="language-toggle" type="button"></button>
      <div class="center-message show">
        <strong></strong>
        <span></span>
        <div class="game-dialog-actions">
          <button class="game-dialog-button game-next-button" type="button"></button>
          <button class="game-dialog-button game-resume-button" type="button"></button>
          <button class="game-dialog-button game-restart-button" type="button"></button>
          <button class="game-dialog-button game-menu-button" type="button"></button>
        </div>
      </div>
    `;
    document.body.appendChild(hud);
    this.speedFillEl = hud.querySelector('.speed-fill');
    this.distanceEl = hud.querySelector('.distance-value');
    this.distanceLabelEl = hud.querySelector('.distance-label');
    this.speedLabelEl = hud.querySelector('.speed-label');
    this.helpEl = hud.querySelector('.help');
    this.messageEl = hud.querySelector('.center-message');
    this.messageTitleEl = hud.querySelector('.center-message strong');
    this.messageDetailEl = hud.querySelector('.center-message span');
    this.messageActionsEl = hud.querySelector('.game-dialog-actions');
    this.nextButtonEl = hud.querySelector('.game-next-button');
    this.resumeButtonEl = hud.querySelector('.game-resume-button');
    this.restartButtonEl = hud.querySelector('.game-restart-button');
    this.menuButtonEl = hud.querySelector('.game-menu-button');
    this.nowPlayingLabelEl = hud.querySelector('.now-playing-label');
    this.musicProgressEl = hud.querySelector('.music-progress-fill');
    this.subtitleEl = hud.querySelector('.subtitle');
    this.spectrum = new SpectrumDisplay(hud.querySelector('.spectrum-canvas'));
    this.languageButtonEl = hud.querySelector('.language-toggle');
    this.fpsEl = hud.querySelector('.fps-readout');
    this.debugPanel = new StageDebugPanel(hud, {
      stage: ACTIVE_STAGE,
      track: ACTIVE_TRACK,
      mode: ACTIVE_STAGE_MODE,
    });
    this.messageActionsEl.addEventListener('pointerdown', event => event.stopPropagation());
    this.nextButtonEl.addEventListener('click', () => this.onRequestNextTrack());
    this.resumeButtonEl.addEventListener('click', () => this.resumeRun());
    this.restartButtonEl.addEventListener('click', () => this.restartRun());
    this.menuButtonEl.addEventListener('click', () => this.onRequestMenu());
    this.applyLanguage();
  }

  bindEvents() {
    const setKey = (event, down) => {
      const key = event.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'enter', 'a', 'd', 's', 'r', 'n', 'f', 'p', 'escape'].includes(key) || /^\d$/.test(key)) {
        event.preventDefault();
      }
      if (this.handleDialogKey(event, down)) return;
      if (event.repeat && ['r', 'n', 'l', 'v', 'f', 'p', 'escape'].includes(key)) return;
      if (down && key === 'd' && event.shiftKey) {
        event.preventDefault();
        if (!event.repeat) this.debugPanel.toggle();
        this.input.right = false;
        return;
      }
      if (down && (key === 'p' || key === 'escape')) {
        this.togglePause();
        return;
      }
      if (down && key === 'l') {
        event.preventDefault();
        this.toggleLanguage();
        return;
      }
      if (down && key === 'v') {
        event.preventDefault();
        this.toggleSpectrum();
        return;
      }
      if (down && key === 'f') {
        event.preventDefault();
        this.toggleFps();
        return;
      }
      if (this.paused) return;
      if (key === 'arrowleft' || key === 'a') this.input.left = down;
      if (key === 'arrowright' || key === 'd') this.input.right = down;
      if (key === 'arrowdown' || key === 's') this.input.brake = down;
      if (down && key === 'n') {
        if (!ACTIVE_TRACK.external) this.loadNewSeed();
        return;
      }
      if (down && /^\d$/.test(key)) {
        if (!event.repeat && !ACTIVE_TRACK.external) this.loadScenarioSeed(key);
        return;
      }
      if (down && !this.runStarted) this.startRun();
      else if (down && key === 'r') this.restartRun();
      if (down && key !== 'r' && key !== 'n') this.helpEl.classList.add('dim');
    };

    window.addEventListener('keydown', (e) => setKey(e, true), { passive: false });
    window.addEventListener('keyup', (e) => setKey(e, false), { passive: false });
    window.addEventListener('blur', () => {
      this.input.left = this.input.right = this.input.brake = false;
      this.touchSteerPointerId = null;
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch' && event.target === this.renderer.domElement) return;
      if (!this.runStarted) this.startRun();
    }, { passive: true });
    const clearTouchSteering = (pointerId) => {
      if (pointerId !== this.touchSteerPointerId) return;
      this.input.left = false;
      this.input.right = false;
      this.touchSteerPointerId = null;
    };
    const updateTouchSteering = (event) => {
      const control = touchControlAt(
        event.clientX,
        event.clientY,
        this.renderer.domElement.getBoundingClientRect()
      );
      if (control === 'left') {
        this.input.left = true;
        this.input.right = false;
      } else if (control === 'right') {
        this.input.left = false;
        this.input.right = true;
      } else {
        clearTouchSteering(event.pointerId);
      }
      return control;
    };
    this.renderer.domElement.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      event.preventDefault();
      const control = touchControlAt(
        event.clientX,
        event.clientY,
        this.renderer.domElement.getBoundingClientRect()
      );
      if (control === 'pause') {
        clearTouchSteering(this.touchSteerPointerId);
        this.togglePause();
        return;
      }
      if (!control || this.paused || this.player.finished) return;
      this.touchSteerPointerId = event.pointerId;
      this.renderer.domElement.setPointerCapture(event.pointerId);
      updateTouchSteering(event);
      if (!this.runStarted) {
        this.startRun().then(() => {
          if (this.touchSteerPointerId === event.pointerId && !this.paused) {
            updateTouchSteering(event);
          }
        });
      }
    }, { passive: false });
    this.renderer.domElement.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'touch' || event.pointerId !== this.touchSteerPointerId) return;
      event.preventDefault();
      updateTouchSteering(event);
    }, { passive: false });
    const endTouchSteering = (event) => {
      if (event.pointerType !== 'touch') return;
      clearTouchSteering(event.pointerId);
    };
    this.renderer.domElement.addEventListener('pointerup', endTouchSteering);
    this.renderer.domElement.addEventListener('pointercancel', endTouchSteering);
    this.renderer.domElement.addEventListener('lostpointercapture', endTouchSteering);
    this.languageButtonEl.addEventListener('pointerdown', event => event.stopPropagation());
    this.languageButtonEl.addEventListener('click', () => this.toggleLanguage());
  }

  visibleDialogButtons() {
    if (this.messageActionsEl.hidden) return [];
    return [
      this.nextButtonEl,
      this.resumeButtonEl,
      this.restartButtonEl,
      this.menuButtonEl,
    ].filter(button => !button.hidden && !button.disabled);
  }

  focusDialogButton(index = 0) {
    const buttons = this.visibleDialogButtons();
    if (!buttons.length) return;
    const resolvedIndex = (index + buttons.length) % buttons.length;
    buttons[resolvedIndex].focus({ preventScroll: true });
  }

  handleDialogKey(event, down) {
    if (!down || !this.messageEl.classList.contains('interactive')) return false;
    const key = event.key.toLowerCase();
    if (!['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'enter'].includes(key)) {
      return false;
    }
    event.preventDefault();
    const buttons = this.visibleDialogButtons();
    if (!buttons.length) return true;
    let index = buttons.indexOf(document.activeElement);
    if (index < 0) index = 0;
    if (key === 'enter') {
      if (!event.repeat) buttons[index].click();
      return true;
    }
    const direction = key === 'arrowleft' || key === 'arrowup' ? -1 : 1;
    this.focusDialogButton(index + direction);
    return true;
  }

  loadNewSeed() {
    // Browser-selected media cannot survive a full page reload, so external
    // tracks intentionally keep their current generated course.
    if (ACTIVE_TRACK.external) return;
    const params = new URLSearchParams(window.location.search);
    params.set('seed', createRandomStageSeed(ACTIVE_TRACK.id));
    params.set('play', '1');
    window.location.search = params.toString();
  }

  loadScenarioSeed(shortcut) {
    // Hidden QA/power-user command: preserve the selected song, force only the
    // visual scenario, and regenerate every other random-stage decision.
    if (ACTIVE_TRACK.external) return;
    const scenarioId = randomScenarioIdForShortcut(shortcut);
    if (!scenarioId) return;
    const params = new URLSearchParams(window.location.search);
    params.set('seed', createRandomStageSeed(ACTIVE_TRACK.id));
    params.set('play', '1');
    params.set('mode', STAGE_MODE.RANDOM);
    params.set('scenario', scenarioId);
    window.location.search = params.toString();
  }

  async startRun() {
    if (this.runStarted || this.startingRun) return;
    this.startingRun = true;
    try {
      await this.renderReady;
      this.runStarted = true;
      this.paused = false;
      this.musicStartError = false;
      this.prepareRunStart();
      this.audio.activate();
      this.connectSpectrum();
      this.audio.setMusicActive(true);
      try {
        await this.jukebox.playFromStart();
      } catch (error) {
        this.runStarted = false;
        this.musicStartError = true;
        this.audio.setMusicActive(false);
        this.handleMusicError(error);
      }
    } finally {
      this.startingRun = false;
    }
  }

  async restartRun() {
    if (!this.runStarted) {
      await this.startRun();
      return;
    }
    this.musicStartError = false;
    this.paused = false;
    this.audio.setPaused(false);
    this.prepareRunStart();
    this.audio.activate();
    this.connectSpectrum();
    this.audio.setMusicActive(true);
    try {
      await this.jukebox.playFromStart();
    } catch (error) {
      this.runStarted = false;
      this.musicStartError = true;
      this.audio.setMusicActive(false);
      this.handleMusicError(error);
    }
  }

  prepareRunStart() {
    this.input.left = this.input.right = this.input.brake = false;
    this.accumulator = 0;
    this.completionMessageReady = true;
    this.lastTime = performance.now();
    this.player.reset();
    this.leadBoarder.reset(this.player, 0);
    this.chaseCamera.reset();
    this.weather.reset();
    this.scenery.update(this.camera, this.player);
    this.updateCenterMessage();
  }

  togglePause() {
    if (!this.runStarted || this.player.finished) return;
    if (this.paused) this.resumeRun();
    else this.pauseRun();
  }

  pauseRun() {
    if (this.paused || !this.runStarted || this.player.finished) return;
    this.paused = true;
    this.input.left = this.input.right = this.input.brake = false;
    this.accumulator = 0;
    this.jukebox.pause();
    this.audio.setPaused(true);
    this.updateCenterMessage();
  }

  async resumeRun() {
    if (!this.paused) return;
    this.paused = false;
    this.lastTime = performance.now();
    this.audio.activate();
    this.audio.setPaused(false);
    this.updateCenterMessage();
    try {
      await this.jukebox.resume();
    } catch (error) {
      this.paused = true;
      this.audio.setPaused(true);
      this.handleMusicError(error);
    }
  }

  completeRun() {
    if (!this.runStarted || this.player.finished) return;
    this.player.finishRun();
    this.completionMessageReady = !this.leadBoarder.config.enabled;
    this.paused = false;
    this.audio.setPaused(false);
    this.audio.setMusicActive(false);
    this.updateCenterMessage();
  }

  handleMusicError(error) {
    console.error(error);
    this.updateCenterMessage();
  }

  toggleLanguage() {
    this.language = this.language === 'ja' ? 'en' : 'ja';
    this.applyLanguage();
  }

  toggleSpectrum() {
    this.spectrumEnabled = !this.spectrumEnabled;
    this.spectrum.setEnabled(this.spectrumEnabled);
  }

  toggleFps() {
    this.fpsEnabled = !this.fpsEnabled;
    this.fpsEl.classList.toggle('disabled', !this.fpsEnabled);
    this.fpsEl.setAttribute('aria-hidden', String(!this.fpsEnabled));
  }

  updateFps(frameMs, workMs) {
    // Ignore only true tab-suspension gaps. Very slow software renderers are
    // still useful during automated QA and should report their actual rate.
    if (frameMs <= 0 || frameMs >= 1000) return;
    this.fpsFrameCount += 1;
    this.fpsElapsedMs += frameMs;
    this.fpsWorkElapsedMs += workMs;
    if (this.fpsElapsedMs < 400) return;
    this.fpsValue = this.fpsFrameCount * 1000 / this.fpsElapsedMs;
    this.frameTimeValue = this.fpsElapsedMs / this.fpsFrameCount;
    const workTime = this.fpsWorkElapsedMs / this.fpsFrameCount;
    const cpuCapacity = Math.round(1000 / Math.max(workTime, 0.1));
    this.fpsEl.textContent = `FPS ${Math.round(this.fpsValue)} · CPU ${workTime.toFixed(1)} MS · MAX ${cpuCapacity}`;
    this.fpsFrameCount = 0;
    this.fpsElapsedMs = 0;
    this.fpsWorkElapsedMs = 0;
  }

  connectSpectrum() {
    if (this.spectrum.analyser) return;
    try {
      const analyser = this.audio.attachMusicElement(this.jukebox.audio);
      if (analyser) this.spectrum.connect(analyser);
    } catch (error) {
      console.warn('Spectrum display is unavailable.', error);
      this.spectrumEnabled = false;
      this.spectrum.setEnabled(false);
    }
  }

  applyLanguage() {
    const text = UI_TEXT[this.language];
    document.documentElement.lang = this.language;
    this.helpEl.textContent = ACTIVE_TRACK.external ? text.helpNoNewCourse : text.help;
    this.distanceLabelEl.textContent = text.distance;
    this.speedLabelEl.textContent = text.speed;
    this.nowPlayingLabelEl.textContent = text.nowPlaying;
    this.languageButtonEl.textContent = text.languageButton;
    this.debugPanel.setLanguage(this.language);
    this.resumeButtonEl.textContent = text.resume;
    this.nextButtonEl.textContent = isFinalTrack(ACTIVE_TRACK)
      ? text.firstTrack
      : text.nextTrack;
    this.restartButtonEl.textContent = text.restart;
    this.menuButtonEl.textContent = text.returnToMenu;
    this.updateCenterMessage();
  }

  updateCenterMessage() {
    const text = UI_TEXT[this.language];
    this.messageEl.classList.remove('interactive', 'pause-state', 'complete-state');
    this.messageActionsEl.hidden = true;
    this.nextButtonEl.hidden = true;
    this.resumeButtonEl.hidden = true;
    this.restartButtonEl.hidden = true;
    this.menuButtonEl.hidden = true;
    if (this.player.finished) {
      if (!this.completionMessageReady) {
        this.messageEl.classList.remove('show');
        return;
      }
      this.messageTitleEl.textContent = text.completeTitle;
      this.messageDetailEl.textContent = text.completeDetail(
        Math.floor(this.player.distanceTravelled)
      );
      this.nextButtonEl.hidden = Boolean(ACTIVE_TRACK.external);
      this.restartButtonEl.hidden = false;
      this.menuButtonEl.hidden = false;
      this.messageActionsEl.hidden = false;
      this.messageEl.classList.add('interactive', 'complete-state');
      this.messageEl.classList.add('show');
      this.focusDialogButton(0);
    } else if (this.paused) {
      this.messageTitleEl.textContent = text.pauseTitle;
      this.messageDetailEl.textContent = text.pauseDetail;
      this.resumeButtonEl.hidden = false;
      this.restartButtonEl.hidden = false;
      this.menuButtonEl.hidden = false;
      this.messageActionsEl.hidden = false;
      this.messageEl.classList.add('interactive', 'pause-state', 'show');
      this.focusDialogButton(0);
    } else if (!this.runStarted) {
      this.messageTitleEl.textContent = this.musicStartError
        ? text.musicErrorTitle
        : text.startTitle;
      this.messageDetailEl.textContent = this.musicStartError
        ? text.musicErrorDetail
        : text.startDetail;
      this.messageEl.classList.add('show');
    } else {
      this.messageEl.classList.remove('show');
    }
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.spectrum.resize();
  }

  fixedUpdate() {
    // The world advances 1.75x faster than wall-clock time. Steering input
    // smoothing receives a real-time-equivalent dt inside Player so controls
    // do not feel like a sped-up recording, while movement/physics do.
    this.player.update(FIXED_DT, this.input, FIXED_DT / WORLD_TIME_SCALE);
    const obstacle = this.scenery.collisionAt(this.player);
    if (obstacle) this.player.hitObstacle(obstacle);
    this.physics.step();
  }

  updateEnvironment(progress) {
    const environment = sampleEnvironment(this.environmentProfile, progress);
    this.environmentSample = environment;
    this.openFogColor.set(environment.fogColor);
    this.environmentFogDensityScale = environment.fogDensityScale;
    this.terrain.material.color.set(environment.snowColor);
    this.hemiLight.color.set(environment.hemisphereSkyColor);
    this.hemiLight.groundColor.set(environment.hemisphereGroundColor);
    this.hemiLight.intensity = environment.hemisphereIntensity;
    this.sunLight.color.set(environment.sunLightColor);
    this.sunLight.intensity = environment.sunLightIntensity;

    const azimuth = this.horizonGlowWorldAzimuth;
    const elevation = THREE.MathUtils.degToRad(environment.sunElevationDeg);
    const lightDistance = 260;
    this.sunTarget.position.copy(this.player.position);
    this.sunLight.position.set(
      this.player.position.x + Math.sin(azimuth) * Math.cos(elevation) * lightDistance,
      this.player.position.y + Math.sin(elevation) * lightDistance,
      this.player.position.z + Math.cos(azimuth) * Math.cos(elevation) * lightDistance
    );
    this.scenery.setEnvironment(
      environment,
      this.player.heading,
      this.horizonGlowWorldAzimuth
    );
  }

  updateAtmosphere() {
    // Fog is an outdoor vista seen through the tunnel mouth as well as an
    // effect around the rider. Keep its color and density track-driven instead
    // of replacing the entire view when the rider crosses a portal.
    this.atmosphereColor.copy(this.openFogColor);
    this.scene.fog.color.copy(this.atmosphereColor);
    this.farScene.fog.color.copy(this.atmosphereColor);
    const fogLayers = fogLayersAt(
      this.atmosphereAmount,
      this.environmentFogDensityScale,
      this.weatherSample.nearMist
    );
    this.localFogStrength = fogLayers.nearMist;
    this.scene.fog.density = this.openNearFogDensity * fogLayers.distanceScale;
    this.farScene.fog.density = this.openFarFogDensity * fogLayers.distanceScale;
  }

  updateHud(playback = this.jukebox.playbackState()) {
    const speed01 = THREE.MathUtils.clamp((this.player.speed - 7) / (38 - 7), 0, 1);
    this.speedFillEl.style.width = `${(speed01 * 100).toFixed(1)}%`;
    this.distanceEl.textContent = `${Math.floor(this.player.distanceTravelled)} M`;
    this.musicProgressEl.style.width = `${(playback.progress * 100).toFixed(2)}%`;
    const subtitleText = playback.cue?.text ?? '';
    if (subtitleText !== this.currentSubtitleText) {
      this.currentSubtitleText = subtitleText;
      this.subtitleEl.textContent = subtitleText;
    }
    this.subtitleEl.classList.toggle(
      'show',
      Boolean(subtitleText && this.runStarted && !this.paused && !this.player.finished)
    );

    this.debugPanel.update({
      progress: playback.progress,
      courseS: this.player.courseS,
      speed: this.player.speed,
      state: this.player.state,
      snowfall: this.weatherSample.snowfall,
      nearMist: this.weatherSample.nearMist,
      wind: this.weatherSample.wind,
      nearFogDensity: this.scene.fog.density,
      farFogDensity: this.farScene.fog.density,
    });
  }

  loop(now) {
    const workStartedAt = performance.now();
    const elapsedMs = now - this.lastTime;
    const rawDt = Math.min(elapsedMs / 1000, 0.10);
    this.lastTime = now;
    // Fast-forward the entire near-world simulation. Because the terrain and
    // obstacles stay fixed while the rider advances more simulation seconds per
    // real second, snow, walls, trees, rocks, jumps and collisions all pass at
    // the same accelerated rate.
    if (this.runStarted && !this.player.finished && !this.paused) {
      this.accumulator += rawDt * WORLD_TIME_SCALE;
    } else {
      this.accumulator = 0;
    }

    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
      this.fixedUpdate();
      this.accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === MAX_STEPS) this.accumulator = 0;

    const renderDt = this.paused ? 0 : Math.min(rawDt, 1 / 30);
    // Camera response is accelerated only part-way. This preserves the close,
    // rideable POV instead of turning steering/camera easing into a literal
    // 1.75x recording.
    this.chaseCamera.update(renderDt * CAMERA_TIME_SCALE);
    this.scenery.update(this.camera, this.player);
    this.nightLighting.update(this.player);
    const playback = this.jukebox.playbackState();
    this.leadBoarder.update(renderDt, this.player, playback.progress);
    if (
      this.player.finished
      && !this.completionMessageReady
      && !this.leadBoarder.root.visible
    ) {
      this.completionMessageReady = true;
      this.updateCenterMessage();
    }
    const tunnel = tunnelAmountAt(this.player.courseS);
    this.updateEnvironment(playback.progress);
    this.weatherSample = sampleWeather(this.weatherProfile, playback.progress);
    this.updateAtmosphere();
    this.weather.update(
      renderDt,
      this.weatherSample,
      this.atmosphereColor,
      this.scene.fog.density,
      tunnel,
      this.localFogStrength
    );
    this.audio.update(this.player);
    this.spectrum.update(now, this.runStarted && !this.player.finished && !this.paused);
    this.updateHud(playback);
    this.renderer.clear();
    this.renderer.render(this.farScene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
    // Actual FPS is VSync-limited. CPU MAX is the inverse of measured main-loop
    // work time, useful as a headroom estimate but intentionally not presented
    // as an actually rendered frame rate or a GPU benchmark.
    this.updateFps(elapsedMs, performance.now() - workStartedAt);
    requestAnimationFrame(this.loop);
  }
}
