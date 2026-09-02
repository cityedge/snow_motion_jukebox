export const TOUCH_PAUSE_HEIGHT_RATIO = 0.20;

export function touchControlAt(clientX, clientY, bounds) {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;

  const x = clientX - bounds.left;
  const y = clientY - bounds.top;
  if (x < 0 || x > bounds.width || y < 0 || y > bounds.height) return null;

  if (y < bounds.height * TOUCH_PAUSE_HEIGHT_RATIO) return 'pause';
  return x < bounds.width / 2 ? 'left' : 'right';
}
