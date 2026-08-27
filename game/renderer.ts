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
  UV_FLASH,
  UV_FLOORS,
  UV_PINE,
  UV_PROJ,
  UV_RING,
  UV_FUSE,
  UV_HEX,
  UV_SCATTER,
  UV_FLOOR_EDGES,
  UV_SHELL,
  UV_SHELL_GRAPHITE,
  UV_HAIL,
  UV_DISC,
  UV_DUO,
  UV_TOWER_BASE,
  UV_TOWER_BASE1,
  UV_TOWER_BASE3,
  UV_SCORCH,
  UV_TRI,
  UV_TURRET,
  UV_WALLS,
  UV_WALL_LARGE,
  WALL_GROUP,
  type UVRect,
} from "./atlas";
import {
  BASE,
  CELL,
  clamp,
  COLS,
  H,
  HP_TINT,
  MAX_UNITS,
  NCELLS,
  ROWS,
  SHRAPNEL,
  TOWERS,
  W,
} from "./constants";
import { UNIT_KINDS, UNIT_STATS, type ForceFieldSpec, type LegSpec } from "./levels";
import { MAX_LEGS, type Sim } from "./sim";
import { WALL_PINE, type Terrain } from "./terrain";
import { FxKind, type Effect, type TowerKind } from "./types";

// per-kind turret tops and bullet sprites
const UV_TURRETS: Record<TowerKind, UVRect> = {
  duo: UV_DUO,
  hail: UV_HAIL,
  salvo: UV_TURRET,
  scatter: UV_SCATTER,
  fuse: UV_FUSE,
  scorch: UV_SCORCH,
  // STUBS: not in the build menu, so never drawn. They point at duo's
  // region only so the record stays exhaustive — packing their real
  // sprites is part of implementing each turret, not of listing it
  arc: UV_DUO,
  lancer: UV_DUO,
  ripple: UV_DUO,
  parallax: UV_DUO,
  swarmer: UV_DUO,
  cyclone: UV_DUO,
  spectre: UV_DUO,
  meltdown: UV_DUO,
  foreshadow: UV_DUO,
};
// draw size [along-travel, across] px; scatter's flak shell is Mindustry's
// 6x8-unit shell (15x20 px), longer than it is wide. Fuse never spawns a
// projectile (hitscan) and scorch's is invisible (a bare BulletType draws
// nothing) — their entries here are unused placeholders.
const UV_BULLETS: Record<TowerKind, UVRect> = {
  duo: UV_PROJ,
  hail: UV_SHELL_GRAPHITE,
  salvo: UV_PROJ,
  scatter: UV_SHELL,
  fuse: UV_PROJ,
  scorch: UV_PROJ,
  arc: UV_PROJ,
  lancer: UV_PROJ,
  ripple: UV_PROJ,
  parallax: UV_PROJ,
  swarmer: UV_PROJ,
  cyclone: UV_PROJ,
  spectre: UV_PROJ,
  meltdown: UV_PROJ,
  foreshadow: UV_PROJ,
};
const BULLET_SIZE: Record<TowerKind, readonly [number, number]> = {
  duo: [14, 12], // copper pellet: visibly lighter than salvo's thorium round
  hail: [28, 28], // 11x11-unit artillery shell
  salvo: [18, 18],
  scatter: [20, 15],
  fuse: [18, 18],
  scorch: [18, 18],
  arc: [18, 18],
  lancer: [18, 18],
  ripple: [18, 18],
  parallax: [18, 18],
  swarmer: [18, 18],
  cyclone: [18, 18],
  spectre: [18, 18],
  meltdown: [18, 18],
  foreshadow: [18, 18],
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
/** Pal.lightFlame #ffdd55, Pal.darkFlame #db401c, and Arc's Color.gray */
const LIGHT_FLAME = [0xff / 255, 0xdd / 255, 0x55 / 255] as const;
const DARK_FLAME = [0xdb / 255, 0x40 / 255, 0x1c / 255] as const;
const FLAME_GRAY = [0.5, 0.5, 0.5] as const;
type RGB = readonly [number, number, number];

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
const SPREAD_50 = (50 * Math.PI) / 180;
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
/** the scene's clear colour, #0A101F — the shield pass borrows the clear
 * for its own buffer and has to hand this back */
const CLEAR = [0.039, 0.063, 0.122] as const;
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
  core: boolean;
}
export const ALL_LAYERS: TerrainLayers = { wall: true, props: true, spawn: true, core: true };

// flyer drop shadow: painter's offset + premultiplied black tint
const SHADOW_OFF = 6;
const SHADOW_ALPHA = 0.22;

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
  // the core of the terrain currently in the static batches; renderTerrain
  // (the editor) has no sim to ask, so rebuildTerrain leaves it here
  private core = { ...BASE };
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
    gl.clearColor(CLEAR[0], CLEAR[1], CLEAR[2], 1); // #0A101F
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
    // `dk` is the planted-leg darkening, applied on the art pass only
    const parts: Array<
      readonly [UVRect, UVRect, number, number, number, number, number, number]
    > = [];
    for (let side = -1; side <= 1; side += 2) {
      const dk = 1 - Math.max(0, (side * ext) / m.stride) * LEG_SHADE;
      parts.push([
        m.leg,
        m.sil.leg,
        x + cb * ext * side,
        y + sb * ext * side,
        s * (1 - Math.max(-lift * side, 0) * 0.5),
        s * side, // negative height mirrors the off-side leg
        brot,
        dk,
      ]);
    }
    parts.push([m.base, m.sil.base, x, y, s, s, brot, 1]);
    const gunParts = (top: boolean): void => {
      for (const g of m.guns) {
        if (g.top !== top) continue;
        for (let side = -1; side <= 1; side += 2) {
          parts.push([
            g.uv,
            g.sil,
            x + ox + cr * g.y - sr * g.x * side,
            y + oy + sr * g.y + cr * g.x * side,
            s,
            s * side, // mirrored mount, like Weapon.flipSprite
            rot,
            1,
          ]);
        }
      }
    };
    gunParts(false);
    parts.push([m.body, m.sil.body, x + ox, y + oy, s, s, rot, 1]);
    gunParts(true);
    // silhouette pass: every part as a solid dilated shape, drawn first so
    // the art covers all of it but a single rim around the assembly — the
    // outer border without a line at every seam of the walking mech
    for (const [, sil, px, py, w, h, r] of parts) {
      this.push(b, px, py, w, h, r, sil, tint[0], tint[1], tint[2], 1);
    }
    for (const [uvr, , px, py, w, h, r, dk] of parts) {
      this.push(b, px, py, w, h, r, uvr, tint[0] * dk, tint[1] * dk, tint[2] * dk, 1);
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
    const swinging = ulegMove[i];

    // a foot at the top of its swing throws its shadow clear of itself —
    // the only cue that a leg is off the ground rather than sliding along it
    for (let k = 0; k < n; k++) {
      if (!(swinging & (1 << k)) || L.elevation <= 0) continue;
      const p = off + k;
      // Mathf.slope: a triangle peaking mid-swing, so the foot rises and lands
      const elev = (1 - Math.abs(1 - ulegStage[p] - 0.5) * 2) * L.elevation;
      const ang = brot + (TAU / n) * k + Math.PI / n;
      const mx = x + Math.cos(ang) * L.baseOffset, my = y + Math.sin(ang) * L.baseOffset;
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
        const ang = brot + (TAU / n) * k + Math.PI / n;
        const mx = x + Math.cos(ang) * L.baseOffset, my = y + Math.sin(ang) * L.baseOffset;
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
          const ang = brot + (TAU / n) * k + Math.PI / n;
          this.push(b, x + Math.cos(ang) * L.baseOffset, y + Math.sin(ang) * L.baseOffset,
            sm, sm, brot, baseJoint, tr, tg, tb, 1);
        }
      }
      // the plate the legs hang off turns with the chassis, the body and its
      // guns with the unit's own facing. A gun mount is mirrored to both
      // sides (Weapon.mirror), the far one drawn from the same sprite
      // flipped, and Weapon.top decides which side of the body it lands on
      const gun = (g: LegGun): void => {
        for (let side = -1; side <= 1; side += 2) {
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
  ): void {
    const dx = x2 - x1, dy = y2 - y1;
    this.push(b, x1 + dx / 2, y1 + dy / 2, Math.hypot(dx, dy), stroke, Math.atan2(dy, dx),
      uvr, tint[0], tint[1], tint[2], 1);
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
    if (layers.core)
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
    if (!this.layers.core) {
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
      const base = sz >= 3 ? UV_TOWER_BASE3 : sz === 2 ? UV_TOWER_BASE : UV_TOWER_BASE1;
      this.push(dyn, t.x, t.y, px, px, 0, base, 1, 1, 1, 1);
      this.push(dyn, t.x, t.y, px, px, t.angle, UV_TURRETS[t.kind], 1, 1, 1, 1);
    }
    const { upx, upy, uhp, uhpmax, ukind, uwalk, ubrot, urot, n } = sim;
    const { ushield, ushieldAlpha, urad } = sim;
    // painter's order in three passes: ground units, then flyer shadows on
    // top of the crowd, then the flyers themselves above everything
    for (let pass = 0; pass < 3; pass++) {
      const wantFly = pass > 0;
      for (let i = 0; i < n; i++) {
        const k = ukind[i];
        if (KIND_FLYING[k] !== wantFly) continue;
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
        // hp thirds of the unit's own max, so every kind tints alike
        const t3 = (uhp[i] * 3) / uhpmax[i];
        const tint = HP_TINT[t3 <= 1 ? 0 : t3 <= 2 ? 1 : 2];
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
    for (const p of sim.projs) {
      // a bare BulletType has no sprite at all — scorch's flame lives
      // entirely in its shoot and hit effects
      if (TOWERS[p.kind].bullet.invisible) continue;
      // colors are baked into the atlas composite
      const [bw, bh] = BULLET_SIZE[p.kind];
      this.push(dyn, p.x, p.y, bw, bh, Math.atan2(p.vy, p.vx), UV_BULLETS[p.kind], 1, 1, 1, 1);
    }
    for (const e of sim.effects) {
      const t = e.age / e.ttl;
      if (e.kind === FxKind.Hit) {
        this.push(dyn, e.x, e.y, 9, 9, 0, UV_FLASH, 1, 0.82, 0.3, 1 - t);
      } else if (e.kind === FxKind.Death) {
        const s = 7 + t * 22;
        this.push(dyn, e.x, e.y, s, s, 0, UV_RING, 1, 0.54, 0.24, (1 - t) * 0.9);
      } else if (e.kind === FxKind.Flak) {
        // flakExplosion: bright flash inside an expanding orange ring
        const s = 12 + t * 46;
        this.push(dyn, e.x, e.y, 16 * (1 - t), 16 * (1 - t), 0, UV_FLASH, 1, 0.7, 0.3, 1 - t);
        this.push(dyn, e.x, e.y, s, s, 0, UV_RING, 1, 0.5, 0.13, (1 - t) * 0.85);
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
    // core last, above units and breach fx — arrivals disappear beneath it
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
    const b = this.shields;
    for (let i = 0; i < n; i++) {
      const spec = KIND_FORCE[ukind[i]];
      // ForceFieldAbility.draw draws nothing at all while the pool is empty
      if (!spec || ushield[i] <= 0) continue;
      const rad = spec.radius * uforceScale[i];
      if (rad < 1) continue;
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
    // Drawf.tri: isosceles triangle, base centered at (tx, ty), apex l away
    // along angle a — the atlas triangle points +x with its base at -x
    const tri = (tx: number, ty: number, w: number, l: number, a: number): void => {
      if (l <= 0.01 || w <= 0.01) return;
      const cx = tx + (Math.cos(a) * l) / 2;
      const cy = ty + (Math.sin(a) * l) / 2;
      this.push(dyn, cx, cy, l, w, a, UV_TRI, r, g, b, 1);
    };
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
