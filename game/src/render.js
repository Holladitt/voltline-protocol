// VOLTLINE PROTOCOL — render.js
// Yang terlihat: scene three.js dari state (read-only). Map low-poly malam
// biru + kuning volt + putih kaca, satu directional hangat + ambient dingin,
// fog tipis dari 60 m. Voxel bot berkepala besar, viewmodel per senjata,
// tracer/muzzle/smoke/ledakan dari pool tetap (<400 mesh, target 60 fps).
// Render TIDAK PERNAH menulis state gameplay.
import * as THREE from 'three';
import { CFG, SITE_NAMES } from './config.js';
import { BOXES, SITES, GLASS_ZONES } from './map.js';
import { curWeapon } from './state.js';

const V3 = THREE.Vector3;
let renderer, scene, camera;
let botMeshes = [], viewmodel = null, viewmodelParts = {};
let tracers = [], smokes = [], muzzle = null, explosion = null, bombMesh = null;
let siteLights = [], siteRings = [], mapGroup = null;
let tmpV = new V3(), tmpV2 = new V3();
let lastWeaponId = '', adsFov = 70;

const MAT = {};
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!MAT[k]) MAT[k] = new THREE.MeshLambertMaterial({ color, ...opts });
  return MAT[k];
}
function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = false; m.receiveShadow = false;
  return m;
}
function boardTexture(text, sub, color) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#0b1026'; c.fillRect(0, 0, 512, 128);
  c.strokeStyle = color; c.lineWidth = 6; c.strokeRect(4, 4, 504, 120);
  c.fillStyle = color; c.font = 'bold 56px sans-serif'; c.textAlign = 'center';
  c.fillText(text, 256, 62);
  c.fillStyle = '#F5F5F0'; c.font = '28px sans-serif';
  c.fillText(sub, 256, 104);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function softTexture() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

export function initRender(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1026);
  scene.fog = new THREE.Fog(0x0b1026, 55, 95);
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 220);
  camera.rotation.order = 'YXZ';
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Cahaya: satu directional hangat + ambient dingin.
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.1);
  sun.position.set(-30, 40, -20);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x4a5a8a, 0.9));
  const hemi = new THREE.HemisphereLight(0x2a3a6a, 0x0b1026, 0.5);
  scene.add(hemi);

  buildMap();
  buildViewmodel();
  buildPools();
  return { renderer, scene, camera };
}

function buildMap() {
  mapGroup = new THREE.Group();
  scene.add(mapGroup);
  // Lantai: beton biru malam + garis sirkuit kuning tipis.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(66, 46), mat(0x141c33));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 0);
  mapGroup.add(floor);
  // Garis sirkuit kuning di lantai (strip tipis emissive).
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffd21a });
  for (const [x, z, w, d] of [[0, 0, 60, 0.12], [0, -14, 44, 0.12], [0, 14, 44, 0.12], [-20, -7, 0.12, 14], [20, -7, 0.12, 14]]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), stripMat);
    s.rotation.x = -Math.PI / 2; s.position.set(x, 0.02, z);
    mapGroup.add(s);
  }
  // Zona lantai kaca: panel semi-transparan + kabel menyala di bawahnya.
  for (const g of GLASS_ZONES) {
    const w = g.x1 - g.x0, d = g.z1 - g.z0;
    const under = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x061020 }));
    under.rotation.x = -Math.PI / 2; under.position.set((g.x0 + g.x1) / 2, -0.4, (g.z0 + g.z1) / 2);
    mapGroup.add(under);
    for (let i = 0; i < 3; i++) {
      const cable = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 0.08), new THREE.MeshBasicMaterial({ color: 0xffd21a }));
      cable.rotation.x = -Math.PI / 2;
      cable.position.set((g.x0 + g.x1) / 2, -0.38, g.z0 + (i + 0.5) * d / 3);
      mapGroup.add(cable);
    }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshLambertMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.28 }));
    glass.rotation.x = -Math.PI / 2; glass.position.set((g.x0 + g.x1) / 2, 0.03, (g.z0 + g.z1) / 2);
    mapGroup.add(glass);
  }
  // Kotak map: dinding biru gelap, cover panel volt / kaca.
  for (const b of BOXES) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const isWall = b.h >= 3;
    const m = box(w, b.h, d, isWall ? mat(0x1d2745) : mat(0x2a3550));
    m.position.set((b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2);
    mapGroup.add(m);
    // Trim kuning volt di tepi atas cover.
    if (!isWall) {
      const trim = box(w + 0.04, 0.06, d + 0.04, new THREE.MeshBasicMaterial({ color: 0xffd21a }));
      trim.position.set(m.position.x, b.h + 0.03, m.position.z);
      mapGroup.add(trim);
    }
  }
  // Papan nama site 3D + ring plant + lampu site.
  SITES.forEach((st, i) => {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75),
      new THREE.MeshBasicMaterial({ map: boardTexture(i === 0 ? 'A · RELAY UTARA' : 'B · GARDU KACA', 'SITE ' + (i === 0 ? 'A' : 'B'), '#FFD21A') }));
    board.position.set(st.cx, 3.4, st.cz - 2.5);
    mapGroup.add(board);
    const ring = new THREE.Mesh(new THREE.RingGeometry(st.r - 0.15, st.r, 40),
      new THREE.MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(st.cx, 0.04, st.cz);
    mapGroup.add(ring); siteRings.push(ring);
    const light = new THREE.PointLight(0x3fa9f5, 12, 18);
    light.position.set(st.cx, 3, st.cz);
    scene.add(light); siteLights.push(light);
  });
  // Pilar relay tengah (menara kecil menyala).
  const tower = box(0.5, 6, 0.5, new THREE.MeshBasicMaterial({ color: 0xffd21a }));
  tower.position.set(0, 3, 0);
  mapGroup.add(tower);
}

// --- Voxel bot: kepala besar (target headshot), visor, garis punggung menyala ---
function buildBotMesh(team) {
  const g = new THREE.Group();
  const bodyC = team === 'you' ? 0x3fa9f5 : 0xff5a1a;
  const headC = team === 'you' ? 0xf5f5f0 : 0xff8a1e;
  const body = box(0.72, 0.85, 0.4, mat(bodyC)); body.position.y = 0.95; g.add(body);
  const head = box(0.44, 0.4, 0.44, mat(headC)); head.position.y = 1.58; g.add(head);
  const visor = box(0.36, 0.1, 0.05, mat(0x0b1026)); visor.position.set(0, 1.6, -0.22); g.add(visor);
  const line = box(0.06, 0.8, 0.05, new THREE.MeshBasicMaterial({ color: team === 'you' ? 0x9fd8ff : 0xffd21a }));
  line.position.set(0, 0.95, 0.23); g.add(line);
  const legL = box(0.2, 0.5, 0.24, mat(0x141c33)); legL.position.set(-0.18, 0.25, 0); g.add(legL);
  const legR = box(0.2, 0.5, 0.24, mat(0x141c33)); legR.position.set(0.18, 0.25, 0); g.add(legR);
  const gun = box(0.08, 0.12, 0.7, mat(0x222222)); gun.position.set(0.3, 1.15, -0.3); g.add(gun);
  g.userData = { legL, legR, head, body, headMat: head.material };
  scene.add(g);
  return g;
}

function buildViewmodel() {
  viewmodel = new THREE.Group();
  camera.add(viewmodel);
  scene.add(camera);
  // Bagian viewmodel dibuat ulang per senjata (siluet berbeda).
  viewmodelParts = {
    body: box(0.1, 0.14, 0.55, mat(0x2a2f3a)),
    barrel: box(0.05, 0.05, 0.4, mat(0x1a1a1a)),
    grip: box(0.09, 0.2, 0.1, mat(0x222222)),
    accent: box(0.11, 0.03, 0.3, new THREE.MeshBasicMaterial({ color: 0xffd21a })),
    scope: box(0.06, 0.08, 0.22, mat(0x111111)),
  };
  viewmodelParts.body.position.set(0.28, -0.26, -0.55);
  viewmodelParts.barrel.position.set(0.28, -0.24, -0.95);
  viewmodelParts.grip.position.set(0.28, -0.36, -0.4);
  viewmodelParts.accent.position.set(0.28, -0.19, -0.55);
  viewmodelParts.scope.position.set(0.28, -0.15, -0.6);
  for (const k in viewmodelParts) viewmodel.add(viewmodelParts[k]);
  // Muzzle flash: sprite kuning 1 frame.
  muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  muzzle.position.set(0.28, -0.24, -1.2);
  viewmodel.add(muzzle);
}

function buildPools() {
  // Tracer: 24 garis tipis (putih kawan, oranye musuh).
  for (let i = 0; i < 24; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, t: 0 });
  }
  // Smoke: 48 sprite lembut.
  const tex = softTexture();
  for (let i = 0; i < 48; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xcfd8e8, transparent: true, opacity: 0, depthWrite: false }));
    sp.scale.set(3, 3, 1);
    scene.add(sp);
    smokes.push({ sp, t: 0, life: 0, x: 0, y: 0, z: 0, seed: Math.random() * 10 });
  }
  // Ledakan: bola api + cahaya.
  explosion = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0 }));
  const elight = new THREE.PointLight(0xff8a1e, 0, 30);
  explosion.add(ball); explosion.add(elight);
  explosion.userData = { ball, elight, t: 0 };
  scene.add(explosion);
  // Bom: kotak kecil + lampu berkedip.
  bombMesh = new THREE.Group();
  const bb = box(0.3, 0.2, 0.22, mat(0x222222)); bombMesh.add(bb);
  const bl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  bl.position.y = 0.15; bombMesh.add(bl);
  bombMesh.userData = { bl };
  bombMesh.visible = false;
  scene.add(bombMesh);
}

// --- Per frame ---
export function render(s, dt, time) {
  const p = s.player;
  // Kamera: menu = orbit lambat; spectate = ikuti bot; main = FPS.
  if (s.phase === 'menu') {
    const a = time * 0.08;
    camera.position.set(Math.sin(a) * 26, 12, Math.cos(a) * 18);
    camera.lookAt(0, 1, -6);
  } else if (!p.alive && p.spectate >= 0 && s.bots[p.spectate]) {
    const b = s.bots[p.spectate];
    camera.position.set(b.x, b.y + 1.6, b.z);
    camera.rotation.set(b.pitch || 0, b.yaw, 0);
  } else {
    const shake = p.shake * 0.12;
    camera.position.set(
      p.x + (Math.random() - 0.5) * shake,
      p.y + (p.crouch ? CFG.PLAYER.eyeCrouch : CFG.PLAYER.eye) + (Math.random() - 0.5) * shake,
      p.z + (Math.random() - 0.5) * shake);
    camera.rotation.set(p.pitch, p.yaw, 0);
  }
  // FOV: ADS sniper 4x / DMR 2x.
  const w = curWeapon(s);
  let targetFov = 70;
  if (p.ads && w) {
    const sc = CFG.WEAPONS[w.id].scope;
    targetFov = sc === 4 ? 22 : sc === 2 ? 38 : 62;
  }
  if (Math.abs(camera.fov - targetFov) > 0.5) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }
  // Lampu site: kuning volt saat plant, biru saat normal.
  const lit = s.mapLit;
  siteLights.forEach((l, i) => {
    l.color.setHex(lit ? 0xffd21a : 0x3fa9f5);
    l.intensity = lit ? 20 : 12;
  });
  siteRings.forEach((r, i) => {
    r.material.color.setHex(s.bomb.state === 'planted' && s.bomb.site === i ? 0xff3b30 : 0xff8a1e);
    r.material.opacity = 0.6 + 0.3 * Math.sin(time * 3);
  });

  // Bot: posisi, rotasi, animasi kaki, jongkok, mati = terbaring.
  for (let i = 0; i < s.bots.length; i++) {
    const b = s.bots[i];
    if (!botMeshes[i]) botMeshes[i] = buildBotMesh(b.team);
    const g = botMeshes[i];
    g.visible = b.alive || s.phase === 'menu';
    if (!b.alive) {
      g.rotation.z = Math.PI / 2; g.position.set(b.x, b.y + 0.25, b.z);
      continue;
    }
    g.rotation.z = 0;
    g.position.set(b.x, b.y, b.z);
    g.rotation.y = b.yaw + Math.PI;
    const u = g.userData;
    const swing = b.moving ? Math.sin(time * 9 + i) * 0.45 : 0;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.body.scale.y = b.crouch ? 0.75 : 1;
    u.head.position.y = b.crouch ? 1.25 : 1.58;
    // Flash musuh: kepala putih berkedip saat ter-flash, kembali normal sesudahnya.
    u.head.material = b.flashT > 0 ? mat(0xffffff) : u.headMat;
  }

  // Viewmodel: siluet per senjata + recoil + reload dip.
  updateViewmodel(s, dt, time);
  // Bom di dunia.
  if (s.bomb.state === 'planted') {
    bombMesh.visible = true;
    bombMesh.position.set(s.bomb.x, 0.15, s.bomb.z);
    bombMesh.userData.bl.material.color.setHex(Math.sin(time * 10) > 0 ? 0xff3b30 : 0x330000);
  } else bombMesh.visible = false;

  // Tracer & smoke & ledakan menua.
  for (const t of tracers) {
    if (t.t > 0) { t.t -= dt; t.line.material.opacity = Math.max(0, t.t / 0.12); }
    else t.line.material.opacity = 0;
  }
  updateSmokes(s, dt);
  const ex = explosion.userData;
  if (ex.t > 0) {
    ex.t -= dt;
    const k = 1 - ex.t / 1.2;
    ex.ball.scale.setScalar(1 + k * 7);
    ex.ball.material.opacity = Math.max(0, 0.9 - k);
    ex.elight.intensity = Math.max(0, 60 * (1 - k));
  } else { ex.ball.material.opacity = 0; ex.elight.intensity = 0; }

  renderer.render(scene, camera);
}

function updateViewmodel(s, dt, time) {
  if (!viewmodel) return;
  const w = curWeapon(s);
  const id = w ? w.id : 'percik';
  if (id !== lastWeaponId) {
    lastWeaponId = id;
    // Siluet berbeda per senjata: panjang laras & ukuran body.
    const L = { percik: 0.25, petir9: 0.55, jarum: 0.7, sengat9: 0.4, busur: 0.85, senja12: 0.5 }[id] || 0.5;
    const Wd = { percik: 0.07, petir9: 0.1, jarum: 0.09, sengat9: 0.12, busur: 0.08, senja12: 0.14 }[id] || 0.1;
    viewmodelParts.barrel.scale.z = L / 0.4;
    viewmodelParts.body.scale.x = Wd / 0.1;
    viewmodelParts.scope.visible = id === 'busur' || id === 'jarum';
    viewmodelParts.accent.visible = id !== 'percik';
  }
  const p = s.player;
  // Recoil kick + reload dip + bob jalan.
  const kick = w ? (w.spreadBloom || 0) * 0.06 : 0;
  const reloading = w && w.reloading > 0;
  const bob = p.moveMag > 0.5 ? Math.sin(time * 9) * 0.012 : 0;
  viewmodel.position.y = (reloading ? -0.22 : 0) + bob;
  viewmodel.position.z = kick + (reloading ? 0.1 : 0);
  viewmodel.rotation.x = kick * 1.5 + (reloading ? 0.5 : 0);
  // ADS: viewmodel ke tengah.
  const adsK = p.ads ? 1 : 0;
  viewmodelParts.body.position.x += ((p.ads ? 0 : 0.28) - viewmodelParts.body.position.x) * Math.min(1, dt * 12);
  viewmodelParts.barrel.position.x = viewmodelParts.body.position.x;
  viewmodelParts.grip.position.x = viewmodelParts.body.position.x;
  viewmodelParts.accent.position.x = viewmodelParts.body.position.x;
  viewmodelParts.scope.position.x = viewmodelParts.body.position.x;
  // Muzzle flash memudar.
  if (muzzle) muzzle.material.opacity = Math.max(0, muzzle.material.opacity - dt * 12);
}

function updateSmokes(s, dt) {
  let si = 0;
  for (const sm of s.smokes) {
    for (let k = 0; k < 6 && si < smokes.length; k++, si++) {
      const sp = smokes[si];
      const a = (k / 6) * Math.PI * 2 + sm.t;
      sp.sp.scale.setScalar(2 + sm.t * 0.4);
      sp.sp.position.set(sm.x + Math.cos(a) * 1.6, 0.6 + Math.sin(sm.t * 0.7 + k) * 0.5, sm.z + Math.sin(a) * 1.6);
      sp.sp.material.opacity = Math.min(0.75, sm.t * 2) * (1 - sm.t / sm.dur);
    }
  }
  for (; si < smokes.length; si++) smokes[si].sp.material.opacity = 0;
}

// Konsumsi event visual dari state.events.
export function consumeRenderEvent(s, ev) {
  switch (ev.type) {
    case 'tracer': {
      const t = tracers.find((x) => x.t <= 0) || tracers[0];
      const pos = t.line.geometry.attributes.position.array;
      pos[0] = ev.x0; pos[1] = ev.y0; pos[2] = ev.z0;
      pos[3] = ev.x1; pos[4] = ev.y1; pos[5] = ev.z1;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.color.setHex(ev.foe ? 0xff8a1e : 0xfff6c9);
      t.line.material.opacity = 0.9;
      t.t = 0.12;
      break;
    }
    case 'shot': if (muzzle && ev.own) muzzle.material.opacity = 1; break;
    case 'planted': {
      explosion.position.set(ev.x || s.bomb.x, 0.5, ev.z || s.bomb.z);
      break;
    }
    case 'bombExplode': {
      const ex = explosion.userData;
      explosion.position.set(s.bomb.x, 0.8, s.bomb.z);
      ex.t = 1.2;
      s.player.shake = 1;
      break;
    }
  }
}
