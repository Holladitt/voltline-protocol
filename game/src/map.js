// VOLTLINE PROTOCOL — map.js
import { CFG } from './config.js';

export const BOXES = [
  { x0: -33, z0: -23, x1: 33, z1: -22, h: 4 }, // north
  { x0: -33, z0: 22, x1: 33, z1: 23, h: 4 },   // south
  { x0: -33, z0: -22, x1: -32, z1: 22, h: 4 }, // west
  { x0: 32, z0: -22, x1: 33, z1: 22, h: 4 },   // east
  { x0: -32, z0: -10, x1: -22, z1: -9, h: 3 },
  { x0: -14, z0: -10, x1: 6, z1: -9, h: 3 },
  { x0: 14, z0: -10, x1: 32, z1: -9, h: 3 },
  { x0: -32, z0: 9, x1: -18, z1: 10, h: 3 },
  { x0: -8, z0: 9, x1: 10, z1: 10, h: 3 },
  { x0: 18, z0: 9, x1: 32, z1: 10, h: 3 },
  { x0: -11, z0: -9, x1: -10, z1: 2, h: 3 },   // mid-west corner
  { x0: 10, z0: -2, x1: 11, z1: 9, h: 3 },     // mid-east corner
  { x0: -25, z0: 10, x1: -24, z1: 18, h: 3 },  // south-alley corner
  { x0: 24, z0: -9, x1: 25, z1: -2, h: 3 },    // substation corner
  { x0: -1.2, z0: -1.2, x1: 1.2, z1: 1.2, h: 3 },   // relay pillar (map center)
  { x0: -9, z0: 1.3, x1: -7, z1: 2.7, h: 1.1 },
  { x0: 7, z0: -2.7, x1: 9, z1: -1.3, h: 1.1 },
  { x0: -25.5, z0: -17, x1: -22.5, z1: -16, h: 2.2 },
  { x0: -17.5, z0: -18, x1: -14.5, z1: -17, h: 2.2 },
  { x0: -21, z0: -10.5, x1: -19, z1: -9.5, h: 2.2 },
  { x0: 16, z0: -16.5, x1: 20, z1: -15.3, h: 1.2 }, // substation counter
  { x0: 23.2, z0: -12, x1: 24.8, z1: -10.4, h: 1.4 },
  { x0: -29, z0: 11.5, x1: -27, z1: 12.5, h: 1.0 }, // cable sacks
  { x0: -7, z0: 15.3, x1: -5, z1: 16.7, h: 1.3 },
  { x0: 13.2, z0: 14.3, x1: 14.8, z1: 15.9, h: 1.4 },
  { x0: 27.2, z0: 5.2, x1: 28.8, z1: 6.8, h: 1.2 },
  { x0: -15, z0: 3.2, x1: -13.4, z1: 4.8, h: 1.2 },
];

// Scrapyard props: [x, z] per type; dims fixed per type (w, d, h).
// T tire stack, D drum, S scrap pile, P pallet, W wreck car, B barrier, C carrier.
export const PROPS = {
  T: [[-24, 6], [-22.4, 7.6], [-25.5, 8.5], [24, 6], [22.4, 7.6], [25.5, 8.5], [-4, 19], [6, 19.5], [-18, 18.5], [12, -6.5], [-10, -18], [0, 7], [18, 18], [-3, 1], [-14, 3], [8, -6]],
  D: [[-27, -7], [27, 7], [-4, 20], [4, -20], [20, 8], [-22, -12], [-27.5, 17], [27.5, -17], [-2, 7], [26, 18], [2, 5], [-8, -6]],
  S: [[-28, 17], [28, -17], [-5, -19], [5, 19], [22, -6.5], [-22, 6.5], [28, 11.5], [-18, 3]],
  P: [[-10, 18], [10, 18], [-28, -7], [28, 7], [-14, -6.5], [16, 7], [-28, -18]],
  W: [[-20, 6.5], [20, -5.5], [-2, 17.5]],
  B: [[-10, 7.5], [14, -7.5], [-2, -8.5], [2, 7.5], [-16, 7.5], [19, -7.5], [-1, -6]],
  C: [[18.5, 2.5]],
};
const PDIM = { T: [1.1, 1.1, 0.9], D: [0.7, 0.7, 1], S: [1.6, 1.2, 0.8], P: [1.4, 1.4, 1], W: [3.4, 1.7, 1.1], B: [3, 0.6, 0.9], C: [3.4, 1.8, 1.4] };
for (const k in PROPS) for (const [x, z] of PROPS[k]) {
  const d = PDIM[k];
  BOXES.push({ x0: x - d[0] / 2, z0: z - d[1] / 2, x1: x + d[0] / 2, z1: z + d[1] / 2, h: d[2], prop: k });
}

export function legClear(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(len / 0.35));
  for (let i = 0; i <= n; i++) if (collides(x1 + dx * i / n, z1 + dz * i / n, 0.42, 0)) return false;
  return true;
}

export const SITES = [
  { name: 'NORTH RELAY', cx: -20, cz: -14, r: 3 },
  { name: 'GLASS SUBSTATION', cx: 20, cz: -14, r: 3 },
];

export const GLASS_ZONES = [
  { x0: -6, z0: -2, x1: 6, z1: 2 },
  { x0: 16, z0: -18, x1: 24, z1: -10 },
];

export const SPAWNS = {
  atk: [[-29, -3], [-29, 0], [-29, 3], [-27, -5], [-27, 5]],
  def: [[29, -3], [29, 0], [29, 3], [27, -5], [27, 5]],
};

export const WP = [
  [-29, 0], [-24, 0], [-16, 0], [-8, 0], [0, 4], [8, 0], [16, 0], [24, 0], [29, 0],
  [-26, -14], [-20, -14], [-12, -14], [12, -14], [20, -14], [26, -14],
  [-26, 14], [-14, 14], [0, 14], [14, 13], [26, 14],
  [-16, -5], [10, -5], [-12.5, 5.5], [14, 5],
  [-6, 6], [-6, 0.5], [6, -1], [6, -4], [13, -4],
  [10, -9.5], [-12.5, 9.5], [14, 9.5], [-18, -9.5], [-18, -14], [-26, 20],
];
export const WP_EDGES = [
  [0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8],
  [9, 10], [10, 11], [21, 12], [12, 13], [13, 14],
  [16, 17], [17, 18], [18, 19],
  [2, 20], [20, 10], [22, 16], [6, 21], [6, 23], [23, 18], [11, 12],
  [2, 24], [24, 25], [25, 3], [24, 22],
  [5, 26], [26, 27], [27, 28], [28, 6],
  [12, 29], [29, 21], [13, 29],
  [17, 30], [30, 22], [16, 30],
  [19, 31], [31, 23],
  [9, 33], [33, 32], [32, 20],
  [15, 34], [34, 16],
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

export function rayWalls(ox, oy, oz, dx, dy, dz, maxD) {
  let best = maxD;
  for (let i = 0; i < BOXES.length; i++) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, best, BOXES[i]);
    if (t >= 0 && t < best) best = t;
  }
  return best;
}

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
