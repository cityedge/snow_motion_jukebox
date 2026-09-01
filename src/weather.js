import * as THREE from 'three';

const clamp01 = value => Math.max(0, Math.min(1, value));
const NEAR_MIST_GAMEPLAY_CAP = 0.92;
const BASE_FLAKE_COUNT = 760;
const MAX_SNOWFALL = 2;
const MAX_CROSSWIND_METERS_PER_SECOND = 16.8;
const SNOWFALL_EXPONENTIAL_STEEPNESS = 2;

export const DEFAULT_WEATHER_PROFILE = Object.freeze({
  transitionEnd: 1,
  start: Object.freeze({
    snowfall: 0,
    nearMist: 0,
    wind: 0,
  }),
  end: Object.freeze({
    snowfall: 0,
    nearMist: 0,
    wind: 0,
  }),
});

function smoothstep01(value) {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
}

export function sampleWeather(profile, progress) {
  const source = profile ?? DEFAULT_WEATHER_PROFILE;
  const start = { ...DEFAULT_WEATHER_PROFILE.start, ...(source.start ?? {}) };
  const end = { ...DEFAULT_WEATHER_PROFILE.end, ...(source.end ?? {}) };
  const transitionEnd = Math.max(0.01, source.transitionEnd ?? 1);
  const linearPhase = clamp01(progress / transitionEnd);
  const phase = smoothstep01(linearPhase);
  const snowfallPhase = source.snowfallCurve === 'exponential'
    ? Math.expm1(SNOWFALL_EXPONENTIAL_STEEPNESS * linearPhase)
      / Math.expm1(SNOWFALL_EXPONENTIAL_STEEPNESS)
    : phase;
  return {
    phase,
    snowfallPhase,
    snowfall: THREE.MathUtils.lerp(start.snowfall, end.snowfall, snowfallPhase),
    nearMist: THREE.MathUtils.lerp(start.nearMist, end.nearMist, phase),
    wind: THREE.MathUtils.lerp(start.wind, end.wind, phase),
  };
}

export function fogLayersAt(atmosphereAmount, environmentDensityScale, trackNearMist = 0) {
  const atmosphere = clamp01(atmosphereAmount);
  const environmentScale = Math.max(0, environmentDensityScale ?? 1);
  const environmentExtra = environmentScale - 1;
  return {
    // Preserve depth separation, but compress it strongly so high FOG values
    // do not erase the course into a flat wall of atmospheric color.
    distanceScale: Math.max(0.35, 1 + atmosphere * 0.22 + environmentExtra * 0.35),
    // FOG primarily controls a camera-near veil. Track weather remains an
    // independent artistic baseline, then stage/environment fog add to it.
    nearMist: clamp01(
      trackNearMist
      + atmosphere * 0.40
      + Math.max(0, environmentExtra) * 0.22
    ),
  };
}

export function nearMistPresentationAt(nearMist) {
  // The former 80%-through-the-song value is the accepted gameplay limit.
  // Values above it may still exist in track data, but no longer erase more
  // of the route than that accepted frame.
  const amount = Math.min(clamp01(nearMist), NEAR_MIST_GAMEPLAY_CAP);
  const whiteout = amount * amount;
  return {
    opacity: whiteout * 0.88,
    whiteness: whiteout * 0.92,
  };
}

export function tunnelWeatherVisibilityAt(tunnelAmount) {
  return {
    // Snow is genuinely blocked by the roof. Near mist is a screen-space
    // atmosphere shared with the visible exit, so suppressing it here caused
    // the outside weather to pop on only after crossing the portal.
    snowfall: 1 - THREE.MathUtils.smoothstep(tunnelAmount, 0.08, 0.82),
    nearMist: 1,
  };
}

function seededRandom(seed = 0x51f15e) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createSnowflakeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 64, 64);
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.18, 'rgba(255, 255, 255, 0.96)');
  gradient.addColorStop(0.48, 'rgba(255, 255, 255, 0.58)');
  gradient.addColorStop(0.76, 'rgba(255, 255, 255, 0.16)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(32, 32, 31, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class LocalWeather {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.baseFlakeCount = BASE_FLAKE_COUNT;
    this.maxFlakes = BASE_FLAKE_COUNT * MAX_SNOWFALL;
    this.random = seededRandom();
    this.center = new THREE.Vector3();
    this.previousCenter = new THREE.Vector3();
    this.localPosition = new THREE.Vector3();
    this.inverseCameraQuaternion = new THREE.Quaternion();
    this.windRight = new THREE.Vector3();
    this.initialized = false;
    this.halfWidth = 48;
    this.halfDepth = 55;
    this.below = 9;
    this.above = 26;

    this.positions = new Float32Array(this.maxFlakes * 3);
    this.sizes = new Float32Array(this.maxFlakes);
    this.alphas = new Float32Array(this.maxFlakes);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));

    this.material = new THREE.PointsMaterial({
      color: 0xf8fbff,
      map: createSnowflakeTexture(),
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      depthTest: true,
      alphaTest: 0.008,
      size: 0.52,
      sizeAttenuation: true,
      // The particle volume is already local. Leaving point fog disabled keeps
      // flakes legible against the similarly colored atmospheric background.
      fog: false,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 80;
    scene.add(this.points);

    this.mistMaterial = new THREE.MeshBasicMaterial({
      color: 0xb6d0dc,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      side: THREE.BackSide,
    });
    this.whiteoutColor = new THREE.Color(0xf4f7f8);
    this.mistShell = new THREE.Mesh(
      new THREE.SphereGeometry(20, 16, 10),
      this.mistMaterial
    );
    this.mistShell.frustumCulled = false;
    this.mistShell.renderOrder = 90;
    scene.add(this.mistShell);
  }

  reset() {
    this.center.copy(this.camera.position);
    this.previousCenter.copy(this.center);
    for (let index = 0; index < this.maxFlakes; index += 1) {
      this.placeFlake(index, true);
      this.sizes[index] = THREE.MathUtils.lerp(0.34, 0.78, this.random());
      this.alphas[index] = THREE.MathUtils.lerp(0.48, 0.92, this.random());
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
    this.initialized = true;
  }

  placeFlake(index, anywhere = false) {
    const offset = index * 3;
    const depth = anywhere
      ? THREE.MathUtils.lerp(3, 64, this.random())
      : THREE.MathUtils.lerp(48, 64, this.random());
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * depth;
    const halfWidth = halfHeight * this.camera.aspect;
    this.localPosition.set(
      (this.random() * 2 - 1) * halfWidth * 1.04,
      THREE.MathUtils.lerp(-halfHeight * 0.48, halfHeight * 1.08, this.random()),
      -depth
    );
    this.localPosition.applyQuaternion(this.camera.quaternion).add(this.center);
    this.positions[offset] = this.localPosition.x;
    this.positions[offset + 1] = this.localPosition.y;
    this.positions[offset + 2] = this.localPosition.z;
  }

  update(deltaSeconds, weather, fogColor, fogDensity, tunnelAmount = 0, nearMist = weather.nearMist) {
    if (!this.initialized) this.reset();
    this.previousCenter.copy(this.center);
    this.center.copy(this.camera.position);

    const tunnelVisibility = tunnelWeatherVisibilityAt(tunnelAmount);
    const snowfall = Math.max(0, Math.min(MAX_SNOWFALL, weather.snowfall))
      * tunnelVisibility.snowfall;
    const activeFlakes = Math.round(this.baseFlakeCount * snowfall);
    this.points.geometry.setDrawRange(0, activeFlakes);
    this.points.visible = activeFlakes > 0;
    this.material.opacity = 0.96 * THREE.MathUtils.smoothstep(snowfall, 0.02, 0.18);

    const dt = Math.min(deltaSeconds, 1 / 20);
    this.windRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.windRight.y = 0;
    if (this.windRight.lengthSq() < 0.0001) this.windRight.set(1, 0, 0);
    else this.windRight.normalize();
    const crosswindSpeed = weather.wind * MAX_CROSSWIND_METERS_PER_SECOND;
    const windX = this.windRight.x * crosswindSpeed;
    const windZ = this.windRight.z * crosswindSpeed;
    this.inverseCameraQuaternion.copy(this.camera.quaternion).invert();

    for (let index = 0; index < activeFlakes; index += 1) {
      const offset = index * 3;
      this.positions[offset] += windX * dt;
      this.positions[offset + 1] -= (3.1 + this.sizes[index] * 3.8) * dt;
      this.positions[offset + 2] += windZ * dt;
      this.localPosition.set(
        this.positions[offset] - this.center.x,
        this.positions[offset + 1] - this.center.y,
        this.positions[offset + 2] - this.center.z
      ).applyQuaternion(this.inverseCameraQuaternion);
      const depth = -this.localPosition.z;
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5))
        * Math.max(depth, 1);
      const halfWidth = halfHeight * this.camera.aspect;
      if (
        depth < 1 || depth > 68
        || Math.abs(this.localPosition.x) > halfWidth * 1.18
        || this.localPosition.y < -halfHeight * 0.70
        || this.localPosition.y > halfHeight * 1.22
      ) {
        this.placeFlake(index);
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;

    this.mistShell.position.copy(this.center);
    const mistPresentation = nearMistPresentationAt(nearMist);
    this.mistMaterial.color
      .set(fogColor)
      .lerp(this.whiteoutColor, mistPresentation.whiteness);
    this.mistMaterial.opacity = mistPresentation.opacity * tunnelVisibility.nearMist;
    this.mistShell.visible = this.mistMaterial.opacity > 0.001;
  }
}
