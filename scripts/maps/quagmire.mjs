/**
 * Quagmire — the third campaign map, drawn from geometry.
 *
 * The first two maps are LAND with water cut into it. This one is the other
 * way round: the board is a spore sea, and every cell of land on it is
 * either an ISLAND (a disc) or a CAUSEWAY (the envelope of a road between
 * two islands). The swarm island-hops from the border to the core, and the
 * fleet has the whole board.
 *
 *   node scripts/maps/quagmire.mjs public/maps/quagmire.json [preview.png]
 *
 * It writes the document ONLY if every check at the bottom passes, and
 * prints its numbers either way. The optional second argument saves a
 * one-pixel-per-cell picture of what it drew, which is the fastest way to
 * see that a road went somewhere it should not have.
 */
import { writeFileSync } from "node:fs";
import { Path, disc, discOffsets, flood, rng, png } from "./geom.mjs";

const W = 256;
const H = 182;
const N = W * H;

// The atlas indices this map paints with. COPIED from game/atlas.ts rather
// than imported: the generator is plain node and the atlas is a TypeScript
// module that reaches for a canvas at load. An index here that drifts from
// the table there paints the wrong tile and nothing complains, so keep the
// names identical and grep both when a family moves.
const FLOOR_MOSS = 21;
const FLOOR_SPORE_MOSS = 24;
const FLOOR_MUD = 27;
const FLOOR_TAINTED = 45;
const FLOOR_DEEP_TAINTED = 48;
const WALL_SPORE = 8;
const WALL_DACITE = 22;
const WALL_PINE = 4;
const WALL_DEEP = 7;

// ---- the thirty numbers ----
const LANE = 21; // road width, the campaign standard
const BANK = 7; // rock either side of a causeway: a ledge to build on
// The flared mouth. The campaign width is 68, drawn for a border that is
// solid land; here a border gate is an ISLAND'S BEACH, and the island is
// only ~66 across, so a 68-wide mouth would BE the island and leave no
// rock on it to build from. 36 is the same flare sized to the shore it
// lands on.
const MOUTH = 36; // road width where it meets the border
const MOUTH_RUN = 24; // cells the flare eases over
const TURN = 30; // default turn radius: 8/30 rad = 15 degrees per chord
const OPEN_R = 4; // the file taken to the blades where roads meet

const laneR = LANE / 2;

/**
 * THE ISLANDS. Four carry the trunk (A, B, D, F), two are the tributary
 * gates (H, C) with one stepping stone between (S), and the shoals carry
 * nothing at all — they are rock the fleet has to sail around and the swarm
 * never sees.
 */
const IS = {
  A: { x: 236, y: 20, r: 32 }, // north-east, on two borders
  B: { x: 158, y: 56, r: 34 },
  D: { x: 84, y: 84, r: 34 }, // the crossroads
  F: { x: 26, y: 140, r: 34 }, // the core, on the west border
  H: { x: 100, y: 10, r: 30 }, // north, on the border
  C: { x: 248, y: 96, r: 32 }, // east, on the border
  S: { x: 190, y: 136, r: 26 },
  // the stepping stone in the long wade. Without it that crossing is 58
  // cells of shallow with no rock beside it, which is further than most
  // turrets reach from either shore — a free run for anything that gets in
  P: { x: 139, y: 108, r: 14 },
};
const SHOALS = [
  { x: 168, y: 8, r: 12 },
  { x: 36, y: 34, r: 15 },
  { x: 14, y: 78, r: 11 },
  { x: 74, y: 40, r: 9 },
  { x: 222, y: 62, r: 11 },
  { x: 112, y: 154, r: 13 },
  { x: 216, y: 172, r: 12 },
  { x: 62, y: 176, r: 11 },
  { x: 246, y: 12, r: 9 },
  { x: 160, y: 176, r: 8 },
];

const CORE = { x: IS.F.x - 2, y: IS.F.y - 2, size: 5 };
const coreCx = CORE.x + CORE.size / 2;
const coreCy = CORE.y + CORE.size / 2;

/**
 * THE ROADS. Each is a pose at its border gate and the places it steers
 * for; every bend between them is one circular arc of `TURN`, so no corner
 * on the finished road is an accident.
 *
 * Each waypoint sits a few cells OFF its island's centre, on the seaward
 * side. A road through the exact middle halves an island and leaves two
 * thin crescents; pushed to one side it leaves one crescent worth building
 * on, which is the whole point of the rock.
 *
 * All three end at D, the crossroads: R1 carries on to the core alone, so
 * the causeway from D to the core island is the ONE way in for every gate.
 */
const ROADS = [
  {
    id: "R1",
    gate: { x: 236, y: -3, h: Math.PI / 2 },
    to: [{ x: 238, y: 22 }, { x: 160, y: 52 }, { x: 86, y: 80 }, { x: coreCx, y: coreCy }],
  },
  {
    id: "R2",
    gate: { x: 100, y: -3, h: Math.PI / 2 },
    to: [{ x: 102, y: 8 }, { x: 110, y: 40 }, { x: 86, y: 80 }],
    // its one crossing is a shallow BAR rather than a causeway: the swarm
    // wades it, and no rock beside it will hold a turret
    bars: [0],
  },
  {
    id: "R3",
    gate: { x: 259, y: 96, h: Math.PI },
    to: [{ x: 240, y: 98 }, { x: 192, y: 132 }, { x: 141, y: 106 }, { x: 86, y: 80 }],
    // both halves of the wade, either side of the stepping stone. Crossing
    // 0, from the gate island to S, stays ordinary causeway
    bars: [1, 2],
  },
];

const build = () => {
  const floor = new Uint8Array(N);
  const wall = new Uint8Array(N);
  const blocked = new Uint8Array(N);
  const exits = new Uint8Array(N);
  const rnd = rng(0x51a9);

  // 1. the sea
  for (let i = 0; i < N; i++) {
    blocked[i] = 1;
    wall[i] = WALL_DEEP;
    floor[i] = FLOOR_DEEP_TAINTED;
  }

  const land = (i) => {
    blocked[i] = 1;
    wall[i] = 0; // filled in below, once every island is down
    floor[i] = FLOOR_MOSS + ((rnd() * 3) | 0);
  };
  const road = (i) => {
    blocked[i] = 0;
    wall[i] = 0;
    floor[i] = FLOOR_MUD + ((rnd() * 3) | 0);
  };
  const bar = (i) => {
    blocked[i] = 0;
    wall[i] = 0;
    floor[i] = FLOOR_TAINTED;
  };

  // 2. islands and shoals
  for (const k of Object.keys(IS)) disc(W, H, IS[k].x, IS[k].y, IS[k].r, land);
  for (const s of SHOALS) disc(W, H, s.x, s.y, s.r, land);

  // 3. the roads, as paths — land envelope first, then the road on it
  const paths = [];
  for (const r of ROADS) {
    const p = new Path(r.gate.x, r.gate.y, r.gate.h);
    let prev = 0;
    r.to.forEach((t, k) => {
      const from = k ? r.to[k - 1] : r.gate;
      p.toward(t.x, t.y, TURN);
      const leg = p.length - prev;
      const straight = Math.hypot(t.x - from.x, t.y - from.y);
      // A LEG MUCH LONGER THAN ITS STRAIGHT LINE IS A LOOP, not a road: it
      // means the waypoint sat INSIDE the turning circle, so the only arc
      // of this radius that ends up aimed at it goes nearly all the way
      // round first. Caught here because on the map it is a 300-cell
      // spiral through the sea that still passes every other check.
      if (leg > straight * 1.6 + 12)
        throw new Error(`${r.id}: leg to (${t.x},${t.y}) is ${leg.toFixed(0)} for a ${straight.toFixed(0)} hop — move the waypoint or drop TURN`);
      prev = p.length;
    });
    paths.push({ ...r, p });
  }
  /**
   * THE CROSSINGS, found rather than named: the maximal stretches of a road
   * that lie outside every island. A bar is one of these picked by index,
   * so "the second crossing is a wade" stays true when an island moves —
   * writing the fractions of arclength by hand did not, and put one bar in
   * the middle of an island where it read as a puddle.
   */
  const crossings = (p) => {
    const out = [];
    let start = -1;
    p.pts.forEach(([x, y], i) => {
      const on = Object.values(IS).some((s) => (x - s.x) ** 2 + (y - s.y) ** 2 <= s.r * s.r);
      if (!on && start < 0) start = i;
      if (on && start >= 0) { out.push([p.s[start], p.s[i]]); start = -1; }
    });
    if (start >= 0) out.push([p.s[start], p.length]);
    return out;
  };
  for (const r of paths) {
    const cr = crossings(r.p);
    r.barRanges = (r.bars ?? []).map((k) => cr[k]).filter(Boolean);
    console.log(`  -- ${r.id}: ${cr.length} crossing(s) at ${cr.map(([a, b]) => `${a.toFixed(0)}-${b.toFixed(0)}`).join(", ")}${r.barRanges.length ? ` (bar: ${r.barRanges.map(([a, b]) => `${a.toFixed(0)}-${b.toFixed(0)}`).join(", ")})` : ""}`);
  }

  /** the road's half-width at arclength s: the flared mouth, then LANE */
  const halfAt = (s) => {
    if (s >= MOUTH_RUN) return laneR;
    const u = s / MOUTH_RUN;
    return (LANE + (MOUTH - LANE) * (1 - u) ** 1.7) / 2;
  };
  const inBar = (r, s) => r.barRanges.some(([a, b]) => s >= a && s <= b);

  for (const r of paths) {
    r.p.pts.forEach(([x, y], i) => {
      const s = r.p.s[i];
      if (inBar(r, s)) return; // a bar carries no land at all
      disc(W, H, x, y, halfAt(s) + BANK, land);
    });
  }
  for (const r of paths) {
    r.p.pts.forEach(([x, y], i) => {
      const s = r.p.s[i];
      disc(W, H, x, y, halfAt(s), inBar(r, s) ? bar : road);
    });
  }

  // 4. round the blades. Roads meet in the middle of an island, and the
  //    rock left between two of them is the leftover of the angle they
  //    crossed at — an opening by a disc puts OPEN_R on every convex corner
  //    of it at once. Two exclusions keep the opening honest here: a
  //    causeway's bank is only BANK wide, so it cannot survive a disc of
  //    this size, and the SHORE is drawn rather than left over. So only
  //    rock that is inside an island and touches no water is eligible.
  const inIsland = (x, y) =>
    Object.values(IS).some((s) => (x + 0.5 - s.x) ** 2 + (y + 0.5 - s.y) ** 2 <= s.r * s.r);
  const CORRIDOR = laneR + BANK + 2;
  const nearRoad = (x, y) => {
    for (const r of paths)
      for (let i = 0; i < r.p.pts.length; i += 3) {
        const dx = r.p.pts[i][0] - x - 0.5;
        const dy = r.p.pts[i][1] - y - 0.5;
        if (dx * dx + dy * dy <= CORRIDOR * CORRIDOR) return true;
      }
    return false;
  };
  const isRock = (i) => blocked[i] === 1 && wall[i] !== WALL_DEEP;
  const nearWater = (x, y) => {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) return true;
        if (wall[ny * W + nx] === WALL_DEEP) return true;
      }
    return false;
  };
  const off = discOffsets(OPEN_R);
  const eroded = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let all = 1;
      for (const [dx, dy] of off) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !isRock(ny * W + nx)) { all = 0; break; }
      }
      eroded[y * W + x] = all;
    }
  const opened = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!eroded[y * W + x]) continue;
      for (const [dx, dy] of off) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) opened[ny * W + nx] = 1;
      }
    }
  let filed = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!isRock(i) || opened[i] || nearWater(x, y)) continue;
      if (!inIsland(x, y) || !nearRoad(x, y)) continue;
      road(i);
      filed++;
    }

  console.log(`  -- filed ${filed} rock cells`);
  // 4b. SEAL THE POCKETS. An opening can leave a scrap of road with no way
  //     out of it, and a bar can pinch a puddle of sea off the rest. Neither
  //     is anything a map means, so both are filled back in with rock: the
  //     ground flood runs from the gates, the sea flood from the borders,
  //     and whatever neither reaches stops being open water or open ground.
  const gateSeeds = [];
  for (const r of paths) {
    const p0 = r.p.pts[0];
    disc(W, H, p0[0], p0[1], 12, (i) => { if (blocked[i] === 0) gateSeeds.push(i); });
  }
  const isOpen = (i) => blocked[i] === 0;
  const gflood = flood(W, H, gateSeeds, isOpen);
  let sealed = 0;
  for (let i = 0; i < N; i++)
    if (isOpen(i) && !gflood[i]) { land(i); sealed++; }
  const isSea = (i) => blocked[i] === 1 && wall[i] === WALL_DEEP;
  const rim = [];
  for (let x = 0; x < W; x++) { rim.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { rim.push(y * W, y * W + W - 1); }
  const sflood = flood(W, H, rim.filter(isSea), isSea);
  // A LAGOON IS KEPT, A PUDDLE IS NOT. Sea the border flood never reaches
  // is landlocked, and the fleet will never see it either way; a big one
  // is still a lake worth having behind the roads that closed it, while a
  // handful of cells left over from a stamp is a stain. The line is drawn
  // by area, and only what falls under it is filled back in.
  let drained = 0;
  const marked = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (marked[i] || !isSea(i) || sflood[i]) continue;
    const pocket = flood(W, H, [i], (j) => isSea(j) && !sflood[j]);
    const cells = [];
    for (let j = 0; j < N; j++) if (pocket[j]) { marked[j] = 1; cells.push(j); }
    if (cells.length > 60) continue; // a lagoon
    for (const j of cells) land(j);
    drained += cells.length;
  }

  console.log(`  -- sealed ${sealed} open cells, drained ${drained} sea cells`);
  // 5. dress the rock. THE FRINGE IS THE PALE STONE AND THE HEART IS THE
  //    PURPLE ONE, and that is the map's whole silhouette: dacite averages
  //    #9292a7 against a sea of #44356b, so every island and every causeway
  //    is outlined in something two shades lighter than the water it stands
  //    in. Dressed the other way round — spore purple on the shore — an
  //    island and the sea are the same colour and the archipelago reads as
  //    one smear.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!isRock(i)) continue;
      const heart = Object.values(IS).some(
        (s) => (x + 0.5 - s.x) ** 2 + (y + 0.5 - s.y) ** 2 <= (s.r * 0.58) ** 2,
      );
      wall[i] = (heart ? WALL_SPORE : WALL_DACITE) + ((rnd() * 2) | 0);
      if (!heart) floor[i] = FLOOR_SPORE_MOSS + ((rnd() * 3) | 0);
    }

  // 6. spore pines: small clumps on island rock, well off the roads
  const pines = [];
  const open = (i) => blocked[i] === 0;
  const distToRoad = (x, y) => {
    let best = 1e9;
    for (const r of paths)
      for (let i = 0; i < r.p.pts.length; i += 6) {
        const d = Math.hypot(r.p.pts[i][0] - x, r.p.pts[i][1] - y);
        if (d < best) best = d;
      }
    return best;
  };
  for (const k of Object.keys(IS)) {
    const s = IS[k];
    for (let n = 0; n < 5; n++) {
      const a = rnd() * Math.PI * 2;
      const rr = (0.45 + rnd() * 0.4) * s.r;
      const cx = s.x + Math.cos(a) * rr;
      const cy = s.y + Math.sin(a) * rr;
      if (distToRoad(cx, cy) < laneR + 6) continue;
      disc(W, H, cx, cy, 1.4 + rnd() * 1.8, (i, x, y) => {
        if (!isRock(i)) return;
        wall[i] = WALL_PINE;
        floor[i] = FLOOR_MOSS + ((rnd() * 3) | 0);
        // CELL is 20 and a pine is 48px art on a 32px tile, so 1.5 tiles
      pines.push({ x: (x + 0.5) * 20, y: (y + 0.5) * 20, size: 30, rot: ((rnd() * 4) | 0) * (Math.PI / 2), kind: 1 });
      });
    }
  }

  // 7. clutter on the open ground — spore growth and shale rubble
  const decor = [];
  // DECOR_TILES from atlas.ts — a prop's width in tiles at native scale
  const DECOR_TILES = [1.5, 1.5, 1, 1.25, 1.25, 1.25, 1, 1, 1, 1.5, 1.5, 1, 1, 1];
  for (let n = 0; n < 700 && decor.length < 190; n++) {
    const x = (rnd() * W) | 0;
    const y = (rnd() * H) | 0;
    const i = y * W + x;
    if (!open(i) || floor[i] === FLOOR_TAINTED) continue;
    if (Math.abs(x - coreCx) < 8 && Math.abs(y - coreCy) < 8) continue;
    const kind = rnd() < 0.5 ? 3 + ((rnd() * 3) | 0) : rnd() < 0.6 ? 6 : 7 + ((rnd() * 2) | 0);
    decor.push({
      x: (x + 0.5) * 20,
      y: (y + 0.5) * 20,
      size: 20 * DECOR_TILES[kind],
      rot: ((rnd() * 4) | 0) * (Math.PI / 2),
      kind,
    });
  }

  // 8. drop zones and exits
  const spawns = [
    { x: 236.5, y: 8.5, r: 14, zone: "ground" },
    { x: 100.5, y: 8.5, r: 14, zone: "ground" },
    { x: 247.5, y: 96.5, r: 14, zone: "ground" },
    { x: 14.5, y: 12.5, r: 14, zone: "water" },
    { x: 240.5, y: 170.5, r: 14, zone: "water" },
    { x: 130.5, y: 176.5, r: 12, zone: "water" },
    { x: 6.5, y: 6.5, r: 14, zone: "air" },
    { x: 250.5, y: 176.5, r: 14, zone: "air" },
    { x: 253.5, y: 44.5, r: 4, zone: "boss" },
  ];
  const water = (i) => wall[i] === WALL_DEEP || floor[i] === FLOOR_TAINTED;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = Math.hypot(x + 0.5 - coreCx, y + 0.5 - coreCy);
      if (d <= 9 && open(i)) exits[i] |= 1; // ground
      if (d <= 7) exits[i] |= 2; // air
      // the fleet's berth: the sea off the core island's own shore
      if (d > IS.F.r - 1 && d < IS.F.r + 7 && water(i)) exits[i] |= 4;
    }

  return { floor, wall, blocked, exits, spawns, pines, decor, paths, filed, sealed, drained };
};

// ---------- checks ----------
const check = (m) => {
  const { floor, wall, blocked, exits, spawns, paths } = m;
  const open = (i) => blocked[i] === 0;
  const water = (i) => wall[i] === WALL_DEEP || floor[i] === FLOOR_TAINTED;
  const fails = [];
  const say = (ok, msg) => {
    console.log(`${ok ? "  ok " : "FAIL "}${msg}`);
    if (!ok) fails.push(msg);
  };

  const padsIn = (c, pass) => {
    const out = [];
    disc(W, H, c.x, c.y, c.r, (i) => {
      if (pass(i)) out.push(i);
    });
    return out;
  };

  // every zone reaches an exit on its own layer
  for (const c of spawns) {
    if (c.zone === "boss" || c.zone === "air") continue;
    const pass = c.zone === "water" ? water : open;
    const bit = c.zone === "water" ? 4 : 1;
    const pads = padsIn(c, pass);
    const seen = flood(W, H, pads, pass);
    let reach = 0;
    for (let i = 0; i < N; i++) if (seen[i] && exits[i] & bit) reach++;
    say(pads.length > 0 && reach > 0, `${c.zone} zone (${c.x},${c.y}): ${pads.length} pads, ${reach} exits reached`);
  }

  // the choke: wall the causeway between D and the core island and no
  // ground gate may still reach a ground exit
  const cut = new Uint8Array(N);
  const trunk = paths[0].p;
  const mid = { x: (IS.D.x + IS.F.x) / 2, y: (IS.D.y + IS.F.y) / 2 };
  let best = 0;
  for (let i = 1; i < trunk.pts.length; i++)
    if (
      Math.hypot(trunk.pts[i][0] - mid.x, trunk.pts[i][1] - mid.y) <
      Math.hypot(trunk.pts[best][0] - mid.x, trunk.pts[best][1] - mid.y)
    )
      best = i;
  const cutC = { x: trunk.pts[best][0], y: trunk.pts[best][1] };
  disc(W, H, cutC.x, cutC.y, 26, (i) => (cut[i] = 1));
  const passCut = (i) => open(i) && !cut[i];
  let leaks = 0;
  for (const c of spawns) {
    if (c.zone !== "ground") continue;
    const seen = flood(W, H, padsIn(c, passCut), passCut);
    for (let i = 0; i < N; i++) if (seen[i] && exits[i] & 1) { leaks++; break; }
  }
  say(leaks === 0, `choke at (${cutC.x.toFixed(0)},${cutC.y.toFixed(0)}): ${leaks} gate(s) still reach an exit`);

  // open == reachable, from the ground gates
  const seeds = [];
  for (const c of spawns) if (c.zone === "ground") seeds.push(...padsIn(c, open));
  const gseen = flood(W, H, seeds, open);
  let orphan = 0;
  for (let i = 0; i < N; i++) if (open(i) && !gseen[i]) orphan++;
  say(orphan === 0, `orphan open cells: ${orphan}`);

  // no footholds: every walkable cell that touches water is on a road
  const onRoad = new Uint8Array(N);
  for (const r of paths)
    r.p.pts.forEach(([x, y], i) => {
      const s = r.p.s[i];
      const hw = s >= MOUTH_RUN
        ? LANE / 2
        : (LANE + (MOUTH - LANE) * (1 - s / MOUTH_RUN) ** 1.7) / 2;
      disc(W, H, x, y, hw + 1.5, (j) => (onRoad[j] = 1));
    });
  let foot = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!open(i) || onRoad[i]) continue;
      let wet = false;
      for (let dy = -1; dy <= 1 && !wet; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && water(ny * W + nx)) { wet = true; break; }
        }
      if (wet) foot++;
    }
  say(foot === 0, `footholds off a road on a bank: ${foot}`);

  // where the tributaries meet the trunk, and at what lean. A wishbone is
  // about 25 degrees; the third road arrives at the crossroads from the
  // east and cannot be one, which is why D is a junction and not a fork
  const head = (p, i) => Math.atan2(p.pts[i][1] - p.pts[i - 3][1], p.pts[i][0] - p.pts[i - 3][0]);
  const trunkPath = paths[0].p;
  for (const r of paths.slice(1)) {
    const end = r.p.pts.length - 1;
    const [ex, ey] = r.p.pts[end];
    let j = 3;
    for (let i = 3; i < trunkPath.pts.length; i++)
      if (Math.hypot(trunkPath.pts[i][0] - ex, trunkPath.pts[i][1] - ey) <
          Math.hypot(trunkPath.pts[j][0] - ex, trunkPath.pts[j][1] - ey)) j = i;
    const lean = Math.abs(((head(r.p, end) - head(trunkPath, j)) * 180) / Math.PI);
    console.log(`  -- ${r.id} meets the trunk at ${Math.min(lean, 360 - lean).toFixed(0)} degrees`);
  }

  // bends
  for (const r of paths) {
    const deg = r.p.sharpest();
    say(deg <= 24, `${r.id}: ${r.p.length.toFixed(0)} cells, sharpest turn ${deg.toFixed(0)} degrees`);
  }

  // room to build
  let rock = 0, sea = 0, walk = 0, shallow = 0;
  for (let i = 0; i < N; i++) {
    if (!blocked[i]) { walk++; if (floor[i] === FLOOR_TAINTED) shallow++; }
    else if (wall[i] === WALL_DEEP) sea++;
    else rock++;
  }
  const pct = (v) => ((100 * v) / N).toFixed(1);
  console.log(`  -- rock ${rock} (${pct(rock)}%)  walkable ${walk} (${pct(walk)}%, ${shallow} of it ford)  sea ${sea} (${pct(sea)}%)`);
  say(rock > 8000, `rock for towers: ${rock}`);

  // the sea's basins: a fleet zone in a pocket is a fleet that never sails
  const seenW = new Uint8Array(N);
  const comps = [];
  for (let i = 0; i < N; i++) {
    if (seenW[i] || !water(i)) continue;
    const f = flood(W, H, [i], water);
    let n = 0;
    for (let j = 0; j < N; j++) if (f[j]) { seenW[j] = 1; n++; }
    comps.push(n);
  }
  comps.sort((a, b) => b - a);
  console.log(`  -- sea basins: ${comps.slice(0, 8).join(", ")}${comps.length > 8 ? ` (+${comps.length - 8} more)` : ""}`);

  // a size-4 turret has to fit somewhere on every island
  let big = 0;
  for (let y = 0; y < H - 3; y++)
    for (let x = 0; x < W - 3; x++) {
      let ok = true;
      for (let dy = 0; dy < 4 && ok; dy++)
        for (let dx = 0; dx < 4; dx++) {
          const i = (y + dy) * W + x + dx;
          if (!blocked[i] || wall[i] === WALL_DEEP || wall[i] === WALL_PINE) { ok = false; break; }
        }
      if (ok) big++;
    }
  say(big > 200, `4x4 turret footprints: ${big}`);

  return fails;
};

// ---------- run ----------
const m = build();
const fails = check(m);

// the picture, if one was asked for — a map you cannot look at is a map
// you cannot judge, and every number below was chosen by looking
const PAL = {
  sea: [0x2a, 0x20, 0x44],
  ford: [0x60, 0x4b, 0x94],
  road: [0x35, 0x1f, 0x1b],
  spore: [0x70, 0x49, 0x87],
  shale: [0x92, 0x92, 0xa7],
  pine: [0x24, 0x4a, 0x2a],
};
const SC = 3;
const preview = () => png(W * SC, H * SC, (X, Y) => {
  const x = (X / SC) | 0;
  const y = (Y / SC) | 0;
  const i = y * W + x;
  if (m.exits[i] & 1) return [0xff, 0xc0, 0x40];
  if (m.exits[i] & 4) return [0x40, 0xd0, 0xff];
  if (!m.blocked[i]) return m.floor[i] === FLOOR_TAINTED ? PAL.ford : PAL.road;
  if (m.wall[i] === WALL_DEEP) return PAL.sea;
  if (m.wall[i] === WALL_PINE) return PAL.pine;
  return m.wall[i] >= WALL_DACITE ? PAL.shale : PAL.spore;
});
if (process.argv[3]) {
  writeFileSync(process.argv[3], preview());
  console.log(`  preview -> ${process.argv[3]}`);
}

if (fails.length) {
  console.log(`\nREFUSING TO WRITE: ${fails.length} check(s) failed`);
  process.exit(1);
}

const doc = {
  id: "quagmire",
  name: "Quagmire",
  w: W,
  core: { x: CORE.x, y: CORE.y },
  floor: Array.from(m.floor),
  wall: Array.from(m.wall),
  blocked: Array.from(m.blocked),
  exits: Array.from(m.exits),
  spawns: m.spawns,
  pines: m.pines,
  decor: m.decor,
};
writeFileSync(process.argv[2], JSON.stringify(doc));
console.log(`  wrote ${process.argv[2]}`);
