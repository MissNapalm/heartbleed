import * as THREE from 'three';
import { FLIP_SPEED, GRAVITY } from './PlayerConstants.js';

export const AnimationMethods = {
  _buildMesh() {
    const root = new THREE.Group();
    const mat  = new THREE.MeshLambertMaterial({ color: 0xaa44ff, flatShading: true });

    // HEAD
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), mat);
    head.position.y = 1.66;
    root.add(head);

    // HAIR BUN
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.085, 4, 3), mat);
    hair.position.set(0, 1.70, -0.09);
    hair.scale.set(1.1, 0.75, 0.9);
    root.add(hair);

    // NECK
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.047, 0.13, 5), mat);
    neck.position.y = 1.54;
    root.add(neck);

    // CHEST
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.130, 0.100, 0.32, 6), mat);
    chest.position.y = 1.25;
    root.add(chest);

    // WAIST
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.100, 0.20, 6), mat);
    waist.position.y = 0.97;
    root.add(waist);

    // HIPS
    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.210, 0.185, 0.17, 6), mat);
    hips.position.y = 0.78;
    root.add(hips);

    // ARMS
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

    // LEGS
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

    // SWORD — child of right arm
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
  },

  _rightArmTargetQ() {
    const aimWorld = new THREE.Vector3();
    this.camera.getWorldDirection(aimWorld);
    const invMeshQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this._meshYaw);
    const localAim = aimWorld.clone().applyQuaternion(invMeshQ);
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), localAim);
  },

  _animateMesh(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this._meshYaw;

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

      // Negative lean: head goes toward camera, feet lead away — feet-first kick.
      // Fixed angle (no ramp) so the model never appears to shrink.
      const leanAngle = -Math.PI * 0.5;
      const fwdAxis   = new THREE.Vector3(-Math.sin(kickYaw), 0, -Math.cos(kickYaw));
      const spinQ     = new THREE.Quaternion().setFromAxisAngle(fwdAxis, this._kickSpinAngle);
      const camRight  = new THREE.Vector3( Math.cos(kickYaw), 0, -Math.sin(kickYaw));
      const leanQ     = new THREE.Quaternion().setFromAxisAngle(camRight, leanAngle);
      this.mesh.quaternion.copy(spinQ).multiply(leanQ);
      this.mesh.scale.set(1, 1, 1);

      // Lift origin so the visual centre stays at standing height (cos(-π/2)=0 → constant 0.89).
      this.mesh.position.y = this.pos.y + 0.89;

      this._rLegPivot.rotation.x = 0;
      this._lLegPivot.rotation.x = 0;
      this._rLegPivot.rotation.z = 0;
      this._lLegPivot.rotation.z = 0;

      rQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.8);
      lQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.8);
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
        rQ = this._rightArmTargetQ();
        lQ = rQ.clone();
      }
    } else {
      if (this._shooting) {
        rQ = this._rightArmTargetQ();
        lQ = rQ.clone();
      }
    }

    // ── sword swing overrides arm quaternions ────────────────────────────────
    if (this._swordSwing) {
      const t = 1.0 - this._swordTimer / this._swordDuration;
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
  },

  _spawnWallTrail() {
    if (!this._wallNormal) return;
    const sizeX = 0.32, sizeY = 0.12;
    const geo = new THREE.PlaneGeometry(sizeX, sizeY);
    const mesh = new THREE.Mesh(geo, this._wallTrailMat.clone());
    const offset = this._wallNormal.clone().multiplyScalar(-0.03);
    mesh.position.set(this.pos.x + offset.x, this.pos.y + 0.95, this.pos.z + offset.z);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._wallNormal.clone().negate());
    const yaw = (Math.random() - 0.5) * 0.9;
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    mesh.quaternion.copy(yawQ.multiply(quat));
    mesh.renderOrder = 999;
    mesh.material.transparent = true;
    this.scene.add(mesh);
    this._wallTrails.push({ mesh, life: 0.8 });
  },

  _updateTrails(realDt) {
    const decayDt = realDt * Math.max(0.0001, this.timeScale);

    for (let i = this._bulletTrails.length - 1; i >= 0; i--) {
      const t = this._bulletTrails[i];
      t.life -= decayDt;
      if (t.life <= 0) {
        t.mesh.visible = false;
        this._trailPool.push(t.mesh);
        this._bulletTrails.splice(i, 1);
      } else {
        const ratio = t.life / t.baseLife;
        t.mesh.material.opacity = Math.max(0.03, ratio * 0.9);
        t.mesh.scale.y = 0.6 + 0.4 * ratio;
      }
    }

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

    for (let i = this._casings.length - 1; i >= 0; i--) {
      const c = this._casings[i];
      const bubbleScale = this._timeBubbles ? this._timeBubbles.timeScaleAt(c.mesh.position) : 1.0;
      const moveDt = decayDt * bubbleScale;

      if (!c.settled) {
        c.vel.y += GRAVITY * this._gravityMul * moveDt;
      }
      c.mesh.position.addScaledVector(c.vel, moveDt);
      c.mesh.rotation.x += c.angVel.x * moveDt;
      c.mesh.rotation.y += c.angVel.y * moveDt;
      c.mesh.rotation.z += c.angVel.z * moveDt;
      if (!c.settled && c.mesh.position.y <= 0.03) {
        c.mesh.position.y = 0.03;
        c.vel.set(0, 0, 0);
        c.angVel.multiplyScalar(0.25);
        c.settled = true;
        c.life = Math.min(c.life, 0.9);
      }
      c.life -= decayDt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        if (c.mesh.geometry) c.mesh.geometry.dispose();
        if (c.mesh.material) c.mesh.material.dispose();
        this._casings.splice(i, 1);
      } else {
        c.mesh.material.opacity = Math.max(0.18, c.life / 1.4);
        c.mesh.material.transparent = true;
      }
    }
  },
};
