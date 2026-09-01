function timestampToSeconds(value) {
  const match = String(value).trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) throw new Error(`Invalid SRT timestamp: ${value}`);
  const [, hours, minutes, seconds, milliseconds] = match;
  return Number(hours) * 3600
    + Number(minutes) * 60
    + Number(seconds)
    + Number(milliseconds) / 1000;
}

export function parseSrt(source) {
  const normalized = String(source ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const cues = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timeIndex = lines.findIndex(line => line.includes('-->'));
    if (timeIndex < 0) continue;

    const [startText, endText] = lines[timeIndex].split('-->').map(value => value.trim());
    const text = lines.slice(timeIndex + 1).join('\n').trim();
    if (!text) continue;

    const start = timestampToSeconds(startText);
    const end = timestampToSeconds(endText);
    if (end <= start) throw new Error(`Invalid SRT cue range: ${lines[timeIndex]}`);
    cues.push({ start, end, text });
  }

  cues.sort((a, b) => a.start - b.start);
  return cues;
}

export function subtitleAt(cues, timeSeconds) {
  let lo = 0;
  let hi = cues.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cue = cues[mid];
    if (timeSeconds < cue.start) hi = mid - 1;
    else if (timeSeconds >= cue.end) lo = mid + 1;
    else return cue;
  }
  return null;
}
