"use client";

import { useEffect, useRef } from "react";
import { buildAtlas } from "@/game/atlas";
import { CELL, clamp, COLS, ROWS, TOWERS, type ZoneKind } from "@/game/constants";
import type { LevelSpec, UnitKind } from "@/game/levels";
import { loadMap, spawnCirclesOf } from "@/game/maps";
import { Renderer } from "@/game/renderer";
import { Sim } from "@/game/sim";
import type { TowerKind } from "@/game/types";

/**
 * THE MENU'S GROUND — the game itself, playing behind the front of house.
 *
 * Nothing here is a picture of the game. It is a Sim (game/sim.ts) on one
 * of the campaign's own maps, stepped at the same fixed 1/60 the run is
 * stepped at and drawn by the same WebGL renderer the run is drawn by. So
 * the units walking the lane are the units a wave sends, steered by the
 * real flow field around the real rock; the turrets are real turrets,
 * placed on real ground, tracking and firing under the real fire loop;
 * and the smoke, the shells, the beams, the burning and the deaths are
 * the sim's own effects rather than a set of sprites drawn to look like
 * them. It USED to be a hand-drawn column of mechs marching down a
 * meandering lane over ground rolled by rules of its own — a diorama that
 * had to be kept in step with a game it shared no code with. This shares
 * all of it.
 *
 * WHO BUILDS THE LINE. Nobody is playing, so the background plays itself
 * (see planBuilds / formation): it traces the walkers' route down the
 * flow field from the drop zones to the core, picks a handful of
 * stretches of it, and lays a real formation on each — a wall screen
 * along the lane with ranks of guns racked up behind it, one kind to a
 * rank, flush, square to the lane. A burst of it goes up before the scene
 * is shown and one placement every so often after, which is also how the
 * line is repaired as the swarm chews through it. Building is free here
 * (Sim.tech stays null, as it does in the sandbox and the editors),
 * because a menu has no run and therefore no scrap.
 *
 * WHAT IT LOOKS AT. The camera scores the field in coarse buckets by
 * what is IN them — bodies, and the sim's own live effects, which is the
 * part that matters: a muzzle flash, a shell burst and a dying unit are
 * all effects, so the effect pool is a map of where something is
 * happening and a crowd walking through empty ground makes none of it.
 *
 * IT CUTS THERE, THROUGH BLACK — it does not pan. The camera holds one
 * shot dead still for SHOT_HOLD seconds, dips to black over SHOT_FADE,
 * moves while nothing can be seen, and comes back up somewhere else. It
 * USED to ease across the field on an exponential, which meant the
 * background was permanently sliding under a menu nobody was reading it
 * through: ground scrolling behind a list of cards is a distraction, and
 * a lane of mechs swimming sideways past the title is worse. A still
 * frame that changes is calm; a moving frame never is. A shot only
 * changes when the fight has actually moved (SHOT_MOVE) — the camera
 * would rather sit on a good one than cut to its neighbour.
 *
 * THE SCENES CYCLE: each campaign map gets its turn, held for SCENE_HOLD
 * seconds and then taken to black over SCENE_FADE. The next map is built
 * WHILE the screen is black, one piece of work per frame (see the task
 * queue in `startScene`), so carving a map and warming it up never lands
 * as one long freeze on a page whose buttons a player might be reaching
 * for.
 *
 * WHAT IT MUST NEVER DO is compete with the menu on top of it. The wash
 * (`dim`) is the contract: the title card sits under a light one, and the
 * deeper menus, which are lists of cards to read, pull it darker. It also
 * holds still under prefers-reduced-motion — the scene is built and
 * warmed, then frozen on one frame — and stops when the tab is hidden.
 */

/**
 * The campaign's own fronts, in world order (WORLDS in levels.ts) — every
 * map a run is actually played on, and nothing else. The editor's
 * references and the imported Mindustry maps are left out: no world plays
 * them, and some carry no drop zone at all, which is not a map a sim can
 * be built on.
 */
const MENU_MAPS = [
  "confluence",
  "maelstrom",
  "quagmire",
  "greenwood",
  "tundra",
  "crater",
  "shoals",
  "riverlands",
  "estuary",
] as const;

/** seconds one map is watched, and the black it is taken out through */
const SCENE_HOLD = 45;
const SCENE_FADE = 0.9;

/**
 * How much of the fight has already happened when a scene is uncovered.
 * A map that faded in on wave zero would show a minute of empty ground
 * before the first body arrived, so the sim is stepped this many seconds
 * behind the black — in chunks of PREWARM_CHUNK steps a frame, because
 * the point of doing it behind the black is to not freeze the page.
 */
const PREWARM = 24;
const PREWARM_CHUNK = 90;

// the sim's fixed step, and the catch-up cap — both exactly as Game runs
// them, so the menu's sim steps like a run's rather than in whatever
// quanta the display happens to offer
const SIM_DT = 1 / 60;
const SIM_STEPS_MAX = 3;

/**
 * Structures standing before the scene is shown, and the most it will
 * hold. Both count walls as well as guns — a screen is a placement like
 * any other — so the numbers are larger than the turret counts they
 * replaced without the field holding more guns.
 */
const OPENING_TURRETS = 95;
const MAX_TURRETS = 150;
/** seconds between the placements that extend and repair the line */
const BUILD_EVERY = 0.8;
/** the least time between two route traces, once a plan has been spent */
const REPLAN_EVERY = 5;

/**
 * WHAT A RANK IS MADE OF, split by footprint, because a rank is one kind
 * flush against itself and kinds of different sizes do not tile together.
 *
 * It is a spread rather than a best-of: a menu wants a duo's tracer, a
 * ripple's shells, an arc's lightning and a meltdown's beam on screen
 * over the course of a scene, so the list is wide and the dice are the
 * only thing choosing. Duo appears twice because a wall of duos is the
 * most recognisable thing anyone ever builds in this game.
 *
 * SCATTER IS THE AA and is written into the bastion by name rather than
 * rolled: it is the cheap answer to a flare, and a background with
 * unanswered air in it is a background of things flying past. The tractor
 * (parallax) and the naval turret (tsunami) sit it out — one deals no
 * damage and the other only reaches water.
 */
/** the ones: a firing line is ranks of these */
const LIGHT: readonly TowerKind[] = ["duo", "duo", "hail", "scorch", "arc"];
/** the twos: a block is a rectangle of these */
const MEDIUM: readonly TowerKind[] = ["salvo", "scatter", "lancer", "swarmer", "wave"];
/** the threes and fours a bastion is built around */
const HEAVY: readonly TowerKind[] = [
  "ripple",
  "cyclone",
  "fuse",
  "spectre",
  "meltdown",
  "foreshadow",
];
/**
 * THE SCREEN: the wall that stands between the swarm and the guns. Its
 * whole job is to be shot at, which is why a post wears one — a rank of
 * turrets with nothing in front of it is a rank that dies to the first
 * mace.
 */
const SCREENS: readonly TowerKind[] = [
  "copper-wall",
  "titanium-wall",
  "thorium-wall",
  "copper-wall-large",
  "titanium-wall-large",
  "thorium-wall-large",
];

/** the camera's buckets, in cells — coarse enough that a fight fills one */
const BUCKET = 12;
const BUCKETS_X = Math.ceil(COLS / BUCKET);
const BUCKETS_Y = Math.ceil(ROWS / BUCKET);
/**
 * ONE SHOT: how long the camera holds still on a patch of field, the
 * black it changes shot through (each way), and how soon it asks again
 * after a look that was not worth cutting for.
 */
const SHOT_HOLD = 9;
const SHOT_FADE = 0.32;
const SHOT_RETRY = 1.6;
/**
 * How far, in cells, the fight has to have moved before a cut is worth
 * making. A cut to the bucket next door reads as a glitch rather than as
 * a change of view, so under this the camera simply stays where it is.
 */
const SHOT_MOVE = BUCKET * 0.8;
/**
 * What one live effect is worth against one body when the camera scores a
 * patch of field. Well over one, on purpose: a bucket of effects is a
 * bucket where guns are firing and things are coming apart, and that is
 * the thing worth looking at.
 */
const FX_WEIGHT = 2.5;

/** roughly how many cells the viewport shows across, and the limits on a cell */
const CELLS_ACROSS = 46;
const CELL_PX_MIN = 13;
const CELL_PX_MAX = 30;

const mulberry32 = (seed: number) => (): number => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Wave = Partial<Record<UnitKind, number>>;
/** the group, but only where the map has a door for it (see menuSpec) */
const when = (open: boolean, w: Wave): Wave => (open ? w : {});

/**
 * THE MENU'S OWN WAVES — not a campaign script.
 *
 * A world's script opens with a handful of daggers and takes twenty
 * minutes to become a battle, which is the right shape for a run and the
 * wrong one for forty-five seconds of background. These four waves are
 * already a fight on the first one, and the mission is `survive`, so the
 * LAST of them is sent again and again a level tougher each time
 * (Sim.loadStep) for as long as the scene is up.
 *
 * A LAYER WITH NO DOOR IS NEVER SENT. A wave that asks for flyers on a
 * map with no air zone never finishes spawning and the script stalls
 * behind it, so what the map carries decides what the waves hold.
 */
function menuScript(air: boolean, water: boolean): LevelSpec["script"] {
  return [
    { wave: { dagger: 80, crawler: 60, ...when(air, { flare: 20 }) } },
    {
      wave: {
        dagger: 70, mace: 20, atrax: 34, nova: 18,
        ...when(air, { flare: 18, horizon: 8 }),
        ...when(water, { risso: 12 }),
      },
    },
    {
      wave: {
        dagger: 90, crawler: 70, mace: 24, spiroct: 14, pulsar: 14,
        ...when(air, { horizon: 14 }),
        ...when(water, { minke: 8 }),
      },
    },
    {
      wave: {
        dagger: 90, crawler: 66, mace: 26, fortress: 8, atrax: 26, spiroct: 12,
        nova: 18, pulsar: 14, quasar: 6,
        ...when(air, { flare: 24, horizon: 12, zenith: 6 }),
        ...when(water, { minke: 6, bryde: 4 }),
      },
    },
  ];
}

/** blocked is only read for pre-drop-zone documents, which are all gone */
const NO_MASK = new Uint8Array(0);

/**
 * The level this map is watched under. `survive` with a clock nothing will
 * ever run out, so the last wave repeats for the life of the scene.
 */
function menuSpec(mapId: string): LevelSpec {
  const doc = loadMap(mapId);
  // a document written before drop zones carried a numeric region, which
  // spawnCirclesOf reads as a ground door with an air twin beside it —
  // so that is what one is assumed to hold
  const zones: Set<ZoneKind> =
    doc?.spawns ?
      new Set(spawnCirclesOf(doc, NO_MASK).map((c) => c.zone))
    : new Set<ZoneKind>(["ground", "air"]);
  return {
    id: `menu-${mapId}`,
    name: "Attract",
    map: mapId,
    mission: { kind: "survive", minutes: 600 },
    waveGap: 7,
    script: menuScript(zones.has("air"), zones.has("water")),
  };
}

/** one placement in a formation's build order */
interface Build {
  gx: number;
  gy: number;
  kind: TowerKind;
}

/** a point on the walkers' route, with the direction they take through it */
interface RoutePt {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/**
 * WHERE THE SWARM WILL WALK, read off the field it walks by: start at a
 * handful of drop-zone cells spread across the map's doors and follow the
 * flow field's own gradient to the core, sampling as you go. This is the
 * route in the strict sense — the same vectors the units will steer by —
 * so a line stood beside it is a line in the fight, whatever shape the
 * map is.
 */
function routePoints(sim: Sim, rng: () => number): RoutePt[] {
  const field = sim.field;
  const starts = field.spawnPts;
  const out: RoutePt[] = [];
  if (starts.length === 0) return out;
  const LANES = 6;
  const v = { x: 0, y: 0 };
  for (let lane = 0; lane < LANES; lane++) {
    const at = Math.floor(((lane + rng()) / LANES) * starts.length) % starts.length;
    const cell = starts[at];
    let x = ((cell % COLS) + 0.5) * CELL;
    let y = (((cell / COLS) | 0) + 0.5) * CELL;
    for (let step = 0; step < 1500; step++) {
      field.sample(x, y, v);
      if (v.x === 0 && v.y === 0) break; // a dead end: nothing walks on from here
      if (step % 4 === 0) out.push({ x, y, dx: v.x, dy: v.y });
      x += v.x * CELL * 0.5;
      y += v.y * CELL * 0.5;
      const gx = clamp((x / CELL) | 0, 0, COLS - 1);
      const gy = clamp((y / CELL) | 0, 0, ROWS - 1);
      if (field.isGoal[gy * COLS + gx]) break;
    }
  }
  return out;
}

const pick = <T,>(list: readonly T[], rng: () => number): T =>
  list[Math.floor(rng() * list.length) % list.length];

/**
 * ONE STRONGPOINT, laid out the way a person lays one out.
 *
 * A player does not sprinkle turrets. They pick a stretch of lane, run a
 * WALL along it to eat the incoming fire, and rack the guns up behind it
 * in RANKS — a row of duos, another row of duos, a block of salvos, a
 * pair of heavies with a screen in front. Everything is one kind to a
 * row, everything is flush against its neighbour, and the whole thing is
 * square to the lane rather than to the compass.
 *
 * So that is what this builds. The lane's own direction at the post
 * decides the axis (snapped to the grid: a rank reads as a rank only when
 * it is straight), the caller says which shoulder, and the ranks are
 * stacked outwards from a couple of cells of clear ground — the screen
 * first, so it stands between the swarm and the guns, then the guns.
 *
 * Every cell is checked against the sim before it is queued, so a rank
 * that runs into rock is simply cut short there. A post that cannot fit
 * anything worth having is dropped and another stretch of lane is tried
 * (see planBuilds), which is why a formation never comes out as three
 * turrets in a puddle.
 */
function formation(sim: Sim, p: RoutePt, side: 1 | -1, rng: () => number): Build[] {
  // the axis, snapped to the grid — a rank is straight or it is not a rank
  const horizontal = Math.abs(p.dx) >= Math.abs(p.dy);
  const cx = clamp(Math.round(p.x / CELL), 0, COLS - 1);
  const cy = clamp(Math.round(p.y / CELL), 0, ROWS - 1);
  const out: Build[] = [];
  /** cells of open lane left in front of the screen */
  let depth = 3;

  /** one rank: `count` blocks of one kind, flush, centred on the post */
  const rank = (kind: TowerKind, count: number): void => {
    const s = TOWERS[kind].size;
    const first = -Math.floor(count / 2) * s;
    for (let i = 0; i < count; i++) {
      const along = first + i * s;
      // the footprint's top-left: outward is +depth on the near side and
      // -(depth + s - 1) on the far one, so both shoulders leave the same
      // gap of lane rather than one of them burying its screen in it
      const away = side > 0 ? depth : -(depth + s - 1);
      const gx = horizontal ? cx + along : cx + away;
      const gy = horizontal ? cy + away : cy + along;
      if (sim.canPlace(gx, gy, kind)) out.push({ gx, gy, kind });
    }
    depth += s;
  };

  // THE RANKS ARE CHOSEN FIRST so the screen in front can be cut to their
  // width — a wall that overhangs the guns it covers is wasted, and one
  // that falls short leaves an end open
  const ranks: { kind: TowerKind; count: number }[] = [];
  const shape = rng();
  if (shape < 0.42) {
    // A FIRING LINE: two ranks of ones, mostly the same gun twice
    const gun = pick(LIGHT, rng);
    const n = 6 + Math.floor(rng() * 4);
    ranks.push({ kind: gun, count: n });
    ranks.push({ kind: rng() < 0.65 ? gun : pick(LIGHT, rng), count: n });
  } else if (shape < 0.78) {
    // A BLOCK: a rectangle of 2x2s, two deep, with a rank of ones behind
    const gun = pick(MEDIUM, rng);
    const n = 3 + Math.floor(rng() * 2);
    ranks.push({ kind: gun, count: n });
    ranks.push({ kind: gun, count: n });
    ranks.push({ kind: pick(LIGHT, rng), count: n * 2 });
  } else {
    // A BASTION: a pair of heavies, a rank of AA behind them, and ones
    // behind that — the shape that goes up where a lane has to hold
    const big = pick(HEAVY, rng);
    ranks.push({ kind: big, count: 2 });
    ranks.push({ kind: "scatter", count: 2 });
    ranks.push({ kind: pick(LIGHT, rng), count: 4 + Math.floor(rng() * 3) });
  }

  const span = Math.max(...ranks.map((r) => r.count * TOWERS[r.kind].size));
  // most posts wear a screen; the odd bare gun line is what a player
  // leaves behind when the wave arrived before the walls did
  if (rng() < 0.8) {
    const wall = pick(SCREENS, rng);
    rank(wall, Math.ceil(span / TOWERS[wall].size));
  }
  for (const r of ranks) rank(r.kind, r.count);
  return out;
}

/**
 * THE LINE, as a build order: a handful of strongpoints along the route
 * rather than a picket fence down the whole of it.
 *
 * Turrets spread evenly over a map this size are one gun every few
 * screens — which is what a first pass at this did, and it put the camera
 * on a crowd walking through empty ground about as often as on a fight.
 * Clusters are both what a player actually builds and what a background
 * needs: somewhere for a wave to break.
 *
 * Posts are kept WHOLE in the queue rather than interleaved, so a burst
 * that runs out halfway down the list leaves finished formations and bare
 * ground rather than a scatter of singles everywhere.
 */
function planBuilds(sim: Sim, rng: () => number): Build[] {
  const route = routePoints(sim, rng);
  if (route.length === 0) return [];
  const POSTS = 4;
  /** a formation with fewer cells than this is a puddle, not a post */
  const WORTH = 10;
  const out: Build[] = [];
  for (let p = 0; p < POSTS; p++) {
    // each post owns a stretch of the route and picks its own spot in it,
    // so two posts never land on top of each other
    for (let tries = 0; tries < 6; tries++) {
      const at = Math.floor(((p + rng()) / POSTS) * route.length) % route.length;
      // BOTH SHOULDERS ARE LAID OUT AND THE BETTER ONE KEPT. One side of
      // a lane is often water or a cliff, and a formation that rolled
      // that side came out as the three cells of it that fitted — which
      // is exactly the scatter this is here to stop
      const a = formation(sim, route[at], 1, rng);
      const b = formation(sim, route[at], -1, rng);
      const built = a.length >= b.length ? a : b;
      if (built.length >= WORTH) {
        out.push(...built);
        break;
      }
    }
  }
  return out;
}

/**
 * Stand the next thing in the queue. A cell that will not take one is
 * dropped and the next tried — the ground may have been taken, or have
 * somebody standing on it (Sim.canPlace refuses both), and a rank with a
 * gap in it is what a line under fire looks like anyway.
 */
function placeNext(sim: Sim, queue: Build[]): boolean {
  for (let tries = 0; tries < 48; tries++) {
    const b = queue.shift();
    if (!b) return false;
    if (sim.placeTower(b.gx, b.gy, b.kind) === "ok") return true;
  }
  return false;
}

export default function MenuBackground({
  /** the black wash over the field, 0–1 */
  dim = 0.3,
  /** ambient effects, the settings switch — the field's own, not a copy */
  effects = true,
}: {
  dim?: number;
  effects?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
  // read by the draw loop every frame: changing either only changes the
  // next frame, and neither rebuilds anything
  const dimRef = useRef(dim);
  dimRef.current = dim;
  const fxRef = useRef(effects);
  const applyFx = useRef<((on: boolean) => void) | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const wash = washRef.current;
    if (!canvas || !wash) return;

    let alive = true;
    let raf = 0;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");

    let sim: Sim | null = null;
    let renderer: Renderer | null = null;
    let rng = mulberry32((Math.random() * 0x7fffffff) | 0);

    // the maps in a fresh order every launch, walked in turn
    const order = MENU_MAPS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let cursor = 0;

    /**
     * The scene's state machine. `build` runs the task queue a step a
     * frame behind a black screen; `run` is the scene on show, and its
     * clock is what SCENE_HOLD is measured against.
     */
    let phase: "idle" | "build" | "run" = "idle";
    let tasks: (() => void)[] = [];
    /** 1 is black, 0 is the scene at its own wash */
    let fade = 1;
    let held = 0;
    let leaving = false;
    /** has the scene on show been painted? — only a still page reads it */
    let drawn = false;

    // the line's builder
    let queue: Build[] = [];
    let buildT = 0;
    let replanT = 0;

    // the camera, in world px: where it is, the shot it is cutting to,
    // the hold left on the current one and the black it cuts through
    const cam = { x: 0, y: 0, tx: 0, ty: 0, hold: 0, black: 0, cutting: false };
    let camReady = false;
    const score = new Float32Array(BUCKETS_X * BUCKETS_Y);
    const guns = new Float32Array(BUCKETS_X * BUCKETS_Y);
    let simAcc = 0;

    const worldW = (): number => (sim ? sim.terrain.cols * CELL : COLS * CELL);
    const worldH = (): number => (sim ? sim.terrain.rows * CELL : ROWS * CELL);

    /**
     * WHERE THE FIGHT IS. Bodies are counted into buckets a dozen cells
     * across — and so are the sim's EFFECTS, which is the part that
     * matters: a muzzle flash, a shell burst, a death puff and a burning
     * body are all effects, so the effect pool is a direct map of where
     * something is happening. A crowd walking through empty ground makes
     * none of them.
     *
     * Standing guns get a small nudge on top, so that when the field IS
     * quiet the camera waits somewhere a wave will arrive rather than
     * somewhere it has already passed. An earlier version made guns a
     * hard requirement and it looked at a post with three stragglers
     * dying at it while eighty bodies walked a lane off screen.
     */
    const lookAt = (s: Sim): void => {
      score.fill(0);
      guns.fill(0);
      for (const t of s.towers) {
        // a wall is not a gun: a bucket holding nothing but a screen is a
        // bucket where nothing is being shot
        if (TOWERS[t.kind].wall) continue;
        const bx = clamp((t.gx / BUCKET) | 0, 0, BUCKETS_X - 1);
        const by = clamp((t.gy / BUCKET) | 0, 0, BUCKETS_Y - 1);
        guns[by * BUCKETS_X + bx] += 1;
      }
      for (let i = 0; i < s.n; i++) {
        const bx = clamp((s.upx[i] / (CELL * BUCKET)) | 0, 0, BUCKETS_X - 1);
        const by = clamp((s.upy[i] / (CELL * BUCKET)) | 0, 0, BUCKETS_Y - 1);
        score[by * BUCKETS_X + bx] += 1;
      }
      for (let e = 0; e < s.fxN; e++) {
        const bx = clamp((s.fxX[e] / (CELL * BUCKET)) | 0, 0, BUCKETS_X - 1);
        const by = clamp((s.fxY[e] / (CELL * BUCKET)) | 0, 0, BUCKETS_Y - 1);
        score[by * BUCKETS_X + bx] += FX_WEIGHT;
      }
      let best = -1;
      let bestAt = -1;
      for (let i = 0; i < score.length; i++) {
        if (score[i] === 0) continue;
        const v = score[i] * (1 + Math.min(4, guns[i]) * 0.3);
        if (v > best) {
          best = v;
          bestAt = i;
        }
      }
      // an empty field (the gap before the first wave) has nothing to look
      // at but the thing the swarm is coming for
      if (bestAt < 0) {
        cam.tx = s.core.x;
        cam.ty = s.core.y;
        return;
      }
      cam.tx = ((bestAt % BUCKETS_X) + 0.5) * BUCKET * CELL;
      cam.ty = (((bestAt / BUCKETS_X) | 0) + 0.5) * BUCKET * CELL;
    };

    /** the sim and the builder, one step of dt */
    const advance = (dt: number): void => {
      const s = sim;
      if (!s) return;
      replanT -= dt;
      buildT -= dt;
      if (buildT <= 0) {
        buildT = BUILD_EVERY;
        // A PLAN IS FINISHED BEFORE ANOTHER IS DRAWN UP. Replacing the
        // queue on a timer left every post half-built — a rank of three
        // duos and a wall going nowhere — because a placement a second
        // never gets through a hundred-cell plan in fourteen seconds. A
        // fresh route is only traced once the last one is spent, and the
        // route HAS changed by then: what was built on it changed it
        if (s.towers.length < MAX_TURRETS && !placeNext(s, queue) && replanT <= 0) {
          queue = planBuilds(s, rng);
          replanT = REPLAN_EVERY;
        }
      }
      s.update(dt);
    };

    /**
     * Everything a scene costs, one item per frame. The screen is black
     * for the whole queue, so carving a map, uploading its terrain and
     * running two dozen seconds of sim never lands as a single freeze —
     * the menu's own buttons stay live throughout.
     */
    const startScene = (): void => {
      const mapId = MENU_MAPS[order[cursor % order.length]];
      cursor++;
      rng = mulberry32((Math.random() * 0x7fffffff) | 0);
      tasks = [
        () => {
          const spec = menuSpec(mapId);
          if (sim) sim.loadLevel(spec);
          else sim = new Sim(spec);
          sim.setEffects(fxRef.current);
        },
        () => {
          renderer?.rebuildTerrain(sim!);
        },
        () => {
          const s = sim!;
          // THE OPENING LINE goes up on empty ground, where nothing can be
          // standing in the way of it — hence before a single sim step.
          // Plans are built OUT, not counted out: a post is worth having
          // whole, so the round ends when the plan is spent and another
          // is drawn up only if the field is still thin
          queue = [];
          for (let round = 0; round < 3 && s.towers.length < OPENING_TURRETS; round++) {
            if (queue.length === 0) queue = planBuilds(s, rng);
            if (queue.length === 0) break;
            while (s.towers.length < OPENING_TURRETS && placeNext(s, queue));
          }
          buildT = BUILD_EVERY;
          replanT = REPLAN_EVERY;
          camReady = false;
          drawn = false;
        },
      ];
      for (let done = 0; done < PREWARM / SIM_DT; done += PREWARM_CHUNK)
        tasks.push(() => {
          for (let i = 0; i < PREWARM_CHUNK; i++) advance(SIM_DT);
        });
      phase = "build";
      held = 0;
      leaving = false;
      simAcc = 0;
    };

    /** the camera's own state, once the scene it is looking at exists */
    const aimCamera = (dt: number, k: number): void => {
      const s = sim;
      if (!s) return;
      // THE VIEW STAYS ON THE MAP. The world ends in rock and darkness, so
      // a sliver of void past it would read as a hole rather than as an
      // edge — where the map is narrower than the view, it is centred.
      // Both the shot on screen and the one being cut to are held to it,
      // so a target that clamps back onto the current shot is correctly
      // read as no move at all rather than as a cut worth making
      const halfW = canvas.width / (2 * k);
      const halfH = canvas.height / (2 * k);
      const onMap = (p: { x: number; y: number }): void => {
        p.x = worldW() > halfW * 2 ? clamp(p.x, halfW, worldW() - halfW) : worldW() / 2;
        p.y = worldH() > halfH * 2 ? clamp(p.y, halfH, worldH() - halfH) : worldH() / 2;
      };

      if (!camReady) {
        // the first shot of a scene is set behind the scene's own black,
        // so it costs nothing to take it outright
        lookAt(s);
        cam.x = cam.tx;
        cam.y = cam.ty;
        cam.hold = SHOT_HOLD;
        cam.black = 0;
        cam.cutting = false;
        camReady = true;
      } else if (cam.cutting) {
        cam.black += dt / SHOT_FADE;
        if (cam.black >= 1) {
          // the move itself, made with nothing on screen to move
          cam.black = 1;
          cam.cutting = false;
          cam.hold = SHOT_HOLD;
          cam.x = cam.tx;
          cam.y = cam.ty;
        }
      } else {
        cam.black = Math.max(0, cam.black - dt / SHOT_FADE);
        cam.hold -= dt;
        if (cam.hold <= 0) {
          lookAt(s);
          const t = { x: cam.tx, y: cam.ty };
          onMap(t);
          cam.tx = t.x;
          cam.ty = t.y;
          // a scene already on its way out is not worth a cut: the black
          // it is leaving through would swallow the new shot anyway
          const moved = Math.hypot(cam.tx - cam.x, cam.ty - cam.y) >= SHOT_MOVE * CELL;
          cam.cutting = moved && !leaving;
          if (!cam.cutting) cam.hold = SHOT_RETRY;
        }
      }
      onMap(cam);
    };

    const frame = (now: number, dt: number): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vw = canvas.clientWidth;
      const vh = canvas.clientHeight;
      if (vw === 0 || vh === 0) return;
      const bw = Math.round(vw * dpr);
      const bh = Math.round(vh * dpr);
      let resized = false;
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
        resized = true;
      }

      if (phase === "idle") {
        // the official map documents are fetched by the shell around this
        // (MechSwarm), so the first scene starts the frame they land
        if (loadMap(MENU_MAPS[order[0]])) startScene();
      } else if (phase === "build") {
        const task = tasks.shift();
        if (task) task();
        if (tasks.length === 0) {
          phase = "run";
          held = 0;
        }
      } else {
        // the sim runs in fixed quanta with real time banked between
        // frames, exactly as a run does — a hitch is paid back over the
        // next few frames rather than replayed at once
        if (!still.matches) {
          simAcc += Math.min(dt, 0.05);
          for (let i = 0; i < SIM_STEPS_MAX && simAcc >= SIM_DT; i++) {
            advance(SIM_DT);
            simAcc -= SIM_DT;
          }
          held += dt;
        }
      }

      // the black: full while a scene is being built, easing off as it
      // comes in and back on as it goes out
      if (phase !== "run") fade = 1;
      else if (leaving) fade = Math.min(1, fade + dt / SCENE_FADE);
      else fade = Math.max(0, fade - dt / SCENE_FADE);

      // a lost core is a scene that has nothing left to show: the swarm
      // stands on a dead building and the guns are gone. Leave early
      if (
        phase === "run" &&
        !leaving &&
        !still.matches &&
        (held >= SCENE_HOLD || (sim?.lost() ?? false))
      )
        leaving = true;
      if (leaving && fade >= 1) startScene();

      const s = sim;
      // a still page draws its one frame and then leaves the canvas alone
      // — the loop keeps turning only so the wash still answers the menu
      if (s && renderer && phase !== "build" && (!still.matches || !drawn || resized)) {
        drawn = true;
        const cellPx = clamp(vw / CELLS_ACROSS, CELL_PX_MIN, CELL_PX_MAX);
        // a slow breath on the zoom, so a still camera is never quite still
        const k = (cellPx / CELL) * (1 + Math.sin(now / 14000) * 0.04) * dpr;
        aimCamera(still.matches ? 0 : dt, k);
        // kPx 1 makes `zoom` device px per world px outright, and the
        // offset is what puts the camera's point in the middle of the
        // canvas (see the note over Renderer.render)
        renderer.render(s, k, canvas.width / 2 - cam.x * k, canvas.height / 2 - cam.y * k, 1);
      }

      // the wash carries both blacks — the scene change's and the cut's —
      // whichever is deeper, so a cut landing at the end of a scene never
      // lifts the black the scene is leaving through
      const dark = Math.max(fade, camReady ? cam.black : 0);
      wash.style.opacity = String(clamp(dimRef.current + (1 - dimRef.current) * dark, 0, 1));
    };

    let last = performance.now();
    const loop = (now: number): void => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      frame(now, dt);
    };

    // the atlas is packed once per page and shared with the game; without
    // WebGL2 there is no menu ground and no game either, so the wash is
    // simply left over black
    void buildAtlas()
      .then((atlas) => {
        if (!alive) return;
        renderer = new Renderer(canvas, atlas);
        renderer.setEffects(fxRef.current);
        last = performance.now();
        if (!document.hidden) raf = requestAnimationFrame(loop);
      })
      .catch(() => {});

    applyFx.current = (on: boolean) => {
      sim?.setEffects(on);
      renderer?.setEffects(on);
    };

    // the tab going away stops the clock; coming back restarts it in
    // place, so a menu left open all afternoon costs nothing while unseen
    const onVisibility = (): void => {
      cancelAnimationFrame(raf);
      if (!document.hidden && renderer) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      applyFx.current = null;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      // hand the GL context back: a renderer holds the atlas and the
      // terrain batches on the GPU
      canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      sim = null;
      renderer = null;
    };
  }, []);

  useEffect(() => {
    fxRef.current = effects;
    applyFx.current?.(effects);
  }, [effects]);

  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden="true">
      <canvas ref={ref} className="block h-full w-full" />
      {/* the wash: one div rather than a fill on the canvas, so a scene
          change can take the whole picture to black without the renderer
          knowing anything about it */}
      <div ref={washRef} className="absolute inset-0 bg-black" style={{ opacity: 1 }} />
      {/* the vignette: the corners fall away so the eye lands on the middle
          of the screen, where the title and the buttons are */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
