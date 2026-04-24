import * as THREE from 'three';
import {
  BULLET_SPEED, BULLET_LIFE, FIRE_RATE, MAX_BULLETS,
  GRAVITY, BOUNDS,
} from './PlayerConstants.js';

export const CombatMethods = {
  _handleFire(realDt, input) {
    this._shooting = input.key('KeyQ');
    this._fireTimer = Math.max(0, this._fireTimer - realDt);
    if (this._shooting && this._fireTimer <= 0 && this._bullets.length < MAX_BULLETS) {
      this._spawnBullet();
      this._fireTimer = FIRE_RATE;
    }
  },

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
  },

  _handWorldPos(side = 1) {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const meshRight = new THREE.Vector3(Math.cos(this._meshYaw), 0, -Math.sin(this._meshYaw));
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.10, this.pos.z)
      .addScaledVector(meshRight, side * 0.225)
      .addScaledVector(dir, 0.47);
  },

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
  },

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

    const spawnInside = this._timeBubbles ? (this._timeBubbles.timeScaleAt(origin) < 1.0) : false;
    this._bullets.push({ mesh, vel: dir.multiplyScalar(speed), life: BULLET_LIFE, spawnInside });
  },

  _updateMuzzleFlash(realDt) {
    this._flashTimer = Math.max(0, this._flashTimer - realDt);
    const on   = this._flashTimer > 0;
    const t    = this._flashTimer / 0.07;
    const size = 1.3 + t * 1.5 + Math.random() * 0.4;
    const dual = this._weaponMode === 2;

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
  },

  _updateBullets(dt, _realDt, boxes, targets, timeBubbles) {
    for (let i = this._bullets.length - 1; i >= 0; i--) {
      const b = this._bullets[i];

      const maxDist = b.vel.length() * _realDt;
      const steps   = Math.max(1, Math.ceil(maxDist / 0.3));
      const subDt   = _realDt / steps;

      for (let s = 0; s < steps; s++) {
        let bScale = timeBubbles ? timeBubbles.bulletScaleAt(b.mesh.position) : 1.0;
        if (bScale < 1.0) {
          if (b.spawnInside) {
            bScale = Math.max(bScale, this.timeScale);
          } else {
            const EXTRA_SLOW = 0.06;
            bScale = Math.max(0.0001, bScale * EXTRA_SLOW);
          }
        }

        const disp = b.vel.clone().multiplyScalar(subDt * bScale);
        const nextPos = b.mesh.position.clone().add(disp);
        b.mesh.position.copy(nextPos);
        const p = b.mesh.position;

        const baseTrailLife = 0.10;
        const effectiveScaleForTrails = this.timeScale;
        const trailLife = baseTrailLife / Math.max(0.05, effectiveScaleForTrails);
        const sizeMul = 0.45 / Math.max(0.05, effectiveScaleForTrails);
        const length = Math.max(0.02, disp.length());
        const width  = 0.006 * sizeMul;

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
        seg.position.copy(p).sub(disp.clone().multiplyScalar(0.5));
        if (disp.lengthSq() > 1e-8) seg.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), disp.clone().normalize());
        seg.renderOrder = 998;
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
  },

  _spawnImpact(pos) {
    const mesh = new THREE.Mesh(this._impactGeo, this._impactMat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this._impacts.push({ mesh, life: 0.10 });
  },

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
  },
};
