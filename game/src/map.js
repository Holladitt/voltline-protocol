// VOLTLINE PROTOCOL — map.js
// GLASS CIRCUIT: 64x44 m arena. Site A NORTH RELAY (-20,-14), Site B
// GLASS SUBSTATION (20,-14). Collisions are AABBs {x0,z0,x1,z1,h}.
import { CFG } from './config.js';

// Outer walls + lane dividers + cover. 14 hard corners, 11 covers (L1).
export const BOXES = [
  // Outer walls (1 m thick, 4 high).
  { x0: -33, z0: -23, x1: 33, z1: -22, h: 4 }, // north
  { x0: -33, z0: 22, x1: 33, z1: 23, h: 4 },   // south
  { x0: -33, z0: -22, x1: -32, z1: 22, h: 4 }, // west
  { x0: 32, z0: -22, x1: 33, z1: 22, h: 4 },   // east
  // North divider: gaps x -22..-14, 6..14.
  { x0: -32, z0: -10, x1: -22, z1: -9, h: 3 },
  { x0: -14, z0: -10, x1: 6, z1: -9, h: 3 },
  { x0: 14, z0: -10, x1: 32, z1: -9, h: 3 },
  // South divider: gaps x -18..-8, 10..18.
  { x0: -32, z0: 9, x1: -18, z1: 10, h: 3 },
  { x0: -8, z0: 9, x1: 10, z1: 10, h: 3 },
  { x0: 18, z0: 9, x1: 32, z1: 10, h: 3 },
  // Vertical corner walls.
  { x0: -11, z0: -9, x1: -10, z1: 2, h: 3 },   // mid-west corner
  { x0: 10, z0: -2, x1: 11, z1: 9, h: 3 },     // mid-east corner
  { x0: -25, z0: 10, x1: -24, z1: 18, h: 3 },  // south-alley corner
  { x0: 24, z0: -9, x1: 25, z1: -2, h: 3 },    // substation corner
  // Mid cover: relay pillar + two low blocks.
  { x0: -1.2, z0: -1.2, x1: 1.2, z1: 1.2, h: 3 },   // relay pillar (map center)
  { x0: -9, z0: 1.3, x1: -7, z1: 2.7, h: 1.1 },
  { x0: 7, z0: -2.7, x1: 9, z1: -1.3, h: 1.1 },
  // Solar panels, Site A.
  { x0: -25.5, z0: -17, x1: -22.5, z1: -16, h: 2.2 },
  { x0: -17.5, z0: -18, x1: -14.5, z1: -17, h: 2.2 },
  { x0: -21, z0: -10.5, x1: -19, z1: -9.5, h: 2.2 },
  // Counter + crate, Site B.
  { x0: 16, z0: -16.5, x1: 20, z1: -15.3, h: 1.2 }, // substation counter
  { x0: 23.2, z0: -12, x1: 24.8, z1: -10.4, h: 1.4 },
  // Cable Alley + Panel Terrace cover.
  { x0: -29, z0: 11.5, x1: -27, z1: 12.5, h: 1.0 }, // cable sacks
  { x0: -7, z0: 15.3, x1: -5, z1: 16.7, h: 1.3 },
  { x0: 13.2, z0: 14.3, x1: 14.8, z1: 15.9, h: 1.4 },
  { x0: 27.2, z0: 5.2, x1: 28.8, z1: 6.8, h: 1.2 },
  { x0: -15, z0: 3.2, x1: -13.4, z1: 4.8, h: 1.2 },
  // v1.5.4 cover: mid crates breaking sightlines, clear of waypoints/holds/spawns.
  { x0: 0, z0: -6.5, x1: 2, z1: -5, h: 2 },
  { x0: -2, z0: 6, x1: 0, z1: 7.5, h: 2 },
  { x0: -13, z0: -3, x1: -11, z1: -1.5, h: 2 },
  { x0: 11, z0: 1.5, x1: 13, z1: 3, h: 2 },
  // v1.5.5 scrapyard wrecks: verified clear of waypoints/edges/holds/spawns.
  { x0: 17, z0: 2.5, x1: 19.2, z1: 4.2, h: 1.1 },   // east-mid wreck
  { x0: -19, z0: 7, x1: -16.8, z1: 8.7, h: 1.1 },   // south-west wreck
  { x0: -4, z0: -6.5, x1: -1.8, z1: -4.8, h: 1.1 }, // north-mid wreck
];

export const SITES = [
  { name: 'NORTH RELAY', cx: -20, cz: -14, r: 3 },
  { name: 'GLASS SUBSTATION', cx: 20, cz: -14, r: 3 },
];

// Glass floor zones (see-through visuals): Volt Corridor + Glass Substation.
export const GLASS_ZONES = [
  { x0: -6, z0: -2, x1: 6, z1: 2 },
  { x0: 16, z0: -18, x1: 24, z1: -10 },
];

export const SPAWNS = {
  atk: [[-29, -3], [-29, 0], [-29, 3], [-27, -5], [-27, 5]],
  def: [[29, -3], [29, 0], [29, 3], [27, -5], [27, 5]],
};

// Waypoint graph for bots. Node: [x, z]. Edge: index pair.
// RULE: an edge must NEVER cut through a wall — mid <-> terrace routes
// only pass through gaps (north: x -22..-14 & 6..14; south: x -18..-8 & 10..18).
export const WP = [
  [-29, 0], [-24, 0], [-16, 0], [-8, 0], [0, 4], [8, 0], [16, 0], [24, 0], [29, 0],
  [-26, -14], [-20, -14], [-12, -14], [12, -14], [20, -14], [26, -14],
  [-26, 14], [-14, 14], [0, 14], [14, 13], [26, 14],
  [-16, -5], [10, -5], [-12.5, 5.5], [14, 5],
  // Detour nodes (appended; indices 0-23 never shift): west/east mid detours
  // around corner walls + low blocks, gap midpoints, (-18,-14) north terrace.
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

// BFS route -> node list (without start node). Preallocated.
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

// Circle collision (x,z,r, foot height y) vs box: true on hit.
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

// Straight-line clearance for a disc of radius r sliding from (x1,z1) to
// (x2,z2) at foot height y. True when the swept disc never overlaps a box.
export function clearLine(x1, z1, x2, z2, y, r) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return !collides(x1, z1, r, y);
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    if (y >= b.h - 0.05) continue;
    const bx0 = b.x0 - r, bx1 = b.x1 + r, bz0 = b.z0 - r, bz1 = b.z1 + r;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (x1 < bx0 || x1 > bx1) continue; }
    else {
      let ta = (bx0 - x1) / dx, tb = (bx1 - x1) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (z1 < bz0 || z1 > bz1) continue; }
    else {
      let ta = (bz0 - z1) / dz, tb = (bz1 - z1) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    return false; // the segment crosses this expanded box
  }
  return true;
}

// Slab raycast vs one AABB box (y 0..h). Writes nearest t to out {t}. -1 on miss.
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

// Ray distance to the nearest wall (or maxD on miss).
export function rayWalls(ox, oy, oz, dx, dy, dz, maxD) {
  let best = maxD;
  for (let i = 0; i < BOXES.length; i++) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, best, BOXES[i]);
    if (t >= 0 && t < best) best = t;
  }
  return best;
}

// Line-of-sight between two points (y already absolute): true when no wall blocks.
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
