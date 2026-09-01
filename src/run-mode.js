export const STAGE_MODE = Object.freeze({
  AUTHORED: 'authored',
  RANDOM: 'random',
});

export function normalizeStageMode(value) {
  return value === STAGE_MODE.RANDOM ? STAGE_MODE.RANDOM : STAGE_MODE.AUTHORED;
}

export function createRandomStageSeed(trackId, cryptoApi = globalThis.crypto) {
  const values = new Uint32Array(2);
  cryptoApi.getRandomValues(values);
  const randomPart = [...values]
    .map(value => value.toString(16).padStart(8, '0'))
    .join('');
  return `random-${trackId}-${randomPart}`;
}
