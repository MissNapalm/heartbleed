import * as THREE from 'three';
import { Input }       from './Input.js';
import { Player }      from './Player.js';
import { World }       from './World.js';
import { TimeBubbles } from './TimeBubbles.js';

const scene    = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e1a);
scene.fog = new THREE.Fog(0x0a0e1a, 30, 55);
const camera   = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
// clamp DPR — 1.25 is usually a good compromise on HiDPI displays; set to 1.0 for max perf
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
// disable shadow map if not needed (costly)
renderer.shadowMap.enabled = false;
document.body.appendChild(renderer.domElement);

const input       = new Input();
const player      = new Player(scene, camera);
const world       = new World(scene);
const timeBubbles = new TimeBubbles(scene);

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
const speedSlider     = document.getElementById('speed-slider');
const speedVal        = document.getElementById('speed-val');
const jumpSlider      = document.getElementById('jump-slider');
const jumpVal         = document.getElementById('jump-val');
const bulletSlider    = document.getElementById('bullet-slider');
const bulletVal       = document.getElementById('bullet-val');
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

speedSlider.addEventListener('input', () => {
  const v = parseFloat(speedSlider.value);
  player._moveSpeedMul = v;
  speedVal.textContent = v.toFixed(1);
});

jumpSlider.addEventListener('input', () => {
  const v = parseFloat(jumpSlider.value);
  player._jumpVelMul = v;
  jumpVal.textContent = v.toFixed(1);
});

bulletSlider.addEventListener('input', () => {
  const v = parseFloat(bulletSlider.value);
  player._bulletSpeedMul = v;
  bulletVal.textContent = v.toFixed(1);
});


// ensure the browser title is correct
document.title = 'Neuro Runner';

// Update or create a clear title block on the title screen overlay.
// This replaces any leftover "fps" text on the title screen.
(function ensureTitle() {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;

  // prefer an existing h1 if present
  let h1 = overlay.querySelector('h1');
  if (!h1) {
    h1 = document.createElement('h1');
    overlay.prepend(h1);
  }
  h1.id = 'title-main';
  h1.innerText = 'Neuro Runner';
  Object.assign(h1.style, {
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: '34px',
    textAlign: 'center',
    margin: '8px 0'
  });

  // mission blurb (create or update)
  let blurb = document.getElementById('title-text');
  const text = "You are Case Rogue, famous hacker in 2084. Your job is to jack into cyberspace and clear the viruses out of the mainframe";
  if (!blurb) {
    blurb = document.createElement('div');
    blurb.id = 'title-text';
    overlay.insertBefore(blurb, overlay.querySelector('h1')?.nextSibling || null);
  }
  blurb.innerText = text;
  Object.assign(blurb.style, {
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: '16px',
    textAlign: 'center',
    maxWidth: '820px',
    padding: '8px 12px',
    lineHeight: '1.3',
    pointerEvents: 'none'
  });

  // replace any stray exact "fps" label inside overlay to avoid confusion
  overlay.querySelectorAll('*').forEach(el => {
    if (el.childElementCount === 0 && typeof el.innerText === 'string' && el.innerText.trim().toLowerCase() === 'fps') {
      el.innerText = 'Neuro Runner';
    }
  });
})();

// simple lighting for standard materials
const amb = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(amb);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(3, 6, 2);
scene.add(dir);

// ── Game loop ────────────────────────────────────────────────────────────────
let prev = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - prev) / 1000, 0.05);
  prev = now;
  // Only update movement when pointer is locked (paused in ESC menu otherwise)
  if (input.locked) {
    // ensure bubbles are processed first so grenades/bullets freeze immediately
    timeBubbles.update(dt, world.boxes);
    player.update(dt, input, world.boxes, null, timeBubbles);
  }

  const btActive = player.timeScale < 1;
  btOverlay.style.opacity = btActive ? '1' : '0';
  btHud.style.opacity     = btActive ? '1' : '0';
  btFill.style.width = (player.bulletTimeLeft / 6 * 100) + '%';

  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
