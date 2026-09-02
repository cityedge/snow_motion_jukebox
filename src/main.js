import './style.css';
import { MainMenu, initialMenuTrack } from './main-menu.js';
import { findTrack, nextTrackAfter, setActiveTrack } from './track-manifest.js';
import { createRandomStageSeed, normalizeStageMode, STAGE_MODE } from './run-mode.js';
import {
  createRandomStageTrack,
  normalizeRandomScenarioId,
} from './random-profile.js';

const root = document.querySelector('#app');
const rapierReady = import('@dimforge/rapier3d-compat').then(async module => {
  const RAPIER = module.default;
  await RAPIER.init();
  return RAPIER;
});

function showBootError(error) {
  console.error(error);
  root.innerHTML = `
    <div class="boot-error">
      <strong>ゲームを起動できませんでした</strong>
      <span>依存関係を確認して、もう一度読み込んでください。</span>
    </div>
  `;
}

function returnToMenu(track) {
  const params = new URLSearchParams();
  if (!track.external) params.set('track', String(track.id).slice(0, 2));
  window.location.search = params.toString();
}

function continueToNextTrack(track) {
  const nextTrack = nextTrackAfter(track);
  if (!nextTrack) {
    returnToMenu(track);
    return;
  }
  const params = new URLSearchParams();
  params.set('track', String(nextTrack.id).slice(0, 2));
  params.set('play', '1');
  window.location.search = params.toString();
}

async function launchGame(track, {
  startImmediately = true,
  stageMode = STAGE_MODE.AUTHORED,
  stageSeed = null,
  scenarioId = null,
  launchPlayback = null,
} = {}) {
  try {
    const normalizedMode = track.external
      ? STAGE_MODE.RANDOM
      : normalizeStageMode(stageMode);
    // Every ride receives a reproducible layout seed. In authored mode the
    // track's fixed seed still supplies its personality/scene plan; only the
    // concrete route and placement change. Random mode uses this seed for both.
    const resolvedSeed = stageSeed || createRandomStageSeed(track.id);
    const resolvedScenarioId = normalizedMode === STAGE_MODE.RANDOM
      ? normalizeRandomScenarioId(scenarioId)
      : null;
    const gameTrack = normalizedMode === STAGE_MODE.RANDOM
      ? createRandomStageTrack(track, resolvedSeed, resolvedScenarioId)
      : track;
    setActiveTrack(gameTrack);
    const params = new URLSearchParams(window.location.search);
    if (track.external) params.delete('track');
    else params.set('track', String(track.id).slice(0, 2));
    params.delete('play');
    params.set('seed', resolvedSeed);
    if (normalizedMode === STAGE_MODE.RANDOM) {
      params.set('mode', STAGE_MODE.RANDOM);
      if (resolvedScenarioId) params.set('scenario', resolvedScenarioId);
      else params.delete('scenario');
    } else {
      params.delete('mode');
      params.delete('scenario');
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);

    const [RAPIER, { Game }] = await Promise.all([
      rapierReady,
      import('./game.js'),
    ]);
    const game = new Game(root, RAPIER, {
      onRequestMenu: () => returnToMenu(track),
      onRequestNextTrack: () => continueToNextTrack(track),
      launchPlayback,
    });
    if (startImmediately) await game.startRun();
  } catch (error) {
    showBootError(error);
  }
}

function showMenu() {
  let menu;
  menu = new MainMenu(root, {
    initialTrack: initialMenuTrack(),
    onConfirm: async (track, options) => {
      menu.destroy();
      await launchGame(track, options);
    },
  });
}

const params = new URLSearchParams(window.location.search);
const directPlayTrack = params.get('play') === '1'
  ? findTrack(params.get('track'))
  : null;

if (directPlayTrack) launchGame(directPlayTrack, {
  startImmediately: false,
  stageMode: normalizeStageMode(params.get('mode')),
  stageSeed: params.get('seed'),
  scenarioId: params.get('scenario'),
});
else showMenu();
