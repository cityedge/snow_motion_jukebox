const STORAGE_KEY = 'snow-motion-master-volume';
const DEFAULT_MASTER_VOLUME = 1;

export function clampMasterVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_MASTER_VOLUME;
  return Math.max(0, Math.min(1, numeric));
}

export function readMasterVolume(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    return stored === null ? DEFAULT_MASTER_VOLUME : clampMasterVolume(stored);
  } catch {
    return DEFAULT_MASTER_VOLUME;
  }
}

export function writeMasterVolume(value, storage = globalThis.localStorage) {
  const normalized = clampMasterVolume(value);
  try {
    storage?.setItem(STORAGE_KEY, String(normalized));
  } catch {
    // The game still uses the selected volume when storage is unavailable.
  }
  return normalized;
}

export const MASTER_VOLUME_STORAGE_KEY = STORAGE_KEY;
export const DEFAULT_MASTER_VOLUME_VALUE = DEFAULT_MASTER_VOLUME;
