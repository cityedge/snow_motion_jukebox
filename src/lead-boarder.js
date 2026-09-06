import * as THREE from 'three';
import {
  COURSE,
  normalAtCourse,
  pointAt,
  terrainFeatureContextAt,
  wallInfoAt,
} from './course.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const TMP_POINT = new THREE.Vector3();
const TMP_NORMAL = new THREE.Vector3();
const TMP_BEHIND = new THREE.Vector3();
const TMP_AHEAD = new THREE.Vector3();
const TMP_FORWARD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_MATRIX = new THREE.Matrix4();
const TMP_QUATERNION = new THREE.Quaternion();
const TMP_TAKEOFF = new THREE.Vector3();
const TMP_LANDING = new THREE.Vector3();

const DEFAULTS = Object.freeze({
  enabled: false,
  startProgress: 0,
  endProgress: 1,
  distanceAhead: 46,
  carveAmplitude: 4.2,
  carveWavelength: 240,
  phase: 0.35,
  departureSpeed: 42,
  departureDistance: 190,
});

function normalizedConfig(config = {}) {
  return { ...DEFAULTS, ...config };
}

function lateralAt(s, config) {
  const wave = Math.max(24, config.carveWavelength);
  const phase = s / wave * TAU + config.phase;
  const requested = Math.sin(phase) * config.carveAmplitude;
  const wall = wallInfoAt(s);
  return THREE.MathUtils.clamp(
    requested,
    -Math.max(1.5, wall.leftShoulder - 3.8),
    Math.max(1.5, wall.rightShoulder - 3.8)
  );
}

/**
 * Deterministic course-space motion for the decorative lead rider.
 * The lead coordinate is derived from the player every frame, so catching him
 * is impossible even when the player brakes, collides, or takes a shorter line.
 */
export function sampleLeadBoarderMotion(playerS, progress, options = {}) {
  const config = normalizedConfig(options);
  const visible = config.enabled
    && progress >= config.startProgress
    && progress <= config.endProgress;
  const s = THREE.MathUtils.clamp(
    playerS + Math.max(18, config.distanceAhead),
    0,
    COURSE.length - 3
  );
  const phase = s / Math.max(24, config.carveWavelength) * TAU + config.phase;
  return {
    visible,
    s,
    d: lateralAt(s, config),
    carve: Math.cos(phase),
  };
}

export function sampleLeadBoarderDeparture(startS, elapsed, options = {}) {
  const config = normalizedConfig(options);
  const travelled = Math.max(0, elapsed) * Math.max(1, config.departureSpeed);
  const s = THREE.MathUtils.clamp(startS + travelled, 0, COURSE.length - 3);
  return {
    visible: config.enabled
      && travelled <= Math.max(40, config.departureDistance)
      && s < COURSE.length - 3,
    s,
    d: lateralAt(s, config),
    carve: Math.cos(s / Math.max(24, config.carveWavelength) * TAU + config.phase),
    travelled,
  };
}

/**
 * Authored, exaggerated flight used when the lead rider crosses a terrain
 * feature. The long deterministic arc matches the arcade player's visual
 * language without adding a second physics body to the scene.
 */
export function sampleLeadBoarderJump(s) {
  const context = terrainFeatureContextAt(s);
  if (!context) return { airborne: false, height: 0 };
  const { feature } = context;

  // Match the player's authored trigger windows: rollers release just before
  // the crown, while jump ramps release on their positive-slope lip.
  const takeoffS = feature.centerS + feature.halfLength * (
    feature.kind === 'jump' ? 0.26 : -0.08
  );
  // User-tuned from the previous prototype: 1.3x farther while staying low.
  const nominalFlightLength = feature.kind === 'jump' ? 72.8 : 49.4;
  // A nearby following feature can become the nearest feature while this arc
  // is still airborne. End before that hand-off so pointAtLeadRoute never
  // snaps from a positive jump height directly back onto the snow.
  const handoffMargin = 3;
  const flightLength = Math.min(
    nominalFlightLength,
    context.nextSwitchS - handoffMargin - takeoffS,
  );
  // Extremely tight layouts do not have enough room for a readable complete
  // arc. Treat those as ordinary terrain instead of creating a sharp hop.
  if (flightLength < 10) return { airborne: false, height: 0 };
  const landingS = takeoffS + flightLength;
  if (s < takeoffS || s > landingS) return { airborne: false, height: 0 };

  const u = THREE.MathUtils.clamp((s - takeoffS) / flightLength, 0, 1);
  // 0.4x the previous peak heights.
  const nominalPeakHeight = feature.kind === 'jump' ? 2.8 : 1.92;
  // Scale height with distance so a shortened arc retains the accepted
  // takeoff/descent angle instead of becoming a steep miniature jump.
  const peakHeight = nominalPeakHeight * (flightLength / nominalFlightLength);
  return {
    airborne: true,
    kind: feature.kind,
    flightLength,
    nominalFlightLength,
    peakHeight,
    shortened: flightLength < nominalFlightLength,
    // A single ballistic parabola: zero at takeoff/landing and exactly one
    // apex. It is deliberately independent of terrain height while airborne.
    height: 4 * u * (1 - u) * peakHeight,
    progress: u,
    takeoffS,
    landingS,
  };
}

function pointAtLeadRoute(s, config, target) {
  const d = lateralAt(s, config);
  const jump = sampleLeadBoarderJump(s);
  pointAt(s, d, target);
  if (!jump.airborne) return jump;

  pointAt(jump.takeoffS, lateralAt(jump.takeoffS, config), TMP_TAKEOFF);
  pointAt(jump.landingS, lateralAt(jump.landingS, config), TMP_LANDING);
  // Follow the straight gravity chord between the two snow heights, not the
  // intervening roller geometry. Adding the parabola above this chord prevents
  // the terrain from creating a second upward kick during descent.
  target.y = THREE.MathUtils.lerp(TMP_TAKEOFF.y, TMP_LANDING.y, jump.progress)
    + jump.height;
  return jump;
}

export class LeadBoarder {
  constructor(scene, options = {}) {
    this.config = normalizedConfig(options);
    this.root = createLeadBoarderModel();
    this.pose = this.root.userData.pose;
    this.upperBody = this.root.userData.upperBody;
    this.torso = this.root.userData.torso;
    this.leftArm = this.root.userData.leftArm;
    this.rightArm = this.root.userData.rightArm;
    this.initialized = false;
    this.departureStartS = null;
    this.departureElapsed = 0;
    this.currentS = 0;
    scene.add(this.root);
  }

  reset(player, progress = 0) {
    this.initialized = false;
    this.departureStartS = null;
    this.departureElapsed = 0;
    this.update(0, player, progress, true);
  }

  update(dt, player, progress, snap = false) {
    let motion;
    if (player.finished && this.config.enabled) {
      if (this.departureStartS === null) {
        this.departureStartS = this.currentS;
        this.departureElapsed = 0;
      }
      this.departureElapsed += Math.max(0, dt);
      motion = sampleLeadBoarderDeparture(
        this.departureStartS,
        this.departureElapsed,
        this.config
      );
    } else {
      this.departureStartS = null;
      this.departureElapsed = 0;
      motion = sampleLeadBoarderMotion(player.courseS, progress, this.config);
    }
    this.root.visible = motion.visible;
    if (!motion.visible) return;
    this.currentS = motion.s;

    const probe = 1.15;
    const behindS = Math.max(0, motion.s - probe);
    const aheadS = Math.min(COURSE.length, motion.s + probe);
    pointAtLeadRoute(behindS, this.config, TMP_BEHIND);
    pointAtLeadRoute(aheadS, this.config, TMP_AHEAD);
    const jump = pointAtLeadRoute(motion.s, this.config, TMP_POINT);
    normalAtCourse(motion.s, motion.d, TMP_NORMAL);

    TMP_FORWARD.subVectors(TMP_AHEAD, TMP_BEHIND);
    if (!jump.airborne) {
      TMP_FORWARD.addScaledVector(TMP_NORMAL, -TMP_FORWARD.dot(TMP_NORMAL));
    }
    TMP_FORWARD.normalize();
    TMP_RIGHT.crossVectors(TMP_NORMAL, TMP_FORWARD).normalize();
    if (jump.airborne) {
      TMP_NORMAL.crossVectors(TMP_FORWARD, TMP_RIGHT).normalize();
    }
    TMP_MATRIX.makeBasis(TMP_RIGHT, TMP_NORMAL, TMP_FORWARD);
    TMP_QUATERNION.setFromRotationMatrix(TMP_MATRIX);

    this.root.position.copy(TMP_POINT).addScaledVector(TMP_NORMAL, 0.09);
    if (!this.initialized || snap || dt <= 0) {
      this.root.quaternion.copy(TMP_QUATERNION);
      this.initialized = true;
    } else {
      this.root.quaternion.slerp(TMP_QUATERNION, 1 - Math.exp(-dt * 12));
    }

    const leanScale = jump.airborne ? 0.42 : 1;
    const lean = -motion.carve * THREE.MathUtils.degToRad(30) * leanScale;
    const crouchPulse = Math.sin(motion.s * 0.18) * 0.018;
    const poseRate = snap || dt <= 0 ? 1 : 1 - Math.exp(-dt * 9);
    this.pose.rotation.z += (lean - this.pose.rotation.z) * poseRate;
    // The board, legs and hips commit to the edge, while the torso counters
    // most of that angle around the waist and stays close to upright.
    const upperCounterLean = -lean * 0.82;
    this.upperBody.rotation.z += (
      upperCounterLean - this.upperBody.rotation.z
    ) * poseRate;
    this.pose.rotation.x += (-0.10 + crouchPulse - this.pose.rotation.x) * poseRate;
    this.torso.rotation.y = THREE.MathUtils.degToRad(23) + motion.carve * 0.08;
    // On the inside of the turn the rider opens the armpit and reaches almost
    // horizontally. The outside arm closes against the jacket and drops.
    const lean01 = THREE.MathUtils.clamp(
      lean / THREE.MathUtils.degToRad(30),
      -1,
      1
    );
    const side01 = (lean01 + 1) * 0.5;
    const leftArmZ = THREE.MathUtils.lerp(0.82, -0.10, side01);
    const rightArmZ = THREE.MathUtils.lerp(0.10, -0.82, side01);
    this.leftArm.rotation.z += (leftArmZ - this.leftArm.rotation.z) * poseRate;
    this.rightArm.rotation.z += (rightArmZ - this.rightArm.rotation.z) * poseRate;
    this.leftArm.rotation.y = -motion.carve * 0.08;
    this.rightArm.rotation.y = motion.carve * 0.08;
  }
}

function material(color) {
  // MeshLambertMaterial computes diffuse light per vertex. With shared smooth
  // normals this gives the small rider a Gouraud-like rounded appearance while
  // preserving the existing solid colour palette and inexpensive shader.
  return new THREE.MeshLambertMaterial({ color, flatShading: false });
}

function addMesh(parent, geometry, mat, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function addLimb(parent, from, to, radius, mat, radialSegments = 6) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const delta = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.90, radius, delta.length(), radialSegments),
    mat
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, delta.normalize());
  parent.add(mesh);
  return mesh;
}

function createLeadBoarderModel() {
  const root = new THREE.Group();
  const pose = new THREE.Group();
  const upperBody = new THREE.Group();
  // Waist is raised to lengthen the legs. With a 0.32 m helmet diameter and
  // a roughly 2.0 m overall silhouette, the rider reads at about 6.3 heads.
  upperBody.position.y = 1.02;
  root.add(pose);
  pose.add(upperBody);

  const boardMat = material(0xf1a53a);
  const boardEdgeMat = material(0x1a2731);
  const pantsMat = material(0x172431);
  const jacketMat = material(0x315f78);
  const jacketLightMat = material(0x4f8298);
  const gloveMat = material(0x101920);
  const bootMat = material(0x141b21);
  const hairMat = material(0x171a1c);
  const skinMat = material(0xc89772);

  // A flattened capsule gives the board rounded tips without a dense mesh.
  const board = addMesh(
    pose,
    new THREE.CapsuleGeometry(0.15, 1.42, 4, 8),
    boardMat,
    [0, 0.055, 0],
    [Math.PI / 2, 0, 0]
  );
  board.scale.set(1, 1, 0.18);
  addMesh(pose, new THREE.BoxGeometry(0.31, 0.025, 1.25), boardEdgeMat, [0, 0.045, 0]);

  // Feet are separated along the board; knees bend downhill to make the pose
  // readable as a snowboard stance rather than a standing stick figure.
  addMesh(pose, new THREE.BoxGeometry(0.24, 0.15, 0.38), bootMat, [-0.02, 0.18, -0.34], [0.08, 0.10, 0.04]);
  addMesh(pose, new THREE.BoxGeometry(0.24, 0.15, 0.38), bootMat, [0.02, 0.18, 0.34], [-0.08, -0.10, -0.04]);
  addLimb(pose, [-0.02, 0.27, -0.34], [-0.08, 0.62, -0.18], 0.10, pantsMat);
  addLimb(pose, [-0.08, 0.62, -0.18], [-0.10, 0.99, 0.01], 0.115, pantsMat);
  addLimb(pose, [0.02, 0.27, 0.34], [0.08, 0.63, 0.18], 0.10, pantsMat);
  addLimb(pose, [0.08, 0.63, 0.18], [0.10, 0.99, -0.01], 0.115, pantsMat);

  const hips = addMesh(pose, new THREE.BoxGeometry(0.40, 0.31, 0.32), pantsMat, [0, 0.98, 0], [-0.08, 0, 0]);
  hips.geometry.rotateY(THREE.MathUtils.degToRad(12));

  // Broad upper radius and a lighter shoulder panel create a masculine jacket
  // silhouette that remains legible at the intended 40–50 metre distance.
  const torso = addMesh(
    upperBody,
    new THREE.CylinderGeometry(0.30, 0.23, 0.61, 7),
    jacketMat,
    [0, 0.31, -0.035],
    [-0.12, THREE.MathUtils.degToRad(23), 0]
  );
  // The jacket keeps its shoulder width in X, but is much thinner through the
  // chest/back axis (Z). This removes the ball-like circular shoulder profile.
  torso.scale.z = 0.58;
  addMesh(torso, new THREE.BoxGeometry(0.52, 0.13, 0.20), jacketLightMat, [0, 0.19, 0.015]);

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.position.set(-0.27, 0.48, -0.02);
  rightArm.position.set(0.27, 0.48, 0.02);
  upperBody.add(leftArm, rightArm);
  addLimb(leftArm, [0, 0, 0], [-0.24, -0.08, -0.14], 0.085, jacketMat);
  addLimb(leftArm, [-0.24, -0.08, -0.14], [-0.48, -0.13, -0.27], 0.075, jacketMat);
  addMesh(leftArm, new THREE.IcosahedronGeometry(0.10, 0), gloveMat, [-0.51, -0.14, -0.29]);
  addLimb(rightArm, [0, 0, 0], [0.24, -0.08, 0.14], 0.085, jacketMat);
  addLimb(rightArm, [0.24, -0.08, 0.14], [0.48, -0.13, 0.27], 0.075, jacketMat);
  addMesh(rightArm, new THREE.IcosahedronGeometry(0.10, 0), gloveMat, [0.51, -0.14, 0.29]);

  addMesh(upperBody, new THREE.CylinderGeometry(0.075, 0.085, 0.10, 7), skinMat, [0, 0.64, -0.04]);
  addMesh(upperBody, new THREE.IcosahedronGeometry(0.135, 1), skinMat, [0, 0.78, -0.055]);
  // A dark partial sphere reads as hair over the skin-coloured face. The old
  // cyan goggle bar projected beyond both sides of the tiny head and appeared
  // as two detached white dots at gameplay distance, so it is intentionally
  // omitted for this unhelmeted design.
  addMesh(upperBody, new THREE.SphereGeometry(0.16, 10, 6, 0, TAU, 0, Math.PI * 0.68), hairMat, [0, 0.82, -0.055]);

  root.userData.pose = pose;
  root.userData.upperBody = upperBody;
  root.userData.torso = torso;
  root.userData.leftArm = leftArm;
  root.userData.rightArm = rightArm;
  root.traverse(object => {
    if (object.isMesh) object.frustumCulled = false;
  });
  return root;
}
