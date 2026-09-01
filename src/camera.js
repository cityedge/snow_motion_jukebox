import * as THREE from 'three';
import { downhillGradeAtCourse } from './course.js';

const UP = new THREE.Vector3(0, 1, 0);
const TMP_FORWARD = new THREE.Vector3();
const TMP_SCREEN_RIGHT = new THREE.Vector3();
const TMP_DESIRED = new THREE.Vector3();
const TMP_LOOK = new THREE.Vector3();
const TMP_CENTER_DIR = new THREE.Vector3();

/**
 * Close pseudo-first-person ride camera.
 *
 * The gaze is horizon-led with only modest slope following. Carving rolls the
 * frame while jumps add a small amount of space behind/above the rider without
 * turning the view into a distant chase camera.
 */
export class ChaseCamera {
  constructor(camera, player) {
    this.camera = camera;
    this.player = player;
    this.lookTarget = new THREE.Vector3();
    this.roll = 0;
    this.pitch = 0;
    this.airBlend = 0;
    this.initialized = false;
  }

  reset() {
    this.initialized = false;
    this.roll = 0;
    this.pitch = THREE.MathUtils.degToRad(0.4);
    this.airBlend = 0;
    this.camera.fov = 38;
    this.camera.updateProjectionMatrix();
    this.update(1 / 60, true);
  }

  update(dt, snap = false) {
    const p = this.player.position;
    const forward = this.player.getForward(TMP_FORWARD);
    const speed01 = THREE.MathUtils.clamp((this.player.speed - 8) / 30, 0, 1);
    const carve = this.player.steer;
    const carve01 = Math.min(1, Math.abs(carve));
    const airborne = this.player.state === 'AIR';

    // A small, controlled AIR transition. No height-amplified pullback.
    const targetAirBlend = airborne ? 1 : 0;
    const airRate = airborne ? 5.8 : 6.5;
    this.airBlend += (targetAirBlend - this.airBlend) * (snap ? 1 : 1 - Math.exp(-dt * airRate));

    TMP_SCREEN_RIGHT.crossVectors(forward, UP).normalize();

    const back = THREE.MathUtils.lerp(0.86, 1.06, carve01) + this.airBlend * 0.55;
    const eyeHeightAboveSnow = THREE.MathUtils.lerp(1.72, 1.78, speed01);

    TMP_DESIRED.copy(p).addScaledVector(forward, -back);
    TMP_DESIRED.y = p.y + (eyeHeightAboveSnow - 0.34) + this.airBlend * 0.24;
    TMP_DESIRED.y -= this.player.landingImpact * 0.12;
    const hitKick = this.player.collisionImpact || 0;
    TMP_DESIRED.y += hitKick * 0.05;
    TMP_DESIRED.addScaledVector(TMP_SCREEN_RIGHT, -Math.sin(performance.now() * 0.055) * hitKick * 0.10);
    TMP_DESIRED.addScaledVector(TMP_SCREEN_RIGHT, carve * -0.10 * carve01);

    // Horizon-led gaze. On very gentle terrain, the rider looks a fraction up;
    // on the steepest sections, only about five degrees down.
    const grade = downhillGradeAtCourse(this.player.courseS, this.player.courseD);
    const grade01 = THREE.MathUtils.clamp((grade - 0.035) / 0.30, 0, 1);
    let targetPitchDeg = THREE.MathUtils.lerp(1.0, -5.0, grade01);

    // AIR only changes gaze modestly: near-level while rising, slightly down
    // when descending so the landing enters view without a dramatic camera dive.
    if (airborne) {
      const vy01 = THREE.MathUtils.clamp(this.player.verticalVelocity / 5.0, -1, 1);
      const airPitchDeg = THREE.MathUtils.lerp(-3.0, 0.3, (vy01 + 1) * 0.5);
      targetPitchDeg = THREE.MathUtils.lerp(targetPitchDeg, airPitchDeg, 0.72);
    }

    const targetPitch = THREE.MathUtils.degToRad(targetPitchDeg);
    this.pitch += (targetPitch - this.pitch) * (snap ? 1 : 1 - Math.exp(-dt * 3.2));

    TMP_CENTER_DIR.set(forward.x, Math.tan(this.pitch), forward.z).normalize();
    TMP_LOOK.copy(TMP_DESIRED).addScaledVector(TMP_CENTER_DIR, 48);

    // Keep FOV restrained and nearly constant. Speed comes from nearby scenery,
    // carve roll, snow flow and terrain, not lens breathing.
    const targetFov = THREE.MathUtils.lerp(38, 40.5, speed01) + this.airBlend * 0.25;
    this.camera.fov += (targetFov - this.camera.fov) * (snap ? 1 : 1 - Math.exp(-dt * 4.0));
    this.camera.updateProjectionMatrix();

    if (!this.initialized || snap) {
      this.camera.position.copy(TMP_DESIRED);
      this.lookTarget.copy(TMP_LOOK);
      this.initialized = true;
    } else {
      const posRate = THREE.MathUtils.lerp(9.5, 6.8, this.airBlend);
      const lookRate = THREE.MathUtils.lerp(7.0, 6.0, this.airBlend);
      this.camera.position.lerp(TMP_DESIRED, 1 - Math.exp(-dt * posRate));
      this.lookTarget.lerp(TMP_LOOK, 1 - Math.exp(-dt * lookRate));
    }

    this.camera.up.copy(UP);
    this.camera.lookAt(this.lookTarget);

    // LEFT carve -> scenery left rises; RIGHT carve -> scenery right rises.
    // This sign convention is intentional and should not be reversed.
    const maxRollDeg = THREE.MathUtils.lerp(8.5, 13.0, speed01);
    const signedCarve = Math.sign(carve) * Math.pow(carve01, 0.82);
    const targetRoll = signedCarve
      * THREE.MathUtils.degToRad(maxRollDeg)
      * THREE.MathUtils.lerp(1.0, 0.58, this.airBlend);
    this.roll += (targetRoll - this.roll) * (snap ? 1 : 1 - Math.exp(-dt * 8.4));
    this.camera.rotateZ(this.roll);
  }
}
