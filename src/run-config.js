import { ACTIVE_TRACK } from './track-manifest.js';

export const WORLD_TIME_SCALE = 1.75;
export const MAX_RIDE_SPEED = 38;

export const DEFAULT_RUN_DURATION_SECONDS = ACTIVE_TRACK.durationSeconds;
export const DEFAULT_RUN_SEED = ACTIVE_TRACK.seed;

const MIN_RUN_DURATION_SECONDS = 30;
const MAX_RUN_DURATION_SECONDS = 15 * 60;
const COURSE_SAFETY_MARGIN_METERS = 750;
const COURSE_LENGTH_INCREMENT_METERS = 250;

export function normalizeRunDuration(value, fallback = DEFAULT_RUN_DURATION_SECONDS) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(MIN_RUN_DURATION_SECONDS, Math.min(MAX_RUN_DURATION_SECONDS, parsed));
}

export function courseLengthForDuration(durationSeconds) {
  const duration = normalizeRunDuration(durationSeconds);
  const maximumTravel = duration * WORLD_TIME_SCALE * MAX_RIDE_SPEED;
  return Math.ceil(
    (maximumTravel + COURSE_SAFETY_MARGIN_METERS) / COURSE_LENGTH_INCREMENT_METERS
  ) * COURSE_LENGTH_INCREMENT_METERS;
}
