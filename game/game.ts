import { BUILD } from "./version";
import { atlasReady, buildAtlas } from "./atlas";
import {
  loadOfficialMaps,
  OFFICIAL_MAP_IDS,
  OFFICIAL_MAPS,
  paintThumb,
  refreshMap,
  SPAWN_STYLE,
} from "./maps";
import { SHIELD_TOWER_SIZE } from "./mutation";
import { towerBaseIcon, towerGhostIcon } from "./towerIcons";
import {
  CELL,
  clamp,
  COLS,
  H,
  ROWS,
  structStats,
  targetingLine,
  TOWERS,
  towerMaxHp,
  W,
} from "./constants";
import { loadBalanceDoc } from "./balance";
import {
  loadLevelDocs,
  UNIT_KINDS,
  unitName,
  type LevelSpec,
  type Mission,
  type TowerKind,
  type UnitKind,
} from "./levels";
import {
  MOD_ROLL_PRICE,
  missionXp,
  nextAmount,
  RELIC_ROLL_PRICE,
  scrapPriceOf,
  sellValue,
  TURRET_ROLL_PRICE,
  type BuyAmount,
} from "./economy";
import {
  anyModOpen,
  maskRarity,
  modsInMask,
  MOD_ODDS,
  rollMod,
  TURRET_MOD_IDS,
  type ModId,
} from "./mods";
import {
  anyRelicLeft,
  anyRelicOpen,
  RELIC_ODDS,
  rollRelic,
  shiftedWeights,
  type RelicId,
} from "./relics";
import {
  FORMATION_IDS,
  formationCells,
  formationSpan,
  nextFacing,
  rollFormation,
  type Facing,
  type FormationId,
} from "./formation";
import { RARITY, rollTurret, TURRET_ODDS, type RarityWeights } from "./rarity";
import {
  HEALTH_BARS_DEFAULT,
  STATUS_MARKS_DEFAULT,
  type HealthBarMode,
  type StatusMode,
  type TowerPlacement,
} from "./progress";
import { FIELDED_KINDS, isRetired, TOWER_KINDS } from "./types";
import { GAME_LAYERS, Renderer } from "./renderer";
import { fitZoom } from "./fit";
import { PICK_LENIENT, PICK_STRUCT_PAD, Sim } from "./sim";
import { type TechState } from "./tech";
import { isCore, type Structure, type Tower } from "./types";
import { statusSprite } from "./statusArt";
import {
  structFieldStatuses,
  structHasFieldStatus,
  structSelectionChips,
  unitFieldStatuses,
  unitHasFieldStatus,
  unitStatusChips,
  type StatusChip,
  type StatusId,
} from "./status";

/**
 * WHAT ONE OF THE TWO MODULE BUTTONS CAN DO RIGHT NOW: draw, or the reason
 * it cannot. The two reasons are genuinely different and the button has to
 * say which — "all owned" is a run that has taken everything there is, and
 * "locked" is a save the track has not dealt that category to yet (track.ts
 * MOD_UNLOCKS, RELIC_UNLOCKS, RELICS_FROM). A player told "all owned" on
 * their first run would be told a lie about their save.
 *
 * ONLY THE G BUTTON EVER READS "owned". A relic is held once and there are
 * fourteen, so the relic half runs out; a mod has no cap, so the M button is
 * OPEN or LOCKED and nothing else (Game.modDeal).
 */
export type DealHalf = "open" | "owned" | "locked";

/**
 * WHAT ONE PRESS OF M OR G HANDED OVER — the reveal's whole input
 * (Game.lastDraw). One press is one button, so a draw is all mods or all
 * relics; the tag is what lets the card say the right word and read the
 * right catalog.
 */
export type ModDraw =
  | { kind: "mod"; ids: readonly ModId[] }
  | { kind: "relic"; ids: readonly RelicId[] }
  | null;

export interface UiState {
  levelId: string;
  /** which tier of the ladder is being played (see ladder.ts) */
  tier: number;
  /** enemy level this tier carries — every unit's health x 1.06^level */
  enemyLevel: number;
  remaining: number;
  /** how many of each kind are on the field right now, like UNIT_KINDS */
  byKind: number[];
  /** every boss on the field, one thin HUD bar each, keyed by spawn id */
  bosses: { id: number; kind: UnitKind; hp: number; max: number }[];
  /** seconds until the next wave, or 0 while one is already coming in */
  nextWaveIn: number;
  /** seconds of simulated time since the run started (Sim.time) */
  elapsed: number;
  /** 1-based wave now on the field, out of how many the level holds */
  currentWave: number;
  totalWaves: number;
  /** the tower kind in hand, or null for the bare cursor */
  buildKind: TowerKind | null;
  /** the SHAPE the cursor is aiming (formation.ts) — null on a free
   *  board, where the command card picks a bare turret */
  buildForm: FormationId | null;
  /** ...and the quarter turns R has put on it (Game.buildFacing) */
  buildFacing: Facing;
  /** THE CARD THE RUN OWNS, bought and not yet placed, and how many
   *  copies of its shape it carries (the amount it was bought at). It
   *  outlives the aiming: a right click clears buildKind and leaves this
   *  standing, so the corner keeps drawing it and a click picks it back up */
  held: { kind: TowerKind; form: FormationId; n: number } | null;
  /** the demolish tool is picked: the next press sells instead of selecting */
  paused: boolean;
  /** the core is destroyed — the field is frozen behind the score screen */
  lost: boolean;
  /** the core's health pool (CORE_HP in constants.ts) — the run itself */
  coreHp: number;
  coreHpMax: number;
  /** the mission is met (Sim.won) — the success screen takes over */
  won: boolean;
  /** what this map asks (levels.ts): the HUD says it the way the deploy panel did */
  mission: Mission;
  /** seconds left on a survive mission's clock; 0 where there is no clock */
  timeLeft: number;
  kills: number;
  /** the esc game menu is up: sim held, resume or abandon from the overlay */
  menuOpen: boolean;
  /** simulation speed multiplier: one of SPEEDS */
  speed: number;
  /** is the drop-zone and air-route overlay on? */
  showRoutes: boolean;
  /**
   * THE RUN'S SCRAP (economy.ts): what is in hand to build with, or null
   * when building is free — a sandbox or an editor, where a counter would
   * be a number that means nothing
   */
  scrap: number | null;
  /** everything the run has taken in so far — drops and wave bonuses */
  scrapEarned: number;
  /** how many of the mission's waves are cleared — every body they sent is down */
  wavesCleared: number;
  /** the XP those cleared waves have banked so far, before the rung bonus */
  xp: number;
  /** what each turret costs to place right now, in scrap */
  prices: Record<TowerKind, number>;
  /** what each turret sells back for */
  refunds: Record<TowerKind, number>;
  /** live towers per kind, for the bar's standing-count badges */
  counts: Record<TowerKind, number>;
  /** the turrets the save may field; null = unrestricted (editor, sandbox) */
  unlocked: readonly TowerKind[] | null;
  /** is this board DEALT (a charged run) or PICKED (sandbox, editors)? —
   *  which of the two corners the overlay puts in the bottom right */
  dealing: boolean;
  /** what ONE draw off each of the three buttons costs right now — before
   *  the amount, which multiplies all three flat (economy.ts) */
  rollPrice: number;
  modPrice: number;
  relicPrice: number;
  /** how many a press buys: the corner's fourth button (BUY_AMOUNTS) */
  amount: BuyAmount;
  /**
   * WHAT THE RUN OWNS, IN TWO LISTS BECAUSE IT IS TWO CATEGORIES. The
   * shelf on the top-left of the field draws the relics first and then the
   * mods, with a divider between (components/Relics.tsx): a relic is a rule
   * always in force and a mod is a standing chance, and a row that mixed
   * them said neither.
   *
   * The mods carry a stack count and the relics do not, which is the
   * difference between the two spelled out in the shape of the data
   * (mods.ts, relics.ts).
   */
  shelfMods: { id: ModId; n: number }[];
  shelfRelics: RelicId[];
  /** everything the LAST PRESS drew (one id, or ten) and WHICH BUTTON drew
   *  it, plus a counter that MOVES on every press — the three things a
   *  reveal needs to fire, including for a repeat (Game.lastDraw) */
  lastDraw: ModDraw;
  modDraws: number;
  /** what each half of the catalog can do for this press — what lights
   *  the M button and the G button, and what each says when it cannot
   *  (Deal.tsx). The two halves are asked separately: a run that has taken
   *  every relic keeps buying mods */
  modDeal: DealHalf;
  relicDeal: DealHalf;
  /**
   * WHAT IS SELECTED ON THE BOARD, for the panel at the bottom of the
   * screen — null when nothing is.
   *
   * IT IS A SUMMARY AND NOT A LIST OF STRUCTURES. A marquee can take three
   * hundred turrets and the HUD is polled a few times a second; handing
   * React three hundred objects to diff, several times a second, to draw
   * one panel would be the most expensive thing on the screen. So the
   * whole selection is folded here into the four things the panel prints:
   * how many, what they are, what they have left, and which attributes are
   * among them.
   */
  inspect: {
    /** how many things are inspected — a marquee's whole catch, or the 1
     *  a tapped body always is */
    n: number;
    /** the turret they are, when they are all ONE kind — null for the
     *  core, for a mixed bag, and for a body, where a turret sprite would
     *  be a lie about the rest */
    kind: TowerKind | null;
    /** the BODY this is, when what was tapped is one of the swarm's —
     *  null for everything the player built. It is what puts an ironhide1's
     *  own picture over an ironhide1's name */
    unit: UnitKind | null;
    /** what to call it: the turret's name, the body's kind, "Core", or
     *  "Structures" */
    name: string;
    /** health, SUMMED over the selection — one bar for the whole thing,
     *  because "what is left of what I picked" is the question a player
     *  asks of a wall they just dragged a box over */
    hp: number;
    hpMax: number;
    /**
     * EVERYTHING TRUE OF IT RIGHT NOW (status.ts), catalog order, PLATING
     * FIRST. It is the same list, in the same order, drawn with the same
     * symbols, as the row the field stamps over the thing itself — so a
     * player who has learned the droplet over a walker reads it in the
     * panel without being taught twice.
     *
     * The plating that used to be a caption on the name line is the first
     * chip in here now. It was two numbers about damage on one line with
     * the health bar, and it read as part of the pool rather than as a
     * property of the thing.
     */
    statuses: StatusChip[];
    /** every attribute anything in the selection carries, catalog order,
     *  with HOW MANY of them carry it — the speckle, counted. One turret
     *  selected reads as a plain row of what that turret is */
    mods: { id: ModId; n: number }[];
  } | null;
  /** structures placed this run, only going up — the card layer watches it
   *  to know the card in hand has landed (see Game.built) */
  built: number;
  /** who each turret will shoot at, in the player's words — one line under
   *  the build card's description. It reads the turret's LIVE stats, so an
   *  arc with Ionised Air bought reads "ground and air" the moment it is */
  targeting: Record<TowerKind, string>;
}

export interface Stats {
  units: number;
  kills: number;
  simMs: number;
  fps: number;
  zoom: number;
}

/** the speeds the HUD toggle offers */
export const SPEEDS: readonly number[] = [1, 2, 4, 8, 16];

/** every turret's scrap price, read fresh so a dashboard edit shows at once */
const PRICES = (): Record<TowerKind, number> =>
  Object.fromEntries(TOWER_KINDS.map((k) => [k, scrapPriceOf(k)])) as Record<TowerKind, number>;
const REFUNDS = (): Record<TowerKind, number> =>
  Object.fromEntries(TOWER_KINDS.map((k) => [k, sellValue(k)])) as Record<TowerKind, number>;

/**
 * The multipliers a save has BEFORE the track hands it any — just the
 * pace the game runs at. 2x is a level reward (track.ts), so what a
 * player gets is read off their save (TechState.speeds) rather than
 * written here; 4x, 8x and 16x are sandbox tools and never earned.
 */
export const BASE_SPEEDS: readonly number[] = [1];

/**
 * The stages of starting a level, in order, as the loading screen reports
 * them. They are stages rather than a byte count on purpose: none of this
 * work streams, so a percentage would be invented. The bar advances a step
 * at a time and each step is honest about what is happening.
 */
export const LOAD_STEPS = ["sprites", "map", "world", "warmup"] as const;
export type LoadStep = (typeof LOAD_STEPS)[number];

export const LOAD_STEP_LABEL: Record<LoadStep, string> = {
  sprites: "Packing sprites",
  map: "Reading the map",
  world: "Carving terrain",
  warmup: "Warming up",
};

/**
 * THE STAGES OF STARTING THE GAME ITSELF, as the boot screen reports them.
 *
 * A level's steps (LOAD_STEPS) are about one map; these are about the page,
 * and everything on this list is paid ONCE for the whole session. They are
 * the work that has to be finished before the front of house is worth
 * showing at all:
 *
 *   sprites  the atlas — every sprite in the game cut, packed and drawn
 *            onto one sheet (atlas.ts). The one genuinely long step, and
 *            the thing every other step and every screen after it needs.
 *   maps     the documents that live outside the module graph and are
 *            fetched rather than imported: the official maps, the level
 *            scripts and the balance coefficients.
 *   warmup   the work that has to COMPILE or be CUT before a frame can be
 *            drawn — the turret pictures sliced out of the sheet for the
 *            build bar and the deploy screen, and the WebGL renderer
 *            itself: its context, its shader programs and the sheet
 *            uploaded as a texture, all of which happen the first time the
 *            menu's ground is drawn (MenuBackground). A run started from
 *            the menu therefore steps straight to reading its map.
 *
 * It exists because the title card used to come up over black and the
 * ground arrive under it seconds later, with the first press of Start
 * paying for the shaders all over again.
 */
export const BOOT_STEPS = ["sprites", "maps", "warmup"] as const;
export type BootStep = (typeof BOOT_STEPS)[number];

export const BOOT_STEP_LABEL: Record<BootStep, string> = {
  sprites: "Packing sprites",
  maps: "Reading the maps",
  warmup: "Warming up",
};

/**
 * Which step a cold start really begins at. Packing the sheet is the only
 * genuinely slow stage, and it happens once per page — so after the first
 * level the bar would sit at "Packing sprites" for a millisecond and then
 * leap, which reads as a stutter. Starting the bar past the finished work
 * instead makes a warm start look like what it is: nearly instant.
 */
export function firstLoadStep(): LoadStep {
  return atlasReady() ? "map" : "sprites";
}

/**
 * Give the browser a chance to actually paint before the next stage starts.
 *
 * Announcing a step is not the same as showing it: packing the sheet is one
 * unbroken ~200ms task, so without a yield here the loading screen would be
 * told about a step and then have the main thread taken away before it could
 * draw it — the label the player reads would always be one behind the work.
 * Two frames, because the first only lets React commit and the second is
 * where the commit reaches the screen.
 *
 * The escapes matter. requestAnimationFrame never fires in a hidden tab, so
 * a level started in a background tab would wait forever on a paint that
 * cannot happen — hence the up-front hidden check and the timeout behind it
 * for a tab that goes hidden mid-wait.
 */
function paint(): Promise<void> {
  if (document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(bail);
      resolve();
    };
    const bail = setTimeout(done, 250);
    requestAnimationFrame(() => requestAnimationFrame(done));
  });
}

// zoom 1 is "cover": the world fills the viewport completely, cropped on
// whichever axis overflows. It is where a run starts, but it is no longer
// the FLOOR — the camera keeps pulling back until the whole map is on
// screen with a margin of void around it. "How does my line look against
// the whole map" is a question a player asks constantly, and panning
// around at cover is a poor way to answer it.
//
// What made cover the floor was that anything past it shows empty space.
// Every map's rim is rock, and the darkness inside the hills
// (Renderer.drawDarkness, Mindustry's own darkness buffer) takes that
// rock to black on its own, so the world ends in a soft edge and the void
// beyond it reads as deliberate rather than as a missing chunk of map.
// That is what pays for this floor; the haze that used to be laid over
// the rim on top of it is gone.
//
// The floor itself lives in fit.ts: the map editor pulls back to the same
// floor, and a number two cameras have to agree on belongs in one file.
// A FINGERTIP COVERS FAR MORE MAP THAN A CURSOR DOES, so the ceiling has to
// leave enough room to aim at a single cell on a phone-sized viewport.
//
// The board is 256x192 cells, so "cover" on a 1280px-wide viewport puts one
// cell at 5 CSS px — a 1x1 duo was 20px across even at the old ceiling of 4,
// which is a thing you place blind rather than aim. At 12 a cell is 60px and
// the visible field is 21 cells wide on a desktop and about 7 on a phone:
// close enough to pick one turret out of a packed line, and still showing
// enough ground to see what is walking into it.
//
// Only the ceiling is a constant: zooming IN only ever crops, so it cares
// about nothing but the fingertip. The floor depends on the map and the
// viewport together, so it is computed from both (see minZoom).
const ZOOM_MAX = 12;
/**
 * WHERE A RUN OPENS: this far in from cover (zoom 1 fills the viewport
 * with the map), centred on the core — the thing the run is about, and
 * the place a first line is laid round. On a 1600px-wide
 * viewport it puts about 85 cells across the screen: the core's basin
 * and the mouths of the lanes into it, with a cell 19px wide, which is a
 * cell that can be aimed at.
 */
const START_ZOOM = 3;

// ---- the frame budget (see frame and resize) --------------------------
//
// The sim's fixed step. rAF is the display's rate, not the game's: a
// 120Hz phone would run the whole simulation twice as often for motion
// nobody can see, and exactly on the devices with the least CPU to spare.
// So frame() banks real time and steps the sim in SIM_DT quanta.
const SIM_DT = 1 / 60;
// most catch-up steps one frame will run. dt is already clamped to 0.05s,
// so 3 covers an honest slow frame; anything longer (a backgrounded tab,
// a device asleep) is simply dropped rather than replayed at 16x cost —
// the spiral where slow frames beget more sim work which begets slower
// frames has to break somewhere, and losing banked time is the cheap end
const SIM_STEPS_MAX = 3;
/**
 * THE PAN RATE: how much of the viewport the camera crosses per second
 * under a held key or a cursor at the screen's edge, at the default
 * setting. The Controls tab multiplies it (setPanSpeed), and the same
 * number drives both, so one knob is one feel.
 */
const PAN_RATE = 0.5;
/** the minimap's backing store, in device px per cell — 2 so a unit's
 *  dot is a 2x2 square and the viewport's rectangle has a crisp 1-cell stroke */
// one backing pixel a cell: 512 for the grid, sized down by CSS to its corner
const MM_SCALE = 1;
/**
 * HOW BIG A THING ON THE MINIMAP HAS TO READ, in CSS px of the corner
 * canvas. The backing store is a pixel a cell and CSS shrinks it (256
 * cells into 13rem is about four fifths of a pixel a cell), so anything
 * drawn at its true size lands on a fraction of a screen pixel: a body
 * was one such fraction and a turret barely more, and the corner said
 * nothing about where the swarm was. Marks are therefore DILATED — every
 * body and every structure is painted as a square at least this many
 * screen px across, centred where the thing is — so the map answers
 * "where are they" at a glance and keeps its true scale only for the
 * ground under it. Bodies read a touch smaller than structures: a line of
 * turrets is what the map is read for, and it wins the overdraw.
 *
 * Both numbers are ONE AND A HALF times what they first were (2.5 and 3).
 * A mark at those sizes was two or three screen px on a 13rem canvas —
 * legible only if you already knew where to look, which is not what a
 * corner map is for. Double read as blobs: a handful of bodies merged
 * into one red smear and the line swallowed the ground it stood on. At
 * three and a half a body is a clear speck and the line is a clear bar,
 * with the ground still visible between them.
 */
const MM_UNIT_PX = 3.75;
const MM_STRUCT_PX = 4.5;
/**
 * HOW DARK A HILL IS ON THE MINIMAP, as a factor on the rock's true tone.
 *
 * The wall art is painted a shade LIGHTER than the floor of its own family,
 * which is correct on the board — a hill there has an outline, a cast
 * shadow and a dark interior, and its face is the lit top of all that. The
 * corner map has room for none of those: at a pixel a cell a hill was a
 * slightly paler patch of ground, and the one question the map is read for
 * after "where are they" is "what can they not walk through". Multiplying
 * the rock down restates the height with the only channel left, and it is
 * a MULTIPLY rather than a fixed grey so every family keeps its own hue —
 * a snow map's hills stay white-blue and a spore map's stay violet.
 *
 * It is an EIGHTH of the true tone. Two thirds was tried first and told a
 * snow map's hills from its snow and very little else; a third was better
 * and still left the pale grounds' rock bright enough to read as more
 * ground. At an eighth the rock is very nearly black, and that is the
 * point: the corner map is not a picture, it is an answer to "where can
 * they walk", and the strongest mark a one-pixel cell has is to be the
 * darkest thing on the canvas. A trace of hue survives the multiply — a
 * snow map's hills are a blue-black and a spore map's a violet one — so
 * the map is still recognisably its own place at a glance.
 */
const MM_HILL_SHADE = 0.12;
/** how often the minimap's CSS width is measured, in draws. Reading
 *  clientWidth is a layout read, and one per frame is a reflow per frame;
 *  the width only moves when the window or the HUD's zoom does */
const MM_CSS_EVERY = 30;

/**
 * THE BAR STACK over a thing on the board (Game.drawBars), in world px.
 * One height for every bar in the game so a row of buildings reads as a
 * row rather than a ragged fence.
 */
/** how far the hand must travel for a press to be a marquee, in screen px */
const SEL_DRAG_PX = 5;
const SEL_LIKE_STRUCT_R = CELL * 40;
/**
 * WHAT COUNTS AS A DOUBLE CLICK, in ms and in screen px between the two
 * presses. The browser's own count (MouseEvent.detail) cannot be used: the
 * board listens on POINTER events, whose detail is 0 by specification, so
 * the second click of a double arrived indistinguishable from the first
 * and the gesture simply did not work. This is that count, kept by hand.
 */
const DBL_MS = 380;
const DBL_PX = 6;
/** the marquee's amber — the team's own colour, as the unit rings wear it */
const SELECT_RING = "rgba(255,211,127,0.9)";

const BAR_H = 3.5;
const BAR_GAP = 1.5;
/** ...and a floor on the width, so a 1x1 turret's bar is still a bar */
const BAR_MIN_W = 14;
/**
 * A STATUS SYMBOL ON THE FIELD (status.ts, drawStatusRow): how wide one
 * is in world px, the gap between two of them, and how far the row floats
 * above whatever bars are under it.
 *
 * SEVEN IS TWO BAR-HEIGHTS, and it is the size the symbols were DRAWN for
 * (statusArt.ts is a 12-grid because 12 is what survives being read at
 * 7). A body carrying six of them wears a strip about as wide as its own
 * health bar, which is the whole budget: anything bigger and a crowd
 * under fire stops reading as a crowd.
 */
const STATUS_PX = 7;
const STATUS_SP = 1;
const STATUS_GAP = 1.5;
/**
 * ...and the smallest a symbol may land on the SCREEN, in device px,
 * before the row is not drawn at all (Game.statusLegible). It is what
 * makes the symbols a ZOOMED-IN reading of the field rather than
 * something the board wears at every distance, and both halves of that
 * are deliberate.
 *
 * FIVE PIXELS IS WHERE THE DRAWING RESOLVES. These are 12-grid pictures
 * (statusArt.ts) and a 12-grid picture on five device pixels is the point
 * where a droplet still reads as a droplet and a flame as a flame. The
 * first cut of this put the floor at two, on the reasoning that colour
 * still carries at two even when shape does not — which was true, and
 * beside the point: a row of coloured specks over every body says only
 * that SOMETHING is happening, which the bar under it already said.
 *
 * AND IT IS THE WHOLE COST OF THE FEATURE. The number of rows a frame
 * pays for is (bodies on screen) x (this gate), and those two pull
 * against each other — pulled back, the window holds the whole swarm;
 * pushed in, it holds a dozen bodies. So the expensive band is the
 * MIDDLE, and the gate's job is to cut it out: above this floor the view
 * cull has already reduced the board to what fits on a screen, and there
 * is no zoom at which the overlay is asked to draw hundreds of rows.
 *
 * Zoomed out to read the map you get bars; zoomed in to read a fight you
 * get the symbols. On a 1x display that crossover is around zoom 5.7, a
 * little under halfway up the range; on a denser display it is lower,
 * because the symbol is the same physical size there at a lower zoom,
 * which is the thing the floor is actually about.
 */
const STATUS_MIN_PX = 5;
/**
 * How far outside the window a body may be and still have its marks
 * drawn, in world px. The passes over the board run over EVERYTHING on
 * the map rather than over what is in front of the player, and the map
 * is several windows wide — so most of what they drew was landing off
 * the canvas and being thrown away by the clip.
 *
 * 128 is the tallest stack a body can wear: the widest hull on the
 * roster carries 72 px of radius and the bar and the symbols sit above
 * that, so a body whose centre is just off the edge and whose SYMBOLS
 * are on it is still drawn.
 */
const VIEW_PAD = 128;
const BAR_BACK = "rgba(10,14,26,0.72)";
const BAR_EDGE = "rgba(0,0,0,0.55)";
/** a health bar's colour at a fraction of full, the HUD's own three */
const hpColor = (f: number): string => (f > 0.5 ? "#7BE58A" : f > 0.2 ? "#FFD37F" : "#FF5A5A");
/**
 * THE SWARM'S HEALTH IS RED AND STAYS RED. The player's own bar runs the
 * three-colour ramp because its colour is a WARNING — green to amber to
 * red is the run going wrong. Nothing is going wrong when a swarm body is
 * down to a fifth, so its bar carries no ramp at all: red says whose it is
 * (the one thing worth reading at a glance on a field of two armies) and
 * the LENGTH says how much is left, which is what a bar is for.
 */
const ENEMY_HP = "#FF5A5A";

/**
 * THE PLACEMENT GHOST'S WASHES — refused, and taxed by the Hydrophobic
 * rule. An ORDINARY cell has no wash and no outline: it is the turret's
 * own sprite, drawn faint where it is about to stand (drawGhosts), and a
 * picture of the thing needs no frame around it to say what it is. The
 * two that are not ordinary get a colour laid over the sprite, because
 * "you cannot build here" and "this will fire slower here" are the two
 * things the ghost has to say that the sprite cannot.
 */
const GHOST_WASH: readonly (string | null)[] = [
  "rgba(255,90,90,0.45)",
  "rgba(138,162,255,0.35)",
  null,
];
/** how faint the ghost's sprite is — solid enough to read the gun, faint
 *  enough that the ground it is over still shows through */
const GHOST_ALPHA = 0.7;
const PAN_KEYS: Record<string, readonly [number, number]> = {
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/**
 * Wires the sim, the WebGL renderer, the 2d UI overlay, camera, and input to
 * a pair of stacked canvases. Owns the requestAnimationFrame loop.
 */
export class Game {
  readonly sim: Sim;
  private readonly renderer: Renderer;
  private readonly uictx: CanvasRenderingContext2D;

  // device px per world px at zoom 1 — the "cover" scale, so the canvas is
  // always filled and the world is cropped on the axis that overflows
  private scale = 1;
  // the playable height in world px: the loaded map's own rows, so a map
  // stored on a shorter grid neither letterboxes nor pans into its padding
  private worldH = H;
  private worldW = W;
  private hoverGx = -1;
  private hoverGy = -1;
  /**
   * THE HYDROPHOBIC COASTLINE, painted once and blitted while the build
   * menu is open — one pixel per cell, lit on the rock a turret would fire
   * a fraction of its rate from (Sim.waterloggedMask).
   *
   * A RULE THE PLAYER CANNOT SEE IS A RULE THEY CANNOT PLAN AROUND, and
   * this one is invisible by nature: the penalty lives in the GROUND, and
   * a turret standing on taxed rock looks exactly like one that is not.
   * The deploy panel names the rule; this is where it becomes a place.
   *
   * It is only up while something is being placed, because it is a
   * building decision and nothing else — a permanent wash over a third of
   * the map would compete with every unit on it.
   *
   * Null means "not built yet", which is also how it is invalidated: it is
   * per-map, so reset() drops it and the next build hover pays for the
   * rebuild once.
   */
  private soakLayer: HTMLCanvasElement | null = null;
  /**
   * THE SPAWN LAYER'S EDGE as one path, for the route overlay — built on
   * demand, dropped with the map, exactly like the soak layer above.
   *
   * A path rather than a walk over the cells because the overlay is drawn
   * every frame it is up and the layer is thousands of tiles: the cells are
   * visited once, per map, and the stroke afterwards is one canvas call.
   */
  private spawnOutline: Path2D | null = null;
  // the same hover in world px: the placement ghost wants the grid cell, but
  // the demolish highlight has to ask the sim what is actually under there
  private hoverX = -1;
  private hoverY = -1;

  // camera: zoom 1 fills the viewport; (tlx, tly) is the visible top-left in world px
  private zoom = 1;
  private tlx = 0;
  private tly = 0;
  private panning = false;
  private panMoved = 0;
  /** the Controls tab's multiplier on PAN_RATE, keys and edges alike */
  private panSpeed = 1;
  /**
   * WHO WEARS A HEALTH BAR ON THE FIELD — the Interface tab's two knobs,
   * one a side (setHealthBars). They govern units and buildings alike:
   * a wall and a walker are both things with health standing on the board.
   */
  private allyBars: HealthBarMode = HEALTH_BARS_DEFAULT;
  private enemyBars: HealthBarMode = HEALTH_BARS_DEFAULT;
  /**
   * ...AND WHO WEARS THE ROW OF STATUS SYMBOLS over that (setStatusMarks).
   * One knob for both sides, because what is being done to a thing reads
   * the same whoever owns it — and separate from the bars above, because
   * a player who wants a field clear of green still wants to see the fire.
   */
  private statusMarks: StatusMode = STATUS_MARKS_DEFAULT;
  // THE MINIMAP (attachMinimap, drawMinimap): the whole map at a glance,
  // the field on it and the viewport's frame; a press or
  // a drag on it puts that place in view
  private mmCanvas: HTMLCanvasElement | null = null;
  /** the ground at 1px a cell (paintThumb), painted once per map */
  private mmBase: HTMLCanvasElement | null = null;
  /** the per-frame layer over the ground: bodies and structures */
  private mmLayer: HTMLCanvasElement | null = null;
  /** ...and the pixels it is painted into, kept between frames. A 512-cell
   *  map is a megabyte of RGBA, and asking the context for a new one every
   *  frame is sixty megabytes a second of garbage for a buffer that is
   *  wiped and refilled anyway. Re-made only when the map's size changes */
  private mmPixels: ImageData | null = null;
  /** the minimap's CSS width in px and the countdown to measuring it
   *  again (MM_CSS_EVERY) — what a dilated mark's size is worked out from */
  private mmCssW = 0;
  private mmCssTick = 0;
  private mmDrag = false;
  // cursor mode: null is the normal cursor (click a tower to inspect its
  // range); a kind from the tower menu turns on the ghost + paint placement
  private buildKind: TowerKind | null = null;
  /**
   * THE FORMATION BEING AIMED (formation.ts) — the shape the thing under
   * the cursor will land in, and never null while buildKind is set. A
   * free board (the sandbox, the editors) picks a bare turret off the
   * command card and gets no formation at all: a dev door that dropped
   * four turrets a click would be a worse dev door.
   */
  private buildForm: FormationId | null = null;
  /**
   * WHICH WAY THE CARD IN HAND IS FACING (formation.ts Facing) — quarter
   * turns clockwise, and R adds one (rotateHeld).
   *
   * IT BELONGS TO THE AIMING AND NOT TO THE CARD. A player turns a fleet
   * because of the ground under the cursor, not because of what they
   * bought, so the turn survives a right click that stows the ghost and
   * the click that picks it back up — walking a turned fleet across the
   * map must not un-turn it halfway — and a NEW card comes out square,
   * because a new card is a new question about the ground.
   */
  private buildFacing: Facing = 0;
  /**
   * THE CARD THE PLAYER OWNS, which is NOT the same thing as the card
   * they are aiming.
   *
   * It used to be: buildKind was the card, so putting the ghost away
   * threw a thousand scrap in the bin. A right click is the gesture every
   * player in this game already uses to mean "put that down" — it has
   * cancelled build mode since long before the deal existed — and having
   * it mean "burn what you just bought" made the safest reflex on the
   * mouse the most expensive one.
   *
   * So a bought card LIVES HERE until the ground takes it. Aiming it is a
   * separate state (buildKind/buildForm), which a right click drops and a
   * click on the card picks back up. The only two things that spend a
   * card are placing it and buying another.
   */
  private heldCard: { kind: TowerKind; form: FormationId; n: number } | null = null;
  /**
   * THE AMOUNT THE NEXT PRESS BUYS (economy.ts BUY_AMOUNTS) — the
   * corner's fourth button, cycled with X and shared by all three of the
   * others. It is a STANDING setting and not a modifier held down: a
   * player who has decided they are buying in tens is buying in tens
   * until they say otherwise, and a run spent holding a key would be a
   * worse run.
   *
   * It survives a reset. The amount is a habit of the player's, not a
   * fact about the level.
   */
  private buyAmount: BuyAmount = 1;
  private building = false;
  private buildFrom = { x: 0, y: 0 };
  /**
   * THE RULER (Sim.rulerCells): shift held while a building is in hand
   * turns the drag from a paint into a straight, packed line of them from
   * where the press landed to where the cursor is. It PLACES NOTHING until
   * the hand comes up — the line is a ghost the player can swing round and
   * lengthen first, which is the whole difference between a ruler and a
   * brush that happens to go straight.
   */
  private ruler = false;
  private rulerFrom = { x: 0, y: 0 };
  // right button = demolish, the exact mirror of the left button's build
  // chain: the press pulls down whatever is under it and the drag keeps
  // pulling down everything it crosses. Panning therefore lives on the
  // MIDDLE drag and on WASD/arrows (see PAN_KEYS), not here
  private selling = false;
  private sellFrom = { x: 0, y: 0 };
  /**
   * THE MARQUEE. A left press on bare ground with no turret in hand starts
   * one: held and dragged it is a region select, released on the spot it is
   * a click. Which of the two it was is only known on release, so the press
   * itself commits to nothing.
   */
  private selecting = false;
  private selFrom = { x: 0, y: 0 };
  private selTo = { x: 0, y: 0 };
  /** where the press was in SCREEN px — a drag is a drag by what the hand
   *  did, not by how much world the zoom put under it */
  private selFromScreen = { x: 0, y: 0 };
  private selDragPx = 0;
  /** modifiers taken at the press: shift adds to the selection, ctrl (or a
   *  double click) takes everything like the thing under the cursor —
   *  bodies or buildings, whichever it landed on (gatherLike) */
  private selAdd = false;
  private selLike = false;
  /** the last left press, for the double click the pointer events cannot count */
  private lastClickAt = 0;
  private lastClickX = 0;
  private lastClickY = 0;
  private lastMouse = { x: 0, y: 0 };
  private readonly keysDown = new Set<string>();
  private paused = false;
  /**
   * The route overlay: the spawn layer's edge, and the lines flyers fly
   * out of its mouths.
   * OFF by default — it is an answer to "where is that coming from", not
   * something to leave on top of the field all game.
   */
  private showRoutes = false;
  private menuOpen = false;
  // fast-forward: the sim runs this many fixed steps per rendered frame, so
  // a sped-up run steps exactly like a real-time one (stretching dt instead
  // would let units tunnel through walls and each other)
  private speed = 1;
  // the campaign's tower unlocks and caps (see setTech); null in the editor
  private tech: TechState | null = null;
  /**
   * THE ODDS IN FORCE (rarity.ts). A field rather than a constant read at
   * the roll because a RELIC moves it: Ascendancy Protocol (relics.ts) is
   * exactly this, a run that draws purple one time in twenty rather than
   * one in a hundred.
   */
  private rarityWeights: RarityWeights = TURRET_ODDS.live();
  /**
   * THE LAST PRESS'S WHOLE DRAW, and a counter of how many presses there
   * have been at all.
   *
   * A module is not a card: it lands the moment it is bought and there is
   * nothing to place (mods.ts). So the ONLY way a player learns what they
   * just got is a reveal, and the corner needs two things to run one —
   * what to show, and a number that MOVES so a repeat draw of the same
   * mod still reads as a second draw. The reveal's timing is the React
   * layer's business; this is the whole of the sim-side state behind it.
   *
   * A LIST RATHER THAN ONE ID, because the amount button buys ten at a
   * time: one press is one reveal, and what it reveals is everything that
   * press handed over. The counter still moves once per PRESS, so ten
   * relics is one card of ten chips and not ten cards fighting over the
   * same corner for five seconds each.
   *
   * IT CARRIES ITS CATEGORY. One press is one button, so a draw is all
   * mods or all relics and never a mix — and the reveal has to say which,
   * because "3 mods" and "3 relics" are different sentences about
   * different purchases.
   */
  private lastDraw: ModDraw = null;
  private modDraws = 0;
  /**
   * HOW MANY STRUCTURES THIS RUN HAS PLACED, only ever going up. The card
   * layer (Animechs) owns the deal, and it has no other way to learn that
   * the card in hand actually LANDED: it watches this number across the
   * HUD poll and retires the card when it moves. A counter rather than a
   * callback because the HUD is already a poll, and a placement that
   * happened between two polls must not be missed.
   */
  private built = 0;

  private raf = 0;
  private last = 0;
  private fpsEma = 60;
  private simEma = 0;
  private destroyed = false;
  // real time owed to the fixed-step sim (see frame) — carried between
  // frames so a 120Hz display steps the sim on every other frame instead
  // of twice as often, and a hitch is paid back over the next few frames
  private simAcc = 0;

  private readonly onResize = (): void => this.resize();
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Escape") {
      this.toggleMenu();
      return;
    }
    // DELETE (or backspace) sells every selected building — a gathered
    // row goes in one keypress rather than a right-drag along it
    if ((e.code === "Delete" || e.code === "Backspace") && !e.repeat) {
      if (this.menuOpen || this.sim.lost() || this.won()) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      this.sim.sellSelected();
      return;
    }
    if (e.code === "Space" && !e.repeat) {
      if (this.menuOpen) return; // the menu already holds the sim
      // space ALWAYS pauses — even with a UI button focused after a click,
      // where the browser would otherwise re-activate the button. Only real
      // text entry keeps its space (none exists in the UI today)
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      this.paused = !this.paused;
      return;
    }
    if (!PAN_KEYS[e.code]) return;
    e.preventDefault(); // arrows would scroll the page
    this.keysDown.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };
  // missed keyups (cmd+tab away mid-pan) would leave the camera drifting
  private readonly onBlur = (): void => {
    this.keysDown.clear();
  };
  // THE MINIMAP'S POINTER: a press puts the place under it in view, and
  // the press held is a drag of the view — captured, so a drag that runs
  // off the minimap keeps steering until the button is let go
  private readonly onMmDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    this.mmDrag = true;
    this.mmCanvas?.setPointerCapture(e.pointerId);
    this.lookAtMinimap(e);
  };
  private readonly onMmMove = (e: PointerEvent): void => {
    if (this.mmDrag) this.lookAtMinimap(e);
  };
  private readonly onMmUp = (): void => {
    this.mmDrag = false;
  };
  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = this.uiCanvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return; // zero-sized: nothing to aim at
    // mac trackpad pinches arrive as ctrl+wheel; real mouse wheels tick in
    // coarse integer notches (or line-mode deltas). Everything else is
    // two-finger trackpad scroll, which pans the camera instead of zooming.
    const pinch = e.ctrlKey;
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // lines -> px
    const notchy =
      e.deltaMode !== 0 ||
      (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
    if (pinch || notchy) {
      const before = this.mouseWorld(e);
      this.zoom = clamp(
        this.zoom * Math.exp(-dy * (pinch ? 0.012 : 0.0015)),
        this.minZoom(),
        ZOOM_MAX,
      );
      // keep the world point under the cursor fixed
      this.tlx = before.x - ((e.clientX - r.left) / r.width) * this.visW();
      this.tly = before.y - ((e.clientY - r.top) / r.height) * this.visH();
    } else {
      this.tlx += (e.deltaX / r.width) * this.visW();
      this.tly += (e.deltaY / r.height) * this.visH();
    }
    this.clampCamera();
  };
  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0 && !this.panning) {
      const p = this.mouseWorld(e);
      if (this.buildKind && this.dealing) {
        // ONE CARD IS ONE FORMATION. A dealt card carries a square of
        // four to thirty-six turrets, so the press lays the whole shape down
        // and the hand is empty — no chain, no ruler. Ground that takes
        // NONE of it (the ghost is already red) keeps the card in hand to
        // try somewhere else; ground that takes part of it spends the
        // card on the part, which is the player's call to make and the
        // ghost showed them exactly which cells they were making it about
        const n = this.placeFormation(p);
        if (n > 0) {
          this.built += n;
          this.heldCard = null;
          this.buildKind = null;
          this.buildForm = null;
        }
      } else if (this.buildKind) {
        // the FREE board (the sandbox, the editors): left press places
        // right away and dragging chains from here; the ghost already
        // shows red where placement fails. ...unless SHIFT is down, which
        // makes the drag a ruler: it lays its line down on release and
        // nothing before then
        this.building = true;
        this.buildFrom = p;
        this.rulerFrom = p;
        this.ruler = e.shiftKey;
        if (!this.ruler) this.buildTo(p, false);
      } else {
        // normal cursor: a press starts a marquee and decides nothing.
        // What it meant is settled on release (onMouseUp)
        this.selecting = true;
        this.selFrom = p;
        this.selTo = p;
        this.selFromScreen = { x: e.clientX, y: e.clientY };
        this.selDragPx = 0;
        this.selAdd = e.shiftKey;
        const now = performance.now();
        const dbl =
          now - this.lastClickAt < DBL_MS &&
          Math.hypot(e.clientX - this.lastClickX, e.clientY - this.lastClickY) < DBL_PX;
        this.lastClickAt = now;
        this.lastClickX = e.clientX;
        this.lastClickY = e.clientY;
        this.selLike = e.ctrlKey || e.metaKey || dbl;
      }
    } else if (e.button === 2) {
      e.preventDefault();
      this.building = false;
      // right-click still escapes build mode first — you reach for it to
      // put the ghost away, and that press must never also demolish
      // something. IT DOES NOT SPEND THE CARD: a bought card goes back to
      // its slot in the corner (heldCard) and waits to be clicked again
      if (this.buildKind) {
        this.buildKind = null;
        this.buildForm = null;
        return;
      }
      const p = this.mouseWorld(e);
      // otherwise it demolishes on press and chains from here, exactly like
      // the left button builds on press and chains from there
      this.selling = true;
      this.sellFrom = p;
      this.sim.sellTowerAt(p.x, p.y);
    } else if (e.button === 1) {
      e.preventDefault();
      this.building = false;
      this.panning = true;
      this.panMoved = 0;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  };
  private readonly onMouseUp = (e: MouseEvent): void => {
    const wasBuilding = this.building;
    this.selling = false;
    this.panning = false;
    this.building = false;
    // THE RULER LAYS ITS LINE DOWN HERE, on the release: everything before
    // this was a ghost the hand was still aiming
    if (wasBuilding && this.ruler && this.buildKind) {
      const q = this.mouseWorld(e);
      this.sim.placeRuler(this.rulerFrom.x, this.rulerFrom.y, q.x, q.y, this.buildKind);
    }
    this.ruler = false;
    if (!this.selecting) return;
    this.selecting = false;
    const p = this.mouseWorld(e);
    // A DRAG IS A REGION, a click is a point. The threshold is in screen
    // px so it means the same thing at every zoom
    if (this.selDragPx > SEL_DRAG_PX) {
      this.sim.structsInRect(this.selFrom.x, this.selFrom.y, p.x, p.y, this.selAdd);
      return;
    }
    // ctrl, or the second click of a double: everything like the thing under
    // the cursor, within reach of it — BODIES FIRST and then BUILDINGS, in
    // the same order and for the same reason a plain click asks (pickAt).
    // The near miss is forgiven here too — a gathering click that lands a
    // hair off the walker it meant should gather the group, not empty the
    // selection — so each half is asked tight first, and only once both have
    // come back empty is either asked again with the forgiving reach.
    if (this.selLike && this.gatherLike(p)) return;
    this.pickAt(p);
  };
  private readonly onMove = (e: MouseEvent): void => {
    if (this.panning) {
      const r = this.uiCanvas.getBoundingClientRect();
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.panMoved += Math.abs(dx) + Math.abs(dy);
      this.tlx -= (dx / r.width) * this.visW();
      this.tly -= (dy / r.height) * this.visH();
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.clampCamera();
    }
    const p = this.mouseWorld(e);
    if (this.selecting) {
      this.selTo = p;
      this.selDragPx = Math.hypot(e.clientX - this.selFromScreen.x, e.clientY - this.selFromScreen.y);
    }
    if (this.building && !this.panning) {
      // SHIFT IS READ LIVE, not latched at the press: a drag that started
      // free-hand becomes a ruler the moment the key goes down and a brush
      // again the moment it comes up — and letting go picks the chain back
      // up from HERE, so the stretch the ruler was previewing is not
      // painted over in one stripe
      const ruler = e.shiftKey;
      if (ruler && !this.ruler) this.rulerFrom = p;
      if (!ruler && this.ruler) this.buildFrom = p;
      this.ruler = ruler;
      if (!ruler) this.buildTo(p, true);
    }
    if (this.selling && !this.panning) {
      this.sim.sellLine(this.sellFrom.x, this.sellFrom.y, p.x, p.y);
      this.sellFrom = p;
    }
    this.setHover(p);
  };
  private readonly onLeave = (): void => {
    this.clearHover();
    this.panning = false;
    this.building = false;
    this.selling = false;
    // a marquee whose release happened off the canvas is abandoned rather
    // than applied to wherever the cursor left
    this.selecting = false;
  };
  private readonly onContext = (e: Event): void => e.preventDefault();

  /**
   * THE GATHERING CLICK — ctrl, or the second click of a double: take
   * everything LIKE the thing under the cursor and near it, bodies or
   * buildings alike (Sim.selectLike, Sim.selectStructsLike). A line of
   * turrets is selected the way a squad is: click one of them.
   *
   * Bodies are asked before buildings for the same reason pickAt asks them
   * first: a body is small and moving and a building is big and still, so a
   * click that could be either was aimed at the body. Whichever half
   * answers replaces the OTHER half of the selection, exactly as a plain
   * click does — shift keeps both.
   *
   * Returns false when nothing of ours was under the point at all, which
   * leaves the click to be an ordinary one (pickAt) rather than nothing:
   * ctrl held over an enemy still marks it, and over bare ground still
   * clears.
   */
  private gatherLike(p: { x: number; y: number }): boolean {
    const sim = this.sim;
    // tight first, and the forgiving reach only once that came back empty
    for (const structPad of [0, PICK_STRUCT_PAD] as const)
      if (sim.selectStructsLike(p.x, p.y, SEL_LIKE_STRUCT_R, this.selAdd, structPad) > 0) return true;
    return false;
  }

  /**
   * THE BARE-CURSOR CLICK — everything one left click on the board can
   * mean, in the order a player means them:
   *
   *   an ENEMY   — ASK WHAT IT IS: the panel answers for the tapped body
   *                (Sim.setInspectUnit) and an arrow over it says which
   *                one is being read. It is a question and nothing else —
   *                no turret's aim moves for it
   *   a SHIELD TOWER   — the same question, of the mutator's structure
   *   a BUILDING OF OURS — SELECT IT, which is what draws its range ring
   *                and what the delete key sells. Shift adds it to whatever
   *                is already held: a row of duos and the core is a
   *                selection a hand can build one click at a time
   *   nothing    — clear everything: selection and mark alike
   *
   * Bodies first because they are small, moving, and the thing a panicking
   * player is jabbing at; a building is big, still, and easy to hit on
   * purpose. Everything above is asked TIGHT first and then, only once all
   * of it has come back empty, asked again with the forgiving reach
   * (PICK_LENIENT) — so a near miss lands on what it nearly hit instead of
   * clearing the board, and nothing precise is ever taken from a click
   * that did hit something.
   *
   * A SHIFT-CLICK ON NOTHING KEEPS THE SELECTION. Adding one building at
   * a time means missing one now and then, and a miss that emptied the
   * hand would make the gesture unusable.
   */
  private pickAt(p: { x: number; y: number }): void {
    const sim = this.sim;
    const add = this.selAdd;
    // a plain click replaces the selection; a mark on an enemy clears it too
    const replaced = (): void => {
      if (!add) sim.clearStructSelection();
    };
    const ui = sim.unitAt(p.x, p.y);
    if (ui >= 0) {
      replaced();
      sim.setInspectUnit(ui);
      return;
    }
    const si = sim.shieldTowerAt(p.x, p.y);
    if (si >= 0) {
      replaced();
      sim.setInspectShieldTower(si);
      return;
    }
    // a turret the swarm has taken (Conquest) is read like any other
    // enemy, and asked BEFORE the selection: it is not the player's to
    // select, so a click on one can only ever be the question
    const et = sim.enemyTowerAt(p.x, p.y);
    if (et) {
      replaced();
      sim.setInspectTower(et);
      return;
    }
    if (sim.selectStructAt(p.x, p.y, add)) return;
    // NOTHING WAS UNDER THE POINT — so before the click means "clear
    // everything", every question above worth asking again is asked with
    // the forgiving reach. A click that lands a few pixels off a walker in
    // a moving crowd, or a hair outside the turret it meant, is a miss the
    // hand made rather than one the player meant
    if (sim.selectStructAt(p.x, p.y, add, PICK_STRUCT_PAD)) return;
    const lui = sim.unitAt(p.x, p.y, PICK_LENIENT);
    if (lui >= 0) {
      replaced();
      sim.setInspectUnit(lui);
      return;
    }
    if (add) return; // a shift-click on bare ground is not a change of mind
    sim.clearAllSelection();
    sim.clearInspect();
  }

  /** is this world point on the map at all, or out in the void past it? */
  private inWorld(p: { x: number; y: number }): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.worldW && p.y < this.worldH;
  }

  /**
   * The build chain, shared by press and drag:
   * paint from wherever the chain last was to here (`chain`), or drop a
   * single tower under the point that starts it.
   *
   * The void guard is why this is one function. Every world→cell conversion
   * CLAMPS to the board, so a point past the map edge folds onto the rim
   * and drops a tower there — harmless while the camera could not leave the
   * map, and a way to build by clicking on nothing now that it can.
   */
  private buildTo(p: { x: number; y: number }, chain: boolean): void {
    const kind = this.buildKind;
    if (!kind || !this.inWorld(p)) return;
    // a chain whose last point was out in the void has no line to draw —
    // it restarts here, so a drag that leaves the map and comes back does
    // not paint a stripe across everything it skipped
    if (chain && this.inWorld(this.buildFrom)) {
      this.sim.placeLine(this.buildFrom.x, this.buildFrom.y, p.x, p.y, kind);
    } else {
      this.placeOne(p);
    }
    this.buildFrom = p;
  }

  /** the building in hand, dropped under this point — did the ground take it? */
  private placeOne(p: { x: number; y: number }): boolean {
    const kind = this.buildKind;
    if (!kind || !this.inWorld(p)) return false;
    const sz = TOWERS[kind].size;
    return (
      this.sim.placeTower(
        clamp(Math.round(p.x / CELL - sz / 2), 0, COLS - sz),
        clamp(Math.round(p.y / CELL - sz / 2), 0, ROWS - sz),
        kind,
      ) === "ok"
    );
  }

  /**
   * EVERY CELL THE FORMATION IN HAND WOULD FILL, aimed at this world
   * point: the top-left cell of each turret in it. The ghost draws these
   * and the press places these, so what is shown and what lands are the
   * same list — a formation whose preview and result could disagree would
   * be the worst kind of bug to have in a game with a ten-second clock on
   * the decision.
   *
   * The shape is CENTRED on the cursor, over its whole span in tiles
   * (formationSpan: the grid times the turret's own size), and clamped to
   * the board so aiming at the rim slides it inside rather than off.
   *
   * A FLEET IS THE SAME ARITHMETIC, and so is a TURNED one. The card's
   * amount (heldCard.n) is the shape tiled that many times and
   * buildFacing is the quarter turns R has put on it; both go through the
   * same span-and-clamp as a single copy — so a x9 citadel turned on its
   * side is centred, clamped and placed by exactly the code a x1 quad is,
   * and there is no second path for the big one to be wrong in.
   */
  private heldCells(p: { x: number; y: number }): { gx: number; gy: number }[] {
    const kind = this.buildKind;
    if (!kind) return [];
    const sz = TOWERS[kind].size;
    if (!this.buildForm) {
      return [
        {
          gx: clamp(Math.round(p.x / CELL - sz / 2), 0, COLS - sz),
          gy: clamp(Math.round(p.y / CELL - sz / 2), 0, ROWS - sz),
        },
      ];
    }
    const n = this.heldCard?.n ?? 1;
    const [w, h] = formationSpan(sz, this.buildForm, n, this.buildFacing);
    const gx = clamp(Math.round(p.x / CELL - w / 2), 0, Math.max(0, COLS - w));
    const gy = clamp(Math.round(p.y / CELL - h / 2), 0, Math.max(0, ROWS - h));
    return formationCells(gx, gy, sz, this.buildForm, n, this.buildFacing);
  }

  /**
   * LAY THE FORMATION IN HAND DOWN HERE; how many of it the ground took.
   *
   * THE CARD GETS ONE ROLL BEFORE A SINGLE FOOTPRINT IS LAID (mods.ts
   * rollSolo): if it comes out GIANT, the shape is discarded and the
   * whole card is spent on ONE building at the middle of where the patch
   * was going — twice its kind's edge, eleven times the health, and
   * barely a tenth of the reach. That is the one attribute allowed to eat
   * a card, and it is rolled per CARD rather than per turret because
   * three hundred and sixty rolls at any useful chance is a giant every
   * time (see ModDef.solo).
   *
   * A GIANT THAT WILL NOT FIT IS NOT A WASTED CARD. If the ground has no
   * room for the doubled footprint, the shape goes down as it always
   * would — the roll was the game's, and the player should not lose a
   * thousand scrap to it.
   */
  private placeFormation(p: { x: number; y: number }): number {
    const kind = this.buildKind;
    if (!kind || !this.inWorld(p)) return 0;
    const cells = this.heldCells(p);
    // THE WHOLE CARD IS ONE BOARD CHANGE (Sim.batchPlacement): a x9 fleet
    // is three hundred and sixty footprints, and the spec table they all
    // compose against is worth rebuilding once at the end rather than
    // once per turret
    return this.sim.batchPlacement(() => {
      const solo = this.sim.rollSoloMod();
      if (solo) {
        const one = this.sim.placeSolo(cells, kind, solo);
        if (one > 0) return one;
      }
      let n = 0;
      for (const c of cells) if (this.sim.placeTower(c.gx, c.gy, kind) === "ok") n++;
      return n;
    });
  }

  /**
   * IS THIS BOARD DEALT? A charged run buys its turrets as cards off the
   * deal (buyTurretCard) and places them one at a time; a free board — the
   * sandbox and the editors — keeps the old command card, where a kind is
   * PICKED and painted in lines. One question, asked in both places that
   * care: the press handler above and the React overlay's corner.
   */
  get dealing(): boolean {
    return this.sim.charging;
  }

  /**
   * ONE DRAW OFF THE DEAL, AND IT GOES STRAIGHT INTO THE HAND: pay the
   * fee, roll the two tables, and the card that comes out is ALREADY
   * PICKED — the ghost is on the board before the finger has left the T.
   * There is no hand and no second click: the flow is T, click, T, click,
   * and a shape a player does not want is one more T away.
   *
   * It overwrites whatever was in hand, which is what makes that spam
   * work. The card it throws away is not refunded — the thousand scrap IS
   * the price of another look at the shape table.
   *
   * THE AMOUNT IS A THIRD AXIS AND IT IS NOT A THIRD ROLL. At x4 this
   * still rolls ONE turret and ONE shape and then TILES that shape four
   * times (formation.ts fleetLayout) — so what the amount multiplies is
   * the GROUND the card asks for, not the variety it hands over. Nine
   * citadels of spectres is one decision about one piece of map, and the
   * ghost of it is most of the reward for pressing the button.
   *
   * IT IS ALL OR NOTHING ON THE SCRAP. The fee is flat (economy.ts, no
   * bulk discount) times the amount, and a bank that cannot cover the
   * whole fleet buys none of it rather than quietly handing over the
   * seven the money stretched to — a press that silently changes what it
   * bought is a press the player cannot aim.
   *
   * The turret pool is what the track has dealt, minus the kinds that are
   * off the field for now (types.ts RETIRED_KINDS). THE SHAPE POOL IS
   * ALWAYS THE WHOLE TABLE — every save owns all five squares from wave
   * one (formation.ts) — so the second roll is the same roll on a level-1
   * board as on a finished one. A free board draws from everything for
   * nothing, so the button works in the sandbox.
   *
   * Returns what it drew, or null when the bank could not cover it or the
   * run is over.
   */
  buyTurretCard(): { kind: TowerKind; form: FormationId; n: number } | null {
    if (this.sim.lost() || this.won() || this.menuOpen) return null;
    const kind = rollTurret(this.drawPool(), this.rarityWeights);
    if (!kind) return null;
    // TWO ROLLS, INDEPENDENT: which gun, and how much of it in what shape
    const form = rollFormation(FORMATION_IDS);
    if (!form) return null;
    const n = this.buyAmount;
    if (!this.sim.spend(this.rollPrice() * n)) return null;
    this.heldCard = { kind, form, n };
    this.buildKind = kind;
    this.buildForm = form;
    this.buildFacing = 0; // a new card is a new question about the ground

    this.sim.clearStructSelection();
    return { kind, form, n };
  }

  /**
   * ONE DRAW OFF A MODULE TABLE, AND IT IS ALREADY IN FORCE — the M button
   * (mods.ts) and the G button (relics.ts), which are two methods below
   * because they are two categories and no longer one method under a
   * `scope` flag.
   *
   * THERE IS NO CARD AND NOTHING TO PLACE. A turret draw hands over a
   * thing to put somewhere and the decision is WHERE; a module draw is
   * the opposite kind of purchase — it applies to the whole run the
   * instant it is paid for, either as a relic on the shelf or as a chance
   * riding every turret still to be placed. The buttons sit beside each
   * other and mean genuinely different things, which is the point.
   *
   * SO THERE IS NO RE-ROLL EITHER. What T buys can be thrown away and
   * drawn again at a thousand a look, because a shape a player cannot use
   * is a dead card; what these buy is never dead, so spamming them is
   * simply buying more modules, which is allowed and is not a mechanic.
   *
   * THE AMOUNT IS N INDEPENDENT DRAWS here, not a tiling: there is no
   * ground involved and nothing to tile, so ten relics is ten relics. The
   * bank must cover all N before the first one is taken — same all-or-
   * nothing as the turret button — but a table that RUNS OUT part way
   * through stops there and is charged only for what it handed over,
   * because the alternative is taking relic money for a relic that does
   * not exist.
   *
   * A RELIC PRESS can refuse outright, and a MOD press cannot: the relic
   * half runs out (there are fourteen and each is held once) while the mod
   * half never does (a copy is always worth something). That asymmetry is
   * the two categories, not an accident — see relics.ts anyRelicLeft.
   */

  /** THE M BUTTON: mods, a chance riding every placement still to come */
  buyMods(): ModId[] {
    if (!this.canBuyModules() || this.modDeal() !== "open") return [];
    const each = this.dealing ? MOD_ROLL_PRICE : 0;
    const n = this.buyAmount;
    // the whole fleet or none of it — checked before a single draw is
    // taken, so a refused press has changed nothing at all
    if (this.sim.scrap < each * n && this.sim.charging) return [];
    const got: ModId[] = [];
    for (let i = 0; i < n; i++) {
      const id = rollMod(MOD_ODDS.live(), Math.random, this.modPool());
      if (!id) break; // the save has opened no mod at all
      if (!this.sim.spend(each)) break;
      this.sim.takeMod(id);
      got.push(id);
    }
    if (got.length === 0) return [];
    this.lastDraw = { kind: "mod", ids: got };
    this.modDraws++;
    return got;
  }

  /** THE G BUTTON: relics, in force over the whole board the moment they land */
  buyRelics(): RelicId[] {
    if (!this.canBuyModules() || this.relicDeal() !== "open") return [];
    const each = this.dealing ? RELIC_ROLL_PRICE : 0;
    const n = this.buyAmount;
    if (this.sim.scrap < each * n && this.sim.charging) return [];
    const got: RelicId[] = [];
    for (let i = 0; i < n; i++) {
      const id = rollRelic(this.sim.relicsHeld, RELIC_ODDS.live(), Math.random, this.relicPool());
      if (!id) break; // the half is owned out mid-press: stop, charge for the rest
      if (!this.sim.spend(each)) break;
      this.sim.takeRelic(id);
      got.push(id);
    }
    if (got.length === 0) return [];
    // ASCENDANCY (relics.ts) bends the TURRET deal's odds, so the weights
    // are re-read off the run's relics here rather than being a constant
    this.rarityWeights = shiftedWeights(TURRET_ODDS.live(), this.sim.relicsHeld);
    this.lastDraw = { kind: "relic", ids: got };
    this.modDraws++;
    return got;
  }

  /** is the board in a state where either button may be pressed at all? */
  private canBuyModules(): boolean {
    return !this.sim.lost() && !this.won() && !this.menuOpen;
  }

  /**
   * R TURNS THE CARD IN HAND A QUARTER CLOCKWISE, and it spends nothing.
   *
   * THE WHOLE FOOTPRINT TURNS, not the shape inside it (formation.ts
   * fleetFootprint): a fleet is the shape tiled square, so turning it
   * turns every copy at once.
   *
   * IT CHANGES NOTHING ON TODAY'S TABLE, because every formation is a
   * solid square and so is every fleet of one (formation.ts): a quarter
   * turn maps the footprint onto itself. The key is kept because the
   * arithmetic under it is kept — the ghost and the structures both go
   * through fleetFootprint — and the day a formation that is not square
   * goes back on the table, R already works.
   *
   * IT ONLY MEANS ANYTHING WHILE THE GHOST IS UP. There is nothing to
   * turn on a bare cursor, and a free board (the sandbox, the editors)
   * has no formation at all — it picks a single turret off the command
   * card, and a lone footprint is square. Returns whether it turned, so
   * the key can decline the press rather than swallow it.
   *
   * The shape stays CENTRED on the cursor through the turn, because
   * heldCells re-centres on the turned span every frame — an oblong
   * footprint pivots about the cursor instead of swinging off it.
   */
  rotateHeld(): boolean {
    if (!this.buildKind || !this.buildForm) return false;
    if (this.sim.lost() || this.won() || this.menuOpen) return false;
    this.buildFacing = nextFacing(this.buildFacing);
    return true;
  }

  /**
   * THE AMOUNT BUTTON (X): 1 -> 5 -> 10 -> 1, and it spends nothing.
   * It is a standing setting shared by all three buy buttons — see
   * Game.buyAmount for why it is not a held modifier.
   */
  cycleBuyAmount(): BuyAmount {
    this.buyAmount = nextAmount(this.buyAmount);
    return this.buyAmount;
  }

  /** throw the owned card away — what a second T does to the first one's
   *  draw. Nothing comes back; a right click does NOT do this */
  discardCard(): void {
    this.heldCard = null;
    this.buildKind = null;
    this.buildForm = null;
  }

  /**
   * PICK THE OWNED CARD BACK UP, or put it down again — the click on the
   * card in the corner, and the toggle the command card's slots have
   * always had. It spends nothing either way: the card is already bought.
   */
  toggleHeldCard(): void {
    if (!this.heldCard || this.sim.lost() || this.won()) return;
    if (this.buildKind) {
      this.buildKind = null;
      this.buildForm = null;
      return;
    }
    this.buildKind = this.heldCard.kind;
    this.buildForm = this.heldCard.form;
    this.sim.clearStructSelection();
  }

  /** what the deal may turn over: the track's roster, minus the retired
   *  kinds — the whole thing on a free board */
  private drawPool(): TowerKind[] {
    return (this.tech ? [...this.tech.unlocked] : FIELDED_KINDS).filter((k) => !isRetired(k));
  }

  /** ...and the modules the M and G buttons may turn over — dealt by the
   *  track as well (TechState.mods). Null is the whole catalog, which is
   *  what a free board draws from */
  private modPool(): ReadonlySet<ModId> | null {
    return this.tech ? this.tech.mods : null;
  }

  /** ...and the relics the G button may turn over (TechState.relics), which
   *  a save below RELICS_FROM has none of */
  private relicPool(): ReadonlySet<RelicId> | null {
    return this.tech ? this.tech.relics : null;
  }

  /**
   * WHAT THE M BUTTON CAN DO FOR THIS PRESS. It is only ever LOCKED or
   * OPEN: a mod has no cap, so once the track has opened the half it stays
   * drawable forever (mods.ts rollMod).
   */
  private modDeal(): DealHalf {
    return anyModOpen(this.modPool()) ? "open" : "locked";
  }

  /**
   * ...AND WHAT THE G BUTTON CAN DO, which has all three answers. A save
   * below RELICS_FROM reads LOCKED, and a run holding all fourteen reads
   * OWNED — a relic is held once, so this half genuinely runs out
   * (relics.ts).
   */
  private relicDeal(): DealHalf {
    if (!anyRelicOpen(this.relicPool())) return "locked";
    return anyRelicLeft(this.sim.relicsHeld, this.relicPool()) ? "open" : "owned";
  }

  /** what one draw costs right now — flat (economy.ts), and nothing at
   *  all on a free board */
  private rollPrice(): number {
    return this.dealing ? TURRET_ROLL_PRICE : 0;
  }

  /** point the deal at different odds — what Ascendancy Protocol does */
  setRarityWeights(w: RarityWeights): void {
    this.rarityWeights = w;
  }

  /** remember the pointer in world px, and as the cell a tool would act on */
  private setHover(p: { x: number; y: number }): void {
    // out past the edge there is no cell to aim at, and clamping would put
    // the ghost on the rim while the cursor sits in the void
    if (!this.inWorld(p)) return this.clearHover();
    this.hoverX = p.x;
    this.hoverY = p.y;
    // the ghost's own anchor is the formation's (heldCells); this pair is
    // the cell a bare tool acts on, and it spans the whole shape so that
    // "is the cursor aiming at the board at all" is asked of all of it
    const hsz = this.buildKind ? TOWERS[this.buildKind].size : 2;
    this.hoverGx = clamp(Math.round(p.x / CELL - hsz / 2), 0, COLS - hsz);
    this.hoverGy = clamp(Math.round(p.y / CELL - hsz / 2), 0, ROWS - hsz);
  }

  private clearHover(): void {
    this.hoverX = -1;
    this.hoverY = -1;
    this.hoverGx = -1;
    this.hoverGy = -1;
  }
  // trackpad pinch = ctrl+wheel: the canvas handler already consumes it, but
  // a pinch that starts over a UI overlay (HUD, tower menu) would reach the
  // browser and zoom the PAGE — which sticks per-site and shoves the UI
  // off-screen. Swallow it window-wide while the game screen is up
  private readonly onWinWheel = (e: WheelEvent): void => {
    if (e.ctrlKey) e.preventDefault();
  };

  /**
   * Everything a level needs before its first frame, in the order it
   * happens. The loading screen names these; see LOAD_STEP_LABEL.
   */
  static async create(
    glCanvas: HTMLCanvasElement,
    uiCanvas: HTMLCanvasElement,
    spec: LevelSpec,
    onStep: (step: LoadStep) => void = () => {},
  ): Promise<Game> {
    // announce, then let the screen draw it, THEN do the work
    const begin = async (step: LoadStep): Promise<void> => {
      onStep(step);
      await paint();
    };

    // packed once per page and shared from then on: the long step on a cold
    // start, free on every level after. A warm start does not announce it at
    // all, matching firstLoadStep — otherwise the bar would step BACKWARDS
    // from where the screen came up
    if (!atlasReady()) await begin("sprites");
    const atlas = await buildAtlas();

    // the sim reads the official map documents, which live outside the
    // module graph and are fetched, never imported (imported JSON turned
    // every editor save into a Turbopack HMR update it cannot apply).
    // Only the document about to be played is re-read: the editor returns
    // through a client-side route, so a saved map must not be played from
    // the stale copy in memory — but that is true of ONE map, not all of them
    // The level SCRIPT is re-read here too, for the same reason. Both
    // editors return through a client-side route, so an edited wave script
    // is as capable of being stale as an edited map — and applyLevelDoc
    // derives every WORLDS entry's script in place, including the object
    // this spec already points at, so the sim built below picks it up
    await begin("map");
    const mapId = spec.map ?? OFFICIAL_MAP_IDS[0];
    await Promise.all([
      OFFICIAL_MAPS.length === 0 ? loadOfficialMaps() : refreshMap(mapId),
      loadLevelDocs(),
      // tech prices are read the moment the tech screen opens, so the
      // coefficients have to land before the game does
      loadBalanceDoc(),
    ]);

    // terrain, flow field and the static geometry batches
    await begin("world");
    const game = new Game(glCanvas, uiCanvas, atlas, spec);

    // one full frame on the GPU before anything uncovers the canvas, so
    // the reveal shows the map rather than a black flash that resolves a
    // frame later
    await begin("warmup");
    game.warmup();
    return game;
  }

  private constructor(
    private readonly glCanvas: HTMLCanvasElement,
    private readonly uiCanvas: HTMLCanvasElement,
    atlas: HTMLCanvasElement,
    level: LevelSpec,
  ) {
    // the level is built ONCE, here. Constructing a default sim and then
    // calling loadLevel meant carving terrain and solving the flow field
    // twice on every single level start, the second solve throwing the
    // first away
    this.sim = new Sim(level);
    this.renderer = new Renderer(glCanvas, atlas);
    const ctx = uiCanvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.uictx = ctx;

    this.fitToMap();
    this.renderer.rebuildTerrain(this.sim, GAME_LAYERS);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pointerup", this.onMouseUp);
    window.addEventListener("pointercancel", this.onMouseUp);
    window.addEventListener("wheel", this.onWinWheel, { passive: false });
    uiCanvas.addEventListener("wheel", this.onWheel, { passive: false });
    uiCanvas.addEventListener("pointerdown", this.onMouseDown);
    uiCanvas.addEventListener("pointermove", this.onMove);
    uiCanvas.addEventListener("pointerleave", this.onLeave);
    uiCanvas.addEventListener("contextmenu", this.onContext);

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /**
   * Draw one complete frame and block until the driver has actually done
   * it. The raf loop is already running by now, but "a frame was queued"
   * is not "a frame is on screen": the first draw also uploads the atlas
   * and the terrain batches, and uncovering the canvas before that lands
   * shows black for a beat. gl.finish() is exactly the wrong call inside a
   * render loop and exactly the right one here, where the whole point is
   * to wait.
   */
  private warmup(): void {
    this.renderer.render(
      this.sim,
      this.zoom,
      -this.tlx * this.zoom,
      -this.tly * this.zoom,
      this.scale,
    );
    this.drawOverlay();
    // getContext with the same type returns the context the Renderer
    // already created — it does NOT make a second one — which is how a
    // sync point is reached without widening the Renderer's surface
    this.glCanvas.getContext("webgl2")?.finish();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerup", this.onMouseUp);
    window.removeEventListener("pointercancel", this.onMouseUp);
    window.removeEventListener("wheel", this.onWinWheel);
    this.uiCanvas.removeEventListener("wheel", this.onWheel);
    this.uiCanvas.removeEventListener("pointerdown", this.onMouseDown);
    this.uiCanvas.removeEventListener("pointermove", this.onMove);
    this.uiCanvas.removeEventListener("pointerleave", this.onLeave);
    this.uiCanvas.removeEventListener("contextmenu", this.onContext);
    this.attachMinimap(null);
  }

  setBuildKind(kind: TowerKind | null, form: FormationId | null = null): void {
    if (kind && this.tech && !this.tech.unlocked.has(kind)) return;
    this.buildKind = kind;
    this.buildForm = kind ? form : null;
    // a building picked up puts the inspected one down: the ring the hand
    // was reading belongs to a decision it has moved on from
    if (kind) this.sim.clearStructSelection();
  }

  /**
   * THE HAIRLINE DIAGNOSTIC. `?diag=1` on the sandbox door runs it: the
   * next few frames are drawn at a handful of zooms, each frame is read
   * back from the GPU before the browser composites it, and every column
   * and row that is darker than both its neighbours across most of the
   * frame — a seam between tiles, which is what a hairline is — is
   * counted. The report lands in a <pre> over the page, with the GPU's
   * name and the pixel ratio, so it can be screenshotted from a machine
   * whose rendering cannot be seen from here. Dev tooling; not a feature.
   */
  private diagZooms: number[] = [];
  private diagOut: string[] = [];
  private diagZoomWas = 1;
  private diagTlWas: [number, number] = [0, 0];

  diagnose(zooms: number[] = [1, 2.5, 6]): void {
    this.diagZoomWas = this.zoom;
    this.diagTlWas = [this.tlx, this.tly];
    this.diagOut = [
      `build ${BUILD}  gpu ${this.renderer.gpuName()}`,
      `dpr ${window.devicePixelRatio}  canvas ${this.glCanvas.width}x${this.glCanvas.height}  css ${this.glCanvas.clientWidth}x${this.glCanvas.clientHeight}  scale ${this.scale.toFixed(4)}`,
    ];
    this.diagZooms = zooms.slice();
  }

  private diagScan(): void {
    const z = this.diagZooms.shift() ?? 1;
    const w = this.glCanvas.width, h = Math.max(1, this.glCanvas.height - 160);
    const d = this.renderer.readFrame(0, 0, w, h);
    const L = (x: number, y: number): number => {
      const i = ((h - 1 - y) * w + x) * 4;
      return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    };
    // A HAIRLINE PIXEL is one darker than both of its neighbours across
    // it by a clear margin — a dark line one pixel wide, of ANY length.
    // Each one is also placed against the cell grid: the boundaries fall
    // at `phase + k * pitch` device px, so a pixel within one px of one is
    // ON a tile edge, and the share of hairline pixels that are is the
    // whole question — a seam between tiles lives on the grid, and a
    // driver's texture bleed does not care where the grid is
    const pitch = CELL * z * this.scale;
    const onEdge = (p: number, phase: number): boolean => {
      const m = (((p - phase) % pitch) + pitch) % pitch;
      return m <= 1 || pitch - m <= 1;
    };
    const phaseX = (((-this.tlx * z * this.scale) % pitch) + pitch) % pitch;
    const phaseY = (((-this.tly * z * this.scale) % pitch) + pitch) % pitch;
    const DARK = 20;
    let v = 0, vEdge = 0, hz = 0, hEdge = 0;
    // the longest vertical runs of hairline pixels, to say where they are
    const runs: Array<{ x: number; y: number; len: number; lum: number }> = [];
    for (let x = 1; x < w - 1; x++) {
      let run = 0, runY = 0, runLum = 0;
      const edge = onEdge(x, phaseX);
      for (let y = 0; y < h; y++) {
        const l = L(x, y);
        const hair = l < Math.min(L(x - 1, y), L(x + 1, y)) - DARK;
        if (hair) {
          v++;
          if (edge) vEdge++;
          if (!run) { runY = y; runLum = 0; }
          run++;
          runLum += l;
        }
        if ((!hair || y === h - 1) && run) {
          if (run >= 6) runs.push({ x, y: runY, len: run, lum: runLum / run });
          run = 0;
        }
      }
    }
    for (let y = 1; y < h - 1; y++) {
      const edge = onEdge(y, phaseY);
      for (let x = 0; x < w; x++)
        if (L(x, y) < Math.min(L(x, y - 1), L(x, y + 1)) - DARK) {
          hz++;
          if (edge) hEdge++;
        }
    }
    runs.sort((a, b) => b.len - a.len);
    const pct = (a: number, b: number): string => (b ? `${Math.round((100 * a) / b)}%` : "-");
    const where = runs
      .slice(0, 6)
      .map((r) => {
        const m = (((r.x - phaseX) % pitch) + pitch) % pitch;
        return `x${r.x} y${r.y} len${r.len} lum${r.lum.toFixed(0)} edge${Math.min(m, pitch - m).toFixed(1)}px`;
      })
      .join("; ");
    this.diagOut.push(
      `zoom ${z}: ${pitch.toFixed(2)} px/cell — hairline px: vertical ${v} (${pct(vEdge, v)} on a cell edge), horizontal ${hz} (${pct(hEdge, hz)} on a cell edge)`,
      `  longest vertical runs: ${where || "none"}`,
    );
    if (this.diagZooms.length) return;
    this.zoom = this.diagZoomWas;
    this.tlx = this.diagTlWas[0];
    this.tly = this.diagTlWas[1];
    const pre = document.createElement("pre");
    pre.id = "diag";
    pre.textContent = this.diagOut.join("\n");
    pre.style.cssText =
      "position:fixed;left:8px;top:80px;z-index:1000;margin:0;padding:8px;background:#000c;color:#fff;font:11px/1.3 monospace;white-space:pre;user-select:text;max-width:calc(100vw - 16px);overflow:auto";
    document.body.appendChild(pre);
    console.log(this.diagOut.join("\n"));
  }

  /**
   * The on-screen menu button — esc, for a screen with no keyboard.
   *
   * IT NO LONGER PUTS THE CARD DOWN. Clearing buildKind here was free
   * when a building was merely PICKED off a shelf; the thing in hand is a
   * card somebody paid a thousand scrap for now, and pausing to look at
   * the settings must not spend it. The card waits, ghost and all, under
   * the overlay.
   */
  openMenu(): void {
    if (this.sim.lost() || this.won()) return;
    this.menuOpen = true;
  }

  /**
   * ESC MEANS ONE THING: the menu, open or closed. It used to back out a
   * layer at a time — an active build or selection first, the menu only on
   * a bare press — which cost a player two or three presses to reach
   * Resume. A ghost is put away with the right button, which has always
   * cancelled build mode before it demolishes anything, and a selection is
   * dropped by clicking bare ground; neither wants the key that pauses the
   * game.
   */
  toggleMenu(): void {
    if (this.menuOpen) {
      this.menuOpen = false;
      return;
    }
    this.openMenu();
  }

  /** the on-screen pause button — space, for a screen with no keyboard */
  togglePause(): void {
    if (this.menuOpen) return; // the menu already holds the sim
    this.paused = !this.paused;
  }

  /** apply the save's tower unlocks and caps; null lifts them (editor, dev) */
  setTech(tech: TechState | null): void {
    this.tech = tech;
    this.sim.setTech(tech);
  }

  /** the admin view's unlimited income (Sim.setRich) — everything else
   *  about the economy, prices and odds included, stays where it was */
  setRich(on: boolean): void {
    this.sim.setRich(on);
  }


  /**
   * The ambient-effects switch, both halves at once — the sim stops
   * pushing dressing into the effect pool (Sim.setEffects, which keeps
   * every effect that IS a weapon) and the renderer drops the decoration
   * it owns itself and stands scorch's flame back up (Renderer.setEffects).
   *
   * Live: it can be thrown mid-run and takes hold on the next frame.
   * Effects already in flight play out their remaining life rather than
   * vanishing mid-puff, which is a frame or two and reads as the tail of
   * what was already on screen.
   */
  setEffects(on: boolean): void {
    this.sim.setEffects(on);
    this.renderer.setEffects(on);
  }

  /** the whole script is dealt with and the base stands */
  private won(): boolean {
    return this.sim.won();
  }

  /** the esc menu's Resume button */
  closeMenu(): void {
    this.menuOpen = false;
  }


  /** fast-forward toggle: any multiplier in SPEEDS; anything else is 1x */
  setSpeed(mult: number): void {
    this.speed = SPEEDS.includes(mult) ? mult : 1;
  }

  /** the Controls tab's pan speed: a multiplier on PAN_RATE, keys and edges alike */
  setPanSpeed(mult: number): void {
    this.panSpeed = Number.isFinite(mult) && mult > 0 ? mult : 1;
  }


  /**
   * The Interface tab's health-bar knobs, both sides at once — they are
   * read straight off the fields every frame (barsOn), so a knob turned
   * from the pause overlay is showing on the field behind it before the
   * panel is even closed.
   */
  setHealthBars(ally: HealthBarMode, enemy: HealthBarMode): void {
    this.allyBars = ally;
    this.enemyBars = enemy;
  }

  /**
   * The Interface tab's status-symbol knob, read the same way and as
   * live: `always` is every flagged body the zoom can resolve a symbol
   * on, `selected` is only what the player is holding or has marked, and
   * `never` leaves the field to the bars alone.
   */
  setStatusMarks(mode: StatusMode): void {
    this.statusMarks = mode;
  }

  /**
   * THE MINIMAP'S CANVAS, or null to let go of it. React owns the element
   * and hands it over when the game screen mounts; the game paints it
   * every frame (drawMinimap) and listens on it for the press and the
   * drag that steer the view (onMmDown). Detaching removes the listeners
   * and drops the painted layers, so a canvas that comes back — the same
   * element or a fresh one — is painted from scratch.
   */
  attachMinimap(canvas: HTMLCanvasElement | null): void {
    const old = this.mmCanvas;
    if (old === canvas) return;
    if (old) {
      old.removeEventListener("pointerdown", this.onMmDown);
      old.removeEventListener("pointermove", this.onMmMove);
      old.removeEventListener("pointerup", this.onMmUp);
      old.removeEventListener("pointercancel", this.onMmUp);
      old.removeEventListener("contextmenu", this.onContext);
    }
    this.mmCanvas = canvas;
    this.mmDrag = false;
    if (canvas) {
      canvas.addEventListener("pointerdown", this.onMmDown);
      canvas.addEventListener("pointermove", this.onMmMove);
      canvas.addEventListener("pointerup", this.onMmUp);
      canvas.addEventListener("pointercancel", this.onMmUp);
      canvas.addEventListener("contextmenu", this.onContext);
    }
  }

  /** put the world point at the centre of the view (the minimap's press) */
  private lookAt(wx: number, wy: number): void {
    this.tlx = wx - this.visW() / 2;
    this.tly = wy - this.visH() / 2;
    this.clampCamera();
  }

  /** a minimap pointer event -> the world point under it -> the view centred there */
  private lookAtMinimap(e: PointerEvent): void {
    const mm = this.mmCanvas;
    if (!mm) return;
    const r = mm.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const fx = clamp((e.clientX - r.left) / r.width, 0, 1);
    const fy = clamp((e.clientY - r.top) / r.height, 0, 1);
    this.lookAt(fx * this.worldW, fy * this.worldH);
  }

  /** everything the React overlay renders, polled a few times a second */
  ui(): UiState {
    return {
      levelId: this.sim.level.id,
      tier: this.sim.level.tier ?? 0,
      enemyLevel: this.sim.level.enemyLevel ?? 0,
      remaining: this.sim.remaining(),
      byKind: this.sim.aliveByKindList(),
      bosses: this.sim.bossBars().map((b) => ({ ...b, kind: UNIT_KINDS[b.kind] })),
      nextWaveIn: this.sim.nextWaveIn(),
      elapsed: this.sim.time,
      currentWave: this.sim.currentWave(),
      totalWaves: this.sim.totalWaves,
      buildKind: this.buildKind,
      buildForm: this.buildForm,
      buildFacing: this.buildFacing,
      held: this.heldCard,
      paused: this.paused,
      speed: this.speed,
      showRoutes: this.showRoutes,
      lost: this.sim.lost(),
      coreHp: Math.ceil(this.sim.core.hp),
      coreHpMax: this.sim.core.hpMax,
      won: this.won(),
      mission: this.sim.level.mission,
      timeLeft: Math.max(0, this.sim.deadline - this.sim.time),
      kills: this.sim.kills,
      menuOpen: this.menuOpen,
      scrap: this.sim.charging ? Math.floor(this.sim.scrap) : null,
      scrapEarned: Math.floor(this.sim.scrapEarned),
      wavesCleared: this.sim.wavesCleared(),
      xp: missionXp(this.sim.wavesCleared(), this.sim.totalWaves),
      prices: PRICES(),
      refunds: REFUNDS(),
      counts: this.sim.towerCounts(),
      unlocked: this.tech ? Array.from(this.tech.unlocked) : null,
      dealing: this.dealing,
      rollPrice: this.rollPrice(),
      modPrice: this.dealing ? MOD_ROLL_PRICE : 0,
      relicPrice: this.dealing ? RELIC_ROLL_PRICE : 0,
      amount: this.buyAmount,
      shelfMods: this.sim.ownedMods(),
      shelfRelics: this.sim.ownedRelics(),
      lastDraw: this.lastDraw,
      modDraws: this.modDraws,
      modDeal: this.modDeal(),
      relicDeal: this.relicDeal(),
      inspect: this.inspect(),
      built: this.built,
      // off the sim's live stats (statsFor), never the static table: the
      // whole point of deriving the line is that an upgrade moves it
      targeting: Object.fromEntries(
        TOWER_KINDS.map((k) => [k, targetingLine(this.sim.statsFor(k))]),
      ) as Record<TowerKind, string>,
    };
  }

  /**
   * WHAT THE PANEL PRINTS (UiState.inspect), and the order the question is
   * asked in: what the player is HOLDING first, and then what their last
   * tap MARKED.
   *
   * THAT SECOND HALF IS THE WHOLE OF WHAT A TAP ON AN ENEMY MEANS
   * (Sim.setInspectUnit) — what is that, how much of it is left, what has
   * landed on it. Everything needed to answer was already in the sim's
   * arrays and none of it was ever on the screen.
   *
   * It is the same panel either way: a picture, a name, the row of
   * statuses, a pool. What a body cannot have is attributes, which is
   * exactly what an empty mods row says.
   */
  private inspect(): UiState["inspect"] {
    const sim = this.sim;
    const picked = sim.selectedStructs;
    if (picked.length > 0) return this.inspectStructs(picked);
    // NOTHING OF OURS IS HELD, so the panel answers the other thing a
    // click can mean: what the last tap MARKED (Sim.setInspectUnit) —
    // bodies first, exactly as pickAt asks them
    const ui = sim.inspectedUnit;
    if (ui >= 0) {
      return {
        n: 1,
        kind: null,
        unit: UNIT_KINDS[sim.ukind[ui]],
        // THE NAME, NOT THE ID (levels.ts UNIT_NAMES). The kind keys the
        // sim's arrays and the sprite files; what a body is CALLED is the
        // animal its family draws as, and the panel is the one place a
        // player ever reads it
        name: unitName(UNIT_KINDS[sim.ukind[ui]]),
        hp: Math.ceil(sim.uhp[ui]),
        hpMax: Math.ceil(sim.uhpmax[ui]),
        statuses: unitStatusChips(sim, ui),
        mods: [],
      };
    }
    // a turret the swarm has taken is a BUILDING, and reads as one — its
    // pools, its plating, the attributes it was built with and the fact
    // that it has changed sides, which is a status of its own
    const et = sim.inspectedTower;
    if (et) return this.inspectStructs([et]);
    const st = sim.inspectedShieldTower;
    if (st) {
      return {
        n: 1,
        kind: null,
        unit: null,
        name: st.mega ? "Mega shield tower" : "Shield tower",
        hp: Math.ceil(st.hp),
        hpMax: Math.ceil(st.hpMax),
        // the DOME is what a player is actually asking about, and it is
        // the same force field a carrier's bubble is
        statuses:
          st.shield > 0
            ? [
                {
                  id: "shield",
                  n: Math.ceil(st.shield),
                  note: `${Math.ceil(st.shield)} of ${Math.ceil(st.shieldMax)} absorbed before the body`,
                },
              ]
            : [],
        mods: [],
      };
    }
    return null;
  }

  /**
   * THE BUILDING HALF OF THE PANEL — one turret, a marquee's whole catch,
   * or the one emplacement the swarm has taken.
   *
   * One pass over them: sum the pools, tally the attribute bits, and
   * decide whether they are all one kind. The core is a structure too and
   * has no attributes and no kind, which is exactly what a null kind and
   * an empty row say.
   */
  private inspectStructs(picked: readonly Structure[]): UiState["inspect"] {
    let hp = 0, hpMax = 0;
    let kind: TowerKind | null = null;
    let mixed = false;
    let anyCore = false;
    const tally = new Map<ModId, number>();
    for (const st of picked) {
      hp += st.hp;
      hpMax += st.hpMax;
      if (isCore(st)) {
        anyCore = true;
        continue;
      }
      const t = st as Tower;
      if (kind === null) kind = t.kind;
      else if (kind !== t.kind) mixed = true;
      for (const d of modsInMask(t.mods)) tally.set(d.id, (tally.get(d.id) ?? 0) + 1);
    }
    if (anyCore) mixed = kind !== null; // the core plus anything is a mixed bag
    const one = !mixed && kind !== null ? kind : null;
    return {
      n: picked.length,
      kind: one,
      unit: null,
      name: one
        ? TOWERS[one].name
        : anyCore && picked.length === 1
          ? "Core"
          : "Structures",
      hp: Math.ceil(hp),
      hpMax: Math.ceil(hpMax),
      // the plating that used to be a caption up here is the first chip
      // in this row now, on the same terms it was printed on before: one
      // number when every building picked wears the same, and nothing at
      // all when they disagree (status.ts)
      statuses: structSelectionChips(picked),
      // CATALOG ORDER, never tally order: the shelf at the other corner
      // lists attributes in that order and the two must not disagree about
      // which chip is which
      mods: TURRET_MOD_IDS.filter((id) => tally.has(id)).map((id) => ({
        id,
        n: tally.get(id)!,
      })),
    };
  }

  /** what is standing right now, in save shape */
  layout(): TowerPlacement[] {
    // the PLAYER's line, which is the only half of the board that is
    // theirs to save: a turret the swarm has taken (Conquest) is not a
    // placement to restore, and restoring one would hand it back
    return this.sim.towers
      .filter((t) => t.team === "player")
      .map((t) => ({ kind: t.kind, gx: t.gx, gy: t.gy }));
  }

  /**
   * Rebuild a saved layout, and return how much of it stood back up.
   *
   * Every placement goes through placeTower, so the map and the tech tree
   * both get a veto: a cell that stopped being rock since the layout was
   * saved, or a turret whose capacity has since been spent elsewhere in the
   * same list, simply drops out. A map edited under a save therefore loses
   * the towers that no longer fit rather than restoring them into walls.
   */
  applyLayout(towers: readonly TowerPlacement[]): number {
    let placed = 0;
    this.sim.batchPlacement(() => {
      for (const t of towers) if (this.sim.placeTower(t.gx, t.gy, t.kind) === "ok") placed++;
    });
    return placed;
  }

  /** show or hide the spawn layer's outline and the air routes off it */
  toggleRoutes(): void {
    this.showRoutes = !this.showRoutes;
  }

  reset(): void {
    this.sim.reset();
    // the run's modules went with the sim's reset (Sim.mods, Sim.relics), so
    // the odds Ascendancy was bending go back to the opening table and the
    // reveal empties
    this.rarityWeights = TURRET_ODDS.live();
    this.lastDraw = null;
    this.modDraws = 0;
    this.soakLayer = null; // a new level is a new coastline
    this.spawnOutline = null; // ...and new mouths
    this.mmBase = null; // ...and a new ground under the minimap
    this.menuOpen = false;
    this.fitToMap();
    this.renderer.rebuildTerrain(this.sim, GAME_LAYERS);
  }

  stats(): Stats {
    return {
      units: this.sim.n,
      kills: this.sim.kills,
      simMs: this.simEma,
      fps: Math.round(this.fpsEma),
      zoom: this.zoom,
    };
  }

  /** visible world width/height in world px, given the cover scale and zoom */
  private visW(): number {
    return this.uiCanvas.width / (this.scale * this.zoom);
  }

  private visH(): number {
    return this.uiCanvas.height / (this.scale * this.zoom);
  }

  /**
   * The zoom floor: fit the whole map on screen, then keep going by
   * ZOOM_FIT_PAD so it sits in the void rather than against the frame.
   *
   * this.scale is the COVER scale (the axis that overflows), so dividing
   * the FIT scale by it gives fit in zoom units — at most 1, and exactly 1
   * only when the map and the viewport share an aspect ratio. A zero-sized
   * canvas has no meaningful fit, so it falls back to cover and lets
   * resize() sort it out once there is a layout.
   */
  private minZoom(): number {
    return fitZoom(
      this.uiCanvas.width,
      this.uiCanvas.height,
      this.worldW,
      this.worldH,
      this.scale,
    );
  }

  /** re-read the loaded map's size, refit the camera to it, and open on
   *  the core (START_ZOOM) */
  private fitToMap(): void {
    this.worldH = this.sim.terrain.rows * CELL;
    this.worldW = this.sim.terrain.cols * CELL;
    this.resize();
    this.zoom = clamp(START_ZOOM, this.minZoom(), ZOOM_MAX);
    this.lookAt(this.sim.core.x, this.sim.core.y);
  }

  private clampCamera(): void {
    // a zero-sized canvas (hidden tab, collapsed layout) divides by zero in
    // any pointer-driven pan, and a NaN camera renders the world nowhere —
    // a blank screen. Snap back to the origin rather than showing void
    if (!Number.isFinite(this.tlx)) this.tlx = 0;
    if (!Number.isFinite(this.tly)) this.tly = 0;
    // THE CENTRE OF THE SCREEN STAYS OVER THE MAP. That is the whole rule,
    // and it is the only one: pan, drag and WASD all run out into the void
    // exactly as if the map were a small island in a much bigger field,
    // rather than stopping dead at the edge of the terrain.
    //
    // It replaces a pair of clamps that pinned the camera inside the map,
    // which at any zoom past fit had no range left to give and had to
    // centre the map instead — the camera going rigid the moment the whole
    // map was on screen. Reading the constraint off the screen's centre
    // instead of its corners is what makes one line cover every zoom: the
    // range is always exactly the map, so it is never empty and never
    // backwards, and the furthest you can push an edge is to the middle of
    // the screen — far enough to look at a corner in isolation, never far
    // enough to lose the map off the side.
    const halfW = this.visW() / 2, halfH = this.visH() / 2;
    this.tlx = clamp(this.tlx, -halfW, this.worldW - halfW);
    this.tly = clamp(this.tly, -halfH, this.worldH - halfH);
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round((this.glCanvas.clientWidth || this.worldW) * dpr);
    const bh = Math.round((this.glCanvas.clientHeight || H) * dpr);
    // only skip the canvas attribute writes (they clear the canvas) — the
    // scale must ALWAYS be recomputed: a hot-reload recreates Game on the
    // same canvas element with matching backing size, and an early return
    // here left this.scale at its placeholder 1, rendering the world at
    // raw device pixels (cropped right, dead band below) until a full
    // page reload. That was the "zoom is fundamentally broken" bug.
    if (bw !== this.glCanvas.width || bh !== this.glCanvas.height) {
      this.glCanvas.width = bw;
      this.glCanvas.height = bh;
      this.uiCanvas.width = bw;
      this.uiCanvas.height = bh;
    }
    this.scale = Math.max(bw / this.worldW, bh / this.worldH);
    this.zoom = clamp(this.zoom, this.minZoom(), ZOOM_MAX);
    this.clampCamera();
  }

  /** mouse event -> world coordinates through the camera */
  private mouseWorld(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.uiCanvas.getBoundingClientRect();
    // laid out at zero size: there is no meaningful world point, and
    // dividing by the rect would poison the camera with NaN
    if (r.width <= 0 || r.height <= 0) return { x: this.tlx, y: this.tly };
    return {
      x: this.tlx + ((e.clientX - r.left) / r.width) * this.visW(),
      y: this.tly + ((e.clientY - r.top) / r.height) * this.visH(),
    };
  }

  private readonly frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.05) || 0.016;
    this.last = now;

    // keyboard pan: PAN_RATE of a viewport per second, times the setting
    const panStep = PAN_RATE * this.panSpeed * dt;
    let panX = 0, panY = 0;
    for (const code of this.keysDown) {
      const dir = PAN_KEYS[code];
      panX += dir[0];
      panY += dir[1];
    }
    if (panX !== 0 || panY !== 0) {
      this.tlx += Math.sign(panX) * this.visW() * panStep;
      this.tly += Math.sign(panY) * this.visH() * panStep;
      this.clampCamera();
    }

    const t0 = performance.now();
    // a lost game freezes mid-carnage: the score screen sits over the
    // exact frame the base fell on, until retry resets the sim. The esc
    // menu holds the sim the same way. A won game keeps running — the
    // field is empty and the last death effects get to play out
    if (!this.paused && !this.menuOpen && !this.sim.lost()) {
      // fixed 60Hz stepping off banked real time (see SIM_DT): a 144Hz
      // display steps on some frames and not others, a 30Hz one steps
      // twice a frame, and both play the same game at the same rate
      this.simAcc += dt;
      for (let s = 0; this.simAcc >= SIM_DT && s < SIM_STEPS_MAX; s++) {
        this.simAcc -= SIM_DT;
        for (let i = 0; i < this.speed; i++) this.sim.update(SIM_DT);
      }
      // time the step cap refused is forfeit, not owed (see SIM_STEPS_MAX)
      if (this.simAcc >= SIM_DT) this.simAcc = 0;
    } else {
      // a held sim owes nothing: without this, time banked while paused
      // would replay as a burst of catch-up steps on unpause
      this.simAcc = 0;
    }
    const simMs = performance.now() - t0;

    if (this.diagZooms.length) {
      // each scan looks at the middle of the map, not wherever the camera
      // happened to be — the spawn corner at a close zoom is mostly void
      this.zoom = this.diagZooms[0];
      const k = this.scale * this.zoom;
      this.tlx = (this.worldW - this.glCanvas.width / k) / 2;
      this.tly = (this.worldH - this.glCanvas.height / k) / 2;
    }
    this.renderer.render(
      this.sim,
      this.zoom,
      -this.tlx * this.zoom,
      -this.tly * this.zoom,
      this.scale,
    );
    if (this.diagZooms.length) this.diagScan();
    this.drawOverlay();
    this.drawMinimap();

    this.fpsEma += (1 / Math.max(dt, 1e-4) - this.fpsEma) * 0.05;
    this.simEma += (simMs - this.simEma) * 0.1;
    this.raf = requestAnimationFrame(this.frame);
  };

  /**
   * Paint the Hydrophobic mask onto a COLS x ROWS bitmap — ONLY where a
   * turret could actually stand, which is open ground (the first test
   * canPlace makes: not blocked — shallows included, deep water not). The
   * mask itself covers the hills and the deep as well, and lighting those
   * would be telling the player about ground they can never build on in
   * the first place.
   *
   * Periwinkle, the same blue the codex draws a special rule in
   * (mutationFace.tsx) — a player who has read the card should recognise
   * the colour on the ground without being told twice.
   */
  /**
   * The OUTLINE of the painted spawn layer: every edge a spawn cell shares
   * with a cell that is not one. Interior edges are left out, so a solid
   * mouth is drawn as its own silhouette rather than as a grid of boxes.
   */
  private buildSpawnOutline(): Path2D {
    const p = new Path2D();
    const spawn = this.sim.terrain.spawn;
    const at = (x: number, y: number): number =>
      x < 0 || y < 0 || x >= COLS || y >= ROWS ? 0 : spawn[y * COLS + x];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (!spawn[y * COLS + x]) continue;
        const x0 = x * CELL, y0 = y * CELL;
        if (!at(x, y - 1)) { p.moveTo(x0, y0); p.lineTo(x0 + CELL, y0); }
        if (!at(x, y + 1)) { p.moveTo(x0, y0 + CELL); p.lineTo(x0 + CELL, y0 + CELL); }
        if (!at(x - 1, y)) { p.moveTo(x0, y0); p.lineTo(x0, y0 + CELL); }
        if (!at(x + 1, y)) { p.moveTo(x0 + CELL, y0); p.lineTo(x0 + CELL, y0 + CELL); }
      }
    return p;
  }

  private buildSoakLayer(): HTMLCanvasElement | null {
    const mask = this.sim.waterloggedMask();
    if (!mask) return null;
    const cv = document.createElement("canvas");
    cv.width = COLS;
    cv.height = ROWS;
    const cc = cv.getContext("2d");
    if (!cc) return null;
    const img = cc.createImageData(COLS, ROWS);
    const { blocked } = this.sim.terrain;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || blocked[i]) continue;
      const p = i * 4;
      img.data[p] = 0x8a;
      img.data[p + 1] = 0xa2;
      img.data[p + 2] = 0xff;
      img.data[p + 3] = 255;
    }
    cc.putImageData(img, 0, 0);
    return cv;
  }

  /**
   * THE MINIMAP: the whole map, never zoomed, with everything the field
   * knows drawn over the ground at a cell a dot —
   *
   *   the PLAYER'S EVERYTHING white — the core, every turret and wall
   *   (a shell still going up in a dimmer white) and every body of
   *   theirs, wherever it is;
   *   the ENEMY red — every body in sight (and none out of it: the
   *   minimap keeps the fog's promise), and the map's shield towers
   *   wherever they have once been seen, a building being a thing that
   *   stays put;
   *   the VIEWPORT as a white frame, which a press or a drag on the map
   *   moves (onMmDown).
   *
   * Two layers: the ground, painted once per map (paintThumb), and one
   * image rebuilt every frame with the rest, both blown up to MM_SCALE
   * with no smoothing so a dot stays a square. Only the GROUND is at the
   * map's true scale: bodies and structures are dilated to a readable
   * square (MM_UNIT_PX, MM_STRUCT_PX), because at a cell a pixel shrunk
   * into the corner a body is a fraction of a screen pixel and reads as
   * nothing at all. Skipped entirely while
   * React has not handed a canvas over (attachMinimap).
   */
  private drawMinimap(): void {
    const mm = this.mmCanvas;
    if (!mm) return;
    const T = this.sim.terrain;
    const cols = T.cols, rows = T.rows;
    const w = cols * MM_SCALE, h = rows * MM_SCALE;
    if (mm.width !== w || mm.height !== h) {
      mm.width = w;
      mm.height = h;
    }
    const c = mm.getContext("2d");
    if (!c) return;
    if (!this.mmBase) {
      this.mmBase = document.createElement("canvas");
      paintThumb(T, rows, this.mmBase, MM_HILL_SHADE);
    }
    if (!this.mmLayer) {
      this.mmLayer = document.createElement("canvas");
      this.mmLayer.width = cols;
      this.mmLayer.height = rows;
    }
    const lc = this.mmLayer.getContext("2d");
    if (!lc) return;
    // the layer is repainted whole every frame, so the buffer is reused
    // and cleared rather than re-allocated (see mmPixels)
    let img = this.mmPixels;
    if (!img || img.width !== cols || img.height !== rows)
      img = this.mmPixels = lc.createImageData(cols, rows);
    const d = img.data;
    d.fill(0);
    const dot = (x: number, y: number, r: number, g: number, b: number): void => {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      const o = (y * cols + x) * 4;
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255;
    };
    const box = (gx: number, gy: number, sz: number, r: number, g: number, b: number): void => {
      for (let y = gy; y < gy + sz; y++) for (let x = gx; x < gx + sz; x++) dot(x, y, r, g, b);
    };
    // HOW MANY CELLS A MARK SPANS so that it reads at MM_*_PX on screen
    // (see those). The CSS width is measured rarely and kept, and the
    // fallback while it is unknown is the backing store's own width,
    // which asks for no dilation at all
    if (this.mmCssTick-- <= 0) {
      this.mmCssTick = MM_CSS_EVERY;
      this.mmCssW = mm.clientWidth || w;
    }
    const perCell = (this.mmCssW || w) / cols;
    const unitSz = Math.max(1, Math.round(MM_UNIT_PX / perCell));
    const structSz = Math.max(1, Math.round(MM_STRUCT_PX / perCell));
    /** a structure's mark: its own footprint, grown to structSz if that is
     *  bigger, and kept centred on the footprint either way */
    const struct = (gx: number, gy: number, sz: number, r: number, g: number, b: number): void => {
      const s = Math.max(sz, structSz), off = (s - sz) >> 1;
      box(gx - off, gy - off, s, r, g, b);
    };
    // the swarm red, and everything of ours white, so the map answers
    // "us or them" at a glance
    // instead of asking for three colours to be told apart at a pixel each
    const { upx, upy, n } = this.sim;
    const uoff = (unitSz - 1) >> 1;
    for (let i = 0; i < n; i++) {
      const gx = (upx[i] / CELL) | 0, gy = (upy[i] / CELL) | 0;
      box(gx - uoff, gy - uoff, unitSz, 0xf2, 0x55, 0x55);
    }
    // the map's shield towers, wherever they have been seen
    for (const s of this.sim.shieldTowers) {
      if (s.hp <= 0) continue;
      struct(s.gx, s.gy, SHIELD_TOWER_SIZE, 0xf2, 0x55, 0x55);
    }
    // ...and the player's, over everything: the line is what the map is read
    // for — with the swarm's conquered turrets (Conquest) in its own red,
    // so a lost emplacement is visible on the minimap as a hole in the line
    for (const t of this.sim.towers)
      if (t.team === "player") struct(t.gx, t.gy, t.size, 0xff, 0xff, 0xff);
      else struct(t.gx, t.gy, t.size, 0xf2, 0x55, 0x55);
    struct(T.base.x, T.base.y, T.base.size, 0xff, 0xff, 0xff);
    lc.putImageData(img, 0, 0);

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.mmBase, 0, 0, cols, rows, 0, 0, w, h);
    c.drawImage(this.mmLayer, 0, 0, cols, rows, 0, 0, w, h);
    // THE VIEWPORT'S FRAME: where on the whole map the screen is looking.
    // Kept inside the minimap (a view run out into the void past the map
    // would otherwise carry its frame off the edge and lose a side), and
    // drawn white over a dark outline so it reads on the pale ground, the
    // dark rock and the white line alike
    const k = MM_SCALE / CELL;
    const fx0 = clamp(this.tlx * k, 1, w - 1), fy0 = clamp(this.tly * k, 1, h - 1);
    const fx1 = clamp((this.tlx + this.visW()) * k, 1, w - 1);
    const fy1 = clamp((this.tly + this.visH()) * k, 1, h - 1);
    c.lineJoin = "miter";
    c.strokeStyle = "rgba(0,0,0,0.8)";
    c.lineWidth = 4;
    c.strokeRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
    c.strokeStyle = "#ffffff";
    c.lineWidth = 2;
    c.strokeRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  }

  /**
   * THE SELECTION MARQUEE while one is being dragged over the board.
   *
   * The RING under a selected body is the renderer's, not this canvas's
   * (Renderer.pushUnitPass) — it is the team's own amber at full strength,
   * so a selection is a mark the board already speaks in — and the health
   * over a body is drawUnitBars', wherever that body came from. What is
   * left here belongs to the HAND rather than to the board.
   */
  private drawSelection(c: CanvasRenderingContext2D): void {
    if (this.selecting && this.selDragPx > SEL_DRAG_PX) {
      const x = Math.min(this.selFrom.x, this.selTo.x), y = Math.min(this.selFrom.y, this.selTo.y);
      const w = Math.abs(this.selTo.x - this.selFrom.x), h = Math.abs(this.selTo.y - this.selFrom.y);
      c.fillStyle = "rgba(255,211,127,0.09)";
      c.fillRect(x, y, w, h);
      c.strokeStyle = SELECT_RING;
      c.lineWidth = 1;
      c.strokeRect(x, y, w, h);
    }
  }


  /**
   * A STACK OF BARS OVER ONE THING ON THE BOARD — the game's only readout
   * for "how far along is this", drawn on the overlay in world space so it
   * scales with the zoom like everything else on the field.
   *
   * A bar is a fraction and a colour. They stack UPWARDS from `topY` in
   * the order given, so the caller's order is the reading order from the
   * body up: hp first (nearest the thing it belongs to, where a player
   * looks for it), then whatever work it is doing above that. Nothing is
   * drawn for an empty list, so a building with nothing to say wears
   * nothing.
   *
   * These replaced the radial ring the shells used to wear. A ring says
   * "something is happening here" and nothing more: it cannot be stacked,
   * two of them cannot be told apart at a glance, and a quarter-full ring
   * and a three-quarter-full one look alike at the zoom this game is
   * played at. A bar is read left to right at any size.
   */
  private drawBars(
    c: CanvasRenderingContext2D,
    cx: number,
    topY: number,
    width: number,
    bars: ReadonlyArray<{ v: number; col: string }>,
  ): number {
    if (bars.length === 0) return topY;
    const w = Math.max(width, BAR_MIN_W);
    const x = cx - w / 2;
    let y = topY - BAR_GAP;
    for (const b of bars) {
      y -= BAR_H;
      c.fillStyle = BAR_BACK;
      c.fillRect(x, y, w, BAR_H);
      const f = clamp(b.v, 0, 1);
      if (f > 0) {
        c.fillStyle = b.col;
        c.fillRect(x, y, w * f, BAR_H);
      }
      c.strokeStyle = BAR_EDGE;
      c.lineWidth = 0.5;
      c.strokeRect(x, y, w, BAR_H);
      y -= BAR_GAP;
    }
    c.lineWidth = 1;
    // WHERE THE STACK ENDED, so the status row knows what to sit on top
    // of (drawStatusRow). A body wearing a health bar puts its symbols
    // above it; one wearing none puts them where the bar would have been
    return y;
  }

  /**
   * THE STATUS SYMBOLS OVER ONE THING ON THE BOARD (status.ts) — a row of
   * little pictures on dark chips, sitting on top of whatever bars the
   * thing is already wearing.
   *
   * THEY GO ON THE FIELD AND NOT ONLY IN THE PANEL because the panel
   * answers about ONE thing and the field is where the question is
   * actually asked: which half of that push is on fire, which of those
   * turrets is rotting, whether the wall that is not shooting is the one
   * the swarm took. A row over the body is the only place that reads
   * without clicking anything.
   *
   * NOTHING IS DRAWN HERE. The row is QUEUED, and every row on the board
   * is painted in one pass at the end of the frame (flushStatusRows).
   * That is not tidiness, it is the whole performance of the feature —
   * see the comment on the flush.
   */
  private queueStatusRow(cx: number, topY: number, ids: readonly StatusId[], n: number): void {
    if (n === 0) return;
    this.sqX.push(cx);
    this.sqY.push(topY);
    this.sqN.push(n);
    for (let i = 0; i < n; i++) this.sqIds.push(ids[i]);
  }

  /** the queue, reused frame to frame: a row's centre, the top of the
   *  stack it sits on, how many symbols it has, and the symbols
   *  themselves flattened across every row */
  private readonly sqX: number[] = [];
  private readonly sqY: number[] = [];
  private readonly sqN: number[] = [];
  private readonly sqIds: StatusId[] = [];

  /**
   * EVERY STATUS ROW ON THE BOARD, IN ONE PASS, IN DEVICE PIXELS.
   *
   * THIS IS THE SHAPE THE FIRST CUT GOT WRONG, and it is worth saying why
   * because the mistake is an easy one to make again. The symbols used to
   * be FILLED AS GEOMETRY, in world space, one body at a time: a save, a
   * scale, and three to five Path2D fills of twenty-odd sub-rectangles
   * each. It looked cheap — a timer around the call reads hundredths of a
   * millisecond — because what costs is the canvas RASTERISING those
   * paths, which happens after the call returns. A wave soaked by a
   * tsunami puts a few hundred symbols up at once, and the frame died
   * under a couple of thousand path fills that no profiler pointed at.
   *
   * Two things fix it, and both of them are this function:
   *
   * ONE BLIT A SYMBOL. The drawing is rasterised once per size and cached
   * (statusArt.ts statusSprite), so a symbol is a drawImage of a ready
   * bitmap — the cheapest thing a 2D context does.
   *
   * ONE TRANSFORM FOR THE WHOLE BOARD. Rows are collected while the
   * passes walk the board in world space and painted here in DEVICE
   * space: one setTransform, one path for every chip's ground, then the
   * blits. Nothing per row, and the sprite lands on whole pixels, so the
   * symbols are crisp instead of the smear that filling a 12-grid at 2.6
   * px produced.
   */
  private flushStatusRows(c: CanvasRenderingContext2D): void {
    const rows = this.sqN.length;
    if (rows === 0) return;
    const k = this.scale * this.zoom; // world px -> device px
    const px = Math.max(2, Math.round(STATUS_PX * k));
    const step = px + Math.max(1, Math.round(STATUS_SP * k));
    const lift = STATUS_GAP * k;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    // where each row starts, worked out once and read twice
    const xs = this.sqRowX, ys = this.sqRowY;
    xs.length = 0;
    ys.length = 0;
    for (let r = 0; r < rows; r++) {
      const n = this.sqN[r];
      xs.push(Math.round((this.sqX[r] - this.tlx) * k - (n * step - (step - px)) / 2));
      ys.push(Math.round((this.sqY[r] - this.tly) * k - lift - px));
    }
    // NO GROUND UNDER THE SYMBOLS. Each used to sit on a dark chip, the
    // bars' own backing (BAR_BACK) squared off around it — which read as
    // a row of black tiles with something in them rather than as a row of
    // marks on the body, and at seven pixels the tile is most of what the
    // eye gets. The drawings are solid shapes in their own colours
    // (statusArt.ts) and carry themselves over terrain and hull alike.
    let at = 0;
    for (let r = 0; r < rows; r++) {
      const n = this.sqN[r];
      for (let i = 0; i < n; i++) c.drawImage(statusSprite(this.sqIds[at + i], px), xs[r] + i * step, ys[r]);
      at += n;
    }
    c.restore();
    this.sqX.length = 0;
    this.sqY.length = 0;
    this.sqN.length = 0;
    this.sqIds.length = 0;
  }

  private readonly sqRowX: number[] = [];
  private readonly sqRowY: number[] = [];

  /**
   * DOES A BODY ON THIS SIDE WEAR ITS HEALTH RIGHT NOW? The one place the
   * Interface tab's two knobs are read, so a unit, a turret, a wall and
   * the core all answer the question the same way.
   *
   * `selected` is the standing exception to every mode but `never`: a
   * player who has picked a squad or a building out of a board is asking
   * about those, and a hurt one in the picked set says so whatever the
   * field at large is set to. A full-health selection still wears nothing
   * — the amber ring or outline on it is the mark that says it is picked.
   */
  private barsOn(ally: boolean, f: number, selected: boolean): boolean {
    const mode = ally ? this.allyBars : this.enemyBars;
    if (mode === "never") return false;
    if (mode === "always") return true;
    if (selected && f < 1) return true;
    return f < 1;
  }

  /**
   * EVERY BODY'S HEALTH, one bar over each, on whatever terms the
   * Interface tab is set to (barsOn) — and whatever is happening to it,
   * as a row of symbols over that (status.ts). The player's own run the
   * HUD's green-amber-red ramp; the swarm's are red throughout
   * (ENEMY_HP), so a glance at a melee says which bars belong to which
   * army without reading a single length.
   */
  private drawUnitBars(c: CanvasRenderingContext2D): void {
    const sim = this.sim;
    const { upx, upy, urad, uhp, uhpmax, n } = sim;
    const bars = this.barBuf;
    const ids = this.statusBuf;
    // the two knobs gate the BAR and not the symbols. A player who turned
    // health bars off asked for a field without health bars on it; "that
    // one is on fire" is a different fact, and the only place it is ever
    // said
    const noBars = this.allyBars === "never" && this.enemyBars === "never";
    const symbols = this.statusOn();
    // ...and on `selected` the row belongs to ONE body: whatever the last
    // click marked (Sim.inspectedUnit), which is the same body the
    // inspector is printing the full row for
    const onlyMarked = this.statusMarks === "selected";
    const only = onlyMarked ? sim.inspectedUnit : -1;
    // nothing to draw at all: no bars anywhere, and either no symbols or
    // a `selected` field with nothing marked to put them over
    if (noBars && (!symbols || (onlyMarked && only < 0))) return;
    // WHAT IS ACTUALLY ON THE SCREEN. This loop runs over every body on
    // the map, and the map is several windows wide at the zoom it opens
    // on — so most of what it was drawing was landing outside the canvas
    // and being thrown away by the clip. The pad is the tallest stack a
    // body can wear (the widest hull is 72 px of radius, and the bar and
    // the symbols sit above that) so nothing whose MARKS are on screen is
    // culled by its centre being off it
    const x0 = this.tlx - VIEW_PAD, y0 = this.tly - VIEW_PAD;
    const x1 = this.tlx + this.visW() + VIEW_PAD, y1 = this.tly + this.visH() + VIEW_PAD;
    for (let i = 0; i < n; i++) {
      if (uhp[i] <= 0) continue;
      const bx = upx[i], by = upy[i];
      if (bx < x0 || bx > x1 || by < y0 || by > y1) continue;
      bars.length = 0;
      if (!noBars) {
        const f = clamp(uhp[i] / Math.max(1, uhpmax[i]), 0, 1);
        if (this.barsOn(false, f, false)) bars.push({ v: f, col: ENEMY_HP });
      }
      // THE GATE, and why this is affordable over eight hundred bodies:
      // six typed-array reads, no allocation, and a no for nearly all of
      // them (status.ts). Only the ones carrying something pay for a row
      const flagged = symbols && (!onlyMarked || i === only) && unitHasFieldStatus(sim, i);
      if (bars.length === 0 && !flagged) continue;
      const r = Math.max(urad[i] * 1.25, 7);
      const top = this.drawBars(c, bx, by - r, Math.max(r * 2, BAR_MIN_W), bars);
      if (flagged) this.queueStatusRow(bx, top, ids, unitFieldStatuses(sim, i, ids));
    }
  }

  /**
   * IS A STATUS SYMBOL BIG ENOUGH TO BE ONE RIGHT NOW (STATUS_MIN_PX)?
   * Asked ONCE A FRAME rather than per body, because it is a fact about
   * the camera and not about anything on the board.
   *
   * It is the worst case's whole bill. Eight hundred bodies under a
   * wave's soak is five thousand symbols a frame; pulled all the way back
   * to look at the map, every one of them lands on less than half a pixel
   * and none of them is worth what it costs.
   */
  private statusLegible(): boolean {
    return STATUS_PX * this.scale * this.zoom >= STATUS_MIN_PX;
  }

  /**
   * DOES THE FIELD WEAR STATUS SYMBOLS AT ALL right now — the Interface
   * tab's knob (setStatusMarks) and the legibility floor in one question,
   * since the answer to either being no is the same no. `selected` still
   * answers yes here; WHICH bodies it lets through is the caller's, and
   * each of the two passes knows its own half of the selection.
   */
  private statusOn(): boolean {
    return this.statusMarks !== "never" && this.statusLegible();
  }

  /** scratch for the two passes over the board, reused rather than
   *  rebuilt: one body's bars, and one body's status symbols */
  private readonly barBuf: { v: number; col: string }[] = [];
  private readonly statusBuf: StatusId[] = [];

  /**
   * Every structure's bar: what is left of it, on the Interface tab's
   * terms (barsOn) — the same terms a unit's health is on, because a wall
   * and a walker are both things with health standing on the board. The
   * construction bar that used to ride above it is gone with the shell
   * (types.ts): nothing is ever half-built any more.
   *
   * The swarm's buildings get the same treatment on ground the player has
   * seen, because "how much is left of that bunker" is the same question
   * from either side of it — asked in red, like its units' (ENEMY_HP).
   *
   * THE CORE gets the mining bar too, since it ships on the same clock
   * (Sim.coreMineT) — it is the run's first and largest earner, and a bar
   */
  private drawStructureBars(c: CanvasRenderingContext2D): void {
    const bars: { v: number; col: string }[] = [];
    // A BUILDING IN THE SELECTION COUNTS AS PICKED, exactly as a body in it
    // does (barsOn): asked for only when there is a selection to ask about,
    // since selectedStructs copies the set to answer
    const picked = this.sim.selectedStructN > 0 ? new Set(this.sim.selectedStructs) : null;
    const symbols = this.statusOn();
    // on `selected`, a building wears its row when it is in hand or when
    // it is the one the last click marked — a taken turret is marked
    // rather than selected (pickAt), and it is exactly the thing whose
    // row a player is asking after
    const onlyPicked = this.statusMarks === "selected";
    const marked = onlyPicked ? this.sim.inspectedTower : null;
    // ...and the same window test the bodies get: a board can be three
    // hundred turrets and the window holds a fraction of them
    const x0 = this.tlx - VIEW_PAD, y0 = this.tly - VIEW_PAD;
    const x1 = this.tlx + this.visW() + VIEW_PAD, y1 = this.tly + this.visH() + VIEW_PAD;
    const off = (x: number, y: number): boolean => x < x0 || x > x1 || y < y0 || y > y1;
    // the core's shipment, and what is left of the thing the whole run is
    // spent defending — one body, both bars, on the player's own terms
    const core = this.sim.core;
    const csz = core.size * CELL;
    bars.length = 0;
    const cf = clamp(core.hp / Math.max(1, core.hpMax), 0, 1);
    if (this.barsOn(true, cf, picked?.has(core) === true))
      bars.push({ v: cf, col: hpColor(cf) });
    this.drawBars(c, core.x, core.y - csz / 2, csz - 2, bars);
    for (const t of this.sim.towers) {
      if (off(t.x, t.y)) continue;
      const st = structStats(t.kind);
      const sz = st.size * CELL;
      bars.length = 0;
      const hpMax = t.hpMax;
      const f = clamp(t.hp / Math.max(1, hpMax), 0, 1);
      // a turret the swarm has taken (Conquest) is read as the swarm: its
      // bar is on the ENEMY setting and in the enemy red, exactly as its
      // bodies' are, so "how much is left of that" reads the same whether
      // the thing standing there walks or not
      const own = t.team === "player";
      if (this.barsOn(own, f, own && picked?.has(t) === true))
        bars.push({ v: f, col: own ? hpColor(f) : ENEMY_HP });
      const top = this.drawBars(c, t.x, t.y - sz / 2, sz - 2, bars);
      // ...and WHAT IS BEING DONE TO IT (status.ts) over the bar: the rot
      // eating it, the dying neighbour's charge, the water tax it was
      // built into, the fact that it is not ours any more. Gated the same
      // way a body's is, and answering no for the plain turret a board is
      // mostly made of
      const mine = !onlyPicked || t === marked || picked?.has(t) === true;
      if (symbols && mine && structHasFieldStatus(t))
        this.queueStatusRow(t.x, top, this.statusBuf, structFieldStatuses(t, this.statusBuf));
      // THE MOD PIP (mods.ts): a turret that won one of the
      // rolls at its placement wears a dot in the corner of its footprint,
      // in the band of the BEST attribute it carries. It is drawn always
      // and not on hover, because the whole point of a chance-based
      // attribute is that a player can look at a patch of thirty-six and
      // see which four of them came out special.
      if (t.mods !== 0) {
        const band = maskRarity(t.mods);
        if (band) {
          const r = Math.max(1.6, sz * 0.075);
          c.beginPath();
          c.arc(t.x + sz / 2 - r - 1.5, t.y - sz / 2 + r + 1.5, r, 0, Math.PI * 2);
          c.fillStyle = RARITY[band].color;
          c.fill();
          c.lineWidth = 0.8;
          c.strokeStyle = "rgba(0,0,0,0.75)";
          c.stroke();
        }
      }
    }
    // THE SWARM'S SHIELD TOWERS (mutation.ts) stand outside the tower list
    // and are buildings all the same. The BODY's health is what a bar can
    // say; the dome over it is the renderer's business and is drawn as
    // what it is, a dome
    const ssz = SHIELD_TOWER_SIZE * CELL;
    for (const s of this.sim.shieldTowers) {
      if (s.hp <= 0 || off(s.x, s.y)) continue;
      const f = clamp(s.hp / Math.max(1, s.hpMax), 0, 1);
      if (!this.barsOn(false, f, false)) continue;
      this.drawBars(c, s.x, s.y - ssz / 2, ssz - 2, [{ v: f, col: ENEMY_HP }]);
    }
  }

  private drawOverlay(): void {
    const c = this.uictx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
    // world-space transform through the camera
    const s = this.scale * this.zoom;
    c.setTransform(s, 0, 0, s, -this.tlx * s, -this.tly * s);

    // THE TAXED SHORE, while a turret is in hand. Under the routes and the
    // ghost, both of which are decisions being made ON TOP of it
    if (this.buildKind && this.sim.hydrophobicOn) {
      const layer = this.soakLayer ?? (this.soakLayer = this.buildSoakLayer());
      if (layer) {
        c.globalAlpha = 0.3;
        // one pixel per cell blown up to CELL: no smoothing, or the edge
        // of the tax would blur across the cells it does not cover
        c.imageSmoothingEnabled = false;
        c.drawImage(layer, 0, 0, W, H);
        c.imageSmoothingEnabled = true;
        c.globalAlpha = 1;
      }
    }

    // ROUTES, under everything else so a selection ring still reads on top
    if (this.showRoutes) {
      const col = SPAWN_STYLE.css;
      for (const r of this.sim.airRoutes()) {
        const p = r.pts;
        if (p.length < 4) continue;
        c.strokeStyle = col;
        c.globalAlpha = 0.5;
        c.lineWidth = 2;
        c.setLineDash([10, 8]);
        c.beginPath();
        c.moveTo(p[0], p[1]);
        for (let k = 2; k < p.length; k += 2) c.lineTo(p[k], p[k + 1]);
        c.stroke();
        c.setLineDash([]);
        // the arrowhead settles which end is the destination, and it lies
        // along the LAST leg — the route is a curve now, so the heading of
        // the whole line is not the heading it arrives on
        const ex = p[p.length - 2], ey = p[p.length - 1];
        const a = Math.atan2(ey - p[p.length - 3], ex - p[p.length - 4]);
        const hx = ex - Math.cos(a) * 14, hy = ey - Math.sin(a) * 14;
        c.globalAlpha = 0.85;
        c.beginPath();
        c.moveTo(ex, ey);
        c.lineTo(hx - Math.sin(a) * 7, hy + Math.cos(a) * 7);
        c.lineTo(hx + Math.sin(a) * 7, hy - Math.cos(a) * 7);
        c.closePath();
        c.fillStyle = col;
        c.fill();
      }
      // THE SPAWN TILES THEMSELVES, outlined rather than filled. The pads
      // the author painted are not drawn in a match (GAME_LAYERS) — a
      // board permanently splashed red is not what a player should be
      // staring at — so this outline is the whole answer to "where does
      // the swarm come from", and it is here only while the routes are up.
      //
      // Built once per terrain into a Path2D and stroked from there: a map
      // may paint thousands of tiles, and walking them per frame is the one
      // thing this overlay must not do.
      c.strokeStyle = col;
      c.globalAlpha = 0.9;
      c.lineWidth = 2;
      c.stroke(this.spawnOutline ?? (this.spawnOutline = this.buildSpawnOutline()));
      c.globalAlpha = 1;
    }

    // THE SELECTED BUILDINGS: a footprint outline on every one of them,
    // and a range ring only when the selection is ONE building. A marquee
    // over a corner of the board is thirty turrets and thirty overlapping
    // discs, which is a screen nobody can see the fight through — and a
    // ring answers "how far does THIS one reach", a question a crowd does
    // not have an answer to anyway. The sim drops a building from the
    // selection as it leaves the board (removeTower), so nothing here can
    // be drawn over bare ground
    const ring = this.sim.selectedStructN === 1;
    for (const st of this.sim.selectedStructs) {
      const size = st.size;
      if (ring && !isCore(st)) {
        // the LIVE range, not the table's: an upgrade branch that lengthened
        // this turret's reach has to move the ring it is drawn with, or the
        // ring becomes a lie about what the turret can shoot (Sim.statsFor)
        const range = (st as Tower).spec.range;
        if (range > 0) {
          c.beginPath();
          c.arc(st.x, st.y, range, 0, Math.PI * 2);
          c.fillStyle = "rgba(255,211,127,0.06)";
          c.fill();
          c.strokeStyle = "rgba(255,211,127,0.7)";
          c.lineWidth = 1.5;
          c.stroke();
        }
      }
      c.strokeStyle = "rgba(255,211,127,0.7)";
      c.lineWidth = 1.5;
      const selPx = size * CELL;
      c.strokeRect(st.gx * CELL + 1, st.gy * CELL + 1, selPx - 2, selPx - 2);
    }

    // THE INSPECT MARK (Sim.setInspectUnit / setInspectShieldTower): a
    // bobbing arrow over the tapped target, so which body the panel is
    // talking about is never in doubt. It wears the SELECTION's amber and
    // not a hostile red, because it is a cursor and not an order. Rides
    // sim time, so it holds still under pause and keeps pace at 4x exactly
    // as its target does
    const mark = this.sim.inspectMark();
    if (mark) {
      const bob = Math.sin(this.sim.time * 6) * 3;
      const ax = mark.x, ay = mark.top - 12 + bob;
      c.beginPath();
      c.moveTo(ax, ay + 10); // the tip, pointing down at the target
      c.lineTo(ax - 8, ay - 2);
      c.lineTo(ax - 3.5, ay - 2);
      c.lineTo(ax - 3.5, ay - 11);
      c.lineTo(ax + 3.5, ay - 11);
      c.lineTo(ax + 3.5, ay - 2);
      c.lineTo(ax + 8, ay - 2);
      c.closePath();
      c.fillStyle = "#FFD37F";
      c.fill();
    }

    // WHAT EVERY STRUCTURE IS DOING, as a stack of bars over it (drawBars)
    this.drawStructureBars(c);
    // ...and what every BODY has left, on the Interface tab's terms
    this.drawUnitBars(c);
    // ...and the STATUS SYMBOLS both passes queued, every one of them in a
    // single pass in device pixels (flushStatusRows). Drawing them where
    // they were queued, one body at a time in world space, is what made
    // the first cut of this feature cost a frame
    this.flushStatusRows(c);
    // ...and the rectangle being dragged over the board right now
    this.drawSelection(c);

    if (this.buildKind && this.hoverGx >= 0 && !this.panning) {
      // ONE GHOST, OR THE WHOLE RULER LINE. A shift-drag is aiming a run of
      // buildings that will land all at once on release, so all of it is
      // drawn — each one asking canPlace for itself, so the line shows
      // exactly which of them the ground will take
      const cells =
        this.ruler && this.building
          ? this.sim.rulerCells(this.rulerFrom.x, this.rulerFrom.y, this.hoverX, this.hoverY, this.buildKind)
          : this.heldCells({ x: this.hoverX, y: this.hoverY });
      this.drawGhosts(c, cells, this.buildKind);
    }
  }

  /**
   * THE GHOST — every footprint the hand is aiming, in ONE PASS PER TINT.
   *
   * A x9 fleet card is three hundred and sixty footprints and this runs
   * every frame the card is in hand, so it is drawn as three batched
   * paths (refused, soaked, ordinary) rather than as six canvas calls per
   * cell: the cells are sorted into buckets first and each bucket pays
   * one fill, one stroke and one stroke for its interior lines. What is
   * on screen is identical — each cell still asks canPlace for itself, so
   * the line still shows exactly which of them the ground will take.
   */
  private drawGhosts(
    c: CanvasRenderingContext2D,
    cells: readonly { gx: number; gy: number }[],
    kind: TowerKind,
  ): void {
    if (cells.length === 0) return;
    const sz = TOWERS[kind].size;
    const px = sz * CELL;
    // red marks anything that blocks the spot: walls, the base, units
    // underneath, or a placement the ground will not take. A legal spot
    // that the Hydrophobic rule TAXES is washed in the special rule's own
    // blue: the placement is allowed, so it must not read as refused, but
    // most of a turret's damage is worth a colour of its own
    const buckets: { gx: number; gy: number }[][] = [[], [], []];
    for (const cell of cells) {
      const ok = this.sim.canPlace(cell.gx, cell.gy, kind);
      const b = !ok ? 0 : this.sim.isWaterlogged(cell.gx, cell.gy, kind) ? 1 : 2;
      buckets[b].push(cell);
    }
    // THE WHOLE TURRET, ONCE PER FOOTPRINT — plate and head, pointing the
    // way it will point the moment it is built (ghostArt). It is the same
    // pair of PNGs the renderer packs and draws on the field, so the
    // ghost is a picture of the building and not of its hat.
    //
    // The composite is a cache that fills on first use; until both
    // sprites have loaded there is a frame or two of wash-only, which is
    // no worse than the lines this replaced.
    const img = this.ghostArt(kind);
    if (img) {
      c.imageSmoothingEnabled = false; // pixel art, blown up — no blur
      c.globalAlpha = GHOST_ALPHA;
      for (const group of buckets)
        for (const { gx, gy } of group) c.drawImage(img, gx * CELL, gy * CELL, px, px);
      c.globalAlpha = 1;
      c.imageSmoothingEnabled = true;
    }
    // ...and the wash over the ones that are not ordinary, one path each
    for (let b = 0; b < buckets.length; b++) {
      const group = buckets[b];
      const wash = GHOST_WASH[b];
      if (group.length === 0 || !wash) continue;
      c.fillStyle = wash;
      c.beginPath();
      for (const { gx, gy } of group) c.rect(gx * CELL, gy * CELL, px, px);
      c.fill();
    }
  }

  /** one sprite off the public folder, loaded once and kept for the life
   *  of the game — the ghost's two halves both come through here */
  private ghostSprites = new Map<string, HTMLImageElement>();
  private ghostSprite(src: string): HTMLImageElement {
    let img = this.ghostSprites.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      this.ghostSprites.set(src, img);
    }
    return img;
  }

  /**
   * THE GHOST'S PICTURE OF ONE KIND: the plate, and the head over it,
   * COMPOSED ONCE into an offscreen square and then stamped per
   * footprint.
   *
   * IT IS THE WHOLE BUILDING AND IT FACES THE RIGHT WAY. The ghost used
   * to be the head sprite alone, drawn straight off the file — so it
   * stood on nothing, and it pointed UP, because a Mindustry turret
   * sprite is drawn facing up while a turret on the field is built at
   * angle 0, which is facing +x. A player aiming a card was shown a
   * turret in a pose the board would never put it in. This is the same
   * pair the renderer draws (renderer.ts: UV_TOWER_BASE* under
   * UV_TURRETS, the tops packed pre-turned) and the same quarter turn,
   * so the ghost and the building it becomes are one picture.
   *
   * COMPOSING IT BEATS DRAWING IT. A x9 citadel is three hundred and
   * sixty footprints a frame; two draws and a transform each would be
   * over a thousand canvas calls, and the composite makes it one stamp
   * per footprint — fewer than the single-sprite ghost this replaces.
   *
   * Null until both halves have loaded — the caller draws the washes and
   * nothing else for those few frames.
   */
  private ghostComposites = new Map<TowerKind, HTMLCanvasElement>();
  private ghostArt(kind: TowerKind): HTMLCanvasElement | null {
    const done = this.ghostComposites.get(kind);
    if (done) return done;
    const size = TOWERS[kind].size;
    const top = this.ghostSprite(towerGhostIcon(kind));
    const base = this.ghostSprite(towerBaseIcon(size));
    const loaded = (i: HTMLImageElement) => i.complete && i.naturalWidth > 0;
    if (!loaded(top) || !loaded(base)) return null;
    // at the sprites' own resolution: a quarter turn of a square is
    // lossless, and the stamp is scaled to the footprint at draw time
    const n = Math.max(top.naturalWidth, base.naturalWidth);
    const cv = document.createElement("canvas");
    cv.width = n;
    cv.height = n;
    const g = cv.getContext("2d");
    if (!g) return null;
    g.imageSmoothingEnabled = false;
    // the plate comes darkened while the flag is on (towerBaseIcon hands
    // back the sheet's own), so there is nothing to multiply here
    g.drawImage(base, 0, 0, n, n);
    // THE PLATE NEVER TURNS and the head always does (renderer.ts pushes
    // the base at rotation 0 and the top at the turret's angle)
    g.translate(n / 2, n / 2);
    g.rotate(Math.PI / 2);
    g.drawImage(top, -n / 2, -n / 2, n, n);
    this.ghostComposites.set(kind, cv);
    return cv;
  }
}
