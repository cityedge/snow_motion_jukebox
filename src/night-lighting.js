import * as THREE from 'three';
import {
  COURSE,
  pointAt,
  rightAt,
  tangentAt,
  wallInfoAt,
} from './course.js';
import { ACTIVE_STAGE, isTunnelAt } from './stage.js';

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  spacing: 34,
  stationCount: 24,
  activeLightCount: 24,
  poleHeight: 8.2,
  lightIntensity: 520,
});

const TMP_POINT = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_FORWARD = new THREE.Vector3();
const TMP_MATRIX = new THREE.Matrix4();
const TMP_QUATERNION = new THREE.Quaternion();
const TMP_SCALE = new THREE.Vector3();

function polePosition(s, side, poleHeight, target = new THREE.Vector3()) {
  const wall = wallInfoAt(s);
  const shoulder = side < 0 ? wall.leftShoulder : wall.rightShoulder;
  const lateral = side * Math.max(11.5, shoulder + 1.8);
  pointAt(s, lateral, target);
  target.y += poleHeight * 0.5;
  return { target, lateral };
}

function setInstanceMatrix(mesh, index, position, quaternion, scale) {
  TMP_MATRIX.compose(position, quaternion, scale);
  mesh.setMatrixAt(index, TMP_MATRIX);
}

export function nightLightStationLayout(courseS, config = {}) {
  const settings = { ...DEFAULT_CONFIG, ...config };
  // Offset the grid from zero so its world positions remain identical when the
  // recycled window advances. The first row stays under/behind the rider until
  // the next row reaches them; the remaining rows are all ahead.
  const anchor = 2 + Math.floor(Math.max(0, courseS - 2) / settings.spacing)
    * settings.spacing;
  const span = (settings.stationCount - 1) * settings.spacing;
  const first = THREE.MathUtils.clamp(
    anchor,
    2,
    Math.max(2, COURSE.length - 2 - span)
  );
  const stations = [];
  for (let i = 0; i < settings.stationCount; i++) {
    stations.push(first + i * settings.spacing);
  }
  return stations;
}

export function nightLightActiveStations(courseS, stations, activeLightCount) {
  const rowCount = Math.max(0, Math.floor(activeLightCount));
  return stations.slice(0, rowCount);
}

export function nightLightSideAt(s, spacing = DEFAULT_CONFIG.spacing) {
  const globalIndex = Math.max(0, Math.round((s - 2) / spacing));
  return Math.floor(globalIndex / 10) % 2 === 0 ? -1 : 1;
}

export function isNightLightStationAllowed(s, stage = ACTIVE_STAGE) {
  // Keep fixtures clear of the portal itself as well as the roofed interval.
  // Outdoor light may still spill naturally through the opening from beyond.
  return !isTunnelAt(s, 6, stage);
}

export class NightLighting {
  constructor(scene, config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.enabled = Boolean(this.config.enabled);
    this.group = new THREE.Group();
    this.group.visible = this.enabled;
    scene.add(this.group);
    this.lastAnchor = Number.NaN;
    this.stations = [];

    if (!this.enabled) return;

    const instanceCount = this.config.stationCount;
    const poleMaterial = new THREE.MeshLambertMaterial({
      color: 0x263342,
      flatShading: true,
    });
    const fixtureMaterial = new THREE.MeshLambertMaterial({
      color: 0x394655,
      flatShading: true,
    });
    const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xfff1c7 });
    this.poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.10, 0.16, 1, 6),
      poleMaterial,
      instanceCount
    );
    this.fixtures = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      fixtureMaterial,
      instanceCount
    );
    this.bulbs = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      bulbMaterial,
      instanceCount
    );
    for (const mesh of [this.poles, this.fixtures, this.bulbs]) {
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }

    this.lights = [];
    for (let i = 0; i < this.config.activeLightCount; i++) {
      const light = new THREE.SpotLight(
        0xfff0cf,
        this.config.lightIntensity,
        78,
        THREE.MathUtils.degToRad(50),
        0.96,
        1.25
      );
      light.castShadow = false;
      // Keep the number of visible SpotLights constant. Three.js includes the
      // visible-light count in its shader program key, so hiding tunnel rows
      // one by one compiled several new variants during the opening seconds of
      // Track 7. Disabled slots remain present with zero intensity instead.
      light.visible = true;
      const target = new THREE.Object3D();
      scene.add(light, target);
      light.target = target;
      this.lights.push({ light, target });
    }
  }

  rebuild(courseS) {
    if (!this.enabled) return;
    const stations = nightLightStationLayout(courseS, this.config);
    const anchor = stations[0];
    if (anchor === this.lastAnchor) return;
    this.lastAnchor = anchor;
    this.stations = stations;

    const up = new THREE.Vector3(0, 1, 0);
    let index = 0;
    for (const s of this.stations) {
      if (!isNightLightStationAllowed(s)) {
        TMP_POINT.set(0, -1000, 0);
        TMP_QUATERNION.identity();
        TMP_SCALE.setScalar(0);
        setInstanceMatrix(this.poles, index, TMP_POINT, TMP_QUATERNION, TMP_SCALE);
        setInstanceMatrix(this.fixtures, index, TMP_POINT, TMP_QUATERNION, TMP_SCALE);
        setInstanceMatrix(this.bulbs, index, TMP_POINT, TMP_QUATERNION, TMP_SCALE);
        index += 1;
        continue;
      }
      const side = nightLightSideAt(s, this.config.spacing);
      tangentAt(s, TMP_FORWARD);
      rightAt(s, TMP_RIGHT);
      TMP_MATRIX.makeBasis(TMP_RIGHT, up, TMP_FORWARD);
      TMP_QUATERNION.setFromRotationMatrix(TMP_MATRIX);

      const { target: center } = polePosition(
        s,
        side,
        this.config.poleHeight,
        TMP_POINT
      );
      TMP_SCALE.set(1, this.config.poleHeight, 1);
      setInstanceMatrix(this.poles, index, center, TMP_QUATERNION, TMP_SCALE);

      const top = center.clone();
      top.y += this.config.poleHeight * 0.5 - 0.30;
      top.addScaledVector(TMP_RIGHT, -side * 0.52);
      TMP_SCALE.set(1.30, 0.30, 0.55);
      setInstanceMatrix(this.fixtures, index, top, TMP_QUATERNION, TMP_SCALE);

      const bulb = top.clone();
      bulb.y -= 0.18;
      bulb.addScaledVector(TMP_RIGHT, -side * 0.18);
      TMP_SCALE.set(1.5, 0.75, 1.5);
      setInstanceMatrix(this.bulbs, index, bulb, TMP_QUATERNION, TMP_SCALE);
      index += 1;
    }
    this.poles.instanceMatrix.needsUpdate = true;
    this.fixtures.instanceMatrix.needsUpdate = true;
    this.bulbs.instanceMatrix.needsUpdate = true;
  }

  update(player) {
    if (!this.enabled) return;
    this.rebuild(player.courseS);

    // Only the nearest upcoming fixtures receive real SpotLights. The poles
    // themselves are inexpensive instances and are recycled along the course.
    const candidates = nightLightActiveStations(
      player.courseS,
      this.stations,
      this.config.activeLightCount
    ).map(s => ({
      s,
      side: nightLightSideAt(s, this.config.spacing),
      allowed: isNightLightStationAllowed(s),
    }));

    for (let i = 0; i < this.lights.length; i++) {
      const rig = this.lights[i];
      const candidate = candidates[i];
      // Do not toggle visibility: that changes NUM_SPOT_LIGHTS and causes a
      // fresh material program to compile. Zero intensity is visually
      // identical while retaining the already-warmed shader configuration.
      rig.light.visible = true;
      if (!candidate || !candidate.allowed) {
        rig.light.intensity = 0;
        continue;
      }

      const { target: poleCenter } = polePosition(
        candidate.s,
        candidate.side,
        this.config.poleHeight,
        TMP_POINT
      );
      rightAt(candidate.s, TMP_RIGHT);
      const lightDistance = candidate.s - player.courseS;
      // The last real lamp enters almost 800 m ahead and fades up there. The
      // foot row remains at full strength until the grid recycles behind view.
      const lightWeight = 1 - THREE.MathUtils.smoothstep(lightDistance, 680, 810);
      rig.light.intensity = this.config.lightIntensity * lightWeight;
      rig.light.position.copy(poleCenter);
      rig.light.position.y += this.config.poleHeight * 0.5 - 0.46;
      rig.light.position.addScaledVector(TMP_RIGHT, -candidate.side * 0.72);

      // One-sided fixtures deliberately throw across the piste. This preserves
      // a darker far edge and makes each pool read as directional illumination.
      pointAt(candidate.s + 13.5, -candidate.side * 3.4, rig.target.position);
      rig.target.position.y += 0.12;
    }
  }
}
