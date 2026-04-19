import * as THREE from 'three';
import { Input }   from './Input.js';
import { Player }  from './Player.js';
import { World }   from './World.js';
import { Targets } from './Targets.js';

const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const input   = new Input();
const player  = new Player(scene, camera);
const world   = new World(scene);
const targets = new Targets(scene);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── UI elements ──────────────────────────────────────────────────────────────
const overlay    = document.getElementById('overlay');
const escMenu    = document.getElementById('esc-menu');
const startBtn   = document.getElementById('start-btn');
const resumeBtn  = document.getElementById('resume-btn');
const sensSlider     = document.getElementById('sens-slider');
const sensVal        = document.getElementById('sens-val');
const camHeightSlider = document.getElementById('camheight-slider');
const camHeightVal    = document.getElementById('camheight-val');
const camDistSlider   = document.getElementById('camdist-slider');
const camDistVal      = document.getElementById('camdist-val');
const camAngleSlider  = document.getElementById('camangle-slider');
const camAngleVal     = document.getElementById('camangle-val');
const btOverlay      = document.getElementById('bt-overlay');
const btHud          = document.getElementById('bt-hud');
const btFill         = document.getElementById('bt-fill');

function lock() { renderer.domElement.requestPointerLock(); }

// Start
startBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  lock();
});

// Resume from ESC menu
resumeBtn.addEventListener('click', () => {
  escMenu.style.display = 'none';
  lock();
});

// Pointer lock change → show/hide ESC menu
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  input.locked = locked;
  if (!locked && overlay.style.display === 'none') {
    escMenu.style.display = 'flex';
  }
});

// Direct ESC key → open menu immediately without needing a second press
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && overlay.style.display === 'none') {
    escMenu.style.display = 'flex';
  }
});

// Sensitivity slider
sensSlider.addEventListener('input', () => {
  const v = parseFloat(sensSlider.value);
  player.sensitivityMul = v;
  sensVal.textContent = v.toFixed(1);
});

camHeightSlider.addEventListener('input', () => {
  const v = parseFloat(camHeightSlider.value);
  player.camHeight = v;
  camHeightVal.textContent = v.toFixed(1);
});

camDistSlider.addEventListener('input', () => {
  const v = parseFloat(camDistSlider.value);
  player.camDist = v;
  camDistVal.textContent = v.toFixed(1);
});

camAngleSlider.addEventListener('input', () => {
  const v = parseFloat(camAngleSlider.value);
  player.camPitch = v;
  camAngleVal.textContent = v.toFixed(2);
});

// ── Game loop ────────────────────────────────────────────────────────────────
let prev = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - prev) / 1000, 0.05);
  prev = now;
  // Only update movement when pointer is locked (paused in ESC menu otherwise)
  if (input.locked) { player.update(dt, input, world.boxes, targets); targets.update(dt); }

  const btActive = player.timeScale < 1;
  btOverlay.style.opacity = btActive ? '1' : '0';
  btHud.style.opacity     = btActive ? '1' : '0';
  btFill.style.width = (player.bulletTimeLeft / 6 * 100) + '%';

  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
