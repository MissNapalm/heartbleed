import * as THREE from 'three';
import { BASE_SENS, CAM_DIST, CAM_SIDE, CAM_ROLL_MAX } from './PlayerConstants.js';

export const CameraMethods = {
  _look(input) {
    const { dx, dy, scroll } = input.consumeMouse();
    const s = BASE_SENS * this.sensitivityMul;
    this.camYaw   -= dx * s;
    this.camPitch += dy * s;
    this.camPitch  = Math.max(-0.5, Math.min(1.3, this.camPitch));
    if (scroll) this.camDist = Math.max(1.5, Math.min(10, this.camDist + scroll * 0.005));
  },

  _updateCamera() {
    const cx = this.pos.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist + Math.cos(this.camYaw) * CAM_SIDE;
    const cy = this.pos.y + this.camHeight + Math.sin(this.camPitch) * this.camDist;
    const cz = this.pos.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist - Math.sin(this.camYaw) * CAM_SIDE;
    this.camera.position.set(cx, cy, cz);

    let targetRoll = 0;
    if (this.wallRunning && this._wallNormal) {
      const camRight = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
      targetRoll = this._wallNormal.dot(camRight) * CAM_ROLL_MAX;
    }
    this._camRoll += (targetRoll - this._camRoll) * 0.12;

    const lookTarget = new THREE.Vector3(this.pos.x, this.pos.y + this.camHeight, this.pos.z);
    this.camera.lookAt(lookTarget);

    const forward = lookTarget.clone().sub(this.camera.position).normalize();
    const worldUp  = new THREE.Vector3(0, 1, 0);
    const right    = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
    const tiltedUp = new THREE.Vector3()
      .addScaledVector(worldUp, Math.cos(this._camRoll))
      .addScaledVector(right,   Math.sin(this._camRoll));
    this.camera.up.copy(tiltedUp);
    this.camera.lookAt(lookTarget);
  },
};
