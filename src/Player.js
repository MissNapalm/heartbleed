import * as THREE from 'three';

const SPEED            = 11;
const JUMP_VEL         = 25;
const GRAVITY          = -20;
const CHAR_H           = 1.3;
const PR               = 0.3;
const BOUNDS           = 19.7;
const BASE_SENS        = 0.001;
const CAM_DIST         = 4.0;
const CAM_PIVOT_H      = 1.5;
const CAM_SIDE         = 0.65;
const MAX_JUMPS        = 1;
const WR_GRAVITY       = 0;
const WR_DURATION      = 1.;
const WJ_SIDE          = 6.5;
const WJ_UP            = 8.5;
const CAM_ROLL_MAX     = 0.18;
const FLIP_SPEED       = Math.PI * 3.5;
const BULLET_SPEED     = 600;
const BULLET_LIFE      = 2.5;
const FIRE_RATE        = 0.20;
const MAX_BULLETS      = 60;
const BT_DURATION      = 4.5;
const BT_SCALE_Q       = 0.03;
const WALL_TRAIL_INTERVAL = 0.06;
const SIDE_FLIP_VEL    = 7;
const KICK_DURATION    = 1.0;
const KICK_FORWARD     = 9;
const KICK_SPIN_SPEED  = Math.PI * 4;

export class Player {
  constructor(scene, camera) {
    this.scene    = scene;
    this.camera   = camera;
    // allow using right-click for gameplay (prevent context menu)
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

    this._swordCombo      = 0;    // 0=ready 1=after-first 2=after-second
    this._swordSwing      = null; // 'r' | 'l' | 'spin'
    this._swordTimer      = 0;
    this._swordDuration   = 0;
    this._swordComboReset = 0;
    this._clickPrev       = false;

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

    this._moveSpeedMul   = 1.0;
    this._jumpVelMul     = 1.0;
    this._bulletSpeedMul = 1.0;

    // tunable physics: gravity multiplier and jump-force multiplier
    // controllable from UI / debugger via player.setGravityMul(...) / player.setJumpForceMul(...)
    this._gravityMul = 2.0;
    // _jumpVelMul already exists and drives jump force; keep for API consistency
    // this._jumpVelMul initialized above

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
    // Trail pooling to avoid allocating geometries/materials every frame (fixes huge FPS drop
    // when bullets linger inside very-slow bubbles).
    this._trailPool = [];
    this._trailProtoGeo = new THREE.BoxGeometry(1, 1, 1); // reused geometry for trail segments
    this._trailProtoMat = this._trailMat;
    // reduce max live trail segments to avoid draw call & memory pressure in slowmo
    this._maxTrails = 250;
    // prefill a small pool of reusable meshes to avoid runtime allocation spikes
    const PREALLOC = 60;
    for (let i = 0; i < PREALLOC; i++) {
      const mat = this._trailProtoMat.clone();
      const m = new THREE.Mesh(this._trailProtoGeo, mat);
      m.frustumCulled = true;
      m.visible = false;
      // add to scene once so we never add/remove during gameplay
      scene.add(m);
      this._trailPool.push(m);
    }

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
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), mat);
    head.position.y = 1.66;
    root.add(head);

    // HAIR BUN — sits at back-top of head to read as female
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.085, 4, 3), mat);
    hair.position.set(0, 1.70, -0.09);
    hair.scale.set(1.1, 0.75, 0.9);
    root.add(hair);

    // NECK
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.047, 0.13, 5), mat);
    neck.position.y = 1.54;
    root.add(neck);

    // CHEST — narrow shoulders (female), tapers to waist
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.130, 0.100, 0.32, 6), mat);
    chest.position.y = 1.25;
    root.add(chest);

    // WAIST — very narrow hourglass
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.100, 0.20, 6), mat);
    waist.position.y = 0.97;
    root.add(waist);

    // HIPS — wide (female)
    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.210, 0.185, 0.17, 6), mat);
    hips.position.y = 0.78;
    root.add(hips);

    // ARMS — pivot at shoulder joint
    for (const [xs, prop] of [[-1, '_lArmPivot'], [1, '_rArmPivot']]) {
      const pivot = new THREE.Group();
      pivot.position.set(xs * 0.20, 1.38, 0);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.30, 5), mat);
      upper.position.y = -0.15;
      pivot.add(upper);

      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.036, 4, 3), mat);
      elbow.position.y = -0.30;
      pivot.add(elbow);

      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.26, 5), mat);
      fore.position.y = -0.43;
      pivot.add(fore);

      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.058, 0.068), mat);
      hand.position.y = -0.60;
      pivot.add(hand);

      this[prop] = pivot;
      root.add(pivot);
    }

    // LEGS — pivot at hip joint
    for (const [xs, prop] of [[-1, '_lLegPivot'], [1, '_rLegPivot']]) {
      const pivot = new THREE.Group();
      pivot.position.set(xs * 0.115, 0.68, 0);

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.052, 0.34, 5), mat);
      thigh.position.y = -0.17;
      pivot.add(thigh);

      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.050, 4, 3), mat);
      knee.position.y = -0.34;
      pivot.add(knee);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.032, 0.30, 5), mat);
      shin.position.y = -0.49;
      pivot.add(shin);

      const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.032, 4, 3), mat);
      ankle.position.y = -0.64;
      pivot.add(ankle);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.055, 0.20), mat);
      foot.position.set(0, -0.66, 0.05);
      pivot.add(foot);

      this[prop] = pivot;
      root.add(pivot);
    }

    // SWORD — child of right arm, always visible
    const sMat   = new THREE.MeshLambertMaterial({ color: 0xc8d8e8, flatShading: true });
    const hMat   = new THREE.MeshLambertMaterial({ color: 0x886622, flatShading: true });
    const sg     = new THREE.Group();
    sg.position.set(0.02, -0.60, 0.05);

    const blade  = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.54, 0.007), sMat);
    blade.position.y = 0.27;
    sg.add(blade);

    const guard  = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.025, 0.022), sMat);
    sg.add(guard);

    const shandle = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.016, 0.16, 5), hMat);
    shandle.position.y = -0.10;
    sg.add(shandle);

    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.028, 4, 3), hMat);
    pommel.position.y = -0.20;
    sg.add(pommel);

    this._sword = sg;
    this._rArmPivot.add(sg);

    return root;
  }

  update(realDt, input, boxes, targets, timeBubbles) {
    // ── Slide input ──────────────────────────────────────────────────────────
    const shiftDown = input.key('ShiftLeft') || input.key('ShiftRight');
    if (shiftDown && this.grounded && !this._sliding) {
      this._sliding = true;
    }
    if (!shiftDown) this._sliding = false;
    this._shiftPrev = shiftDown;

    // ── Time scale (dive slow-mo > Q bullet time > normal) ───────────────────
    // accept either standard right-button index (2) or the (previous) 1 mapping
    const rmbDown = input.mouseBtn(2) || input.mouseBtn(1);
    if (rmbDown && !this._rmbPrev && this.bulletTimeLeft <= 0) { this.bulletTimeLeft = BT_DURATION; this._btSlow = false; }
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

    // Bullet-time timeScale
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

    // slide / windup friction
    if (this._sliding) {
      const friction = Math.exp(-3 * dt);
      this.vel.x *= friction;
      this.vel.z *= friction;
    } else if (this._sideFlipWindup) {
      const friction = Math.exp(-20 * dt);
      this.vel.x *= friction;
      this.vel.z *= friction;
    }

    // horizontal
    this._wallNormal = null;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this._resolveH(boxes);
    this._clampBounds();

    if (!this._sliding) {
      this._updateWallRun(dt);
      this._handleJump(input, dt);
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
    this._updateTrails(realDt); // update & fade bullet + wall trails
    this._animateMesh(dt);
    this._updateCamera();
    this._updateMuzzleFlash(realDt);
    this._blob.position.set(this.pos.x, 0.01, this.pos.z);
  }

  _handleFire(realDt, input) {
    this._shooting = input.key('KeyQ');
    this._fireTimer = Math.max(0, this._fireTimer - realDt);
    if (this._shooting && this._fireTimer <= 0 && this._bullets.length < MAX_BULLETS) {
      this._spawnBullet();
      this._fireTimer = FIRE_RATE;
    }
  }

  _handleSword(realDt, input) {
    const click = input.mouseBtn(0);

    if (this._swordTimer > 0) this._swordTimer -= realDt;
    if (this._swordTimer <= 0) this._swordSwing = null;

    if (this._swordComboReset > 0) {
      this._swordComboReset -= realDt;
      if (this._swordComboReset <= 0) this._swordCombo = 0;
    }

    if (click && !this._clickPrev) {
      this._swordComboReset = 1.2;
      if (this._swordCombo === 0) {
        this._swordSwing    = 'r';
        this._swordDuration = 0.22;
        this._swordTimer    = 0.22;
        this._swordCombo    = 1;
      } else if (this._swordCombo === 1) {
        this._swordSwing    = 'l';
        this._swordDuration = 0.22;
        this._swordTimer    = 0.22;
        this._swordCombo    = 2;
      } else {
        this._swordSwing    = 'spin';
        this._swordDuration = 0.45;
        this._swordTimer    = 0.45;
        this._swordCombo    = 0;
      }
    }
    this._clickPrev = click;
  }

  _handWorldPos(side = 1) {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
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

    // determine whether this bullet was spawned from inside a time bubble
    const spawnInside = this._timeBubbles ? (this._timeBubbles.timeScaleAt(origin) < 1.0) : false;
    // store origin-inside flag so update logic can treat "fired into" vs "fired from" differently
    this._bullets.push({ mesh, vel: dir.multiplyScalar(speed), life: BULLET_LIFE, spawnInside });
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

      // Use the real (unscaled) delta for bullet stepping so bullets don't freeze
      // when the player's timeScale is small. We still apply the bubble's per-position
      // slow factor (bScale) to the movement so bullets slow inside time bubbles.
      const maxDist = b.vel.length() * _realDt;
      const steps   = Math.max(1, Math.ceil(maxDist / 0.3));
      const subDt   = _realDt / steps;

      for (let s = 0; s < steps; s++) {
        // base bubble scale at this position
        let bScale = timeBubbles ? timeBubbles.bulletScaleAt(b.mesh.position) : 1.0;
        if (bScale < 1.0) {
          if (b.spawnInside) {
            // fired from inside → only slow to the player's normal bullet-time speed (don't over-slow)
            // use the player's current timeScale as the minimum allowed speed inside bubble
            bScale = Math.max(bScale, this.timeScale);
          } else {
            // fired from outside → go WAY slower on entry to emphasize time field
            // apply an extra slowdown multiplier (keeps bullet visible but very slow)
            const EXTRA_SLOW = 0.06; // smaller = much slower when entering from outside
            bScale = Math.max(0.0001, bScale * EXTRA_SLOW);
          }
        }

        // compute displacement for this sub-step and advance using it
        const disp = b.vel.clone().multiplyScalar(subDt * bScale);
        const nextPos = b.mesh.position.clone().add(disp);
        b.mesh.position.copy(nextPos);
        const p = b.mesh.position;

        const baseTrailLife = 0.10;
        const effectiveScaleForTrails = this.timeScale;
        const trailLife = baseTrailLife / Math.max(0.05, effectiveScaleForTrails);
        const sizeMul = 0.45 / Math.max(0.05, effectiveScaleForTrails);
        const length = Math.max(0.02, disp.length()); // ensure visible even for tiny steps
        const width  = 0.006 * sizeMul;

        // reuse pooled mesh to avoid allocations
        let seg = this._trailPool.pop();
        let created = false;
        if (!seg) {
          const mat = this._trailProtoMat.clone();
          seg = new THREE.Mesh(this._trailProtoGeo, mat);
          seg.frustumCulled = true;
          created = true;
        }
        seg.visible = true;
        seg.scale.set(width, length, width);
        seg.material.opacity = Math.min(1.0, 0.55 * sizeMul);
         // place segment at midpoint between prev and current
        seg.position.copy(p).sub(disp.clone().multiplyScalar(0.5));
         // orient the segment to align its Y axis with the displacement
        if (disp.lengthSq() > 1e-8) seg.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), disp.clone().normalize());
        seg.renderOrder = 998;
        // only add to scene if this was newly created (pool pre-added meshes in constructor)
        if (created) this.scene.add(seg);
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
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
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
        // return to pool without removing from scene (pool meshes were pre-added)
        t.mesh.visible = false;
        this._trailPool.push(t.mesh);
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
        c.vel.y += GRAVITY * this._gravityMul * moveDt;
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

  _handleJump(input, dt) {
    const down = input.key('Space');
    if (!down) this._jumpHeld = false;
    if (this._sideFlipWindup) {
      this._sideFlipChargeTime += dt;
      if (!down && this._spacePrev) {
        this._sideFlipWindup = false;
        // 0 = instant tap, 1 = fully charged (stopped)
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
      this.vel.y         = 0;
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
    if (onGround) { this.jumps = 0; this._sideFlipping = false; this._kicking = false; }
    this.grounded = onGround;
  }

  _ox(b) { return Math.min(this.pos.x + PR, b.max.x) - Math.max(this.pos.x - PR, b.min.x); }
  _oz(b) { return Math.min(this.pos.z + PR, b.max.z) - Math.max(this.pos.z - PR, b.min.z); }

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

    // Arm targets — default: identity = arms hang straight at sides
    let rQ = new THREE.Quaternion();
    let lQ = new THREE.Quaternion();

    // ── ground slide ─────────────────────────────────────────────────────────
    if (this._sliding) {
      this.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this._meshYaw);
      this.mesh.scale.set(1, 0.55, 1);
      this._lLegPivot.rotation.x = 1.1;
      this._rLegPivot.rotation.x = 0.8;
      this.mesh.rotation.z *= 0.75;
      this._rArmPivot.quaternion.slerp(rQ, 0.2);
      this._lArmPivot.quaternion.slerp(lQ, 0.2);
      return;
    }

    // ── aerial spin kick ─────────────────────────────────────────────────────
    if (this._kicking) {
      const camFwd = new THREE.Vector3();
      this.camera.getWorldDirection(camFwd);
      const kickYaw = Math.atan2(camFwd.x, camFwd.z);

      // Smoothly lean in over first 0.15 s and back out over last 0.15 s so the
      // model centre stays at a constant world-space height throughout.
      const elapsed   = KICK_DURATION - this._kickTimer;
      const rampTime  = 0.15;
      const entryT    = Math.min(1.0, elapsed / rampTime);
      const exitT     = Math.min(1.0, this._kickTimer / rampTime);
      const leanT     = entryT * exitT;
      const leanAngle = Math.PI * 0.5 * leanT;

      const fwdAxis  = new THREE.Vector3(-Math.sin(kickYaw), 0, -Math.cos(kickYaw));
      const spinQ    = new THREE.Quaternion().setFromAxisAngle(fwdAxis, this._kickSpinAngle);
      const camRight = new THREE.Vector3( Math.cos(kickYaw), 0, -Math.sin(kickYaw));
      const leanQ    = new THREE.Quaternion().setFromAxisAngle(camRight, leanAngle);
      this.mesh.quaternion.copy(spinQ).multiply(leanQ);
      this.mesh.scale.set(1, 1, 1);

      // Lift mesh origin so the visual centre stays at standing height.
      // When lean=θ, centre drops by (1-cos θ)*halfH; we compensate here.
      this.mesh.position.y = this.pos.y + 0.89 * (1 - Math.cos(leanAngle));

      this._rLegPivot.rotation.x = 0;
      this._lLegPivot.rotation.x = 0;
      this._rLegPivot.rotation.z = 0;
      this._lLegPivot.rotation.z = 0;

      rQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.8 * leanT);
      lQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.8 * leanT);
      this._rArmPivot.quaternion.copy(rQ);
      this._lArmPivot.quaternion.copy(lQ);
      return;
    }

    // ── side flip ────────────────────────────────────────────────────────────
    if (this._sideFlipping) {
      this._sideFlipAngle += FLIP_SPEED * dt;
      const done = this._sideFlipAngle >= Math.PI * 2;

      const tuck = Math.max(0, Math.sin(this._sideFlipAngle / 2));
      this._lLegPivot.rotation.x = 2.0 * tuck;
      this._rLegPivot.rotation.x = 2.0 * tuck;
      this.mesh.scale.set(1, 1, 1);

      const pivot = new THREE.Vector3(0, 0.95, 0);
      const camFwd = new THREE.Vector3();
      this.camera.getWorldDirection(camFwd);
      const flipYaw = Math.atan2(camFwd.x, camFwd.z);

      const meshQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        0,
        flipYaw,
        done ? 0 : this._sideFlipAngle * this._sideFlipDir
      ));
      const rotated = pivot.clone().applyQuaternion(meshQ);
      this.mesh.position.set(
        this.pos.x + pivot.x - rotated.x,
        this.pos.y + pivot.y - rotated.y,
        this.pos.z + pivot.z - rotated.z
      );
      this.mesh.quaternion.copy(meshQ);

      if (done) {
        this._sideFlipAngle = 0;
        this._sideFlipping  = false;
        this._meshYaw = flipYaw;
        const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this._meshYaw);
        this.mesh.quaternion.copy(yawQ);
        this.mesh.rotation.x = 0;
        this.mesh.rotation.z = 0;
        const snappedRotated = pivot.clone().applyQuaternion(this.mesh.quaternion);
        this.mesh.position.set(
          this.pos.x + pivot.x - snappedRotated.x,
          this.pos.y + pivot.y - snappedRotated.y,
          this.pos.z + pivot.z - snappedRotated.z
        );
      }

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

    // ── sword swing overrides arm quaternions ────────────────────────────────
    if (this._swordSwing) {
      const t = 1.0 - this._swordTimer / this._swordDuration; // 0→1
      if (this._swordSwing === 'r') {
        const sA = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.7, 0,  1.3));
        const eA = new THREE.Quaternion().setFromEuler(new THREE.Euler( 0.5, 0, -0.9));
        rQ.slerpQuaternions(sA, eA, t);
      } else if (this._swordSwing === 'l') {
        const sA = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.7, 0, -1.3));
        const eA = new THREE.Quaternion().setFromEuler(new THREE.Euler( 0.5, 0,  0.9));
        rQ.slerpQuaternions(sA, eA, t);
      } else if (this._swordSwing === 'spin') {
        rQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.4);
        lQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1),  1.4);
        this.mesh.rotation.y = this._meshYaw + Math.PI * 2 * t;
      }
    }

    this._rArmPivot.quaternion.slerp(rQ, this._swordSwing ? 0.6 : 0.25);
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

  // API helpers to adjust physics at runtime (useful for UI sliders)
  setGravityMul(v) {
    this._gravityMul = Math.max(0, v);
  }

  setJumpForceMul(v) {
    this._jumpVelMul = Math.max(0, v);
  }
}
