import * as THREE from 'three';

const SPEED            = 11;
const JUMP_VEL         = 9;
const GRAVITY          = -22;
const CHAR_H           = 1.3;
const PR               = 0.3;
const BOUNDS           = 19.7;
const BASE_SENS        = 0.001;
const CAM_DIST         = 4.0;
const CAM_PIVOT_H      = 1.5;
const CAM_SIDE         = 0.65;   // over-shoulder right offset
const MAX_JUMPS        = 2;
const WR_GRAVITY       = -9;    // reduced gravity on wall → parabolic arc
const WR_UPBOOST       = 4;     // vel.y set to this if near-zero when sticking
const WR_DURATION      = 2.0;
const WJ_SIDE          = 6.5;
const WJ_UP            = 8.5;
const CAM_ROLL_MAX     = 0.18;
const FLIP_SPEED       = Math.PI * 3.5; // tuck arc over ~0.57 s
const BULLET_SPEED     = 500;
const BULLET_LIFE      = 2.5;
const FIRE_RATE        = 0.20;           // seconds between shots
const MAX_BULLETS      = 60;
const BT_DURATION      = 3.0;
//const BT_SCALE         = 0.1;
const BT_SCALE_Q       = 0.03; // much stronger slow for Q bullet-time
const BT_SCALE_DIVE    = 0.12; // gentler slow for dive
const DIVE_SPEED       = 4;
// new: wall trail interval
const WALL_TRAIL_INTERVAL = 0.06;
const DIVE_UP          = 6;
const DIVE_GRAVITY     = GRAVITY * 0.55;
const DIVE_COOLDOWN    = 2.0;

export class Player {
  constructor(scene, camera) {
    this.scene    = scene;
    this.camera   = camera;

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
    this._prevY        = 0;
    this._meshYaw      = 0;
    this._walkCycle    = 0;
    this._moving       = false;
    this.wallRunning   = false;
    this._wallNormal   = null;
    this._wallRunTimer = 0;
    this._camRoll      = 0;
    this._flipping     = false;
    this._flipAngle    = 0;

    this._diving         = false;
    this._sliding        = false;
    this._diveSlow       = false;
    this._diveSlowTimer  = 0;
    this._diveCooldown   = 0;
    this._diveTilt       = 0;
    this._meshDiveY    = 0;
    this._diveDir       = new THREE.Vector3();
    this._shiftPrev     = false;

    this._impacts    = [];
    this._impactGeo  = new THREE.SphereGeometry(0.13, 5, 4);
    this._impactMat  = new THREE.MeshBasicMaterial({ color: 0xffee55 });

    this._weaponMode     = 1;   // 1=single, 2=dual, 3=fast
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

    // tunable multipliers (driven by ESC-menu sliders)
    this._moveSpeedMul   = 1.0;
    this._jumpVelMul     = 1.0;
    this._bulletSpeedMul = 1.0;
    this._diveUpMul      = 1.0;

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

    // Bullet trails (small fading blobs)
    this._bulletTrails = [];
    this._trailGeo  = new THREE.SphereGeometry(0.03, 6, 4);
    this._trailMat  = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.6, depthWrite: false });

    // Wall-run trails
    this._wallTrails = [];
    this._wallTrailTimer = 0;
    this._wallTrailMat = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.55, depthWrite: false });

    // Bullet casings (tiny brass shells) — use a scaled-down bullet shape
    this._casings = [];
    this._casingGeo = this._bulletGeo; // reuse bullet shape (scale down when spawning)
    this._casingMat = new THREE.MeshBasicMaterial({ color: 0xCCA000, transparent: true, opacity: 1.0 });

    this.mesh = this._buildMesh();
    scene.add(this.mesh);

    // Shadow blob on floor
    this._blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })
    );
    this._blob.rotation.x = -Math.PI / 2;
    this._blob.position.y = 0.01;
    scene.add(this._blob);
  }

  _buildMesh() {
    const root = new THREE.Group();
    const mat  = new THREE.MeshLambertMaterial({ color: 0xaa44ff, flatShading: true });

    // HEAD
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 5, 4), mat);
    head.position.y = 1.27;
    root.add(head);

    // NECK
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.053, 0.11, 5), mat);
    neck.position.y = 1.17;
    root.add(neck);

    // CHEST — wider at top (shoulders), tapers to waist
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.118, 0.27, 6), mat);
    chest.position.y = 0.97;
    root.add(chest);

    // WAIST — narrowest point
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.110, 0.155, 0.17, 6), mat);
    waist.position.y = 0.748;
    root.add(waist);

    // HIPS
    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.148, 0.14, 6), mat);
    hips.position.y = 0.595;
    root.add(hips);

    // ARMS — pivot at shoulder joint
    for (const [xs, prop] of [[-1, '_lArmPivot'], [1, '_rArmPivot']]) {
      const pivot = new THREE.Group();
      pivot.position.set(xs * 0.225, 1.10, 0);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.040, 0.25, 5), mat);
      upper.position.y = -0.125;
      pivot.add(upper);

      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.040, 4, 3), mat);
      elbow.position.y = -0.25;
      pivot.add(elbow);

      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.029, 0.22, 5), mat);
      fore.position.y = -0.36;
      pivot.add(fore);

      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.07), mat);
      hand.position.y = -0.47;
      pivot.add(hand);

      this[prop] = pivot;
      root.add(pivot);
    }

    // LEGS — pivot at hip joint
    for (const [xs, prop] of [[-1, '_lLegPivot'], [1, '_rLegPivot']]) {
      const pivot = new THREE.Group();
      pivot.position.set(xs * 0.10, 0.522, 0);

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.070, 0.055, 0.26, 5), mat);
      thigh.position.y = -0.13;
      pivot.add(thigh);

      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.052, 4, 3), mat);
      knee.position.y = -0.26;
      pivot.add(knee);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.034, 0.24, 5), mat);
      shin.position.y = -0.38;
      pivot.add(shin);

      const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.034, 4, 3), mat);
      ankle.position.y = -0.50;
      pivot.add(ankle);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.055, 0.20), mat);
      foot.position.set(0, -0.522, 0.04);
      pivot.add(foot);

      this[prop] = pivot;
      root.add(pivot);
    }

    return root;
  }

  update(realDt, input, boxes, targets, timeBubbles) {
    // ── Dive input ───────────────────────────────────────────────────────────
    const shiftDown = input.key('ShiftLeft') || input.key('ShiftRight');
    if (shiftDown && !this._shiftPrev && !this._diving && this._diveCooldown <= 0) {
      const fwd   = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
      const right = new THREE.Vector3( Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
      const diveDir = new THREE.Vector3();
      if (input.key('KeyW')) diveDir.addScaledVector(fwd,    1);
      if (input.key('KeyS')) diveDir.addScaledVector(fwd,   -1);
      if (input.key('KeyA')) diveDir.addScaledVector(right, -1);
      if (input.key('KeyD')) diveDir.addScaledVector(right,  1);
      if (diveDir.lengthSq() < 0.01) diveDir.copy(fwd);
      diveDir.normalize();
      this._diveDir.copy(diveDir);
      this.vel.set(diveDir.x * DIVE_SPEED, DIVE_UP * this._diveUpMul, diveDir.z * DIVE_SPEED);
      this._diving         = true;
      this._diveSlow       = true;
      this._diveSlowTimer  = BT_DURATION;
      this._diveCooldown   = DIVE_COOLDOWN;
      this._diveTilt     = 0;
      this.grounded      = false;
      this.jumps         = MAX_JUMPS;
    }
    this._shiftPrev = shiftDown;
    if (this._diveCooldown > 0) this._diveCooldown -= realDt;

    // Releasing shift cancels bullet time (pose stays until you land/stand)
    if ((this._diving || this._sliding) && !shiftDown) this._diveSlow = false;
    // Hard 6-second dive bullet-time cap
    if (this._diveSlow) {
      this._diveSlowTimer -= realDt;
      if (this._diveSlowTimer <= 0) this._diveSlow = false;
    }
    // Landing from dive → enter slide
    if (this._diving && this.grounded) { this._diving = false; this._sliding = true; }
    // Releasing shift while sliding → stand up
    if (this._sliding && !shiftDown) this._sliding = false;

    // Tilt stays up through dive+slide, ramps down after
    this._diveTilt = (this._diving || this._sliding)
      ? Math.min(1, this._diveTilt + realDt / 0.15)
      : Math.max(0, this._diveTilt - realDt / 0.20);

    // ── Time scale (dive slow-mo > Q bullet time > normal) ───────────────────
    const qDown = input.key('KeyQ');
    const rmbDown = input.mouseBtn(1);
    if (qDown && !this._qPrev && this.bulletTimeLeft <= 0) { this.bulletTimeLeft = BT_DURATION; this._btSlow = false; }
    if (rmbDown && !this._rmbPrev && this.bulletTimeLeft <= 0) { this.bulletTimeLeft = BT_DURATION; this._btSlow = false; }
    this._qPrev   = qDown;
    this._rmbPrev = rmbDown;
    if (this.bulletTimeLeft > 0) this.bulletTimeLeft = Math.max(0, this.bulletTimeLeft - realDt);
    if (input.key('Digit1')) this._weaponMode = 1;
    if (input.key('Digit2')) this._weaponMode = 2;
    if (input.key('Digit3')) this._weaponMode = 3;

    // F key → throw grenade; bubble opens where it lands after 2 bounces
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

    const targetScale = this._diveSlow ? BT_SCALE_DIVE : (this.bulletTimeLeft > 0 ? BT_SCALE_Q : 1.0);
    const rampSpeed   = this._diveSlow ? 6 : this._btSlow ? 0.5 : 1.2;
    this.timeScale += (targetScale - this.timeScale) * Math.min(1, rampSpeed * realDt);
    this._timeBubbles = timeBubbles;
    const bubbleScale = timeBubbles ? timeBubbles.timeScaleAt(this.pos) : 1.0;
    const dt = realDt * this.timeScale * bubbleScale;

    this._look(input);
    this._handleFire(realDt, input);
    if (!this._diving && !this._sliding) this._setHorizVel(input);

    // slide friction
    if (this._sliding) {
      const friction = Math.exp(-3 * dt);
      this.vel.x *= friction;
      this.vel.z *= friction;
    }

    // horizontal
    this._wallNormal = null;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this._resolveH(boxes);
    this._clampBounds();

    if (!this._diving && !this._sliding) {
      this._updateWallRun(dt);
      this._handleJump(input);
    }

    // spawn wall trail while wall-running, at intervals
    if (this.wallRunning && this._wallNormal) {
      this._wallTrailTimer += realDt;
      if (this._wallTrailTimer >= WALL_TRAIL_INTERVAL) {
        this._wallTrailTimer = 0;
        this._spawnWallTrail();
      }
    } else {
      this._wallTrailTimer = 0;
    }

    // vertical
    if (!this.grounded) {
      const grav = this._diving ? DIVE_GRAVITY : this.wallRunning ? WR_GRAVITY : GRAVITY;
      this.vel.y += grav * dt;
    }
    this._prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    this._resolveV(boxes);

    this._updateBullets(dt, realDt, boxes, targets, timeBubbles);
    this._updateImpacts(realDt);
    this._updateTrails(realDt); // update & fade bullet + wall trails
    this._animateMesh(dt);
    this._updateCamera();
    this._updateMuzzleFlash(realDt);
    this._blob.position.set(this.pos.x, 0.01, this.pos.z);
  }

  _handleFire(realDt, input) {
    this._shooting = input.mouseBtn(0);
    this._fireTimer = Math.max(0, this._fireTimer - realDt);
    if (this._shooting && this._fireTimer <= 0 && this._bullets.length < MAX_BULLETS) {
      this._spawnBullet();
      this._fireTimer = FIRE_RATE;
    }
  }

  _handWorldPos(side = 1) {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    if (this._diveTilt > 0) {
      const diveYaw  = Math.atan2(this._diveDir.x, this._diveDir.z);
      const uprightQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), diveYaw);
      const meshQ    = uprightQ.clone().slerp(this._diveQ(), this._diveTilt);
      const rotatedPivot = new THREE.Vector3(0, 0.95, 0).applyQuaternion(meshQ);
      const meshPos  = new THREE.Vector3(
        this.pos.x - rotatedPivot.x, this._meshDiveY, this.pos.z - rotatedPivot.z
      );
      const armOffset = new THREE.Vector3(side * 0.225, 1.10, 0).applyQuaternion(meshQ);
      return meshPos.add(armOffset).addScaledVector(dir, 0.47);
    }
    const meshRight = new THREE.Vector3(Math.cos(this._meshYaw), 0, -Math.sin(this._meshYaw));
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.10, this.pos.z)
      .addScaledVector(meshRight, side * 0.225)
      .addScaledVector(dir, 0.47);
  }

  _spawnBullet() {
    const bs = BULLET_SPEED * this._bulletSpeedMul;
    if (this._weaponMode === 1) {
      this._spawnOneBullet(1, bs);
    } else if (this._weaponMode === 2) {
      this._spawnOneBullet(-1, bs);
      this._spawnOneBullet( 1, bs);
    } else {
      this._spawnOneBullet(1, bs * 3);
    }
    this._flashTimer = 0.07;
  }

  _spawnOneBullet(side, speed) {
    const camFwd   = new THREE.Vector3();
    this.camera.getWorldDirection(camFwd);
    const aimPoint = this.camera.position.clone().addScaledVector(camFwd, 200);
    const origin   = this._handWorldPos(side);
    const dir      = aimPoint.clone().sub(origin).normalize();

    const mesh = new THREE.Mesh(this._bulletGeo, this._bulletMat);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    // don't special-case bullets based on the shooter being inside a bubble;
    // bullets are always slowed by bubble.scale when they are inside one.
    this._bullets.push({ mesh, vel: dir.multiplyScalar(speed), life: BULLET_LIFE });

    // spawn a tiny brass casing that ejects to the right/up/back of the camera
    // make casing a tiny version of the bullet geometry
    const casing = new THREE.Mesh(this._casingGeo, this._casingMat);
    casing.scale.setScalar(0.18);
     // compute right vector from camera forward
     const up = new THREE.Vector3(0,1,0);
     const right = camFwd.clone().cross(up).normalize();
     // position slightly to the right of the hand and a bit up
     casing.position.copy(origin).addScaledVector(right, 0.12).addScaledVector(up, 0.08);
     // random rotation
    casing.rotation.set(Math.random()*0.6, Math.random()*1.2, Math.random()*0.6);
    this.scene.add(casing);
    // ejection velocity (small)
     const eject = right.clone().multiplyScalar(1.0).add(up.clone().multiplyScalar(0.8)).add(camFwd.clone().multiplyScalar(-0.6));
     eject.add(new THREE.Vector3((Math.random()-0.5)*0.3, (Math.random()-0.5)*0.25, (Math.random()-0.5)*0.3));
    this._casings.push({
      mesh: casing,
      vel: eject, // metres/second (will be scaled by time/bubble)
      angVel: new THREE.Vector3(Math.random()*6-3, Math.random()*6-3, Math.random()*6-3),
      life: 1.4,
      settled: false
    });
  }

  _updateMuzzleFlash(realDt) {
    this._flashTimer = Math.max(0, this._flashTimer - realDt);
    const on   = this._flashTimer > 0;
    const t    = this._flashTimer / 0.07;
    const size = 1.3 + t * 1.5 + Math.random() * 0.4;
    const dual = this._weaponMode === 2;

    // Right-hand flash (always)
    this._muzzleFlash.visible = on;
    if (on) {
      const hand = this._handWorldPos(1);
      this._muzzleFlash.position.copy(hand);
      this._muzzleFlash.scale.setScalar(size);
      this._muzzleLight.position.copy(hand);
      this._muzzleLight.intensity = t * 8;
    } else {
      this._muzzleLight.intensity = 0;
    }

    // Left-hand flash (dual wield only)
    this._muzzleFlash2.visible = on && dual;
    if (on && dual) {
      const hand2 = this._handWorldPos(-1);
      this._muzzleFlash2.position.copy(hand2);
      this._muzzleFlash2.scale.setScalar(size);
      this._muzzleLight2.position.copy(hand2);
      this._muzzleLight2.intensity = t * 8;
    } else {
      this._muzzleLight2.intensity = 0;
    }
  }

  _updateBullets(dt, _realDt, boxes, targets, timeBubbles) {
    for (let i = this._bullets.length - 1; i >= 0; i--) {
      const b = this._bullets[i];

      // Steps based on max possible travel (no bubble scaling) so collision stays accurate.
      // bScale is recomputed each sub-step so bullets decelerate the instant they enter a bubble.
      const maxDist = b.vel.length() * dt;
      const steps   = Math.max(1, Math.ceil(maxDist / 0.3));
      const subDt   = dt / steps;

      for (let s = 0; s < steps; s++) {
        const bScale = timeBubbles ? timeBubbles.bulletScaleAt(b.mesh.position) : 1.0;

        // compute displacement for this sub-step so trail segment can be a line between prev->cur
        const disp = b.vel.clone().multiplyScalar(subDt * bScale);
        const nextPos = b.mesh.position.clone().add(disp);
        // advance bullet
        b.mesh.position.copy(nextPos);
        const p = b.mesh.position;

        // spawn a thin rectangular trail segment (line-like) instead of a sphere blob.
        const baseTrailLife = 0.10;
        // make trails a bit smaller overall; still enlarge in slow-mo but less aggressive
        const trailLife = baseTrailLife / Math.max(0.05, this.timeScale);
        const sizeMul = 0.6 / Math.max(0.05, this.timeScale); // larger in slow-mo
        const length = Math.max(0.02, disp.length()); // ensure visible even for tiny steps
        const width  = 0.008 * sizeMul;
        const geo = new THREE.BoxGeometry(width, length, width);
        const mat = this._trailMat.clone();
        mat.opacity = Math.min(1.0, 0.55 * sizeMul);
        const seg = new THREE.Mesh(geo, mat);
        // place segment at midpoint between prev and current
        seg.position.copy(p).sub(disp.clone().multiplyScalar(0.5));
        // orient the segment to align its Y axis with the displacement
        if (disp.lengthSq() > 1e-8) {
          seg.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), disp.clone().normalize());
        }
        seg.renderOrder = 998;
        this.scene.add(seg);
        this._bulletTrails.push({ mesh: seg, life: trailLife, baseLife: trailLife });

        if (targets?.testBullet(p)) {
          this._spawnImpact(p);
          this.scene.remove(b.mesh);
          this._bullets.splice(i, 1);
          break;
        }

        const hitSurface = (
          p.y < 0 || p.y > 11 ||
          Math.abs(p.x) > BOUNDS + 1 ||
          Math.abs(p.z) > BOUNDS + 1 ||
          boxes.some(box => box.containsPoint(p))
        );
        if (hitSurface) {
          this._spawnImpact(p);
          this.scene.remove(b.mesh);
          this._bullets.splice(i, 1);
          break;
        }
      }
    }
  }

  // new helper: spawn a flat mark on the wall behind you
  _spawnWallTrail() {
    if (!this._wallNormal) return;
    const sizeX = 0.32, sizeY = 0.12;
    const geo = new THREE.PlaneGeometry(sizeX, sizeY);
    const mesh = new THREE.Mesh(geo, this._wallTrailMat.clone());
    // position slightly into the wall so it appears on surface
    const offset = this._wallNormal.clone().multiplyScalar(-0.03);
    mesh.position.set(this.pos.x + offset.x, this.pos.y + 0.95, this.pos.z + offset.z);
    // orient plane so its normal faces outwards opposite to wall normal
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._wallNormal.clone().negate());
    // random yaw to add some variation
    const yaw = (Math.random() - 0.5) * 0.9;
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), yaw);
    mesh.quaternion.copy(yawQ.multiply(quat));
    mesh.renderOrder = 999;
    mesh.material.transparent = true;
    this.scene.add(mesh);
    this._wallTrails.push({ mesh, life: 0.8 });
  }

  // new helper: update bullet/wall trails (fade + remove)
  _updateTrails(realDt) {
    // scale decay by player's timeScale so trails remain visible during bullet-time
    const decayDt = realDt * Math.max(0.0001, this.timeScale);

    // bullet trails (thin boxes acting as line segments)
    for (let i = this._bulletTrails.length - 1; i >= 0; i--) {
      const t = this._bulletTrails[i];
      t.life -= decayDt;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        // dispose geometry/material to avoid memory leak
        if (t.mesh.geometry) t.mesh.geometry.dispose();
        if (t.mesh.material) t.mesh.material.dispose();
        this._bulletTrails.splice(i, 1);
      } else {
        const ratio = t.life / t.baseLife;
        // fade out and slightly shrink length as it ages
        t.mesh.material.opacity = Math.max(0.03, ratio * 0.9);
        // scale Y to shorten the segment over life (keeps it line-like)
        t.mesh.scale.y = 0.6 + 0.4 * ratio;
      }
    }

    // wall trails
    for (let i = this._wallTrails.length - 1; i >= 0; i--) {
      const w = this._wallTrails[i];
      w.life -= decayDt;
      if (w.life <= 0) {
        this.scene.remove(w.mesh);
        this._wallTrails.splice(i, 1);
      } else {
        w.mesh.material.opacity = (w.life / 0.8) * 0.55;
      }
    }

    // casings: move, spin and fade (affected by bullet-time)
    for (let i = this._casings.length - 1; i >= 0; i--) {
      const c = this._casings[i];
      // apply bubble/time scaling so casings slow in bullet-time as well
      const bubbleScale = this._timeBubbles ? this._timeBubbles.timeScaleAt(c.mesh.position) : 1.0;
      const moveDt = decayDt * bubbleScale;

      // gravity on casings so they arc realistically
      if (!c.settled) {
        c.vel.y += GRAVITY * moveDt;
      }
      c.mesh.position.addScaledVector(c.vel, moveDt);
      c.mesh.rotation.x += c.angVel.x * moveDt;
      c.mesh.rotation.y += c.angVel.y * moveDt;
      c.mesh.rotation.z += c.angVel.z * moveDt;
      // ground collision: settle casings on floor
      if (!c.settled && c.mesh.position.y <= 0.03) {
        c.mesh.position.y = 0.03;
        c.vel.set(0, 0, 0);
        c.angVel.multiplyScalar(0.25);
        c.settled = true;
        // shorten remaining life a bit so they don't linger forever
        c.life = Math.min(c.life, 0.9);
      }
      c.life -= decayDt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        if (c.mesh.geometry) c.mesh.geometry.dispose();
        if (c.mesh.material) c.mesh.material.dispose();
        this._casings.splice(i, 1);
      } else {
        // slowly fade casings
        c.mesh.material.opacity = Math.max(0.18, c.life / 1.4);
        c.mesh.material.transparent = true;
      }
    }
  }

  _spawnImpact(pos) {
    const mesh = new THREE.Mesh(this._impactGeo, this._impactMat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this._impacts.push({ mesh, life: 0.10 });
  }

  _updateImpacts(realDt) {
    for (let i = this._impacts.length - 1; i >= 0; i--) {
      const imp = this._impacts[i];
      imp.life -= realDt;
      if (imp.life <= 0) {
        this.scene.remove(imp.mesh);
        this._impacts.splice(i, 1);
      } else {
        const t = imp.life / 0.10;
        imp.mesh.scale.setScalar(0.4 + t * 1.2 + Math.random() * 0.3);
      }
    }
  }

  _look(input) {
    const { dx, dy, scroll } = input.consumeMouse();
    const s = BASE_SENS * this.sensitivityMul;
    this.camYaw   -= dx * s;
    this.camPitch += dy * s;
    this.camPitch  = Math.max(-0.5, Math.min(1.3, this.camPitch));
    if (scroll) this.camDist = Math.max(1.5, Math.min(10, this.camDist + scroll * 0.005));
  }

  _handleJump(input) {
    const down = input.key('Space');
    if (down && !this._spacePrev) {
      if (this.wallRunning) {
        this.vel.x         = this._wallNormal.x * WJ_SIDE;
        this.vel.z         = this._wallNormal.z * WJ_SIDE;
        this.vel.y         = WJ_UP;
        this.wallRunning   = false;
        this._wallRunTimer = 0;
        this.jumps         = 1;
        this.grounded      = false;
      } else if (this.jumps < MAX_JUMPS) {
        this.vel.y    = JUMP_VEL * this._jumpVelMul;
        this.jumps++;
        this.grounded = false;
        if (this.jumps === MAX_JUMPS) {   // second jump = flip
          this._flipping  = true;
          this._flipAngle = 0;
        }
      }
    }
    this._spacePrev = down;
  }

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

    // smoothly rotate mesh to face movement direction
    if (this._moving) {
      const target = Math.atan2(dir.x, dir.z);
      let diff = target - this._meshYaw;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this._meshYaw += diff * 0.18;
    }
  }

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
  }

  _clampBounds() {
    if (this.pos.x < -BOUNDS) { this.pos.x = -BOUNDS; this._wallNormal = new THREE.Vector3( 1, 0,  0); }
    if (this.pos.x >  BOUNDS) { this.pos.x =  BOUNDS; this._wallNormal = new THREE.Vector3(-1, 0,  0); }
    if (this.pos.z < -BOUNDS) { this.pos.z = -BOUNDS; this._wallNormal = new THREE.Vector3( 0, 0,  1); }
    if (this.pos.z >  BOUNDS) { this.pos.z =  BOUNDS; this._wallNormal = new THREE.Vector3( 0, 0, -1); }
  }

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
      // inject upward velocity if near-zero so player arcs up, then falls
      if (this.vel.y < WR_UPBOOST) this.vel.y = WR_UPBOOST;
    }
    if (this.wallRunning) {
      if (!this._wallNormal) {
        // left the wall
        this.wallRunning = false;
        return;
      }
      this._wallRunTimer += dt;
      if (this._wallRunTimer >= WR_DURATION) {
        this.wallRunning = false;
      }
    }
  }

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
    if (onGround) this.jumps = 0;
    this.grounded = onGround;
  }

  _ox(b) { return Math.min(this.pos.x + PR, b.max.x) - Math.max(this.pos.x - PR, b.min.x); }
  _oz(b) { return Math.min(this.pos.z + PR, b.max.z) - Math.max(this.pos.z - PR, b.min.z); }

  _diveQ() {
    const diveYaw = Math.atan2(this._diveDir.x, this._diveDir.z);
    const yawQ  = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), diveYaw);
    const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * 0.42);
    return yawQ.multiply(tiltQ);
  }

  _rightArmTargetQ() {
    const aimWorld = new THREE.Vector3();
    this.camera.getWorldDirection(aimWorld);
    const invMeshQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this._meshYaw);
    const localAim = aimWorld.clone().applyQuaternion(invMeshQ);
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), localAim);
  }

  _animateMesh(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this._meshYaw;
    if (this._diveTilt <= 0) this._meshDiveY = this.pos.y;

    // Arm targets — default: identity = arms hang straight at sides
    let rQ = new THREE.Quaternion();
    let lQ = new THREE.Quaternion();

    // ── shootdodge dive ──────────────────────────────────────────────────────
    if (this._diveTilt > 0) {
      const diveYaw  = Math.atan2(this._diveDir.x, this._diveDir.z);
      const uprightQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), diveYaw);
      this.mesh.quaternion.copy(uprightQ).slerp(this._diveQ(), this._diveTilt);
      const pivot   = new THREE.Vector3(0, 0.95, 0);
      const rotated = pivot.clone().applyQuaternion(this.mesh.quaternion);
      const targetMeshY = this._sliding
        ? this.pos.y
        : this.pos.y + pivot.y - rotated.y;
      this._meshDiveY += (targetMeshY - this._meshDiveY) * Math.min(1, 18 * dt);
      this.mesh.position.set(
        this.pos.x + pivot.x - rotated.x,
        this._meshDiveY,
        this.pos.z + pivot.z - rotated.z
      );
      this._lLegPivot.rotation.x = -0.35 * this._diveTilt;
      this._rLegPivot.rotation.x =  0.25 * this._diveTilt;
      this.mesh.scale.set(1, 1, 1);

      // Arms should point at the crosshair while diving (not straight up).
      // Compute world aim point from camera, then for each shoulder compute the
      // world->mesh-local direction and make the arm's local -Y point to it.
      const aimWorldDir = new THREE.Vector3();
      this.camera.getWorldDirection(aimWorldDir);
      const aimPoint = this.camera.position.clone().addScaledVector(aimWorldDir, 200);

      const idQ = new THREE.Quaternion();
      const rSprQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.18);
      const lSprQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1),  0.18);

      // Right shoulder
      {
        const shoulderWorld = new THREE.Vector3(0.225, 1.10, 0).applyQuaternion(this.mesh.quaternion).add(this.mesh.position);
        const dirWorld = aimPoint.clone().sub(shoulderWorld);
        if (dirWorld.lengthSq() < 1e-6) dirWorld.set(0, 0, -1);
        dirWorld.normalize();
        const invMeshQ = this.mesh.quaternion.clone().invert();
        const localDir = dirWorld.clone().applyQuaternion(invMeshQ);
        const armQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), localDir);
        const targetR = armQ.multiply(rSprQ);
        rQ.copy(idQ).slerp(targetR, this._diveTilt);
      }

      // Left shoulder
      {
        const shoulderWorld = new THREE.Vector3(-0.225, 1.10, 0).applyQuaternion(this.mesh.quaternion).add(this.mesh.position);
        const dirWorld = aimPoint.clone().sub(shoulderWorld);
        if (dirWorld.lengthSq() < 1e-6) dirWorld.set(0, 0, -1);
        dirWorld.normalize();
        const invMeshQ = this.mesh.quaternion.clone().invert();
        const localDir = dirWorld.clone().applyQuaternion(invMeshQ);
        const armQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), localDir);
        const targetL = armQ.multiply(lSprQ);
        lQ.copy(idQ).slerp(targetL, this._diveTilt);
      }

      this._rArmPivot.quaternion.slerp(rQ, 0.3);
      this._lArmPivot.quaternion.slerp(lQ, 0.3);
      return;
    }

    // ── double-jump backflip + tuck ──────────────────────────────────────────
    if (this._flipping) {
      this._flipAngle += FLIP_SPEED * dt;
      const done = this._flipAngle >= Math.PI * 2;
      if (done) { this._flipAngle = 0; this._flipping = false; }

      const tuck = Math.max(0, Math.sin(this._flipAngle / 2));
      this._lLegPivot.rotation.x = 2.0 * tuck;
      this._rLegPivot.rotation.x = 2.0 * tuck;
      this.mesh.scale.set(1, 1, 1);

      // Rotate around chest pivot instead of feet so the flip looks natural.
      const pivot = new THREE.Vector3(0, 0.95, 0); // chest pivot in mesh-local space

      // Always flip in the direction of the crosshair: use camera forward to get yaw.
      const camFwd = new THREE.Vector3();
      this.camera.getWorldDirection(camFwd);
      const flipYaw = Math.atan2(camFwd.x, camFwd.z);

      // build mesh quaternion combining yaw (toward crosshair) and flip around X
      const meshQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        done ? 0 : this._flipAngle, // x (flip)
        flipYaw,                    // y (yaw -> crosshair)
        0
      ));
      // rotated pivot position after applying rotation
      const rotated = pivot.clone().applyQuaternion(meshQ);
      // place mesh so pivot stays anchored to world position (this.pos + pivot)
      this.mesh.position.set(
        this.pos.x + pivot.x - rotated.x,
        this.pos.y + pivot.y - rotated.y,
        this.pos.z + pivot.z - rotated.z
      );
      // apply rotation
      this.mesh.quaternion.copy(meshQ);

      // arms tuck in during flip
      rQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.4 * tuck);
      lQ = rQ.clone();
      this._rArmPivot.quaternion.slerp(rQ, 0.3);
      this._lArmPivot.quaternion.slerp(lQ, 0.3);
      return;
    }

    // ── wall run ─────────────────────────────────────────────────────────────
    if (this.wallRunning && this._wallNormal) {
      this._walkCycle += dt * 11;
      const sw = Math.sin(this._walkCycle) * 0.85;
      this._lLegPivot.rotation.x =  sw;
      this._rLegPivot.rotation.x = -sw;
      const camRight = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
      this.mesh.rotation.z += (this._wallNormal.dot(camRight) * 0.32 - this.mesh.rotation.z) * 0.2;
      this.mesh.scale.set(1, 1, 1);
      this.mesh.rotation.x = 0;
      if (this._shooting) {
        // both arms aim toward the shot target
        rQ = this._rightArmTargetQ();
        lQ = rQ.clone();
      } else {
        rQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0),  sw * 0.5);
        lQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -sw * 0.5);
      }
      this._rArmPivot.quaternion.slerp(rQ, 0.25);
      this._lArmPivot.quaternion.slerp(lQ, 0.25);
      return;
    }
    this.mesh.rotation.z *= 0.75;
    this.mesh.rotation.x  = 0;

    // ── ground run / idle ────────────────────────────────────────────────────
    if (this._moving && this.grounded) {
      this._walkCycle += dt * 10;
      const sw = Math.sin(this._walkCycle) * 0.85;
      this._lLegPivot.rotation.x =  sw;
      this._rLegPivot.rotation.x = -sw;
      if (this._shooting) {
        // both arms aim toward the shot target
        rQ = this._rightArmTargetQ();
        lQ = rQ.clone();
      } else {
        rQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0),  sw * 0.45);
        lQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -sw * 0.45);
      }
    } else if (this.grounded) {
      this._lLegPivot.rotation.x *= 0.7;
      this._rLegPivot.rotation.x *= 0.7;
      if (this._shooting) {
        // both arms aim when shooting even if standing still
        rQ = this._rightArmTargetQ();
        lQ = rQ.clone();
      }
      // not shooting, not moving → rQ/lQ stay identity (arms hang at sides)
    } else {
      // airborne: only aim when shooting; otherwise keep arms hanging at sides
      if (this._shooting) {
        rQ = this._rightArmTargetQ();
        lQ = rQ.clone();
      }
      // not shooting, not diving → rQ/lQ remain identity (arms hang at sides)
    }

    this._rArmPivot.quaternion.slerp(rQ, 0.25);
    this._lArmPivot.quaternion.slerp(lQ, 0.25);

    // ── squash & stretch (airborne only) ─────────────────────────────────────
    if (!this.grounded) {
      const stretch = 1 + this.vel.y * 0.014;
      this.mesh.scale.y = Math.max(0.72, Math.min(1.35, stretch));
      this.mesh.scale.x = 1 / Math.sqrt(Math.abs(this.mesh.scale.y));
    } else {
      this.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.3);
    }
  }

  _updateCamera() {
    // back offset + right shoulder offset
    const cx = this.pos.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist + Math.cos(this.camYaw) * CAM_SIDE;
    const cy = this.pos.y + this.camHeight + Math.sin(this.camPitch) * this.camDist;
    const cz = this.pos.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist - Math.sin(this.camYaw) * CAM_SIDE;
    this.camera.position.set(cx, cy, cz);

    // camera roll toward wall during wall run
    let targetRoll = 0;
    if (this.wallRunning && this._wallNormal) {
      const camRight = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
      targetRoll = this._wallNormal.dot(camRight) * CAM_ROLL_MAX;
    }
    this._camRoll += (targetRoll - this._camRoll) * 0.12;

    const lookTarget = new THREE.Vector3(this.pos.x, this.pos.y + this.camHeight, this.pos.z);
    this.camera.lookAt(lookTarget);

    // apply roll via camera up vector
    const forward = lookTarget.clone().sub(this.camera.position).normalize();
    const worldUp  = new THREE.Vector3(0, 1, 0);
    const right    = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
    const tiltedUp = new THREE.Vector3()
      .addScaledVector(worldUp, Math.cos(this._camRoll))
      .addScaledVector(right,   Math.sin(this._camRoll));
    this.camera.up.copy(tiltedUp);
    this.camera.lookAt(lookTarget);
  }
}
