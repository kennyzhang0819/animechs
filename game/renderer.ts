import {
  LEG_ART,
  MECH_ART,
  type LegArt,
  type LegGun,
  type MechArt,
  UNIT_ART,
  UV_SOLID,
  UV_CORE,
  UV_DECOR,
  UV_FLOORS,
  UV_PINE,
  UV_RING,
  UV_FUSE,
  UV_HEX,
  UV_SCATTER,
  UV_FLOOR_EDGES,
  UV_BULLET,
  UV_BULLET_BACK,
  UV_SHELL,
  UV_SHELL_BACK,
  UV_MISSILE,
  UV_MISSILE_BACK,
  UV_HAIL,
  UV_DISC,
  UV_DUO,
  UV_TOWER_BASE,
  UV_TOWER_BASE1,
  UV_TOWER_BASE3,
  UV_TOWER_BASE4,
  UV_SCORCH,
  UV_ARC,
  UV_LANCER,
  UV_RIPPLE,
  UV_WAVE,
  UV_PARALLAX,
  UV_TSUNAMI,
  UV_SWARMER,
  UV_CYCLONE,
  UV_SPECTRE,
  UV_MELTDOWN,
  UV_FORESHADOW,
  UV_PARALLAX_LASER,
  UV_PARALLAX_LASER_END,
  UV_TRI,
  UV_TURRET,
  UV_WALLS,
  UV_WALL_LARGE,
  WALL_GROUP,
  type UVRect,
} from "./atlas";
import {
  BASE,
  bulletOf as bulletOf_IMPORT,
  CELL as CELL_IMPORT,
  clamp as clamp_IMPORT,
  COLS as COLS_IMPORT,
  FX_LIFE,
  H as H_IMPORT,
  HP_TINT as HP_TINT_IMPORT,
  LANCER_CHARGE_SPARK,
  MAX_UNITS,
  NCELLS,
  PAL as PAL_IMPORT,
  ROWS as ROWS_IMPORT,
  SHRAPNEL,
  TOWERS as TOWERS_IMPORT,
  W as W_IMPORT,
} from "./constants";

// Module-local bindings for what the per-frame batch build reads per unit,
// projectile and effect: an imported binding is a getter call under
// CommonJS interop (dev server), and this file reads these thousands of
// times a frame. A module-local const is a plain read.
const bulletOf = bulletOf_IMPORT;
const CELL = CELL_IMPORT;
const clamp = clamp_IMPORT;
const COLS = COLS_IMPORT;
const H = H_IMPORT;
const HP_TINT = HP_TINT_IMPORT;
const PAL = PAL_IMPORT;
const ROWS = ROWS_IMPORT;
const TOWERS = TOWERS_IMPORT;
const W = W_IMPORT;
import { UNIT_KINDS, UNIT_STATS, type ForceFieldSpec, type LegSpec } from "./levels";
import { MAX_LEGS, type Sim } from "./sim";
import { WALL_PINE, type Terrain } from "./terrain";
import { FxKind, type Effect, type RGB, type Tower, type TowerKind } from "./types";

// per-kind turret tops and bullet sprites
const UV_TURRETS: Record<TowerKind, UVRect> = {
  duo: UV_DUO,
  hail: UV_HAIL,
  salvo: UV_TURRET,
  scatter: UV_SCATTER,
  fuse: UV_FUSE,
  scorch: UV_SCORCH,
  arc: UV_ARC,
  lancer: UV_LANCER,
  ripple: UV_RIPPLE,
  wave: UV_WAVE,
  parallax: UV_PARALLAX,
  tsunami: UV_TSUNAMI,
  swarmer: UV_SWARMER,
  cyclone: UV_CYCLONE,
  spectre: UV_SPECTRE,
  meltdown: UV_MELTDOWN,
  foreshadow: UV_FORESHADOW,
};
/**
 * The two regions BasicBulletType.draw lays on one rect: the longer `-back`
 * first, then the core over it. Which pair a shot uses is ammo data
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
/** Pal.heal #98ffa9 */
const PAL_HEAL = [0x98 / 255, 0xff / 255, 0xa9 / 255] as const;
/**
 * Mindustry's Floor.mapColor — what the sprite packer sets to the average
 * colour of a floor's own texture, and the tint every walk and landing
 * effect is fired in. These are those averages, measured off the very PNGs
 * the atlas is packed from, one per floor GROUP (UV_FLOORS carries three
 * variants of each, and they average alike).
 */
const FLOOR_DUST: readonly RGB[] = [
  [0x6e / 255, 0xab / 255, 0x5e / 255], // grass
  [0x56 / 255, 0x56 / 255, 0x5c / 255], // stone
  [0x67 / 255, 0x40 / 255, 0x36 / 255], // dirt
  [0xd8 / 255, 0xb2 / 255, 0x90 / 255], // sand
  [0x3f / 255, 0x3c / 255, 0x3c / 255], // darksand
];
/** Pal.lancerLaser #a9d8ff — arc's bolt and lancer's beam are both drawn
 * in it, and both wash out to white as they fade */
const PAL_LANCER = PAL.lancerLaser;
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
 * ticks. Meltdown is the only thing that uses it, twice — once on the
 * colour and once on the width, at slightly different rates so the beam
 * never settles into one look.
 */
const ABSIN = (x: number, scl: number, mag: number): number =>
  (Math.sin(x / (scl * 2)) * mag + mag) / 2;
/**
 * ContinuousLaserBulletType.colors, r/g/b/a. The two washes carry their
 * alpha in the hex (0x55 and 0xaa) — they are meant to be seen THROUGH,
 * which is what layers the beam rather than stacking four bars.
 */
const CL_COLORS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0xec / 255, 0x74 / 255, 0x58 / 255, 0x55 / 255],
  [0xec / 255, 0x74 / 255, 0x58 / 255, 0xaa / 255],
  [0xff / 255, 0x9c / 255, 0x5a / 255, 1],
  [1, 1, 1, 1],
];
/** its backLength and frontLength, the two flame fronts' reach */
const CL_BACK = 7 * (CELL / 8);
const CL_FRONT = 35 * (CELL / 8);
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
 * Pal.shield #ffd37f — the warm amber Mindustry uses for friendly shields
 * (force projectors and the like). UnitType.shieldColor defaults to the
 * OWNING team's colour, which for the crux enemy is a red that this game's
 * low-hp unit tint already owns; the amber keeps "shielded" and "nearly
 * dead" telling apart at a glance.
 */
const SHIELD_COL = [0xff / 255, 0xd3 / 255, 0x7f / 255] as const;
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
 */
const SHIELD_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec4 uCam;    // camera x, y, w, h in Mindustry world units
uniform vec2 uInv;    // 1 / (w, h): a UV step of one world unit
uniform float uTime;  // Mindustry ticks
uniform float uDp;
in vec2 vUV;
out vec4 o;
const float ALPHA = 0.18;
const float EDGE = 2.0;
void main() {
  vec2 T = vUV;
  vec2 coords = vec2(T.x * uCam.z + uCam.x, (1.0 - T.y) * uCam.w + uCam.y);
  T += vec2(sin(coords.y / 3.0 + uTime / 20.0), sin(coords.x / 3.0 + uTime / 20.0)) * uInv;
  vec4 color = texture(uTex, T);
  vec4 maxed = max(max(max(
    texture(uTex, T + vec2(0.0, EDGE) * uInv),
    texture(uTex, T + vec2(0.0, -EDGE) * uInv)),
    texture(uTex, T + vec2(EDGE, 0.0) * uInv)),
    texture(uTex, T + vec2(-EDGE, 0.0) * uInv));
  if (color.a < 0.9 && maxed.a > 0.9) {
    // maxed.a * 100 saturates: the rim is drawn at full opacity
    o = vec4(maxed.rgb, 1.0);
  } else if (color.a > 0.0) {
    vec3 rgb = color.rgb;
    if (mod(coords.x / uDp + coords.y / uDp
          + sin(coords.x / uDp / 5.0) * 3.0
          + sin(coords.y / uDp / 5.0) * 3.0
          + uTime / 4.0, 10.0) < 2.0) rgb *= 1.65;
    o = vec4(rgb * ALPHA, ALPHA);
  } else {
    o = vec4(0.0);
  }
}`;

/** Shaders.ShieldShader's u_dp, Scl.scl(1) — the UI scale, 1 at 1x */
const SHIELD_DP = 1;
/**
 * The scene's clear colour, #0B0B0B — the void the map sits in, and what
 * the shield pass has to hand back after borrowing the clear for its own
 * buffer.
 *
 * Neutral on purpose. This used to be a navy #0A101F, which read as sky
 * behind the map rather than as nothing: the moment the camera could pull
 * back past the edges (see Game.minZoom) the map looked like it was
 * floating on water. Grey-black is the absence of a colour, which is what
 * is meant to be out there.
 */
const CLEAR = [0.043, 0.043, 0.043] as const;
/**
 * The same colour as CSS `r,g,b` components. begin() clears the whole
 * canvas to it, so everything outside the map's rectangle already IS this
 * colour — which is what lets the edge haze (Game.drawHaze) land on the
 * void seamlessly instead of ending on a visible seam.
 */
export const VOID_RGB = CLEAR.map((v) => Math.round(v * 255)).join(",");
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
// the legged pair (atrax, spiroct): part art and the gait that moves it
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
// floor blend priority by group id (grass, stone, dirt, sand, darksand):
// Blocks.java definition order — stone < sand < darksand < dirt < grass,
// higher fades over lower
const GROUP_PRI = [4, 0, 3, 1, 2] as const;
// overlaying groups in ascending priority. Stone never overlays (lowest),
// and sand's only inferior — stone floor — shares no map with it yet, so
// its edge art isn't baked either
const EDGE_ORDER = [4, 2, 0] as const;
// wall shadow strength: BlockRenderer.shadowColor is black at 0.71 — the
// premultiplied blend of a black quad at this alpha equals its multiply
const WALL_SHADOW_A = 0.71;
/** which terrain layers the static batches draw; the editor hides one to
 * work on what sits underneath it */
export interface TerrainLayers {
  wall: boolean;
  props: boolean;
  spawn: boolean;
  goal: boolean;
  core: boolean;
}
export const ALL_LAYERS: TerrainLayers = {
  wall: true,
  props: true,
  spawn: true,
  goal: true,
  core: true,
};

// flyer drop shadow: painter's offset + premultiplied black tint
const SHADOW_OFF = 6;
const SHADOW_ALPHA = 0.22;

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
  return Math.max(KIND_SPRITE[i], legReach, halo) + SHADOW_OFF + 8;
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
  vTint = aTint;
}`;

const FS = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
in vec2 vUV;
in vec4 vTint;
out vec4 o;
void main() {
  o = texture(uTex, vUV) * vec4(vTint.rgb * vTint.a, vTint.a);
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
 * WebGL2 instanced sprite renderer. Two draw calls per frame: a static
 * terrain batch and one dynamic batch (towers, units, projectiles, effects)
 * in painter's order.
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
  // walls (and props) draw in their own batch so the shadow quad can slot
  // between floors and walls with a different texture bound
  private readonly walls: Batch;
  private readonly shadow: Batch;
  // the wall-shadow mask: COLS x ROWS texels, LINEAR-filtered — bilinear
  // magnification is what melts the per-tile mask into a soft rim, so it
  // cannot live in the NEAREST-filtered sprite atlas
  private readonly shadowTex: WebGLTexture;
  private readonly dyn: Batch;
  /**
   * the force-field fills for this frame. They never reach the screen
   * directly — they are drawn into the shield buffer and blitted through
   * SHIELD_FS, which is what merges overlapping bubbles into one shape
   */
  private readonly shields: Batch;
  private readonly shieldProg: WebGLProgram;
  private readonly uShieldCam: WebGLUniformLocation;
  private readonly uShieldInv: WebGLUniformLocation;
  private readonly uShieldTime: WebGLUniformLocation;
  private readonly uShieldDp: WebGLUniformLocation;
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
  // the core of the terrain currently in the static batches; renderTerrain
  // (the editor) has no sim to ask, so rebuildTerrain leaves it here
  private core = { ...BASE };
  // a goal-layer map routes the swarm to painted exit cells and has no core
  // to defend, so it draws none — the sprite would otherwise sit in the
  // middle of the exit band promising something the map does not have
  private hasGoals = false;
  // layer visibility of whatever is currently in the static batches, so the
  // editor's core sprite (drawn per frame) matches the terrain it sits on
  private layers: TerrainLayers = ALL_LAYERS;

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
    // wall tiles + (editor) spawn overlays + decor/pine props
    this.walls = this.makeBatch(NCELLS * 2 + 2048);
    this.shadow = this.makeBatch(4);
    // a swarm budget, not a worst case: 12 quads is a walking mech with one
    // mirrored gun drawn twice (silhouette rim under, art over), which is
    // what MAX_UNITS of anything is ever actually made of. The heavies cost
    // more — a scepter's three mounts make 20, a six-legged spiroct closer
    // to 50 — and a field that was somehow ALL heavies would run this dry;
    // they arrive in tens, among thousands of the cheap kinds that do not
    this.dyn = this.makeBatch(MAX_UNITS * 12 + 2048);
    // one quad per hexagonal bubble; a polygon of any other side count
    // takes one per side, so this holds a wave's worth either way
    this.shields = this.makeBatch(2048);

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
    gl.clearColor(CLEAR[0], CLEAR[1], CLEAR[2], 1); // #0B0B0B
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
  ): void {
    const s = m.sprite;
    // Mindustry walkExtend: a 4-stride cycle — triangle wave for the leg
    // reach, quarter-phase sine for lift and sway
    const raw = walk % (m.stride * 4);
    const ext = raw > m.stride * 3 ? raw - m.stride * 4 : raw > m.stride ? m.stride * 2 - raw : raw;
    const lift = Math.sin(((raw / m.stride) * Math.PI) / 2);
    const cb = Math.cos(brot), sb = Math.sin(brot);
    // stride sway shifts everything above the chassis (guns + body only)
    const sway = lift * (m.sideSway ?? SIDE_SWAY);
    const fsway = Math.sin((raw / m.stride) * Math.PI) * (m.frontSway ?? FRONT_SWAY);
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
      const dk = 1 - Math.max(0, (side * ext) / m.stride) * LEG_SHADE;
      part(
        m.leg,
        m.sil.leg,
        x + cb * ext * side,
        y + sb * ext * side,
        s * (1 - Math.max(-lift * side, 0) * 0.5),
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
    sim: Sim,
    i: number,
    tint: readonly [number, number, number],
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
          // out positive. arkyid's -15 is a +15 offset in the real game
          const dx = jx - fx, dy = jy - fy;
          const d = Math.hypot(dx, dy) || 1;
          const ext = Math.abs(L.extension);
          const ex = (dx / d) * ext, ey = (dy / d) * ext;
          this.pushSeg(b, jx + ex, jy + ey, fx, fy, art.legBase, art.legBaseStroke * flip, tint);
        }
        // the knee cap is never rotated — Mindustry draws it upright. Not
        // every legged unit has one: arkyid leaves its elbow as the bare
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
      for (const g of art.guns) if (g.top) gun(g);
    }
  }

  /**
   * One leg segment: the region stretched between two points, as wide as
   * `stroke` across (Mindustry Lines.line). A negative stroke mirrors the
   * art, which is how the two sides of the body share one sprite.
   */
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
   * Drop zones are NOT painted here, in the editor or in the game: a tinted
   * pad hides the floor an author is trying to see, and the zone's real
   * shape is already drawn as its circle in the editor overlay. `layers`
   * still gates the zones' reachability there — see MapEditor.drawOverlay.
   */
  rebuildTerrain(src: { terrain: Terrain }, layers: TerrainLayers = ALL_LAYERS): void {
    const gl = this.gl;
    const t = this.terrain;
    const T = src.terrain;
    this.core = T.core;
    this.hasGoals = T.goal.some((g) => g !== 0);
    this.layers = layers;
    t.n = 0;
    // does this cell show its floor (rather than a wall sprite)? pine cells
    // (and tower cells, which aren't in terrain.blocked at all) get their
    // floor painted; props draw over it below. With the wall layer hidden
    // EVERY cell shows its floor — that is what lets the editor paint the
    // ground a hill is standing on
    const showsFloor = (j: number): boolean =>
      !layers.wall || !T.blocked[j] || T.wall[j] === WALL_PINE;
    // pass 1: floors, with Floor.drawEdges fades — a neighboring floor of
    // higher blend priority overlays its edge sub-cell for that direction.
    // Lower-priority groups overlay first, like the blenders id sort
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        if (!showsFloor(i)) continue;
        const cx = (x + 0.5) * CELL, cy = (y + 0.5) * CELL;
        this.push(t, cx, cy, CELL, CELL, 0, UV_FLOORS[T.floor[i]], 1, 1, 1, 1);
        const pri = GROUP_PRI[(T.floor[i] / 3) | 0];
        for (const og of EDGE_ORDER) {
          if (GROUP_PRI[og] <= pri) continue;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= ROWS) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= COLS || (dx === 0 && dy === 0)) continue;
              const j = ny * COLS + nx;
              if (!showsFloor(j) || ((T.floor[j] / 3) | 0) !== og) continue;
              this.push(t, cx, cy, CELL, CELL, 0, UV_FLOOR_EDGES[og][1 - dy][1 - dx], 1, 1, 1, 1);
            }
          }
        }
      }
    }

    // pass 2: the wall shadow. Every blocked cell is one opaque texel in a
    // COLS x ROWS mask on its own LINEAR-filtered texture; one map-covering
    // quad stretches it 20x, and bilinear magnification melts the texels
    // into the soft rim on adjacent floors (BlockRenderer's shadow buffer,
    // 1px per tile). Walls draw after this quad, so the hills themselves
    // stay clean and only the floor around them darkens
    const mask = new Uint8Array(COLS * ROWS * 4);
    const stamp = (i: number): void => {
      mask[i * 4] = mask[i * 4 + 1] = mask[i * 4 + 2] = mask[i * 4 + 3] = 255;
    };
    if (layers.wall) for (let i = 0; i < COLS * ROWS; i++) if (T.blocked[i]) stamp(i);
    // buildings on the ground stamp their footprint too, like Mindustry's
    // displayShadow blocks — the core sprite covers the middle, so what
    // shows is the rim hugging its sides. Towers sit on hills (already
    // fully stamped as blocked cells), so they need nothing extra
    if (layers.core && !this.hasGoals)
      for (let y = T.core.y; y < T.core.y + T.core.size; y++)
        for (let x = T.core.x; x < T.core.x + T.core.size; x++) stamp(y * COLS + x);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, COLS, ROWS, 0, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    const sh = this.shadow;
    sh.n = 0;
    this.push(sh, W / 2, H / 2, W, H, 0, [0, 0, 1, 1], 0, 0, 0, WALL_SHADOW_A);

    // pass 3: wall sprites over their (shadow-darkened) cells, then the
    // editor's spawn overlay and the props
    const w = this.walls;
    w.n = 0;
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
    if (layers.wall) for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
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
      for (const d of T.decor)
        this.push(w, d.x, d.y, d.size, d.size, d.rot, UV_DECOR[d.kind], 1, 1, 1, 1);
      for (const p of T.pines)
        this.push(w, p.x, p.y, p.size, p.size, p.rot, UV_PINE, 1, 1, 1, 1);
    }
    for (const b of [t, sh, w]) {
      gl.bindVertexArray(b.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data, 0, b.n * FLOATS);
    }
  }

  /** floors, then the shadow rim on its own texture, then walls and props */
  private drawWorld(): void {
    const gl = this.gl;
    this.draw(this.terrain, false);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    this.draw(this.shadow, false);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    this.draw(this.walls, false);
  }

  /** per-frame GL setup shared by the game and terrain-only render paths */
  private begin(zoom: number, offX: number, offY: number, kPx: number): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniform2f(this.uRes, this.canvas.width / kPx, this.canvas.height / kPx);
    gl.uniform1f(this.uZoom, zoom);
    gl.uniform2f(this.uOff, offX, offY);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }

  /** terrain + core only — the map editor's frame, no sim required */
  renderTerrain(zoom = 1, offX = 0, offY = 0, kPx = this.canvas.width / W): void {
    this.begin(zoom, offX, offY, kPx);
    this.drawWorld();
    const dyn = this.dyn;
    dyn.n = 0;
    // the core of the map last built into the terrain batch (see
    // rebuildTerrain) — a map may put it anywhere, not just at BASE
    const core = this.core;
    if (!this.layers.core || this.hasGoals) {
      this.draw(dyn, true);
      return;
    }
    const coreSz = core.size * CELL;
    this.push(
      dyn,
      (core.x + core.size / 2) * CELL,
      (core.y + core.size / 2) * CELL,
      coreSz,
      coreSz,
      0,
      UV_CORE,
      1, 1, 1, 1,
    );
    this.draw(dyn, true);
  }

  /**
   * zoom is world→view scale; (offX, offY) = -cameraTopLeft * zoom; kPx is
   * device px per world px at zoom 1, so the view spans canvas/kPx world px
   * and the canvas is always filled whatever its aspect
   */
  render(sim: Sim, zoom = 1, offX = 0, offY = 0, kPx = this.canvas.width / W): void {
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
    // settled before the fills are gathered, because it decides what they
    // ARE: solid shapes for the shader to work on, or the finished
    // no-shader drawing
    const buffered = this.ensureShieldTarget(this.canvas.width, this.canvas.height);
    this.drawForceFields(sim, buffered);
    for (const t of sim.towers) {
      const sz = TOWERS[t.kind].size;
      const px = sz * CELL;
      if (t.x < vx0 - px || t.x > vx1 + px || t.y < vy0 - px || t.y > vy1 + px) continue;
      const base =
        sz >= 4 ? UV_TOWER_BASE4
        : sz === 3 ? UV_TOWER_BASE3
        : sz === 2 ? UV_TOWER_BASE
        : UV_TOWER_BASE1;
      this.push(dyn, t.x, t.y, px, px, 0, base, 1, 1, 1, 1);
      this.push(dyn, t.x, t.y, px, px, t.angle, UV_TURRETS[t.kind], 1, 1, 1, 1);
    }
    // a tractor turret's beam sits over the turrets and under the units it
    // is dragging — it has no bullet, so this is its only visual
    for (const t of sim.towers) {
      if (t.beamStr > 0.01) this.drawTractorBeam(dyn, t);
      if (t.beamT >= 0) this.drawContinuousBeam(dyn, t);
    }
    const { upx, upy, uhp, uhpmax, ukind, uwalk, ubrot, urot, n } = sim;
    const { ushield, ushieldAlpha, urad, uwet } = sim;
    // painter's order in three passes: ground units, then flyer shadows on
    // top of the crowd, then the flyers themselves above everything
    for (let pass = 0; pass < 3; pass++) {
      const wantFly = pass > 0;
      for (let i = 0; i < n; i++) {
        const k = ukind[i];
        if (KIND_FLYING[k] !== wantFly) continue;
        const cm = KIND_CULL[k];
        if (upx[i] < vx0 - cm || upx[i] > vx1 + cm || upy[i] < vy0 - cm || upy[i] > vy1 + cm)
          continue;
        const usz = KIND_SPRITE[k];
        if (pass === 1) {
          this.push(dyn, upx[i] + SHADOW_OFF, upy[i] + SHADOW_OFF, usz, usz, urot[i], KIND_UV[k], 0, 0, 0, SHADOW_ALPHA);
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
          this.push(dyn, upx[i], upy[i], sr, sr, 0, UV_RING,
            SHIELD_COL[0], SHIELD_COL[1], SHIELD_COL[2],
            0.7 * (0.3 + 0.7 * ushieldAlpha[i]));
        }
        // hp thirds of the unit's own max, so every kind tints alike —
        // read off the water-multiplied rows while the unit is wet
        const t3 = (uhp[i] * 3) / uhpmax[i];
        const tint = (uwet[i] > 0 ? WET_TINT : HP_TINT)[t3 <= 1 ? 0 : t3 <= 2 ? 1 : 2];
        const legArt = KIND_LEG[k], gait = KIND_GAIT[k];
        const mech = KIND_MECH[k];
        if (legArt && gait) {
          this.pushLegs(dyn, legArt, gait, sim, i, tint);
        } else if (mech) {
          this.pushMech(dyn, mech, upx[i], upy[i], urot[i], ubrot[i], uwalk[i], tint);
        } else {
          // a flyer is one flat quad on the heading the sim turned it to.
          // That is its own UnitType.rotateSpeed, not its velocity: the
          // stock 5 deg/tick is close enough to instant that the light
          // flyers read as banking with their drift, while antumbra's 1.9
          // visibly swings the hull round after the course change
          this.push(dyn, upx[i], upy[i], usz, usz, urot[i], KIND_UV[k], tint[0], tint[1], tint[2], 1);
        }
      }
    }
    // Layer.bullet - 0.01: an artillery shell's trail is laid UNDER the
    // shells, so a volley's puffs never sit on top of the shot that made
    // them. It is the only effect below that line, which is why it takes a
    // pass of its own rather than a place in the loop after this one
    const {
      fxN, fxX, fxY, fxAge, fxTtl, fxKind, fxRot, fxLen, fxSeed, fxSides,
      fxUnit, fxHasCol, fxColR, fxColG, fxColB, fxPts,
    } = sim;
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
      const b = bulletOf(p.kind, p.frag);
      // LiquidBulletType.draw: a water orb is not a sprite pair but a
      // filled disc of the liquid's own colour — Fill.circle(x, y,
      // orbSize). (The fout()/100 lerp toward white is a 1% shade and is
      // dropped.)
      if (b.orb) {
        this.fillCircle(dyn, p.x, p.y, b.orb, b.fxColor ?? PAL.white, 1);
        continue;
      }
      // a bare BulletType has no sprite at all — scorch's flame lives
      // entirely in its shoot and hit effects. A shot thrown by a frag
      // burst carries the CHILD ammo's sprite, not the shell's
      const sp = b.sprite;
      if (!sp) continue;
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
    for (let f = 0; f < fxN; f++) {
      const kind = fxKind[f] as FxKind;
      const ex = fxX[f], ey = fxY[f];
      // cull: an anchor further out than the effect's reach draws nothing.
      // The line-shaped kinds carry their reach as data — a beam's length
      // in its len lane, a bolt's whole path in fxPts — so they widen
      // their own margin; everything else fits inside the flat pad
      if (kind === FxKind.Lightning) {
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
          kind === FxKind.HealWave || kind === FxKind.ShieldBreak
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
        const s = 7 + t * 22;
        this.push(dyn, e.x, e.y, s, s, 0, UV_RING, 1, 0.54, 0.24, (1 - t) * 0.9);
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
        // greying and thinning as it goes
        const col = ramp(PAL.white, PAL.lightGray, null, t);
        this.strokeCircle(dyn, e.x, e.y, t * 22 * MU, ((1 - t) * 2 + 0.2) * MU,
          col[0], col[1], col[2], RING_ALPHA);
      } else if (e.kind === FxKind.SparkShoot) {
        this.drawSparkShoot(dyn, e, t);
      } else if (e.kind === FxKind.HitLancer) {
        this.drawHitLancer(dyn, e, t);
      } else if (e.kind === FxKind.LancerShoot) {
        // Fx.lancerLaserShoot: two blue wings thrown off the muzzle,
        // square to the shot rather than along it
        const w = 4 * (1 - t) * MU;
        for (const side of [-1, 1])
          this.tri(dyn, e.x, e.y, w, 29 * MU, (e.rot ?? 0) + (side * Math.PI) / 2, PAL_LANCER, 1);
      } else if (e.kind === FxKind.LancerCharge) {
        this.drawLancerCharge(dyn, e, t);
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
        this.strokeCircle(dyn, e.x, e.y, 4 * MU + FIN_POW(t) * grow, (1 - t) * 2 * MU,
          heal ? PAL_HEAL[0] : SHIELD_COL[0],
          heal ? PAL_HEAL[1] : SHIELD_COL[1],
          heal ? PAL_HEAL[2] : SHIELD_COL[2],
          (heal ? 1 : 0.7) * RING_ALPHA);
      } else if (e.kind === FxKind.Shrapnel) {
        this.drawShrapnel(dyn, e.x, e.y, e.rot ?? 0, e.len ?? 0, t);
      } else if (e.kind === FxKind.Flame) {
        this.drawShootFlame(dyn, e, t);
      } else if (e.kind === FxKind.FlameHit) {
        this.drawHitFlame(dyn, e, t);
      } else if (e.kind === FxKind.Burning) {
        this.drawBurning(dyn, e, t);
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
      } else if (e.kind === FxKind.HitLiquid) {
        // Fx.hitLiquid: five droplets scattering off the landing inside a
        // 60-degree cone — the length runs on fin, not finpow, so the
        // splash leaves at full speed instead of easing out
        const rad = (1 - t) * 2 * MU;
        this.scatter(e.seed ?? 1, 5, (1 + t * 15) * MU, e.rot ?? 0, SPREAD_60, (x, y) => {
          this.fillCircle(dyn, e.x + x, e.y + y, rad, e.col ?? PAL.water, 1);
        });
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
        // Fx.railHit: two coppery spikes thrown back off a body the rail
        // punched through, 140 degrees off the line it is still travelling
        for (const side of [-1, 1])
          this.tri(dyn, e.x, e.y, 10 * (1 - t) * MU, 60 * MU,
            (e.rot ?? 0) + (side * 140 * Math.PI) / 180, PAL.orangeSpark, 1);
      } else if (e.kind === FxKind.SmokeCloud) {
        this.drawSmokeCloud(dyn, e, t);
      } else if (e.kind === FxKind.HitMeltdown) {
        // Fx.hitMeltdown: six bars flicking off whatever the beam is
        // resting on, in the beam's own hot orange
        const bar = ((1 - t) * 4 + 1) * MU;
        this.scatter(e.seed ?? 1, 6, FIN_POW(t) * 18 * MU, 0, Math.PI, (x, y, bearing) => {
          this.strokeLine(dyn, e.x + x, e.y + y, bearing, bar, (1 - t) * 2 * MU,
            PAL.meltdownHit, 1);
        });
      } else if (e.kind === FxKind.UnitSpawn) {
        this.drawUnitSpawn(dyn, e, t);
      } else if (e.kind === FxKind.Spawn) {
        // Fx.spawn: an accent square snapping out where a unit finished
        // arriving — vertices on the axes, like Arc's Lines.poly at zero
        this.strokePoly(dyn, e.x, e.y, 4, (5 + t * 12) * MU, 0,
          2 * (1 - t) * MU, PAL.accent, RING_ALPHA);
      } else if (e.kind === FxKind.SmokeBig2) {
        // Fx.shootBigSmoke2: shootBigSmoke's cloud, but nine motes over
        // 23 units instead of eight over 19 — meltdown lights up wide
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
        // Fx.shieldBreak: stroke(fout*3), poly(sides, radius + fin) — the
        // outline snapping outward as the bubble pops
        this.strokePoly(dyn, e.x, e.y, e.sides ?? 6, (e.len ?? 0) + FIN_POW(t) * MU,
          e.rot ?? 0, (1 - t) * 3 * MU, SHIELD_COL, RING_ALPHA);
      } else {
        const s = 9 + t * 30;
        this.push(dyn, e.x, e.y, s, s, 0, UV_RING, 0.34, 0.89, 0.54, (1 - t) * 0.9);
      }
    }
    // core last, above units and breach fx — arrivals disappear beneath it.
    // A goal-layer map draws none: its exits are the map edge, and there is
    // no building there to swallow anything
    if (!this.hasGoals) {
      const core = sim.terrain.core;
      const coreSz = core.size * CELL;
      this.push(
        dyn,
        (core.x + core.size / 2) * CELL,
        (core.y + core.size / 2) * CELL,
        coreSz,
        coreSz,
        0,
        UV_CORE,
        1, 1, 1, 1,
      );
    }
    this.draw(dyn, true);
    // Layer.shields is above every one of those, the core included, and it
    // is its own pass: gather the fills, then blit the buffer over the
    // finished frame
    this.blitShields(zoom, offX, offY, kPx, sim.time, buffered);
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
  private drawForceFields(sim: Sim, buffered: boolean): void {
    const { upx, upy, ushield, ushieldAlpha, uforceScale, ukind, n } = sim;
    // the census answers "is any carrier even alive" without touching the
    // units — a wave with no quasar in it skips the whole scan
    let carriers = 0;
    for (let k = 0; k < KIND_FORCE.length; k++)
      if (KIND_FORCE[k]) carriers += sim.aliveByKind[k];
    if (carriers === 0) return;
    const { vx0, vy0, vx1, vy1 } = this;
    const b = this.shields;
    for (let i = 0; i < n; i++) {
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
      const col: RGB = [
        SHIELD_COL[0] + (1 - SHIELD_COL[0]) * w,
        SHIELD_COL[1] + (1 - SHIELD_COL[1]) * w,
        SHIELD_COL[2] + (1 - SHIELD_COL[2]) * w,
      ];
      if (buffered) {
        this.fillPoly(b, upx[i], upy[i], spec.sides, rad, spec.rotation, col, 1);
      } else {
        this.fillPoly(b, upx[i], upy[i], spec.sides, rad, spec.rotation, col, 0.09 + 0.08 * w);
        this.strokePoly(b, upx[i], upy[i], spec.sides, rad, spec.rotation, 1.5 * MU, col, 1);
      }
    }
  }

  /**
   * Size the shield buffer to the drawing buffer, rebuilding it whenever
   * the canvas changes. Returns false if the driver will not give us a
   * complete framebuffer, which puts the fields on the no-shader path.
   */
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
  private blitShields(
    zoom: number,
    offX: number,
    offY: number,
    kPx: number,
    time: number,
    buffered: boolean,
  ): void {
    if (this.shields.n === 0) return;
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    // no buffer: the batch already holds the finished no-shader drawing,
    // so it goes straight over the frame like any other geometry
    if (!buffered) {
      this.draw(this.shields, true);
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
    this.draw(this.shields, true);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.shieldProg);
    const camW = w / kPx / zoom / MU, camH = h / kPx / zoom / MU;
    gl.uniform4f(this.uShieldCam, -offX / zoom / MU, -offY / zoom / MU, camW, camH);
    gl.uniform2f(this.uShieldInv, 1 / camW, 1 / camH);
    // Shaders.ShieldShader: u_time is Time.time / dp, in ticks
    gl.uniform1f(this.uShieldTime, (time * 60) / SHIELD_DP);
    gl.uniform1f(this.uShieldDp, SHIELD_DP);
    gl.bindTexture(gl.TEXTURE_2D, this.shieldTex);
    gl.bindVertexArray(this.blitVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }

  /**
   * Arc Fill.poly: a solid regular polygon.
   *
   * A hexagon — every force field on the roster — is one quad off the
   * UV_HEX cell, which is the whole point of that cell (see the UV_HEX
   * note: joins in the fill become joins in the outline). Anything else
   * falls back to a fan, each side one Drawf.tri with its base on the edge
   * and its apex at the middle, since that is the only decomposition this
   * batch can draw — every quad it takes is a rotated rectangle.
   */
  private fillPoly(
    dyn: Batch,
    cx: number,
    cy: number,
    sides: number,
    radius: number,
    rotation: number,
    col: RGB,
    a: number,
  ): void {
    if (radius <= 0.01 || a <= 0.004) return;
    if (sides === 6) {
      this.push(dyn, cx, cy, radius * 2, radius * 2, rotation, UV_HEX,
        col[0], col[1], col[2], a);
      return;
    }
    const step = (Math.PI * 2) / sides;
    const apothem = radius * Math.cos(step / 2);
    const chord = 2 * radius * Math.sin(step / 2);
    for (let k = 0; k < sides; k++) {
      // the bearing of this edge's midpoint — the tri points back down it
      const ang = rotation + (k + 0.5) * step;
      this.push(
        dyn,
        cx + Math.cos(ang) * (apothem / 2),
        cy + Math.sin(ang) * (apothem / 2),
        apothem, chord, ang + Math.PI, UV_TRI,
        col[0], col[1], col[2], a,
      );
    }
  }

  /**
   * Arc Lines.poly: the outline of a regular polygon, mitred at the
   * corners. Each edge is one rectangle run long by half a stroke's worth
   * of tangent so neighbours meet cleanly instead of leaving notches.
   */
  private strokePoly(
    dyn: Batch,
    cx: number,
    cy: number,
    sides: number,
    radius: number,
    rotation: number,
    stroke: number,
    col: RGB,
    a: number,
  ): void {
    if (radius <= 0.01 || stroke <= 0.01 || a <= 0.004) return;
    const step = (Math.PI * 2) / sides;
    const half = step / 2;
    const apothem = radius * Math.cos(half);
    const len = 2 * radius * Math.sin(half) + stroke * Math.tan(half);
    for (let k = 0; k < sides; k++) {
      const ang = rotation + (k + 0.5) * step;
      this.push(
        dyn,
        cx + Math.cos(ang) * apothem,
        cy + Math.sin(ang) * apothem,
        len, stroke, ang + Math.PI / 2, UV_SOLID,
        col[0], col[1], col[2], a,
      );
    }
  }

  /**
   * ShrapnelBulletType.draw, 1:1: a long triangle bolt with a short back
   * spike and perpendicular serrations, tinted white fading to thoriumPink
   * over its 10-tick life, all widths shrinking with fout.
   */
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
   * Fx.blastExplosion, 1:1: swarmer's warhead. A pale ring snaps out over
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
   * Fx.plasticExplosion, 1:1: cyclone's. The same three passes again, in
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
   * Fx.instShoot, 1:1: foreshadow's muzzle. A 50-unit ring blows off the
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
   * Fx.smokeCloud, 1:1: the powder foreshadow leaves hanging for a second
   * and a bit. Thirty motes on the boiling-cloud variant of
   * randLenVectors, each fading in and out on its OWN clock — an alpha
   * that peaks when that mote is halfway through its life.
   */
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
   * ramps into says which: fuse throws thorium pink, arc lancer blue.
   * Seven sparks out of the muzzle in a wide cone, LENGTHENING as they go
   * (fin, not fout) so the spray reads as opening rather than dying.
   */
  private drawSparkShoot(dyn: Batch, e: Effect, t: number): void {
    const col = ramp(PAL.white, e.col ?? PAL.lancerLaser, null, t);
    const stroke = ((1 - t) * 1.2 + 0.5) * MU;
    const bar = (t * 5 + 2) * MU;
    this.scatter(e.seed ?? 1, 7, 25 * FIN_POW(t) * MU, e.rot ?? 0, SPREAD_50,
      (x, y, bearing) => {
        this.strokeLine(dyn, e.x + x, e.y + y, bearing, bar, stroke, col, 1);
      });
  }

  /** Fx.hitLancer: eight white bars flicking off whatever the beam or the
   *  bolt just landed on */
  private drawHitLancer(dyn: Batch, e: Effect, t: number): void {
    const fout = 1 - t;
    const bar = (fout * 4 + 1) * MU;
    const stroke = fout * 1.5 * MU;
    this.scatter(e.seed ?? 1, 8, FIN_POW(t) * 17 * MU, 0, Math.PI, (x, y, bearing) => {
      this.strokeLine(dyn, e.x + x, e.y + y, bearing, bar, stroke, PAL.white, 1);
    });
  }

  /**
   * Fx.lancerLaserCharge over Fx.lancerLaserChargeBegin — Mindustry's
   * MultiEffect, drawn off one entity because the pair never appears apart.
   * Fourteen sparks fall INWARD on the muzzle (their length runs on fout,
   * so the ring closes) over 38 ticks, while a blue core swells under a
   * white one for 60 and then snaps out over the last tenth.
   */
  private drawLancerCharge(dyn: Batch, e: Effect, t: number): void {
    // Mathf.curve(fin, 0.9): nothing until the last tenth, then a hard
    // collapse — the flash of the shot actually leaving
    const margin = 1 - Math.max(0, (t - 0.9) / 0.1);
    const core = Math.min(margin, t);
    this.fillCircle(dyn, e.x, e.y, core * 3 * MU, PAL_LANCER, 1);
    this.fillCircle(dyn, e.x, e.y, core * 2 * MU, PAL.white, 1);
    if (t >= LANCER_CHARGE_SPARK) return;
    const s = t / LANCER_CHARGE_SPARK;
    const bar = ((1 - Math.abs(s - 0.5) * 2) * 3 + 1) * MU; // fslope
    this.scatter(e.seed ?? 1, 14, (1 + 20 * (1 - s)) * MU, e.rot ?? 0, SPREAD_120,
      (x, y, bearing) => {
        this.strokeLine(dyn, e.x + x, e.y + y, bearing, bar, MU, PAL_LANCER, 1);
      });
  }

  /**
   * Fx.shootSmallFlame, 1:1 — scorch's entire visible weapon. Twelve
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
    const col = ramp(LIGHT_FLAME, DARK_FLAME, FLAME_GRAY, t);
    const len = FIN_POW(t) * 60 * MU;
    const rad = (0.65 + fout * 1.5) * MU;
    const rot = e.rot ?? 0;
    rngSeed(e.seed ?? 1);
    for (let i = 0; i < 12; i++) {
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
    const col = ramp(LIGHT_FLAME, DARK_FLAME, null, t);
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
   * Fx.lightning, 1:1: arc's bolt is drawn from the very point list the
   * walk built (Sim.lightningBolt), stroked 3 units wide and fading, with a
   * dot at every node so the corners read as joints rather than kinks. The
   * colour washes from Pal.lancerLaser to white as it goes out.
   */
  private drawBolt(dyn: Batch, e: Effect, t: number): void {
    const pts = e.pts;
    if (!pts || pts.length < 4) return;
    const stroke = 3 * MU * (1 - t);
    if (stroke <= 0.01) return;
    const col: RGB = [
      PAL_LANCER[0] + (1 - PAL_LANCER[0]) * t,
      PAL_LANCER[1] + (1 - PAL_LANCER[1]) * t,
      PAL_LANCER[2] + (1 - PAL_LANCER[2]) * t,
    ];
    for (let i = 0; i + 3 < pts.length; i += 2)
      this.pushSeg(dyn, pts[i], pts[i + 1], pts[i + 2], pts[i + 3], UV_SOLID, stroke, col);
    for (let i = 0; i < pts.length; i += 2)
      this.fillCircle(dyn, pts[i], pts[i + 1], stroke / 2, col, 1);
  }

  /**
   * LaserBulletType.draw, 1:1: three passes of the same beam, each half the
   * width of the last, so the bright core sits inside a wide translucent
   * sheath. Each pass adds a tip triangle and a pair of flares out the
   * sides of the muzzle, and the whole thing grows to length over the first
   * fifth of its life and thins out over the rest.
   *
   * `len` is what the beam ACTUALLY reached — Sim.laserBeam shortens it to
   * the fourth unit it hit — so a lancer firing into a crowd draws short.
   */
  private drawLaser(dyn: Batch, e: Effect, t: number): void {
    const rot = e.rot ?? 0;
    const fout = 1 - t;
    const baseLen = (e.len ?? 0) * Math.min(1, t / 0.2); // Mathf.curve(fin, 0, 0.2)
    if (baseLen <= 0.01) return;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const width = 15 * MU; // LaserBulletType.width
    const SIDE_LEN = 29 * MU, SIDE_WIDTH = 0.7, FALLOFF = 0.5;
    // colors[0] is the same blue at 0.4 alpha, colors[1] solid, colors[2] white
    const passes: ReadonlyArray<readonly [RGB, number]> = [
      [PAL_LANCER, 0.4],
      [PAL_LANCER, 1],
      [[1, 1, 1], 1],
    ];
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
        // the point on the end, and the muzzle bloom
        tri(e.x + cos * baseLen, e.y + sin * baseLen, stroke, cwidth * 2 + width / 2, rot,
          col, alpha);
        this.fillCircle(dyn, e.x, e.y, cwidth * fout, col, alpha);
        for (const sgn of [1, -1])
          tri(e.x, e.y, SIDE_WIDTH * fout * cwidth, SIDE_LEN * compound,
            rot + (sgn * Math.PI) / 2, col, alpha);
      }
      compound *= FALLOFF;
    }
  }

  /**
   * Drawf.laser for a TractorBeamTurret's held beam: a 12-unit-wide line
   * scaled by the turret's `strength` and laserWidth, inset at both ends by
   * the caps that close it off. Parallax fires no bullet, so this is the
   * only thing on screen that says it is working.
   */
  private drawTractorBeam(dyn: Batch, t: Tower): void {
    const st = TOWERS[t.kind];
    const scale = t.beamStr * 0.6; // TractorBeamTurret.laserWidth
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
      t.beamY - uy * inset, UV_PARALLAX_LASER, 12 * scale * MU, white);
    const a = Math.atan2(dy, dx);
    this.push(dyn, x1, y1, cap, cap, a + Math.PI, UV_PARALLAX_LASER_END, 1, 1, 1, 1);
    this.push(dyn, t.beamX, t.beamY, cap, cap, a, UV_PARALLAX_LASER_END, 1, 1, 1, 1);
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
   * ContinuousLaserBulletType.draw, 1:1: meltdown's beam. FOUR passes of
   * the same line, each narrower and whiter than the last — a broad
   * translucent wash, two hotter cores inside it and a white filament down
   * the middle — with a flame front capping both ends of every pass. The
   * layering is the entire look: no single pass is the beam.
   *
   * The beam shortens as it goes out (fout drives both stroke and length),
   * and Mathf.absin gives the whole thing a slow shimmer that keeps it
   * from reading as a static bar.
   */
  private drawContinuousBeam(dyn: Batch, t: Tower): void {
    const cont = TOWERS[t.kind].bullet.continuous;
    if (!cont) return;
    // held at full, then linearly out over fadeTime
    const fout = t.beamT > cont.fade ? 1 : t.beamT / cont.fade;
    const len = cont.length * fout;
    if (len <= 0.01) return;
    const rot = t.beamRot;
    // Time.time, in ticks — the beam's own elapsed life does for a clock
    const time = (cont.duration + cont.fade - t.beamT) * 60;
    const shimmer = 1 + ABSIN(time, 1, 0.1);
    const width = 9 + ABSIN(time, 0.8, 1.5); // width + absin(oscScl, oscMag)
    const body = Math.max(0, len - CL_FRONT);
    const bx = t.beamOX + Math.cos(rot) * body, by = t.beamOY + Math.sin(rot) * body;
    for (let i = 0; i < CL_COLORS.length; i++) {
      const [cr, cg, cb, ca] = CL_COLORS[i];
      const col: RGB = [
        Math.min(1, cr * shimmer),
        Math.min(1, cg * shimmer),
        Math.min(1, cb * shimmer),
      ];
      const colorFin = i / (CL_COLORS.length - 1);
      // strokeFrom 2 -> strokeTo 0.5: every pass inside the one before it
      const stroke = width * fout * (2 + (0.5 - 2) * colorFin) * MU;
      // pointyScaling: the innermost passes keep a full-length nose while
      // the outer wash is stubbier, which is what sharpens the tip
      const lenScl = 1 - i / CL_COLORS.length + (i / CL_COLORS.length) * 0.75;
      this.strokeLine(dyn, t.beamOX, t.beamOY, rot, body, stroke, col, ca);
      this.flameFront(dyn, t.beamOX, t.beamOY, rot + Math.PI, CL_BACK, stroke / 2, col, ca);
      this.flameFront(dyn, bx, by, rot, CL_FRONT * lenScl, stroke / 2, col, ca);
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
  private drawFootfall(dyn: Batch, sim: Sim, e: Effect, t: number): void {
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
   * Fx.burning, 1:1: three embers guttering off a unit that scorch has set
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

  private drawShrapnel(
    dyn: Batch,
    x: number,
    y: number,
    rot: number,
    len: number,
    t: number,
  ): void {
    const S = SHRAPNEL;
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
}
