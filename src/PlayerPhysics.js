import * as THREE from 'three';
import {
  SPEED, JUMP_VEL, CHAR_H, PR, BOUNDS,
  MAX_JUMPS, WR_DURATION, WJ_SIDE, WJ_UP,
  SIDE_FLIP_VEL, KICK_DURATION, KICK_FORWARD,
} from './PlayerConstants.js';

export const PhysicsMethods = {
  _handleJump(input, dt) {
    const down = input.key('Space');
    if (!down) this._jumpHeld = false;
    if (this._sideFlipWindup) {
      this._sideFlipChargeTime += dt;
      if (!down && this._spacePrev) {
        this._sideFlipWindup = false;
        const charge   = Math.min(1.0, this._sideFlipChargeTime / 0.4);
        const dir      = this._sideFlipPendingDir;
        const camRight = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
        const horizVel = SIDE_FLIP_VEL * (0.5 + 1.0 * charge);
        this.vel.x = camRight.x * dir * horizVel;
        this.vel.z = camRight.z * dir * horizVel;
        this.vel.y = JUMP_VEL * this._jumpVelMul * (0.35 + 0.45 * charge);
        this._sideFlipping  = true;
        this._sideFlipAngle = 0;
        this._sideFlipDir   = dir;
        this.jumps++;
        this.grounded = false;
      }
      this._spacePrev = down;
      return;
    }
    if (down && !this._spacePrev) {
      if (this.wallRunning) {
        this.vel.x         = this._wallNormal.x * WJ_SIDE;
        this.vel.z         = this._wallNormal.z * WJ_SIDE;
        this.vel.y         = WJ_UP;
        this.wallRunning   = false;
        this._wallRunTimer = 0;
        this.jumps         = 1;
        this.grounded      = false;
        this._jumpHeld     = true;
      } else if (this.jumps < MAX_JUMPS) {
        const leftDown  = input.key('KeyA');
        const rightDown = input.key('KeyD');
        if ((leftDown || rightDown) && !(leftDown && rightDown)) {
          this._sideFlipWindup     = true;
          this._sideFlipPendingDir = rightDown ? 1 : -1;
          this._sideFlipChargeTime = 0;
        } else {
          this.vel.y     = JUMP_VEL * this._jumpVelMul;
          this.jumps++;
          this.grounded  = false;
          this._jumpHeld = true;
        }
      } else if (!this.grounded && !this._kicking && !this.wallRunning) {
        const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
        this.vel.y = 0;
        this.vel.x = fwd.x * KICK_FORWARD;
        this.vel.z = fwd.z * KICK_FORWARD;
        this._kicking       = true;
        this._kickTimer     = KICK_DURATION;
        this._kickSpinAngle = 0;
      }
    }
    this._spacePrev = down;
  },

  _setHorizVel(input) {
    const fwd   = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const right = new THREE.Vector3( Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const dir   = new THREE.Vector3();

    if (input.key('KeyW')) dir.addScaledVector(fwd,    1);
    if (input.key('KeyS')) dir.addScaledVector(fwd,   -1);
    if (input.key('KeyA')) dir.addScaledVector(right, -1);
    if (input.key('KeyD')) dir.addScaledVector(right,  1);

    this._moving = dir.lengthSq() > 0;
    if (this._moving) dir.normalize();
    this.vel.x = dir.x * SPEED * this._moveSpeedMul;
    this.vel.z = dir.z * SPEED * this._moveSpeedMul;

    if (this._moving) {
      const target = Math.atan2(dir.x, dir.z);
      let diff = target - this._meshYaw;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this._meshYaw += diff * 0.18;
    }
  },

  _resolveH(boxes) {
    const feet = this.pos.y;
    const top  = this.pos.y + CHAR_H;
    for (const b of boxes) {
      if (top <= b.min.y || feet >= b.max.y) continue;
      const ox = this._ox(b), oz = this._oz(b);
      if (ox <= 0 || oz <= 0) continue;
      if (ox < oz) {
        const nx = this.pos.x < (b.min.x + b.max.x) / 2 ? -1 : 1;
        this.pos.x += nx * ox;
        this._wallNormal = new THREE.Vector3(nx, 0, 0);
      } else {
        const nz = this.pos.z < (b.min.z + b.max.z) / 2 ? -1 : 1;
        this.pos.z += nz * oz;
        this._wallNormal = new THREE.Vector3(0, 0, nz);
      }
    }
  },

  _clampBounds() {
    if (this.pos.x < -BOUNDS) { this.pos.x = -BOUNDS; this._wallNormal = new THREE.Vector3( 1, 0,  0); }
    if (this.pos.x >  BOUNDS) { this.pos.x =  BOUNDS; this._wallNormal = new THREE.Vector3(-1, 0,  0); }
    if (this.pos.z < -BOUNDS) { this.pos.z = -BOUNDS; this._wallNormal = new THREE.Vector3( 0, 0,  1); }
    if (this.pos.z >  BOUNDS) { this.pos.z =  BOUNDS; this._wallNormal = new THREE.Vector3( 0, 0, -1); }
  },

  _updateWallRun(dt) {
    if (this.grounded) {
      this.wallRunning   = false;
      this._wallRunTimer = 0;
      return;
    }
    if (this._wallNormal && !this.wallRunning) {
      this.wallRunning   = true;
      this._wallRunTimer = 0;
      this.jumps         = Math.min(this.jumps, 1);
      this.vel.y         = 0;
    }
    if (this.wallRunning) {
      if (!this._wallNormal) {
        this.wallRunning = false;
        return;
      }
      this._wallRunTimer += dt;
      if (this._wallRunTimer >= WR_DURATION) {
        this.wallRunning = false;
      }
    }
  },

  _resolveV(boxes) {
    let onGround = false;
    for (const b of boxes) {
      if (this._ox(b) <= 0 || this._oz(b) <= 0) continue;
      const prevFeet = this._prevY;
      const newFeet  = this.pos.y;
      const prevTop  = this._prevY + CHAR_H;

      if (prevFeet >= b.max.y - 0.05 && newFeet < b.max.y && this.vel.y <= 0) {
        this.pos.y = b.max.y;
        this.vel.y = 0;
        onGround   = true;
      } else if (prevTop <= b.min.y + 0.05 && this.pos.y + CHAR_H > b.min.y && this.vel.y > 0) {
        this.pos.y = b.min.y - CHAR_H;
        this.vel.y = 0;
      }
    }
    if (this.pos.y < 0) { this.pos.y = 0; this.vel.y = 0; onGround = true; }
    if (onGround) { this.jumps = 0; this._sideFlipping = false; this._kicking = false; }
    this.grounded = onGround;
  },

  _ox(b) { return Math.min(this.pos.x + PR, b.max.x) - Math.max(this.pos.x - PR, b.min.x); },
  _oz(b) { return Math.min(this.pos.z + PR, b.max.z) - Math.max(this.pos.z - PR, b.min.z); },
};
