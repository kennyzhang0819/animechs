/**
 * Quagmire — the third campaign map, drawn from geometry.
 *
 * The first two maps are LAND with water cut into it. This one is the other
 * way round: the board is a spore sea, and every cell of land on it is
 * either an ISLAND or a CAUSEWAY (the envelope of a road between two
 * islands). The swarm island-hops in from three borders and the fleet has
 * the whole board.
 *
 *   node scripts/maps/quagmire.mjs public/maps/quagmire.json [preview.png]
 *
 * It writes the document ONLY if every check at the bottom passes, and
 * prints its numbers either way. The optional second argument saves a
 * one-pixel-per-cell picture of what it drew, which is the fastest way to
 * see that a road went somewhere it should not have.
 */
import { writeFileSync } from "node:fs";
import {
  Path, blob, inBlob, stampBlob, disc, discOffsets, flood, clearance, widestRoute, rng, png,
} from "./geom.mjs";

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
// only ~64 across, so a 68-wide mouth would BE the island and leave no
// rock on it to build from. 36 is the same flare sized to the shore it
// lands on.
const MOUTH = 36; // road width where it meets the border
const MOUTH_RUN = 24; // cells the flare eases over
const TURN = 30; // default turn radius: 8/30 rad = 15 degrees per chord
const MERGE_TURN = 20; // the tighter radius a road swings onto the trunk at
const OPEN_R = 4; // the file taken to the blades where roads meet
const EXIT_BAND = 3; // how deep into the west border an exit cell may be

const laneR = LANE / 2;

/**
 * THE ISLANDS, and NONE OF THEM IS A CIRCLE.
 *
 * A disc is the one shape a stamp gets for free and the one shape nothing
 * in nature has, so eight discs read as eight discs. Every island here is
 * a `blob` instead — an ellipse with a long axis pointed somewhere, bent
 * by two cosine lobes into headlands and bays. That is still six numbers
 * and two triples, all of it deterministic, and it is the difference
 * between an archipelago and a handful of coins.
 *
 * F is the base island, hard against the WEST BORDER, and the trunk runs
 * through it and off the edge — that edge is where the swarm is going.
 * D is the crossroads every road meets at. The other six are three pairs:
 * a gate island on a border and one stepping stone between it and D, one
 * pair per approach, and the three approaches are cut to the SAME LENGTH
 * (see the route-length check) so no gate is a short cut.
 */
const IS = {
  F: blob(16, 92, 31, 42, 8, [[0.10, 3, 0.7], [0.07, 2, 2.1]]), // the base, west border
  D: blob(104, 92, 28, 34, -20, [[0.12, 3, 1.9], [0.06, 5, 0.4]]), // the crossroads
  E1: blob(182, 104, 20, 28, 20, [[0.12, 3, 1.1], [0.06, 2, 2.8]]),
  E0: blob(250, 88, 24, 28, -10, [[0.10, 3, 2.3], [0.07, 5, 0.6]]), // east border
  N1: blob(154, 40, 22, 20, 35, [[0.13, 3, 2.6], [0.07, 2, 0.9]]),
  N0: blob(212, 6, 24, 22, -15, [[0.11, 3, 0.2], [0.06, 5, 1.7]]), // north border
  S1: blob(154, 148, 22, 20, -30, [[0.12, 3, 0.5], [0.06, 2, 1.4]]),
  S0: blob(212, 182, 24, 22, 20, [[0.11, 3, 1.6], [0.07, 5, 2.2]]), // south border
  // THE TWO COASTS, and what they replaced. There was a scatter of islets
  // out in the water, and every one of them was a hazard rather than a
  // feature: a rock dropped in open sea pinches the channel it sits in to
  // something no hull can swim down, and the fleet piles up behind it.
  // Two long shore masses along the north and south edges do the same job
  // for the composition — they close the empty corners and give the sea a
  // shape — without putting anything in the middle of a sea lane.
  NW: blob(56, 0, 52, 18, -3, [[0.10, 3, 0.9], [0.06, 2, 1.6]]),
  SW: blob(56, 192, 52, 18, 3, [[0.10, 3, 2.2], [0.06, 2, 0.4]]),
  // THE BUMP, and it grows UP OFF THE SOUTH BORDER — it is part of the
  // southern shore, not an island parked in the lake. That matters: a mass
  // reaching in from the side walls the lake off at whichever end it
  // reaches, while one rising from the bottom leaves the water a channel
  // OVER it, open at both ends, and the fleet sails the length of the lake
  // as it did before.
  //
  // What it is for is the ROAD. The last run to the base was a straight
  // line, which is the one shape a defended approach must not be:
  // everything walks the shortest path, so a straight lane is a lane where
  // every turret has the same firing arc and the swarm crosses it in the
  // fewest cells it can. The bump pushes the water up and the water pushes
  // the road up, and the trunk arcs north over both — the same ground
  // covered, as a curve, with an inside and an outside to build on.
  //
  // Its height is set by that channel: the top has to sit a lane clear of
  // the road's south bank, which is `road + BANK + LANE` below it.
  SB: blob(66, 178, 16, 55, 0, [[0.11, 3, 1.3], [0.06, 2, 0.7]]),
};

// The base sits ON the trunk a dozen cells inside the west border, so the
// road runs past it and off the edge. It is not the destination — the
// EDGE is (see the exits below); the base is what stands in the way.
const BASE = { x: 12, y: 84, size: 5 };

/**
 * THE ROADS. Each is a pose at its border gate and the places it steers
 * for; every bend between them is one circular arc, `TURN` by default and
 * the tighter `MERGE_TURN` where a road has to swing onto the trunk.
 *
 * Each waypoint sits a few cells OFF its island's centre. A road through
 * the exact middle halves an island and leaves two thin crescents; pushed
 * to one side it leaves one crescent worth building on, which is the whole
 * point of the rock.
 *
 * R1 is the trunk and the only road that reaches the border: R2 and R3 end
 * where they meet it, so the causeway from D to the base island is the ONE
 * way in for all three gates.
 */
const ROADS = [
  {
    id: "R1",
    gate: { x: 263, y: 88, h: Math.PI },
    to: [
      { x: 244, y: 92 },
      { x: 186, y: 108 },
      { x: 102, y: 86 },
      // The last stretch ARCS, over the bump rising below it: north out
      // of the crossroads, then back down to the border. Two arcs of
      // opposite sign, so it leaves level and arrives level and nothing
      // has to be fixed up at either join
      { x: 68, y: 72 },
      { x: 14, y: 86, r: 26 },
      { x: -30, y: 96 },
    ],
    crossings: 3, // E0-E1, E1-D, and the choke from D to the base island
    // THE FIRST CROSSING IS A STRAIT, and that is a sailing decision as
    // much as a walking one: the trunk runs the whole width of the board,
    // so every crossing on it that is dry land is a wall between the
    // northern sea and the southern one. The choke stays dry — a bar has
    // no rock beside it, and the last causeway before the base is the one
    // place turrets most need somewhere to stand.
    bars: [0],
  },
  {
    id: "R2",
    gate: { x: 212, y: -7, h: Math.PI / 2 },
    to: [
      { x: 206, y: 14 },
      { x: 162, y: 46 },
      { x: 124, y: 78 },
      { x: 104, y: 86, r: MERGE_TURN },
    ],
    crossings: 2,
    // BOTH its crossings are wades — a tributary made of islands and
    // shallow is this map's idea of a side road. They are the swarm's
    // crossings, not the fleet's: the water either side of a tributary is
    // a bay, and step 4a silts up the channels through it rather than
    // leave a gap under 21 for a hull to jam in.
    bars: [0, 1],
  },
  {
    id: "R3",
    gate: { x: 212, y: 189, h: -Math.PI / 2 },
    to: [
      { x: 206, y: 168 },
      { x: 162, y: 142 },
      { x: 124, y: 106 },
      { x: 104, y: 90, r: MERGE_TURN },
    ],
    crossings: 2,
    bars: [0, 1],
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
    wall[i] = 0; // dressed below, once every island is down
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
  for (const k of Object.keys(IS)) stampBlob(W, H, IS[k], land);

  // 3. the roads, as paths — land envelope first, then the road on it
  const paths = [];
  for (const r of ROADS) {
    const p = new Path(r.gate.x, r.gate.y, r.gate.h);
    let prev = 0;
    r.to.forEach((t, k) => {
      const from = k ? r.to[k - 1] : r.gate;
      p.toward(t.x, t.y, t.r ?? TURN);
      const leg = p.length - prev;
      const straight = Math.hypot(t.x - from.x, t.y - from.y);
      // A LEG MUCH LONGER THAN ITS STRAIGHT LINE IS A LOOP, not a road: it
      // means the waypoint sat INSIDE the turning circle, so the only arc
      // of this radius that ends up aimed at it goes nearly all the way
      // round first. Caught here because on the map it is a 300-cell
      // spiral through the sea that still passes every other check.
      if (leg > straight * 1.35 + 8)
        throw new Error(
          `${r.id}: leg to (${t.x},${t.y}) is ${leg.toFixed(0)} for a ${straight.toFixed(0)} hop — move the waypoint or drop its radius`,
        );
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
  const onLand = (x, y) => Object.values(IS).some((s) => inBlob(s, x, y));
  const crossings = (p) => {
    const out = [];
    let start = -1;
    p.pts.forEach(([x, y], i) => {
      // a stretch OFF THE BOARD is not a crossing. The trunk runs past the
      // west border on purpose, and an island's outline keeps going out
      // there where no cell is ever stamped, so counting it would report a
      // channel that does not exist
      const off = x < 0 || y < 0 || x >= W || y >= H;
      const on = off || onLand(x, y);
      if (!on && start < 0) start = i;
      if (on && start >= 0) { out.push([p.s[start], p.s[i]]); start = -1; }
    });
    if (start >= 0) out.push([p.s[start], p.length]);
    return out;
  };
  for (const r of paths) {
    const cr = crossings(r.p);
    const fmt = (v) => v.map(([a, b]) => `${a.toFixed(0)}-${b.toFixed(0)} (${(b - a).toFixed(0)} wide)`).join(", ");
    r.barRanges = (r.bars ?? []).map((k) => cr[k]).filter(Boolean);
    console.log(`  -- ${r.id}: ${cr.length} crossing(s) ${fmt(cr)}${r.barRanges.length ? ` | bar ${fmt(r.barRanges)}` : ""}`);
    // TWO ISLANDS THAT TOUCH ARE ONE ISLAND. Every gap a road is supposed
    // to hop has to still be there after the blobs are stamped — an island
    // grown a few cells too fat swallows its neighbour's channel and the
    // archipelago quietly becomes one landmass with roads on it.
    if (cr.length !== r.crossings)
      throw new Error(`${r.id}: ${cr.length} crossings, expected ${r.crossings} — islands have met or parted`);
    // A CROSSING IS A STRAIT SEEN SIDEWAYS. Its length is how far the road
    // runs over open water, and it is also how wide the channel between
    // the two islands is — so a crossing shorter than a lane is a gap the
    // fleet cannot fit through, however comfortable it is to wade.
    //
    // The ceiling is different for the two kinds. A CAUSEWAY carries its
    // own rock banks, so a long one is just a long defended bridge. A BAR
    // is bare shallow with nothing beside it to stand a turret on, and
    // past about forty cells the middle of one is further than a turret
    // reaches from either shore — a free run for anything that gets in.
    for (const [a, b] of cr)
      if (b - a < LANE || b - a > 60)
        throw new Error(`${r.id}: a crossing is ${(b - a).toFixed(0)} cells — wanted ${LANE} to 60`);
    for (const [a, b] of r.barRanges)
      if (b - a > 44)
        throw new Error(`${r.id}: a bar is ${(b - a).toFixed(0)} cells — no turret covers the middle past 44`);
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
      if (!onLand(x + 0.5, y + 0.5) || !nearRoad(x, y)) continue;
      road(i);
      filed++;
    }
  console.log(`  -- filed ${filed} rock cells`);

  // 4a. OPEN THE SEA. THE 21-CELL RULE IS NOT ONLY THE ROAD'S: anywhere a
  //     unit can go has to be a lane wide, and a hull has no more idea how
  //     to squeeze down a nine-cell gap than a walker does. Islands laid
  //     out by hand leave those gaps everywhere — between two coasts that
  //     nearly meet, in the crook where a causeway lands, along the inside
  //     of a bay — and each one is a place the fleet queues up and dies.
  //
  //     So the sea gets the same morphological opening the rock does, with
  //     the disc sized to the lane: erode the water by LANE/2, dilate it
  //     back, and every channel too narrow for that disc to fit down
  //     simply is not water any more. It fills in as coast, which is what
  //     a strait too shallow to sail reads as anyway. It can only REMOVE
  //     water, and only water a lane-wide disc cannot fit inside, so no
  //     channel the fleet could actually use is ever touched.
  //
  //     The roads are exempt. A bar is a lane wide by construction and a
  //     rasterised lane measures a shade under 21, so the disc does not
  //     quite fit inside one — opening it away would close the wades the
  //     tributaries are made of.
  const onRoadCell = new Uint8Array(N);
  for (const r of paths)
    r.p.pts.forEach(([x, y], i) => {
      disc(W, H, x, y, halfAt(r.p.s[i]) + 1, (j) => (onRoadCell[j] = 1));
    });
  const wet = (i) => blocked[i] === 1 && wall[i] === WALL_DEEP;
  const sea = discOffsets(laneR);
  const seaFits = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let all = 1;
      for (const [dx, dy] of sea) {
        const nx = x + dx;
        const ny = y + dy;
        // THE RIM IS COAST, EXCEPT WHERE THE MAP LETS UNITS OUT. A hull
        // cannot leave the board, so a ten-cell strip of sea pinned
        // between a coast and the north edge is exactly the queue this
        // pass exists to remove. The WEST edge is different: it carries
        // the exits, the sea genuinely runs off the map there, and
        // treating it as coast would silt up the fleet's own doorway.
        if (nx < 0) continue;
        if (ny < 0 || nx >= W || ny >= H) { all = 0; break; }
        if (!wet(ny * W + nx)) { all = 0; break; }
      }
      seaFits[y * W + x] = all;
    }
  const sailable = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!seaFits[y * W + x]) continue;
      for (const [dx, dy] of sea) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) sailable[ny * W + nx] = 1;
      }
    }
  let silted = 0;
  for (let i = 0; i < N; i++)
    if (wet(i) && !sailable[i] && !onRoadCell[i]) { land(i); silted++; }
  console.log(`  -- silted up ${silted} cells of water too narrow to sail`);

  // 4b. SEAL THE POCKETS. An opening can leave a scrap of road with no way
  //     out of it, and a bar can pinch a puddle of sea off the rest.
  //     Neither is anything a map means, so both are filled back in with
  //     rock: the ground flood runs from the gates, the sea flood from the
  //     borders, and whatever neither reaches stops being open.
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
  for (let x = 0; x < W; x++) rim.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) rim.push(y * W, y * W + W - 1);
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
  //    one smear. The heart follows the blob's own outline at 0.58, so it
  //    is a smaller copy of the island rather than a circle inside it.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!isRock(i)) continue;
      const heart = Object.values(IS).some((s) => inBlob(s, x + 0.5, y + 0.5, 0.58));
      wall[i] = (heart ? WALL_SPORE : WALL_DACITE) + ((rnd() * 2) | 0);
      if (!heart) floor[i] = FLOOR_SPORE_MOSS + ((rnd() * 3) | 0);
    }

  // 6. NO PROPS. The pines and the spore clutter are off for now — the
  //    terrain is what is being judged, and a scatter of sprites over it
  //    is the thing you end up looking at instead. Both layers ship empty
  //    rather than absent, so the document shape is unchanged.
  const pines = [];
  const decor = [];

  // 7. drop zones and THE EXITS.
  //
  //    AN EXIT IS ON THE BORDER. The swarm is walking OFF the west edge of
  //    the world, past the base standing in the road; it is not walking to
  //    a patch of ground in the middle of the field and vanishing. Both
  //    other campaign maps do it this way — confluence's exits are the
  //    x=255 column, maelstrom's the bottom band — and the flow field
  //    reads whatever is marked, so the only thing that makes an exit an
  //    edge is putting it on one.
  const spawns = [
    { x: 251.5, y: 88.5, r: 14, zone: "ground" },
    { x: 212.5, y: 4.5, r: 14, zone: "ground" },
    { x: 212.5, y: 178.5, r: 14, zone: "ground" },
    // THE FLEET SAILS TWO SEAS, one either side of the trunk, and it is
    // dropped as far east in each as the water still runs a LANE WIDE all
    // the way to the exits — around x=130, which is where the tributaries
    // come down and close the sea behind them. Further east is bay, and
    // the fleet is never dropped in one: the width check measures the
    // route, not merely that a route exists, so a zone put out there
    // fails rather than shipping a fleet that queues at a pinch.
    { x: 128.5, y: 14.5, r: 13, zone: "water" },
    { x: 126.5, y: 170.5, r: 13, zone: "water" },
    { x: 44.5, y: 44.5, r: 13, zone: "water" },
    { x: 6.5, y: 4.5, r: 14, zone: "air" },
    { x: 250.5, y: 178.5, r: 14, zone: "air" },
    { x: 254.5, y: 120.5, r: 4, zone: "boss" },
  ];
  const water = (i) => wall[i] === WALL_DEEP || floor[i] === FLOOR_TAINTED;
  // the flyers' door sits over the road's own mouth rather than on a row
  // written down here, so moving the trunk moves all three layers together
  const doorY = paths[0].p.pts[paths[0].p.pts.length - 1][1];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < EXIT_BAND; x++) {
      const i = y * W + x;
      if (isOpen(i)) exits[i] |= 1; // the road, where it runs off the edge
      if (Math.abs(y - doorY) <= 7) exits[i] |= 2;
      if (water(i)) exits[i] |= 4; // the sea north and south of the island
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

  // EVERY EXIT IS ON THE RIM. A goal cell in open field is a unit walking
  // to the middle of the map and disappearing, which is not an exit
  let inland = 0;
  for (let i = 0; i < N; i++) {
    if (!exits[i]) continue;
    const x = i % W;
    const y = (i / W) | 0;
    if (x >= EXIT_BAND && y >= EXIT_BAND && x < W - EXIT_BAND && y < H - EXIT_BAND) inland++;
  }
  say(inland === 0, `exit cells away from a border: ${inland}`);

  // NO GATE IS A SHORT CUT. A tributary's run is its own length plus what
  // is left of the trunk from the point it joins, so all three are
  // measured to the same place: the edge
  const trunkPath = paths[0].p;
  const runs = paths.map((r) => {
    if (r === paths[0]) return { id: r.id, len: r.p.length };
    const [ex, ey] = r.p.pts[r.p.pts.length - 1];
    let j = 0;
    for (let i = 1; i < trunkPath.pts.length; i++)
      if (Math.hypot(trunkPath.pts[i][0] - ex, trunkPath.pts[i][1] - ey) <
          Math.hypot(trunkPath.pts[j][0] - ex, trunkPath.pts[j][1] - ey)) j = i;
    return { id: r.id, len: r.p.length + (trunkPath.length - trunkPath.s[j]), join: j };
  });
  const lens = runs.map((r) => r.len);
  const spread = (Math.max(...lens) - Math.min(...lens)) / Math.min(...lens);
  say(
    spread <= 0.15,
    `gate runs to the edge: ${runs.map((r) => `${r.id} ${r.len.toFixed(0)}`).join(", ")} — spread ${(spread * 100).toFixed(0)}%`,
  );

  // EVERY WAY THROUGH IS A LANE WIDE. This is the rule the whole map is
  // laid out to, and it is not the same as "a route exists": a channel
  // pinched to nine cells by an islet is connected, passable, and no use
  // at all to something that has to fit down it. Measured as the widest
  // corridor that still joins a drop zone to an exit — clearance is the
  // distance to the nearest cell a unit cannot occupy, so twice it is the
  // width there — and reported per zone, because the fleet and the swarm
  // go through different holes.
  //
  // The floor is LANE - 1.5 rather than LANE: a 21-cell lane rasterised
  // off a disc stamp measures a shade under 21, and the chamfer transform
  // is another two percent under Euclid. A real pinch is nowhere near that
  // margin — the ones this caught were 2 and 3 cells wide.
  for (const [name, pass, bit] of [["swarm", open, 1], ["fleet", water, 4]]) {
    const dist = clearance(W, H, pass);
    for (const c of spawns) {
      if (c.zone !== (name === "swarm" ? "ground" : "water")) continue;
      const wide = widestRoute(W, H, dist, padsIn(c, pass), (i) => (exits[i] & bit) !== 0);
      say(wide >= LANE - 1.5, `${name} from (${c.x},${c.y}): widest way through ${wide.toFixed(1)} cells`);
    }
  }

  // the choke: wall the causeway between the crossroads and the base
  // island and no ground gate may still reach a ground exit
  const cut = new Uint8Array(N);
  const mid = { x: (IS.D.cx + IS.F.cx) / 2, y: (IS.D.cy + IS.F.cy) / 2 };
  let best = 0;
  for (let i = 1; i < trunkPath.pts.length; i++)
    if (Math.hypot(trunkPath.pts[i][0] - mid.x, trunkPath.pts[i][1] - mid.y) <
        Math.hypot(trunkPath.pts[best][0] - mid.x, trunkPath.pts[best][1] - mid.y)) best = i;
  const cutC = { x: trunkPath.pts[best][0], y: trunkPath.pts[best][1] };
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
  // about 25 degrees; a fan of three onto one outgoing direction cannot
  // make every arm one, which is why D is a crossroads and not a fork
  const head = (p, i) => Math.atan2(p.pts[i][1] - p.pts[i - 3][1], p.pts[i][0] - p.pts[i - 3][0]);
  for (const r of runs.slice(1)) {
    const p = paths.find((q) => q.id === r.id).p;
    const lean = Math.abs(((head(p, p.pts.length - 1) - head(trunkPath, r.join)) * 180) / Math.PI);
    console.log(`  -- ${r.id} meets the trunk at ${Math.min(lean, 360 - lean).toFixed(0)} degrees`);
  }

  // bends
  for (const r of paths) {
    const deg = r.p.sharpest();
    say(deg <= 26, `${r.id}: ${r.p.length.toFixed(0)} cells, sharpest turn ${deg.toFixed(0)} degrees`);
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
    let n = 0, gets = 0, sx = 0, sy = 0;
    for (let j = 0; j < N; j++) if (f[j]) {
      seenW[j] = 1; n++; sx += j % W; sy += (j / W) | 0;
      if (exits[j] & 4) gets++;
    }
    let far = -1, farx = -1;
    for (let j = 0; j < N; j++) if (f[j] && (j % W) > farx) { farx = j % W; far = j; }
    comps.push({ n, gets, x: (sx / n) | 0, y: (sy / n) | 0, ex: farx, ey: (far / W) | 0 });
  }
  comps.sort((a, b) => b.n - a.n);
  console.log(`  -- sea basins: ${comps.slice(0, 6).map((c) => `${c.n}@(${c.x},${c.y}) east tip (${c.ex},${c.ey})${c.gets ? `->${c.gets} exits` : " landlocked"}`).join(", ")}${comps.length > 6 ? ` (+${comps.length - 6} more)` : ""}`);

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

  // the base has to stand on road, or nothing can reach it
  let onRoadCells = 0;
  for (let y = BASE.y; y < BASE.y + BASE.size; y++)
    for (let x = BASE.x; x < BASE.x + BASE.size; x++) if (open(y * W + x)) onRoadCells++;
  say(onRoadCells === BASE.size * BASE.size, `base cells standing on road: ${onRoadCells}/25`);

  return fails;
};

// ---------- run ----------
const m = build();
const fails = check(m);

// the picture, if one was asked for — a map you cannot look at is a map
// you cannot judge, and every number above was chosen by looking
const PAL = {
  sea: [0x2a, 0x20, 0x44],
  ford: [0x60, 0x4b, 0x94],
  road: [0x35, 0x1f, 0x1b],
  spore: [0x70, 0x49, 0x87],
  rock: [0x92, 0x92, 0xa7],
};
const SC = 3;
const preview = () => png(W * SC, H * SC, (X, Y) => {
  const x = (X / SC) | 0;
  const y = (Y / SC) | 0;
  const i = y * W + x;
  if (m.exits[i] & 1) return [0xff, 0xc0, 0x40];
  if (m.exits[i] & 4) return [0x40, 0xd0, 0xff];
  if (x >= BASE.x && x < BASE.x + BASE.size && y >= BASE.y && y < BASE.y + BASE.size)
    return [0xff, 0xd3, 0x7f];
  if (!m.blocked[i]) return m.floor[i] === FLOOR_TAINTED ? PAL.ford : PAL.road;
  if (m.wall[i] === WALL_DEEP) return PAL.sea;
  return m.wall[i] >= WALL_DACITE ? PAL.rock : PAL.spore;
});
if (process.argv[3]) {
  writeFileSync(process.argv[3], preview());
  console.log(`  preview -> ${process.argv[3]}`);
}

if (fails.length && !process.env.FORCE) {
  // The preview is still written either way, and FORCE=1 writes the
  // document too — for looking at a failure in the editor, never for
  // shipping one.
  console.log(`\nREFUSING TO WRITE: ${fails.length} check(s) failed (FORCE=1 to write anyway)`);
  process.exit(1);
}

const doc = {
  id: "quagmire",
  name: "Quagmire",
  w: W,
  base: { x: BASE.x, y: BASE.y },
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
