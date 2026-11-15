// VOLTLINE PROTOCOL — map.js
// SIRKUIT KACA: arena relay energi 64x44 m di atap stasiun. Tiga lane:
// Koridor Volt (mid, z~0, sightline 44 m), Teras Panel (utara, z~-14),
// Lorong Kabel (selatan, z~+14). Site A RELAY UTARA (-20,-14), Site B
// GARDU KACA (20,-14). Semua tabrakan adalah AABB {x0,z0,x1,z1,h}.
// Raycast slab dan line-of-sight memakai daftar kotak yang sama.
import { CFG } from './config.js';

// Dinding luar + pembatas lane + cover. 14 corner keras, 11 cover (L1).
export const BOXES = [
  // Dinding luar (tebal 1 m, tinggi 4).
  { x0: -33, z0: -23, x1: 33, z1: -22, h: 4 }, // utara
  { x0: -33, z0: 22, x1: 33, z1: 23, h: 4 },   // selatan
  { x0: -33, z0: -22, x1: -32, z1: 22, h: 4 }, // barat
  { x0: 32, z0: -22, x1: 33, z1: 22, h: 4 },   // timur
  // Pembatas utara (z=-10..-9): celah di x -22..-14 dan 6..14.
  { x0: -32, z0: -10, x1: -22, z1: -9, h: 3 },
  { x0: -14, z0: -10, x1: 6, z1: -9, h: 3 },
  { x0: 14, z0: -10, x1: 32, z1: -9, h: 3 },
  // Pembatas selatan (z=9..10): celah di x -18..-8 dan 10..18.
  { x0: -32, z0: 9, x1: -18, z1: 10, h: 3 },
  { x0: -8, z0: 9, x1: 10, z1: 10, h: 3 },
  { x0: 18, z0: 9, x1: 32, z1: 10, h: 3 },
  // Dinding vertikal pembentuk corner.
  { x0: -11, z0: -9, x1: -10, z1: 2, h: 3 },   // corner mid-barat
  { x0: 10, z0: -2, x1: 11, z1: 9, h: 3 },     // corner mid-timur
  { x0: -25, z0: 10, x1: -24, z1: 18, h: 3 },  // corner lorong selatan
  { x0: 24, z0: -9, x1: 25, z1: -2, h: 3 },    // corner gardu
  // Cover mid: pilar relay + dua blok rendah.
  { x0: -1.2, z0: -1.2, x1: 1.2, z1: 1.2, h: 3 },   // pilar relay (tengah map)
  { x0: -9, z0: 1.3, x1: -7, z1: 2.7, h: 1.1 },
  { x0: 7, z0: -2.7, x1: 9, z1: -1.3, h: 1.1 },
  // Panel surya miring Site A (cover tinggi 2.2).
  { x0: -25.5, z0: -17, x1: -22.5, z1: -16, h: 2.2 },
  { x0: -17.5, z0: -18, x1: -14.5, z1: -17, h: 2.2 },
  { x0: -21, z0: -10.5, x1: -19, z1: -9.5, h: 2.2 },
  // Loket + crate Site B.
  { x0: 16, z0: -16.5, x1: 20, z1: -15.3, h: 1.2 }, // loket gardu
  { x0: 23.2, z0: -12, x1: 24.8, z1: -10.4, h: 1.4 },
  // Cover Lorong Kabel + Teras Panel.
  { x0: -29, z0: 11.5, x1: -27, z1: 12.5, h: 1.0 }, // karung kabel
  { x0: -7, z0: 15.3, x1: -5, z1: 16.7, h: 1.3 },
  { x0: 13.2, z0: 14.3, x1: 14.8, z1: 15.9, h: 1.4 },
  { x0: 27.2, z0: 5.2, x1: 28.8, z1: 6.8, h: 1.2 },
  { x0: -15, z0: 3.2, x1: -13.4, z1: 4.8, h: 1.2 },
];

export const SITES = [
  { name: 'RELAY UTARA', cx: -20, cz: -14, r: 3 },
  { name: 'GARDU KACA', cx: 20, cz: -14, r: 3 },
];

// Zona lantai kaca (visual tembus pandang): Koridor Volt + Gardu Kaca.
export const GLASS_ZONES = [
  { x0: -6, z0: -2, x1: 6, z1: 2 },
  { x0: 16, z0: -18, x1: 24, z1: -10 },
];

export const SPAWNS = {
  atk: [[-29, -3], [-29, 0], [-29, 3], [-27, -5], [-27, 5]],
  def: [[29, -3], [29, 0], [29, 3], [27, -5], [27, 5]],
};

// Graf waypoint untuk bot. Node: [x, z]. Edge: pasangan indeks.
// ATURAN: edge TIDAK BOLEH memotong dinding — rute mid <-> teras utara/selatan
// hanya lewat celah (utara: x -22..-14 & 6..14; selatan: x -18..-8 & 10..18).
// WP4 digeser ke (0,4): (0,0) tepat di dalam pilar relay, bot tak pernah sampai.
export const WP = [
  [-29, 0], [-24, 0], [-16, 0], [-8, 0], [0, 4], [8, 0], [16, 0], [24, 0], [29, 0],
  [-26, -14], [-20, -14], [-12, -14], [12, -14], [20, -14], [26, -14],
  [-26, 14], [-14, 14], [0, 14], [14, 14], [26, 14],
  [-16, -5], [10, -5], [-13, 5], [14, 5],
];
export const WP_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 21], [21, 12], [12, 13], [13, 14],
  [15, 16], [16, 17], [17, 18], [18, 19],
  [2, 20], [20, 10], [2, 22], [22, 16], [6, 21], [6, 23], [23, 18], [11, 12],
  [9, 20], [13, 21], [15, 22], [19, 23],
];
const WP_ADJ = WP.map(() => []);
for (const [a, b] of WP_EDGES) { WP_ADJ[a].push(b); WP_ADJ[b].push(a); }

export function nearestWP(x, z) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < WP.length; i++) {
    const dx = WP[i][0] - x, dz = WP[i][1] - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// BFS rute waypoint -> daftar node (tanpa node awal). Preallocated: tulis ke out[].
export function findRoute(from, to, out) {
  out.length = 0;
  if (from === to) return out;
  const prev = new Int16Array(WP.length).fill(-1);
  const q = [from]; prev[from] = from;
  let qi = 0;
  while (qi < q.length) {
    const n = q[qi++];
    if (n === to) break;
    for (const m of WP_ADJ[n]) if (prev[m] === -1) { prev[m] = n; q.push(m); }
  }
  if (prev[to] === -1) return out;
  const rev = [];
  for (let n = to; n !== from; n = prev[n]) rev.push(n);
  for (let i = rev.length - 1; i >= 0; i--) out.push(rev[i]);
  return out;
}

// Tabrakan lingkaran (x,z,r, tinggi kaki y) vs kotak: true bila menabrak.
export function hitsBox(x, z, r, y, b) {
  if (y >= b.h - 0.05) return false;
  const cx = Math.max(b.x0, Math.min(x, b.x1));
  const cz = Math.max(b.z0, Math.min(z, b.z1));
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r;
}
export function collides(x, z, r, y) {
  for (let i = 0; i < BOXES.length; i++) if (hitsBox(x, z, r, y, BOXES[i])) return true;
  return false;
}

// Raycast slab vs satu kotak AABB (y 0..h). Tulis t terdekat ke out {t}. -1 bila tak kena.
export function rayBox(ox, oy, oz, dx, dy, dz, maxD, b) {
  let tmin = 0, tmax = maxD;
  const mins = [b.x0, 0, b.z0], maxs = [b.x1, b.h, b.z1], o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mins[i] || o[i] > maxs[i]) return -1; }
    else {
      let t1 = (mins[i] - o[i]) / d[i], t2 = (maxs[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

// Jarak ray ke dinding terdekat (atau maxD bila tak kena).
export function rayWalls(ox, oy, oz, dx, dy, dz, maxD) {
  let best = maxD;
  for (let i = 0; i < BOXES.length; i++) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, best, BOXES[i]);
    if (t >= 0 && t < best) best = t;
  }
  return best;
}

// Line-of-sight antara dua titik (y sudah absolut): true bila tak ada dinding.
export function hasLOS(x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  const t = rayWalls(x1, y1, z1, dx / dist, dy / dist, dz / dist, dist);
  return t >= dist - 0.05;
}

export function inSite(x, z, site) {
  const s = SITES[site];
  const dx = x - s.cx, dz = z - s.cz;
  return dx * dx + dz * dz <= s.r * s.r;
}
export function siteOf(x, z) {
  for (let i = 0; i < SITES.length; i++) if (inSite(x, z, i)) return i;
  return -1;
}
export function distToSite(x, z, site) {
  const s = SITES[site];
  return Math.hypot(x - s.cx, z - s.cz) - s.r;
}
