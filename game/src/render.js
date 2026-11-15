// VOLTLINE PROTOCOL — render.js
import * as THREE from 'three';
import { CFG, SITE_NAMES } from './config.js';
import { BOXES, SITES, GLASS_ZONES, PROPS } from './map.js';
import { curWeapon } from './state.js';

const V3 = THREE.Vector3;
let renderer, scene, camera;
let botMeshes = [], viewmodel = null, viewmodelParts = {};
let tracers = [], smokes = [], muzzle = null, explosion = null, bombMesh = null;
let siteLights = [], siteRings = [], mapGroup = null;
let tmpV = new V3(), tmpV2 = new V3();

export function adsTargetFov(w) {
  if (!w) return 75;
  const sc = CFG.WEAPONS[w.id].scope;
  return sc === 4 ? 25 : sc === 2 ? 38 : 55;
}
export function adsSensScale(fov) { return fov / 75; }

let lastWeaponId = '';

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
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#0b1026'; c.fillRect(0, 0, 1024, 256);
  c.strokeStyle = color; c.lineWidth = 10; c.strokeRect(8, 8, 1008, 240);
  c.fillStyle = color; c.font = 'bold 64px sans-serif'; c.textAlign = 'center';
  c.fillText(text, 512, 118);
  c.fillStyle = '#F5F5F0'; c.font = '40px sans-serif';
  c.fillText(sub, 512, 198);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const STENCIL_TEX = {};
function stencilTexture(code) {
  if (STENCIL_TEX[code]) return STENCIL_TEX[code];
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 80;
  const c = cv.getContext('2d');
  c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 7; c.strokeStyle = '#0b1026';
  c.strokeText(code, 128, 42);
  c.fillStyle = '#FFD21A';
  c.fillText(code, 128, 42);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  STENCIL_TEX[code] = t;
  return t;
}

function skyTexture() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#2f6fc4');
  g.addColorStop(0.45, '#7db8e8');
  g.addColorStop(0.68, '#cfe4f2');
  g.addColorStop(0.8, '#ffd27a');
  g.addColorStop(1, '#e8c890');
  c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
  const sg = c.createRadialGradient(720, 300, 8, 720, 300, 130);
  sg.addColorStop(0, 'rgba(255,250,220,1)');
  sg.addColorStop(0.25, 'rgba(255,225,140,0.85)');
  sg.addColorStop(1, 'rgba(255,210,120,0)');
  c.fillStyle = sg; c.fillRect(0, 0, 1024, 512);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function surfaceTexture(base, seam, speck, step) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = base; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = seam; c.lineWidth = 3;
  for (let p = 0; p <= 256; p += step) {
    c.beginPath(); c.moveTo(p, 0); c.lineTo(p, 256); c.stroke();
    c.beginPath(); c.moveTo(0, p); c.lineTo(256, p); c.stroke();
  }
  c.fillStyle = speck;
  for (let i = 0; i < 260; i++) c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const bump = new THREE.CanvasTexture(cv);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

const PBR = {};
function pbrMat(kind) {
  if (PBR[kind]) return PBR[kind];
  let t, m;
  if (kind === 'floor') {
    t = surfaceTexture('#6b5636', '#4a3a22', 'rgba(0,0,0,0.18)', 64);
    t.map.repeat.set(8, 6); t.bump.repeat.set(8, 6);
    m = new THREE.MeshStandardMaterial({
      map: t.map, bumpMap: t.bump, bumpScale: 0.6,
      roughness: 0.9, metalness: 0.05,
    });
  } else if (kind === 'wall') {
    t = surfaceTexture('#5f6b62', '#454a42', 'rgba(255,255,255,0.05)', 85);
    t.map.repeat.set(3, 2); t.bump.repeat.set(3, 2);
    m = new THREE.MeshStandardMaterial({
      map: t.map, bumpMap: t.bump, bumpScale: 0.5,
      roughness: 0.85, metalness: 0.05,
    });
  } else { // cover: plat logam sirkuit
    t = surfaceTexture('#55648a', '#2c3854', 'rgba(255,210,26,0.10)', 128);
    t.map.repeat.set(2, 2); t.bump.repeat.set(2, 2);
    m = new THREE.MeshStandardMaterial({
      map: t.map, bumpMap: t.bump, bumpScale: 0.4,
      roughness: 0.5, metalness: 0.35,
    });
  }
  PBR[kind] = m;
  return m;
}

const RUST = ['#8a4a32', '#4a6a8a', '#a8854a', '#5a3a2a'].map((c) => {
  const t = surfaceTexture(c, '#2c2018', 'rgba(0,0,0,0.25)', 32);
  t.map.repeat.set(2, 2); t.bump.repeat.set(2, 2);
  return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 0.4, roughness: 0.6, metalness: 0.3 });
});

export function initRender(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc4e8);
  scene.fog = new THREE.Fog(0xcfdde8, 55, 95);
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 220);
  camera.rotation.order = 'YXZ';
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(190, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffe9b0, 2.6);
  sun.position.set(-30, 40, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.camera.left = -36; sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd4e8, 1.2));
  const hemi = new THREE.HemisphereLight(0x9cc4e8, 0x8a7a5a, 0.9);
  scene.add(hemi);

  buildMap();
  buildViewmodel();
  buildPools();
  return { renderer, scene, camera };
}

function buildMap() {
  mapGroup = new THREE.Group();
  scene.add(mapGroup);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(66, 46), pbrMat('floor'));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 0);
  floor.receiveShadow = true;
  mapGroup.add(floor);
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffd21a });
  for (const [x, z, w, d] of [[0, 0, 60, 0.12], [0, -14, 44, 0.12], [0, 14, 44, 0.12], [-20, -7, 0.12, 14], [20, -7, 0.12, 14]]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), stripMat);
    s.rotation.x = -Math.PI / 2; s.position.set(x, 0.02, z);
    mapGroup.add(s);
  }
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
  for (let bi = 0; bi < BOXES.length; bi++) {
    const b = BOXES[bi];
    if (b.prop) continue;
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const isWall = b.h >= 3;
    const m = box(w, b.h, d, isWall ? pbrMat('wall') : RUST[bi % 4]);
    m.position.set((b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2);
    m.castShadow = true; m.receiveShadow = true;
    mapGroup.add(m);
    if (!isWall) {
      const trim = box(w + 0.04, 0.06, d + 0.04, new THREE.MeshBasicMaterial({ color: 0xffd21a }));
      trim.position.set(m.position.x, b.h + 0.03, m.position.z);
      mapGroup.add(trim);
    }
  }
  drawProps();
  buildStreet();
  const trackMat = new THREE.MeshBasicMaterial({ color: 0x2a2018, transparent: true, opacity: 0.45 });
  for (const [x, z, w, r] of [[-10, 0, 14, 0], [10, 0, 14, 0], [0, 14, 12, 1.57], [-20, -7, 10, 0.5], [20, 7, 10, -0.5], [0, -14, 12, 1.57]]) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.55), trackMat);
    t.rotation.x = -Math.PI / 2; t.rotation.z = r; t.position.set(x, 0.015, z);
    mapGroup.add(t);
  }
  SITES.forEach((st, i) => {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5),
      new THREE.MeshBasicMaterial({ map: boardTexture(i === 0 ? 'SITE A // NORTH RELAY' : 'SITE B // GLASS SUBSTATION', '· PLANT ZONE ·', '#FFD21A'), side: THREE.DoubleSide }));
    board.position.set(st.cx, 3.0, st.cz - 2.5);
    mapGroup.add(board);
    const ring = new THREE.Mesh(new THREE.RingGeometry(st.r - 0.15, st.r, 40),
      new THREE.MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(st.cx, 0.04, st.cz);
    mapGroup.add(ring); siteRings.push(ring);
    const light = new THREE.PointLight(0x3fa9f5, 12, 18);
    light.position.set(st.cx, 3, st.cz);
    scene.add(light); siteLights.push(light);
  });
  const STENCILS = [[15, 'IC-04', 'S'], [16, 'SEC-9', 'E'], [17, 'VOLT-7', 'W'], [20, 'RLY-2', 'S'], [22, 'KBL-11', 'S'], [24, 'GRD-5', 'N']];
  for (const [bi, code, face] of STENCILS) {
    const b = BOXES[bi];
    if (!b) continue;
    const st = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.45),
      new THREE.MeshBasicMaterial({ map: stencilTexture(code), transparent: true }));
    const y = Math.min(1.4, b.h * 0.55);
    if (face === 'S') { st.rotation.y = 0; st.position.set((b.x0 + b.x1) / 2, y, b.z1 + 0.02); }
    else if (face === 'N') { st.rotation.y = Math.PI; st.position.set((b.x0 + b.x1) / 2, y, b.z0 - 0.02); }
    else if (face === 'E') { st.rotation.y = Math.PI / 2; st.position.set(b.x1 + 0.02, y, (b.z0 + b.z1) / 2); }
    else { st.rotation.y = -Math.PI / 2; st.position.set(b.x0 - 0.02, y, (b.z0 + b.z1) / 2); }
    mapGroup.add(st);
  }
  const tower = box(0.5, 6, 0.5, new THREE.MeshBasicMaterial({ color: 0xffd21a }));
  tower.position.set(0, 3, 0);
  mapGroup.add(tower);
  const gantryMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.4, metalness: 0.6 });
  for (const gz of [-7, 7]) {
    const beam = box(64, 0.4, 0.6, gantryMat);
    beam.position.set(0, 5.5, gz);
    mapGroup.add(beam);
  }
}

function drawProps() {
  const tireG = new THREE.CylinderGeometry(0.55, 0.55, 0.28, 10);
  const drumG = new THREE.CylinderGeometry(0.35, 0.35, 1, 10);
  const wheelG = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 10);
  const tireM = mat(0x1a1a1a), woodM = mat(0x8a6a3a);
  const rustM = [mat(0x8a4a32), mat(0x4a6a8a)];
  let pi = 0;
  const WH = [[-1.1, -0.8], [1.1, -0.8], [-1.1, 0.8], [1.1, 0.8]];
  for (const k in PROPS) for (const [x, z] of PROPS[k]) {
    pi++;
    if (k === 'T') {
      for (let i = 0; i < 3; i++) {
        const t = new THREE.Mesh(tireG, tireM);
        t.position.set(x, 0.14 + i * 0.28, z); mapGroup.add(t);
      }
    } else if (k === 'D') {
      const d = new THREE.Mesh(drumG, rustM[pi % 2]);
      d.position.set(x, 0.5, z); mapGroup.add(d);
    } else if (k === 'S') {
      const a = box(1.6, 0.5, 1.2, rustM[pi % 2]);
      a.position.set(x, 0.25, z); a.rotation.y = pi; mapGroup.add(a);
      const b2 = box(1, 0.5, 0.8, rustM[(pi + 1) % 2]);
      b2.position.set(x + 0.2, 0.7, z - 0.1); b2.rotation.y = pi * 0.7; mapGroup.add(b2);
    } else if (k === 'P') {
      const p = box(1.4, 0.12, 1.4, woodM);
      p.position.set(x, 0.06, z); mapGroup.add(p);
      const s = box(1.4, 0.1, 0.25, woodM);
      s.position.set(x, 0.18, z - 0.45); mapGroup.add(s);
    } else if (k === 'W') {
      const w = box(3.2, 0.6, 1.6, rustM[pi % 2]);
      w.position.set(x, 0.45, z); mapGroup.add(w);
      const cab = box(1.5, 0.5, 1.4, mat(0x2a2a2a));
      cab.position.set(x - 0.2, 1, z); mapGroup.add(cab);
      for (const [wx, wz] of WH) {
        const wh = new THREE.Mesh(wheelG, tireM);
        wh.rotation.x = Math.PI / 2; wh.position.set(x + wx, 0.32, z + wz); mapGroup.add(wh);
      }
    } else if (k === 'B') {
      const b = box(3, 0.7, 0.5, mat(0x6a6a6a));
      b.position.set(x, 0.35, z); mapGroup.add(b);
      const s = box(3.04, 0.18, 0.54, new THREE.MeshBasicMaterial({ color: 0xffd21a }));
      s.position.set(x, 0.55, z); mapGroup.add(s);
    } else { // carrier: armored security vehicle
      const hull = box(3.4, 1, 1.8, mat(0x3a4a3a));
      hull.position.set(x, 0.7, z); mapGroup.add(hull);
      const cab = box(1.6, 0.7, 1.6, mat(0x2a3a2a));
      cab.position.set(x - 0.6, 1.55, z); mapGroup.add(cab);
      for (const [wx, wz] of WH) {
        const wh = new THREE.Mesh(wheelG, tireM);
        wh.rotation.x = Math.PI / 2; wh.position.set(x + wx * 1.1, 0.32, z + wz * 1.15); mapGroup.add(wh);
      }
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4),
        new THREE.MeshBasicMaterial({ map: stencilTexture('APC-1'), transparent: true }));
      bd.position.set(x, 0.8, z + 0.92); mapGroup.add(bd);
    }
  }
}

const FAC = [[-32, -24.5, 7, 9], [-24, -24.5, 6, 11], [-16, -24.5, 8, 8], [-8, -24.5, 6, 10], [0, -24.5, 7, 9], [8, -24.5, 6, 11], [16, -24.5, 8, 8], [24, -24.5, 6, 10], [32, -24.5, 7, 9], [-36, 24.5, 7, 10], [-24, 24.5, 6, 9], [-12, 24.5, 8, 11], [0, 24.5, 6, 8], [12, 24.5, 7, 10], [24, 24.5, 6, 9], [36, 24.5, 7, 11]];
function buildStreet() {
  const PLASTER = [0x8a7a5a, 0x6a7a8a, 0x7a5a4a];
  const SIGNS = ['SALVAGE CO', 'SCRAP YARD', 'JUNK 24H'];
  for (let i = 0; i < FAC.length; i++) {
    const [x, z, w, h] = FAC[i];
    const f = box(w, h, 1.2, mat(PLASTER[i % 3]));
    f.position.set(x, h / 2, z); mapGroup.add(f);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, h * 0.35),
      new THREE.MeshBasicMaterial({ color: 0x8fb8d8 }));
    win.position.set(x, h * 0.55, z + (z < 0 ? 0.65 : -0.65));
    if (z > 0) win.rotation.y = Math.PI;
    mapGroup.add(win);
    if (i % 3 === 0) {
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(4, 1),
        new THREE.MeshBasicMaterial({ map: boardTexture(SIGNS[(i / 3 | 0) % 3], '· EST. 2088 ·', '#FFD21A'), side: THREE.DoubleSide }));
      sg.position.set(x, h + 0.8, z); mapGroup.add(sg);
    }
  }
  for (const [x, z] of [[-15, -28], [12, -28]]) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 10, 10), mat(0x7a8a9a));
    silo.position.set(x, 5, z); mapGroup.add(silo);
  }
}

function buildBotMesh(team) {
  const g = new THREE.Group();
  const bodyC = team === 'you' ? 0x2b8fd9 : 0xff5a1a;
  const headC = team === 'you' ? 0xf5f5f0 : 0xff8a1e;
  const foe = team === 'foe';
  const body = box(0.72, 0.85, 0.4, mat(bodyC, foe ? { emissive: 0xcc3300, emissiveIntensity: 0.55 } : {})); body.position.y = 0.95; g.add(body);
  const head = box(0.44, 0.4, 0.44, mat(headC, foe ? { emissive: 0xcc6600, emissiveIntensity: 0.4 } : {})); head.position.y = 1.58; g.add(head);
  const visor = box(0.36, 0.1, 0.05, new THREE.MeshBasicMaterial({ color: team === 'you' ? 0x7fd4ff : 0xffb020 })); visor.position.set(0, 1.6, -0.22); g.add(visor);
  const line = box(0.06, 0.8, 0.05, new THREE.MeshBasicMaterial({ color: team === 'you' ? 0x9fd8ff : 0xffd21a }));
  line.position.set(0, 0.95, 0.23); g.add(line);
  const legL = box(0.2, 0.5, 0.24, mat(0x141c33)); legL.position.set(-0.18, 0.25, 0); g.add(legL);
  const legR = box(0.2, 0.5, 0.24, mat(0x141c33)); legR.position.set(0.18, 0.25, 0); g.add(legR);
  const armR = box(0.13, 0.5, 0.13, mat(bodyC)); armR.position.set(0.3, 1.15, -0.15); armR.rotation.x = -0.9; g.add(armR);
  const armL = box(0.13, 0.5, 0.13, mat(bodyC)); armL.position.set(-0.28, 1.15, -0.15); armL.rotation.x = -0.9; g.add(armL);
  const gun = new THREE.Group();
  const gb = box(0.09, 0.13, 0.5, mat(0x222222)); gun.add(gb);
  const bar = box(0.05, 0.05, 0.45, mat(0x111111)); bar.position.set(0, 0.02, -0.42); gun.add(bar);
  const mg = box(0.07, 0.18, 0.1, mat(0x1a1a1a)); mg.position.set(0, -0.14, 0.05); gun.add(mg);
  const stk = box(0.08, 0.1, 0.22, mat(0x2a2a2a)); stk.position.set(0, 0, 0.32); gun.add(stk);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ map: starburstTexture(), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  fl.position.set(0, 0.02, -0.7); gun.add(fl);
  const hR = box(0.09, 0.09, 0.13, mat(0x1f2a3a)); hR.position.set(0, -0.12, 0.08); gun.add(hR);
  const hL = box(0.09, 0.09, 0.12, mat(0x1f2a3a)); hL.position.set(0, -0.1, -0.3); gun.add(hL);
  gun.position.set(0.3, 1.15, -0.3); g.add(gun);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); // bots cast shadows
  g.userData = { legL, legR, armL, armR, head, body, headMat: head.material, bodyMat: body.material, gun, flash: fl, kick: 0 };
  scene.add(g);
  return g;
}

function buildViewmodel() {
  viewmodel = new THREE.Group();
  camera.add(viewmodel);
  scene.add(camera);
  viewmodelParts = {
    body: box(0.1, 0.14, 0.55, mat(0x2a2f3a)),
    barrel: box(0.05, 0.05, 0.4, mat(0x1a1a1a)),
    grip: box(0.09, 0.2, 0.1, mat(0x222222)),
    accent: box(0.11, 0.03, 0.3, new THREE.MeshBasicMaterial({ color: 0xffd21a })),
    scope: box(0.06, 0.08, 0.22, mat(0x111111)),
    lens: new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05),
      new THREE.MeshLambertMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.25 })),
    reticle: box(0.014, 0.014, 0.004, new THREE.MeshBasicMaterial({ color: 0xffd21a })),
    stripe: box(0.115, 0.02, 0.3, new THREE.MeshBasicMaterial({ color: 0xffd21a })),
    blade: box(0.02, 0.3, 0.07, mat(0xcfd8e8)),
    handR: box(0.09, 0.09, 0.13, mat(0x1f2a3a)),
    knuckR: box(0.095, 0.02, 0.06, mat(0x0a0a0a)),
    foreR: box(0.09, 0.09, 0.34, mat(0x2e6db4)),
    handL: box(0.09, 0.09, 0.12, mat(0x1f2a3a)),
    knuckL: box(0.095, 0.02, 0.06, mat(0x0a0a0a)),
    foreL: box(0.09, 0.09, 0.32, mat(0x2e6db4)),
  };
  viewmodelParts.body.position.set(0.28, -0.26, -0.55);
  viewmodelParts.barrel.position.set(0.28, -0.24, -0.95);
  viewmodelParts.grip.position.set(0.28, -0.36, -0.4);
  viewmodelParts.accent.position.set(0.28, -0.19, -0.55);
  viewmodelParts.scope.position.set(0.28, -0.15, -0.6);
  viewmodelParts.lens.position.set(0.28, -0.15, -0.712);
  viewmodelParts.reticle.position.set(0.28, -0.15, -0.718);
  viewmodelParts.stripe.position.set(0.28, -0.2, -0.55);
  viewmodelParts.blade.position.set(0.28, -0.3, -0.7);
  viewmodelParts.blade.rotation.x = 0.3;
  viewmodelParts.blade.visible = false;
  viewmodelParts.handR.position.set(0.28, -0.37, -0.4);
  viewmodelParts.knuckR.position.set(0.28, -0.32, -0.4);
  viewmodelParts.foreR.position.set(0.3, -0.47, -0.18);
  viewmodelParts.foreR.rotation.x = 0.45;
  viewmodelParts.handL.position.set(0.28, -0.33, -0.72);
  viewmodelParts.knuckL.position.set(0.28, -0.28, -0.72);
  viewmodelParts.foreL.position.set(0.22, -0.44, -0.55);
  viewmodelParts.foreL.rotation.x = 0.4;
  for (const k in viewmodelParts) viewmodel.add(viewmodelParts[k]);
  muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45),
    new THREE.MeshBasicMaterial({ map: starburstTexture(), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  muzzle.position.set(0.28, -0.24, -1.2);
  viewmodel.add(muzzle);
}

function starburstTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 2, 64, 64, 60);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.3, 'rgba(255,220,120,0.9)');
  g.addColorStop(1, 'rgba(255,180,60,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  c.fillStyle = 'rgba(255,240,200,0.95)';
  for (let i = 0; i < 4; i++) {
    c.save(); c.translate(64, 64); c.rotate((i * Math.PI) / 4);
    c.beginPath(); c.moveTo(-3, 0); c.lineTo(3, 0); c.lineTo(0, -62); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-3, 0); c.lineTo(3, 0); c.lineTo(0, 62); c.closePath(); c.fill();
    c.restore();
  }
  return new THREE.CanvasTexture(cv);
}

const STRIPE_C = {
  percik: 0x9aa0aa, petir9: 0xffd21a, jarum: 0x3fa9f5,
  sengat9: 0xff8a1e, busur: 0xff3b30, senja12: 0x7be495,
};

function buildPools() {
  for (let i = 0; i < 24; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, t: 0 });
  }
  const sg = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 48; i++) {
    const sp = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xcfd8e8, transparent: true, opacity: 0, depthWrite: false }));
    sp.scale.set(3, 3, 3);
    scene.add(sp);
    smokes.push({ sp, t: 0, life: 0, x: 0, y: 0, z: 0, seed: Math.random() * 10 });
  }
  explosion = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0 }));
  const elight = new THREE.PointLight(0xff8a1e, 0, 30);
  explosion.add(ball); explosion.add(elight);
  explosion.userData = { ball, elight, t: 0 };
  scene.add(explosion);
  bombMesh = new THREE.Group();
  const bb = box(0.3, 0.2, 0.22, mat(0x222222)); bombMesh.add(bb);
  const bl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  bl.position.y = 0.15; bombMesh.add(bl);
  bombMesh.userData = { bl };
  bombMesh.visible = false;
  scene.add(bombMesh);
}

export function render(s, dt, time) {
  const p = s.player;
  if (s.phase === 'menu') {
    const b = s.bots[s._pilotId];
    if (b && b.alive) {
      camera.position.set(b.x, b.y + 1.6, b.z);
      camera.rotation.set(b.pitch || 0, b.yaw, 0);
    } else {
      let cx = 0, cz = 0, n = 0;
      for (const o of s.bots) if (o.alive) { cx += o.x; cz += o.z; n++; }
      if (n > 0) { cx /= n; cz /= n; }
      const a = time * 0.12;
      camera.position.set(cx + Math.sin(a) * 9, 3.4, cz + Math.cos(a) * 9);
      camera.lookAt(cx, 1.2, cz);
    }
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
  const w = curWeapon(s);
  const targetFov = adsTargetFov(p.ads ? w : null);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }
  const lit = s.mapLit;
  siteLights.forEach((l, i) => {
    l.color.setHex(lit ? 0xffd21a : 0x3fa9f5);
    l.intensity = lit ? 20 : 12;
  });
  siteRings.forEach((r, i) => {
    r.material.color.setHex(s.bomb.state === 'planted' && s.bomb.site === i ? 0xff3b30 : 0xff8a1e);
    r.material.opacity = 0.6 + 0.3 * Math.sin(time * 3);
  });

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
    u.armL.rotation.x = -0.9 + swing * 0.5;
    u.armR.rotation.x = -0.9 - swing * 0.5;
    u.body.scale.y = b.crouch ? 0.75 : 1;
    u.head.position.y = b.crouch ? 1.25 : 1.58;
    u.head.material = (b.flashT > 0 || b.hitFlashT > 0) ? mat(0xffffff) : u.headMat;
    u.body.material = b.hitFlashT > 0 ? mat(0xffffff) : u.bodyMat;
    u.kick = Math.max(0, (u.kick || 0) - dt);
    u.gun.position.z = -0.3 + u.kick * 0.6;
    if (u.flash) u.flash.material.opacity = Math.max(0, u.flash.material.opacity - dt * 10);
  }

  updateViewmodel(s, dt, time);
  if (s.bomb.state === 'planted') {
    bombMesh.visible = true;
    bombMesh.position.set(s.bomb.x, 0.15, s.bomb.z);
    bombMesh.userData.bl.material.color.setHex(Math.sin(time * 10) > 0 ? 0xff3b30 : 0x330000);
  } else bombMesh.visible = false;

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
  const pilot = s.phase === 'menu' ? s.bots[s._pilotId] : null;
  const w = pilot && pilot.alive ? pilot.weapon : curWeapon(s);
  const melee = s.player.slot === 'melee';
  const id = melee ? 'knife' : (w ? w.id : 'percik');
  if (id !== lastWeaponId) {
    lastWeaponId = id;
    const isMelee = id === 'knife';
    viewmodelParts.body.visible = !isMelee;
    viewmodelParts.barrel.visible = !isMelee;
    viewmodelParts.grip.visible = !isMelee;
    viewmodelParts.accent.visible = !isMelee && id !== 'percik';
    viewmodelParts.scope.visible = !isMelee && (id === 'busur' || id === 'jarum');
    viewmodelParts.lens.visible = viewmodelParts.scope.visible;
    viewmodelParts.reticle.visible = viewmodelParts.scope.visible;
    viewmodelParts.stripe.visible = !isMelee;
    viewmodelParts.blade.visible = isMelee;
    viewmodelParts.handL.visible = !isMelee;
    viewmodelParts.knuckL.visible = !isMelee;
    viewmodelParts.foreL.visible = !isMelee;
    viewmodelParts.handR.position.z = isMelee ? -0.62 : -0.4;
    viewmodelParts.knuckR.position.z = isMelee ? -0.62 : -0.4;
    viewmodelParts.foreR.position.z = isMelee ? -0.42 : -0.18;
    if (!isMelee) {
      const L = { percik: 0.25, petir9: 0.55, jarum: 0.7, sengat9: 0.4, busur: 0.85, senja12: 0.5 }[id] || 0.5;
      const Wd = { percik: 0.07, petir9: 0.1, jarum: 0.09, sengat9: 0.12, busur: 0.08, senja12: 0.14 }[id] || 0.1;
      viewmodelParts.barrel.scale.z = L / 0.4;
      viewmodelParts.body.scale.x = Wd / 0.1;
      viewmodelParts.stripe.material.color.setHex(STRIPE_C[id] || 0xffd21a);
    }
  }
  const p = s.player;
  viewmodel.visible = (s.phase !== 'menu' || (pilot && pilot.alive)) && !(p.ads && w && CFG.WEAPONS[w.id].scope === 4);
  const kick = w ? (w.spreadBloom || 0) * 0.06 : 0;
  const reloading = w && w.reloading > 0;
  const bob = p.moveMag > 0.5 ? Math.sin(time * 9) * 0.012 : 0;
  viewmodel.position.y = (reloading ? -0.22 : 0) + bob;
  viewmodel.position.z = kick + (reloading ? 0.1 : 0);
  viewmodel.rotation.x = kick * 1.5 + (reloading ? 0.5 : 0);
  if (melee) {
    const k = Math.max(0, 0.3 - (s.time - (p.meleeLast || -9))) / 0.3;
    viewmodel.rotation.z = -k * 0.9;
    viewmodel.rotation.x = -k * 0.4;
  } else viewmodel.rotation.z = 0;
  const adsK = p.ads ? 1 : 0;
  viewmodelParts.body.position.x += ((p.ads ? 0 : 0.28) - viewmodelParts.body.position.x) * Math.min(1, dt * 12);
  viewmodelParts.barrel.position.x = viewmodelParts.body.position.x;
  viewmodelParts.grip.position.x = viewmodelParts.body.position.x;
  viewmodelParts.accent.position.x = viewmodelParts.body.position.x;
  viewmodelParts.scope.position.x = viewmodelParts.body.position.x;
  viewmodelParts.lens.position.x = viewmodelParts.body.position.x;
  viewmodelParts.reticle.position.x = viewmodelParts.body.position.x;
  viewmodelParts.stripe.position.x = viewmodelParts.body.position.x;
  viewmodelParts.blade.position.x = viewmodelParts.body.position.x;
  viewmodelParts.handR.position.x = viewmodelParts.body.position.x;
  viewmodelParts.knuckR.position.x = viewmodelParts.body.position.x;
  viewmodelParts.foreR.position.x = viewmodelParts.body.position.x + 0.02;
  viewmodelParts.handL.position.x = viewmodelParts.body.position.x;
  viewmodelParts.knuckL.position.x = viewmodelParts.body.position.x;
  viewmodelParts.foreL.position.x = viewmodelParts.body.position.x - 0.06;
  if (muzzle) muzzle.material.opacity = Math.max(0, muzzle.material.opacity - dt * 12);
}

function updateSmokes(s, dt) {
  let si = 0;
  for (const sm of s.smokes) {
    for (let k = 0; k < 6 && si < smokes.length; k++, si++) {
      const sp = smokes[si];
      const a = (k / 6) * Math.PI * 2 + sm.t;
      const layer = k % 3;
      sp.sp.scale.setScalar(2 + layer * 0.9 + sm.t * 0.4);
      sp.sp.position.set(sm.x + Math.cos(a) * 1.6, 0.6 + layer * 0.7 + Math.sin(sm.t * 0.7 + k) * 0.5, sm.z + Math.sin(a) * 1.6);
      const d = sp.sp.position.distanceTo(camera.position);
      sp.sp.material.opacity = (0.35 + layer * 0.15) * Math.min(1, sm.t * 2) * (1 - sm.t / sm.dur) * Math.min(1, Math.max(0, (d - 1) / 2));
    }
  }
  for (; si < smokes.length; si++) smokes[si].sp.material.opacity = 0;
}

export function consumeRenderEvent(s, ev) {
  switch (ev.type) {
    case 'tracer': {
      const t = tracers.find((x) => x.t <= 0) || tracers[0];
      const pos = t.line.geometry.attributes.position.array;
      pos[0] = ev.x0; pos[1] = ev.y0; pos[2] = ev.z0;
      pos[3] = ev.x1; pos[4] = ev.y1; pos[5] = ev.z1;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.color.setHex(ev.foe ? 0xff8a1e : 0xfff6c9);
      t.line.material.opacity = 1; // tracer core at full brightness
      t.t = ev.foe ? 0.2 : 0.12; // enemy tracers read longer at distance
      break;
    }
    case 'shot': {
      if (ev.own) { if (muzzle) muzzle.material.opacity = 1; }
      else if (ev.botId !== undefined && botMeshes[ev.botId]) {
        const u = botMeshes[ev.botId].userData;
        if (u.flash) u.flash.material.opacity = 1;
        u.kick = 0.09;
      }
      break;
    }
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
