import * as THREE from 'three';
import {
  CAM_DIST, CAM_PIVOT_H,
  GRAVITY, WR_GRAVITY,
  KICK_SPIN_SPEED, WALL_TRAIL_INTERVAL,
  BT_DURATION, BT_SCALE_Q,
} from './PlayerConstants.js';
import { PhysicsMethods }   from './PlayerPhysics.js';
import { CombatMethods }    from './PlayerCombat.js';
import { AnimationMethods } from './PlayerAnimation.js';
import { CameraMethods }    from './PlayerCamera.js';

export class Player {
  constructor(scene, camera) {
    this.scene    = scene;
    this.camera   = camera;
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    this.pos      = new THREE.Vector3(0, 0, 5);
    this.vel      = new THREE.Vector3();

    this.camYaw    = Math.PI;
    this.camPitch  = 0.18;
    this.camDist   = CAM_DIST;
    this.camHeight = CAM_PIVOT_H;

    this.grounded       = false;
    this.jumps          = 0;
    this.sensitivityMul = 5.0;

    this._spacePrev    = false;
    this._jumpHeld     = false;
    this._prevY        = 0;
    this._meshYaw      = 0;
    this._walkCycle    = 0;
    this._moving       = false;
    this.wallRunning   = false;
    this._wallNormal   = null;
    this._wallRunTimer = 0;
    this._camRoll      = 0;

    this._sliding        = false;
    this._shiftPrev      = false;
    this._sideFlipping   = false;
    this._sideFlipAngle  = 0;
    this._sideFlipDir    = 1;
    this._sideFlipWindup = false;
    this._sideFlipWindupTimer  = 0;
    this._sideFlipPendingDir   = 0;
    this._sideFlipChargeTime   = 0;
    this._kicking        = false;
    this._kickTimer      = 0;
    this._kickSpinAngle  = 0;

    this._swordCombo      = 0;
    this._swordSwing      = null;
    this._swordTimer      = 0;
    this._swordDuration   = 0;
    this._swordComboReset = 0;
    this._clickPrev       = false;

    this._impacts    = [];
    this._impactGeo  = new THREE.SphereGeometry(0.13, 5, 4);
    this._impactMat  = new THREE.MeshBasicMaterial({ color: 0xffee55 });

    this._weaponMode     = 1;
    this._bullets        = [];
    this._fireTimer      = 0;
    this._shooting       = false;
    this._bulletGeo      = new THREE.BoxGeometry(0.07, 0.55, 0.07);
    this._bulletMat      = new THREE.MeshBasicMaterial({ color: 0xffdd33 });
    this.timeScale       = 1.0;
    this.bulletTimeLeft  = 0;
    this._qPrev          = false;
    this._rmbPrev        = false;
    this._btSlow         = false;
    this._fPrev          = false;
    this._fCooldown      = 0;

    this._moveSpeedMul   = 1.0;
    this._jumpVelMul     = 1.0;
    this._bulletSpeedMul = 1.0;

    this._gravityMul = 2.0;

    this._flashTimer = 0;
    const flashGeo = new THREE.SphereGeometry(0.09, 6, 4);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this._muzzleFlash  = new THREE.Mesh(flashGeo, flashMat);
    this._muzzleFlash2 = new THREE.Mesh(flashGeo, flashMat);
    this._muzzleFlash.visible  = false;
    this._muzzleFlash2.visible = false;
    scene.add(this._muzzleFlash);
    scene.add(this._muzzleFlash2);
    this._muzzleLight  = new THREE.PointLight(0xffaa33, 0, 6);
    this._muzzleLight2 = new THREE.PointLight(0xffaa33, 0, 6);
    scene.add(this._muzzleLight);
    scene.add(this._muzzleLight2);

    this._bulletTrails = [];
    this._trailGeo  = new THREE.SphereGeometry(0.03, 6, 4);
    this._trailMat  = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.6, depthWrite: false });
    this._trailPool = [];
    this._trailProtoGeo = new THREE.BoxGeometry(1, 1, 1);
    this._trailProtoMat = this._trailMat;
    this._maxTrails = 250;
    const PREALLOC = 60;
    for (let i = 0; i < PREALLOC; i++) {
      const mat = this._trailProtoMat.clone();
      const m = new THREE.Mesh(this._trailProtoGeo, mat);
      m.frustumCulled = true;
      m.visible = false;
      scene.add(m);
      this._trailPool.push(m);
    }

    this._wallTrails = [];
    this._wallTrailTimer = 0;
    this._wallTrailMat = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.55, depthWrite: false });

    this._casings = [];
    this._casingGeo = this._bulletGeo;
    this._casingMat = new THREE.MeshBasicMaterial({ color: 0xCCA000, transparent: true, opacity: 1.0 });

    this.mesh = this._buildMesh();
    scene.add(this.mesh);

    this._blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })
    );
    this._blob.rotation.x = -Math.PI / 2;
    this._blob.position.y = 0.01;
    scene.add(this._blob);
  }

  update(realDt, input, boxes, targets, timeBubbles) {
    // ── Slide input ──────────────────────────────────────────────────────────
    const shiftDown = input.key('ShiftLeft') || input.key('ShiftRight');
    if (shiftDown && this.grounded && !this._sliding) {
      this._sliding = true;
    }
    if (!shiftDown) this._sliding = false;
    this._shiftPrev = shiftDown;

    // ── Bullet time ──────────────────────────────────────────────────────────
    const rmbDown = input.mouseBtn(2) || input.mouseBtn(1);
    if (rmbDown && !this._rmbPrev && this.bulletTimeLeft <= 0) { this.bulletTimeLeft = BT_DURATION; this._btSlow = false; }
    this._rmbPrev = rmbDown;
    if (this.bulletTimeLeft > 0) this.bulletTimeLeft = Math.max(0, this.bulletTimeLeft - realDt);
    if (input.key('Digit1')) this._weaponMode = 1;
    if (input.key('Digit2')) this._weaponMode = 2;
    if (input.key('Digit3')) this._weaponMode = 3;

    // F key → throw grenade
    if (this._fCooldown > 0) this._fCooldown -= realDt;
    const fDown = input.key('KeyF');
    if (fDown && !this._fPrev && this._fCooldown <= 0 && timeBubbles) {
      const throwOrigin = this.pos.clone().setY(this.pos.y + 1.1);
      const throwDir = new THREE.Vector3();
      this.camera.getWorldDirection(throwDir);
      timeBubbles.throwGrenade(throwOrigin, throwDir);
      this._fCooldown = 2.0;
    }
    this._fPrev = fDown;

    if (this.bulletTimeLeft > 0) {
      this.timeScale = BT_SCALE_Q;
    } else {
      const rampSpeed = this._btSlow ? 0.5 : 1.2;
      this.timeScale += (1.0 - this.timeScale) * Math.min(1, rampSpeed * realDt);
    }
    this._timeBubbles = timeBubbles;
    const bubbleScale = timeBubbles ? timeBubbles.timeScaleAt(this.pos) : 1.0;
    const dt = realDt * this.timeScale * bubbleScale;

    this._look(input);
    this._handleFire(realDt, input);
    this._handleSword(realDt, input);
    if (!this._sliding && !this._sideFlipWindup) this._setHorizVel(input);

    if (this._sliding) {
      const friction = Math.exp(-3 * dt);
      this.vel.x *= friction;
      this.vel.z *= friction;
    } else if (this._sideFlipWindup) {
      const friction = Math.exp(-20 * dt);
      this.vel.x *= friction;
      this.vel.z *= friction;
    }

    this._wallNormal = null;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this._resolveH(boxes);
    this._clampBounds();

    if (!this._sliding) {
      this._updateWallRun(dt);
      this._handleJump(input, dt);
    }

    if (this.wallRunning && this._wallNormal) {
      this._wallTrailTimer += realDt;
      if (this._wallTrailTimer >= WALL_TRAIL_INTERVAL) {
        this._wallTrailTimer = 0;
        this._spawnWallTrail();
      }
    } else {
      this._wallTrailTimer = 0;
    }

    // kick timer
    if (this._kicking) {
      this._kickTimer     -= dt;
      this._kickSpinAngle += KICK_SPIN_SPEED * dt;
      if (this._kickTimer <= 0) {
        this._kicking       = false;
        this._kickSpinAngle = 0;
      }
    }

    // vertical — gravity suspended during kick
    if (!this.grounded && !this._kicking) {
      const jumpCutMul = (!this._jumpHeld && this.vel.y > 0 && !this.wallRunning && !this._sideFlipping) ? 4.0 : 1.0;
      const baseGrav = GRAVITY * this._gravityMul * jumpCutMul;
      const grav = this.wallRunning ? WR_GRAVITY * this._gravityMul : baseGrav;
      this.vel.y += grav * dt;
    }
    this._prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    this._resolveV(boxes);

    this._updateBullets(dt, realDt, boxes, targets, timeBubbles);
    this._updateImpacts(realDt);
    this._updateTrails(realDt);
    this._animateMesh(dt);
    this._updateCamera();
    this._updateMuzzleFlash(realDt);
    this._blob.position.set(this.pos.x, 0.01, this.pos.z);
  }

  setGravityMul(v)   { this._gravityMul  = Math.max(0, v); }
  setJumpForceMul(v) { this._jumpVelMul  = Math.max(0, v); }
}

Object.assign(Player.prototype, PhysicsMethods);
Object.assign(Player.prototype, CombatMethods);
Object.assign(Player.prototype, AnimationMethods);
Object.assign(Player.prototype, CameraMethods);
