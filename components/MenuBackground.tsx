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
 * (see planSpots / placeOne): it traces the walkers' route down the flow
 * field from the drop zones to the core, and stands turrets off both
 * shoulders of that route — a burst of them before the scene is shown,
 * and one every so often after, which is also how the line is repaired as
 * the swarm chews through it. Building is free here (Sim.tech stays null,
 * as it does in the sandbox and the editors), because a menu has no run
 * and therefore no scrap.
 *
 * WHAT IT LOOKS AT. The camera picks the busiest patch of field — the
 * coarse bucket holding the most bodies, with a thumb on the scale for
 * buckets that hold turrets, so it prefers a fight to a crowd walking
 * through empty ground — and eases toward it. It never cuts.
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

/** turrets standing before the scene is shown, and the most it will hold */
const OPENING_TURRETS = 40;
const MAX_TURRETS = 70;
/** seconds between the placements that extend and repair the line */
const BUILD_EVERY = 0.8;
/** seconds between re-tracing the route — a line changes where the swarm walks */
const REPLAN_EVERY = 14;

/**
 * THE GUNS THE LINE IS BUILT FROM, and how often each turns up. It is a
 * spread rather than a best-of: a menu wants a duo's tracer, a ripple's
 * shells, an arc's lightning and a meltdown's beam all on screen at once,
 * which is what the weights buy. Scatter carries the weight it does
 * because it is the only cheap answer to a flare, and a background with
 * unanswered air in it is a background of things flying past.
 *
 * The tractor (parallax) and the naval turret (tsunami) sit it out: one
 * deals no damage and the other only reaches water.
 */
const GUNS: readonly { kind: TowerKind; weight: number }[] = [
  { kind: "duo", weight: 6 },
  { kind: "scatter", weight: 5 },
  { kind: "hail", weight: 3 },
  { kind: "scorch", weight: 3 },
  { kind: "arc", weight: 3 },
  { kind: "lancer", weight: 3 },
  { kind: "salvo", weight: 3 },
  { kind: "fuse", weight: 2 },
  { kind: "ripple", weight: 2 },
  { kind: "wave", weight: 1 },
  { kind: "swarmer", weight: 2 },
  { kind: "cyclone", weight: 2 },
  { kind: "spectre", weight: 1 },
  { kind: "meltdown", weight: 1 },
  { kind: "foreshadow", weight: 1 },
];
const GUN_TOTAL = GUNS.reduce((a, g) => a + g.weight, 0);

/** the camera's buckets, in cells — coarse enough that a fight fills one */
const BUCKET = 12;
const BUCKETS_X = Math.ceil(COLS / BUCKET);
const BUCKETS_Y = Math.ceil(ROWS / BUCKET);
/** seconds between the camera choosing where to look */
const LOOK_EVERY = 2.4;

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
    { wave: { dagger: 34, crawler: 22, ...when(air, { flare: 10 }) } },
    {
      wave: {
        dagger: 26, mace: 8, atrax: 14, nova: 8,
        ...when(air, { flare: 8, horizon: 4 }),
        ...when(water, { risso: 6 }),
      },
    },
    {
      wave: {
        dagger: 36, crawler: 30, mace: 10, spiroct: 6, pulsar: 6,
        ...when(air, { horizon: 6 }),
        ...when(water, { minke: 4 }),
      },
    },
    {
      wave: {
        dagger: 34, crawler: 26, mace: 10, fortress: 3, atrax: 10, spiroct: 5,
        nova: 8, pulsar: 6, quasar: 3,
        ...when(air, { flare: 10, horizon: 5, zenith: 3 }),
        ...when(water, { minke: 3, bryde: 2 }),
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
    waveGap: 9,
    script: menuScript(zones.has("air"), zones.has("water")),
  };
}

interface Spot {
  x: number;
  y: number;
}

/**
 * WHERE THE SWARM WILL WALK, read off the field it walks by: start at a
 * handful of drop-zone cells spread across the map's doors and follow the
 * flow field's own gradient to the core, sampling as you go. This is the
 * route in the strict sense — the same vectors the units will steer by —
 * so a turret stood beside it is a turret in the fight, whatever shape
 * the map is.
 */
function routePoints(sim: Sim, rng: () => number): { x: number; y: number; nx: number; ny: number }[] {
  const field = sim.field;
  const starts = field.spawnPts;
  const out: { x: number; y: number; nx: number; ny: number }[] = [];
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
      if (step % 4 === 0) out.push({ x, y, nx: -v.y, ny: v.x });
      x += v.x * CELL * 0.5;
      y += v.y * CELL * 0.5;
      const gx = clamp((x / CELL) | 0, 0, COLS - 1);
      const gy = clamp((y / CELL) | 0, 0, ROWS - 1);
      if (field.isGoal[gy * COLS + gx]) break;
    }
  }
  return out;
}

/**
 * Turret ground: STRONGPOINTS along the route, not a picket fence down
 * the whole of it.
 *
 * Seventy turrets spread evenly over a map this size is one gun every few
 * screens — which is what a first pass at this did, and it put the camera
 * on a crowd walking through empty ground about as often as on a fight.
 * A handful of clusters is both what a player actually builds and what a
 * background needs: somewhere for a wave to break.
 *
 * Each post takes a short run of the route and stands its guns off BOTH
 * shoulders, a couple of cells clear, so the lane through it stays open —
 * a line built ACROSS the road is a wall the swarm stops and chews, which
 * is a duller picture than one it has to walk past.
 *
 * The posts are interleaved rather than concatenated, so the opening
 * burst raises all of them a little instead of finishing the first two.
 */
function planSpots(sim: Sim, rng: () => number): Spot[] {
  const route = routePoints(sim, rng);
  if (route.length === 0) return [];
  const POSTS = 5;
  /** route samples either side of a post's centre */
  const SPAN = 5;
  const posts: Spot[][] = [];
  for (let p = 0; p < POSTS; p++) {
    const at = Math.floor(((p + 0.15 + rng() * 0.7) / POSTS) * route.length);
    const post: Spot[] = [];
    for (let i = Math.max(0, at - SPAN); i < Math.min(route.length, at + SPAN); i++) {
      const q = route[i];
      for (const side of [-1, 1]) {
        const off = (2.2 + rng() * 3.2) * CELL;
        post.push({ x: q.x + q.nx * side * off, y: q.y + q.ny * side * off });
      }
    }
    for (let i = post.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [post[i], post[j]] = [post[j], post[i]];
    }
    posts.push(post);
  }
  const spots: Spot[] = [];
  const longest = Math.max(...posts.map((p) => p.length));
  for (let i = 0; i < longest; i += 2)
    for (const post of posts) spots.push(...post.slice(i, i + 2));
  return spots;
}

function pickGun(rng: () => number): TowerKind {
  let r = rng() * GUN_TOTAL;
  for (const g of GUNS) {
    r -= g.weight;
    if (r <= 0) return g.kind;
  }
  return GUNS[0].kind;
}

/**
 * Stand one turret, at the next spot that will take one. A spot is spent
 * whether or not it worked — the ground may be rock, another turret, or
 * simply have somebody standing on it (Sim.canPlace refuses all three) —
 * and the caller re-plans when the list runs out.
 */
function placeOne(sim: Sim, spots: Spot[], rng: () => number): boolean {
  for (let tries = 0; tries < 32; tries++) {
    const s = spots.shift();
    if (!s) return false;
    const kind = pickGun(rng);
    const size = TOWERS[kind].size;
    const gx = Math.round(s.x / CELL - size / 2);
    const gy = Math.round(s.y / CELL - size / 2);
    if (sim.placeTower(gx, gy, kind) === "ok") return true;
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
    let spots: Spot[] = [];
    let buildT = 0;
    let replanT = 0;

    // the camera, in world px, and where it is easing to
    const cam = { x: 0, y: 0, tx: 0, ty: 0, look: 0 };
    let camReady = false;
    const score = new Float32Array(BUCKETS_X * BUCKETS_Y);
    const guns = new Float32Array(BUCKETS_X * BUCKETS_Y);
    let simAcc = 0;

    const worldW = (): number => (sim ? sim.terrain.cols * CELL : COLS * CELL);
    const worldH = (): number => (sim ? sim.terrain.rows * CELL : ROWS * CELL);

    /**
     * WHERE THE FIGHT IS: the coarsest possible answer, which is all a
     * camera needs. Bodies are counted into buckets a dozen cells across
     * and a bucket standing turrets counts for more, so the eye is taken
     * to a wave breaking on a line rather than to the biggest crowd —
     * which, early in a scene, is a crowd walking through empty ground.
     */
    const lookAt = (s: Sim): void => {
      score.fill(0);
      guns.fill(0);
      for (const t of s.towers) {
        const bx = clamp((t.gx / BUCKET) | 0, 0, BUCKETS_X - 1);
        const by = clamp((t.gy / BUCKET) | 0, 0, BUCKETS_Y - 1);
        guns[by * BUCKETS_X + bx] += 1;
      }
      for (let i = 0; i < s.n; i++) {
        const bx = clamp((s.upx[i] / (CELL * BUCKET)) | 0, 0, BUCKETS_X - 1);
        const by = clamp((s.upy[i] / (CELL * BUCKET)) | 0, 0, BUCKETS_Y - 1);
        score[by * BUCKETS_X + bx] += 1;
      }
      // a bucket holding both is a bucket where a wave is breaking on a
      // line, and one of those beats the biggest crowd on the map every
      // time — so where any exists, nothing else is even considered
      let contested = false;
      for (let i = 0; i < score.length; i++)
        if (score[i] > 0 && guns[i] > 0) {
          contested = true;
          break;
        }
      let best = -1;
      let bestAt = -1;
      for (let i = 0; i < score.length; i++) {
        if (score[i] === 0 || (contested && guns[i] === 0)) continue;
        const v = score[i] * (1 + Math.min(4, guns[i]) * 0.5);
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
      buildT -= dt;
      if (buildT <= 0) {
        buildT = BUILD_EVERY;
        if (s.towers.length < MAX_TURRETS && !placeOne(s, spots, rng)) replanT = 0;
      }
      replanT -= dt;
      if (replanT <= 0) {
        replanT = REPLAN_EVERY;
        spots = planSpots(s, rng);
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
          spots = planSpots(s, rng);
          // the opening line goes up on empty ground, where nothing can be
          // standing in the way of it — hence before a single sim step
          for (let i = 0; i < OPENING_TURRETS; i++)
            if (!placeOne(s, spots, rng)) {
              spots = planSpots(s, rng);
              if (!placeOne(s, spots, rng)) break;
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
      cam.look -= dt;
      if (cam.look <= 0 || !camReady) {
        cam.look = LOOK_EVERY;
        lookAt(s);
      }
      if (!camReady) {
        cam.x = cam.tx;
        cam.y = cam.ty;
        camReady = true;
      } else {
        // an exponential ease: a camera that never cuts, and never
        // arrives so slowly that it is always behind the fight
        const a = 1 - Math.exp(-dt / 1.4);
        cam.x += (cam.tx - cam.x) * a;
        cam.y += (cam.ty - cam.y) * a;
      }
      // THE VIEW STAYS ON THE MAP. The world ends in rock and darkness, so
      // a sliver of void past it would read as a hole rather than as an
      // edge — where the map is narrower than the view, it is centred
      const halfW = canvas.width / (2 * k);
      const halfH = canvas.height / (2 * k);
      cam.x = worldW() > halfW * 2 ? clamp(cam.x, halfW, worldW() - halfW) : worldW() / 2;
      cam.y = worldH() > halfH * 2 ? clamp(cam.y, halfH, worldH() - halfH) : worldH() / 2;
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

      wash.style.opacity = String(clamp(dimRef.current + (1 - dimRef.current) * fade, 0, 1));
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
