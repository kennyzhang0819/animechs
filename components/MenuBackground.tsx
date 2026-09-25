"use client";

import { useEffect, useRef } from "react";
import { buildAtlas } from "@/game/atlas";
import { CELL, clamp, COLS } from "@/game/constants";
import { terrainFromMap, type MapData } from "@/game/maps";
import { generateRandomMap, rollMapSeed } from "@/game/mapgen";
import type { MapgenReply, MapgenRequest } from "@/game/mapgen.worker";
import { Renderer } from "@/game/renderer";
import { isWaterFloor, type Terrain } from "@/game/terrain";
import { PROP_KINDS } from "@/game/propArt";

/**
 * THE MENU'S GROUND — a board rolled the way a run rolls its own, with
 * nothing standing on it and nothing happening.
 *
 * It is the real terrain: a map the game's own generator drew from a seed,
 * carved by the game's own terrainFromMap and drawn by the game's own WebGL
 * renderer, so the rock, the grass, the trees and the moving sea behind the
 * title are the ones a run is played over. What it is NOT any more is a game. It USED to
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
 * framing dead still for SHOT_HOLD seconds, then the next one dissolves in
 * over SHOT_FADE: the outgoing picture is copied to a canvas over the
 * ground and faded out over the new framing, never through black. It
 * never pans, because ground sliding under a menu nobody is reading it
 * through is a distraction rather than an atmosphere. After SHOTS_PER_MAP
 * of them the next map is carved, under the copy.
 *
 * WHERE IT LOOKS is chosen off the ground itself (`shotsFor`): the country
 * is scored in coarse buckets by how much is IN them — trees and boulders,
 * shoreline, and the edges where rock meets floor — and the shots are the
 * best few buckets, kept well apart. A map is mostly open ground, and a
 * camera dropped at random lands on it; this one lands on a wooded shore or
 * a pass through the rock. Each shot rolls its own height as well, so one
 * is a valley and the next is close enough to read the bark on the pines.
 *
 * THE ROLL IS OFF THE PAGE'S THREAD (mapgen.worker.ts): a board is about a
 * second to draw, and the next one is rolled while the current one is
 * shown, so a map change costs the menu nothing. Without workers it is
 * rolled here, under the black.
 *
 * WHAT IT MUST NEVER DO is compete with the menu on top of it. The wash
 * (`dim`) is the contract: the title card sits under a light one, and the
 * deeper menus, which are lists of cards to read, pull it darker. It holds
 * still under prefers-reduced-motion — one shot, drawn once and left — and
 * stops dead when the tab is hidden or when something opaque is standing
 * over it (`hidden`), which is what keeps a walk to the progress board and
 * back from costing anything at all.
 */

/** seconds one framing is held, and seconds the next dissolves in over */
const SHOT_HOLD = 11;
const SHOT_FADE = 1.2;
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
 * as in place. It sits a little above the height a RUN is played at — the
 * art is drawn for an eight-pixel cell, and blowing one up far past that
 * turns a map into a soft brown wash with the filtering doing all the work.
 */
const ACROSS_MIN = 72;
const ACROSS_MAX = 120;
/** and the limits on a cell, so neither end is a mush or a mosaic */
const CELL_PX_MIN = 6;
const CELL_PX_MAX = 14;

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

  for (const p of t.props) {
    const half = (PROP_KINDS[p.kind]?.tiles ?? 1) / 2;
    score[at(p.x + half, p.y + half)] += W_PROP;
  }
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
  /** the outgoing shot, held while the next dissolves in under it */
  const holdRef = useRef<HTMLCanvasElement>(null);
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
    const held = holdRef.current;
    const heldCtx = held?.getContext("2d");
    if (!canvas || !wash || !held || !heldCtx) return;

    let alive = true;
    let raf = 0;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");

    let renderer: Renderer | null = null;
    let terrain: Terrain | null = null;
    let rng = mulberry32((Math.random() * 0x7fffffff) | 0);

    // the board waiting to be shown next, rolled while this one is up
    let rolled: MapData | null = null;
    let rolling = false;
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("../game/mapgen.worker.ts", import.meta.url), { type: "module" });
      worker.addEventListener("message", (e: MessageEvent<MapgenReply>) => {
        rolling = false;
        rolled = e.data.doc;
      });
      worker.addEventListener("error", () => {
        worker?.terminate();
        worker = null;
        rolling = false;
      });
    } catch {
      worker = null;
    }
    const roll = (): void => {
      if (rolled || rolling) return;
      const seed = rollMapSeed();
      if (worker) {
        rolling = true;
        worker.postMessage({ seed } satisfies MapgenRequest);
      } else rolled = generateRandomMap(seed).doc;
    };
    roll();

    /** the framings left on the map being shown, and the one on screen */
    let shots: Shot[] = [];
    let shot: Shot | null = null;
    /** the held copy of the last shot, 1 opaque to 0 gone */
    let cross = 0;
    /** seconds left on the shot */
    let hold = 0;
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
      const doc = rolled;
      rolled = null;
      roll();
      if (!doc || !renderer) return;
      rng = mulberry32((Math.random() * 0x7fffffff) | 0);
      terrain = terrainFromMap(doc);
      // NO BASE, NO SPAWN PADS, NO RAILS: the core is a building, the
      // pads are an authoring mark and a rail bed is a mission saying
      // where its body walks — the menu shows COUNTRY. The ground, its
      // rock and its props are all a map is here
      renderer.rebuildTerrain(
        { terrain },
        { wall: true, props: true, spawn: false, rails: false, base: false, mark: false },
      );
      shots = shotsFor(terrain, rng);
    };

    /** the next framing, taking the next map when this one is spent */
    const nextShot = (): void => {
      if (shots.length === 0) nextMap();
      shot = shots.shift() ?? null;
      hold = SHOT_HOLD;
      drawn = false;
    };
    /** is there a next framing to go to right now? */
    const nextReady = (): boolean => shots.length > 0 || rolled !== null;

    const draw = (s: Shot, t: Terrain, r: Renderer, now: number, dpr: number, vw: number): void => {
      const cellPx = clamp(vw / s.across, CELL_PX_MIN, CELL_PX_MAX);
      // a slow breath on the zoom, so a still camera is never quite still
      const k = (cellPx / CELL) * (1 + Math.sin(now / 14000) * 0.04) * dpr;
      // THE VIEW STAYS ON THE MAP. The world ends in rock and darkness, so
      // a sliver of void past it would read as a hole rather than as an
      // edge — where the map is narrower than the view, it is centred
      const halfW = canvas.width / (2 * k);
      const halfH = canvas.height / (2 * k);
      const worldW = t.cols * CELL;
      const worldH = t.rows * CELL;
      const cx = worldW > halfW * 2 ? clamp(s.x, halfW, worldW - halfW) : worldW / 2;
      const cy = worldH > halfH * 2 ? clamp(s.y, halfH, worldH - halfH) : worldH / 2;
      // kPx 1 makes `zoom` device px per world px outright, and the offset
      // is what puts the camera's point in the middle of the canvas
      r.renderTerrain(k, canvas.width / 2 - cx * k, canvas.height / 2 - cy * k, 1);
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
        held.width = bw;
        held.height = bh;
        // a held copy at the old size would smear; it is simply dropped
        cross = 0;
        resized = true;
      }

      // the first shot is taken the frame the first roll lands
      if (!shot) {
        if (!rolled) return;
        nextShot();
        if (!shot) return;
      }

      // THE CLOCK ONLY RUNS WHEN THE GROUND CAN BE SEEN. A still page takes
      // its one shot and keeps it; a covered one is frozen where it stands,
      // so the progress board hands the menu back exactly the picture it
      // took away
      let change = false;
      if (!still.matches && !hiddenRef.current) {
        if (cross > 0) cross = Math.max(0, cross - dt / SHOT_FADE);
        hold -= dt;
        // the change waits for the next framing to be ready rather than
        // going anywhere through black
        if (hold <= 0 && nextReady()) change = true;
      }

      const s = shot;
      // a still page draws until it is up and then leaves the canvas alone;
      // a covered one draws nothing at all
      if (s && terrain && renderer && !hiddenRef.current && (!still.matches || !drawn || resized)) {
        drawn = true;
        draw(s, terrain, renderer, now, dpr, vw);
        // THE DISSOLVE: the picture just drawn is copied over the ground
        // (the GL buffer is only good until this task ends, so the copy is
        // taken here, in the same frame) and the next framing is drawn
        // under it; the copy then fades out over SHOT_FADE
        if (change) {
          heldCtx.drawImage(canvas, 0, 0);
          cross = 1;
          nextShot();
          if (shot && terrain) draw(shot, terrain, renderer, now, dpr, vw);
        }
      }

      held.style.opacity = String(cross);
      wash.style.opacity = String(clamp(dimRef.current, 0, 1));

      // THE PAGE IS SHOWN WHEN THE GROUND IS — not when the map is merely
      // carved: reporting any earlier would hand the menu a screen of
      // black that fills in later, which is the thing the boot screen
      // exists to stop
      if (drawn) report();
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
      worker?.terminate();
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden="true">
      <canvas ref={ref} className="block h-full w-full" />
      {/* the outgoing shot, dissolving over the ground */}
      <canvas ref={holdRef} className="absolute inset-0 h-full w-full" style={{ opacity: 0 }} />
      {/* the wash: one div rather than a fill on the canvas, so the menu's
          own dim never involves the renderer */}
      <div ref={washRef} className="absolute inset-0 bg-black" style={{ opacity: 0 }} />
      {/* the vignette: the corners fall away so the eye lands on the middle
          of the screen, where the title and the buttons are */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
