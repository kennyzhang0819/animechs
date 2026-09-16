import { FLOOR_STYLE, WATER_VARIANTS, WATER_WAVE_VARIANT, type FloorKind } from "./tiles";
import { LINOCUT_TERRAIN } from "./terrainFlag";
import {
  FLYER_PARTS,
  LEG_ART,
  MECH_ART,
  type CellArt,
  type FlyerParts,
  type LegArt,
  type LegGun,
  type MechArt,
  UNIT_ART,
  UNIT_CELL,
  UV_SOLID,
  UV_BASE,
  DECOR_DRAWN,
  UV_DECOR,
  UV_FLOORS,
  UV_PINE,
  UV_PINES,
  UV_SPAWN,
  UV_RING,
  UV_CLEAVER,
  UV_AIRBURST,
  UV_FLOOR_EDGES,
  UV_BULLET,
  UV_BULLET_BACK,
  UV_SHELL,
  UV_SHELL_BACK,
  UV_MISSILE,
  UV_MISSILE_BACK,
  UV_CIRCLE_BULLET,
  UV_CIRCLE_BULLET_BACK,
  UV_MINE_BULLET,
  UV_MINE_BULLET_BACK,
  UV_MISSILE_LARGE,
  UV_MISSILE_LARGE_BACK,
  UV_BOSS_MISSILE,
  UV_LASER,
  UV_LASER_END,
  UNIT_ENGINES,
  type UnitEngine,
  SEGMENT_ART,
  type SegmentArt,
  UV_LOBBER,
  UV_DISC,
  UV_TACKER,
  UV_TOWER_BASE,
  UV_TOWER_BASE1,
  UV_TOWER_BASE3,
  UV_TOWER_BASE4,
  UV_RELAY,
  UV_SHIELD_TOWER,
  UV_DISC_BIG,
  UV_TORCH,
  UV_COIL,
  UV_PIERCER,
  UV_BARRAGE,
  UV_DOUSER,
  UV_TETHER,
  UV_RESTORER,
  UV_FIXER,
  UV_DELUGE,
  UV_HIVE,
  UV_WHIRL,
  UV_REPEATER,
  UV_FURNACE,
  UV_RAILHEAD,
  UV_TETHER_LASER,
  UV_TETHER_LASER_END,
  UV_TRI,
  UV_TURRET,
  UV_WALLS,
  UV_WALL_LARGE,
  WALL_GROUP,
  WALL_GROUP_KINDS,
  WATER_UV_UNIT,
  type UVRect,
} from "./atlas";
import {
  BASE,
  CELL as CELL_IMPORT,
  towerMaxHp,
  structStats,
  clamp as clamp_IMPORT,
  COLS as COLS_IMPORT,
  FX_LIFE,
  H as H_IMPORT,
  HP_TINT as HP_TINT_IMPORT,
  PIERCER_CHARGE_SPARK,
  MAX_UNITS,
  MERGE_GROWTH,
  NCELLS,
  PAL as PAL_IMPORT,
  RELAY_SIZE,
  ROWS as ROWS_IMPORT,
  TEAM_CRUX_RGB,
  TOWERS as TOWERS_IMPORT,
  W as W_IMPORT,
  type BulletStats,
} from "./constants";

// Module-local bindings for what the per-frame batch build reads per unit,
// projectile and effect: an imported binding is a getter call under
// CommonJS interop (dev server), and this file reads these thousands of
// times a frame. A module-local const is a plain read.
const CELL = CELL_IMPORT;
const clamp = clamp_IMPORT;
const COLS = COLS_IMPORT;
const H = H_IMPORT;
const HP_TINT = HP_TINT_IMPORT;
const PAL = PAL_IMPORT;
const ROWS = ROWS_IMPORT;
const TOWERS = TOWERS_IMPORT;
const W = W_IMPORT;
import {
  UNIT_KINDS,
  UNIT_STATS,
  unitAccent,
  type ForceFieldSpec,
  type LegSpec,
  type SegmentSpec,
  type WakeSpec,
} from "./levels";
import {
  AMPHIBIOUS_GROWTH,
  HUNGRY_GROWTH,
  HUNGRY_HUE,
  SHIELD_TOWER_COL,
  SHIELD_TOWER_SIZE,
} from "./mutation";
import { MAX_LEGS, MAX_SEGS, MUZZLE_FLASH_LIFE, WAKE_PTS } from "./sim";
// THE WORLD, THROUGH THE ONE WINDOW THE DRAWING SIDE HAS (simview.ts).
// Not `Sim` itself: what the picture is allowed to know is a written-down
// list, and reaching past it has to go through that list first.
import type { ShotView, SimView, TowerView } from "./simview";
import {
  BEAM_STYLES,
  EXPLOSION_STYLES,
  LASER_STYLES,
  FURNACE_BEAM,
  SAP_STYLES,
  SHRAPNEL_STYLES,
  UNIT_HELD,
  UNIT_WEAPONS,
  type BeamStyle,
  type ShotRegion,
} from "./weapons";
import { isWaterFloor, showsFloorCell, WALL_DEEP, type Terrain } from "./terrain";
import { SPAWN_STYLE } from "./maps";
import {
  FxKind,
  type Effect,
  type RGB,
  type Tower,
  type TowerKind,
} from "./types";

/**
 * Per-kind turret tops and bullet sprites, keyed on TowerKind because
 * Tower.kind is.
 */
const UV_TURRETS: Record<TowerKind, UVRect> = {
  tacker: UV_TACKER,
  lobber: UV_LOBBER,
  autocannon: UV_TURRET,
  airburst: UV_AIRBURST,
  cleaver: UV_CLEAVER,
  torch: UV_TORCH,
  coil: UV_COIL,
  piercer: UV_PIERCER,
  barrage: UV_BARRAGE,
  douser: UV_DOUSER,
  tether: UV_TETHER,
  fixer: UV_FIXER,
  restorer: UV_RESTORER,
  deluge: UV_DELUGE,
  hive: UV_HIVE,
  whirl: UV_WHIRL,
  repeater: UV_REPEATER,
  furnace: UV_FURNACE,
  railhead: UV_RAILHEAD,
};
/**
 * The two regions BasicBulletType.draw lays on one rect: the longer `-back`
 * first, then the base over it. Which pair a shot uses is ammo data
 * (BulletSprite.region) — the colours are too, so one pair covers every
 * ammo type in the game.
 */
const BULLET_REGIONS: Record<"bullet" | "shell" | "missile", readonly [UVRect, UVRect]> = {
  bullet: [UV_BULLET_BACK, UV_BULLET],
  shell: [UV_SHELL_BACK, UV_SHELL],
  missile: [UV_MISSILE_BACK, UV_MISSILE],
};
/** px per Mindustry world unit — effect geometry is written in those units */
const MU = CELL / 8;
/** the lock beam's floor: four native px of width, 12 * scale * MU wide
 *  at scale — the turrets' minimum mark, so no beam is a hairline */
const BEAM_MIN_SCALE = (4 * 0.625) / (12 * MU);
/** Pal.heal #98ffa9 */
const PAL_HEAL = [0x98 / 255, 0xff / 255, 0xa9 / 255] as const;
/**
 * Mindustry's Floor.mapColor — what the sprite packer sets to the average
 * colour of a floor's own texture, and the tint every walk and landing
 * effect is fired in. These are those averages, measured off the very PNGs
 * the atlas is packed from, one per floor GROUP (UV_FLOORS carries three
 * variants of each, and they average alike).
 */
// ONE ROW PER FLOOR GROUP, in UV_FLOORS order — the mean colour of the
// family's first tile, which is what a puff of it kicked up looks like.
// The water groups have rows of their own so the table can be indexed by
// group directly: it used to stop at the five land families and wrap
// (`% length`), which quietly dusted a shoreline in grass.
// The land rows read the painted tiles' own base colours (game/tiles.ts),
// so a floor recoloured there kicks up dust of the new colour without a
// second table to keep in step; the waters are files still, and keep
// their hand-read means
const dustOf = (kind: FloorKind): RGB => {
  const t = FLOOR_STYLE[kind].base;
  return [
    parseInt(t.slice(1, 3), 16) / 255,
    parseInt(t.slice(3, 5), 16) / 255,
    parseInt(t.slice(5, 7), 16) / 255,
  ];
};
const FLOOR_DUST: readonly RGB[] = [
  dustOf("grass"),
  dustOf("stone"),
  dustOf("dirt"),
  dustOf("sand"),
  dustOf("darksand"),
  [0x5c / 255, 0x6d / 255, 0xba / 255], // shallow water
  [0x50 / 255, 0x5f / 255, 0xa6 / 255], // deep water
  dustOf("moss"),
  dustOf("sporeMoss"),
  dustOf("mud"),
  dustOf("shale"),
  dustOf("snow"),
  dustOf("salt"),
  dustOf("ice"),
  dustOf("basalt"),
  [0x60 / 255, 0x4b / 255, 0x94 / 255], // shallow spore water
  [0x44 / 255, 0x35 / 255, 0x6b / 255], // deep spore water
];
/** Pal.piercerLaser #a9d8ff — coil's bolt and piercer's beam are both drawn
 * in it, and both wash out to white as they fade */
const PAL_PIERCER = PAL.piercerLaser;
/** radians a second the Grapnels' star turns as it flies — and the FIRE
 *  star's own, half again as fast, because a flare should look like it is
 *  tumbling out of control and the other three like they were thrown */
const STAR_SPIN = 3.2;
const FIRE_SPIN = 5;
/**
 * The region pair behind each of the swarm's ShotLook sprites (weapons.ts):
 * `-back` first, front over it, exactly as BULLET_REGIONS does for the
 * turrets. The boss missile is a unit's own coloured art and has no
 * back; an orb is no sprite at all (LiquidBulletType.draw is a disc), and
 * the four STARS are the bullet pair laid round a turning centre, each one
 * with a different number of arms and a different middle (drawStar).
 */
const SHOT_REGIONS: Record<
  Exclude<ShotRegion, "orb" | "star" | "star-rot" | "star-soak" | "star-fire">,
  readonly [UVRect | null, UVRect]
> = {
  bullet: [UV_BULLET_BACK, UV_BULLET],
  shell: [UV_SHELL_BACK, UV_SHELL],
  missile: [UV_MISSILE_BACK, UV_MISSILE],
  "missile-large": [UV_MISSILE_LARGE_BACK, UV_MISSILE_LARGE],
  "circle-bullet": [UV_CIRCLE_BULLET_BACK, UV_CIRCLE_BULLET],
  "mine-bullet": [UV_MINE_BULLET_BACK, UV_MINE_BULLET],
  "boss-missile": [null, UV_BOSS_MISSILE],
};

/** Pal.lightFlame #ffdd55, Pal.darkFlame #db401c, and Arc's Color.gray */
const LIGHT_FLAME = [0xff / 255, 0xdd / 255, 0x55 / 255] as const;
const DARK_FLAME = [0xdb / 255, 0x40 / 255, 0x1c / 255] as const;
const FLAME_GRAY = [0.5, 0.5, 0.5] as const;
/**
 * HP_TINT with water's hue multiplied in — what a WET unit is drawn in.
 * A deviation standing in for Mindustry's status-icon overlay, which this
 * HUD does not have: the slow is the liquid turrets' whole weapon, so the
 * player has to be able to see who is soaked without hovering anything.
 * One row per hp third, so damage darkens a soaked unit the same way.
 */
const WET_TINT: ReadonlyArray<RGB> = HP_TINT.map(
  (t): RGB => [t[0] * 0.62, t[1] * 0.75, t[2]],
);
/**
 * The same trick for the HUNGRY status (the Hungry mutator): the hue
 * multiplied into whatever the unit was already drawn in, one table per
 * hp third so damage still darkens it and one pair of tables so a soaked
 * hungry unit reads as both.
 *
 * IT HAS TO BE VISIBLE FROM THE FIRST FRAME. The swelling says which units
 * have been eating, but a hungry unit that has not eaten yet is the one
 * worth shooting FIRST, and until it takes a bite nothing else on it
 * differs from the body beside it. Four small tables buy the player that,
 * with no per-unit allocation and no second draw pass.
 */
const hungry = (rows: ReadonlyArray<RGB>): ReadonlyArray<RGB> =>
  rows.map((t): RGB => [t[0] * HUNGRY_HUE[0], t[1] * HUNGRY_HUE[1], t[2] * HUNGRY_HUE[2]]);
const HUNGRY_TINT = hungry(HP_TINT);
/** the kill puff's ring colour — what a Death effect is drawn in unless
 *  the push named one of its own */
const DEATH_COL: RGB = [1, 0.54, 0.24];
const WET_HUNGRY_TINT = hungry(WET_TINT);

/**
 * Draw.color(a, b, t) and Draw.color(a, b, c, t): a two- or three-stop ramp
 * across the whole 0..1 progress, the middle colour landing at t = 0.5
 */
const ramp = (a: RGB, b: RGB, c: RGB | null, t: number): RGB => {
  const [p, q, u] = c === null ? [a, b, t] : t < 0.5 ? [a, b, t * 2] : [b, c, t * 2 - 1];
  return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
};

/**
 * Mindustry re-seeds Mathf.rand with the effect's entity id at the top of
 * every draw, so a particle's direction and its fraction of the (growing)
 * length are fixed for the effect's whole life while nothing has to be
 * stored per particle. A plain xorshift32 stands in for Arc's Rand — the
 * numbers differ, the distribution and the redraw stability do not.
 */
const SPREAD_10 = (10 * Math.PI) / 180;
const SPREAD_11 = (11 * Math.PI) / 180;
const SPREAD_20 = (20 * Math.PI) / 180;
const SPREAD_50 = (50 * Math.PI) / 180;
const SPREAD_60 = (60 * Math.PI) / 180;
/**
 * Mathf.absin(in, scl, mag): a 0..mag ripple with a period of 4*pi*scl
 * ticks. Furnace is the only thing that uses it, twice — once on the
 * colour and once on the width, at slightly different rates so the beam
 * never settles into one look.
 */
const ABSIN = (x: number, scl: number, mag: number): number =>
  (Math.sin(x / (scl * 2)) * mag + mag) / 2;
/**
 * ContinuousLaserBulletType.colors ride the BeamStyle (weapons.ts) — the
 * two outer washes carry their alpha (0x55 and 0xaa on furnace's); they
 * are meant to be seen THROUGH, which is what layers the beam rather than
 * stacking four bars.
 *
 * Upstream's backLength and frontLength are NOT here: a 35-unit nose on
 * the inner passes and a stubbier one on the outer wash stacked four
 * points of different length down one bearing, and what that drew was a
 * christmas tree. Every cap is a half circle on its own pass's stroke now
 * (Renderer.drawBeam), so the beam ends in a DOME and the layering is
 * read across the width, which is the only place it was ever meant to be.
 */
const SPREAD_120 = (120 * Math.PI) / 180;
let rngState = 1;
const rngSeed = (seed: number): void => {
  rngState = seed | 0 || 1;
};
const rng = (): number => {
  let x = rngState;
  x ^= x << 13;
  x |= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x |= 0;
  rngState = x;
  return (x >>> 0) / 4294967296;
};
/**
 * Pal.shield #ffd37f — the warm amber Mindustry uses for the PLAYER's
 * shields: the shield tower's dome, its waves and its break, and Fx.absorb
 * (Pal.accent) wherever a shot dies on an outline.
 */
const SHIELD_COL = [0xff / 255, 0xd3 / 255, 0x7f / 255] as const;
/**
 * UnitEngine.draw: the flame behind a flyer, a disc in the team's colour
 * breathing on Mathf.absin(Time.time, 2, radius / 4) with a white disc
 * half its size thrown a quarter-radius toward the hull. Drawn under the
 * body — engineLayer is a hair below the unit's own.
 */
const ENGINE_INNER: RGB = [1, 1, 1];
/**
 * Mindustry's shield look is a post-process, not geometry. Everything on
 * Layer.shields is filled SOLID into an offscreen buffer cleared to
 * transparent, and the buffer is then blitted through shaders/shield.frag,
 * which throws the fill away and keeps three things: a saturated rim two
 * world units outside the outline (its edge detect fires on transparent
 * pixels whose neighbour is opaque), an interior knocked down to a flat
 * 0.18 alpha, and a wavy diagonal hatch brightening what it crosses by
 * 1.65 — the whole thing sampled through a travelling sine wobble, which
 * is what makes the outline ripple.
 *
 * Doing it any other way costs the two behaviours that make it read as a
 * FIELD rather than a decal. The wobble is a distortion of the sampling,
 * so it moves the rim and the hatch together instead of each separately.
 * And because every carrier fills the same buffer, the edge detect runs on
 * the UNION: two overlapping bubbles lose the wall between them and come
 * out as one shape under one rim, exactly as in the original.
 *
 * So this does what Mindustry does — see Renderer.blitShields.
 */
const SHIELD_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
out vec2 vUV;
void main() {
  vUV = aCorner + 0.5;
  gl_Position = vec4(aCorner * 2.0, 0.0, 1.0);
}`;

/**
 * shaders/shield.frag, ported. The original works in Mindustry world units
 * (its `coords` are camera-space world coordinates), so the buffer's rect
 * is handed over in those units and every constant below is the original's
 * — the 3.0 and 20.0 of the wobble, the 2-unit edge reach, the 10-and-2
 * hatch period, 1.65, 0.18.
 *
 * Two deliberate differences. Mindustry's y runs up and this game's runs
 * down, so the row is flipped back when reading world coordinates out of
 * the texture coordinate; the sine patterns are symmetric, so this only
 * decides which way the hatch leans. And the output is premultiplied,
 * matching this renderer's blend func rather than Arc's.
 *
 * THE HATCH IS OPT-OUT, AND THE FILL'S ALPHA IS THE SWITCH (see
 * SHIELD_PLAIN). Everything lands in ONE buffer and is blitted in ONE
 * pass — that is what merges overlapping bubbles under a single rim, and
 * it is not worth giving up — so "this shape wants no hatch" has to
 * travel INSIDE the buffer rather than beside it. It rides the fill's
 * alpha: both values sit above the 0.9 the edge detect tests, so the rim
 * is found identically either way, and the interior simply asks which
 * side of SHIELD_HATCH_MIN it fell on. Everything on the roster is drawn
 * plain now — the shield towers' domes first, because their diagonals read
 * as damage over a lane full of units, and then the carriers' bubbles for
 * the same reason. The hatch stays in the shader, switched off by the
 * fill, for anything that ever wants Mindustry's full treatment back.
 */
const SHIELD_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec4 uCam;    // camera x, y, w, h in Mindustry world units
uniform vec2 uInv;    // 1 / (w, h): a UV step of one world unit
uniform float uTime;  // Mindustry ticks
uniform float uDp;
// THE RIM'S WAVE, and the whole of what makes one field look unlike
// another: (period, amplitude, kink, snap). period and amplitude are
// world units — how far apart the crests sit and how far the sampling is
// thrown. KINK slides the crest from a sine (0) to a TRIANGLE (1): a
// triangle's slope jumps at every peak, and that corner is what puts a
// zigzag on the outline, which no amplitude of sine can do. SNAP, over
// zero, quantises the phase to that many ticks so the pattern RE-ROLLS
// instead of crawling. A shield breathes; a cloak crackles; same shader
uniform vec4 uZig;
// the whole blit's opacity — a shield stands at 1, a cloak reads under it
uniform float uAlpha;
// the INTERIOR's share of that. A shield is a VOLUME — the wash is what
// says the ground inside it is sheltered — so it stands at 1. A cloak is
// not a volume and has nothing to shelter: it is a line drawn round the
// bodies that went dark, and a wash inside it would say the opposite of
// what the mechanic does. At 0 the rim is the whole drawing
uniform float uFill;
// how far outside the outline the rim is found, in world units. Mindustry's
// is a flat 2 and the shields keep it: a shield carries an interior wash,
// so its rim can thin out at low zoom and the shape still reads. A ring
// with NO interior has only the line, so the field pass resolves this from
// the zoom and keeps the line a constant thickness on screen
uniform float uEdge;
in vec2 vUV;
out vec4 o;
const float ALPHA = 0.18;
const float TAU = 6.2831853;
// fills at or above this keep Mindustry's travelling diagonals; below it
// (but still over the 0.9 the edge detect wants) the interior gets the
// same flat wash with no hatch crossing it — see the SHIELD_PLAIN note
const float HATCH_MIN = 0.97;
// a triangle wave over [-1, 1] on the SAME period as sin, so uZig.x reads
// the same either side of the kink
float tri(float x) { return abs(fract(x / TAU) * 2.0 - 1.0) * 2.0 - 1.0; }
float wave(float x) { return mix(sin(x), tri(x), uZig.z); }
void main() {
  vec2 T = vUV;
  vec2 coords = vec2(T.x * uCam.z + uCam.x, (1.0 - T.y) * uCam.w + uCam.y);
  // the phase either DRIFTS (a field breathing) or SNAPS (a field
  // crackling). The golden angle between snaps is what keeps successive
  // rolls from reading as steps of one animation: each looks unrelated
  // to the last, which is what an electrical field does and a wobble
  // never can
  float ph = uZig.w > 0.0 ? floor(uTime / uZig.w) * 2.3999632 : uTime / 20.0;
  T += vec2(wave(coords.y / uZig.x + ph), wave(coords.x / uZig.x + ph)) * uZig.y * uInv;
  vec4 color = texture(uTex, T);
  vec4 maxed = max(max(max(
    texture(uTex, T + vec2(0.0, uEdge) * uInv),
    texture(uTex, T + vec2(0.0, -uEdge) * uInv)),
    texture(uTex, T + vec2(uEdge, 0.0) * uInv)),
    texture(uTex, T + vec2(-uEdge, 0.0) * uInv));
  if (color.a < 0.9 && maxed.a > 0.9) {
    // maxed.a * 100 saturates: the rim is drawn at full opacity
    o = vec4(maxed.rgb, 1.0) * uAlpha;
  } else if (color.a > 0.5) {
    // Mindustry tests "> 0" here, over fills that are hard-edged
    // polygons. These fills are one disc sprite, antialiased in the sheet
    // and blurred further by every mip level, so its edge is a ramp of
    // partial alpha a few pixels wide when zoomed out — and every one of
    // those pixels used to take the wash, which drew a dark ring hugging
    // the rim. Half is the contour of the disc's actual edge
    // the interior is the SAME flat wash for both kinds — a plain shield
    // is a carrier's bubble with the diagonals switched off, nothing else
    vec3 rgb = color.rgb;
    if (color.a >= HATCH_MIN
        && mod(coords.x / uDp + coords.y / uDp
          + sin(coords.x / uDp / 5.0) * 3.0
          + sin(coords.y / uDp / 5.0) * 3.0
          + uTime / 4.0, 10.0) < 2.0) rgb *= 1.65;
    o = vec4(rgb * ALPHA, ALPHA) * uAlpha * uFill;
  } else {
    o = vec4(0.0);
  }
}`;



/** Shaders.ShieldShader's u_dp, Scl.scl(1) — the UI scale, 1 at 1x */
const SHIELD_DP = 1;
/**
 * The fill alpha that asks the shield shader for NO HATCH — a rim and a
 * flat interior, nothing crossing it (see SHIELD_FS's HATCH_MIN).
 *
 * It is 0.94 rather than anything lower because the edge detect tests
 * against 0.9: the value has to read as SOLID to the pass that finds the
 * outline while reading as a flag to the pass that decorates the inside.
 * The two jobs share one channel, so the window between them is narrow on
 * purpose — anything under 0.9 would stop being a shield shape at all.
 */
const SHIELD_PLAIN = 0.94;
/**
 * The shield rim's wave (SHIELD_FS uZig): Mindustry's own gentle sine, one
 * world unit deep on a 2*pi*3-unit period, drifting. Kink 0 and snap 0 are
 * what make the shader's `wave` collapse back to the plain `sin` this pass
 * has always run — the shields are not changed by any of this, they simply
 * name what they were already doing.
 */
const SHIELD_ZIG = new Float32Array([3, 1, 0, 0]);
/**
 * THE ENERGY FIELD'S RIM, and it is the same shader doing something else
 * entirely: a full triangle (kink 1) at a wide period and a deep throw, on
 * a phase that re-rolls ten times a second rather than drifting. A shield
 * breathes; this crackles, because what it encloses is not a wall but a
 * body's REACH — every structure inside takes the pulse and rolls for a
 * short (sim.ts, case "field"), and the line has to say electrical.
 *
 * THE TEETH ARE AUTHORED IN SCREEN PIXELS, not world units, and resolved
 * against the zoom every frame (blitShields). A tooth measured in world
 * units goes sub-pixel the moment the camera pulls back, and a rim whose
 * teeth are finer than the pixels under it is not a zigzag — it is a
 * shimmer, and a crawling one.
 */
const FIELD_TOOTH_PX = 42;
const FIELD_DEPTH_PX = 15;
/** the rim's thickness on SCREEN (SHIELD_FS uEdge), for the same reason the
 *  teeth are a screen size: the line is the whole drawing, so it cannot be
 *  allowed to thin away as the camera pulls back */
const FIELD_EDGE_PX = 4;
/** Mindustry's own flat rim reach, which the shields keep unchanged */
const SHIELD_EDGE = 2;
/** ticks between re-rolls of the crackle (SHIELD_FS uZig.w) */
const FIELD_SNAP = 6;
/**
 * How far under a shield the energy field reads (SHIELD_FS uAlpha).
 *
 * It sits higher than it looks, because the rim is the ONLY mark the field
 * makes (FIELD_FILL): there is no wash under it carrying half the reading,
 * so the line has to hold the shape on its own.
 */
const FIELD_ALPHA = 1;
/**
 * No interior wash (SHIELD_FS uFill). A shield's wash says the ground
 * inside it is SHELTERED; this ring means the exact opposite — everything
 * inside is being shot — and forty-five tiles of lit ground over a lane
 * full of turrets is a screen of wash with a battle somewhere underneath.
 * The boundary is the whole message, so the boundary is the whole drawing.
 */
const FIELD_FILL = 0;
/**
 * The scene's clear colour — the void the map sits in, and what the
 * shield pass has to hand back after borrowing the clear for its own
 * buffer.
 *
 * Neutral on purpose. This used to be a navy #0A101F, which read as sky
 * behind the map rather than as nothing: the moment the camera could pull
 * back past the edges (see Game.minZoom) the map looked like it was
 * floating on water. Black is the absence of a colour, which is what is
 * meant to be out there.
 *
 * IT IS PURE BLACK BECAUSE THE MAP'S OWN EDGE ALREADY IS. Every campaign
 * map is walled in, and the inside of a wall mass saturates to opaque
 * black a few cells deep (DARK_RADIUS, Mindustry's addDarkness) — so the
 * last thing the map draws at its rim is #000000. An inland range stops
 * short of black now (DARK_MAX) so its rock can still be read; the RIM is
 * held at the full value for this reason (DARK_RIM), which is the same
 * requirement the paragraph below states, met from the other side. This was #0B0B0B, two
 * levels lighter, and the difference drew a crisp rectangle around the
 * whole board: the eye cannot read either shade as a colour but it reads
 * the HARD EDGE between them instantly, which told the player exactly
 * where the world stopped. Matching the darkness the map ends in is what
 * makes the board sit in nothing instead of on a slab of it.
 *
 * Anything that changes this has to move the darkness with it, or the
 * rectangle comes back.
 */
const CLEAR = [0, 0, 0] as const;
/** Arc Interp.pow3Out, the curve behind EffectContainer.finpow() */
const FIN_POW = (f: number): number => 1 - Math.pow(1 - f, 3);
/**
 * Opacity applied to every stroked effect ring. Mindustry draws these at
 * full alpha and lets the thinning stroke do the fading; a lighter ring
 * reads better over this game's busier ground, so the whole family is
 * scaled by one knob rather than per-effect.
 */
const RING_ALPHA = 0.4;

// unit art indexed by the sim's numeric kind id (UNIT_ID order)
const KIND_UV = UNIT_KINDS.map((k) => UNIT_ART[k].uv);
const KIND_SPRITE = UNIT_KINDS.map((k) => UNIT_ART[k].sprite);
const KIND_FLYING = UNIT_KINDS.map((k) => !!UNIT_STATS[k].flying);
const KIND_MECH = UNIT_KINDS.map((k) => MECH_ART[k] ?? null);
// the legged pair (dartback2, dartback3): part art and the gait that moves it
const KIND_LEG = UNIT_KINDS.map((k) => LEG_ART[k] ?? null);
const KIND_GAIT = UNIT_KINDS.map((k) => UNIT_STATS[k].legs ?? null);
/** each leg's fixed slice of the mount ring as a unit vector — the frame's
 * chassis angle is composed on top (angle addition), sparing two trig
 * calls per leg per pass in pushLegs */
const KIND_GAIT_TRIG = KIND_GAIT.map((L) => {
  if (!L) return null;
  const arr = new Float64Array(L.count * 2);
  for (let k = 0; k < L.count; k++) {
    const c = ((Math.PI * 2) / L.count) * k + Math.PI / L.count;
    arr[k * 2] = Math.cos(c);
    arr[k * 2 + 1] = Math.sin(c);
  }
  return arr;
});
/** the force field each kind stands inside, null for everything else */
const KIND_FORCE = UNIT_KINDS.map((k) => UNIT_STATS[k].forceField ?? null);
/** THE HIGHLIGHT each kind wears (levels.ts FAMILY_ACCENT): its family's
 *  hue on its cell, its engines, its halo and its bubble — the boss, in no
 *  family, keeps the swarm's crux red */
const KIND_ACCENT: readonly RGB[] = UNIT_KINDS.map(unitAccent);
/** the engines a flyer burns (UNIT_ENGINES), null for anything that has none */
const KIND_ENGINES = UNIT_KINDS.map((k) => UNIT_ENGINES[k] ?? null);
/** the flyers drawn as a body and two beating wings (FLYER_PARTS), null
 *  for the single-quad ones — empty unless the animal art trial is on */
const KIND_FLYER: readonly (FlyerParts | null)[] = UNIT_KINDS.map((k) => FLYER_PARTS[k] ?? null);
/** the segmented kinds (SEGMENT_ART) and the chain each drags (SegmentSpec) —
 *  the worm rig; empty unless the animal art trial is on */
const KIND_SEG_ART: readonly (SegmentArt | null)[] = UNIT_KINDS.map((k) => SEGMENT_ART[k] ?? null);
const KIND_SEGS: readonly (SegmentSpec | null)[] = UNIT_KINDS.map((k) => UNIT_STATS[k].segments ?? null);
/** the held beam or charged shot each kind carries (UNIT_HELD), null for the rest */
const KIND_HELD = UNIT_KINDS.map((k) => UNIT_HELD[k]);
/** the kinds whose weapon is an energy field (livewire4): the orb is drawn
 *  on them always, and the REACH is drawn as a field ring (drawFieldRings) */
const KIND_FIELD = UNIT_KINDS.map((k): null | { range: number; color: RGB } => {
  const w = UNIT_WEAPONS[k].find((x) => x.fx === "field");
  return w ? { range: w.range, color: w.fieldColor ?? PAL.heal } : null;
});
/** is any field-caster on the roster? the ring pass is skipped when not */
const HAS_FIELD = KIND_FIELD.some(Boolean);
/** the naval wake each kind drags, null for everything that is not a hull */
const KIND_WAKE = UNIT_KINDS.map((k) => UNIT_STATS[k].wake ?? null);
/** is any hull on the roster at all? the wake pass is skipped outright
 *  when there is none, exactly as the force-field absorb pass is */
const HAS_WAKE = KIND_WAKE.some(Boolean);
/**
 * The wake's colour: Mindustry's Blocks.water.mapColor multiplied by 1.5,
 * which is what WaterMoveComp paints its two Trails in.
 *
 * mapColor is the average of a floor's own sprite, computed by Mindustry's
 * sprite packer — shallow-water.png averages #5c6dbb, within a shade of
 * Liquids.water.color, and x1.5 lifts it to this pale blue. Upstream then
 * lerps the live colour toward whatever floor the hull is over; both water
 * floors we field average to the same blue within a few points, so the
 * lerp is a constant here and this is what it settles on.
 */
const WAKE_COL: RGB = [0x8b / 255, 0xa4 / 255, 0xff / 255];
/**
 * HOW MUCH OF THAT COLOUR ACTUALLY LANDS. Upstream draws its two Trails
 * opaque, and opaque pale blue on this palette's teal water is a pair of
 * white stripes that read louder than the hull towing them — on a fleet
 * of skates the eye followed the wakes and not the boats.
 *
 * So the head of the wake is drawn at this, and the tail fades from it to
 * nothing (pushWake). That is two fades at once — the strip already
 * tapers to zero WIDTH at its oldest point — which is what turns a stripe
 * into a wash that dissolves behind a hull rather than ending somewhere.
 *
 * IT IS A HINT OF DISTURBED WATER, NOT A MARK ON IT. Three tenths was
 * still a thing you could follow across a lake — and a wake is only ever
 * meant to say "something passed here", never to compete with the hull
 * for the eye. At this the brightest pixel of a skate5's wake is about a
 * tenth of the way from the water to the foam, which at play zoom over a
 * whole fleet is a faint sheen on the surface and nothing more.
 */
const WAKE_ALPHA = 0.12;
const TAU = Math.PI * 2;
// Mindustry throws every shadow along (shadowTX, shadowTY) = (-12, -13)
// world units times the caster's elevation. This game's shadows fall the
// other way (see SHADOW_OFF), so the same vector is used mirrored
const SHADOW_TX = 12 * MU;
const SHADOW_TY = 13 * MU;
// mech walk dressing (Mindustry defaults, world units × 2.5 px):
// body/gun sway per stride, and a gentle shade on the planted leg — the
// original lerps the sprite toward Pal.darkMetal, which the leg art
// already averages, so a mild darken is the closest a multiply tint gets
const SIDE_SWAY = 0.54 * 2.5;
const FRONT_SWAY = 0.1 * 2.5;
const LEG_SHADE = 0.14;
/** how much of its own length the swinging leg loses — Mindustry's mech
 *  draws it at half. A rig may ask for less (MechArt.legLift) */
const LEG_LIFT = 0.5;
// floor blend priority by group id (grass, stone, dirt, sand, darksand,
// shallow water, deep water): Blocks.java definition order — water <
// stone < sand < darksand < dirt < grass, higher fades over lower.
//
// THE WATER GROUPS SIT BELOW EVERYTHING, which is what draws a shoreline.
// Mindustry declares its water floors before any land floor, so land
// blends over water and never the reverse — the fade you see at a lake's
// rim is the BEACH reaching into the water. Give water a high priority
// instead and the lake grows a rim over the sand, which reads as a puddle
// on top of the ground rather than a hole in it.
//
// The second environment band's eight land families continue upward from
// the first band's top (grass, 4) in Mindustry's own rough order: the bare
// rocks first, then the frozen pair with snow drifting over ice, then the
// marsh, where moss creeps over mud and the spore growth creeps over the
// moss. The spore waters join the clear ones at the bottom.
const GROUP_PRI = [
  4, 0, 3, 1, 2, -1, -2,
  11, // moss
  12, // spore moss
  10, // mud
  5, // shale
  9, // snow
  7, // salt
  8, // ice
  6, // basalt
  -3, // shallow spore water
  -4, // deep spore water
] as const;
// overlaying groups in ascending priority — darksand, dirt, grass, then
// the second band's eight. Stone never overlays (lowest of the land
// floors), and sand's only inferior — stone floor — shares no map with it
// yet, so its edge art isn't baked either. The water groups are never in
// here: nothing is beneath them to fade over.
const EDGE_ORDER = [4, 2, 0, 10, 14, 12, 13, 11, 9, 7, 8] as const;
/**
 * Which painted cell of a water group a map cell draws — see the floor
 * pass. A cheap integer hash of the cell, so the choice is fixed for a
 * cell (no crawling between frames, identical in the editor and in play)
 * and shows no pattern across a lake.
 */
const cellHash = (x: number, y: number): number => {
  let h = Math.imul(x * 0x27d4eb2d + y, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
};
/**
 * HOW MANY OF THE CELLS THAT ROLLED A WAVE KEEP IT. A water kind paints
 * three cells and one of them carries the crest (tiles.ts paintWater), so
 * the raw roll puts a wave on a third of a lake — close enough together
 * that a sea read as corduroy. This keeps one in three of those, a wave
 * on a ninth of the water, which is a swell here and there on open water
 * rather than a texture over all of it.
 *
 * It only ever takes a wave AWAY, exactly as floorVariant does with the
 * ground's ticks: the two bare cells of a group are the same flat teal,
 * so dropping onto slot 0 is dropping the crest and changing nothing else.
 */
const WATER_WAVE_KEEP = 3;
const waterVariant = (x: number, y: number): number => {
  const h = cellHash(x, y);
  const v = h % WATER_VARIANTS;
  return v === WATER_WAVE_VARIANT && (h >>> 8) % WATER_WAVE_KEEP !== 0 ? 0 : v;
};
/**
 * MOST OF THE MARKED GROUND IS DRAWN PLAIN. Slot 0 of a land group is the
 * variant carrying the carved tick and slots 1 and 2 are bare ground
 * (tiles.ts paintFloor), and a map paints the three at random — a tick on
 * a third of the board, which from above read as a texture laid over the
 * whole map rather than as marks on the ground. This keeps one in
 * FLOOR_MARK_KEEP of them and drops the rest to the bare slot beside
 * them: a twelfth of cells marked, fixed per cell.
 *
 * It was a sixth, and a sixth was still a rash — at the zoom the board is
 * actually played at, one cell in six carrying a stroke is a stroke in
 * every glance, and the ground stopped being ground. A twelfth is sparse
 * enough that a tick reads as a crack in that patch rather than as the
 * way the whole map is drawn.
 *
 * It only ever takes a mark AWAY: a cell painted bare stays bare, so
 * nothing an author put down appears that was not there.
 */
const FLOOR_MARK_KEEP = 4;
const floorVariant = (floor: number, x: number, y: number): number =>
  floor % 3 === 0 && (cellHash(x, y) >>> 8) % FLOOR_MARK_KEEP !== 0 ? floor + 1 : floor;
// wall shadow strength: BlockRenderer.shadowColor is black at 0.71 — the
// premultiplied blend of a black quad at this alpha equals its multiply
export const WALL_SHADOW_A = 0.71;
/**
 * THE INSIDE OF A HILL IS DARK — Mindustry's darkness buffer, reproduced
 * exactly (World.addDarkness for the numbers, BlockRenderer.updateDarkness
 * for the pixels, darkness.frag for the blend).
 *
 * Every wall cell starts at DARK_RADIUS and is eroded DARK_RADIUS times:
 * on each pass a cell with any 4-neighbour LOWER than itself loses one.
 * A wall cell one step in from open ground ends at 0, two steps in at 1,
 * three at 2, four at 3, five or more at 4. The result is one texel a
 * cell on a LINEAR-filtered texture, drawn as black at alpha
 * min((dark + 0.5) / 4, 1) — nothing on the rim, 0.375 one cell past it,
 * then 0.625, 0.875 and solid — so a ridge keeps its lit face and a range
 * goes dark inside, and the bilinear ramp between cells is the gradient.
 * (How dark is DARK_MAX's business, below: this ramp is Mindustry's, the
 * ceiling on it is not.)
 * (Mindustry also marks a cell at 4 whose four neighbours are all at 4
 * with a 5; that draws identically, so it is not kept.) It is drawn over
 * the ground units, the effects and the shields — Layer.darkness sits
 * above all of those — but UNDER the flyers: Mindustry swallows a flyer
 * crossing a range, and this game does not, because a flyer is above the
 * terrain wherever it is (see pushUnitPass).
 */
const DARK_RADIUS = 4;
/**
 * ...BUT NOT TO BLACK. Mindustry's ramp tops out at alpha 1 and a range's
 * interior is then a solid black hole in the map: the rock under it is
 * painted, batched and uploaded, and none of it is ever seen. That reads
 * as a HOLE rather than as height — you cannot tell a deep range from a
 * gap in the world, and the linocut rock (tiles.ts) does its best work in
 * exactly the cells that were swallowing it.
 *
 * So the whole ramp is scaled by this ceiling rather than clamped at the
 * top: the rim keeps its light face, the gradient between cells keeps its
 * shape, and the deepest interior settles at DARK_MAX instead of 1. What
 * is left is a fifth of the rock's own tone — enough to read grain, the
 * family's hue and the shape of a ridge, not enough to argue with the
 * units and shots that are the thing actually being looked at.
 *
 * It is the one number to turn if the hills want to be darker or lighter.
 */
const DARK_MAX = 0.8;
/**
 * ...EXCEPT AT THE MAP'S RIM, WHICH STILL GOES TO BLACK.
 *
 * The rim and a deep inland range are the SAME darkness value — the cells
 * past the map's edge are no neighbours at all (see the erosion below), so
 * the boundary saturates exactly as a range's middle does. One ceiling
 * therefore cannot serve both, and they want opposite things: a range
 * wants its rock back, and the rim wants #000000, because the void behind
 * the map is pure black and the last thing the map draws has to match it
 * (see CLEAR). Capped flat at DARK_MAX the rim lands around #181412 — and
 * on a snow or salt map nearer #221e1b — which is the crisp rectangle
 * round the whole board that CLEAR exists to prevent.
 *
 * So the ceiling is lifted back to 1 over the last DARK_RIM cells of the
 * map. Inland is DARK_MAX and readable, the boundary is black and the
 * world still ends in nothing, and the texture's own bilinear filter
 * carries the few cells between.
 */
const DARK_RIM = 5;
/** which terrain layers the static batches draw; the editor hides one to
 * work on what sits underneath it */
export interface TerrainLayers {
  wall: boolean;
  props: boolean;
  spawn: boolean;
  base: boolean;
}
export const ALL_LAYERS: TerrainLayers = {
  wall: true,
  props: true,
  spawn: true,
  base: true,
};
/**
 * What a MATCH draws. The spawn pads are an authoring layer: they are how
 * an author sees the cells they painted, and a board permanently splashed
 * red where the swarm enters is not what a player should be looking at.
 * In play the mouths are read from the routes overlay instead, which
 * outlines the same cells on demand (Game.drawOverlay).
 */
export const GAME_LAYERS: TerrainLayers = {
  wall: true,
  props: true,
  spawn: false,
  base: true,
};

// flyer drop shadow: painter's offset + premultiplied black tint
const SHADOW_OFF = 6;
const SHADOW_ALPHA = 0.22;
/**
 * THE GROUND CROWD'S OWN SHADOW. A flyer is high enough that its shadow
 * is a whole second body on the ground beside it; a walker is not, and
 * the shadow it wants is the thin dark rim a solid thing has where it
 * meets the ground it is standing on. Without one the roster reads as
 * stickers laid on the map — the hills have a shadow, the walls have a
 * shadow, and the bodies walking between them had none.
 *
 * The offset is a FRACTION OF THE BODY'S OWN QUAD rather than a fixed
 * number of pixels, which is Mindustry's shadowTX * elevation with the
 * elevation read off the unit's size: a taller thing throws its shadow
 * further, so every body on the roster gets a rim of the same width
 * RELATIVE TO ITSELF instead of a 64px runt wearing the same 6px smear
 * as a 256px flagship. It falls on the bearing every other shadow here
 * falls on (SHADOW_TX/TY, and the flyers' offset above): down and right,
 * from a light up and to the left.
 *
 * Stronger than the flyers' 0.22 because almost all of it is hidden: the
 * body is drawn over its own shadow, so what is left is the crescent
 * past its lower-right edge, and at the flyers' alpha that crescent
 * disappeared at play zoom.
 */
const GROUND_SHADOW_ELEV = 0.035;
const GROUND_SHADOW_ALPHA = 0.35;

/**
 * How far past a unit's centre anything drawn FOR it can reach, per kind:
 * the sprite itself plus whatever sticks out furthest — planted feet on
 * the legged kinds (mount ring + a fully stretched leg), the drop shadow,
 * or the shield halo at hitSize * 1.3. A unit whose centre sits this far
 * outside the viewport cannot put a pixel in it, which is what lets the
 * batch builder skip it entirely (the whole map is still simulated — only
 * the sprite assembly work is saved).
 */
const KIND_CULL = UNIT_KINDS.map((k, i) => {
  const legs = UNIT_STATS[k].legs;
  const legReach = legs ? legs.baseOffset + legs.length * legs.maxLength + 24 : 0;
  const halo = UNIT_STATS[k].radius * 2.6 + 8;
  // a hull's wake is the longest thing any kind draws: the trail holds
  // `length` ticks of history, so at the hull's own pace it runs that far
  // back — a skate5's is 70 ticks of 0.62 units/tick, over five tiles
  const wake = UNIT_STATS[k].wake;
  const wakeReach = wake
    ? (UNIT_STATS[k].speed / 60) * wake.length + Math.abs(wake.y) + wake.x + wake.scl
    : 0;
  return Math.max(KIND_SPRITE[i], legReach, halo, wakeReach) + SHADOW_OFF + 8;
});

/**
 * The same idea for effects: a conservative reach per kind, in px past the
 * effect's anchor. Wide enough for the widest thing each kind ever draws
 * (instHit's spray runs to ~(5 + 80) * 2.5 px). Line-shaped effects whose
 * reach is data rather than a constant (Laser, Shrapnel, Lightning) are
 * handled at the cull site — their length rides e.len / e.pts.
 */
const FX_CULL_PAD = 240;

/**
 * A reused view of one slot of the sim's struct-of-arrays effect pool.
 * The effect draw helpers below all read the classic Effect shape; the
 * main effects pass refills this ONE object per effect per frame instead
 * of the sim ever allocating per push. `col` points at FX_VIEW_COL when
 * the slot carries a colour and is unset otherwise, so the helpers'
 * `e.col ?? fallback` reads keep working unchanged.
 */
const FX_VIEW: {
  x: number;
  y: number;
  age: number;
  ttl: number;
  kind: FxKind;
  col?: RGB;
  rot: number;
  len: number;
  pts?: readonly number[];
  sides: number;
  unit: number;
  seed: number;
} = { x: 0, y: 0, age: 0, ttl: 1, kind: FxKind.Death, rot: 0, len: 0, sides: 0, unit: 0, seed: 0 };
const FX_VIEW_COL: [number, number, number] = [0, 0, 0];

/** pushMech's reusable part records — see the note at its call site */
interface MechPart {
  uv: UVRect;
  sil: UVRect;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  dk: number;
}
const MECH_PARTS: MechPart[] = [];
// pushWake's scratch: one hull's path and its per-point travel direction,
// rebuilt in place per unit rather than allocated (the pass runs over
// every boat on the field, every frame). WAKE_PTS points plus the live one
const WAKE_PX = new Float64Array(WAKE_PTS + 1);
const WAKE_PY = new Float64Array(WAKE_PTS + 1);
const WAKE_DX = new Float64Array(WAKE_PTS + 1);
const WAKE_DY = new Float64Array(WAKE_PTS + 1);


const VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aPos;
layout(location=2) in vec2 aSize;
layout(location=3) in float aRot;
layout(location=4) in vec4 aUV;
layout(location=5) in vec4 aTint;
uniform vec2 uRes;
uniform float uZoom;
uniform vec2 uOff;
out vec2 vUV;
flat out vec4 vRect;
out vec4 vTint;
void main() {
  float s = sin(aRot), c = cos(aRot);
  // scale to sprite size FIRST, then rotate — the reverse order stretches
  // any non-square quad along the world axes instead of its own axis
  vec2 sc = aCorner * aSize;
  vec2 p = vec2(sc.x * c - sc.y * s, sc.x * s + sc.y * c) + aPos;
  vec2 view = p * uZoom + uOff;
  vec2 clip = view / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vUV = mix(aUV.xy, aUV.zw, aCorner + 0.5);
  vRect = vec4(min(aUV.xy, aUV.zw), max(aUV.xy, aUV.zw));
  vTint = aTint;
}`;

// HIGHP, NOT MEDIUMP. The atlas is 2048x4096, so a texture coordinate has
// to resolve 1/4096 along v, and a mediump float — 16-bit on any GPU that
// takes the qualifier at its word: every mobile part, and desktop drivers
// that map it to half floats — has ten bits of mantissa. That puts the
// sample somewhere within about two texels of where it was asked for,
// and the miss is not random: it steps in lockstep across a tile and
// lands past its edge in a line, which on the ground is a hairline round
// every cell. A driver that ignores mediump never shows it, which is why
// it renders clean on one machine and lined on the next
//
// THE SAMPLE NEVER LEAVES ITS OWN CELL. A quad's outermost fragments ask
// for a texture coordinate right on the cell's border, and the sampler
// answers with a blend of the texels either side of it: the cell's own
// edge texel and whatever is packed next door — half and half at the
// border at mip 0, and at mip 3 a texel is eight sheet pixels wide, so
// the blend reaches eight pixels into the neighbour. On a rotating
// sprite that reads as a hairline along one edge of its quad, moving
// with it: the dartback1's leg cell sits under the last opaque rows of the
// core sprite, so its legs dragged a dark line as they strode; a turret's
// base plate is opaque to its cell's edge, so at any zoom that minifies,
// its rim mixed with the transparent black beside it and darkened. The
// sheet cannot fix this — it is flush-packed, and every free gutter was
// spent long ago — so the sampler does: each fragment clamps its
// coordinate inside the cell (handed down from the instance, `vRect`) by
// the filter's footprint at the mip level it is about to read: half a
// texel at level 0, doubling a level. Doubled again for slack, because
// the driver picks its own level and rounds its own weights — at exactly
// the footprint, the shield discs still read a few 255ths of the opaque
// hull packed beside them, and the shield shader turns any alpha at all
// into a line. Never more than six sheet pixels, since TEXTURE_MAX_LEVEL
// is 3 and a level-3 texel is eight wide; six keeps the sample on the
// inner three quarters of the cell's own border texel. Zoomed in, the
// inset is a texel and costs nothing anyone can see; zoomed out, the band
// it crops is under a device pixel wide. textureGrad keeps the level the
// driver would have chosen for the unclamped coordinate — the clamped one
// has no gradient in the band, which would otherwise fall back to mip 0
// there.
const FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;  // one sheet pixel as a UV step
in vec2 vUV;
flat in vec4 vRect;
in vec4 vTint;
out vec4 o;
void main() {
  vec2 dx = dFdx(vUV), dy = dFdy(vUV);
  float rho = max(length(dx / uTexel), length(dy / uTexel));
  float lod = clamp(log2(max(rho, 1.0)), 0.0, 3.0);
  vec2 inset = min(exp2(lod), 6.0) * uTexel;
  vec2 mid = (vRect.xy + vRect.zw) * 0.5;
  vec2 lo = min(vRect.xy + inset, mid), hi = max(vRect.zw - inset, mid);
  o = textureGrad(uTex, clamp(vUV, lo, hi), dx, dy) * vec4(vTint.rgb * vTint.a, vTint.a);
}`;

/**
 * The water program's vertex stage: VS, plus the fragment's world position.
 *
 * water.frag needs to know where on the MAP each pixel is — its swell and
 * its glints are functions of world coordinates and time, which is what
 * anchors the sea to the ground instead of to the screen (upstream reads
 * u_campos for the same reason). Everything else here is VS unchanged.
 */
const WATER_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aPos;
layout(location=2) in vec2 aSize;
layout(location=3) in float aRot;
layout(location=4) in vec4 aUV;
layout(location=5) in vec4 aTint;
uniform vec2 uRes;
uniform float uZoom;
uniform vec2 uOff;
out vec2 vUV;
out vec2 vWorld;
out vec4 vTint;
void main() {
  float s = sin(aRot), c = cos(aRot);
  vec2 sc = aCorner * aSize;
  vec2 p = vec2(sc.x * c - sc.y * s, sc.x * s + sc.y * c) + aPos;
  vec2 view = p * uZoom + uOff;
  vec2 clip = view / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vUV = mix(aUV.xy, aUV.zw, aCorner + 0.5);
  vWorld = p;
  vTint = aTint;
}`;

/**
 * shaders/water.frag, ported, minus its big swell. ONE thing moves: the
 * surface slides sideways by up to a world unit, on a sine of the row and
 * the clock — the fine ripple that runs along the shoreline. Upstream also
 * drifts a band of brighter water 7 units wide in every 40 across the sea,
 * a highlight five tiles across that reads at this zoom as a slab of the
 * lake lighting up rather than as water moving; that band is gone. The
 * constants left are the original's — the /5 clock, the (0.9, 0.9, 1) cast.
 *
 * Upstream runs this over the whole cached floor texture, so its `coords`
 * are camera-space Mindustry world units and its displacement is measured
 * in SCREEN texels of that cache. Here it runs per water tile, so the
 * world position comes from the vertex stage and the displacement is
 * converted to a UV step on the tile (uUnit, one world unit) — which is
 * why the water cells are packed 3x3 with a tile of headroom around them
 * (see the atlas's WATER_TILE note).
 *
 * One difference that cannot be helped: Mindustry's world y runs UP and
 * this game's runs down, so the sine of `coords.y` is mirrored. It is a
 * sine either way — what changes is which way the ripple travels, not
 * what it looks like.
 */
const WATER_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uTime;   // Mindustry ticks
uniform float uUnit;   // one Mindustry world unit as a UV step along x
in vec2 vUV;
in vec2 vWorld;
in vec4 vTint;
out vec4 o;
const float MU = ${(CELL / 8).toFixed(4)};  // px per Mindustry world unit
void main() {
  vec2 coords = vWorld / MU;
  float stime = uTime / 5.0;
  vec4 sampled = texture(uTex, vUV + vec2(sin(stime / 3.0 + coords.y / 0.75) * uUnit, 0.0));
  vec3 color = sampled.rgb * vec3(0.9, 0.9, 1.0);
  float a = min(sampled.a * 100.0, 1.0);
  o = vec4(color * vTint.rgb * vTint.a, a * vTint.a);
}`;

const FLOATS = 13; // pos2 size2 rot1 uv4 tint4

interface Batch {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  data: Float32Array;
  n: number;
  cap: number;
}

/**
 * WebGL2 instanced sprite renderer. A handful of draws per frame: three
 * static batches (floors, the wall-shadow quad on its own texture, walls),
 * one dynamic batch (towers, units, projectiles, effects) in painter's
 * order, then the shield gather + full-screen blit.
 */
export class Renderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: WebGLProgram;
  private readonly uRes: WebGLUniformLocation;
  private readonly uZoom: WebGLUniformLocation;
  private readonly uOff: WebGLUniformLocation;
  private readonly quadVBO: WebGLBuffer;
  private readonly tex: WebGLTexture;
  private readonly terrain: Batch;
  /**
   * The sea, split out of the terrain batch because it is the one floor
   * drawn through a shader of its own. It holds nothing but the base tile
   * of every water cell — the land's edge fades over a shoreline stay in
   * `terrain` and draw on top, which is the blend order water has always
   * had (GROUP_PRI puts it at the bottom)
   */
  private readonly water: Batch;
  private readonly waterProg: WebGLProgram;
  private readonly uWaterRes: WebGLUniformLocation;
  private readonly uWaterZoom: WebGLUniformLocation;
  private readonly uWaterOff: WebGLUniformLocation;
  private readonly uWaterTime: WebGLUniformLocation;
  private readonly uWaterUnit: WebGLUniformLocation;
  /** this frame's camera, kept for the passes that run their own program */
  private view = { zoom: 1, offX: 0, offY: 0, kPx: 1 };
  /** seconds of sim time the sea is animated by — see drawWorld */
  private waterTime = 0;
  // walls (and props) draw in their own batch so the shadow quad can slot
  // between floors and walls with a different texture bound
  private readonly walls: Batch;
  private readonly shadow: Batch;
  /** the map-covering quad that draws darkTex (see DARK_RADIUS) */
  private readonly dark: Batch;
  // the wall-shadow mask: COLS x ROWS texels, LINEAR-filtered — bilinear
  // magnification is what melts the per-tile mask into a soft rim, so it
  // cannot live in the NEAREST-filtered sprite atlas
  private readonly shadowTex: WebGLTexture;
  /** the darkness buffer: one texel a cell, linear, see DARK_RADIUS */
  private readonly darkTex: WebGLTexture;
  private readonly dyn: Batch;
  /**
   * the force-field fills for this frame. They never reach the screen
   * directly — they are drawn into the shield buffer and blitted through
   * SHIELD_FS, which is what merges overlapping bubbles into one shape
   */
  private readonly shields: Batch;
  /**
   * the ENERGY FIELD fills for this frame, and a second batch rather than
   * more quads in `shields` for one reason: the blit merges everything it
   * finds into one shape under one rim. That is the whole point of drawing
   * the fields this way — two livewire4s standing in one lane are ONE
   * threatened area, not two overlapping circles — but a field and a force
   * field are unrelated mechanics, and a ring brushing a carrier's bubble
   * would come out as a single shape claiming they were the same thing.
   * One pass each: same buffer, same program, cleared and blitted twice
   */
  private readonly fields: Batch;
  private readonly shieldProg: WebGLProgram;
  private readonly uShieldCam: WebGLUniformLocation;
  private readonly uShieldInv: WebGLUniformLocation;
  private readonly uShieldTime: WebGLUniformLocation;
  private readonly uShieldDp: WebGLUniformLocation;
  private readonly uShieldZig: WebGLUniformLocation;
  private readonly uShieldAlpha: WebGLUniformLocation;
  private readonly uShieldFill: WebGLUniformLocation;
  private readonly uShieldEdge: WebGLUniformLocation;
  /** the field pass's uZig, refilled per frame from the zoom — the teeth are
   *  a screen-space size (FIELD_TOOTH_PX), so they cannot be a constant */
  private readonly fieldZig = new Float32Array([1, 1, 1, FIELD_SNAP]);
  /** the fullscreen quad the blit runs over, on the shared corner VBO */
  private readonly blitVao: WebGLVertexArrayObject;
  private shieldFbo: WebGLFramebuffer | null = null;
  private shieldTex: WebGLTexture | null = null;
  private shieldW = 0;
  private shieldH = 0;
  /**
   * did the buffer come up? A driver that will not give us a complete
   * framebuffer gets Mindustry's own no-shader path instead (see
   * ForceProjector.drawShield with animateShields off): a stroked outline
   * over a faint fill, no wobble and no merging, but a visible field
   */
  private shieldReady = true;
  // the visible world rect this frame (set by render), for culling
  private vx0 = 0;
  private vy0 = 0;
  private vx1 = W;
  private vy1 = H;
  // the base of the terrain currently in the static batches; renderTerrain
  // (the editor) has no sim to ask, so rebuildTerrain leaves it here
  private base = { ...BASE };
  /**
   * The hill shadow as the CPU sees it: the mask's shade per cell, 0..1,
   * kept from rebuildTerrain so whatever STANDS on the ground — a walker,
   * a hull, a boulder — can be darkened by the shade at its feet. The
   * quad darkens the floor; this darkens what is on it. Flyers are above
   * it and stay lit.
   */
  private shade = new Float32Array(NCELLS);
  private readonly shadeTint: [number, number, number] = [1, 1, 1];
  /**
   * The team cell each kind wears and the colour one is drawn in, both
   * scratch: the table is read off the SHEET (atlas.ts UNIT_CELL), which
   * is only filled once the sprites are packed — after this module is
   * imported and before a renderer exists — so it is taken here rather
   * than beside the other per-kind tables at the top of the file.
   */
  private readonly kindCell: readonly (CellArt | null)[] = UNIT_KINDS.map((k) => UNIT_CELL[k] ?? null);
  private readonly cellTint: [number, number, number] = [1, 1, 1];
  /**
   * THE SHADOW MASK, in two halves.
   *
   * `shadowMask` is the texture's own bytes, kept rather than made fresh
   * so a tower going up costs one upload and no allocation; `shadowStatic`
   * is the half rebuildTerrain stamped — the hills and the core — which
   * the buildings' half is laid over each time the field changes
   * (syncBuildShadow), so lifting a wrecked turret's stamp puts the ground
   * under it back exactly as the terrain left it.
   */
  private readonly shadowMask = new Uint8Array(NCELLS * 4);
  private readonly shadowStatic = new Uint8Array(NCELLS);
  /** the footprints in the mask right now, packed cell-and-size, in field
   *  order, and the same list gathered this frame: comparing the two is
   *  the cheap "has anything been built or wrecked?" every frame asks,
   *  and both are kept so neither allocates once the line has its length */
  private readonly shadowBuilds: number[] = [];
  private readonly shadowNext: number[] = [];
  // layer visibility of whatever is currently in the static batches, so the
  // editor's base sprite (drawn per frame) matches the terrain it sits on
  private layers: TerrainLayers = ALL_LAYERS;
  /** are ambient effects being kept? (see setEffects) */
  private fxOn = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    atlas: HTMLCanvasElement,
  ) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    if (!gl) throw new Error("WebGL2 is required");
    this.gl = gl;

    this.prog = this.link(VS, FS);
    const need = (name: string): WebGLUniformLocation => {
      const loc = gl.getUniformLocation(this.prog, name);
      if (!loc) throw new Error(`${name} uniform missing`);
      return loc;
    };
    this.uRes = need("uRes");
    this.uZoom = need("uZoom");
    this.uOff = need("uOff");
    // the sheet's pixel pitch, for the fragment clamp (see the FS note);
    // set once, since the sheet never changes size
    gl.useProgram(this.prog);
    gl.uniform2f(need("uTexel"), 1 / atlas.width, 1 / atlas.height);

    const quad = gl.createBuffer();
    if (!quad) throw new Error("buffer alloc failed");
    this.quadVBO = quad;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
      gl.STATIC_DRAW,
    );

    // floor tile + up to 8 floor-edge fades per cell (worst-case borders)
    this.terrain = this.makeBatch(NCELLS * 6 + 512);
    // one quad per water cell — a map that is all sea is the worst case
    this.water = this.makeBatch(NCELLS + 64);
    // wall tiles + decor/pine props
    this.walls = this.makeBatch(NCELLS * 2 + 2048);
    this.shadow = this.makeBatch(4);
    this.dark = this.makeBatch(4);
    // a swarm budget, not a worst case: 12 quads is a walking mech with one
    // mirrored gun drawn twice (silhouette rim under, art over), which is
    // what MAX_UNITS of anything is ever actually made of, and the 13th is
    // the shadow every body throws (GROUND_SHADOW_ALPHA, and the flyers'
    // drop shadow before it). The heavies cost more — an ironhide4's three
    // mounts make 20, a six-legged dartback3 closer to 50, and a naval hull 15
    // (one for the boat, fourteen for the two sides of its wake) — and a
    // field that was somehow ALL heavies would run this dry; they arrive in
    // tens, among thousands of the cheap kinds that do not
    this.dyn = this.makeBatch(MAX_UNITS * 13 + 2048);
    // one quad per hexagonal bubble; a polygon of any other side count
    // takes one per side, so this holds a wave's worth either way
    this.shields = this.makeBatch(2048);
    // one quad per field-caster on screen, and they arrive in tens
    this.fields = this.makeBatch(512);

    this.waterProg = this.link(WATER_VS, WATER_FS);
    const needWater = (name: string): WebGLUniformLocation => {
      const loc = gl.getUniformLocation(this.waterProg, name);
      if (!loc) throw new Error(`${name} uniform missing`);
      return loc;
    };
    this.uWaterRes = needWater("uRes");
    this.uWaterZoom = needWater("uZoom");
    this.uWaterOff = needWater("uOff");
    this.uWaterTime = needWater("uTime");
    this.uWaterUnit = needWater("uUnit");

    this.shieldProg = this.link(SHIELD_VS, SHIELD_FS);
    const needIn = (name: string): WebGLUniformLocation => {
      const loc = gl.getUniformLocation(this.shieldProg, name);
      if (!loc) throw new Error(`${name} uniform missing`);
      return loc;
    };
    this.uShieldCam = needIn("uCam");
    this.uShieldInv = needIn("uInv");
    this.uShieldTime = needIn("uTime");
    this.uShieldDp = needIn("uDp");
    this.uShieldZig = needIn("uZig");
    this.uShieldAlpha = needIn("uAlpha");
    this.uShieldFill = needIn("uFill");
    this.uShieldEdge = needIn("uEdge");
    // the blit is one quad off the shared corner VBO — no instance data,
    // so it takes attribute 0 alone
    const bvao = gl.createVertexArray();
    if (!bvao) throw new Error("blit vao alloc failed");
    this.blitVao = bvao;
    gl.bindVertexArray(bvao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const stex = gl.createTexture();
    if (!stex) throw new Error("shadow texture alloc failed");
    this.shadowTex = stex;
    gl.bindTexture(gl.TEXTURE_2D, stex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const dtex = gl.createTexture();
    if (!dtex) throw new Error("darkness texture alloc failed");
    this.darkTex = dtex;
    gl.bindTexture(gl.TEXTURE_2D, dtex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const tex = gl.createTexture();
    if (!tex) throw new Error("texture alloc failed");
    this.tex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); // crisp pixel art when zoomed in
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 3); // deeper mips bleed across atlas cells
    // cells flush against the atlas border (the silhouette row at y=960)
    // must not wrap-blend with the opposite edge's tiles at deep mips
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(CLEAR[0], CLEAR[1], CLEAR[2], 1); // the map ends in this too
  }



  private link(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const sh = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type);
      if (!s) throw new Error("shader alloc failed");
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
      return s;
    };
    const p = gl.createProgram();
    if (!p) throw new Error("program alloc failed");
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p) ?? "program link failed");
    return p;
  }

  private makeBatch(cap: number): Batch {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("batch alloc failed");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, cap * FLOATS * 4, gl.DYNAMIC_DRAW);
    const stride = FLOATS * 4;
    const attrs: ReadonlyArray<readonly [number, number, number]> = [
      [1, 2, 0],
      [2, 2, 8],
      [3, 1, 16],
      [4, 4, 20],
      [5, 4, 36],
    ];
    for (const [loc, size, off] of attrs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return { vao, vbo, data: new Float32Array(cap * FLOATS), n: 0, cap };
  }

  /**
   * A walking mech, layered like Mindustry's drawMech: legs stride along
   * the chassis facing (the swinging leg lifts and shortens by half, the
   * planted one tints toward Pal.darkMetal), the chassis turns feet-first
   * at its own lagging rotation, then guns and body ride the body rotation
   * and sway with the stride.
   */
  private pushMech(
    b: Batch,
    m: MechArt,
    x: number,
    y: number,
    rot: number,
    brot: number,
    walk: number,
    tint: readonly [number, number, number],
    cell: CellArt | null,
    cellCol: RGB,
  ): void {
    const s = m.sprite;
    // A RIG WHOSE STRIDE IS ZERO WALKS ON THE SPOT, and it has to be
    // asked for that in so many words. The cycle below both takes a
    // modulo BY the stride and divides by it, so at zero each of those is
    // NaN — and the NaN does not stay in the gait: it rides through
    // `sway` into the BODY quad's own position, and a quad with no
    // position is a quad that never lands. A rig that shipped with a
    // stride of 0 drew as nothing but its ground shadow (a separate flat
    // quad off KIND_UV, which never comes through here) — a body-shaped
    // hole in the floor with no body standing in it. Three lines to make
    // that a still sprite instead.
    const st = m.stride;
    const raw = st > 0 ? walk % (st * 4) : 0;
    const ext = st > 0 ? (raw > st * 3 ? raw - st * 4 : raw > st ? st * 2 - raw : raw) : 0;
    // Mindustry walkExtend: a 4-stride cycle — triangle wave for the leg
    // reach, quarter-phase sine for lift and sway
    const lift = st > 0 ? Math.sin(((raw / st) * Math.PI) / 2) : 0;
    const cb = Math.cos(brot), sb = Math.sin(brot);
    // stride sway shifts everything above the chassis (guns + body only)
    const sway = lift * (m.sideSway ?? SIDE_SWAY);
    const fsway = st > 0 ? Math.sin((raw / st) * Math.PI) * (m.frontSway ?? FRONT_SWAY) : 0;
    const ox = -sb * sway + cb * fsway;
    const oy = cb * sway + sb * fsway;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    // the assembly in draw order: legs → base → under-slung guns → body →
    // guns that ride ON the body (Weapon.top). Each entry carries its own
    // art and silhouette cells, which is what lets a hull mix gun sprites.
    // `dk` is the planted-leg darkening, applied on the art pass only.
    // The records live in a module-scratch pool reused call to call — a
    // fresh array of tuples here was tens of thousands of allocations a
    // frame with a swarm on screen, which is GC-hitch territory
    let np = 0;
    const part = (
      uv: UVRect, sil: UVRect, px: number, py: number,
      w: number, h: number, r: number, dk: number,
    ): void => {
      const p = MECH_PARTS[np] ?? (MECH_PARTS[np] = { uv, sil, x: 0, y: 0, w: 0, h: 0, r: 0, dk: 1 });
      p.uv = uv; p.sil = sil; p.x = px; p.y = py; p.w = w; p.h = h; p.r = r; p.dk = dk;
      np++;
    };
    for (let side = -1; side <= 1; side += 2) {
      const dk = st > 0 ? 1 - Math.max(0, (side * ext) / st) * LEG_SHADE : 1;
      part(
        m.leg,
        m.sil.leg,
        x + cb * ext * side,
        y + sb * ext * side,
        s * (1 - Math.max(-lift * side, 0) * (m.legLift ?? LEG_LIFT)),
        s * side, // negative height mirrors the off-side leg
        brot,
        dk,
      );
    }
    part(m.base, m.sil.base, x, y, s, s, brot, 1);
    const gunParts = (top: boolean): void => {
      for (const g of m.guns) {
        if (g.top !== top) continue;
        // an unmirrored mount is drawn once, on the +x side (see LegGun)
        for (let side = g.mirror === false ? 1 : -1; side <= 1; side += 2) {
          part(
            g.uv,
            g.sil,
            x + ox + cr * g.y - sr * g.x * side,
            y + oy + sr * g.y + cr * g.x * side,
            s,
            s * side, // mirrored mount, like Weapon.flipSprite
            rot,
            1,
          );
        }
      }
    };
    gunParts(false);
    const bodyPart = np;
    part(m.body, m.sil.body, x + ox, y + oy, s, s, rot, 1);
    gunParts(true);
    // silhouette pass: every part as a solid dilated shape, drawn first so
    // the art covers all of it but a single rim around the assembly — the
    // outer border without a line at every seam of the walking mech
    for (let k = 0; k < np; k++) {
      const p = MECH_PARTS[k];
      this.push(b, p.x, p.y, p.w, p.h, p.r, p.sil, tint[0], tint[1], tint[2], 1);
    }
    for (let k = 0; k < np; k++) {
      const p = MECH_PARTS[k];
      this.push(b, p.x, p.y, p.w, p.h, p.r, p.uv, tint[0] * p.dk, tint[1] * p.dk, tint[2] * p.dk, 1);
      // the cell rides the chassis it is painted on, so it goes down with
      // that part rather than after the assembly: a mount that sits ON the
      // body (Weapon.top) covers it here exactly as it covers the hull
      if (k === bodyPart && cell) this.pushCell(b, cell, p.x, p.y, p.w, p.r, cellCol);
    }
  }

  /**
   * A walking LEG unit, layered like Mindustry's drawLegs: feet planted in
   * the world, two segments stroked between mount, knee and foot, then the
   * mount plate, the guns and the body over them.
   *
   * Nothing here is animated — the sim owns every joint and foot position
   * (Sim.updateLegs), so this only decides what covers what. Legs run
   * outside-in so a near leg never draws under a far one, and everything
   * but the stretched segments gets the silhouette under-layer pushMech
   * uses, which leaves one rim around the whole assembly instead of a line
   * at every seam.
   */
  private pushLegs(
    b: Batch,
    art: LegArt,
    L: LegSpec,
    sim: SimView,
    i: number,
    tint: readonly [number, number, number],
    cell: CellArt | null,
    cellCol: RGB,
  ): void {
    const { ulegFX, ulegFY, ulegJX, ulegJY, ulegStage, ulegMove } = sim;
    const x = sim.upx[i], y = sim.upy[i];
    const brot = sim.ubrot[i], rot = sim.urot[i];
    const n = L.count, off = i * MAX_LEGS;
    const sz = art.sprite, sm = art.small;
    const [tr, tg, tb] = tint;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    // mount angles are brot + a fixed slice each — composed off one cos/sin
    const trig = KIND_GAIT_TRIG[sim.ukind[i]]!;
    const cb = Math.cos(brot), sb = Math.sin(brot);
    const swinging = ulegMove[i];

    // a foot at the top of its swing throws its shadow clear of itself —
    // the only cue that a leg is off the ground rather than sliding along it
    for (let k = 0; k < n; k++) {
      if (!(swinging & (1 << k)) || L.elevation <= 0) continue;
      const p = off + k;
      // Mathf.slope: a triangle peaking mid-swing, so the foot rises and lands
      const elev = (1 - Math.abs(1 - ulegStage[p] - 0.5) * 2) * L.elevation;
      const ca = cb * trig[k * 2] - sb * trig[k * 2 + 1];
      const sa = sb * trig[k * 2] + cb * trig[k * 2 + 1];
      const mx = x + ca * L.baseOffset, my = y + sa * L.baseOffset;
      const fa = Math.atan2(ulegFY[p] - my, ulegFX[p] - mx);
      this.push(b, ulegFX[p] + SHADOW_TX * elev, ulegFY[p] + SHADOW_TY * elev,
        sm, sm, fa, art.foot, 0, 0, 0, SHADOW_ALPHA);
    }

    for (let pass = 0; pass < 2; pass++) {
      const painted = pass === 1; // 0 = silhouette under-layer, 1 = the art
      for (let j = n - 1; j >= 0; j--) {
        // Mindustry's draw order: 0, n-1, 1, n-2, … — outermost pair last
        const k = j % 2 === 0 ? j / 2 : n - 1 - ((j / 2) | 0);
        const p = off + k;
        const ca = cb * trig[k * 2] - sb * trig[k * 2 + 1];
        const sa = sb * trig[k * 2] + cb * trig[k * 2 + 1];
        const mx = x + ca * L.baseOffset, my = y + sa * L.baseOffset;
        const fx = ulegFX[p], fy = ulegFY[p], jx = ulegJX[p], jy = ulegJY[p];
        this.push(b, fx, fy, sm, sm, Math.atan2(fy - my, fx - mx),
          painted ? art.foot : art.sil.foot, tr, tg, tb, 1);
        if (painted) {
          // the segment sprites are asymmetric: one half of the ring draws
          // them mirrored (Mindustry's negative Lines.stroke) so every knee
          // bends the way its art was drawn
          const flip = k >= n / 2 ? 1 : -1;
          this.pushSeg(b, mx, my, jx, jy, art.leg, art.legStroke * flip, tint);
          // the lower segment starts legExtension PAST the knee, so the
          // sprite covers the joint instead of butting up against it.
          // Its MAGNITUDE is all that counts: Mindustry writes the offset
          // as `.inv().setLength(legExtension)`, and Arc's setLength goes
          // through setLength2(len * len) — a negative length comes back
          // out positive. dartback4's -15 is a +15 offset in the real game
          const dx = jx - fx, dy = jy - fy;
          const d = Math.hypot(dx, dy) || 1;
          const ext = Math.abs(L.extension);
          const ex = (dx / d) * ext, ey = (dy / d) * ext;
          this.pushSeg(b, jx + ex, jy + ey, fx, fy, art.legBase, art.legBaseStroke * flip, tint);
        }
        // the knee cap is never rotated — Mindustry draws it upright. Not
        // every legged unit has one: dartback4 leaves its elbow as the bare
        // overlap of the two segments and caps the shoulder instead
        const joint = painted ? art.joint : art.sil.joint;
        if (joint) this.push(b, jx, jy, sm, sm, 0, joint, tr, tg, tb, 1);
      }
      // the shoulder plates go on after EVERY leg (UnitType.drawLegs draws
      // base joints in their own pass) — one drawn leg by leg would be
      // buried by the next leg round the ring. They ride the CHASSIS
      // angle, like the mount ring they cap and unlike the body over them
      const baseJoint = painted ? art.baseJoint : art.sil.baseJoint;
      if (baseJoint) {
        for (let k = 0; k < n; k++) {
          const ca = cb * trig[k * 2] - sb * trig[k * 2 + 1];
          const sa = sb * trig[k * 2] + cb * trig[k * 2 + 1];
          this.push(b, x + ca * L.baseOffset, y + sa * L.baseOffset,
            sm, sm, brot, baseJoint, tr, tg, tb, 1);
        }
      }
      // the plate the legs hang off turns with the chassis, the body and its
      // guns with the unit's own facing. A gun mount is mirrored to both
      // sides (Weapon.mirror), the far one drawn from the same sprite
      // flipped, and Weapon.top decides which side of the body it lands on
      const gun = (g: LegGun): void => {
        for (let side = g.mirror === false ? 1 : -1; side <= 1; side += 2) {
          this.push(b, x + cr * g.y - sr * g.x * side, y + sr * g.y + cr * g.x * side,
            sz, sz * side, rot, painted ? g.uv : g.sil, tr, tg, tb, 1);
        }
      };
      const base = painted ? art.base : art.sil.base;
      if (base) this.push(b, x, y, sz, sz, brot, base, tr, tg, tb, 1);
      for (const g of art.guns) if (!g.top) gun(g);
      this.push(b, x, y, sz, sz, rot, painted ? art.body : art.sil.body, tr, tg, tb, 1);
      // the cell is art, not silhouette: it goes on the painted pass only,
      // over the hull and under the guns that ride on top of it
      if (painted && cell) this.pushCell(b, cell, x, y, sz, rot, cellCol);
      for (const g of art.guns) if (g.top) gun(g);
    }
  }

  /**
   * One leg segment: the region stretched between two points, as wide as
   * `stroke` across (Mindustry Lines.line). A negative stroke mirrors the
   * art, which is how the two sides of the body share one sprite.
   */
  /**
   * A hull's wake: Mindustry's two WaveTrails (WaterMoveComp), drawn as
   * strips of foam that taper to nothing at the tail.
   *
   * Upstream keeps a Trail per side, each fed a point per tick at
   * (+-waveTrailX, waveTrailY) in the hull's own frame, and draws each as
   * a run of quads whose half-width grows linearly from 0 at the oldest
   * point to `trailScl` at the newest (Trail.draw's `i/3f * size * w1`).
   *
   * This draws the same shape off the sim's ONE subsampled centre path
   * (see WAKE_PTS): each stored point is offset by the local travel
   * direction — back by waveTrailY, out by +-waveTrailX — and consecutive
   * offsets are joined by a stroked segment. Two departures, both cheap
   * and both invisible at the sizes involved: the strip is a chain of
   * uniform-width segments rather than true tapering quads (the step
   * between two of eight widths is under a pixel and a half on the widest
   * hull there is), and the offsets are rebuilt from the path instead of
   * being stored, which is only different from upstream while a boat is
   * turning faster than its own wake settles.
   *
   * The live position is the head of the path — the trail joins the hull
   * rather than the last sample, exactly as Trail.draw's lastX/lastY do.
   */
  private pushWake(b: Batch, sim: SimView, i: number, w: WakeSpec): void {
    const m = sim.uwakeN[i];
    if (m < 1) return;
    const off = i * WAKE_PTS;
    // path points oldest first, the hull's own position last
    const M = m + 1;
    const px = WAKE_PX, py = WAKE_PY;
    for (let k = 0; k < m; k++) {
      px[k] = sim.uwakeX[off + k];
      py[k] = sim.uwakeY[off + k];
    }
    px[m] = sim.upx[i];
    py[m] = sim.upy[i];
    // the travel direction at each point: toward the next one, and at the
    // head the heading the hull is actually drawn on. A pair of points the
    // boat has not moved between inherits the direction behind it
    let dx = Math.cos(sim.urot[i]), dy = Math.sin(sim.urot[i]);
    const dxs = WAKE_DX, dys = WAKE_DY;
    for (let k = M - 2; k >= 0; k--) {
      const ax = px[k + 1] - px[k], ay = py[k + 1] - py[k];
      const l = Math.hypot(ax, ay);
      if (l > 1e-3) {
        dx = ax / l;
        dy = ay / l;
      }
      dxs[k] = dx;
      dys[k] = dy;
    }
    dxs[M - 1] = Math.cos(sim.urot[i]);
    dys[M - 1] = Math.sin(sim.urot[i]);
    const span = M - 1;
    for (let side = -1; side <= 1; side += 2) {
      let x0 = 0, y0 = 0;
      for (let k = 0; k < M; k++) {
        // back along the heading by waveTrailY, out across it by
        // waveTrailX — Angles.trns(rotation - 90, x * sign, y) in a frame
        // where a unit faces +x instead of +y
        const fx = dxs[k], fy = dys[k];
        const x1 = px[k] + fx * w.y - fy * (side * w.x);
        const y1 = py[k] + fy * w.y + fx * (side * w.x);
        if (k > 0) {
          // Trail.draw's taper: half-width 0 at the tail, trailScl at the
          // head. One segment carries the two half-widths it spans, which
          // add up to the full stroke between them
          const stroke = (w.scl * (k - 1)) / span + (w.scl * k) / span;
          // ...and the same taper again in alpha: the oldest segment is
          // gone entirely, the newest carries the full wash
          this.pushSeg(b, x0, y0, x1, y1, UV_SOLID, stroke, WAKE_COL, (WAKE_ALPHA * k) / span);
        }
        x0 = x1;
        y0 = y1;
      }
    }
  }

  private pushSeg(
    b: Batch,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    uvr: UVRect,
    stroke: number,
    tint: readonly [number, number, number],
    alpha = 1,
  ): void {
    const dx = x2 - x1, dy = y2 - y1;
    this.push(b, x1 + dx / 2, y1 + dy / 2, Math.hypot(dx, dy), stroke, Math.atan2(dy, dx),
      uvr, tint[0], tint[1], tint[2], alpha);
  }

  /**
   * THE SWELL, and the one place a unit's art can be drawn at a size the
   * sim did not choose.
   *
   * A hungry unit grows five per cent a meal (mutation.ts), and a unit's
   * art is not one quad: a mech is a dozen parts at world positions, a
   * legged hull is feet, knees and segments the SIM owns, and every one of
   * them would have to be scaled about the body's centre by hand. So the
   * scale lives here instead — one pivot and one factor, applied to
   * position AND size as each part goes into the batch, which makes every
   * draw path swell correctly without any of them knowing about it.
   *
   * Zero cost when nothing is swelling: the factor is exactly 1 for every
   * unit that has never eaten, and the branch below is skipped outright.
   * Height keeps its sign, so a mirrored part stays mirrored.
   */
  private sScale = 1;
  private sPivotX = 0;
  private sPivotY = 0;

  /** draw everything until endScale() `f` times its size about (x, y) */
  private beginScale(x: number, y: number, f: number): void {
    this.sScale = f;
    this.sPivotX = x;
    this.sPivotY = y;
  }

  private endScale(): void {
    this.sScale = 1;
  }

  private push(
    b: Batch,
    x: number,
    y: number,
    w: number,
    h: number,
    rot: number,
    uvr: UVRect,
    r: number,
    g: number,
    bl: number,
    a: number,
  ): void {
    if (b.n >= b.cap) return;
    const f = this.sScale;
    if (f !== 1) {
      x = this.sPivotX + (x - this.sPivotX) * f;
      y = this.sPivotY + (y - this.sPivotY) * f;
      w *= f;
      h *= f;
    }
    let o = b.n * FLOATS;
    const d = b.data;
    d[o++] = x; d[o++] = y; d[o++] = w; d[o++] = h; d[o++] = rot;
    d[o++] = uvr[0]; d[o++] = uvr[1]; d[o++] = uvr[2]; d[o++] = uvr[3];
    d[o++] = r; d[o++] = g; d[o++] = bl; d[o++] = a;
    b.n++;
  }

  private draw(b: Batch, upload: boolean): void {
    if (b.n === 0) return;
    const gl = this.gl;
    gl.bindVertexArray(b.vao);
    if (upload) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data, 0, b.n * FLOATS);
    }
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, b.n);
  }

  /**
   * rebuild the static tile batch — call on init and whenever the map
   * changes.
   *
   * THE SPAWN LAYER IS PAINTED HERE: a pad tile on every cell of
   * Terrain.spawn, tinted (see pass 3). It is a painted layer rather than
   * a circle on an overlay, so it belongs in the batch with the rest of
   * the ground — and `layers.spawn` turns it off, for an author who wants
   * to see the floor underneath and for the game, which never shows it
   * (GAME_LAYERS): in a match the mouths are the routes overlay's job.
   */
  rebuildTerrain(src: { terrain: Terrain }, layers: TerrainLayers = ALL_LAYERS): void {
    const gl = this.gl;
    const t = this.terrain;
    const wt = this.water;
    const T = src.terrain;
    this.base = T.base;
    this.layers = layers;
    t.n = 0;
    wt.n = 0;
    // does this cell show its floor (rather than a wall sprite)? pine cells
    // (and tower cells, which aren't in terrain.blocked at all) get their
    // floor painted; props draw over it below. With the wall layer hidden
    // EVERY cell shows its floor — that is what lets the editor paint the
    // ground a hill is standing on
    const showsFloor = (j: number): boolean =>
      !layers.wall || showsFloorCell(T.blocked[j], T.wall[j]);
    // A MAP IS DRAWN AT ITS OWN SIZE, not the grid's.
    //
    // Every document is lifted onto the full COLS x ROWS grid on load and
    // the space past its own edge is filled with rock (terrainFromMap), so
    // a map shorter than the board used to be drawn WITH that filler: a
    // 182-row map rendered as 182 rows of terrain and ten more of dead
    // apron, indistinguishable from map. Shortening a map then did nothing
    // you could see, which is exactly the bug this fixes — the padding is
    // scaffolding for the arrays, never something to look at.
    //
    // Stopping the passes at rows/cols leaves the void beyond the edge,
    // which the rim's rock darkens into on its own (drawDarkness). The
    // editor still PAINTS the whole grid, so extending a map downward keeps
    // working: a painted cell past the edge stops being padding, and the
    // editor re-reads the height (see MapEditor.mapRows).
    const mapRows = Math.max(1, Math.min(ROWS, T.rows));
    const mapCols = Math.max(1, Math.min(COLS, T.cols));
    // pass 1: floors, with Floor.drawEdges fades — a neighboring floor of
    // higher blend priority overlays its edge sub-cell for that direction.
    // Lower-priority groups overlay first, like the blenders id sort
    for (let y = 0; y < mapRows; y++) {
      for (let x = 0; x < mapCols; x++) {
        const i = y * COLS + x;
        if (!showsFloor(i)) continue;
        const cx = (x + 0.5) * CELL, cy = (y + 0.5) * CELL;
        // the sea goes to its own batch and its own program; every other
        // floor, and EVERY edge fade including the ones that overlay a
        // water cell, stays here and draws over it
        const wet = isWaterFloor(T.floor[i]);
        // A WATER CELL PICKS ITS OWN VARIANT. Every map on disk paints one
        // water index for a whole lake — a brush has a single water entry —
        // so taking the art straight from the index would draw the same
        // painted tile on every cell of it, waves included (atlas.ts
        // FLOOR_CELLS). The three cells of the group are the same water
        // with the wave on one, and this hash scatters them: a third of the
        // lake carries a wave, fixed per cell so it does not crawl.
        const fi = wet ? ((T.floor[i] / 3) | 0) * 3 + waterVariant(x, y) : floorVariant(T.floor[i], x, y);
        this.push(wet ? wt : t, cx, cy, CELL, CELL, 0, UV_FLOORS[fi], 1, 1, 1, 1);
        const pri = GROUP_PRI[(T.floor[i] / 3) | 0];
        for (const og of EDGE_ORDER) {
          if (GROUP_PRI[og] <= pri) continue;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= mapRows) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= mapCols || (dx === 0 && dy === 0)) continue;
              const j = ny * COLS + nx;
              if (!showsFloor(j) || ((T.floor[j] / 3) | 0) !== og) continue;
              this.push(t, cx, cy, CELL, CELL, 0, UV_FLOOR_EDGES[og][1 - dy][1 - dx], 1, 1, 1, 1);
            }
          }
        }
      }
    }

    // pass 2: the wall shadow — Mindustry's shadow buffer, exactly. Every
    // static wall is one texel in a COLS x ROWS mask on its own LINEAR-
    // filtered texture (BlockRenderer.drawShadows: blendShadowColor on a
    // white buffer, one pixel a tile, sampled with the half-tile offset
    // that puts a texel's centre on its cell's centre); one map-covering
    // quad stretches it 20x, and the bilinear ramp between a wall cell's
    // centre and the next floor cell's — half a cell of falloff, shadowColor's
    // 0.71 at the wall down to nothing — is the whole rim. Walls draw after
    // this quad, so the hills themselves stay clean and only the floor
    // around them darkens; what the hill does INSIDE is pass 2b
    const mask = this.shadowMask;
    mask.fill(0);
    const stamp = (i: number): void => {
      mask[i * 4] = mask[i * 4 + 1] = mask[i * 4 + 2] = mask[i * 4 + 3] = 255;
    };
    // DEEP WATER IS BLOCKED BUT CASTS NOTHING. The shadow is a HILL's rim —
    // the ground beside something standing above it — and water is a hole,
    // not a hill. Stamping it would ring every lake with the same dark
    // fringe a cliff gets, which reads as the water being piled on the map
    if (layers.wall)
      for (let y = 0; y < mapRows; y++)
        for (let x = 0; x < mapCols; x++) {
          const i = y * COLS + x;
          if (T.blocked[i] && T.wall[i] !== WALL_DEEP) stamp(i);
        }
    // buildings on the ground stamp their footprint too, like Mindustry's
    // displayShadow blocks — the base sprite covers the middle, so what
    // shows is the rim hugging its sides. The core is the one building the
    // terrain knows about; the towers go up and come down mid-run, so they
    // are stamped over this mask instead of into it (syncBuildShadow)
    if (layers.base)
      for (let y = T.base.y; y < T.base.y + T.base.size; y++)
        for (let x = T.base.x; x < T.base.x + T.base.size; x++) stamp(y * COLS + x);
    // what the terrain alone casts, kept so a tower's stamp can be laid
    // over it and lifted off again when the tower is wrecked
    for (let i = 0; i < NCELLS; i++) this.shadowStatic[i] = mask[i * 4 + 3];
    // the towers in the mask are a mask ago's — a new terrain forces the
    // next frame to stamp them fresh
    this.shadowBuilds.length = 0;
    this.uploadShadow();
    const sh = this.shadow;
    sh.n = 0;
    this.push(sh, W / 2, H / 2, W, H, 0, [0, 0, 1, 1], 0, 0, 0, WALL_SHADOW_A);

    // pass 2b: the darkness INSIDE the walls (World.addDarkness, see
    // DARK_RADIUS). Same static walls as the shadow — rock and pine, never
    // deep water — over the map's own cells; the padding past its edge is
    // outside the map the way the world's edge is outside Mindustry's, so
    // a neighbour there is no neighbour at all
    const n = COLS * ROWS;
    const dark = new Uint8Array(n);
    if (layers.wall) {
      const isDark = (i: number): boolean => T.blocked[i] !== 0 && T.wall[i] !== WALL_DEEP;
      for (let y = 0; y < mapRows; y++)
        for (let x = 0; x < mapCols; x++) {
          const i = y * COLS + x;
          if (isDark(i)) dark[i] = DARK_RADIUS;
        }
      const next = new Uint8Array(n);
      for (let it = 0; it < DARK_RADIUS; it++) {
        for (let y = 0; y < mapRows; y++)
          for (let x = 0; x < mapCols; x++) {
            const i = y * COLS + x;
            const v = dark[i];
            const min =
              (x > 0 && dark[i - 1] < v) ||
              (x < mapCols - 1 && dark[i + 1] < v) ||
              (y > 0 && dark[i - COLS] < v) ||
              (y < mapRows - 1 && dark[i + COLS] < v);
            next[i] = Math.max(0, v - (min ? 1 : 0));
          }
        dark.set(next);
      }
    }
    const darkMask = new Uint8Array(n * 4);
    // how black THIS cell is allowed to get: DARK_MAX inland, ramping back
    // to fully opaque over the map's last DARK_RIM cells (see DARK_RIM)
    const ceiling = (x: number, y: number): number => {
      const d = Math.min(x, y, mapCols - 1 - x, mapRows - 1 - y);
      return d >= DARK_RIM ? DARK_MAX : DARK_MAX + (1 - DARK_MAX) * (1 - d / DARK_RIM);
    };
    for (let i = 0; i < n; i++) {
      if (dark[i] === 0) continue;
      // BlockRenderer.updateDarkness: 1 - min((darkness + 0.5) / 4, 1) on a
      // white buffer, and darkness.frag draws black at one minus that —
      // scaled by the cell's ceiling so the deepest cells darken rather
      // than erase, while the map's rim still reaches black
      const a = Math.round(
        Math.min((dark[i] + 0.5) / 4, 1) * ceiling(i % COLS, (i / COLS) | 0) * 255,
      );
      darkMask[i * 4] = darkMask[i * 4 + 1] = darkMask[i * 4 + 2] = darkMask[i * 4 + 3] = a;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.darkTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, COLS, ROWS, 0, gl.RGBA, gl.UNSIGNED_BYTE, darkMask);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    const dq = this.dark;
    dq.n = 0;
    this.push(dq, W / 2, H / 2, W, H, 0, [0, 0, 1, 1], 0, 0, 0, 1);

    // pass 3: the spawn pads, then the wall sprites over their
    // (shadow-darkened) cells, then the props
    const w = this.walls;
    w.n = 0;
    // THE SPAWN LAYER, one pad tile a painted cell (Terrain.spawn).
    //
    // It is drawn HERE — over the floors and over the hills' rim shadow,
    // under the props — because a pad is something laid ON the ground, and
    // because this batch is the one drawn after the water: a pad on a
    // shallow shoreline has to sit on top of the sea rather than under it.
    //
    // Every cell is one quad in a STATIC batch, so a map with a couple of
    // thousand pads pays for them when the terrain is built and nothing per
    // frame. The tint is the layer's one colour (SPAWN_STYLE), multiplied
    // over the pad sprite's own grey-pink, and the alpha lets the floor
    // beneath read through: what the pads mark is ground, still.
    if (layers.spawn) {
      const [sr, sg, sb] = SPAWN_STYLE.tint;
      for (let y = 0; y < mapRows; y++)
        for (let x = 0; x < mapCols; x++) {
          const i = y * COLS + x;
          if (!T.spawn[i]) continue;
          this.push(w, (x + 0.5) * CELL, (y + 0.5) * CELL, CELL, CELL, 0, UV_SPAWN,
            sr, sg, sb, SPAWN_STYLE.alpha);
        }
    }
    // StaticWall.drawBase's large rule: a wall cell's 2x2-ALIGNED block
    // (rx = x & ~1) that is entirely one wall family has a seeded 50%
    // chance to render as the four quadrants of that family's -large art;
    // otherwise every cell keeps its own baked variant. Seeded per block,
    // so the choice is stable across rebuilds
    const groupAt = (xx: number, yy: number): number => {
      if (xx >= COLS || yy >= ROWS) return -1;
      const j = yy * COLS + xx;
      return T.blocked[j] ? (WALL_GROUP[T.wall[j]] ?? -1) : -1;
    };
    const largeBlock = (rx: number, ry: number): boolean => {
      let h = (Math.imul(rx, 374761393) + Math.imul(ry, 668265263)) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296 < 0.5;
    };
    if (layers.wall) for (let y = 0; y < mapRows; y++) {
      for (let x = 0; x < mapCols; x++) {
        const i = y * COLS + x;
        if (showsFloor(i)) continue;
        let uvr = UV_WALLS[T.wall[i]];
        const g = WALL_GROUP[T.wall[i]] ?? -1;
        const quads = g >= 0 ? UV_WALL_LARGE[g] : null;
        if (quads) {
          const rx = x & ~1, ry = y & ~1;
          if (
            groupAt(rx, ry) === g &&
            groupAt(rx + 1, ry) === g &&
            groupAt(rx, ry + 1) === g &&
            groupAt(rx + 1, ry + 1) === g &&
            largeBlock(rx, ry)
          )
            uvr = quads[y & 1][x & 1];
        }
        this.push(w, (x + 0.5) * CELL, (y + 0.5) * CELL, CELL, CELL, 0, uvr, 1, 1, 1, 1);
      }
    }
    if (layers.props) {
      // a boulder stands in the hill's shadow like anything else on the
      // ground; a pine is the hill (its cell casts), so it is not shaded
      for (const d of T.decor) {
        // the stones and the spore crystals are off (atlas.ts DECOR_DRAWN);
        // a map that has them keeps them, they are simply not drawn
        if (!DECOR_DRAWN[d.kind]) continue;
        const lit = this.litAt(d.x, d.y);
        this.push(w, d.x, d.y, d.size, d.size, d.rot, UV_DECOR[d.kind], lit, lit, lit, 1);
      }
      // a pine's kind picks its forest (UV_PINES); kind 0 is the original
      // tree, which is what every pine saved before the table existed is
      for (const p of T.pines)
        this.push(w, p.x, p.y, p.size, p.size, p.rot, UV_PINES[p.kind] ?? UV_PINE, 1, 1, 1, 1);
    }
    for (const b of [t, wt, sh, w, dq]) {
      gl.bindVertexArray(b.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data, 0, b.n * FLOATS);
    }
  }

  /** the shadow mask as it stands, to the GPU as the rim and to the CPU as
   *  the shade whatever is standing on the ground is darkened by (litAt) */
  private uploadShadow(): void {
    const gl = this.gl;
    const mask = this.shadowMask;
    for (let i = 0; i < NCELLS; i++) this.shade[i] = mask[i * 4 + 3] / 255;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, COLS, ROWS, 0, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }

  /**
   * THE BUILDINGS CAST TOO.
   *
   * The core has always sat ON the ground rather than on top of it: its
   * footprint is stamped into the shadow mask along with the hills (pass 2
   * above), and the half-cell bilinear rim that melts out of those texels
   * is the dark hugging its sides. Everything else that gets put down —
   * turrets and the shield towers — was drawn flat, a sprite laid on the floor instead of a
   * thing standing on it.
   *
   * They stamp the same mask now, and read identically, because it IS the
   * same mask: the terrain's half is stamped once per map (shadowStatic)
   * and the buildings' half is laid over it here, whenever the line
   * changes. A footprint is at most five cells square, so the work is
   * per-building rather than per-map — the old stamps are wiped back to
   * whatever the terrain had under them, the new ones are stamped, and
   * only the rectangle that moved is sent to the texture (the fog's own
   * unpack trick, see drawFog). Nothing at all happens on a frame where
   * nothing was built or wrecked, which is nearly all of them.
   *
   * A SHELL CASTS ITS SHADOW WHOLE, as Mindustry's ConstructBlock does:
   * the foundation is on the ground from the moment it is laid, however
   * faint the sprite over it still is. A DEAD SHIELD TOWER CASTS NOTHING —
   * its ground is open again, which is what the rest of the drawing says.
   */
  private syncBuildShadow(sim: SimView): void {
    // the line as it stands, packed cell-and-size in field order, so a
    // footprint appearing, moving, resizing or being replaced by another
    // in the same frame all read as a change. FOUR bits for the size: it
    // used to be three, which held the core's five and a railhead's
    // four — and then the GIANT attribute (mods.ts) doubled a footprint
    // to eight, which is the first size that does not fit in three
    const next = this.shadowNext;
    next.length = 0;
    for (const t of sim.towers) next.push((t.gy * COLS + t.gx) * 16 + t.size);
    for (const s of sim.shieldTowers)
      if (s.hp > 0) next.push((s.gy * COLS + s.gx) * 16 + SHIELD_TOWER_SIZE);
    const cur = this.shadowBuilds;
    if (next.length === cur.length) {
      let same = true;
      for (let i = 0; i < next.length; i++)
        if (next[i] !== cur[i]) {
          same = false;
          break;
        }
      if (same) return;
    }
    const mask = this.shadowMask;
    let dx0 = COLS, dy0 = ROWS, dx1 = -1, dy1 = -1;
    // `on` stamps the building; off puts the cell back to what the terrain
    // alone casts there, which is how a wrecked turret's ground reopens
    const paint = (id: number, on: boolean): void => {
      const sz = id & 15;
      const cell = (id - sz) / 16;
      const gx = cell % COLS, gy = (cell - gx) / COLS;
      const x1 = Math.min(COLS - 1, gx + sz - 1), y1 = Math.min(ROWS - 1, gy + sz - 1);
      for (let y = gy; y <= y1; y++)
        for (let x = gx; x <= x1; x++) {
          const i = y * COLS + x;
          const a = on ? 255 : this.shadowStatic[i];
          mask[i * 4] = mask[i * 4 + 1] = mask[i * 4 + 2] = mask[i * 4 + 3] = a;
          this.shade[i] = a / 255;
        }
      if (gx < dx0) dx0 = gx;
      if (gy < dy0) dy0 = gy;
      if (x1 > dx1) dx1 = x1;
      if (y1 > dy1) dy1 = y1;
    };
    // every old stamp comes off before any new one goes on: two footprints
    // that touch would otherwise have the clear of one punch a hole in the
    // stamp of the other
    for (const id of cur) paint(id, false);
    for (const id of next) paint(id, true);
    cur.length = 0;
    for (const id of next) cur.push(id);
    if (dx1 < dx0) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    // the window is read straight out of the full-map buffer: ROW_LENGTH
    // is how wide a source row is, SKIP_* where the window starts in it
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, COLS);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, dx0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, dy0);
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, dx0, dy0, dx1 - dx0 + 1, dy1 - dy0 + 1,
      gl.RGBA, gl.UNSIGNED_BYTE, mask,
    );
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }

  /** the sea, then the land floors and their shore fades over it, then
   *  the shadow rim on its own texture, then walls and props */
  private drawWorld(): void {
    const gl = this.gl;
    if (this.water.n > 0) {
      const { zoom, offX, offY, kPx } = this.view;
      gl.useProgram(this.waterProg);
      gl.uniform2f(this.uWaterRes, this.canvas.width / kPx, this.canvas.height / kPx);
      gl.uniform1f(this.uWaterZoom, zoom);
      gl.uniform2f(this.uWaterOff, offX, offY);
      // Shaders.water's u_time is Time.time, in ticks
      gl.uniform1f(this.uWaterTime, this.waterTime * 60);
      gl.uniform1f(this.uWaterUnit, WATER_UV_UNIT);
      this.draw(this.water, false);
      gl.useProgram(this.prog);
    }
    this.draw(this.terrain, false);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    this.draw(this.shadow, false);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    this.draw(this.walls, false);
  }

  /** per-frame GL setup shared by the game and terrain-only render paths */
  private begin(zoom: number, offX: number, offY: number, kPx: number): void {
    const gl = this.gl;
    this.view = { zoom, offX, offY, kPx };
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniform2f(this.uRes, this.canvas.width / kPx, this.canvas.height / kPx);
    gl.uniform1f(this.uZoom, zoom);
    gl.uniform2f(this.uOff, offX, offY);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }

  /** terrain + base only — the map editor's frame, no sim required */
  /**
   * How lit the ground is at a world point, 0..1: one minus the hill
   * shadow there, read off the shade mask with the same bilinear the GPU
   * applies to the floor, so a thing standing on the ground is darkened
   * exactly as the ground under it is.
   */
  /** the shade mask of the terrain last built, per cell 0..1 — a copy, for
   *  a caller that will outlive the next rebuild (the title screen) */
  shadeCopy(): Float32Array {
    return Float32Array.from(this.shade);
  }

  litAt(x: number, y: number): number {
    const fx = x / CELL - 0.5, fy = y / CELL - 0.5;
    const x0 = Math.max(0, Math.min(COLS - 2, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(ROWS - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const s = this.shade;
    const a = s[y0 * COLS + x0], b = s[y0 * COLS + x0 + 1];
    const c = s[(y0 + 1) * COLS + x0], d = s[(y0 + 1) * COLS + x0 + 1];
    const v = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    return 1 - WALL_SHADOW_A * v;
  }

  /**
   * The frame just drawn, as RGBA rows from the top-left — only valid in
   * the same task as the draw, before the browser composites the canvas.
   * A diagnostic's hook, not a feature: see Game.diagnose.
   */
  readFrame(x: number, y: number, w: number, h: number): Uint8Array {
    const gl = this.gl;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(x, this.canvas.height - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  }

  /** what the browser says it is drawing with */
  gpuName(): string {
    const gl = this.gl;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(r);
  }

  renderTerrain(zoom = 1, offX = 0, offY = 0, kPx = this.canvas.width / W): void {
    // the editor has no sim to read a clock off, and a still sea in the
    // map editor looks like a bug in the map — so it runs off the wall
    // clock there, which is the same rate at 1x speed
    this.waterTime = performance.now() / 1000;
    this.begin(zoom, offX, offY, kPx);
    this.drawWorld();
    const dyn = this.dyn;
    dyn.n = 0;
    // the base of the map last built into the terrain batch (see
    // rebuildTerrain) — a map may put it anywhere, not just at BASE
    const base = this.base;
    if (!this.layers.base) {
      this.draw(dyn, true);
      this.drawDarkness();
      return;
    }
    const baseSz = base.size * CELL;
    this.push(
      dyn,
      (base.x + base.size / 2) * CELL,
      (base.y + base.size / 2) * CELL,
      baseSz,
      baseSz,
      0,
      UV_BASE,
      1, 1, 1, 1,
    );
    this.draw(dyn, true);
    this.drawDarkness();
  }

  /**
   * EVERYTHING IN FLIGHT — the artillery trails, the player's projectiles
   * and the swarm's shots — drawn ABOVE THE HILL DARKNESS at the end of
   * the frame rather than with the crowd that fired them.
   *
   * WHY IT IS ITS OWN PASS. A shot crosses ground the walkers cannot: it
   * flies over the rock between a turret and the lane, and inside a hill
   * the darkness quad (DARK_RADIUS) is nearly black. Drawn with the
   * crowd, a round on that stretch of its flight went out entirely and
   * came back on the far side — the one thing on the screen that is
   * moving fast enough for a player to lose it and not find it again.
   * Mindustry has the same order, for the same reason: Layer.bullet is
   * above Layer.darkness, and a shot is in the air over the terrain, not
   * in it.
   *
   * Order INSIDE the pass is unchanged: the trails first (Layer.bullet -
   * 0.01, under the shells that laid them), then the two rosters' rounds.
   * It runs after the flyers for the same reason it runs after the
   * darkness — a bullet is above the thing it is flying at.
   */
  private pushBullets(dyn: Batch, sim: SimView): void {
    const { vx0, vy0, vx1, vy1 } = this;
    const { fxN, fxX, fxY, fxAge, fxTtl, fxKind, fxLen, fxHasCol, fxColR, fxColG, fxColB } = sim;
    // Layer.bullet - 0.01: an artillery shell's trail is laid UNDER the
    // shells, so a volley's puffs never sit on top of the shot that made
    // them. It is the only effect below that line, which is why it takes a
    // pass of its own rather than a place in the loop after this one
    for (let f = 0; f < fxN; f++) {
      if (fxKind[f] !== FxKind.ArtilleryTrail) continue;
      const len = fxLen[f];
      const ex = fxX[f], ey = fxY[f];
      const tm = len + 8;
      if (ex < vx0 - tm || ex > vx1 + tm || ey < vy0 - tm || ey > vy1 + tm) continue;
      let col: RGB = PAL.white;
      if (fxHasCol[f]) {
        FX_VIEW_COL[0] = fxColR[f];
        FX_VIEW_COL[1] = fxColG[f];
        FX_VIEW_COL[2] = fxColB[f];
        col = FX_VIEW_COL;
      }
      this.fillCircle(dyn, ex, ey, len * (1 - fxAge[f] / fxTtl[f]), col, 1);
    }
    for (const p of sim.projs) {
      if (p.x < vx0 - 48 || p.x > vx1 + 48 || p.y < vy0 - 48 || p.y > vy1 + 48) continue;
      // the SIM's resolution, not the static table: a tacker the tree has
      // upgraded fires a different bullet, and drawing the stock one made
      // the graphite round invisible as a graphite round
      const b = sim.bulletFor(p.kind, p.frag, p.alt);
      // LiquidBulletType.draw: a water orb is not a sprite pair but a
      // filled disc of the liquid's own colour — Fill.circle(x, y,
      // orbSize). (The fout()/100 lerp toward white is a 1% shade and is
      // dropped.)
      if (b.orb) {
        this.fillCircle(dyn, p.x, p.y, b.orb, b.fxColor ?? PAL.white, 1);
        continue;
      }
      // a bare BulletType has no sprite at all — torch's flame lives
      // entirely in its shoot and hit effects. A shot thrown by a frag
      // burst carries the CHILD ammo's sprite, not the shell's
      const sp = b.sprite;
      if (!sp) {
        // THE ONE TURRET A MISSING EFFECT WOULD SILENCE. With its shoot
        // and hit effects gone, a spriteless bullet has no visible shot
        // left at all, and torch reads as a turret that tracks and never
        // fires. So the bullet — which is real, and already flying —
        // draws itself instead: one disc on the flame's own ramp, against
        // drawShootFlame's twelve. It stays a flame tongue leaving the
        // barrel, for a twelfth of the quads.
        //
        // TWO WAYS THE FLAME GOES MISSING, and this covers both. The
        // effects switch is the flat one (Sim.setEffects) — nothing is
        // pushed at all. The other is the EFFECT CAP: over FX_CAP the
        // pool drops the newest push, which is the flash of the shot
        // being fired, and a wave big enough to saturate the budget is
        // exactly when a player is reading the line for dead guns. The
        // sim marks the shots it could not draw (Projectile.bare), so
        // this is per BULLET and not per frame: a torch whose flame
        // landed keeps its full tongue and is never drawn twice.
        if (!this.fxOn || p.bare) {
          const fout = clamp(p.life / (p.life + p.age), 0, 1);
          this.fillCircle(
            dyn, p.x, p.y,
            (0.65 + fout * 1.5) * MU,
            ramp(LIGHT_FLAME, DARK_FLAME, FLAME_GRAY, 1 - fout),
            1,
          );
        }
        continue;
      }
      // BasicBulletType.draw: shrinkInterp(fout) drives both axes, so a
      // pellet tapers as it flies and a shell — on Mathf.slope — opens out
      // of the barrel, peaks at half life and closes again on the way down.
      // life + age is the lifetime the shot was born with, EXCEPT on a flak
      // shell whose fuse has primed it: that zeroes the life outright, and
      // reading fout 0 off it is exactly Mindustry's b.time = b.lifetime
      const fout = clamp(p.life / (p.life + p.age), 0, 1);
      const shrink = sp.slopeShrink ? 1 - Math.abs(fout - 0.5) * 2 : fout;
      const along = sp.along * (1 - sp.shrinkY + sp.shrinkY * shrink);
      const across = sp.across * (1 - sp.shrinkX + sp.shrinkX * shrink);
      const rot = Math.atan2(p.vy, p.vx);
      const [back, front] = BULLET_REGIONS[sp.region];
      this.push(dyn, p.x, p.y, along, across, rot, back, sp.back[0], sp.back[1], sp.back[2], 1);
      this.push(dyn, p.x, p.y, along, across, rot, front, sp.front[0], sp.front[1], sp.front[2], 1);
    }
    // THE SWARM'S SHOTS (Sim.shots): BasicBulletType.draw off each weapon's
    // own ShotLook (weapons.ts) — its sprite pair at its size in its
    // colours, shrinking on fout as the class says, a LaserBolt's lines
    // over it, or a liquid orb's plain disc
    for (const sh of sim.shots) {
      if (sh.x < vx0 - 48 || sh.x > vx1 + 48 || sh.y < vy0 - 48 || sh.y > vy1 + 48) continue;
      const look = sh.look;
      // a bomb has no velocity: it keeps the heading it was dropped on, 0
      const rot = sh.vx === 0 && sh.vy === 0 ? 0 : Math.atan2(sh.vy, sh.vx);
      if (
        look.region === "star" || look.region === "star-rot" ||
        look.region === "star-soak" || look.region === "star-fire"
      ) {
        this.drawStar(dyn, sh, rot);
        continue;
      }
      if (look.region === "orb") {
        // LiquidBulletType.draw: Fill.circle in the liquid's colour — and
        // where the shot carries a distinct `front`, a brighter core over
        // it at two thirds the radius. That second disc is the VENOM
        // SPITTERS' whole signature (weapons.ts venomOrb): one purple ball
        // with a lit centre, the same shape from the T1's spit to the T5's
        // bomb, so a player reads the family off a shot in flight. A liquid
        // orb whose two colours are the same (the old slag round) draws
        // exactly as it always did.
        this.fillCircle(dyn, sh.x, sh.y, look.width / 2, look.back, 1);
        if (look.front !== look.back)
          this.fillCircle(dyn, sh.x, sh.y, look.width / 3, look.front, 1);
        continue;
      }
      const fout = clamp(sh.life / (sh.life + sh.age), 0, 1);
      const shrink = look.slope ? 1 - Math.abs(fout - 0.5) * 2 : fout;
      const along = look.height * (1 - look.shrinkY + look.shrinkY * shrink);
      const across = look.width * (1 - look.shrinkX + look.shrinkX * shrink);
      const [back, front] = SHOT_REGIONS[look.region];
      if (back) this.push(dyn, sh.x, sh.y, along, across, rot, back, look.back[0], look.back[1], look.back[2], 1);
      this.push(dyn, sh.x, sh.y, along, across, rot, front, look.front[0], look.front[1], look.front[2], 1);
      if (look.bolt) {
        // LaserBoltBulletType.draw: a 2-wide line the bolt's length in the
        // back colour, and one half as long in the front colour, centred
        const cx = sh.x - (Math.cos(rot) * look.height) / 2, cy = sh.y - (Math.sin(rot) * look.height) / 2;
        this.strokeLine(dyn, cx, cy, rot, look.height, 2 * MU, look.back, 1);
        this.strokeLine(dyn, sh.x - (Math.cos(rot) * look.height) / 4, sh.y - (Math.sin(rot) * look.height) / 4,
          rot, look.height / 2, 2 * MU, look.front, 1);
      }
    }
  }

  /**
   * THE GRAPNELS' ROUNDS — four different stars, all of them arms of the
   * ordinary bullet sprite laid round a centre that turns as the shot
   * flies. They are DRAWN rather than packed because a handful of quads
   * costs less than a sprite cell apiece and the spin has to be live.
   *
   * AND THEY ARE FOUR OBJECTS, not one in four colours. A star off a
   * champion may be a rot star, a soaked star or a fire star, the player
   * cannot know which until it is in the air, and what it does when it
   * lands is completely different in each case — so the shape has to say
   * it as loudly as the hue, and say it at field zoom where three similar
   * silhouettes in three similar sizes are one silhouette:
   *
   *   plain   five copper arms, nothing in the middle — the runt's round
   *   rot     five FAT short arms and a heavy lobed core, an acid drop
   *           that happens to have points, hanging off the back of itself
   *   soak    five arms pulled back round a big round bead with a ring —
   *           a drop of water, and the roundest of the four
   *   fire    TEN points, a short flare between every long one, no core
   *           and half again the spin: the one that reads as burning
   */
  private drawStar(dyn: Batch, sh: ShotView, rot: number): void {
    const look = sh.look;
    const el = look.region;
    const [sback, sfront] = SHOT_REGIONS.bullet;
    const spin = rot + sh.age * (el === "star-fire" ? FIRE_SPIN : STAR_SPIN);
    const b = look.back, f = look.front;
    // the rot star's arms are stubs off a fat middle; the soaked star's
    // are pulled back into its bead; the other two run long
    const arm =
      look.height * (el === "star-rot" ? 0.4 : el === "star-soak" ? 0.44 : 0.55);
    const out = look.height * (el === "star-soak" ? 0.34 : 0.28);
    const wide = look.width * (el === "star-rot" ? 1.5 : 1);
    for (let k = 0; k < 5; k++) {
      const a = spin + (k * Math.PI * 2) / 5;
      const px = sh.x + Math.cos(a) * out, py = sh.y + Math.sin(a) * out;
      if (sback) this.push(dyn, px, py, arm, wide, a, sback, b[0], b[1], b[2], 1);
      this.push(dyn, px, py, arm, wide, a, sfront, f[0], f[1], f[2], 1);
    }
    if (el === "star-fire") {
      // the five short points BETWEEN the long ones, in the dark face, so
      // the flare reads as ten and as two colours rather than as a bigger
      // five-pointed star
      const sa = look.height * 0.3, so = look.height * 0.2;
      for (let k = 0; k < 5; k++) {
        const a = spin + ((k + 0.5) * Math.PI * 2) / 5;
        const px = sh.x + Math.cos(a) * so, py = sh.y + Math.sin(a) * so;
        this.push(dyn, px, py, sa, look.width, a, sfront, b[0], b[1], b[2], 1);
      }
      return;
    }
    if (el === "star-rot") {
      // the drip: a fat disc over the roots of the arms, and a brighter
      // bead off the back of it, which is what makes an acid star read as
      // something hanging rather than something spinning
      this.fillCircle(dyn, sh.x, sh.y, look.height * 0.3, b, 1);
      this.fillCircle(dyn, sh.x, sh.y, look.height * 0.18, f, 1);
      const tx = sh.x - Math.cos(rot) * look.height * 0.28;
      const ty = sh.y - Math.sin(rot) * look.height * 0.28;
      this.fillCircle(dyn, tx, ty, look.height * 0.14, f, 1);
      return;
    }
    if (el === "star-soak") {
      // the bead and its rim: the only one of the four with a hard round
      // outline, which is the whole of why a soaked star reads as water
      this.fillCircle(dyn, sh.x, sh.y, look.height * 0.34, b, 1);
      this.fillCircle(dyn, sh.x, sh.y, look.height * 0.22, f, 1);
      this.strokeCircle(dyn, sh.x, sh.y, look.height * 0.34, 1.5 * MU, f[0], f[1], f[2], 0.7);
    }
  }

  /**
   * One painter's pass over the crowd (drawFrame): 0 is the ground
   * crowd's contact shadows, 1 the ground units and hulls over them, 2
   * the flyers' drop shadows over all of that, 3 the flyers themselves.
   *
   * EVERY SHADOW IS ITS OWN PASS so that no body is ever drawn on top of
   * a neighbour: the ground crowd's shadows all go down before the first
   * walker does, exactly as the flyers' all go down before the first
   * flyer. Passes 0 to 2 go into the frame's batch under the bullets and
   * effects; pass 3 is drawn on its own AFTER the hill darkness, because
   * a flyer is above the terrain, never inside it.
   */
  private pushUnitPass(dyn: Batch, sim: SimView, pass: number): void {
    const { vx0, vy0, vx1, vy1 } = this;
    const { upx, upy, uhp, uhpmax, ukind, uwalk, ubrot, urot, n } = sim;
    const { ushield, ushieldAlpha, urad, uwet, uhungry, ufly, ueaten, uwade, ucloakT, ustack } = sim;
    // the two shadow passes are nothing but shadows — a whole second quad
    // per body, and the first decoration to go with the effects switched
    // off (see setEffects)
    const shadow = pass === 0 || pass === 2;
    if (shadow && !this.fxOn) return;
    const wantFly = pass > 1;
    for (let i = 0; i < n; i++) {
      const k = ukind[i];
      if (KIND_FLYING[k] !== wantFly) continue;
      // a hungry unit that has been eating is drawn HUNGRY_GROWTH bigger
      // per meal, and a waded one AMPHIBIOUS_GROWTH bigger per crossing
      // (mutation.ts) — art only, the sim's hitbox never moves. Its cull
      // margin grows with it or a swollen unit would pop out at the
      // screen edge while half of it is still on screen.
      //
      // The two ADD, because a body can be both and the player needs to
      // see that it is: on Quagmire a fed, five-times-forded dartback1 is
      // the single most dangerous thing in the lane and it must not look
      // like either one of those alone
      // ...and a folded stack (Sim.mergeSqueezed) MERGE_GROWTH bigger per
      // body it stands for, for the same reason: it is that many bodies,
      // and the player has to be able to read that it is
      const swell =
        ueaten[i] * HUNGRY_GROWTH + uwade[i] * AMPHIBIOUS_GROWTH + (ustack[i] - 1) * MERGE_GROWTH;
      const grow = swell > 0 ? 1 + swell : 1;
      const cm = grow === 1 ? KIND_CULL[k] : KIND_CULL[k] * grow;
      if (upx[i] < vx0 - cm || upx[i] > vx1 + cm || upy[i] < vy0 - cm || upy[i] > vy1 + cm)
        continue;
      const usz = KIND_SPRITE[k];
      if (grow !== 1) this.beginScale(upx[i], upy[i], grow);
      if (shadow) {
        // the body's own quad, flattened to black and thrown down-right:
        // clear of the flyer it hangs under, a rim under the walker it
        // belongs to (GROUND_SHADOW_ELEV). A mech's and a walker's body is
        // drawn from this same cell at this same size on this same
        // heading (MECH_ART.body, LEG_ART.body), so the shape that lands
        // on the ground is the shape that is standing on it — the legs
        // and the guns are not in it, and at a rim's width nothing of
        // them would show past the body anyway.
        const off = wantFly ? SHADOW_OFF : usz * GROUND_SHADOW_ELEV;
        // A GHOST CASTS A GHOST'S SHADOW: the Wraith hulls cloak (levels.ts)
        // and a full-strength shadow under a body drawn at a fifth would
        // hold the fleet's position through every cloak it spends
        const fade = ucloakT[i] > 0 ? 0.2 : 1;
        this.push(dyn, upx[i] + off, upy[i] + off, usz, usz, urot[i], KIND_UV[k],
          0, 0, 0, (wantFly ? SHADOW_ALPHA : GROUND_SHADOW_ALPHA) * fade);
        this.endScale();
        continue;
      }
      // UnitType.drawShield: a crux-red halo at hitSize * 1.3, its opacity
      // spiking to full on a hit or a fresh pulse and fading out after.
      // A force field carrier sets drawShields = false — its pool is
      // already on screen as the bubble, and a halo under it would read
      // as a second, smaller shield
      if (ushield[i] > 0.0001 && !KIND_FORCE[k]) {
        // UnitType.drawShield: Fill.light at hitSize * 1.3 — a disc that is
        // clear at the centre and carries the colour at its rim
        const sr = urad[i] * 2 * 1.3 * 2;
        const sc = KIND_ACCENT[k];
        this.push(dyn, upx[i], upy[i], sr, sr, 0, UV_RING,
          // shieldColor lerped to white by the hit flash, at 0.7 x alpha
          sc[0] + (1 - sc[0]) * Math.min(1, ushieldAlpha[i]),
          sc[1] + (1 - sc[1]) * Math.min(1, ushieldAlpha[i]),
          sc[2] + (1 - sc[2]) * Math.min(1, ushieldAlpha[i]),
          0.7 * (0.3 + 0.7 * ushieldAlpha[i]));
      }
      // hp thirds of the unit's own max, so every kind tints alike —
      // read off the water-multiplied rows while the unit is wet
      const t3 = (uhp[i] * 3) / uhpmax[i];
      const table = uhungry[i]
        ? uwet[i] > 0 ? WET_HUNGRY_TINT : HUNGRY_TINT
        : uwet[i] > 0 ? WET_TINT : HP_TINT;
      let tint: RGB = table[t3 <= 1 ? 0 : t3 <= 2 ? 1 : 2];
      // in the hill's shadow, a walker or a hull is darkened by the shade
      // at its feet — the same shade the floor under it wears
      if (!ufly[i]) {
        const lit = this.litAt(upx[i], upy[i]);
        if (lit < 1) {
          this.shadeTint[0] = tint[0] * lit;
          this.shadeTint[1] = tint[1] * lit;
          this.shadeTint[2] = tint[2] * lit;
          tint = this.shadeTint;
        }
      }
      // the cell over the hull, and the engines behind it, are the two
      // things a body wears in ITS FAMILY'S colour (KIND_ACCENT; Mindustry
      // paints them in the team's) — carried through the body's tint, so
      // both grey with its health and darken in a hill's shade with the
      // sprite they sit on
      const team = KIND_ACCENT[k];
      this.cellTint[0] = team[0] * tint[0];
      this.cellTint[1] = team[1] * tint[1];
      this.cellTint[2] = team[2] * tint[2];
      const cell = this.kindCell[k];
      const legArt = KIND_LEG[k], gait = KIND_GAIT[k];
      const mech = KIND_MECH[k];
      if (legArt && gait) {
        this.pushLegs(dyn, legArt, gait, sim, i, tint, cell, this.cellTint);
      } else if (mech) {
        this.pushMech(dyn, mech, upx[i], upy[i], urot[i], ubrot[i], uwalk[i], tint, cell, this.cellTint);
      } else {
        // the engine flames first, under the hull, in the team's colour
        const eng = KIND_ENGINES[k];
        if (eng) this.pushEngines(dyn, upx[i], upy[i], urot[i], eng, sim.time, team);
        // a flyer is one flat quad on the heading the sim turned it to.
        // That is its own UnitType.rotateSpeed, not its velocity: the
        // stock 5 deg/tick is close enough to instant that the light
        // flyers read as banking with their drift, while stoop4's 1.9
        // visibly swings the hull round after the course change
        // A CLOAKED BODY (Sim.ucloakT, levels.ts cloak) is a ghost of
        // itself: the hull at a fifth, no cell, no halo — enough to read
        // that something is there. A cloak stops ROUNDS only, so a
        // non-bullet turret is still firing at the ghost, and the beam
        // swinging onto it is the other half of this drawing. Only the plain
        // hulls cloak (the Wraith fleet); a mech or a walker that took the
        // trait would need the same on its own draw path
        const fp = KIND_FLYER[k];
        const segArt = KIND_SEG_ART[k], chain = KIND_SEGS[k];
        if (segArt && chain) {
          // THE WORM RIG: tail, then every segment back to front, then the
          // head — a cloaked one is the same chain as a ghost, no cell
          const ghost = ucloakT[i] > 0;
          this.pushSegments(dyn, segArt, chain, sim, i, tint, ghost ? 0.2 : 1, ghost ? null : cell, this.cellTint);
        } else if (ucloakT[i] > 0) {
          this.push(dyn, upx[i], upy[i], usz, usz, urot[i], KIND_UV[k], tint[0], tint[1], tint[2], 0.2);
        } else if (fp) {
          // A FLYER IN PARTS (atlas.ts FLYER_PARTS): the wings first,
          // under the body, each on its own root. A beat is a sine on sim
          // time at the part's own rate — constant, whatever the body's
          // speed — offset per body by its id so a flight does not flap
          // in step (NOT by uwalk: a hull's walk counter keeps counting
          // distance, and a beat seeded from it speeds up with the hull);
          // at the top of it the wing folds toward its root — the quad
          // across the heading shrinks about the root, which from above
          // is what a downstroke looks like — and sweeps a little forward
          // at the same time
          this.pushWings(dyn, fp, upx[i], upy[i], urot[i], sim.time, sim.uid[i] * 2.399, tint);
          this.push(dyn, upx[i], upy[i], fp.sprite, fp.spriteH, urot[i], fp.body, tint[0], tint[1], tint[2], 1);
          if (cell) this.pushCell(dyn, cell, upx[i], upy[i], usz, urot[i], this.cellTint);
        } else {
          this.push(dyn, upx[i], upy[i], usz, usz, urot[i], KIND_UV[k], tint[0], tint[1], tint[2], 1);
          if (cell) this.pushCell(dyn, cell, upx[i], upy[i], usz, urot[i], this.cellTint);
        }
      }
      this.endScale();
    }
  }

  /**
   * The darkness inside the hills (DARK_RADIUS), over the finished frame:
   * Layer.darkness is above the ground units, the effects and the shields.
   * Two things come after it (drawFrame) — the FLYERS and the BULLETS,
   * because both are in the air over the terrain rather than in it, so a
   * hill never swallows either.
   */
  private drawDarkness(): void {
    const gl = this.gl;
    if (this.dark.n === 0) return;
    gl.useProgram(this.prog);
    gl.bindTexture(gl.TEXTURE_2D, this.darkTex);
    this.draw(this.dark, false);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }


  /**
   * zoom is world→view scale; (offX, offY) = -cameraTopLeft * zoom; kPx is
   * device px per world px at zoom 1, so the view spans canvas/kPx world px
   * and the canvas is always filled whatever its aspect
   */
  /**
   * AMBIENT EFFECTS OFF, the renderer's half of the settings switch (the
   * sim's half, which is most of it, is Sim.setEffects).
   *
   * What it covers is the decoration the RENDERER owns outright rather
   * than takes from the effect pool: the flyers' drop shadows and the
   * hulls' wakes. Both are per-unit quads on a crowd of thousands, which
   * is exactly the frame this switch is for, and neither carries anything
   * the sim would not otherwise say — a flyer is on the air layer whether
   * or not a black copy of it is drawn underneath.
   *
   * It also turns ON one thing, which is the point of the whole switch:
   * a bullet whose only visible shot WAS its effects gets a cheap stand-in
   * (see the spriteless case in the projectile pass), so no turret goes
   * silent for want of a particle.
   */
  setEffects(on: boolean): void {
    this.fxOn = on;
  }

  render(sim: SimView, zoom = 1, offX = 0, offY = 0, kPx = this.canvas.width / W): void {
    // the sea rides SIM time, so pausing the game stills it and the speed
    // switcher moves it, exactly like everything else on the field
    this.waterTime = sim.time;
    // before anything is drawn: whatever has been built or wrecked since
    // the last frame goes into the shadow mask the ground is drawn with
    this.syncBuildShadow(sim);
    this.begin(zoom, offX, offY, kPx);
    this.drawWorld();

    // the visible world rect, for culling: world x lands on screen where
    // 0 <= x * zoom + offX <= canvas/kPx (see the vertex shader), so the
    // view runs from -off/zoom for canvas/(kPx*zoom) world px. Everything
    // pushed into the dynamic batch is centred on a point, so a centre
    // further outside than the thing's own reach cannot touch a pixel —
    // the sim still runs the whole map, only the sprite assembly is saved
    const vx0 = -offX / zoom, vy0 = -offY / zoom;
    const vx1 = vx0 + this.canvas.width / kPx / zoom;
    const vy1 = vy0 + this.canvas.height / kPx / zoom;
    this.vx0 = vx0;
    this.vy0 = vy0;
    this.vx1 = vx1;
    this.vy1 = vy1;

    const dyn = this.dyn;
    dyn.n = 0;
    this.shields.n = 0;
    this.fields.n = 0;
    // settled before the fills are gathered, because it decides what they
    // ARE: solid shapes for the shader to work on, or the finished
    // no-shader drawing
    const buffered = this.ensureShieldTarget(this.canvas.width, this.canvas.height);
    this.drawForceFields(sim, buffered);
    this.drawFieldRings(sim, buffered);
    for (const t of sim.towers) {
      // THE FOOTPRINT IT ACTUALLY STANDS ON (Tower.size), not the table's:
      // a GIANT is twice its kind's edge, so its sprite is drawn over four
      // times the ground and reads as the building it is
      const sz = t.size;
      const px = sz * CELL;
      if (t.x < vx0 - px || t.x > vx1 + px || t.y < vy0 - px || t.y > vy1 + px) continue;
      // ONE ROSTER, ONE DRAWING: the swarm's piercer is the piercer's own
      // sprite on the piercer's own base
      const top = UV_TURRETS[t.kind];
      const angle = t.angle;
      const base =
        sz >= 4 ? UV_TOWER_BASE4
        : sz === 3 ? UV_TOWER_BASE3
        : sz === 2 ? UV_TOWER_BASE
        : UV_TOWER_BASE1;
      // a hurt tower wears the units' own hp-thirds grey (HP_TINT), so
      // "this is taking damage" reads identically on both sides of the
      // fight — and smokes like them too (Sim.fireTowers). There is no
      // unfinished state to draw any more: a placement is the building
      const t3 = (t.hp * 3) / t.hpMax;
      const tint = HP_TINT[t3 <= 1 ? 0 : t3 <= 2 ? 1 : 2];
      // ONE ROSTER, TWO SIDES: a turret the swarm has taken (Conquest,
      // mutation.ts) is the same sprite on the same base, wearing the
      // crux red its BODIES wear — the one colour on this board that
      // already means "theirs", multiplied into the hp grey so a
      // conquered turret still visibly takes damage as it is chewed down
      const own = t.team === "player";
      const r = own ? tint[0] : tint[0] * TEAM_CRUX_RGB[0];
      const g = own ? tint[1] : tint[1] * TEAM_CRUX_RGB[1];
      const b = own ? tint[2] : tint[2] * TEAM_CRUX_RGB[2];
      this.push(dyn, t.x, t.y, px, px, 0, base, r, g, b, 1);
      this.push(dyn, t.x, t.y, px, px, angle, top, r, g, b, 1);
      // THE FALLBACK MUZZLE FLASH (Sim, Tower.flashT): this turret fired
      // and the effect pool refused its muzzle effect, so the shot has
      // nothing else on screen. One tongue at the barrel — half of
      // drawShootTri, which is what it stands in for, on the same ramp and
      // the same eight-tick life — drawn straight from the building's own
      // state, so the one thing that cannot go missing on a saturated
      // board is the news that a gun is still working.
      if (t.flashT > 0 && this.fxOn) {
        const ft = 1 - t.flashT / MUZZLE_FLASH_LIFE;
        const fout = 1 - ft;
        // in the AMMO'S OWN colour where it has one, so a water turret
        // flashes water and not gunpowder — the same rule every effect
        // that takes a colour already follows (BulletStats.fxColor)
        const fc = t.spec.bullet.fxColor;
        this.tri(
          dyn, t.flashX, t.flashY,
          (1 + 5 * fout) * MU, 15 * fout * MU, t.flashRot,
          fc ? ramp(PAL.white, fc, null, ft) : ramp(PAL.lighterOrange, PAL.lightOrange, null, ft),
          1,
        );
      }
    }
    // the shieldTowers, AFTER the towers: they rose on free ground of their
    // own (Sim.trySpawnShieldTower) and never overlap one, so the order is
    // only about the domes drawing over the board.
    // Dead shieldTowers draw nothing; their ground is open again
    for (const s of sim.shieldTowers) {
      if (s.hp <= 0) continue;
      const spx = SHIELD_TOWER_SIZE * CELL;
      if (s.x < vx0 - spx || s.x > vx1 + spx || s.y < vy0 - spx || s.y > vy1 + spx) continue;
      const t3 = (s.hp * 3) / s.hpMax;
      const tint = HP_TINT[t3 <= 1 ? 0 : t3 <= 2 ? 1 : 2];
      this.push(dyn, s.x, s.y, spx, spx, 0, UV_SHIELD_TOWER, tint[0], tint[1], tint[2], 1);
    }
    // THE RELAYS, beside the shield towers because they are the same kind of
    // thing: a block that stands where the map put it, never turns, and is
    // nobody's to place or sell. They are drawn here rather than in the
    // TERRAIN batch (rebuildTerrain) because their tint moves — a relay
    // switched on is lit and one still for sale is dark — and the terrain
    // batch is built once per map.
    //
    // A relay is on a HILL, so nothing overlaps it and there is no base
    // plate under it: the block's own art carries its plating (atlas.ts
    // relayBlock).
    {
      const rpx = RELAY_SIZE * CELL;
      const rs = sim.terrain.relays;
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i];
        const x = (r.x + RELAY_SIZE / 2) * CELL, y = (r.y + RELAY_SIZE / 2) * CELL;
        if (x < vx0 - rpx || x > vx1 + rpx || y < vy0 - rpx || y > vy1 + rpx) continue;
        // DIMMED UNTIL IT IS BOUGHT, and full colour after. It is dimmed
        // rather than greyed so it still reads as the same building, and a
        // player learns the silhouette long before they can afford one.
        //
        // HALF AND NOT A THIRD: a relay stands on a hill and a hill is the
        // darkest ground in the game, so a third put the unlit ones under
        // the rock they sit on. Half is plainly "off" beside a lit one and
        // still finds the eye on black basalt.
        const lit = sim.relayOn[i] !== 0;
        const k = lit ? 1 : 0.5;
        this.push(dyn, x, y, rpx, rpx, 0, UV_RELAY, k, k, k, 1);
      }
    }
    // a lock turret's beam sits over the turrets and under the body it is
    // burning — it has no bullet, so this is its only visual
    for (const t of sim.towers) {
      if (t.beamStr > 0.01) this.drawLockBeam(dyn, t);
      // the beam's LIVE stats, not the table's: a furnace whose upgrade
      // branch lengthened its beam has to be drawn at the length it is
      // actually burning at (see Sim.statsFor)
      if (t.beamT >= 0) this.drawContinuousBeam(dyn, t, t.spec.bullet.continuous);
    }
    const { upx, upy, ukind, n } = sim;
    // the fleet's wakes, at Mindustry's Layer.debris: UNDER every unit,
    // including the hulls that laid them, so a crowded lane does not draw
    // one boat's foam over another boat
    if (HAS_WAKE && this.fxOn)
      for (let i = 0; i < n; i++) {
        const w = KIND_WAKE[ukind[i]];
        if (!w) continue;
        const cm = KIND_CULL[ukind[i]];
        if (upx[i] < vx0 - cm || upx[i] > vx1 + cm || upy[i] < vy0 - cm || upy[i] > vy1 + cm)
          continue;
          this.pushWake(dyn, sim, i, w);
      }
    // painter's order in four passes: the ground crowd's contact shadows,
    // the ground units over them, then the flyer shadows on top of the
    // crowd, then the flyers themselves above everything — the last of
    // those is not here: it is drawn after the darkness at the end of the
    // frame (pushUnitPass), so a flyer crossing a range is not swallowed
    // by it
    this.pushUnitPass(dyn, sim, 0);
    this.pushUnitPass(dyn, sim, 1);
    this.pushUnitPass(dyn, sim, 2);
    // WHAT A UNIT IS DOING RIGHT NOW, drawn off the unit rather than the
    // effect pool: a starhart4's held beam for as long as it burns, the green
    // ring a starhart5 gathers before its shot, and the energy field's orbit
    // round a livewire4. Each follows its hull as Mindustry's do
    // (parentizeEffects), which a pooled effect at a fixed point cannot
    {
      const { ubeamT, ucharge, uheldRot, urot } = sim;
      for (let i = 0; i < n; i++) {
        const k = ukind[i];
        const held = KIND_HELD[k], field = KIND_FIELD[k];
        if (!held && !field) continue;
        // only a HELD beam reaches off the hull now — the field's orb is
        // drawn at the body, so it no longer widens this margin
        const reach = (held?.range ?? 0) + 40;
        if (upx[i] < vx0 - reach || upx[i] > vx1 + reach || upy[i] < vy0 - reach || upy[i] > vy1 + reach)
          continue;
          if (field) this.drawEnergyField(dyn, upx[i], upy[i], urot[i], field.color, sim.time);
        if (!held) continue;
        if (ubeamT[i] > 0 && held.beam && held.beamStyle) {
          // ContinuousLaserBulletType: held at full, then out over fadeTime (16 ticks)
          const fade = 16 / 60;
          const fout = ubeamT[i] > fade ? 1 : ubeamT[i] / fade;
          this.drawBeam(dyn, upx[i], upy[i], uheldRot[i], held.range * fout, fout, sim.time * 60, held.beamStyle);
        }
        if (ucharge[i] > 0 && held.charge) {
          const col = held.beamStyle?.colors[1][0] ?? held.laser?.colors[1][0] ?? PAL.heal;
          this.drawGreenCharge(dyn, upx[i], upy[i], 1 - ucharge[i] / held.charge, !!held.beam, col);
        }
      }
    }
    const {
      fxN, fxX, fxY, fxAge, fxTtl, fxKind, fxRot, fxLen, fxSeed, fxSides,
      fxUnit, fxHasCol, fxColR, fxColG, fxColB, fxPts,
    } = sim;
    for (let f = 0; f < fxN; f++) {
      const kind = fxKind[f] as FxKind;
      const ex = fxX[f], ey = fxY[f];
      // cull: an anchor further out than the effect's reach draws nothing.
      // The line-shaped kinds carry their reach as data — a beam's length
      // in its len lane, a bolt's whole path in fxPts — so they widen
      // their own margin; everything else fits inside the flat pad
      if (kind === FxKind.Lightning || kind === FxKind.ChainLightning) {
        const pts = fxPts[f];
        if (pts && pts.length >= 2) {
          // 120px pad: a bolt's longest segment (a chain jump across the
          // 30-unit square) is ~110px, so a segment that crosses the view
          // always has an endpoint inside the padded rect
          let inView = false;
          for (let q = 0; q < pts.length && !inView; q += 2)
            inView =
              pts[q] >= vx0 - 120 && pts[q] <= vx1 + 120 &&
              pts[q + 1] >= vy0 - 120 && pts[q + 1] <= vy1 + 120;
          if (!inView) continue;
        }
      } else {
        let em = FX_CULL_PAD;
        if (
          kind === FxKind.Laser || kind === FxKind.Shrapnel ||
          kind === FxKind.HealWave || kind === FxKind.ShieldBreak ||
          kind === FxKind.Sap || kind === FxKind.EmpHit ||
          kind === FxKind.WaterBurst || kind === FxKind.Scatter ||
          kind === FxKind.Blink || kind === FxKind.NukeBurst
        )
          em += fxLen[f];
        else if (kind === FxKind.UnitSpawn) em += KIND_SPRITE[fxUnit[f]] * 2;
        if (ex < vx0 - em || ex > vx1 + em || ey < vy0 - em || ey > vy1 + em) continue;
      }
      // survived the cull: refill the one shared view and hand the draw
      // helpers the Effect shape they have always read
      const e = FX_VIEW;
      e.x = ex;
      e.y = ey;
      e.age = fxAge[f];
      e.ttl = fxTtl[f];
      e.kind = kind;
      e.rot = fxRot[f];
      e.len = fxLen[f];
      e.seed = fxSeed[f];
      e.sides = fxSides[f];
      e.unit = fxUnit[f];
      e.pts = fxPts[f] ?? undefined;
      if (fxHasCol[f]) {
        FX_VIEW_COL[0] = fxColR[f];
        FX_VIEW_COL[1] = fxColG[f];
        FX_VIEW_COL[2] = fxColB[f];
        e.col = FX_VIEW_COL;
      } else {
        e.col = undefined;
      }
      const t = e.age / e.ttl;
      if (e.kind === FxKind.Death) {
        // the kill puff's own orange unless the push named a colour — a
        // body DEVOURED by a hungry unit wears the hungry hue instead, so
        // it never reads as a kill the player's towers scored
        const s = 7 + t * 22;
        const c = e.col ?? DEATH_COL;
        this.push(dyn, e.x, e.y, s, s, 0, UV_RING, c[0], c[1], c[2], (1 - t) * 0.9);
      } else if (e.kind === FxKind.Flak) {
        this.drawFlakExplosion(dyn, e, t);
      } else if (e.kind === FxKind.BulletHit) {
        this.drawBulletHit(dyn, e, t);
      } else if (e.kind === FxKind.ShootSmall || e.kind === FxKind.ShootBig) {
        this.drawShootTri(dyn, e, t, e.kind === FxKind.ShootBig);
      } else if (e.kind === FxKind.SmokeSmall || e.kind === FxKind.SmokeBig) {
        this.drawShootSmoke(dyn, e, t, e.kind === FxKind.SmokeBig);
      } else if (e.kind === FxKind.Shockwave) {
        // Fx.shockwaveSmaller: one white ring running out of the blast,
        // greying and thinning as it goes.
        //
        // A VOLATILE POP CARRIES ITS OWN REACH in e.len (Sim.volatileBlast)
        // so the ring stops exactly where the damage did. The rule is a
        // layout problem (mutation.ts), and a player cannot solve a layout
        // problem they have to guess the size of. Everything else that
        // throws a shockwave keeps Mindustry's fixed 22 units.
        const col = ramp(PAL.white, PAL.lightGray, null, t);
        const reach = e.len ? e.len : 22 * MU;
        this.strokeCircle(dyn, e.x, e.y, t * reach, ((1 - t) * 2 + 0.2) * MU,
          col[0], col[1], col[2], RING_ALPHA);
      } else if (e.kind === FxKind.SparkShoot) {
        this.drawSparkShoot(dyn, e, t);
      } else if (e.kind === FxKind.HitPiercer) {
        this.drawHitPiercer(dyn, e, t);
      } else if (e.kind === FxKind.PiercerShoot) {
        // Fx.piercerLaserShoot: two blue wings thrown off the muzzle,
        // square to the shot rather than along it
        const w = 4 * (1 - t) * MU;
        for (const side of [-1, 1])
          this.tri(dyn, e.x, e.y, w, 29 * MU, (e.rot ?? 0) + (side * Math.PI) / 2, PAL_PIERCER, 1);
      } else if (e.kind === FxKind.PiercerCharge) {
        this.drawPiercerCharge(dyn, e, t);
      } else if (e.kind === FxKind.ArtilleryTrail) {
        // already drawn, in its own pass under the shells
      } else if (e.kind === FxKind.Heal) {
        // Fx.heal: stroke(fout*2), circle(2 + finpow*7)
        this.strokeCircle(dyn, e.x, e.y, (2 + FIN_POW(t) * 7) * MU, (1 - t) * 2 * MU,
          PAL_HEAL[0], PAL_HEAL[1], PAL_HEAL[2], RING_ALPHA);
      } else if (e.kind === FxKind.HealWave || e.kind === FxKind.ShieldWave) {
        // healWaveDynamic: circle(4 + finpow*range) in Pal.heal
        // shieldWave:      circle(4 + finpow*60) in the shield colour at a=0.7
        const heal = e.kind === FxKind.HealWave;
        const grow = heal ? (e.len ?? 0) : 60 * MU;
        // a unit's regen field throws its wave in the team colour (e.col);
        // the shield tower's is the player's amber
        const wc: RGB = heal ? PAL_HEAL : e.col ?? SHIELD_COL;
        this.strokeCircle(dyn, e.x, e.y, 4 * MU + FIN_POW(t) * grow, (1 - t) * 2 * MU,
          wc[0], wc[1], wc[2], (heal ? 1 : 0.7) * RING_ALPHA);
      } else if (e.kind === FxKind.Shrapnel) {
        this.drawShrapnel(dyn, e.x, e.y, e.rot ?? 0, e.len ?? 0, t, SHRAPNEL_STYLES[e.sides ?? 0] ?? SHRAPNEL_STYLES[0]);
      } else if (e.kind === FxKind.Flame) {
        this.drawShootFlame(dyn, e, t);
      } else if (e.kind === FxKind.FlameHit) {
        this.drawHitFlame(dyn, e, t);
      } else if (e.kind === FxKind.Burning) {
        this.drawBurning(dyn, e, t);
      } else if (e.kind === FxKind.Poison) {
        // THE ROT (Sim, the tower loop): a mote of the venom line's purple
        // lifting off a poisoned structure and thinning out as it goes.
        // Burning's flicker is three motes scattered flat around a body,
        // because a fire is ON the thing; this one RISES, because it is a
        // building giving something off — the two read differently at a
        // glance even though both are coloured specks, which is the whole
        // job. It drifts up-right on the shadow's own bearing so the field
        // reads as lit from one place.
        const fout = 1 - t;
        const lift = t * 9 * MU;
        const rad = (0.35 + fout * 1.5) * MU;
        this.fillCircle(dyn, e.x + lift * 0.35, e.y - lift, rad, PAL.venom, fout);
      } else if (e.kind === FxKind.Wet) {
        // Fx.wet: one water-coloured droplet fading in over its first half
        // (alpha clamp(fin*2)) while it shrinks away (radius fout)
        this.fillCircle(dyn, e.x, e.y, (1 - t) * MU, PAL.water, Math.min(1, t * 2));
      } else if (e.kind === FxKind.ShootLiquid) {
        // Fx.shootLiquid: two droplets thrown 15 units up the shot line
        // inside an 11-degree cone, each shrinking as the spray dies
        const rad = (0.5 + (1 - t) * 2.5) * MU;
        this.scatter(e.seed ?? 1, 2, FIN_POW(t) * 15 * MU, e.rot ?? 0, SPREAD_11, (x, y) => {
          this.fillCircle(dyn, e.x + x, e.y + y, rad, e.col ?? PAL.water, 1);
        });
      } else if (e.kind === FxKind.WaterBurst) {
        // A SHELL'S WORTH OF WATER, drawn at the radius it actually soaked
        // (e.len, handed over by the splash branch in Sim). Three layers,
        // all running out to the same edge so the burst reads as one body:
        // a flood that fills the blast and thins as it spreads, a rim
        // racing the flood out to the edge, and droplets thrown clear of
        // it in every direction rather than in hitLiquid's forward cone —
        // a shell bursts, it does not spray.
        const reach = e.len || 24 * MU;
        const col = e.col ?? PAL.water;
        const grow = FIN_POW(t) * reach;
        this.fillDisc(dyn, e.x, e.y, grow, col, (1 - t) * 0.45);
        this.strokeCircle(dyn, e.x, e.y, grow, ((1 - t) * 2 + 0.4) * MU,
          col[0], col[1], col[2], 1 - t);
        const drop = (1 - t) * 2.5 * MU;
        // a spread of PI is +-PI off the shot line, which is every bearing
        this.scatter(e.seed ?? 1, 12, grow, e.rot ?? 0, Math.PI, (x, y) => {
          this.fillCircle(dyn, e.x + x, e.y + y, drop, col, 1 - t * 0.5);
        });
      } else if (e.kind === FxKind.HitLiquid) {
        // Fx.hitLiquid: five droplets scattering off the landing inside a
        // 60-degree cone — the length runs on fin, not finpow, so the
        // splash leaves at full speed instead of easing out
        const rad = (1 - t) * 2 * MU;
        this.scatter(e.seed ?? 1, 5, (1 + t * 15) * MU, e.rot ?? 0, SPREAD_60, (x, y) => {
          this.fillCircle(dyn, e.x + x, e.y + y, rad, e.col ?? PAL.water, 1);
        });
      } else if (e.kind === FxKind.Scatter) {
        this.drawAirburst(dyn, e, t);
      } else if (e.kind === FxKind.Blink) {
        // A BLINK (Sim.blinkUnit): the streak from where the body was to
        // where it landed, violet, thinning from the far end back — and a
        // ring snapping shut where it left, so the jump reads as a jump
        // and not as a body that was never there
        const col = e.col ?? PAL.wraith;
        const len = (e.len ?? 0) * (1 - t * 0.6);
        this.strokeLine(dyn, e.x, e.y, e.rot ?? 0, len, (0.6 + (1 - t) * 1.6) * MU, col, (1 - t) * 0.9);
        this.strokeCircle(dyn, e.x, e.y, (1 - t) * 6 * MU, (1 - t) * 1.5 * MU, col[0], col[1], col[2], RING_ALPHA);
      } else if (e.kind === FxKind.NukeBurst) {
        // THE NUKE (Sim.detonate, levels.ts payload.fuse): a flash that
        // fills the whole blast radius (e.len), white into the sky's
        // orange and out, a rim racing to the edge, and a ring of sparks
        // thrown clear — the WaterBurst's shape in fire, and at the size
        // of the damage, which is the whole point of drawing it that big
        const reach = e.len || 60 * MU;
        const col = ramp(PAL.white, e.col ?? PAL.bomber, PAL.bomberDark, t);
        const grow = FIN_POW(t) * reach;
        this.fillDisc(dyn, e.x, e.y, grow, col, (1 - t) * 0.45);
        // the rim is a thread: the flash is the disc, and a fat ring on a
        // blast this wide read as a wall
        this.strokeCircle(dyn, e.x, e.y, grow, ((1 - t) * 0.8 + 0.3) * MU, col[0], col[1], col[2], 0.8 - t * 0.5);
        const spark = (1 + (1 - t) * 4) * MU;
        this.scatter(e.seed ?? 1, 8, grow, 0, Math.PI, (x, y, bearing) => {
          this.strokeLine(dyn, e.x + x, e.y + y, bearing, spark, (1 - t) * 0.8 * MU, col, 1);
        });
      } else if (e.kind === FxKind.ShortSpark) {
        // A SHORTED BUILDING (Tower.shortT): one violet bar flicking off it
        // on a random bearing, white at birth and gone in a blink — the
        // rot's rising mote read as electricity rather than as gas
        const col = ramp(PAL.white, e.col ?? PAL.wraith, null, t);
        const bar = (2 + (1 - t) * 3) * MU;
        this.strokeLine(dyn, e.x, e.y, e.rot ?? 0, bar, (0.4 + (1 - t) * 1.2) * MU, col, 1 - t * 0.5);
      } else if (e.kind === FxKind.Lightning) {
        this.drawBolt(dyn, e, t);
      } else if (e.kind === FxKind.Laser) {
        this.drawLaser(dyn, e, t);
      } else if (e.kind === FxKind.BlastExplosion) {
        this.drawBlastExplosion(dyn, e, t);
      } else if (e.kind === FxKind.PlasticExplosion) {
        this.drawPlasticExplosion(dyn, e, t);
      } else if (e.kind === FxKind.InstShoot) {
        this.drawInstShoot(dyn, e, t);
      } else if (e.kind === FxKind.InstHit) {
        this.drawInstHit(dyn, e, t);
      } else if (e.kind === FxKind.InstTrail) {
        this.drawInstTrail(dyn, e, t);
      } else if (e.kind === FxKind.InstBomb) {
        this.drawInstBomb(dyn, e, t);
      } else if (e.kind === FxKind.RailHit) {
        // Fx.railHit's two spikes thrown back off what the rail punched
        // through, 140 degrees off its line — a fifth of Mindustry's
        // length and width, so a harpoon's landing is a flick and not a
        // splash (the fleet fires by the thousand)
        for (const side of [-1, 1])
          this.tri(dyn, e.x, e.y, 2.5 * (1 - t) * MU, 12 * MU,
            (e.rot ?? 0) + (side * 140 * Math.PI) / 180, e.col ?? PAL.orangeSpark, 1);
      } else if (e.kind === FxKind.SmokeCloud) {
        this.drawSmokeCloud(dyn, e, t);
      } else if (e.kind === FxKind.DamageSmoke) {
        this.drawDamageSmoke(dyn, e, t);
      } else if (e.kind === FxKind.HitFurnace) {
        // Fx.hitFurnace: six bars flicking off whatever the beam is
        // resting on. Mindustry hardcodes Pal.furnaceHit here; the beam
        // wears its line's colour now (constants.ts furnace), so the bars
        // take the one they arrive with and keep the orange as the fallback
        const bar = ((1 - t) * 4 + 1) * MU;
        const mcol = e.col ?? PAL.furnaceHit;
        this.scatter(e.seed ?? 1, 6, FIN_POW(t) * 18 * MU, 0, Math.PI, (x, y, bearing) => {
          this.strokeLine(dyn, e.x + x, e.y + y, bearing, bar, (1 - t) * 2 * MU,
            mcol, 1);
        });
      } else if (e.kind === FxKind.UnitSpawn) {
        this.drawUnitSpawn(dyn, e, t);
      } else if (e.kind === FxKind.SmokeBig2) {
        // Fx.shootBigSmoke2: shootBigSmoke's cloud, but nine motes over
        // 23 units instead of eight over 19. Furnace used to be the only
        // block firing it and is not any more (constants.ts); the swarm's
        // artillery and its spark guns still do
        const col = ramp(PAL.lightOrange, PAL.lightGray, PAL.gray, t);
        const rad = ((1 - t) * 2.4 + 0.2) * MU;
        this.scatter(e.seed ?? 1, 9, FIN_POW(t) * 23 * MU, e.rot ?? 0, SPREAD_20, (x, y) => {
          this.fillCircle(dyn, e.x + x, e.y + y, rad, col, 1);
        });
      } else if (e.kind === FxKind.Footfall) {
        this.drawFootfall(dyn, sim, e, t);
      } else if (e.kind === FxKind.Absorb) {
        // Fx.absorb: stroke(fout*2), circle(5*fout) in Pal.accent — the
        // little pop where a shot died on the outline
        this.strokeCircle(dyn, e.x, e.y, 5 * MU * (1 - t), (1 - t) * 2 * MU,
          SHIELD_COL[0], SHIELD_COL[1], SHIELD_COL[2], RING_ALPHA);
      } else if (e.kind === FxKind.ShieldBreak) {
        // Fx.shieldBreak: stroke(fout*3), circle(radius + fin) — the
        // outline snapping outward as the bubble pops. Every field here
        // is round, so the pop is too
        const bc = e.col ?? SHIELD_COL;
        this.strokeCircle(dyn, e.x, e.y, (e.len ?? 0) + FIN_POW(t) * MU,
          (1 - t) * 3 * MU, bc[0], bc[1], bc[2], RING_ALPHA);
      } else if (e.kind === FxKind.Sap) {
        this.drawSap(dyn, e, t);
      } else if (e.kind === FxKind.ChainLightning) {
        this.drawChainLightning(dyn, e, t);
      } else if (e.kind === FxKind.Pulverize) {
        // Fx.pulverize: five stone-grey diamonds tumbling 3 + 8 units out
        const side = ((1 - t) * 2 + 0.5) * MU;
        this.scatter(e.seed ?? 1, 5, (3 + t * 8) * MU, 0, Math.PI, (x, y) => {
          this.push(dyn, e.x + x, e.y + y, side * 2, side * 2, Math.PI / 4, UV_SOLID,
            PAL.stoneGray[0], PAL.stoneGray[1], PAL.stoneGray[2], 1);
        });
      } else if (e.kind === FxKind.SapExplosion) {
        this.drawSapExplosion(dyn, e, t);
      } else if (e.kind === FxKind.MassiveExplosion) {
        this.drawMassiveExplosion(dyn, e, t);
      } else if (e.kind === FxKind.RailShoot) {
        this.drawRailShoot(dyn, e, t);
      } else if (e.kind === FxKind.RailTrail) {
        // Fx.railTrail: two coppery blades along the line, fore and aft
        for (const side of [0, 1])
          this.tri(dyn, e.x, e.y, 10 * (1 - t) * MU, 24 * MU, (e.rot ?? 0) + side * Math.PI, e.col ?? PAL.orangeSpark, 1);
      } else if (e.kind === FxKind.EmpHit) {
        this.drawEmpHit(dyn, e, t);
      } else if (e.kind === FxKind.HitLaserBlast || e.kind === FxKind.HitMeltHeal) {
        // Fx.hitLaserBlast: hitPiercer's eight bars in the beam's colour;
        // Fx.hitMeltHeal: six of them, 18 units, stroke 2, in Pal.heal
        const meltHeal = e.kind === FxKind.HitMeltHeal;
        const col = e.col ?? PAL.heal;
        const bar = ((1 - t) * 4 + 1) * MU;
        const stroke = (1 - t) * (meltHeal ? 2 : 1.5) * MU;
        this.scatter(e.seed ?? 1, meltHeal ? 6 : 8, FIN_POW(t) * (meltHeal ? 18 : 17) * MU, 0, Math.PI,
          (x, y, bearing) => {
            this.strokeLine(dyn, e.x + x, e.y + y, bearing, bar, stroke, col, 1);
          });
      } else if (e.kind === FxKind.HitLaser) {
        // Fx.hitLaser: one ring to 5 units, white into the bolt's colour
        const col = ramp(PAL.white, e.col ?? PAL_HEAL, null, t);
        this.strokeCircle(dyn, e.x, e.y, t * 5 * MU, (0.5 + (1 - t)) * MU, col[0], col[1], col[2], RING_ALPHA);
      } else if (e.kind === FxKind.GreenCloud) {
        // Fx.greenCloud: seven heal puffs boiling out to 9 units
        const col = e.col ?? PAL_HEAL;
        this.cloud(e.seed ?? 1, 7, 9 * MU, t, (x, y, _pfin, pfout) => {
          this.fillCircle(dyn, e.x + x, e.y + y, 5 * pfout * MU, col, 1);
        });
      } else if (e.kind === FxKind.Explosion) {
        this.drawExplosion(dyn, e, t, EXPLOSION_STYLES[e.sides ?? 0] ?? EXPLOSION_STYLES[0]);
      } else if (e.kind === FxKind.ShootBig2) {
        // Fx.shootBig2: shootBig's shape, lightOrange cooling to grey, a
        // 29-unit tongue and a 5-unit stub
        const col = ramp(PAL.lightOrange, PAL.gray, null, t);
        const w = (1.2 + 8 * (1 - t)) * MU;
        this.tri(dyn, e.x, e.y, w, 29 * (1 - t) * MU, e.rot ?? 0, col, 1);
        this.tri(dyn, e.x, e.y, w, 5 * (1 - t) * MU, (e.rot ?? 0) + Math.PI, col, 1);
      } else if (e.kind === FxKind.ShootHeal) {
        // Fx.shootHeal: shootSmall's shape in Pal.heal, 17 units
        const col = e.col ?? PAL_HEAL;
        const w = (1 + 5 * (1 - t)) * MU;
        this.tri(dyn, e.x, e.y, w, 17 * (1 - t) * MU, e.rot ?? 0, col, 1);
        this.tri(dyn, e.x, e.y, w, 4 * (1 - t) * MU, (e.rot ?? 0) + Math.PI, col, 1);
      } else if (e.kind === FxKind.HitEmpSpark) {
        // Fx.hitEmpSpark: eighteen heal bars thrown all round, 27 units
        const bar = ((1 - t) * 6 + 1) * MU;
        this.scatter(e.seed ?? 1, 18, FIN_POW(t) * 27 * MU, 0, Math.PI, (x, y, bearing) => {
          this.strokeLine(dyn, e.x + x, e.y + y, bearing, bar, (1 - t) * 1.6 * MU, PAL_HEAL, 1);
        });
      } else {
        const s = 9 + t * 30;
        this.push(dyn, e.x, e.y, s, s, 0, UV_RING, 0.34, 0.89, 0.54, (1 - t) * 0.9);
      }
    }
    // the core last, above units and the fx at its feet — it is the one
    // building the whole swarm is walking at, and it stands over the crowd
    // pressing on it. Wounded, it greys the way a turret does (HP_TINT)
    {
      const core = sim.core;
      const baseSz = core.size * CELL;
      const hurt = Math.max(0, Math.min(1, core.hp / core.hpMax));
      const tint = 1 - (1 - hurt) * 0.55;
      this.push(dyn, core.x, core.y, baseSz, baseSz, 0, UV_BASE, tint, tint, tint, 1);
    }
    this.draw(dyn, true);
    // Layer.shields is above every one of those, the base included, and it
    // is its own pass: gather the fills, then blit the buffer over the
    // finished frame
    this.blitShields(zoom, offX, offY, kPx, sim.time, buffered);
    this.drawDarkness();
    // THE FLYERS AND THE SHOTS, LAST OF ALL — above the darkness, not
    // under it. Mindustry draws Layer.darkness over its flyingUnit layer,
    // so a flyer crossing a range goes black inside it; here a flyer is
    // always above the terrain, and the crowd's ground pass and the
    // effects are already on the frame under it. The rounds go over both
    // (pushBullets): a shot flies across rock no walker can stand on, and
    // one that went dark halfway there was a shot the player lost
    dyn.n = 0;
    this.pushUnitPass(dyn, sim, 3);
    // ...and the shots over them, above the darkness as well (pushBullets)
    this.pushBullets(dyn, sim);
    this.draw(dyn, true);
  }

  /**
   * ForceFieldAbility.draw for every carrier standing a bubble this frame.
   * Mindustry fills the polygon SOLID at Layer.shields and lets the shield
   * shader make it look like a shield; this gathers the same fills, and
   * blitShields runs them through the same shader.
   *
   * The fill has to be opaque: the shader finds the outline by testing the
   * buffer's alpha against 0.9, so a translucent one has no edge to find
   * and the bubble comes out as a flat wash with no rim at all.
   *
   * Without a buffer to fill, `buffered` false, this draws Mindustry's own
   * fallback instead (ForceProjector.drawShield with animateShields off):
   * a 1.5-unit stroked outline over a 0.09 fill, which is a plain shape on
   * screen — no wobble, and two overlapping fields keep both their
   * outlines rather than merging.
   */
  private drawForceFields(sim: SimView, buffered: boolean): void {
    const { upx, upy, ushield, ushieldAlpha, uforceScale, ukind, n } = sim;
    const { vx0, vy0, vx1, vy1 } = this;
    const b = this.shields;
    // the census answers "is any carrier even alive" without touching the
    // units — a wave with no starhart3 in it skips the whole scan. The
    // shieldTowers below are NOT gated by it: their domes stand between waves,
    // which is exactly when no carrier is alive
    let carriers = 0;
    for (let k = 0; k < KIND_FORCE.length; k++)
      if (KIND_FORCE[k]) carriers += sim.aliveByKind[k];
    for (let i = 0; carriers > 0 && i < n; i++) {
      const spec = KIND_FORCE[ukind[i]];
      // ForceFieldAbility.draw draws nothing at all while the pool is empty
      if (!spec || ushield[i] <= 0) continue;
      const rad = spec.radius * uforceScale[i];
      if (rad < 1) continue;
      // a bubble entirely outside the view puts no pixel in it — the
      // shader's rim reaches 2 world units past the outline, well inside
      // this margin
      const bm = rad + 16;
      if (upx[i] < vx0 - bm || upx[i] > vx1 + bm || upy[i] < vy0 - bm || upy[i] > vy1 + bm)
        continue;
      // Draw.color(shieldColor, Color.white, clamp(alpha)): a shot landing
      // on the field whitens the whole bubble for a few ticks. The colour
      // rides into the buffer with the fill, so the shader's rim and hatch
      // pick it up without knowing anything about the carrier
      const w = Math.min(1, ushieldAlpha[i]);
      const sc = KIND_ACCENT[ukind[i]];
      const col: RGB = [
        sc[0] + (1 - sc[0]) * w,
        sc[1] + (1 - sc[1]) * w,
        sc[2] + (1 - sc[2]) * w,
      ];
      if (buffered) {
        // A CIRCLE, one quad off the big disc, exactly as the shield
        // towers' domes below: Mindustry's hexagon is gone from every
        // force field. SHIELD_PLAIN, not 1: the rim and the flat interior
        // wash, and none of the travelling diagonals — the hatch moved
        // over whatever walked under it, which over a lane read as damage
        // on the bodies rather than as a field around them
        this.fillDisc(b, upx[i], upy[i], rad, col, SHIELD_PLAIN);
      } else {
        this.fillDisc(b, upx[i], upy[i], rad, col, 0.09 + 0.08 * w);
        this.strokeCircle(b, upx[i], upy[i], rad, 1.5 * MU, col[0], col[1], col[2], 1);
      }
    }
    // THE SHIELD TOWERS' DOMES (the Shield Towers mutator): same pass, same
    // shader, same circle, their own RED
    for (const s of sim.shieldTowers) {
      if (s.hp <= 0 || s.shield <= 0) continue;
      const rad = s.domeR * s.scale;
      if (rad < 1) continue;
      const bm = rad + 16;
      if (s.x < vx0 - bm || s.x > vx1 + bm || s.y < vy0 - bm || s.y > vy1 + bm) continue;
      const w = Math.min(1, s.shieldAlpha);
      const col: RGB = [
        SHIELD_TOWER_COL[0] + (1 - SHIELD_TOWER_COL[0]) * w,
        SHIELD_TOWER_COL[1] + (1 - SHIELD_TOWER_COL[1]) * w,
        SHIELD_TOWER_COL[2] + (1 - SHIELD_TOWER_COL[2]) * w,
      ];
      if (buffered) {
        // ONE QUAD, NEVER A FAN. A fan of `sides` textured triangles
        // double-blends along every shared slope at any alpha below 1 —
        // twenty-four radial creases converging on the middle of the
        // dome. The disc is a single sprite, so its interior is perfectly
        // flat and the edge detect gets a clean circle to find a rim around.
        //
        // SHIELD_PLAIN, not 1, is what drops the HATCH and nothing else
        // (see SHIELD_FS): the dome keeps the rim and the flat interior
        // wash a carrier's bubble has, because that wash is what reads as
        // a volume of sheltered ground. Only the travelling diagonals go,
        // and they go because a dome sits over a lane with a wave walking
        // through it, where they read as damage rather than as a field
        this.fillDisc(b, s.x, s.y, rad, col, SHIELD_PLAIN);
      } else {
        this.fillDisc(b, s.x, s.y, rad, col, 0.09 + 0.08 * w);
        this.strokeCircle(b, s.x, s.y, rad, 1.5 * MU, col[0], col[1], col[2], 1);
      }
    }
  }


  /**
   * THE ENERGY FIELD'S REACH (weapons.ts fx "field", the livewire4) — one
   * disc a caster, filled into the field buffer and blitted through the
   * shield shader with a crackling zigzag rim.
   *
   * WHAT THE RING MEANS, which is why it is worth drawing at all: every
   * structure inside it takes the pulse — eighty damage and a roll for a
   * one-second SHORT, twenty-five of them at a time, every sixty-five
   * ticks (sim.ts, case "field"). A shorted turret runs nothing at all
   * until its clock is out. The boundary is a real line on the board: a
   * turret a tile outside it is untouched and a turret a tile inside is
   * being switched off.
   *
   * IT USED TO BE FIVE ROTATING ARCS AT THAT RADIUS, and the trouble was
   * never the information — it was that five smooth arcs turning forever
   * around a forty-five-tile circle, once per caster, is a screen of
   * overlapping rings. The union fixes the count (two casters in one lane
   * are ONE threatened area, under one rim) and the zigzag fixes the
   * character: this is not a shield, and it should not read like one.
   *
   * ONLY WHILE THE FIELD HAS SOMETHING TO HIT (`aiming`), as upstream's
   * curStroke gated the old arcs. A caster walking up an empty lane
   * threatens nothing yet, and drawing the ring then is what made it feel
   * constant.
   */
  private drawFieldRings(sim: SimView, buffered: boolean): void {
    if (!HAS_FIELD) return;
    const { upx, upy, ukind, aiming, n } = sim;
    const { vx0, vy0, vx1, vy1 } = this;
    const b = this.fields;
    for (let i = 0; i < n; i++) {
      const f = KIND_FIELD[ukind[i]];
      if (!f || aiming[i] === 0) continue;
      const rad = f.range;
      // the rim reaches a couple of world units past the outline, well
      // inside this margin
      const bm = rad + 16;
      if (upx[i] < vx0 - bm || upx[i] > vx1 + bm || upy[i] < vy0 - bm || upy[i] > vy1 + bm)
        continue;
      if (buffered) {
        this.fillDisc(b, upx[i], upy[i], rad, f.color, SHIELD_PLAIN);
      } else {
        // no buffer, no union: one outline a caster, and still no
        // interior. Thinner and fainter than the buffered rim, because
        // there are about to be several of them lying on top of each other
        this.strokeCircle(b, upx[i], upy[i], rad, MU, f.color[0], f.color[1], f.color[2], 0.45);
      }
    }
  }


  private ensureShieldTarget(w: number, h: number): boolean {
    if (!this.shieldReady) return false;
    if (this.shieldFbo && this.shieldW === w && this.shieldH === h) return true;
    const gl = this.gl;
    if (!this.shieldTex) this.shieldTex = gl.createTexture();
    if (!this.shieldFbo) this.shieldFbo = gl.createFramebuffer();
    if (!this.shieldTex || !this.shieldFbo) return (this.shieldReady = false);
    gl.bindTexture(gl.TEXTURE_2D, this.shieldTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    // NEAREST, like Arc's FrameBuffer: the shader thresholds this texture's
    // alpha at 0.9 to find the outline, and a filtered edge would smear
    // that threshold into a band instead of a line
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shieldFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shieldTex, 0,
    );
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (!ok) return (this.shieldReady = false);
    this.shieldW = w;
    this.shieldH = h;
    return true;
  }

  /**
   * Mindustry's Layer.shields pass, 1:1 in shape: fill the buffer from
   * transparent, then blit the whole thing through the shield shader
   * (Renderer.effectBuffer.begin(Color.clear) ... blit(Shaders.shield)).
   *
   * Doing it in one pass over one buffer is what makes overlapping fields
   * merge — the shader's edge detect never sees the wall between two
   * bubbles, only the outline of everything the buffer holds.
   *
   * The shader reasons in Mindustry world units, so the camera rect goes
   * over in those: the visible world is uRes/zoom px across, starting at
   * -off/zoom, and MU px make one unit.
   */
  /**
   * THE TWO FIELD PASSES, in the order they stack: the force fields and
   * domes first, the energy fields over them. Each is its own gather, its
   * own clear and its own blit, because the shader merges whatever it is
   * handed into ONE shape — see the `fields` batch.
   */
  private blitShields(
    zoom: number,
    offX: number,
    offY: number,
    kPx: number,
    time: number,
    buffered: boolean,
  ): void {
    this.blitField(this.shields, SHIELD_ZIG, 1, 1, SHIELD_EDGE, zoom, offX, offY, kPx, time, buffered);
    // THE TEETH ARE A SCREEN SIZE, so the wave is resolved against this
    // frame's zoom rather than baked in world units (FIELD_TOOTH_PX).
    // uZig.x is the sine's divisor, so a world period P is P / 2pi
    const pxPerUnit = kPx * zoom * MU;
    const zig = this.fieldZig;
    zig[0] = FIELD_TOOTH_PX / pxPerUnit / (Math.PI * 2);
    zig[1] = FIELD_DEPTH_PX / pxPerUnit;
    this.blitField(this.fields, zig, FIELD_ALPHA, FIELD_FILL, FIELD_EDGE_PX / pxPerUnit,
      zoom, offX, offY, kPx, time, buffered);
  }

  /** one field pass: fill the buffer with `b`, blit it through SHIELD_FS
   *  under the rim `zig` asks for — `edge` thick, at `alpha`, with `fill`
   *  of an interior */
  private blitField(
    b: Batch,
    zig: Float32Array,
    alpha: number,
    fill: number,
    edge: number,
    zoom: number,
    offX: number,
    offY: number,
    kPx: number,
    time: number,
    buffered: boolean,
  ): void {
    if (b.n === 0) return;
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    // no buffer: the batch already holds the finished no-shader drawing,
    // so it goes straight over the frame like any other geometry
    if (!buffered) {
      this.draw(b, true);
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shieldFbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.clearColor(CLEAR[0], CLEAR[1], CLEAR[2], 1); // begin() clears with this
    // the fills ride the sprite program under the same camera
    gl.useProgram(this.prog);
    gl.uniform2f(this.uRes, w / kPx, h / kPx);
    gl.uniform1f(this.uZoom, zoom);
    gl.uniform2f(this.uOff, offX, offY);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // MAX, NOT THE USUAL OVER — this buffer is a UNION MASK, not a
    // painting, and the difference shows up wherever two shields overlap.
    //
    // Premultiplied over ADDS: two 0.94 fills land on 0.9964, three on
    // 0.9998. That is invisible to the rim (everything over 0.9 is
    // "inside") but it is exactly what SHIELD_PLAIN encodes itself in, so
    // an overlap crossed HATCH_MIN and the shared lens between two plain
    // domes came out wearing the diagonals neither of them has. Colours
    // drifted the same way, brightening every overlap.
    //
    // max(src, dst) is what a union actually means: an overlap reads back
    // exactly what one shield wrote, so the flag survives it, and the
    // antialiased rim of one disc laid over another's interior takes the
    // larger of the two instead of punching a translucent ring into it.
    gl.blendEquation(gl.MAX);
    this.draw(b, true);
    gl.blendEquation(gl.FUNC_ADD);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.shieldProg);
    const camW = w / kPx / zoom / MU, camH = h / kPx / zoom / MU;
    gl.uniform4f(this.uShieldCam, -offX / zoom / MU, -offY / zoom / MU, camW, camH);
    gl.uniform2f(this.uShieldInv, 1 / camW, 1 / camH);
    // Shaders.ShieldShader: u_time is Time.time / dp, in ticks
    gl.uniform1f(this.uShieldTime, (time * 60) / SHIELD_DP);
    gl.uniform1f(this.uShieldDp, SHIELD_DP);
    gl.uniform4fv(this.uShieldZig, zig);
    gl.uniform1f(this.uShieldAlpha, alpha);
    gl.uniform1f(this.uShieldFill, fill);
    gl.uniform1f(this.uShieldEdge, edge);
    gl.bindTexture(gl.TEXTURE_2D, this.shieldTex);
    gl.bindVertexArray(this.blitVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }

  /**
   * Arc's Lines.circle: a ring stroked at a CONSTANT width, built from
   * Lines.circleVertices(rad) tangent segments. A scaled ring sprite can't
   * stand in for this — its band thickens with the radius, so a big wave
   * reads as a filled blob instead of a hairline.
   */
  private strokeCircle(
    dyn: Batch,
    cx: number,
    cy: number,
    radius: number,
    stroke: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): void {
    if (radius <= 0.01 || stroke <= 0.01 || a <= 0.004) return;
    // Lines.circleVertices: 11 + rad*0.6, with rad in Mindustry units
    const sides = 11 + Math.floor((radius / MU) * 0.6);
    const step = (Math.PI * 2) / sides;
    // segment chord, overlapped slightly so the joints leave no gaps
    const chord = 2 * radius * Math.sin(step / 2) + stroke * 0.5;
    for (let i = 0; i < sides; i++) {
      const ang = (i + 0.5) * step;
      this.push(
        dyn,
        cx + Math.cos(ang) * radius,
        cy + Math.sin(ang) * radius,
        chord,
        stroke,
        ang + Math.PI / 2,
        UV_SOLID,
        r, g, b, a,
      );
    }
  }

  /** Fill.circle: a flat disc of the current colour */
  private fillCircle(
    dyn: Batch,
    cx: number,
    cy: number,
    radius: number,
    col: RGB,
    a: number,
  ): void {
    if (radius <= 0.01 || a <= 0.004) return;
    this.push(dyn, cx, cy, radius * 2, radius * 2, 0, UV_DISC, col[0], col[1], col[2], a);
  }

  /**
   * The same disc off the BIG source region (UV_DISC_BIG) — what the
   * shield domes fill with.
   *
   * fillCircle's 64px sprite is right for a flame puff a few pixels
   * across and wrong for a dome sixteen tiles wide: the atlas magnifies
   * with NEAREST, so at that size its edge arrives as a staircase, and
   * the shield shader then traces its rim faithfully around every step.
   * Same shape, same call, a source big enough that the biggest dome is
   * barely a blow-up at all.
   */
  private fillDisc(
    dyn: Batch,
    cx: number,
    cy: number,
    radius: number,
    col: RGB,
    a: number,
  ): void {
    if (radius <= 0.01 || a <= 0.004) return;
    this.push(dyn, cx, cy, radius * 2, radius * 2, 0, UV_DISC_BIG, col[0], col[1], col[2], a);
  }

  /** Lines.lineAngle: a stroke-wide bar running `len` from (x, y) at `ang` */
  private strokeLine(
    dyn: Batch,
    x: number,
    y: number,
    ang: number,
    len: number,
    stroke: number,
    col: RGB,
    a: number,
  ): void {
    if (len <= 0.01 || stroke <= 0.01 || a <= 0.004) return;
    this.push(
      dyn,
      x + (Math.cos(ang) * len) / 2,
      y + (Math.sin(ang) * len) / 2,
      len, stroke, ang, UV_SOLID,
      col[0], col[1], col[2], a,
    );
  }

  /**
   * Drawf.tri: an isosceles triangle with its `w`-wide base centred on
   * (x, y) square to `ang`, and its apex `len` away along it. The atlas
   * triangle points +x with its base on the -x edge, so one quad does it.
   */
  private tri(
    dyn: Batch,
    x: number,
    y: number,
    w: number,
    len: number,
    ang: number,
    col: RGB,
    a: number,
  ): void {
    if (len <= 0.01 || w <= 0.01 || a <= 0.004) return;
    this.push(dyn, x + (Math.cos(ang) * len) / 2, y + (Math.sin(ang) * len) / 2,
      len, w, ang, UV_TRI, col[0], col[1], col[2], a);
  }

  /**
   * Angles.randLenVectors, 1:1 in shape: `n` offsets, each at a uniform
   * angle within `spread` of `ang` and a uniform fraction of `len`. The
   * body is handed the offset AND its own bearing, which is what every
   * effect that flicks a bar outward uses to point it.
   *
   * Seeding is the whole trick — Mindustry re-seeds Mathf.rand from the
   * effect's id every draw, so a particle keeps its direction while the
   * length it rides grows underneath it.
   */
  private scatter(
    seed: number,
    n: number,
    len: number,
    ang: number,
    spread: number,
    body: (x: number, y: number, bearing: number) => void,
  ): void {
    rngSeed(seed);
    for (let i = 0; i < n; i++) {
      const a = ang + (spread === 0 ? 0 : (rng() * 2 - 1) * spread);
      const l = rng() * len;
      body(Math.cos(a) * l, Math.sin(a) * l, a);
    }
  }

  /**
   * Angles.randLenVectors' ParticleConsumer overload — the one whose
   * particles each carry their OWN progress. Every mote draws a fraction
   * `l` of the way out, and is handed `fin * l` and `(1 - fin) * l`: so a
   * cloud does not move as one body, it boils, with the near motes still
   * young while the far ones are already going out.
   */
  private cloud(
    seed: number,
    n: number,
    len: number,
    fin: number,
    body: (x: number, y: number, pfin: number, pfout: number) => void,
  ): void {
    rngSeed(seed);
    for (let i = 0; i < n; i++) {
      const l = rng();
      const a = rng() * Math.PI * 2;
      const d = len * l * fin;
      body(Math.cos(a) * d, Math.sin(a) * d, fin * l, (1 - fin) * l);
    }
  }

  /**
   * Mathf.randomSeedRange: a value in +/-range off a seed of its own, so
   * one particle keeps the same offset every frame while the shape it
   * belongs to grows. Mindustry seeds it per PARTICLE (id + j), which is
   * why the rays of an instHit fan out at fixed, unequal angles.
   */
  private static seedRange(seed: number, range: number): number {
    rngSeed(seed);
    return (rng() - 0.5) * 2 * range;
  }

  /**
   * Fx.blastExplosion, 1:1: hive's warhead. A pale ring snaps out over
   * the first six ticks, five grey cinders tumble after it and four
   * missile-orange sparks chase those — flakExplosion's shape in the
   * missile palette, thrown a third again as wide.
   */
  private drawBlastExplosion(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    // e.scaled(6) of the effect's 22 ticks
    const RING = 6 / 22;
    if (t < RING) {
      const s = t / RING;
      this.strokeCircle(dyn, e.x, e.y, (3 + s * 15) * MU, 3 * (1 - s) * MU,
        PAL.missileYellow[0], PAL.missileYellow[1], PAL.missileYellow[2], RING_ALPHA);
    }
    const grit = (fout * 4 + 0.5) * MU;
    this.scatter(e.seed ?? 1, 5, (2 + 23 * FIN_POW(t)) * MU, 0, Math.PI, (x, y) => {
      this.fillCircle(dyn, e.x + x, e.y + y, grit, PAL.gray, 1);
    });
    const spark = (1 + fout * 3) * MU;
    this.scatter((e.seed ?? 1) + 1, 4, (1 + 23 * FIN_POW(t)) * MU, 0, Math.PI, (x, y, bearing) => {
      this.strokeLine(dyn, e.x + x, e.y + y, bearing, spark, fout * MU, PAL.missileYellowBack, 1);
    });
  }

  /**
   * Fx.plasticExplosion, 1:1: whirl's. The same three passes again, in
   * plastanium yellow-green and wider still — a 24-unit ring over seven
   * ticks and seven cinders rather than five. The six fragments thrown by
   * the same blast are real bullets, not part of this.
   */
  private drawPlasticExplosion(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    // e.scaled(7) of the effect's 24 ticks
    const RING = 7 / 24;
    if (t < RING) {
      const s = t / RING;
      this.strokeCircle(dyn, e.x, e.y, (3 + s * 24) * MU, 3 * (1 - s) * MU,
        PAL.plastaniumFront[0], PAL.plastaniumFront[1], PAL.plastaniumFront[2], RING_ALPHA);
    }
    const grit = (fout * 4 + 0.5) * MU;
    this.scatter(e.seed ?? 1, 7, (2 + 28 * FIN_POW(t)) * MU, 0, Math.PI, (x, y) => {
      this.fillCircle(dyn, e.x + x, e.y + y, grit, PAL.gray, 1);
    });
    const spark = (1 + fout * 3) * MU;
    this.scatter((e.seed ?? 1) + 1, 4, (1 + 25 * FIN_POW(t)) * MU, 0, Math.PI, (x, y, bearing) => {
      this.strokeLine(dyn, e.x + x, e.y + y, bearing, spark, fout * MU, PAL.plastaniumBack, 1);
    });
  }

  /**
   * Fx.instShoot, 1:1: railhead's muzzle. A 50-unit ring blows off the
   * barrel over the first ten ticks while four long blades stand out of
   * it — one pair square to the shot and one pair almost along it. It is
   * the biggest muzzle flash in the game, and deliberately so: the shot
   * itself is instant and this is all there is to see of it.
   */
  private drawInstShoot(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    const rot = e.rot ?? 0;
    const RING = 10 / 24; // e.scaled(10) of the effect's 24 ticks
    if (t < RING) {
      const s = t / RING;
      const col = ramp(PAL.white, PAL.bulletYellowBack, null, s);
      this.strokeCircle(dyn, e.x, e.y, s * 50 * MU, ((1 - s) * 3 + 0.2) * MU,
        col[0], col[1], col[2], RING_ALPHA);
    }
    const w = 13 * fout * MU;
    for (const side of [-1, 1]) {
      this.tri(dyn, e.x, e.y, w, 85 * MU, rot + (side * Math.PI) / 2, PAL.bulletYellowBack, 1);
      this.tri(dyn, e.x, e.y, w, 50 * MU, rot + (side * 20 * Math.PI) / 180, PAL.bulletYellowBack, 1);
    }
  }

  /**
   * Fx.instHit, 1:1: where a rail shot lands. Two passes of five ragged
   * blades each — the back pair full length and the front pair half, so
   * the burst reads as layered — over a ring and a spray of tumbling
   * diamonds. Each blade's angle and length come off its own seed, which
   * is what keeps the star lopsided instead of a clean asterisk.
   */
  private drawInstHit(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    const rot = e.rot ?? 0;
    const seed = e.seed ?? 1;
    for (let i = 0; i < 2; i++) {
      const col = i === 0 ? PAL.bulletYellowBack : PAL.bulletYellow;
      const m = i === 0 ? 1 : 0.5;
      for (let j = 0; j < 5; j++) {
        const a = rot + (Renderer.seedRange(seed + j, 50) * Math.PI) / 180;
        const w = 23 * fout * m * MU;
        this.tri(dyn, e.x, e.y, w, (80 + Renderer.seedRange(seed + j, 40)) * m * MU, a, col, 1);
        this.tri(dyn, e.x, e.y, w, 20 * m * MU, a + Math.PI, col, 1);
      }
    }
    const RING = 10 / 20; // e.scaled(10) of 20 ticks
    if (t < RING) {
      const s = t / RING;
      this.strokeCircle(dyn, e.x, e.y, s * 30 * MU, ((1 - s) * 2 + 0.2) * MU,
        PAL.bulletYellow[0], PAL.bulletYellow[1], PAL.bulletYellow[2], RING_ALPHA);
    }
    const SPRAY = 12 / 20; // e.scaled(12), but the SPREAD rides the outer fin
    if (t < SPRAY) {
      const s = 1 - t / SPRAY;
      const side = s * 3 * MU;
      this.scatter(seed, 25, (5 + t * 80) * MU, rot, SPREAD_60, (x, y) => {
        // Fill.square(..., 45): a diamond, not a dot
        this.push(dyn, e.x + x, e.y + y, side * 2, side * 2, Math.PI / 4, UV_SOLID,
          PAL.bulletYellowBack[0], PAL.bulletYellowBack[1], PAL.bulletYellowBack[2], 1);
      });
    }
  }

  /**
   * Fx.instTrail, 1:1: laid every 20 units down the line a rail shot
   * actually reached, so a shot stopped early leaves a visibly shorter
   * track. Each mark is a blade pointing BACK along the line and a stub
   * pointing forward — the wake, not the shot.
   */
  private drawInstTrail(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    const back = (e.rot ?? 0) + Math.PI;
    const seed = e.seed ?? 1;
    for (let i = 0; i < 2; i++) {
      const col = i === 0 ? PAL.bulletYellowBack : PAL.bulletYellow;
      const m = i === 0 ? 1 : 0.5;
      const w = 15 * fout * m * MU;
      this.tri(dyn, e.x, e.y, w, (30 + Renderer.seedRange(seed, 15)) * m * MU, back, col, 1);
      this.tri(dyn, e.x, e.y, w, 10 * m * MU, back + Math.PI, col, 1);
    }
  }

  /**
   * Fx.instBomb, 1:1: the ring and eight-pointed star a rail shot leaves
   * at the muzzle it never left — a rail bullet has speed 0 and a life of
   * one tick, so its despawn effect plays exactly where it was fired.
   */
  private drawInstBomb(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    this.strokeCircle(dyn, e.x, e.y, (4 + FIN_POW(t) * 20) * MU, fout * 4 * MU,
      PAL.bulletYellowBack[0], PAL.bulletYellowBack[1], PAL.bulletYellowBack[2], RING_ALPHA);
    for (let i = 0; i < 4; i++) {
      const a = ((i * 90 + 45) * Math.PI) / 180;
      this.tri(dyn, e.x, e.y, 6 * MU, 80 * fout * MU, a, PAL.bulletYellowBack, 1);
    }
    for (let i = 0; i < 4; i++) {
      const a = ((i * 90 + 45) * Math.PI) / 180;
      this.tri(dyn, e.x, e.y, 3 * MU, 30 * fout * MU, a, PAL.white, 1);
    }
  }

  /**
   * Fx.smokeCloud, 1:1: the powder railhead leaves hanging for a second
   * and a bit. Thirty motes on the boiling-cloud variant of
   * randLenVectors, each fading in and out on its OWN clock — an alpha
   * that peaks when that mote is halfway through its life.
   */
  /**
   * The soot a hurt unit sheds (Sim.updateStatus): a few grey puffs
   * leaving the body, swelling and thinning as they go, and drifting UP the
   * screen the way smoke does. Fx.smokeCloud's shape at a unit's scale —
   * e.len carries the hitbox radius, so a dartback5's smoke is not a
   * ironhide1's — and none of Mindustry's fire, which this game does not
   * field. A deviation: upstream units do not smoke, buildings do.
   */
  private drawDamageSmoke(dyn: Batch, e: Effect, t: number): void {
    const spread = (e.len ?? 10) * 0.7; // len is the hitbox radius; 10 is UR, a bare ironhide1
    const rise = t * 6 * MU;
    this.cloud(e.seed ?? 1, 4, spread, t, (x, y, pfin, pfout) => {
      this.fillCircle(dyn, e.x + x, e.y + y - rise, (0.6 + pfout * 2.4) * MU, PAL.gray,
        (0.5 - Math.abs(pfin - 0.5)) * 1.7);
    });
  }

  private drawSmokeCloud(dyn: Batch, e: Effect, t: number): void {
    this.cloud(e.seed ?? 1, 30, 30 * MU, t, (x, y, pfin, pfout) => {
      this.fillCircle(dyn, e.x + x, e.y + y, (0.5 + pfout * 4) * MU, PAL.gray,
        (0.5 - Math.abs(pfin - 0.5)) * 2);
    });
  }

  /**
   * Fx.hitBulletColor, 1:1 — and Fx.hitBulletSmall, which is the same
   * effect with its ramp fixed to Pal.lightOrange, so the ammo's own
   * colour arriving in e.col covers both. A ring snaps out over the first
   * half of the life while five sparks fly, all of it washing from white
   * into the colour of the round that landed.
   */
  private drawBulletHit(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    const col = ramp(PAL.white, e.col ?? PAL.lightOrange, null, t);
    // e.scaled(7): the ring runs on its own 7-tick clock, half the effect's
    if (t < 0.5) {
      const s = t * 2;
      this.strokeCircle(dyn, e.x, e.y, s * 5 * MU, (0.5 + (1 - s)) * MU,
        col[0], col[1], col[2], RING_ALPHA);
    }
    const stroke = (0.5 + fout) * MU;
    const bar = (fout * 3 + 1) * MU;
    this.scatter(e.seed ?? 1, 5, t * 15 * MU, 0, Math.PI, (x, y, bearing) => {
      this.strokeLine(dyn, e.x + x, e.y + y, bearing, bar, stroke, col, 1);
    });
  }

  /**
   * Fx.flakExplosion, 1:1: a yellow ring thrown in the first six ticks,
   * five grey cinders tumbling out behind it and four orange sparks
   * chasing them — the last on their own seed, so they do not sit on the
   * cinders.
   */
  private drawFlakExplosion(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    // e.scaled(6) of the effect's 20 ticks
    if (t < 0.3) {
      const s = t / 0.3;
      this.strokeCircle(dyn, e.x, e.y, (3 + s * 10) * MU, 3 * (1 - s) * MU,
        PAL.bulletYellow[0], PAL.bulletYellow[1], PAL.bulletYellow[2], RING_ALPHA);
    }
    const grit = (fout * 3 + 0.5) * MU;
    this.scatter(e.seed ?? 1, 5, (2 + 23 * FIN_POW(t)) * MU, 0, Math.PI, (x, y) => {
      this.fillCircle(dyn, e.x + x, e.y + y, grit, PAL.gray, 1);
    });
    const spark = (1 + fout * 3) * MU;
    this.scatter((e.seed ?? 1) + 1, 4, (1 + 23 * FIN_POW(t)) * MU, 0, Math.PI, (x, y, bearing) => {
      this.strokeLine(dyn, e.x + x, e.y + y, bearing, spark, fout * MU, PAL.lighterOrange, 1);
    });
  }

  /**
   * Fx.shootSmall and Fx.shootBig: the muzzle flash, a long tongue forward
   * and a stub of backblast, both narrowing as they go out.
   */
  private drawShootTri(dyn: Batch, e: Effect, t: number, big: boolean): void {
    const fout = 1 - t;
    const col = ramp(PAL.lighterOrange, PAL.lightOrange, null, t);
    const w = ((big ? 1.2 : 1) + (big ? 7 : 5) * fout) * MU;
    const rot = e.rot ?? 0;
    this.tri(dyn, e.x, e.y, w, (big ? 25 : 15) * fout * MU, rot, col, 1);
    this.tri(dyn, e.x, e.y, w, (big ? 4 : 3) * fout * MU, rot + Math.PI, col, 1);
  }

  /**
   * Fx.shootSmallSmoke and Fx.shootBigSmoke: the powder behind the flash,
   * a handful of motes drifting up the barrel's line and cooling from
   * orange through light grey to grey.
   */
  private drawShootSmoke(dyn: Batch, e: Effect, t: number, big: boolean): void {
    const fout = 1 - t;
    const col = ramp(PAL.lighterOrange, PAL.lightGray, PAL.gray, t);
    const rad = (big ? fout * 2 + 0.2 : fout * 1.5) * MU;
    this.scatter(e.seed ?? 1, big ? 8 : 5, FIN_POW(t) * (big ? 19 : 6) * MU,
      e.rot ?? 0, big ? SPREAD_10 : SPREAD_20, (x, y) => {
        this.fillCircle(dyn, e.x + x, e.y + y, rad, col, 1);
      });
  }

  /**
   * Fx.thoriumShoot and Fx.lightningShoot — one shape, and the colour it
   * ramps into says which: cleaver throws thorium pink, coil piercer blue.
   * Seven sparks out of the muzzle in a wide cone, LENGTHENING as they go
   * (fin, not fout) so the spray reads as opening rather than dying.
   */
  private drawSparkShoot(dyn: Batch, e: Effect, t: number): void {
    const col = ramp(PAL.white, e.col ?? PAL.piercerLaser, null, t);
    const stroke = ((1 - t) * 1.2 + 0.5) * MU;
    const bar = (t * 5 + 2) * MU;
    this.scatter(e.seed ?? 1, 7, 25 * FIN_POW(t) * MU, e.rot ?? 0, SPREAD_50,
      (x, y, bearing) => {
        this.strokeLine(dyn, e.x + x, e.y + y, bearing, bar, stroke, col, 1);
      });
  }

  /** Fx.hitPiercer: eight white bars flicking off whatever the beam or the
   *  bolt just landed on */
  private drawHitPiercer(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    const bar = (fout * 4 + 1) * MU;
    const stroke = fout * 1.5 * MU;
    this.scatter(e.seed ?? 1, 8, FIN_POW(t) * 17 * MU, 0, Math.PI, (x, y, bearing) => {
      this.strokeLine(dyn, e.x + x, e.y + y, bearing, bar, stroke, PAL.white, 1);
    });
  }

  /**
   * Fx.piercerLaserCharge over Fx.piercerLaserChargeBegin — Mindustry's
   * MultiEffect, drawn off one entity because the pair never appears apart.
   * Fourteen sparks fall INWARD on the muzzle (their length runs on fout,
   * so the ring closes) over 38 ticks, while a blue base swells under a
   * white one for 60 and then snaps out over the last tenth.
   */
  private drawPiercerCharge(dyn: Batch, e: Effect, t: number): void {
    // Mathf.curve(fin, 0.9): nothing until the last tenth, then a hard
    // collapse — the flash of the shot actually leaving
    const margin = 1 - Math.max(0, (t - 0.9) / 0.1);
    const base = Math.min(margin, t);
    this.fillCircle(dyn, e.x, e.y, base * 3 * MU, PAL_PIERCER, 1);
    this.fillCircle(dyn, e.x, e.y, base * 2 * MU, PAL.white, 1);
    if (t >= PIERCER_CHARGE_SPARK) return;
    const s = t / PIERCER_CHARGE_SPARK;
    const bar = ((1 - Math.abs(s - 0.5) * 2) * 3 + 1) * MU; // fslope
    this.scatter(e.seed ?? 1, 14, (1 + 20 * (1 - s)) * MU, e.rot ?? 0, SPREAD_120,
      (x, y, bearing) => {
        this.strokeLine(dyn, e.x + x, e.y + y, bearing, bar, MU, PAL_PIERCER, 1);
      });
  }

  /**
   * Fx.shootSmallFlame, 1:1 — torch's entire visible weapon. Twelve
   * particles stream out of the muzzle inside a 10-degree cone, each one
   * parked at its own fixed fraction of a length that eases out to 60
   * units, so the tongue lengthens fast and then hangs. They fatten as they
   * fade and run yellow to red to smoke-grey across the 32-tick life.
   *
   * The effect does NOT follow the turret (.followParent(false)): it is
   * planted at the muzzle when the shot leaves, and the next shot is
   * 6 ticks behind it, so five or six overlap into one continuous jet.
   */
  private drawShootFlame(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    // livewire2's plasma-mount-weapon (sides 1): white through Pal.heal to
    // grey, eight motes rather than twelve — the plasma torch's own effect
    const plasma = (e.sides ?? 0) === 1;
    const col = plasma
      ? ramp(PAL.white, e.col ?? PAL_HEAL, FLAME_GRAY, t)
      : ramp(LIGHT_FLAME, DARK_FLAME, FLAME_GRAY, t);
    const len = FIN_POW(t) * 60 * MU;
    const rad = (0.65 + fout * 1.5) * MU;
    const rot = e.rot ?? 0;
    rngSeed(e.seed ?? 1);
    for (let i = 0; i < (plasma ? 8 : 12); i++) {
      const a = rot + (rng() * 2 - 1) * SPREAD_10;
      const l = rng() * len;
      this.fillCircle(dyn, e.x + Math.cos(a) * l, e.y + Math.sin(a) * l, rad, col, 1);
    }
  }

  /**
   * Fx.hitFlameSmall, 1:1: two short bars flicking outward from the point
   * of contact over 14 ticks, within 50 degrees of the shot's heading
   */
  private drawHitFlame(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    // Fx.hitFlamePlasma when a colour rides in: white into it
    const col = e.col ? ramp(PAL.white, e.col, null, t) : ramp(LIGHT_FLAME, DARK_FLAME, null, t);
    const len = (1 + t * 15) * MU;
    const stroke = (0.5 + fout) * MU;
    const rot = e.rot ?? 0;
    rngSeed(e.seed ?? 1);
    for (let i = 0; i < 2; i++) {
      const a = rot + (rng() * 2 - 1) * SPREAD_50;
      const l = rng() * len;
      // Mathf.angle(x, y): each bar points the way its own offset went
      this.strokeLine(
        dyn,
        e.x + Math.cos(a) * l,
        e.y + Math.sin(a) * l,
        a,
        (fout * 3 + 1) * MU,
        stroke,
        col,
        1,
      );
    }
  }

  /**
   * Fx.lightning, 1:1: coil's bolt is drawn from the very point list the
   * walk built (Sim.lightningBolt), stroked 3 units wide and fading, with a
   * dot at every node so the corners read as joints rather than kinks. The
   * colour washes from Pal.piercerLaser to white as it goes out.
   */
  /**
   * THE SKY GUNSHIPS' SHOTGUN (FxKind.Scatter, weapons.ts fx "scatter"):
   * the blast IS the shot. A flash at the muzzle and a fan of streaks
   * thrown the cone's width (`sides`, degrees) and a share of the gun's
   * reach (`len`) — every streak leaves at once, its tip running out over
   * the first third of the effect and its tail chasing it, so the fan
   * reads as pellets leaving rather than a beam held, and is gone in a
   * fifth of a second. White into the sky's own orange. A full-circle
   * cone (the stoop2's blast straight down) throws more streaks, shorter,
   * so it reads as a burst under the ship rather than a fan off its nose.
   */
  private drawAirburst(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    const cone = ((e.sides ?? 20) * Math.PI) / 180;
    const ring = cone >= Math.PI - 0.01;
    const reach = e.len || 60 * MU;
    const base = e.col ?? PAL.bomber;
    const col = ramp(PAL.white, base, PAL.bomberDark, t);
    const rot = e.rot ?? 0;
    this.fillCircle(dyn, e.x, e.y, (1.5 + fout * (ring ? 5 : 3)) * MU, col, fout);
    const n = ring ? 14 : 9;
    const stroke = (0.4 + fout * 1.3) * MU;
    rngSeed(e.seed ?? 1);
    for (let i = 0; i < n; i++) {
      const a = rot + (rng() * 2 - 1) * cone;
      const l = reach * (0.45 + rng() * 0.55) * (ring ? 0.8 : 1);
      const head = l * Math.min(1, t * 3 + 0.35);
      const tail = l * t;
      const seg = head - tail;
      if (seg <= 0.01) continue;
      this.strokeLine(dyn, e.x + Math.cos(a) * tail, e.y + Math.sin(a) * tail, a, seg, stroke, col, fout);
    }
  }

  private drawBolt(dyn: Batch, e: Effect, t: number): void {
    const pts = e.pts;
    if (!pts || pts.length < 4) return;
    const stroke = 3 * MU * (1 - t);
    if (stroke <= 0.01) return;
    // color(e.color, Color.white, fin): coil's is piercer blue, starhart2's heal
    const base = e.col ?? PAL_PIERCER;
    const col: RGB = [
      base[0] + (1 - base[0]) * t,
      base[1] + (1 - base[1]) * t,
      base[2] + (1 - base[2]) * t,
    ];
    for (let i = 0; i + 3 < pts.length; i += 2)
      this.pushSeg(dyn, pts[i], pts[i + 1], pts[i + 2], pts[i + 3], UV_SOLID, stroke, col);
    for (let i = 0; i < pts.length; i += 2)
      this.fillCircle(dyn, pts[i], pts[i + 1], stroke / 2, col, 1);
  }

  /**
   * LaserBulletType.draw: three passes of the same beam, each half the
   * width of the last, so the bright base sits inside a wide translucent
   * sheath. Each pass adds a ROUND head and a pair of flares out the
   * sides of the muzzle, and the whole thing grows to length over the first
   * fifth of its life and thins out over the rest.
   *
   * The head is the one departure from upstream, and it is shared with
   * the continuous beam (drawBeam): every laser on the board ends in a
   * dome. The stacked tip triangles it replaces are described there.
   *
   * `len` is what the beam ACTUALLY reached — Sim.laserBeam shortens it to
   * the fourth unit it hit — so a piercer firing into a crowd draws short.
   */
  private drawLaser(dyn: Batch, e: Effect, t: number): void {
    const rot = e.rot ?? 0;
    const fout = 1 - t;
    const baseLen = (e.len ?? 0) * Math.min(1, t / 0.2); // Mathf.curve(fin, 0, 0.2)
    if (baseLen <= 0.01) return;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    // the style rides `sides`: 0 is piercer's (the class default), the rest
    // the swarm's own beams — starhart3's and starhart5's green, stoop5's orange
    const st = LASER_STYLES[e.sides ?? 0] ?? LASER_STYLES[0];
    const width = st.width * MU; // LaserBulletType.width
    const SIDE_LEN = st.sideLength * MU, SIDE_WIDTH = st.sideWidth, SIDE_ANGLE = st.sideAngle, FALLOFF = 0.5;
    // colors[0] is the beam at 0.4 alpha, colors[1] solid, colors[2] white
    const passes = st.colors;
    const tri = (
      tx: number, ty: number, w: number, l: number, a: number, col: RGB, alpha: number,
    ): void => {
      if (l <= 0.01 || w <= 0.01) return;
      this.push(dyn, tx + (Math.cos(a) * l) / 2, ty + (Math.sin(a) * l) / 2, l, w, a,
        UV_TRI, col[0], col[1], col[2], alpha);
    };
    let cwidth = width;
    let compound = 1;
    for (const [col, alpha] of passes) {
      cwidth *= FALLOFF;
      const stroke = cwidth * fout;
      if (stroke > 0.01) {
        this.pushSeg(dyn, e.x, e.y, e.x + cos * baseLen, e.y + sin * baseLen,
          UV_SOLID, stroke, col, alpha);
        // A ROUND HEAD, not upstream's point. LaserBulletType caps each
        // pass with a triangle `cwidth * 2 + width / 2` long, and three
        // passes of that down one bearing stacked three spikes of three
        // lengths — a christmas tree. A disc the width of its own pass
        // ends every pass on the same dome instead.
        this.fillCircle(dyn, e.x + cos * baseLen, e.y + sin * baseLen, stroke / 2, col, alpha);
        // and the muzzle bloom
        this.fillCircle(dyn, e.x, e.y, cwidth * fout, col, alpha);
        for (const sgn of [1, -1])
          tri(e.x, e.y, SIDE_WIDTH * fout * cwidth, SIDE_LEN * compound,
            rot + sgn * SIDE_ANGLE, col, alpha);
      }
      compound *= FALLOFF;
    }
  }

  /**
   * Drawf.laser for a LOCK BEAM (tether): a 12-unit-wide line scaled by
   * the turret's `strength` and laserWidth, inset at both ends by the caps
   * that close it off. Tether fires no bullet, so this is the only thing
   * on screen that says it is working — and `strength` carries the SPOOL
   * (Sim.updateLockBeam), so a beam that has held its target for seconds
   * is visibly fatter than the one that just caught it.
   *
   * laserWidth is a THIRD of upstream's, because upstream's beam is a
   * 18px rope that reads as a cleaver's shot rather than a lock. Drawn at
   * 0.2 a fully spooled beam is 6 world px, and the WIDTH IS THE RAMP: the
   * only reason this beam is ever thick is that it is hurting. The cold
   * end is floored, though — the art's rule is nothing under four native
   * px (2.5 world px, docs/unit-art.md 1b), and a beam that just caught
   * its target used to be a hairline under that.
   */
  private drawLockBeam(dyn: Batch, t: TowerView): void {
    const scale = Math.max(BEAM_MIN_SCALE, t.beamStr * 0.2); // TractorBeamTurret.laserWidth, thinned and floored (see above)
    const x1 = t.x + Math.cos(t.angle) * 5 * MU; // shootLength
    const y1 = t.y + Math.sin(t.angle) * 5 * MU;
    const dx = t.beamX - x1, dy = t.beamY - y1;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const inset = 8 * scale * 0.25 * MU; // Drawf.laser's own end inset
    // the glow at region.height * scale * Draw.scl — on the TRIMMED 32px
    // region Mindustry actually packs, not the 72px source (see the UV note)
    const cap = 32 * scale * 0.25 * MU;
    const ux = dx / d, uy = dy / d;
    const white: RGB = [1, 1, 1]; // TractorBeamTurret.laserColor
    this.pushSeg(dyn, x1 + ux * inset, y1 + uy * inset, t.beamX - ux * inset,
      t.beamY - uy * inset, UV_TETHER_LASER, 12 * scale * MU, white);
    const a = Math.atan2(dy, dx);
    this.push(dyn, x1, y1, cap, cap, a + Math.PI, UV_TETHER_LASER_END, 1, 1, 1, 1);
    this.push(dyn, t.beamX, t.beamY, cap, cap, a, UV_TETHER_LASER_END, 1, 1, 1, 1);
  }

  /**
   * Drawf.flameFront: the rounded cap on either end of a continuous laser.
   * A half-ellipse — `length` along the beam, `width` across — filled as a
   * fan of wedges out of its own centre. The wedges are drawn with the
   * shrapnel triangle, base on the arc and apex at the centre, which is
   * exact for a circle and off by a hair for an ellipse; at fifteen
   * divisions that hair is well under a pixel.
   */
  private flameFront(
    dyn: Batch,
    x: number,
    y: number,
    rot: number,
    length: number,
    width: number,
    col: RGB,
    a: number,
  ): void {
    if (length <= 0.01 || width <= 0.01 || a <= 0.004) return;
    const DIV = 15; // Mathf.round(divisions=13, 2) + 1
    const cos = Math.cos(rot), sin = Math.sin(rot);
    // local (u, v): u along the beam, v across it. The arc runs from -90
    // through the nose at 0 to +90, so the polygon closes on its own base
    let pu = 0, pv = -width;
    for (let i = 1; i <= DIV; i++) {
      const th = ((-90 + (180 * i) / DIV) * Math.PI) / 180;
      const u = Math.cos(th) * length, v = Math.sin(th) * width;
      const mu = (pu + u) / 2, mv = (pv + v) / 2;
      const chord = Math.hypot(u - pu, v - pv);
      const h = Math.hypot(mu, mv);
      if (h > 0.001 && chord > 0.001) {
        const wx = x + cos * mu - sin * mv, wy = y + sin * mu + cos * mv;
        // the apex sits at the fan's centre, so the tri points back down
        // the bearing from the chord's midpoint to it
        this.tri(dyn, wx, wy, chord, h, Math.atan2(-(sin * mu + cos * mv), -(cos * mu - sin * mv)),
          col, a);
      }
      pu = u;
      pv = v;
    }
  }

  /**
   * ContinuousLaserBulletType.draw: furnace's beam. FOUR passes of
   * the same line, each narrower and whiter than the last — a broad
   * translucent wash, two hotter bases inside it and a white filament down
   * the middle — with a ROUND cap closing both ends of every pass. The
   * layering is the entire look: no single pass is the beam.
   *
   * The beam shortens as it goes out (fout drives both stroke and length),
   * and Mathf.absin gives the whole thing a slow shimmer that keeps it
   * from reading as a static bar.
   */
  private drawContinuousBeam(
    dyn: Batch,
    t: TowerView,
    cont: TowerView["spec"]["bullet"]["continuous"],
  ): void {
    if (!cont) return;
    // held at full, then linearly out over fadeTime
    const fout = t.beamT > cont.fade ? 1 : t.beamT / cont.fade;
    // Time.time, in ticks — the beam's own elapsed life does for a clock
    const time = (cont.duration + cont.fade - t.beamT) * 60;
    this.drawBeam(dyn, t.beamOX, t.beamOY, t.beamRot, cont.length * fout, fout, time, FURNACE_BEAM);
  }

  /**
   * ContinuousLaserBulletType.draw, 1:1, for any beam: `len` is what the
   * beam reaches this frame (its length times fout), `time` in ticks is
   * the clock its shimmer and oscillation run on, and the style carries
   * the four washes and the width — furnace's, or a starhart4's green.
   */
  private drawBeam(
    dyn: Batch,
    ox: number,
    oy: number,
    rot: number,
    len: number,
    fout: number,
    time: number,
    style: BeamStyle,
  ): void {
    if (len <= 0.01) return;
    const shimmer = 1 + ABSIN(time, 1, 0.1);
    const width = style.width + ABSIN(time, 0.8, 1.5); // width + absin(oscScl, oscMag)
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const colors = style.colors;
    for (let i = 0; i < colors.length; i++) {
      const [[cr, cg, cb], ca] = colors[i];
      const col: RGB = [
        Math.min(1, cr * shimmer),
        Math.min(1, cg * shimmer),
        Math.min(1, cb * shimmer),
      ];
      const colorFin = i / (colors.length - 1);
      // strokeFrom 2 -> strokeTo 0.5: every pass inside the one before it
      const stroke = width * fout * (2 + (0.5 - 2) * colorFin) * MU;
      // ROUND ENDS. The cap reaches exactly as far as the pass is wide, so
      // flameFront's arc closes as a half circle rather than a spike, and
      // the body gives that radius back — every pass, wide wash and white
      // filament alike, ends its nose on the SAME point at `len`
      const r = stroke / 2;
      const body = Math.max(0, len - r);
      this.strokeLine(dyn, ox, oy, rot, body, stroke, col, ca);
      this.flameFront(dyn, ox, oy, rot + Math.PI, r, r, col, ca);
      this.flameFront(dyn, ox + cos * body, oy + sin * body, rot, r, r, col, ca);
    }
  }

  /**
   * Fx.unitSpawn, 1:1 in shape: a unit's entrance, drawn in the unit's OWN
   * sprite. Two copies of it on the same spot —
   *
   *   - one at normal size and a fixed half turn from the atlas facing,
   *     fading OUT: the husk the unit arrives out of;
   *   - one starting at THREE times size and shrinking onto the unit's
   *     real footprint, fading IN, on the heading it will be drawn at.
   *
   * ONE THING IS NOT REPRODUCED, and it is the mixcol: Mindustry lerps the
   * fading copy toward white as it goes, and this pipeline's tint is a
   * MULTIPLY (`texture * tint` in the fragment shader), which can darken a
   * sprite but can never brighten one toward white. Every other effect on
   * the sheet is geometry drawn on a white texel, where a tint IS the
   * colour; this is the only one that tints real art, and it is the only
   * place the difference shows.
   */
  private drawUnitSpawn(dyn: Batch, e: Effect, t: number): void {
    const k = e.unit ?? 0;
    const uv = KIND_UV[k];
    if (!uv) return;
    const size = KIND_SPRITE[k];
    const fout = 1 - t;
    // the husk: normal size, a fixed half turn (Mindustry's literal 180 in
    // its own draw space), fading out
    this.push(dyn, e.x, e.y, size, size, Math.PI, uv, 1, 1, 1, fout);
    // and the unit itself, closing from 3x onto its own size
    const s = size * (1 + fout * 2);
    this.push(dyn, e.x, e.y, s, s, e.rot ?? 0, uv, 1, 1, 1, t);
    // both copies wear the cell of the team the body is arriving for (the
    // push carries the colour), so an entrance says whose it is from the
    // first frame of it rather than from the ring under the finished unit
    const cell = this.kindCell[k];
    if (!cell || !e.col) return;
    this.pushCellAlpha(dyn, cell, e.x, e.y, size, Math.PI, e.col, fout);
    this.pushCellAlpha(dyn, cell, e.x, e.y, s, e.rot ?? 0, e.col, t);
  }

  /**
   * Fx.unitLandSmall, the puff a planted foot throws up: 6 motes per unit
   * of rippleScale, flung up to 12 world units out (times that same scale)
   * over 30 ticks, each shrinking from 3 units to nothing.
   *
   * Mindustry fires it in the FLOOR's own colour brightened a tenth, which
   * is what makes a stone canyon read as grit and a meadow as clippings —
   * so the tile under the foot is looked up per puff, not per unit.
   */
  private drawFootfall(dyn: Batch, sim: SimView, e: Effect, t: number): void {
    const ripple = e.rot ?? 1;
    const cx = clamp((e.x / CELL) | 0, 0, COLS - 1);
    const cy = clamp((e.y / CELL) | 0, 0, ROWS - 1);
    const base = FLOOR_DUST[((sim.terrain.floor[cy * COLS + cx] / 3) | 0) % FLOOR_DUST.length];
    const col: RGB = [
      Math.min(1, base[0] * 1.1),
      Math.min(1, base[1] * 1.1),
      Math.min(1, base[2] * 1.1),
    ];
    const n = (6 * ripple) | 0;
    const len = 12 * MU * FIN_POW(t) * ripple;
    const rad = ((1 - t) * 3 + 0.1) * MU;
    rngSeed(e.seed ?? 1);
    for (let i = 0; i < n; i++) {
      const l = rng() * len;
      const a = rng() * TAU;
      this.fillCircle(dyn, e.x + Math.cos(a) * l, e.y + Math.sin(a) * l, rad, col, 1);
    }
  }

  /**
   * Fx.burning, 1:1: three embers guttering off a unit that torch has set
   * alight, drifting out in any direction over 35 ticks
   */
  private drawBurning(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    const col = ramp(LIGHT_FLAME, DARK_FLAME, null, t);
    const len = (2 + t * 7) * MU;
    const rad = (0.1 + fout * 1.4) * MU;
    rngSeed(e.seed ?? 1);
    for (let i = 0; i < 3; i++) {
      const l = rng() * len;
      const a = rng() * Math.PI * 2;
      this.fillCircle(dyn, e.x + Math.cos(a) * l, e.y + Math.sin(a) * l, rad, col, 1);
    }
  }

  /**
   * ShrapnelBulletType.draw, 1:1: a long triangle bolt with a short back
   * spike and perpendicular serrations, tinted from the style's first
   * colour to its second (cleaver: white to thoriumPink; dartback5: sapBullet to
   * sapBulletBack) over its 10-tick life, all widths shrinking with fout.
   */
  private drawShrapnel(
    dyn: Batch,
    x: number,
    y: number,
    rot: number,
    len: number,
    t: number,
    S: (typeof SHRAPNEL_STYLES)[number],
  ): void {
    const fout = 1 - t;
    const r = S.fromColor[0] + (S.toColor[0] - S.fromColor[0]) * t;
    const g = S.fromColor[1] + (S.toColor[1] - S.fromColor[1]) * t;
    const b = S.fromColor[2] + (S.toColor[2] - S.fromColor[2]) * t;
    const col: RGB = [r, g, b];
    const tri = (tx: number, ty: number, w: number, l: number, a: number): void =>
      this.tri(dyn, tx, ty, w, l, a, col, 1);
    for (let i = 0; i < S.serrations; i++) {
      const px = x + Math.cos(rot) * i * S.serrationSpacing;
      const py = y + Math.sin(rot) * i * S.serrationSpacing;
      const fade = Math.min(Math.max(fout - S.serrationFadeOffset, 0), 1);
      const sl = fade * (S.serrationSpaceOffset - i * S.serrationLenScl);
      tri(px, py, S.serrationWidth, sl, rot + Math.PI / 2);
      tri(px, py, S.serrationWidth, sl, rot - Math.PI / 2);
    }
    tri(x, y, S.width * fout, len + S.tipPad, rot);
    tri(x, y, S.width * fout, S.backLen, rot + Math.PI);
  }

  /**
   * UnitEngine.draw for every engine a flyer carries: the offset turned
   * onto the unit's heading (x across, y along), the outer disc in the
   * team colour breathing on absin(Time.time, 2, radius / 4), the white
   * inner disc half its size thrown a quarter-radius the engine's own way
   * (rotation -90 on an axial engine: forward, into the hull).
   */
  /**
   * UnitType.drawCell: the window on a hull, in the colour of the team that
   * owns it — one quad over the body, on the body's own heading.
   *
   * The sheet reports where the cell sits as a FRACTION of the body's quad
   * (atlas.ts CellArt), so this is the same arithmetic at every size a body
   * is ever drawn at: scale the offset, turn it with the hull, scale the
   * quad. `col` arrives already multiplied by whatever the body itself is
   * tinted with, so a cell greys with its unit's health and darkens in a
   * hill's shade exactly as it did when it was baked into the sprite.
   */
  private pushCell(
    b: Batch,
    cell: CellArt,
    x: number,
    y: number,
    size: number,
    rot: number,
    col: RGB,
  ): void {
    this.pushCellAlpha(b, cell, x, y, size, rot, col, 1);
  }

  /** ...and the same cell at an alpha of its own, for the two fading
   *  copies of a body the spawn effect draws (drawUnitSpawn) */
  private pushCellAlpha(
    b: Batch,
    cell: CellArt,
    x: number,
    y: number,
    size: number,
    rot: number,
    col: RGB,
    alpha: number,
  ): void {
    const c = Math.cos(rot), s = Math.sin(rot);
    const dx = cell.dx * size, dy = cell.dy * size;
    this.push(
      b, x + c * dx - s * dy, y + s * dx + c * dy,
      cell.w * size, cell.h * size, rot, cell.uv, col[0], col[1], col[2], alpha,
    );
  }

  /**
   * Two wings off one sprite, mirrored (a negative quad height, like a
   * mech's off-side leg), each pivoting on its root. `fold` scales the
   * quad ACROSS the heading — the axis the sprite's span lies along once
   * it is packed facing +x — and the centre offset with it, so the root
   * stays put and the tip comes in; `sweep` turns the whole quad about
   * the root. Both ride one sine of sim time.
   */
  private pushWings(
    dyn: Batch,
    fp: FlyerParts,
    ux: number,
    uy: number,
    rot: number,
    time: number,
    seed: number,
    tint: readonly [number, number, number],
  ): void {
    const beat = 0.5 + 0.5 * Math.sin(time * fp.rate * Math.PI * 2 + seed);
    const span = 1 - fp.fold * beat;
    const sweep = fp.sweep * (beat - 0.5) * 2;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let side = -1; side <= 1; side += 2) {
      // the root, in the world: forward by rootY, out by rootX on this side
      const rx = ux + cr * fp.rootY - sr * fp.rootX * side;
      const ry = uy + sr * fp.rootY + cr * fp.rootX * side;
      // the wing's own heading: the body's, swept forward at the root
      const wr = rot - sweep * side;
      const cw = Math.cos(wr), sw = Math.sin(wr);
      const fwd = fp.wingY, out = fp.wingX * span * side;
      this.push(
        dyn, rx + cw * fwd - sw * out, ry + sw * fwd + cw * out,
        fp.wingSprite, fp.wingSprite * span * side, wr, fp.wing, tint[0], tint[1], tint[2], 1,
      );
    }
  }

  /**
   * The worm rig (SEGMENT_ART, Sim.usegX): the chain the sim dragged
   * behind the head, drawn from the tail forward so the head lands on top.
   * Each segment's quad sits on its chain point and faces the point ahead
   * of it; the swim is already in the chain (Sim.updateSegments), so
   * nothing is added here.
   */
  private pushSegments(
    dyn: Batch,
    art: SegmentArt,
    S: SegmentSpec,
    sim: SimView,
    i: number,
    tint: readonly [number, number, number],
    alpha: number,
    cell: CellArt | null,
    cellCol: RGB,
  ): void {
    const { usegX, usegY, upx, upy, urot } = sim;
    const n = S.count, off = i * MAX_SEGS;
    for (let k = n - 1; k >= 0; k--) {
      const sx = usegX[off + k], sy = usegY[off + k];
      const lx = k === 0 ? upx[i] : usegX[off + k - 1];
      const ly = k === 0 ? upy[i] : usegY[off + k - 1];
      const ang = Math.atan2(ly - sy, lx - sx);
      if (k === n - 1) {
        // the tail fin, past the last segment on its heading
        const back = S.spacing * 0.9;
        this.push(dyn, sx - Math.cos(ang) * back, sy - Math.sin(ang) * back, art.tailSprite, art.tailSprite, ang, art.tail, tint[0], tint[1], tint[2], alpha);
      }
      this.push(dyn, sx, sy, art.bodySprite, art.bodySprite, ang, art.body, tint[0], tint[1], tint[2], alpha);
    }
    this.push(dyn, upx[i], upy[i], art.headSprite, art.headSprite, urot[i], art.head, tint[0], tint[1], tint[2], alpha);
    if (cell) this.pushCell(dyn, cell, upx[i], upy[i], art.headSprite, urot[i], cellCol);
  }

  private pushEngines(
    dyn: Batch,
    ux: number,
    uy: number,
    rot: number,
    engines: readonly UnitEngine[],
    time: number,
    col: RGB,
  ): void {
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const ticks = time * 60;
    for (const en of engines) {
      // the unit's frame: y runs along the heading, x across it
      const ex = ux + cos * en.y - sin * en.x, ey = uy + sin * en.y + cos * en.x;
      const rad = en.radius + ABSIN(ticks, 2, en.radius / 4);
      this.fillCircle(dyn, ex, ey, rad, col, 1);
      // Angles.trns(rot + rotation, rad / 4), subtracted, with rot the
      // unit's heading less 90: an axial engine's -90 puts the disc
      // FORWARD of the flame, into the hull
      const a = rot - Math.PI / 2 + en.rotation;
      this.fillCircle(dyn, ex - Math.cos(a) * (rad / 4), ey - Math.sin(a) * (rad / 4), rad / 2, ENGINE_INNER, 1);
    }
  }

  /**
   * EnergyFieldAbility.draw: the orb over the hull — a disc of the field's
   * colour with a white core, both breathing on absin(20, 0.1) — and five
   * arc sectors turning just outside it. All of it sits ON THE HULL.
   *
   * UPSTREAM ALSO DRAWS FIVE SECTORS OUT AT THE FIELD'S RANGE, and they
   * are gone. The reach is twenty-two and a half tiles, so those five arcs
   * were a forty-five-tile circle standing on the board for as long as the
   * body had anything to shoot — which, on the unit whose whole job is to
   * stand in a lane full of turrets, is always. One was a diagram; a wave
   * of them was a screen of overlapping rings with a battle somewhere
   * underneath.
   *
   * NOTHING IS LOST BY DROPPING IT, because the field already draws its
   * own reach far better than a ring can: the pulse WALKS its targets
   * nearest to nearest (sim.ts, case "field"), so every second and a bit
   * the lightning traces the real edge of what this body can touch — the
   * actual twenty-five things, not the circle they might have been in.
   */
  private drawEnergyField(
    dyn: Batch,
    x: number,
    y: number,
    rot: number,
    col: RGB,
    time: number,
  ): void {
    const ticks = time * 60;
    const orb = 5 * MU * (1 + ABSIN(ticks, 20, 0.1));
    this.fillCircle(dyn, x, y, orb, col, 1);
    this.fillCircle(dyn, x, y, orb / 2, PAL.white, 1);
    const stroke = (0.7 + ABSIN(ticks, 20, 0.7)) * MU;
    const SECTORS = 5, SECTOR = 0.14, SPEED = (0.5 * Math.PI) / 180;
    for (let i = 0; i < SECTORS; i++) {
      const a = rot + (i * Math.PI * 2) / SECTORS - ticks * SPEED;
      this.strokeArc(dyn, x, y, orb + 3 * MU, a, SECTOR * Math.PI * 2, stroke, col, 1);
    }
  }

  /** Lines.arc: a `sweep`-wide slice of a ring, stroked at a constant width */
  private strokeArc(
    dyn: Batch,
    cx: number,
    cy: number,
    radius: number,
    from: number,
    sweep: number,
    stroke: number,
    col: RGB,
    a: number,
  ): void {
    if (radius <= 0.01 || stroke <= 0.01) return;
    const sides = Math.max(2, Math.ceil((11 + (radius / MU) * 0.6) * (sweep / (Math.PI * 2))));
    const step = sweep / sides;
    const chord = 2 * radius * Math.sin(step / 2) + stroke * 0.5;
    for (let i = 0; i < sides; i++) {
      const ang = from + (i + 0.5) * step;
      this.push(dyn, cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius, chord, stroke,
        ang + Math.PI / 2, UV_SOLID, col[0], col[1], col[2], a);
    }
  }

  /**
   * Fx.greenLaserCharge (starhart5, 80 ticks) and Fx.greenLaserChargeSmall
   * (starhart4, 40): a ring in the beam's colour closing in on the muzzle as
   * the charge fills — from 100 units, or 50 — and, on the big one, a
   * green disc swelling under a white one while twenty motes fall inward.
   */
  private drawGreenCharge(dyn: Batch, x: number, y: number, fin: number, small: boolean, col: RGB): void {
    const fout = 1 - fin;
    const stroke = fin * 2 * MU;
    if (small) {
      this.strokeCircle(dyn, x, y, fout * 50 * MU, stroke, col[0], col[1], col[2], 1);
      return;
    }
    this.strokeCircle(dyn, x, y, (4 + fout * 100) * MU, stroke, col[0], col[1], col[2], 1);
    this.fillCircle(dyn, x, y, fin * 20 * MU, col, 1);
    this.scatter(7, 20, 40 * fout * MU, 0, Math.PI, (dx, dy) => {
      this.fillCircle(dyn, x + dx, y + dy, fin * 5 * MU, col, 1);
    });
    this.fillCircle(dyn, x, y, fin * 10 * MU, PAL.white, 1);
  }

  /**
   * SapBulletType.draw, 1:1: Drawf.laser from the mount to the far end,
   * which starts on the target and lerps back onto the mount over the
   * bullet's life, at width x fout — the "laser" strip stretched along the
   * line at 12 x scale, inset 2 x scale at each end, and the "laser-end"
   * disc on both ends at 18 x scale, all in the sap's colour.
   */
  private drawSap(dyn: Batch, e: Effect, t: number): void {
    const st = SAP_STYLES[e.sides ?? 0] ?? SAP_STYLES[0];
    const col = e.col ?? st.color;
    const scale = st.width * (1 - t);
    if (scale <= 0.005) return;
    const rot = e.rot ?? 0;
    const reach = (e.len ?? 0) * (1 - t);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const x2 = e.x + cos * reach, y2 = e.y + sin * reach;
    const inset = 2 * scale * MU;
    const cap = 18 * scale * MU;
    if (reach > inset * 2)
      this.pushSeg(dyn, e.x + cos * inset, e.y + sin * inset, x2 - cos * inset, y2 - sin * inset,
        UV_LASER, 12 * scale * MU, col);
    this.push(dyn, e.x, e.y, cap, cap, rot + Math.PI, UV_LASER_END, col[0], col[1], col[2], 1);
    this.push(dyn, x2, y2, cap, cap, rot, UV_LASER_END, col[0], col[1], col[2], 1);
  }

  /**
   * Fx.chainLightning, 1:1: the jittered chain the sim built (fxPts),
   * stroked 2.5 units wide and fading, white washing into the field's
   * colour — no joint dots, unlike a bolt.
   */
  private drawChainLightning(dyn: Batch, e: Effect, t: number): void {
    const pts = e.pts;
    if (!pts || pts.length < 4) return;
    const stroke = 2.5 * MU * (1 - t);
    if (stroke <= 0.01) return;
    const col = ramp(PAL.white, e.col ?? PAL_HEAL, null, t);
    for (let i = 0; i + 3 < pts.length; i += 2)
      this.pushSeg(dyn, pts[i], pts[i + 1], pts[i + 2], pts[i + 3], UV_SOLID, stroke, col);
  }

  /**
   * Fx.sapExplosion, 1:1: blastExplosion's three passes in the sap purples
   * and thrown far wider — a sapBullet ring out to 80 units in the first
   * six of 25 ticks, nine grey cinders over 70 and eight sapBulletBack
   * sparks over 60.
   */
  private drawSapExplosion(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    const RING = 6 / 25;
    if (t < RING) {
      const s = t / RING;
      this.strokeCircle(dyn, e.x, e.y, (3 + s * 80) * MU, 3 * (1 - s) * MU,
        PAL.venom[0], PAL.venom[1], PAL.venom[2], RING_ALPHA);
    }
    const grit = (fout * 4 + 0.5) * MU;
    this.scatter(e.seed ?? 1, 9, (2 + 70 * FIN_POW(t)) * MU, 0, Math.PI, (x, y) => {
      this.fillCircle(dyn, e.x + x, e.y + y, grit, PAL.gray, 1);
    });
    const spark = (1 + fout * 3) * MU;
    this.scatter((e.seed ?? 1) + 1, 8, (1 + 60 * FIN_POW(t)) * MU, 0, Math.PI, (x, y, bearing) => {
      this.strokeLine(dyn, e.x + x, e.y + y, bearing, spark, fout * MU, PAL.venomDark, 1);
    });
  }

  /**
   * Fx.massiveExplosion, 1:1: the missile palette again, bigger and slower
   * — a ring to 34 units over seven of 30 ticks, eight cinders over 30,
   * six sparks over 29.
   */
  private drawMassiveExplosion(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    const RING = 7 / 30;
    if (t < RING) {
      const s = t / RING;
      this.strokeCircle(dyn, e.x, e.y, (4 + s * 30) * MU, 3 * (1 - s) * MU,
        PAL.missileYellow[0], PAL.missileYellow[1], PAL.missileYellow[2], RING_ALPHA);
    }
    const grit = (fout * 4 + 0.5) * MU;
    this.scatter(e.seed ?? 1, 8, (2 + 30 * FIN_POW(t)) * MU, 0, Math.PI, (x, y) => {
      this.fillCircle(dyn, e.x + x, e.y + y, grit, PAL.gray, 1);
    });
    const spark = (1 + fout * 4) * MU;
    this.scatter((e.seed ?? 1) + 1, 6, (1 + 29 * FIN_POW(t)) * MU, 0, Math.PI, (x, y, bearing) => {
      this.strokeLine(dyn, e.x + x, e.y + y, bearing, spark, fout * MU, PAL.missileYellowBack, 1);
    });
  }

  /**
   * ExplosionEffect, 1:1, off its style: a wave in waveColor over waveLife
   * ticks from waveRadBase out by waveRad, `smokes` cinders in smokeColor
   * over smokeRad, `sparks` bars in sparkColor over sparkRad.
   */
  private drawExplosion(dyn: Batch, e: Effect, t: number, S: (typeof EXPLOSION_STYLES)[number]): void {
    const fout = 1 - t;
    const life = S.lifetime * 60;
    const RING = S.waveLife / life;
    if (t < RING) {
      const s = t / RING;
      this.strokeCircle(dyn, e.x, e.y, (S.waveRadBase + s * S.waveRad) * MU, S.waveStroke * (1 - s) * MU,
        S.waveColor[0], S.waveColor[1], S.waveColor[2], RING_ALPHA);
    }
    if (S.smokeSize > 0) {
      const grit = (fout * S.smokeSize + S.smokeSizeBase) * MU;
      this.scatter(e.seed ?? 1, S.smokes, (2 + S.smokeRad * FIN_POW(t)) * MU, 0, Math.PI, (x, y) => {
        this.fillCircle(dyn, e.x + x, e.y + y, grit, S.smokeColor, 1);
      });
    }
    const spark = (1 + fout * S.sparkLen) * MU;
    this.scatter((e.seed ?? 1) + 1, S.sparks, (1 + S.sparkRad * FIN_POW(t)) * MU, 0, Math.PI, (x, y, bearing) => {
      this.strokeLine(dyn, e.x + x, e.y + y, bearing, spark, fout * S.sparkStroke * MU, S.sparkColor, 1);
    });
  }

  /**
   * Fx.railShoot, 1:1: a white-to-lightGray ring out to 50 units over the
   * first ten of 24 ticks, and two orangeSpark blades 85 units long thrown
   * square to the shot, thinning as it goes.
   */
  private drawRailShoot(dyn: Batch, e: Effect, t: number): void {
    const col = e.col ?? PAL.orangeSpark;
    const fout = 1 - t;
    // THE HARPOON: a hair-thin line the whole length of the shot (e.len),
    // white at birth and thinning to nothing, and a small ring at the
    // muzzle. `sides` is 1 on a heavy tier's rail, which is drawn a touch
    // wider; the mass tiers' are a thread. Mindustry's railShoot threw
    // two 85-unit wings and a 50-unit ring off the muzzle — on a fleet
    // that fires by the thousand that was the thickest thing on the field
    const big = (e.sides ?? 0) > 0;
    if (e.len && e.len > 0.01) {
      const w = ((big ? 1.1 : 0.7) * fout + 0.25) * MU;
      const c = ramp(PAL.white, col, null, Math.min(1, t * 2));
      this.strokeLine(dyn, e.x, e.y, e.rot ?? 0, e.len, w, c, 0.35 + fout * 0.65);
    }
    // the muzzle ring is the heavy tiers' alone: a stroked circle is a
    // dozen quads, and the mass tiers fire by the thousand
    const RING = 8 / 16;
    if (big && t < RING) {
      const s = t / RING;
      this.strokeCircle(dyn, e.x, e.y, s * (big ? 9 : 5) * MU, ((1 - s) * 1 + 0.2) * MU, col[0], col[1], col[2], RING_ALPHA);
    }
  }

  /**
   * The emp round's hitEffect, 1:1: a heal disc filling the whole splash
   * radius for the first seven of 50 ticks, a ring at the radius stroked
   * 3 x fout, ten spikes 50 units long standing on its rim at a seeded
   * roll, and a heal flash with a white core at the centre.
   */
  private drawEmpHit(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    const rad = e.len ?? 100 * MU;
    const col = e.col ?? PAL_HEAL;
    const FLASH = 7 / 50;
    if (t < FLASH) this.fillDisc(dyn, e.x, e.y, rad, col, (1 - t / FLASH) * 0.6);
    this.strokeCircle(dyn, e.x, e.y, rad, fout * 3 * MU, col[0], col[1], col[2], 1);
    const POINTS = 10;
    rngSeed(e.seed ?? 1);
    const offset = rng() * Math.PI * 2;
    for (let i = 0; i < POINTS; i++) {
      const a = (i * Math.PI * 2) / POINTS + offset;
      this.tri(dyn, e.x + Math.cos(a) * rad, e.y + Math.sin(a) * rad, 6 * MU, 50 * fout * MU, a, col, 1);
    }
    this.fillCircle(dyn, e.x, e.y, 12 * fout * MU, col, 1);
    this.fillCircle(dyn, e.x, e.y, 6 * fout * MU, PAL.white, 1);
  }
}
