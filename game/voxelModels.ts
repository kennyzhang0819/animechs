// The 2.5D asset set (docs/style-concepts.html): low-fidelity, 12 px a tile,
// big flat shapes, one dark outline, two or three tones. Turrets are
// everyday things (a cannon on a crate, a tiki torch, a beehive), enemies
// are round animals with eyes, the ground is flat with a mark here and
// there. Everything here is new art, built for voxelArt.ts.
import { Model, mat, mix, type VoxMat, type VoxView } from "./voxelArt";

// ── the palette ────────────────────────────────────────────────────────
export const COL = {
  wood: "#c98a4b", woodDark: "#8a5a2b", plank: "#e0b06a", stone: "#a8a39c", stoneDark: "#6f6a66", iron: "#4a4f63",
  rope: "#f0d9a0", cloth: "#e6484a", clothBlue: "#4f7fe0", straw: "#f2d26b",
  amber: "#ffb13b", amberLit: "#ffe08a", flame: "#ff7a2f", flameLit: "#ffd84a",
  crystal: "#7fd6ff", crystalLit: "#dff6ff", leaf: "#58b84c", leafLit: "#9be36a", leafDark: "#2f8a3c", trunk: "#9a6a3a",
  mushroom: "#e85d8a", mushroomSpot: "#fff1f5", slime: "#9ee04a", water: "#4a9cff", waterLit: "#bfe6ff", bellGold: "#f4c14f",
  hive: "#f0b64a", hiveDark: "#b7822a", pot: "#5e5a7a", potLit: "#8d88b0", sail: "#f4f0e2",
  rhino: "#8f9bb3", rhinoDark: "#5f6a84", horn: "#f7efd6", stag: "#d9a05b", stagDark: "#9e6a33", antler: "#f7efd6",
  frog: "#5cc46a", frogDark: "#36964a", bat: "#9c6fb3", batDark: "#6b4a85", hull: "#7fb6c9", hullDark: "#4f8ca3",
  eye: "#ffffff", pupil: "#1a1a2e", rock: "#b3ab9f", rockDark: "#7d766e", bush: "#4caa4a", sand: "#f1dca3",
  slate: "#4f5674", slateLit: "#7c849f",
} as const;

export type Ammo = "bullet" | "shell" | "flame" | "beam" | "water" | "field" | "missile" | "toxin";

/** voxels a tile */
export const VPT = 12;
export const PLINTH_H = 3;

// ── turrets ────────────────────────────────────────────────────────────
/** the slab a turret stands on: stone, with a lighter top course */
export function plinth(size: number, v: VoxView): Model {
  const n = size * VPT;
  const M = new Model(n, n, PLINTH_H);
  const s = M.m(mat(COL.stoneDark, v)), t = M.m(mat(COL.stone, v));
  M.octa(0, 0, 0, n, n, PLINTH_H - 1, 1, s);
  M.octa(0, 0, PLINTH_H - 1, n, n, PLINTH_H, 1, t);
  return M;
}

export const HEAD_SIZES: Record<string, 1 | 2 | 3 | 4> = {
  tacker: 1, lobber: 1, torch: 1, coil: 1, duster: 1,
  autocannon: 2, airburst: 2, piercer: 2, douser: 2, tether: 2, hive: 2, blighter: 2,
  cleaver: 3, barrage: 3, deluge: 3, whirl: 3, drifter: 3,
  repeater: 4, furnace: 4, railhead: 4, stinger: 4,
};
export const HEAD_KINDS = Object.keys(HEAD_SIZES);

type Build = (M: Model, m: (c: string) => number, n: number, c: number, z: number) => void;
/** a cannon tube along +x at height z, `w` wide, from x0 to x1 */
const tube = (M: Model, id: number, bore: number, x0: number, x1: number, y: number, z: number, w: number): void => {
  M.box(x0, y - (w >> 1), z, x1, y - (w >> 1) + w, z + w, id);
  M.box(x1 - 1, y - (w >> 1) + 1, z + 1, x1, y - (w >> 1) + w - 1, z + w - 1, bore);
};
const BUILDS: Record<string, Build> = {
  // 1x1 — 12 voxels
  tacker(M, m, n, c, z) { // a little cannon on a crate
    const crate = m(COL.wood), dark = m(COL.woodDark), iron = m(COL.iron), bore = m(COL.pupil);
    M.box(2, 2, z, 10, 10, z + 4, crate);
    M.box(2, 5, z, 10, 7, z + 4, dark);
    tube(M, iron, bore, 4, 12, 6, z + 4, 3);
  },
  lobber(M, m, n, c, z) { // a clay pot mortar on a tripod
    const pot = m(COL.pot), lit = m(COL.potLit), bore = m(COL.pupil), wood = m(COL.woodDark);
    M.box(3, 3, z, 5, 5, z + 3, wood); M.box(7, 3, z, 9, 5, z + 3, wood); M.box(5, 8, z, 7, 10, z + 3, wood);
    M.cyl(5.5, 5.5, 3.5, z + 2, z + 6, pot);
    M.cyl(5.5, 5.5, 4, z + 6, z + 7, lit);
    M.cyl(5.5, 5.5, 2, z + 6, z + 8, bore);
  },
  torch(M, m, n, c, z) { // a tiki torch
    const wood = m(COL.woodDark), rope = m(COL.rope), fl = m(COL.flame), lit = m(COL.flameLit);
    M.box(5, 5, z, 7, 7, z + 8, wood);
    M.box(4, 4, z + 5, 8, 8, z + 7, rope);
    M.ball(5.5, 5.5, z + 10, 2.5, fl, 3);
    M.ball(5.5, 5.5, z + 11, 1, lit, 1.5);
  },
  coil(M, m, n, c, z) { // a crystal on a stone
    const st = m(COL.stoneDark), cr = m(COL.crystal), lit = m(COL.crystalLit);
    M.cyl(5.5, 5.5, 3.5, z, z + 2, st);
    M.cone(5.5, 5.5, 2.5, z + 2, z + 9, cr);
    M.box(5, 4, z + 4, 6, 5, z + 7, lit);
  },
  duster(M, m, n, c, z) { // a puffball mushroom
    const stem = m(COL.sand), cap = m(COL.mushroom), spot = m(COL.mushroomSpot);
    M.cyl(5.5, 5.5, 2, z, z + 4, stem);
    M.dome(5.5, 5.5, 4.5, z + 3, cap, 4);
    M.box(4, 4, z + 6, 6, 6, z + 7, spot); M.box(7, 6, z + 5, 9, 8, z + 6, spot);
  },
  // 2x2 — 24 voxels
  autocannon(M, m, n, c, z) { // two cannons behind sandbags
    const bag = m(COL.sand), bagD = m(mix(COL.sand, "#000000", 0.25)), iron = m(COL.iron), bore = m(COL.pupil);
    M.cyl(c, c, 9, z, z + 3, bag);
    M.cyl(c, c, 9, z + 3, z + 4, bagD);
    M.box(6, 5, z + 2, 15, 19, z + 6, iron);
    tube(M, iron, bore, 10, 23, 8, z + 5, 4);
    tube(M, iron, bore, 10, 23, 16, z + 5, 4);
  },
  airburst(M, m, n, c, z) { // a rack of bamboo firework tubes
    const wood = m(COL.wood), tube1 = m(COL.cloth), tube2 = m(COL.clothBlue), paper = m(COL.sail);
    M.box(4, 4, z, 20, 20, z + 2, wood);
    const cols = [[6, 6], [12, 6], [18, 6], [6, 12], [12, 12], [18, 12], [6, 18], [12, 18], [18, 18]];
    cols.forEach(([x, y], i) => { M.cyl(x, y, 2, z + 2, z + 8 + (i % 2) * 2, i % 2 ? tube2 : tube1); M.cyl(x, y, 1, z + 8 + (i % 2) * 2, z + 9 + (i % 2) * 2, paper); });
  },
  piercer(M, m, n, c, z) { // a totem with one glowing eye
    const wood = m(COL.wood), dark = m(COL.woodDark), gl = m(COL.crystal), lit = m(COL.crystalLit);
    M.box(8, 8, z, 16, 16, z + 14, wood);
    M.box(8, 8, z + 5, 16, 16, z + 7, dark); M.box(8, 8, z + 11, 16, 16, z + 13, dark);
    M.box(6, 6, z + 14, 18, 18, z + 17, dark);
    M.box(15, 10, z + 8, 17, 14, z + 11, gl); M.box(16, 11, z + 9, 17, 13, z + 10, lit);
  },
  douser(M, m, n, c, z) { // a water barrel with a spout
    const wood = m(COL.wood), band = m(COL.iron), wat = m(COL.water), lit = m(COL.waterLit);
    M.cyl(c, c, 7, z, z + 10, wood);
    M.cyl(c, c, 7.5, z + 2, z + 3, band); M.cyl(c, c, 7.5, z + 7, z + 8, band);
    M.cyl(c, c, 6, z + 10, z + 11, wat); M.cyl(c - 2, c - 2, 2, z + 11, z + 12, lit);
    M.box(16, 10, z + 6, 23, 14, z + 9, band);
  },
  tether(M, m, n, c, z) { // a bell on a wooden frame
    const wood = m(COL.woodDark), bell = m(COL.bellGold), dark = m(COL.woodDark);
    M.box(4, 10, z, 7, 14, z + 16, wood); M.box(17, 10, z, 20, 14, z + 16, wood);
    M.box(4, 10, z + 16, 20, 14, z + 18, dark);
    M.cone(c, c, 5, z + 6, z + 16, bell);
    M.cyl(c, c, 5, z + 5, z + 7, bell);
  },
  hive(M, m, n, c, z) { // a beehive
    const h = m(COL.hive), d = m(COL.hiveDark), hole = m(COL.pupil);
    M.dome(c, c, 9, z, h, 12);
    M.cyl(c, c, 8.5, z + 3, z + 4, d); M.cyl(c, c, 7.5, z + 7, z + 8, d);
    M.box(18, 10, z + 2, 21, 14, z + 5, hole);
  },
  blighter(M, m, n, c, z) { // a bubbling cauldron
    const pot = m(COL.pot), rim = m(COL.potLit), goo = m(COL.slime), fire = m(COL.flame);
    M.box(6, 6, z, 18, 18, z + 2, fire);
    M.cyl(c, c, 8, z + 2, z + 9, pot);
    M.cyl(c, c, 9, z + 9, z + 10, rim);
    M.cyl(c, c, 7, z + 10, z + 11, goo); M.ball(c + 3, c - 2, z + 12, 1.5, goo, 1.5);
  },
  // 3x3 — 36 voxels
  cleaver(M, m, n, c, z) { // a bonfire in a stone ring
    const st = m(COL.stone), log = m(COL.woodDark), fl = m(COL.flame), lit = m(COL.flameLit);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.283; M.cyl(c + Math.cos(a) * 13, c + Math.sin(a) * 13, 2.5, z, z + 4, st); }
    M.box(10, 16, z, 26, 20, z + 3, log); M.box(16, 10, z + 3, 20, 26, z + 6, log);
    M.cone(c, c, 7, z + 4, z + 16, fl);
    M.cone(c, c, 3, z + 6, z + 14, lit);
  },
  barrage(M, m, n, c, z) { // a catapult
    const wood = m(COL.wood), dark = m(COL.woodDark), rock = m(COL.rockDark);
    M.box(6, 6, z, 30, 10, z + 3, dark); M.box(6, 26, z, 30, 30, z + 3, dark);
    M.box(8, 10, z, 12, 26, z + 3, dark);
    M.box(10, 14, z + 2, 28, 22, z + 6, wood);
    M.bar(14, c, 30, c, z + 6, z + 9, 4, wood);
    M.cyl(31, c, 4, z + 8, z + 12, wood);
    M.ball(31, c, z + 13, 3, rock, 3);
  },
  deluge(M, m, n, c, z) { // a fountain
    const st = m(COL.stone), stD = m(COL.stoneDark), wat = m(COL.water), lit = m(COL.waterLit);
    M.cyl(c, c, 15, z, z + 3, stD);
    M.cyl(c, c, 13, z + 3, z + 4, wat);
    M.cyl(c, c, 4, z + 3, z + 10, st);
    M.cyl(c, c, 8, z + 10, z + 12, st); M.cyl(c, c, 7, z + 12, z + 13, wat);
    M.cyl(c, c, 2, z + 12, z + 18, lit);
  },
  whirl(M, m, n, c, z) { // a windmill
    const st = m(COL.stone), wood = m(COL.woodDark), sail = m(COL.sail), hub = m(COL.wood);
    M.cone(c, c, 9, z, z + 20, st);
    M.cyl(c, c, 5, z + 14, z + 20, wood);
    M.box(18, 16, z + 16, 36, 20, z + 19, hub);
    for (const [dy, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) M.box(33, 16 + dy * 3, z + 17 + dz * 3, 36, 20 + dy * 12, z + 19 + dz * 12, sail);
  },
  drifter(M, m, n, c, z) { // a cluster of big mushrooms
    const stem = m(COL.sand), cap = m(COL.mushroom), spot = m(COL.mushroomSpot);
    for (const [x, y, r, h] of [[c, c, 10, 12], [c - 11, c + 8, 6, 7], [c + 10, c - 9, 5, 6]]) {
      M.cyl(x, y, r * 0.45, z, z + h, stem);
      M.dome(x, y, r, z + h - 2, cap, r * 0.8);
      M.box(x - 2, y - r * 0.5, z + h + r * 0.4, x + 1, y - r * 0.5 + 3, z + h + r * 0.4 + 1, spot);
    }
  },
  // 4x4 — 48 voxels
  repeater(M, m, n, c, z) { // a wooden fort tower with a cannon
    const plank = m(COL.plank), dark = m(COL.woodDark), iron = m(COL.iron), bore = m(COL.pupil), roof = m(COL.cloth);
    M.box(10, 10, z, 38, 38, z + 16, plank);
    for (let x = 10; x < 38; x += 6) M.box(x, 10, z, x + 2, 38, z + 16, dark);
    M.box(8, 8, z + 16, 40, 40, z + 19, dark);
    M.box(14, 14, z + 19, 34, 34, z + 24, plank);
    M.cone(c, c, 13, z + 24, z + 36, roof);
    tube(M, iron, bore, 24, 46, c, z + 19, 6);
  },
  furnace(M, m, n, c, z) { // a lighthouse
    const wall = m(COL.sail), band = m(COL.cloth), top = m(COL.iron), light = m(COL.amberLit);
    M.cyl(c, c, 13, z, z + 6, wall);
    M.cyl(c, c, 10, z + 6, z + 30, wall);
    M.cyl(c, c, 10.5, z + 12, z + 16, band); M.cyl(c, c, 10.5, z + 22, z + 26, band);
    M.cyl(c, c, 11, z + 30, z + 32, top);
    M.cyl(c, c, 6, z + 32, z + 38, light);
    M.cone(c, c, 9, z + 38, z + 44, top);
  },
  railhead(M, m, n, c, z) { // a great ballista
    const wood = m(COL.wood), dark = m(COL.woodDark), rope = m(COL.rope), tip = m(COL.iron);
    M.box(8, 18, z, 40, 30, z + 5, dark);
    M.box(4, 6, z + 5, 10, 42, z + 10, wood);
    M.bar(7, 6, 7, 42, z + 10, z + 12, 2, rope);
    M.box(6, 21, z + 5, 46, 27, z + 9, wood);
    M.box(42, 22, z + 6, 48, 26, z + 8, tip);
  },
  stinger(M, m, n, c, z) { // a carnivorous plant
    const stem = m(COL.leafDark), leaf = m(COL.leaf), mouth = m(COL.mushroom), tooth = m(COL.sail);
    for (const [x, y] of [[c - 14, c - 10], [c + 12, c - 12], [c - 10, c + 14], [c + 14, c + 10]]) M.ball(x, y, z + 2, 7, leaf, 3);
    M.cone(c, c, 6, z, z + 18, stem);
    M.ball(c + 4, c, z + 20, 11, mouth, 8);
    M.box(c + 12, c - 6, z + 19, c + 15, c + 6, z + 21, tooth);
    M.box(c + 6, c - 7, z + 22, c + 14, c + 7, z + 23, tooth);
  },
};
/** a turret head, facing +x, standing on its plinth */
export function head(kind: string, v: VoxView): Model {
  const size = HEAD_SIZES[kind] ?? 1;
  const n = size * VPT;
  const M = new Model(n, n, PLINTH_H + 12 * size + 4);
  const ids = new Map<string, number>();
  const m = (col: string): number => { let id = ids.get(col); if (!id) { id = M.m(mat(col, v)); ids.set(col, id); } return id; };
  (BUILDS[kind] ?? BUILDS.tacker)(M, m, n, (n - 1) / 2, PLINTH_H);
  return M;
}

// ── the core: a stone keep with a brazier ──────────────────────────────
export function core(v: VoxView): Model {
  const n = 10 * VPT, c = (n - 1) / 2;
  const M = new Model(n, n, 40);
  const stone = M.m(mat(COL.stone, v)), dark = M.m(mat(COL.stoneDark, v)), wood = M.m(mat(COL.woodDark, v)), fl = M.m(mat(COL.flame, v)), lit = M.m(mat(COL.flameLit, v)), gold = M.m(mat(COL.amber, v));
  M.octa(0, 0, 0, n, n, 4, 16, dark);
  M.octa(6, 6, 4, n - 6, n - 6, 6, 12, stone);
  M.cyl(c, c, 34, 6, 20, stone);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.283; M.box(c + Math.cos(a) * 33 - 2, c + Math.sin(a) * 33 - 2, 20, c + Math.cos(a) * 33 + 3, c + Math.sin(a) * 33 + 3, 24, dark); }
  M.cyl(c, c, 18, 20, 24, dark);
  M.cyl(c, c, 14, 24, 26, gold);
  M.cone(c, c, 10, 26, 38, fl);
  M.cone(c, c, 4, 28, 36, lit);
  for (const [x, y] of [[14, 14], [n - 22, 14], [14, n - 22], [n - 22, n - 22]]) { M.box(x, y, 4, x + 8, y + 8, 22, wood); M.box(x + 1, y + 1, 22, x + 7, y + 7, 25, gold); }
  return M;
}

// ── enemies: a round animal with eyes, one a family ────────────────────
export type Family = "rhino" | "stag" | "frog" | "bat" | "hull";
export const FAMILY_OF: Record<string, Family> = {
  ironhide: "rhino", starhart: "stag", dartback: "frog", stoop: "bat", tusker: "rhino", ratking: "rhino", grapnel: "frog", kettle: "bat", whale: "hull", skate: "hull", livewire: "hull",
};
/** two eyes on the +x face of a ball at (cx, cy, cz) of radius r */
const eyes = (M: Model, white: number, pupil: number, cx: number, cy: number, cz: number, r: number, big: number): void => {
  const x = Math.round(cx + r * 0.75), dz = Math.round(r * 0.15), e = big;
  for (const s of [-1, 1]) {
    const y = Math.round(cy + s * r * 0.4);
    M.box(x, y - (e >> 1), cz + dz, x + e, y - (e >> 1) + e, cz + dz + e, white);
    M.box(x + e - 1, y - (e >> 1) + (s > 0 ? 0 : e - 1), cz + dz, x + e, y - (e >> 1) + (s > 0 ? 1 : e), cz + dz + 1, pupil);
  }
};
/** a body on an n-voxel square, facing +x; tier 1..5 adds its marks */
export function unit(fam: Family, n: number, tier: number, v: VoxView): Model {
  const H = Math.round(n * 1.05) + 2;
  const M = new Model(n, n, H);
  const c = (n - 1) / 2;
  const white = M.m(mat(COL.eye, v)), pupil = M.m(mat(COL.pupil, v));
  const e = n >= 24 ? 2 : 1;
  const feet = (r: number, id: number, h: number, spread = 0.6): void => {
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) M.cyl(c + sx * r * spread, c + sy * r * spread, Math.max(0.5, r * 0.2), 0, h, id);
  };
  switch (fam) {
    case "rhino": {
      const hide = M.m(mat(COL.rhino, v)), dark = M.m(mat(COL.rhinoDark, v)), horn = M.m(mat(COL.horn, v));
      const r = n * 0.38, h = Math.max(1, Math.round(n * 0.12));
      feet(r, dark, h + 1);
      M.ball(c, c, h + r * 0.85, r, hide, r * 0.85);
      M.box(c - r * 0.5, c - r * 0.25, h + r * 1.4, c + r * 0.3, c + r * 0.25, h + r * 1.8, dark);
      M.cone(c + r * 0.9, c, Math.max(1, r * 0.22), h + r * 0.9, h + r * 0.9 + Math.round(r * (0.5 + tier * 0.15)), horn);
      eyes(M, white, pupil, c, c, h + r * 0.95, r, e);
      break;
    }
    case "stag": {
      const hide = M.m(mat(COL.stag, v)), dark = M.m(mat(COL.stagDark, v)), ant = M.m(mat(COL.antler, v));
      const r = n * 0.33, h = Math.max(2, Math.round(n * 0.22));
      feet(r, dark, h + 1, 0.7);
      M.ball(c, c, h + r * 0.8, r, hide, r * 0.75);
      for (const s of [-1, 1]) {
        const y = c + s * r * 0.45;
        M.box(c - r * 0.1, y - 0.5, h + r * 1.4, c + r * 0.2, y + 0.5, h + r * 1.4 + Math.round(r * (0.6 + tier * 0.15)), ant);
        if (tier >= 3) M.box(c - r * 0.1, y - 0.5 + s * 0.5, h + r * 1.7, c + r * 0.2, y + 0.5 + s * r * 0.35, h + r * 1.7 + 1, ant);
      }
      eyes(M, white, pupil, c, c, h + r * 0.9, r, e);
      break;
    }
    case "frog": {
      const skin = M.m(mat(COL.frog, v)), dark = M.m(mat(COL.frogDark, v));
      const r = n * 0.4, h = 1;
      M.ball(c, c, h + r * 0.5, r, skin, r * 0.5);
      for (const s of [-1, 1]) M.ball(c - r * 0.3, c + s * r * 0.9, h + r * 0.3, r * 0.4, dark, r * 0.3);
      if (tier >= 2) M.box(c - r * 0.6, c - r * 0.6, h + r * 0.9, c - r * 0.2, c + r * 0.6, h + r * 1.05, dark);
      // bulging eyes up top
      for (const s of [-1, 1]) { M.ball(c + r * 0.45, c + s * r * 0.45, h + r * 1.0, Math.max(1, r * 0.3), white, Math.max(1, r * 0.3)); M.box(c + r * 0.6, c + s * r * 0.45 - 0.5, h + r * 1.0, c + r * 0.6 + e, c + s * r * 0.45 + 0.5, h + r * 1.0 + e, pupil); }
      break;
    }
    case "bat": {
      const fur = M.m(mat(COL.bat, v)), dark = M.m(mat(COL.batDark, v));
      const r = n * 0.28, z = Math.round(n * 0.35);
      M.ball(c, c, z, r, fur, r * 0.85);
      for (const s of [-1, 1]) {
        for (let i = 0; i < Math.round(n * 0.4); i++) { const y = c + s * (r * 0.9 + i); M.box(c - r * 0.4 - i * 0.5, y, z - 1, c + r * 0.5 - i * 0.4, y + 1, z, dark); }
        M.box(c - r * 0.3, c + s * r * 0.7, z + r * 0.7, c + r * 0.1, c + s * r * 0.7 + 1, z + r * 0.7 + Math.max(1, r * 0.5), fur);
      }
      eyes(M, white, pupil, c, c, z, r, e);
      break;
    }
    case "hull": {
      const hull = M.m(mat(COL.hull, v)), dark = M.m(mat(COL.hullDark, v));
      const r = n * 0.38, z = 1;
      M.ball(c, c, z + r * 0.45, r, hull, r * 0.45);
      M.box(c - r * 0.4, c - r * 0.3, z + r * 0.7, c + r * 0.2, c + r * 0.3, z + r * 1.1, dark);
      eyes(M, white, pupil, c, c, z + r * 0.5, r, e);
      break;
    }
  }
  return M;
}

// ── props ──────────────────────────────────────────────────────────────
export type PropShape = "tree" | "palm" | "rock" | "bush" | "crate" | "cactus" | "crystal";
export function prop(shape: PropShape, n: number, seed: number, v: VoxView): Model {
  const H = Math.round(n * 1.3) + 2;
  const M = new Model(n, n, H);
  const c = (n - 1) / 2;
  switch (shape) {
    case "palm": {
      const trunk = M.m(mat(COL.trunk, v)), leaf = M.m(mat(COL.leaf, v)), lit = M.m(mat(COL.leafLit, v));
      const th = Math.round(n * 0.8);
      for (let z = 0; z < th; z++) M.cyl(c + (z / th) * n * 0.1, c, Math.max(0.6, n * 0.09), z, z + 1, trunk);
      const top = c + n * 0.1;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.283 + 0.3; M.bar(top, c, top + Math.cos(a) * n * 0.45, c + Math.sin(a) * n * 0.45, th + 1 - Math.round(k % 2), th + 2, Math.max(1, n * 0.12), k % 2 ? lit : leaf); }
      M.ball(top, c, th + 1, Math.max(1, n * 0.12), leaf, 1);
      break;
    }
    case "tree": {
      const trunk = M.m(mat(COL.trunk, v)), leaf = M.m(mat(COL.leaf, v)), lit = M.m(mat(COL.leafLit, v));
      const r = n * 0.45, th = Math.round(n * 0.3);
      M.cyl(c, c, Math.max(0.6, n * 0.1), 0, th + 2, trunk);
      M.ball(c, c, th + r * 0.75, r, leaf, r * 0.8);
      M.ball(c - r * 0.3, c - r * 0.3, th + r * 1.1, r * 0.45, lit, r * 0.4);
      break;
    }
    case "bush": {
      const leaf = M.m(mat(COL.bush, v)), lit = M.m(mat(COL.leafLit, v));
      const r = n * 0.38;
      M.ball(c, c, r * 0.6, r, leaf, r * 0.6);
      M.ball(c - r * 0.3, c - r * 0.3, r * 0.8, r * 0.4, lit, r * 0.3);
      break;
    }
    case "rock": {
      const rock = M.m(mat(COL.rock, v)), dark = M.m(mat(COL.rockDark, v));
      const r = n * 0.42;
      M.dome(c, c, r, 0, rock, r * 0.75);
      M.dome(c + r * 0.4, c + r * 0.3, r * 0.45, 0, dark, r * 0.4);
      break;
    }
    case "cactus": {
      const g = M.m(mat(COL.bush, v));
      M.cyl(c, c, Math.max(0.8, n * 0.14), 0, Math.round(n * 1.1), g);
      M.cyl(c - n * 0.3, c, Math.max(0.6, n * 0.1), Math.round(n * 0.4), Math.round(n * 0.85), g);
      M.box(c - n * 0.3, c - 0.5, Math.round(n * 0.4), c, c + 0.5, Math.round(n * 0.4) + 2, g);
      break;
    }
    case "crystal": {
      const cr = M.m(mat(COL.crystal, v)), lit = M.m(mat(COL.crystalLit, v));
      M.cone(c, c, n * 0.3, 0, Math.round(n * 1.1), cr);
      M.cone(c + n * 0.3, c + n * 0.2, n * 0.18, 0, Math.round(n * 0.5), lit);
      break;
    }
    default: {
      const box = M.m(mat(COL.wood, v)), dark = M.m(mat(COL.woodDark, v));
      const r = Math.round(n * 0.36);
      M.box(c - r, c - r, 0, c + r + 1, c + r + 1, 2 * r, box);
      M.box(c - 0.5, c - r, 2 * r - 1, c + 0.5, c + r + 1, 2 * r, dark);
    }
  }
  void seed;
  return M;
}
export function propShapeOf(id: string): PropShape {
  if (/palm|canopy|mangrove|jungle/.test(id)) return "palm";
  if (/tree|pine|fungus|mushroom/.test(id)) return "tree";
  if (/cactus/.test(id)) return "cactus";
  if (/crystal|quartz|shard/.test(id)) return "crystal";
  if (/shrub|reeds|bush|scrub|fern|grass|tuft|moss|coral|kelp|lily|pod|stalk|flow/.test(id)) return "bush";
  if (/boulder|rock|stone|slab|mesa|basalt|ice|shell|bleached|column|stump|log|drift/.test(id)) return "rock";
  return "crate";
}

// ── the ground: flat, one small mark now and then ──────────────────────
const hexOf = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
export function vivid(c: string, k = 0.35): string {
  const [r, g, b] = hexOf(c);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  const sat = (x: number): number => l + (x - l) * (1 + k);
  const cl = (x: number): number => Math.max(0, Math.min(255, Math.round(sat(x))));
  return `#${[cl(r), cl(g), cl(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
export type FloorPaint = { base: string; light: string; dark: string; kind: "grass" | "earth" | "sand" | "snow" | "stone" };
/** one 32-px floor tile at 8 px a mark cell: plain, or on the first painting one small thing */
export function paintFloorVox(p: FloorPaint, variant: number, seed: number): string[] {
  const N = 32;
  const g = new Array<string>(N * N).fill(p.base);
  let s = seed;
  const rnd = (): number => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const K = 8 / 3; // px a mark pixel: 12 a tile, like the models
  const blk = (x: number, y: number, c: string, w = 1, h = 1): void => {
    for (let yy = Math.round(y * K); yy < Math.round((y + h) * K); yy++) for (let xx = Math.round(x * K); xx < Math.round((x + w) * K); xx++) if (xx >= 0 && yy >= 0 && xx < N && yy < N) g[yy * N + xx] = c;
  };
  if (variant !== 0) return g;
  const x = 3 + Math.floor(rnd() * 6), y = 3 + Math.floor(rnd() * 6);
  switch (p.kind) {
    case "grass": blk(x, y, p.dark); blk(x + 1, y - 1, p.dark); blk(x + 2, y, p.dark); break; // a tuft of three blades
    case "earth": case "stone": blk(x, y, p.light, 2, 1); blk(x, y + 1, p.dark, 2, 1); break; // a pebble
    case "sand": blk(x, y, p.dark, 2, 1); blk(x + 3, y + 1, p.dark, 1, 1); break; // two shells of shadow
    case "snow": blk(x, y, p.light, 2, 1); break;
  }
  return g;
}
export function paintRockTopVox(face: string, variant: number, seed: number, span = 1): string[] {
  const N = 32 * span;
  const dark = mix(face, "#141020", 0.3);
  const g = new Array<string>(N * N).fill(face);
  let s = seed;
  const rnd = (): number => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  if (variant === 0) for (let i = 0; i < span; i++) {
    const x = 6 + Math.floor(rnd() * (N - 16)), y = 6 + Math.floor(rnd() * (N - 16));
    for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 6; xx++) g[(y + yy) * N + x + xx] = dark;
  }
  return g;
}
/** the cliff's front: a dark band with one lighter course, 64 wide by 32 tall */
export function paintCliffFace(face: string): { w: number; h: number; px: string[] } {
  const W = 64, H = 32;
  const base = mix(face, "#141020", 0.45), light = mix(face, "#141020", 0.3), ink = mix(face, "#141020", 0.8);
  const g = new Array<string>(W * H).fill(base);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = base;
    if (y < 3) c = ink;
    else if (y >= 10 && y < 14) c = light;
    if (y >= H - 3) c = ink;
    g[y * W + x] = c;
  }
  return { w: W, h: H, px: g };
}
/** one 32-px water tile: flat blue, a pale crest on the wave painting */
export function paintWaterVox(deep: boolean, tainted: boolean, variant: number): string[] {
  const N = 32;
  const base = tainted ? (deep ? "#5a4aa0" : "#7a68c8") : deep ? "#2f6fd8" : "#4a9cff";
  const crest = mix(base, "#ffffff", 0.55);
  const g = new Array<string>(N * N).fill(base);
  const blk = (x: number, y: number, c: string, w = 1): void => { for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < w * 3; xx++) { const X = x * 3 + xx, Y = y * 3 + yy; if (X < N && Y < N) g[Y * N + X] = c; } };
  if (variant === 1) { blk(2, 3, crest, 4); blk(6, 2, crest, 1); }
  else if (variant === 2) { blk(4, 7, crest, 3); }
  return g;
}

export type { VoxMat };
