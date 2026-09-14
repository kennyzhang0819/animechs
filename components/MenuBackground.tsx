"use client";

import { useEffect, useRef } from "react";
import { buildAtlas } from "@/game/atlas";
import { CELL, clamp, COLS } from "@/game/constants";
import { loadMap, terrainFromMap } from "@/game/maps";
import { Renderer } from "@/game/renderer";
import { isWaterFloor, type Terrain } from "@/game/terrain";

/**
 * THE MENU'S GROUND — the campaign's own country, with nothing standing on
 * it and nothing happening.
 *
 * It is the real terrain: a campaign map's document, carved by the game's
 * own terrainFromMap and drawn by the game's own WebGL renderer, so the
 * rock, the grass, the trees and the moving sea behind the title are the
 * ones a run is played over. What it is NOT any more is a game. It USED to
 * be a live Sim — a whole level, waves and all, with a line of turrets laid
 * down by a builder of its own and twenty-four seconds of fighting stepped
 * behind a black screen before the menu was uncovered — and it cost what a
 * game costs: several seconds to stand up, spent again from nothing every
 * time the player stepped off the menu and back, with the page hitching
 * while it happened. A picture behind a list of buttons is not worth a sim.
 * So there is no sim: a scene is one array copy and one batch upload, a
 * couple of dozen milliseconds, and a frame of it is the ground and the sea
 * and nothing else.
 *
 * A SCENE IS A SHOT, AND A MAP IS A HANDFUL OF THEM. The camera holds one
 * framing dead still for SHOT_HOLD seconds, dips to black over SHOT_FADE,
 * moves while nothing can be seen and comes back up somewhere else — it
 * never pans, because ground sliding under a menu nobody is reading it
 * through is a distraction rather than an atmosphere. After SHOTS_PER_MAP
 * of them the next map is carved, under the same black.
 *
 * WHERE IT LOOKS is chosen off the ground itself (`shotsFor`): the country
 * is scored in coarse buckets by how much is IN them — trees and boulders,
 * shoreline, and the edges where rock meets floor — and the shots are the
 * best few buckets, kept well apart. A map is mostly open ground, and a
 * camera dropped at random lands on it; this one lands on a wooded shore or
 * a pass through the rock. Each shot rolls its own height as well, so one
 * is a valley and the next is close enough to read the bark on the pines.
 *
 * WHAT IT MUST NEVER DO is compete with the menu on top of it. The wash
 * (`dim`) is the contract: the title card sits under a light one, and the
 * deeper menus, which are lists of cards to read, pull it darker. It holds
 * still under prefers-reduced-motion — one shot, drawn once and left — and
 * stops dead when the tab is hidden or when something opaque is standing
 * over it (`hidden`), which is what keeps a walk to the progress board and
 * back from costing anything at all.
 */

/**
 * The campaign's own fronts, in world order (WORLDS in levels.ts) — every
 * map a run is actually played on, and nothing else. The editor's
 * references and the imported Mindustry maps are left out: no world plays
 * them, so no menu shows them.
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

/** seconds one framing is held, and the black it is changed through */
const SHOT_HOLD = 11;
const SHOT_FADE = 0.7;
/** framings taken off one map before the next one is carved */
const SHOTS_PER_MAP = 3;

/** the scoring buckets, in cells — a shot is about one bucket wide */
const BUCKET = 10;
/**
 * The least distance between two shots on the same map, in buckets. Two
 * framings a bucket apart are the same picture twice, and the black
 * between them reads as a glitch rather than as a change of view.
 */
const SHOT_APART = 4;

/**
 * How much of the map one framing shows, across. The range is the point: a
 * shot rolls its own height inside it, so the scenes differ in scale as well
 * as in place. It stays near the height a RUN is played at, though — the art
 * is drawn for an eight-pixel cell, and blowing one up to four times that
 * turns a map into a soft brown wash with the filtering doing all the work.
 */
const ACROSS_MIN = 36;
const ACROSS_MAX = 60;
/** and the limits on a cell, so neither end is a mush or a mosaic */
const CELL_PX_MIN = 12;
const CELL_PX_MAX = 28;

/**
 * What one thing on the ground is worth when a bucket is scored. Every one
 * of them is an EDGE or an OBJECT, never a count of some kind of cell: a
 * first pass paid per water cell and the camera went straight to the middle
 * of the sea, which scores enormously and is a texture rather than a place.
 * Open ground and open water are worth nothing here, and that is right —
 * what makes a framing is where one thing stops and another starts.
 */
const W_PROP = 3;
const W_EDGE = 0.5;
const W_SHORE = 0.5;

const mulberry32 = (seed: number) => (): number => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** one framing: where the camera stands, and how much it takes in */
interface Shot {
  x: number;
  y: number;
  across: number;
}

/**
 * THE FEW PLACES ON THIS MAP WORTH LOOKING AT.
 *
 * Everything is counted into buckets ten cells across, weighted by what it
 * is: a tree or a boulder is the most a bucket can hold (it is the thing
 * that makes ground read as country rather than as texture), and after that
 * it is LINES — a cell with rock on one side and floor on the other, or
 * water on one side and land on the other. A cliff, a pass, a bay, a
 * shore. What is never counted is the ground itself: the middle of the sea
 * and the middle of a plain are both enormous and both nothing to look at.
 *
 * The best buckets are then taken in order, each one refusing any that
 * lands within SHOT_APART of one already taken, so the shots of a map are
 * spread across it instead of being three views of its one wooded corner.
 * ONLY THE MAP'S OWN GROUND IS SCORED: every document is lifted onto the
 * full grid and padded with rock (terrainFromMap), and that apron is
 * scaffolding for the arrays rather than country to look at.
 */
function shotsFor(t: Terrain, rng: () => number): Shot[] {
  const bx = Math.max(1, Math.ceil(t.cols / BUCKET));
  const by = Math.max(1, Math.ceil(t.rows / BUCKET));
  const score = new Float32Array(bx * by);
  /** cells in each bucket that something could stand on, and cells in all */
  const open = new Float32Array(bx * by);
  const cells = new Float32Array(bx * by);
  const at = (gx: number, gy: number): number =>
    clamp((gy / BUCKET) | 0, 0, by - 1) * bx + clamp((gx / BUCKET) | 0, 0, bx - 1);

  for (const p of t.pines) score[at(p.x / CELL, p.y / CELL)] += W_PROP;
  for (const p of t.decor) score[at(p.x / CELL, p.y / CELL)] += W_PROP;
  for (let gy = 0; gy < t.rows; gy++)
    for (let gx = 0; gx < t.cols; gx++) {
      const i = gy * COLS + gx;
      // an edge: this cell and the one east or south of it disagree, either
      // about whether anything can walk there (a cliff, a pass) or about
      // whether it is water (a shore). Both are looked for the same way, so
      // the score of a bucket is the length of the lines running through it
      const b = t.blocked[i] !== 0;
      const w = isWaterFloor(t.floor[i]);
      cells[at(gx, gy)] += 1;
      if (!b) open[at(gx, gy)] += 1;
      if (gx + 1 < t.cols) {
        if (b !== (t.blocked[i + 1] !== 0)) score[at(gx, gy)] += W_EDGE;
        if (w !== isWaterFloor(t.floor[i + 1])) score[at(gx, gy)] += W_SHORE;
      }
      if (gy + 1 < t.rows) {
        if (b !== (t.blocked[i + COLS] !== 0)) score[at(gx, gy)] += W_EDGE;
        if (w !== isWaterFloor(t.floor[i + COLS])) score[at(gx, gy)] += W_SHORE;
      }
    }

  // AND THEN HOW MUCH OF IT IS SKY. The inside of a mountain is drawn
  // black (Mindustry's darkness pass), so a bucket can be all edge and all
  // rock and come out as a picture of nothing: every score is taken down by
  // the share of its bucket something could actually stand on
  for (let i = 0; i < score.length; i++)
    score[i] *= cells[i] > 0 ? open[i] / cells[i] : 0;

  // the buckets richest first, then thinned to the ones far enough apart
  const order = [...score.keys()].sort((a, b) => score[b] - score[a]);
  const taken: number[] = [];
  for (const i of order) {
    if (taken.length >= SHOTS_PER_MAP) break;
    const cx = i % bx;
    const cy = (i / bx) | 0;
    if (taken.some((j) => Math.hypot((j % bx) - cx, ((j / bx) | 0) - cy) < SHOT_APART)) continue;
    taken.push(i);
  }
  // a map with nothing on it at all still gets one shot: its middle
  if (taken.length === 0) taken.push(((by / 2) | 0) * bx + ((bx / 2) | 0));
  return taken.map((i) => ({
    x: ((i % bx) + 0.5) * BUCKET * CELL,
    y: (((i / bx) | 0) + 0.5) * BUCKET * CELL,
    across: ACROSS_MIN + rng() * (ACROSS_MAX - ACROSS_MIN),
  }));
}

export default function MenuBackground({
  /** the black wash over the ground, 0–1 */
  dim = 0.3,
  /**
   * Something opaque is standing over this — the progress board. The scene
   * is KEPT, exactly where it was, and simply not drawn: the whole reason
   * this component stays mounted behind those boards is that walking to one
   * and back used to throw the ground away and build another.
   */
  hidden = false,
  /**
   * Called ONCE, when the first shot is up and all the way out of its
   * black — the moment the ground behind the menu is a picture of the
   * country rather than a rectangle of nothing. The boot screen over the
   * whole page (Animechs) hangs on this, so it is also called when there
   * is never going to be a picture at all (no WebGL2, a sheet that would
   * not pack): a front of house nobody can uncover is worse than a black
   * one.
   */
  onReady,
}: {
  dim?: number;
  hidden?: boolean;
  onReady?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
  // read by the draw loop every frame: changing any of them only changes
  // the next frame, and none of them rebuilds anything
  const dimRef = useRef(dim);
  dimRef.current = dim;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    const canvas = ref.current;
    const wash = washRef.current;
    if (!canvas || !wash) return;

    let alive = true;
    let raf = 0;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");

    let renderer: Renderer | null = null;
    let terrain: Terrain | null = null;
    let rng = mulberry32((Math.random() * 0x7fffffff) | 0);

    // the maps in a fresh order every launch, walked in turn
    const order = MENU_MAPS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let cursor = 0;

    /** the framings left on the map being shown, and the one on screen */
    let shots: Shot[] = [];
    let shot: Shot | null = null;
    /** 1 is black, 0 is the ground at its own wash */
    let fade = 1;
    /** seconds left on the shot, and whether it is on its way out */
    let hold = 0;
    let leaving = false;
    /** has the shot on show been painted? */
    let drawn = false;
    /** onReady is a one-shot: the FIRST shot is the one the page waits on */
    let reported = false;
    const report = (): void => {
      if (reported) return;
      reported = true;
      readyRef.current?.();
    };

    /**
     * Carve the next map and hand it to the GPU. Both halves are a few
     * milliseconds on the arrays and one batch build — the whole reason
     * this is a picture and not a sim — and it happens under a full black
     * either way.
     */
    const nextMap = (): void => {
      const doc = loadMap(MENU_MAPS[order[cursor % order.length]]);
      cursor++;
      if (!doc || !renderer) return;
      rng = mulberry32((Math.random() * 0x7fffffff) | 0);
      terrain = terrainFromMap(doc);
      // NO BASE, NO SPAWN PADS: the core is a building and the pads are an
      // authoring mark, and the menu shows country. The ground, its rock
      // and its props are all a map is here
      renderer.rebuildTerrain({ terrain }, { wall: true, props: true, spawn: false, base: false });
      shots = shotsFor(terrain, rng);
    };

    /** the next framing, taking the next map when this one is spent */
    const nextShot = (): void => {
      if (shots.length === 0) nextMap();
      shot = shots.shift() ?? null;
      hold = SHOT_HOLD;
      leaving = false;
      drawn = false;
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

      // the official map documents are fetched by the shell around this
      // (Animechs), so the first shot is taken the frame they land
      if (!shot) {
        if (!loadMap(MENU_MAPS[order[0]])) return;
        nextShot();
        if (!shot) return;
      }

      // THE CLOCK ONLY RUNS WHEN THE GROUND CAN BE SEEN. A still page takes
      // its one shot and keeps it; a covered one is frozen where it stands,
      // so the progress board hands the menu back exactly the picture it
      // took away
      if (still.matches) fade = Math.max(0, fade - dt / SHOT_FADE);
      else if (!hiddenRef.current) {
        if (leaving) {
          fade = Math.min(1, fade + dt / SHOT_FADE);
          if (fade >= 1) nextShot();
        } else {
          fade = Math.max(0, fade - dt / SHOT_FADE);
          hold -= dt;
          if (hold <= 0) leaving = true;
        }
      }

      const s = shot;
      // a still page draws until it is up and then leaves the canvas alone;
      // a covered one draws nothing at all
      if (
        s &&
        terrain &&
        renderer &&
        !hiddenRef.current &&
        (!still.matches || !drawn || fade > 0 || resized)
      ) {
        drawn = true;
        const cellPx = clamp(vw / s.across, CELL_PX_MIN, CELL_PX_MAX);
        // a slow breath on the zoom, so a still camera is never quite still
        const k = (cellPx / CELL) * (1 + Math.sin(now / 14000) * 0.04) * dpr;
        // THE VIEW STAYS ON THE MAP. The world ends in rock and darkness, so
        // a sliver of void past it would read as a hole rather than as an
        // edge — where the map is narrower than the view, it is centred
        const halfW = canvas.width / (2 * k);
        const halfH = canvas.height / (2 * k);
        const worldW = terrain.cols * CELL;
        const worldH = terrain.rows * CELL;
        const cx = worldW > halfW * 2 ? clamp(s.x, halfW, worldW - halfW) : worldW / 2;
        const cy = worldH > halfH * 2 ? clamp(s.y, halfH, worldH - halfH) : worldH / 2;
        // kPx 1 makes `zoom` device px per world px outright, and the offset
        // is what puts the camera's point in the middle of the canvas
        renderer.renderTerrain(k, canvas.width / 2 - cx * k, canvas.height / 2 - cy * k, 1);
      }

      wash.style.opacity = String(clamp(dimRef.current + (1 - dimRef.current) * fade, 0, 1));

      // THE PAGE IS SHOWN WHEN THE GROUND IS — not when the map is merely
      // carved. A shot comes up under a full black and takes SHOT_FADE to
      // lift out of it, so reporting any earlier would hand the menu a
      // screen of black that fills in a second later, which is the thing
      // the boot screen exists to stop
      if (drawn && fade <= 0) report();
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
        last = performance.now();
        if (!document.hidden) raf = requestAnimationFrame(loop);
      })
      .catch(() => {
        // no ground to draw — say so rather than leave the page waiting on
        // a frame that will never come
        report();
      });

    // the tab going away stops the clock; coming back restarts it in place,
    // so a menu left open all afternoon costs nothing while unseen
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
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      // hand the GL context back: a renderer holds the atlas and the
      // terrain batches on the GPU
      canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      renderer = null;
      terrain = null;
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden="true">
      <canvas ref={ref} className="block h-full w-full" />
      {/* the wash: one div rather than a fill on the canvas, so a shot
          change can take the whole picture to black without the renderer
          knowing anything about it */}
      <div ref={washRef} className="absolute inset-0 bg-black" style={{ opacity: 1 }} />
      {/* the vignette: the corners fall away so the eye lands on the middle
          of the screen, where the title and the buttons are */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
