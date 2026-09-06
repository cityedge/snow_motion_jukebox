import * as THREE from 'three';
import { MAX_RIDE_SPEED } from './run-config.js';
import {
  COURSE,
  courseHeadingAt,
  downhillGradeAtCourse,
  heightAtCourse,
  normalAtCourse,
  nearestTerrainFeatureAt,
  pointAt,
  rightAt,
  wallInfoAt,
  worldToCourse,
} from './course.js';

const RIDE_HEIGHT = 0.34;
const GRAVITY = 9.81;

const TMP_NORMAL = new THREE.Vector3();
const TMP_FORWARD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_MATRIX = new THREE.Matrix4();
const TMP_QUAT = new THREE.Quaternion();
const TMP_START = new THREE.Vector3();
const TMP_PROJECTION = {};
const TMP_PROJECTION_A = {};
const TMP_PROJECTION_B = {};

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Player {
  constructor(scene, physics) {
    this.physics = physics;
    this.group = createRider();
    scene.add(this.group);

    this.position = new THREE.Vector3();
    this.speed = 15.5;
    this.heading = 0;
    this.steer = 0;
    this.steerTarget = 0;
    this.courseS = 0;
    this.courseD = 0;
    this.wallContact = 0;
    this.finished = false;

    this.state = 'GROUND';
    this.verticalVelocity = 0;
    this.surfaceVerticalVelocity = 0;
    this.airTime = 0;
    this.airHeight = 0;
    this.landingImpact = 0;
    this.launchGap = 0;
    this.launchCooldown = 0;
    this.launchIntensity = 0;
    this.collisionImpact = 0;
    this.collisionCooldown = 0;

    this.reset();
  }

  reset() {
    this.courseS = 12;
    this.courseD = 0;
    pointAt(this.courseS, this.courseD, TMP_START);
    this.position.copy(TMP_START);
    this.position.y += RIDE_HEIGHT;
    this.speed = 15.5;
    this.heading = courseHeadingAt(this.courseS);
    this.steer = 0;
    this.steerTarget = 0;
    this.wallContact = 0;
    this.finished = false;

    this.state = 'GROUND';
    this.verticalVelocity = 0;
    this.surfaceVerticalVelocity = 0;
    this.airTime = 0;
    this.airHeight = 0;
    this.landingImpact = 0;
    this.launchGap = 0;
    this.launchCooldown = 0.15;
    this.launchIntensity = 0;
    this.collisionImpact = 0;
    this.collisionCooldown = 0.15;
    this.resetRunStats();

    this.group.visible = false;
    this.syncVisual(0);
  }

  update(dt, input, controlDt = dt) {
    this.landingImpact *= Math.exp(-dt * 5.8);
    this.collisionImpact *= Math.exp(-dt * 8.5);
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    this.launchCooldown = Math.max(0, this.launchCooldown - dt);

    if (this.finished) {
      this.syncVisual(dt);
      return;
    }

    this.steerTarget = (input.left ? 1 : 0) + (input.right ? -1 : 0);
    // Input onset stays close to real-time even while world simulation is
    // fast-forwarded. Once the edge is engaged, heading integration still uses
    // simulation dt so the spatial turning radius remains usable at 1.75x flow.
    const steerBlend = 1 - Math.exp(-controlDt * 8.5);
    this.steer += (this.steerTarget - this.steer) * steerBlend;

    if (this.state === 'GROUND') {
      this.updateGround(dt, input);
    } else {
      this.updateAir(dt, input);
    }

    this.syncVisual(dt);
  }

  finishRun() {
    this.captureLongestCollisionFreeDistance();
    this.finished = true;
    this.speed = 0;
  }

  resetRunStats() {
    this.collisionCount = 0;
    this.collisionFreeSegmentStart = this.distanceTravelled;
    this.longestCollisionFreeDistance = 0;
  }

  captureLongestCollisionFreeDistance() {
    const segmentDistance = Math.max(
      0,
      this.distanceTravelled - this.collisionFreeSegmentStart
    );
    this.longestCollisionFreeDistance = Math.max(
      this.longestCollisionFreeDistance,
      segmentDistance
    );
    return segmentDistance;
  }

  recordObstacleCollision() {
    this.captureLongestCollisionFreeDistance();
    this.collisionCount += 1;
    this.collisionFreeSegmentStart = this.distanceTravelled;
  }

  updateGround(dt, input) {
    const speed01 = THREE.MathUtils.clamp((this.speed - 8) / 30, 0, 1);
    const turnRate = THREE.MathUtils.lerp(0.80, 0.52, speed01);
    this.heading = wrapAngle(this.heading + this.steer * turnRate * dt);

    // Releasing the controls gently returns the board toward the local fall line.
    const fallLine = courseHeadingAt(this.courseS);
    const toFallLine = wrapAngle(fallLine - this.heading);
    const fallLinePull = input.left || input.right ? 0.015 : 0.035;
    this.heading = wrapAngle(this.heading + toFallLine * (1 - Math.exp(-fallLinePull * dt)));

    const headingError = wrapAngle(this.heading - fallLine);
    const alignment = Math.max(0.12, Math.cos(headingError));
    const grade = downhillGradeAtCourse(this.courseS, this.courseD);
    const grade01 = THREE.MathUtils.clamp((grade - 0.035) / 0.285, 0, 1);
    const gravityDrive = THREE.MathUtils.lerp(2.2, 9.5, grade01) * alignment * alignment;
    const shallowPenalty = THREE.MathUtils.clamp((0.065 - grade) * 18.5, 0, 1.65);
    const carveDrag = Math.abs(this.steer) * THREE.MathUtils.lerp(0.40, 2.55, speed01);
    const aeroDrag = 0.018 * this.speed * this.speed;
    const brakeDrag = input.brake ? 9.5 : 0;
    this.speed += (gravityDrive - shallowPenalty - carveDrag - aeroDrag * 0.12 - brakeDrag) * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, 7.0, MAX_RIDE_SPEED);

    const forward = this.getForward(TMP_FORWARD);
    this.position.x += forward.x * this.speed * dt;
    this.position.z += forward.z * this.speed * dt;

    worldToCourse(this.position.x, this.position.z, this.courseS, TMP_PROJECTION);
    this.courseS = TMP_PROJECTION.s;
    this.courseD = TMP_PROJECTION.d;

    this.applyArcadeBankContact(dt);

    const groundY = heightAtCourse(this.courseS, this.courseD);
    this.position.y = groundY + RIDE_HEIGHT;
    this.airHeight = 0;
    this.airTime = 0;

    this.surfaceVerticalVelocity = this.estimateSurfaceVerticalVelocity();

    // Micro terrain remains absorbed in GROUND. Only authored rollers/jumps
    // can create a contact-separation event, preventing flat-ground shake.
    const feature = nearestTerrainFeatureAt(this.courseS);
    const insideFeature = feature && Math.abs(this.courseD) < feature.halfWidth * 0.82;
    const along = insideFeature ? (this.courseS - feature.centerS) / feature.halfLength : -99;

    const atJumpLip = feature?.kind === 'jump'
      && insideFeature
      && along >= 0.20
      && along <= 0.38;

    // Release just before the crown while the board still has an upward tangent.
    // The window is narrow enough that each authored roller launches only once.
    const atRollerCrest = feature?.kind === 'roller'
      && insideFeature
      && along >= -0.14
      && along <= 0.035;

    this.launchGap = atJumpLip ? 1 : (atRollerCrest ? 0.38 : 0);

    if (atJumpLip && this.launchCooldown <= 0 && this.speed >= 12.5) {
      this.state = 'AIR';
      this.airTime = 0;

      // Large authored ramps produce a clear but restrained jump.
      const speed01Launch = THREE.MathUtils.clamp((this.speed - 10) / 26, 0, 1);
      const minimumVy = THREE.MathUtils.lerp(2.6, 3.5, speed01Launch);
      const extraKick = THREE.MathUtils.lerp(0.35, 0.75, speed01Launch);
      this.verticalVelocity = Math.max(this.surfaceVerticalVelocity + extraKick, minimumVy);
      this.launchIntensity = 0.72;
      this.position.y += 0.035;
    } else if (atRollerCrest && this.launchCooldown <= 0 && this.speed >= 18.0) {
      this.state = 'AIR';
      this.airTime = 0;

      // A roller hop should be clearly readable but stay low: roughly a few
      // tenths of a metre above the local snow, with normal gravity throughout.
      const speed01Hop = THREE.MathUtils.clamp((this.speed - 18) / 20, 0, 1);
      const minimumVy = THREE.MathUtils.lerp(1.85, 2.65, speed01Hop);
      const extraKick = THREE.MathUtils.lerp(0.08, 0.24, speed01Hop);
      this.verticalVelocity = Math.max(this.surfaceVerticalVelocity + extraKick, minimumVy);
      this.launchIntensity = 0.34;
      this.position.y += 0.025;
    }
  }

  updateAir(dt, input) {
    const speed01 = THREE.MathUtils.clamp((this.speed - 8) / 30, 0, 1);

    // Limited air control: enough to keep a chosen line, not enough to steer as
    // if the board were still carving against snow.
    const airTurnRate = THREE.MathUtils.lerp(0.18, 0.12, speed01);
    this.heading = wrapAngle(this.heading + this.steer * airTurnRate * dt);

    const fallLine = courseHeadingAt(this.courseS);
    const toFallLine = wrapAngle(fallLine - this.heading);
    this.heading = wrapAngle(this.heading + toFallLine * (1 - Math.exp(-0.055 * dt)));

    // Keep horizontal velocity nearly constant in the air.
    this.speed = Math.max(7.0, this.speed - this.speed * 0.018 * dt);
    const forward = this.getForward(TMP_FORWARD);
    this.position.x += forward.x * this.speed * dt;
    this.position.z += forward.z * this.speed * dt;

    worldToCourse(this.position.x, this.position.z, this.courseS, TMP_PROJECTION);
    this.courseS = TMP_PROJECTION.s;
    this.courseD = TMP_PROJECTION.d;

    // Normal gravity: no moon-like ascent. The jump shape and a small lip nudge
    // provide readability without making the rider fly over the treetops.
    this.verticalVelocity -= GRAVITY * dt;
    this.position.y += this.verticalVelocity * dt;
    this.airTime += dt;

    const analyticGroundY = heightAtCourse(this.courseS, this.courseD);
    const hit = this.physics?.groundBelow(
      this.position.x,
      this.position.y,
      this.position.z,
      26
    );
    // Rapier is the contact authority. The analytic height is a safe fallback
    // if the ray misses the finite terrain ribbon during an extreme excursion.
    const groundY = hit?.point?.y ?? analyticGroundY;
    const rideY = groundY + RIDE_HEIGHT;
    this.airHeight = Math.max(0, this.position.y - rideY);

    if (this.airTime > 0.075 && this.position.y <= rideY + 0.055) {
      const groundVy = this.estimateSurfaceVerticalVelocity();
      const relativeImpact = Math.max(0, groundVy - this.verticalVelocity);
      const impact01 = THREE.MathUtils.clamp((relativeImpact - 0.7) / 7.2, 0, 1);

      this.position.y = rideY;
      this.state = 'GROUND';
      this.verticalVelocity = 0;
      this.surfaceVerticalVelocity = groundVy;
      this.airHeight = 0;
      this.airTime = 0;
      this.launchCooldown = 0.18;
      this.launchIntensity = 0;
      this.landingImpact = Math.max(this.landingImpact, impact01);

      // Hard landings cost a little speed but never stop the arcade flow.
      this.speed *= 1 - impact01 * 0.075;
    }
  }

  hitObstacle(obstacle) {
    if (!obstacle || this.collisionCooldown > 0 || this.state !== 'GROUND') return false;

    this.recordObstacleCollision();

    const side = this.courseD >= obstacle.d ? 1 : -1;
    const severity = obstacle.type === 'tree' ? 1.0 : 0.72;
    this.collisionImpact = Math.max(this.collisionImpact, severity);
    this.collisionCooldown = 0.55;

    // Keep collisions arcade-like: a hard speed bite, a short deflection, then
    // immediate continuation. No ragdoll and no multi-second loss of control.
    this.speed = Math.max(7.5, this.speed * (obstacle.type === 'tree' ? 0.56 : 0.70));
    this.heading = wrapAngle(this.heading + side * THREE.MathUtils.lerp(0.18, 0.29, severity));

    const push = obstacle.radius + 0.72;
    this.courseD = obstacle.d + side * push;
    pointAt(this.courseS, this.courseD, TMP_START);
    this.position.x = TMP_START.x;
    this.position.z = TMP_START.z;
    this.position.y = TMP_START.y + RIDE_HEIGHT;
    return true;
  }

  applyArcadeBankContact(dt) {
    const wall = wallInfoAt(this.courseS);
    let over = 0;
    let side = 0;
    if (this.courseD < -wall.leftLimit) {
      over = -wall.leftLimit - this.courseD;
      side = -1;
    } else if (this.courseD > wall.rightLimit) {
      over = this.courseD - wall.rightLimit;
      side = 1;
    }

    const targetContact = over > 0 ? THREE.MathUtils.clamp(over / 5, 0, 1) : 0;
    this.wallContact += (targetContact - this.wallContact) * (1 - Math.exp(-dt * 12));

    if (over <= 0) return;

    rightAt(this.courseS, TMP_RIGHT);
    const correction = Math.min(over, (5.0 + over * 3.2) * dt);
    this.position.addScaledVector(TMP_RIGHT, -side * correction);
    this.courseD -= side * correction;
    this.speed = Math.max(8.5, this.speed - (5.5 + over * 0.55) * dt);

    const escapeHeading = courseHeadingAt(this.courseS) + side * 0.34;
    const correctionAngle = wrapAngle(escapeHeading - this.heading);
    this.heading = wrapAngle(this.heading + correctionAngle * (1 - Math.exp(-dt * 2.8)));
  }

  estimateSurfaceVerticalVelocity() {
    const probe = 1.15;
    const forward = this.getForward(TMP_FORWARD);

    const ax = this.position.x - forward.x * probe;
    const az = this.position.z - forward.z * probe;
    const bx = this.position.x + forward.x * probe;
    const bz = this.position.z + forward.z * probe;

    worldToCourse(ax, az, this.courseS - probe, TMP_PROJECTION_A);
    worldToCourse(bx, bz, this.courseS + probe, TMP_PROJECTION_B);
    const ya = heightAtCourse(TMP_PROJECTION_A.s, TMP_PROJECTION_A.d);
    const yb = heightAtCourse(TMP_PROJECTION_B.s, TMP_PROJECTION_B.d);
    const slope = (yb - ya) / (probe * 2);
    return slope * this.speed;
  }


  syncVisual(dt) {
    normalAtCourse(this.courseS, this.courseD, TMP_NORMAL);
    this.getForward(TMP_FORWARD);

    if (this.state === 'GROUND') {
      TMP_FORWARD.addScaledVector(TMP_NORMAL, -TMP_FORWARD.dot(TMP_NORMAL)).normalize();
      TMP_RIGHT.crossVectors(TMP_NORMAL, TMP_FORWARD).normalize();
      TMP_MATRIX.makeBasis(TMP_RIGHT, TMP_NORMAL, TMP_FORWARD);
    } else {
      // While airborne the invisible rider/board keeps its heading and only
      // pitches gently with the ballistic vertical velocity.
      TMP_NORMAL.set(0, 1, 0);
      TMP_RIGHT.crossVectors(TMP_NORMAL, TMP_FORWARD).normalize();
      const pitch = Math.atan2(this.verticalVelocity, Math.max(1, this.speed)) * 0.42;
      TMP_FORWARD.set(TMP_FORWARD.x, Math.sin(pitch), TMP_FORWARD.z).normalize();
      TMP_NORMAL.crossVectors(TMP_FORWARD, TMP_RIGHT).normalize();
      TMP_MATRIX.makeBasis(TMP_RIGHT, TMP_NORMAL, TMP_FORWARD);
    }
    TMP_QUAT.setFromRotationMatrix(TMP_MATRIX);

    if (dt > 0) {
      this.group.quaternion.slerp(TMP_QUAT, 1 - Math.exp(-dt * 14));
    } else {
      this.group.quaternion.copy(TMP_QUAT);
    }
    this.group.position.copy(this.position);

    const lean = -this.steer * THREE.MathUtils.degToRad(this.state === 'AIR' ? 12 : 28);
    const leanGroup = this.group.userData.leanGroup;
    leanGroup.rotation.z += (lean - leanGroup.rotation.z) * (dt > 0 ? 1 - Math.exp(-dt * 10) : 1);
  }

  getForward(target = new THREE.Vector3()) {
    return target.set(Math.sin(this.heading), 0, Math.cos(this.heading)).normalize();
  }

  get speedKmh() {
    return this.speed * 3.6;
  }

  get distanceTravelled() {
    return Math.max(0, this.courseS - 12);
  }

  get longestRunDistance() {
    return Math.max(
      this.longestCollisionFreeDistance,
      this.distanceTravelled - this.collisionFreeSegmentStart
    );
  }
}

function createRider() {
  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  root.userData.leanGroup = lean;

  const dark = new THREE.MeshLambertMaterial({ color: 0x17242d, flatShading: true });
  const jacket = new THREE.MeshLambertMaterial({ color: 0xd94738, flatShading: true });
  const boardMat = new THREE.MeshLambertMaterial({ color: 0xf3cb3d, flatShading: true });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe6c39f, flatShading: true });

  const board = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 1.8), boardMat);
  board.position.y = 0.04;
  lean.add(board);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.42, 0.34), dark);
  hips.position.y = 0.48;
  hips.rotation.x = -0.13;
  lean.add(hips);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.52, 4, 7), jacket);
  torso.position.set(0, 1.03, -0.06);
  torso.rotation.x = -0.18;
  lean.add(torso);

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), skin);
  head.position.set(0, 1.63, -0.13);
  lean.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.235, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.58), dark);
  helmet.position.set(0, 1.69, -0.13);
  lean.add(helmet);

  const limbGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.62, 6);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(limbGeo, dark);
    leg.position.set(side * 0.19, 0.45, side * 0.12);
    leg.rotation.z = side * 0.38;
    leg.rotation.x = 0.34;
    lean.add(leg);

    const arm = new THREE.Mesh(limbGeo, jacket);
    arm.position.set(side * 0.35, 1.13, -0.06);
    arm.rotation.z = side * 1.03;
    arm.rotation.x = -0.12;
    lean.add(arm);
  }

  return root;
}
