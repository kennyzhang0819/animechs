import {
  MECH_ART,
  type MechArt,
  UNIT_ART,
  UV_CORE,
  UV_DECOR,
  UV_FLASH,
  UV_FLOORS,
  UV_PINE,
  UV_PROJ,
  UV_RING,
  UV_FUSE,
  UV_SCATTER,
  UV_SPAWN,
  UV_FLOOR_EDGES,
  UV_SHELL,
  UV_SHELL_GRAPHITE,
  UV_HAIL,
  UV_DUO,
  UV_TOWER_BASE,
  UV_TOWER_BASE1,
  UV_TOWER_BASE3,
  UV_TRI,
  UV_TURRET,
  UV_WALLS,
  type UVRect,
} from "./atlas";
import {
  BASE,
  CELL,
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
import { UNIT_KINDS, UNIT_STATS } from "./levels";
import { SPAWN_REGIONS } from "./maps";
import type { Sim } from "./sim";
import type { Terrain } from "./terrain";
import { FxKind, type TowerKind } from "./types";

// per-kind turret tops and bullet sprites
const UV_TURRETS: Record<TowerKind, UVRect> = {
  duo: UV_DUO,
  hail: UV_HAIL,
  salvo: UV_TURRET,
  scatter: UV_SCATTER,
  fuse: UV_FUSE,
};
// draw size [along-travel, across] px; scatter's flak shell is Mindustry's
// 6x8-unit shell (15x20 px), longer than it is wide. Fuse never spawns a
// projectile (hitscan) — its entries are unused placeholders.
const UV_BULLETS: Record<TowerKind, UVRect> = {
  duo: UV_PROJ,
  hail: UV_SHELL_GRAPHITE,
  salvo: UV_PROJ,
  scatter: UV_SHELL,
  fuse: UV_PROJ,
};
const BULLET_SIZE: Record<TowerKind, readonly [number, number]> = {
  duo: [14, 12], // copper pellet: visibly lighter than salvo's thorium round
  hail: [28, 28], // 11x11-unit artillery shell
  salvo: [18, 18],
  scatter: [20, 15],
  fuse: [18, 18],
};
// unit art indexed by the sim's numeric kind id (UNIT_ID order)
const KIND_UV = UNIT_KINDS.map((k) => UNIT_ART[k].uv);
const KIND_SPRITE = UNIT_KINDS.map((k) => UNIT_ART[k].sprite);
const KIND_FLYING = UNIT_KINDS.map((k) => !!UNIT_STATS[k].flying);
const KIND_MECH = UNIT_KINDS.map((k) => MECH_ART[k] ?? null);
// mech walk dressing (Mindustry defaults, world units × 2.5 px):
// body/gun sway per stride, and a gentle shade on the planted leg — the
// original lerps the sprite toward Pal.darkMetal, which the leg art
// already averages, so a mild darken is the closest a multiply tint gets
const SIDE_SWAY = 0.54 * 2.5;
const FRONT_SWAY = 0.1 * 2.5;
const LEG_SHADE = 0.14;
// floor blend priority by group id (grass, stone, dirt): Blocks.java
// definition order — stone < dirt < grass, higher fades over lower
const GROUP_PRI = [2, 0, 1] as const;
// overlaying groups in ascending priority (stone never overlays)
const EDGE_ORDER = [2, 0] as const;
// wall shadow strength: BlockRenderer.shadowColor is black at 0.71 — the
// premultiplied blend of a black quad at this alpha equals its multiply
const WALL_SHADOW_A = 0.71;
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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    atlas: HTMLCanvasElement,
  ) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    if (!gl) throw new Error("WebGL2 is required");
    this.gl = gl;

    this.prog = this.link();
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
    // a walking mech is 6 quads (2 legs, chassis, 2 guns, body)
    // mechs draw twice (silhouette rim under, art over) — up to 12 quads each
    this.dyn = this.makeBatch(MAX_UNITS * 12 + 2048);

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
    gl.clearColor(0.039, 0.063, 0.122, 1); // #0A101F
  }

  private link(): WebGLProgram {
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
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
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
    const sway = lift * SIDE_SWAY;
    const fsway = Math.sin((raw / m.stride) * Math.PI) * FRONT_SWAY;
    const ox = -sb * sway + cb * fsway;
    const oy = cb * sway + sb * fsway;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    // the six quads' shared geometry, legs → base → guns → body; shade is
    // the planted-leg darkening, applied on the art pass only
    const parts: Array<
      readonly [keyof MechArt["sil"], number, number, number, number, number, number]
    > = [];
    for (let side = -1; side <= 1; side += 2) {
      const dk = 1 - Math.max(0, (side * ext) / m.stride) * LEG_SHADE;
      parts.push([
        "leg",
        x + cb * ext * side,
        y + sb * ext * side,
        s * (1 - Math.max(-lift * side, 0) * 0.5),
        s * side, // negative height mirrors the off-side leg
        brot,
        dk,
      ]);
    }
    parts.push(["base", x, y, s, s, brot, 1]);
    for (let side = -1; side <= 1; side += 2) {
      parts.push([
        "gun",
        x + ox + cr * m.gunY - sr * m.gunX * side,
        y + oy + sr * m.gunY + cr * m.gunX * side,
        s,
        s * side, // mirrored mount, like Weapon.flipSprite
        rot,
        1,
      ]);
    }
    parts.push(["body", x + ox, y + oy, s, s, rot, 1]);
    // silhouette pass: every part as a solid dilated shape, drawn first so
    // the art covers all of it but a single rim around the assembly — the
    // outer border without a line at every seam of the walking mech
    for (const [k, px, py, w, h, r] of parts) {
      this.push(b, px, py, w, h, r, m.sil[k], tint[0], tint[1], tint[2], 1);
    }
    for (const [k, px, py, w, h, r, dk] of parts) {
      this.push(b, px, py, w, h, r, m[k], tint[0] * dk, tint[1] * dk, tint[2] * dk, 1);
    }
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
   * changes. showSpawn paints the spawn-pad layer over its floor cells —
   * an editor-only debug view; the game never passes it
   */
  rebuildTerrain(src: { terrain: Terrain }, showSpawn = false): void {
    const gl = this.gl;
    const t = this.terrain;
    const T = src.terrain;
    t.n = 0;
    // does this cell show its floor (rather than a wall sprite)? pine cells
    // (and tower cells, which aren't in terrain.blocked at all) get their
    // floor painted; props draw over it below
    const showsFloor = (j: number): boolean =>
      !(T.blocked[j] && T.wall[j] < UV_WALLS.length);
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
    for (let i = 0; i < COLS * ROWS; i++) if (T.blocked[i]) stamp(i);
    // buildings on the ground stamp their footprint too, like Mindustry's
    // displayShadow blocks — the core sprite covers the middle, so what
    // shows is the rim hugging its sides. Towers sit on hills (already
    // fully stamped as blocked cells), so they need nothing extra
    for (let y = BASE.y; y < BASE.y + BASE.size; y++)
      for (let x = BASE.x; x < BASE.x + BASE.size; x++) stamp(y * COLS + x);
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
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        if (showsFloor(i)) continue;
        this.push(w, (x + 0.5) * CELL, (y + 0.5) * CELL, CELL, CELL, 0, UV_WALLS[T.wall[i]], 1, 1, 1, 1);
      }
    }
    if (showSpawn) {
      for (let i = 0; i < COLS * ROWS; i++) {
        if (!T.spawn[i] || T.blocked[i]) continue;
        const cx = ((i % COLS) + 0.5) * CELL, cy = (((i / COLS) | 0) + 0.5) * CELL;
        // tint the pad toward its region's color, so regions read at a glance
        const [tr, tg, tb] = SPAWN_REGIONS[(T.spawn[i] - 1) % SPAWN_REGIONS.length].tint;
        this.push(w, cx, cy, CELL, CELL, 0, UV_SPAWN, tr, tg, tb, 1);
      }
    }
    for (const d of T.decor)
      this.push(w, d.x, d.y, d.size, d.size, d.rot, UV_DECOR[d.kind], 1, 1, 1, 1);
    for (const p of T.pines)
      this.push(w, p.x, p.y, p.size, p.size, p.rot, UV_PINE, 1, 1, 1, 1);
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
    const coreSz = BASE.size * CELL;
    this.push(
      dyn,
      (BASE.x + BASE.size / 2) * CELL,
      (BASE.y + BASE.size / 2) * CELL,
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
    for (const t of sim.towers) {
      const sz = TOWERS[t.kind].size;
      const px = sz * CELL;
      const base = sz >= 3 ? UV_TOWER_BASE3 : sz === 2 ? UV_TOWER_BASE : UV_TOWER_BASE1;
      this.push(dyn, t.x, t.y, px, px, 0, base, 1, 1, 1, 1);
      this.push(dyn, t.x, t.y, px, px, t.angle, UV_TURRETS[t.kind], 1, 1, 1, 1);
    }
    const { upx, upy, uvx, uvy, uhp, uhpmax, ukind, uwalk, ubrot, urot, n } = sim;
    // painter's order in three passes: ground units, then flyer shadows on
    // top of the crowd, then the flyers themselves above everything
    for (let pass = 0; pass < 3; pass++) {
      const wantFly = pass > 0;
      for (let i = 0; i < n; i++) {
        const k = ukind[i];
        if (KIND_FLYING[k] !== wantFly) continue;
        const usz = KIND_SPRITE[k];
        if (pass === 1) {
          const rot = Math.atan2(uvy[i], uvx[i]);
          this.push(dyn, upx[i] + SHADOW_OFF, upy[i] + SHADOW_OFF, usz, usz, rot, KIND_UV[k], 0, 0, 0, SHADOW_ALPHA);
          continue;
        }
        // hp thirds of the unit's own max, so every kind tints alike
        const t3 = (uhp[i] * 3) / uhpmax[i];
        const tint = HP_TINT[t3 <= 1 ? 0 : t3 <= 2 ? 1 : 2];
        const mech = KIND_MECH[k];
        if (mech) {
          this.pushMech(dyn, mech, upx[i], upy[i], urot[i], ubrot[i], uwalk[i], tint);
        } else {
          // flyers bank instantly along their velocity, one flat quad
          const rot = Math.atan2(uvy[i], uvx[i]);
          this.push(dyn, upx[i], upy[i], usz, usz, rot, KIND_UV[k], tint[0], tint[1], tint[2], 1);
        }
      }
    }
    for (const p of sim.projs) {
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
      } else if (e.kind === FxKind.Shrapnel) {
        this.drawShrapnel(dyn, e.x, e.y, e.rot ?? 0, e.len ?? 0, t);
      } else {
        const s = 9 + t * 30;
        this.push(dyn, e.x, e.y, s, s, 0, UV_RING, 0.34, 0.89, 0.54, (1 - t) * 0.9);
      }
    }
    // core last, above units and breach fx — arrivals disappear beneath it
    const coreSz = BASE.size * CELL;
    this.push(
      dyn,
      (BASE.x + BASE.size / 2) * CELL,
      (BASE.y + BASE.size / 2) * CELL,
      coreSz,
      coreSz,
      0,
      UV_CORE,
      1, 1, 1, 1,
    );
    this.draw(dyn, true);
  }

  /**
   * ShrapnelBulletType.draw, 1:1: a long triangle bolt with a short back
   * spike and perpendicular serrations, tinted white fading to thoriumPink
   * over its 10-tick life, all widths shrinking with fout.
   */
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
