const TEXT = Object.freeze({
  ja: Object.freeze({
    title: 'ステージデバッグ',
    close: 'SHIFT + D で閉じる',
    run: 'RUN / ステージ',
    terrain: 'TERRAIN / 地形特性',
    generated: 'GENERATED / 生成物',
    scenery: 'SCENERY / 景観密度',
    direction: 'DIRECTION / 曲演出',
    runtime: 'RUNTIME / 現在値',
    mode: 'モード', authored: '通常ステージ', random: 'ランダムステージ',
    scenario: '環境シナリオ', authoredScenario: '曲固有設定',
    track: '曲', seed: 'シード', type: 'コース型', length: '全長', version: '生成Ver.',
    vistas: '遠景区間', tunnels: 'トンネル', features: '地形ギミック', headings: '方向キー', grades: '勾配キー',
    priorTracks: '既存シュプール', lead: '先行者', lights: 'ナイター照明', enabled: 'あり', disabled: 'なし',
    environment: '環境推移', snowfall: '降雪量', nearMist: '近距離FOG', wind: '風',
    progress: '曲進行', courseS: 'コース位置', speed: '速度', state: '状態', nearFog: '近景FOG密度', farFog: '遠景FOG密度',
  }),
  en: Object.freeze({
    title: 'STAGE DEBUG',
    close: 'SHIFT + D TO CLOSE',
    run: 'RUN / STAGE',
    terrain: 'TERRAIN / PERSONALITY',
    generated: 'GENERATED / CONTENT',
    scenery: 'SCENERY / DENSITY',
    direction: 'DIRECTION / TRACK FX',
    runtime: 'RUNTIME / LIVE VALUES',
    mode: 'MODE', authored: 'STANDARD STAGE', random: 'RANDOM STAGE',
    scenario: 'ENVIRONMENT SCENARIO', authoredScenario: 'TRACK DIRECTION',
    track: 'TRACK', seed: 'SEED', type: 'COURSE TYPE', length: 'LENGTH', version: 'GEN VERSION',
    vistas: 'VISTA ZONES', tunnels: 'TUNNELS', features: 'TERRAIN FEATURES', headings: 'HEADING KEYS', grades: 'GRADE KEYS',
    priorTracks: 'PRIOR TRACKS', lead: 'LEAD BOARDER', lights: 'NIGHT LIGHTS', enabled: 'ON', disabled: 'OFF',
    environment: 'ENVIRONMENT', snowfall: 'SNOWFALL', nearMist: 'NEAR MIST', wind: 'WIND',
    progress: 'TRACK PROGRESS', courseS: 'COURSE POSITION', speed: 'SPEED', state: 'STATE', nearFog: 'NEAR FOG DENSITY', farFog: 'FAR FOG DENSITY',
  }),
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fixed(value, digits = 2) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
}

function percent(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : '—';
}

function range(start, end, key) {
  return `${fixed(start?.[key])} → ${fixed(end?.[key])}`;
}

function row(label, value) {
  return `<div class="debug-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function section(title, rows) {
  return `<section class="debug-section"><h3>${escapeHtml(title)}</h3><dl>${rows.join('')}</dl></section>`;
}

export class StageDebugPanel {
  constructor(parent, { stage, track, mode }) {
    this.stage = stage;
    this.track = track;
    this.mode = mode;
    this.language = 'ja';
    this.visible = false;
    this.lastUpdate = 0;
    this.runtime = null;
    this.element = document.createElement('aside');
    this.element.className = 'stage-debug-panel';
    this.element.hidden = true;
    this.element.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.element);
    this.render();
  }

  toggle() {
    this.visible = !this.visible;
    this.element.hidden = !this.visible;
    this.element.setAttribute('aria-hidden', String(!this.visible));
    if (this.visible) this.renderRuntime();
  }

  setLanguage(language) {
    this.language = language === 'en' ? 'en' : 'ja';
    this.render();
  }

  render() {
    const text = TEXT[this.language];
    const stage = this.stage;
    const profile = this.track.visualProfile ?? {};
    const environment = profile.environment ?? {};
    const weather = profile.weather ?? {};
    const lead = profile.leadBoarder ?? {};
    const lights = profile.nightLighting ?? {};
    const personalityRows = Object.entries(stage.personality).map(([key, value]) => (
      row(key.toUpperCase(), percent(value))
    ));

    this.element.innerHTML = `
      <header class="debug-header">
        <h2>${escapeHtml(text.title)}</h2>
        <span>${escapeHtml(text.close)}</span>
      </header>
      <div class="debug-grid">
        ${section(text.run, [
          row(text.mode, this.mode === 'random' ? text.random : text.authored),
          row(
            text.scenario,
            profile.randomScenario?.[this.language] ?? text.authoredScenario
          ),
          row(text.track, `${String(this.track.id).slice(0, 2)} ${this.track.title}`),
          row(text.seed, stage.seedLabel),
          row(text.type, `${stage.archetype} · ${stage.name}`),
          row(text.length, `${stage.length} m`),
          row(text.version, stage.version),
        ])}
        ${section(text.terrain, personalityRows)}
        ${section(text.generated, [
          row(text.vistas, stage.vistas?.length ?? 0),
          row(text.tunnels, stage.tunnels?.length ?? 0),
          row(text.features, stage.terrainFeatures?.length ?? 0),
          row(text.headings, stage.headingKeysDeg?.length ?? 0),
          row(text.grades, stage.gradeKeys?.length ?? 0),
        ])}
        ${section(text.scenery, Object.entries(stage.scenery ?? {}).map(([key, value]) => (
          row(key, fixed(value))
        )))}
        ${section(text.direction, [
          row(text.priorTracks, profile.snowSurface?.priorTracks === false ? text.disabled : text.enabled),
          row(text.lead, lead.enabled ? text.enabled : text.disabled),
          row(text.lights, lights.enabled ? `${text.enabled} · ${lights.activeLightCount ?? '—'}` : text.disabled),
          row(text.environment, `FOG ${range(environment.start, environment.end, 'fogDensityScale')} · SUN ${range(environment.start, environment.end, 'sunElevationDeg')}°`),
          row(text.snowfall, range(weather.start, weather.end, 'snowfall')),
          row(text.nearMist, range(weather.start, weather.end, 'nearMist')),
          row(text.wind, range(weather.start, weather.end, 'wind')),
        ])}
        <section class="debug-section debug-runtime-section">
          <h3>${escapeHtml(text.runtime)}</h3>
          <dl class="debug-runtime"></dl>
        </section>
      </div>
    `;
    this.runtimeEl = this.element.querySelector('.debug-runtime');
    this.renderRuntime();
  }

  update(runtime, now = performance.now()) {
    this.runtime = runtime;
    if (!this.visible || now - this.lastUpdate < 160) return;
    this.lastUpdate = now;
    this.renderRuntime();
  }

  renderRuntime() {
    if (!this.runtimeEl) return;
    const text = TEXT[this.language];
    const runtime = this.runtime ?? {};
    this.runtimeEl.innerHTML = [
      row(text.progress, percent(runtime.progress)),
      row(text.courseS, `${fixed(runtime.courseS, 1)} m`),
      row(text.speed, `${fixed(runtime.speed, 1)} m/s`),
      row(text.state, runtime.state ?? '—'),
      row(text.snowfall, fixed(runtime.snowfall)),
      row(text.nearMist, fixed(runtime.nearMist)),
      row(text.wind, fixed(runtime.wind)),
      row(text.nearFog, fixed(runtime.nearFogDensity, 5)),
      row(text.farFog, fixed(runtime.farFogDensity, 5)),
    ].join('');
  }
}
