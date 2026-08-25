import {
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
  UV_SHELL,
  UV_TOWER_BASE,
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
import type { Sim } from "./sim";
import type { Terrain } from "./terrain";
import { FxKind, type TowerKind } from "./types";

// per-kind turret tops and bullet sprites
const UV_TURRETS: Record<TowerKind, UVRect> = {
  salvo: UV_TURRET,
  scatter: UV_SCATTER,
  fuse: UV_FUSE,
};
// draw size [along-travel, across] px; scatter's flak shell is Mindustry's
// 6x8-unit shell (15x20 px), longer than it is wide. Fuse never spawns a
// projectile (hitscan) — its entries are unused placeholders.
const UV_BULLETS: Record<TowerKind, UVRect> = {
  salvo: UV_PROJ,
  scatter: UV_SHELL,
  fuse: UV_PROJ,
};
const BULLET_SIZE: Record<TowerKind, readonly [number, number]> = {
  salvo: [18, 18],
  scatter: [20, 15],
  fuse: [18, 18],
};
// unit art indexed by the sim's numeric kind id (UNIT_ID order)
const KIND_UV = UNIT_KINDS.map((k) => UNIT_ART[k].uv);
const KIND_SPRITE = UNIT_KINDS.map((k) => UNIT_ART[k].sprite);
const KIND_FLYING = UNIT_KINDS.map((k) => !!UNIT_STATS[k].flying);
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

    this.terrain = this.makeBatch(NCELLS + 512); // tiles + decor/pine props
    this.dyn = this.makeBatch(MAX_UNITS + 2048);

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

  /** rebuild the static tile batch — call on init and whenever the map changes */
  rebuildTerrain(src: { terrain: Terrain }): void {
    const gl = this.gl;
    const t = this.terrain;
    const T = src.terrain;
    t.n = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        const cx = (x + 0.5) * CELL, cy = (y + 0.5) * CELL;
        // pine cells (and tower cells, which aren't in terrain.blocked at
        // all) get their floor painted; props draw over it below
        const uvr =
          T.blocked[i] && T.wall[i] < UV_WALLS.length
            ? UV_WALLS[T.wall[i]]
            : UV_FLOORS[T.floor[i]];
        this.push(t, cx, cy, CELL, CELL, 0, uvr, 1, 1, 1, 1);
      }
    }
    for (const d of T.decor)
      this.push(t, d.x, d.y, d.size, d.size, d.rot, UV_DECOR[d.kind], 1, 1, 1, 1);
    for (const p of T.pines)
      this.push(t, p.x, p.y, p.size, p.size, p.rot, UV_PINE, 1, 1, 1, 1);
    gl.bindVertexArray(t.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, t.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, t.data, 0, t.n * FLOATS);
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
    this.draw(this.terrain, false);
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
    this.draw(this.terrain, false);

    const dyn = this.dyn;
    dyn.n = 0;
    for (const t of sim.towers) {
      const px = TOWERS[t.kind].size * CELL;
      const base = TOWERS[t.kind].size >= 3 ? UV_TOWER_BASE3 : UV_TOWER_BASE;
      this.push(dyn, t.x, t.y, px, px, 0, base, 1, 1, 1, 1);
      this.push(dyn, t.x, t.y, px, px, t.angle, UV_TURRETS[t.kind], 1, 1, 1, 1);
    }
    const { upx, upy, uvx, uvy, uhp, uhpmax, ukind, n } = sim;
    // painter's order in three passes: ground units, then flyer shadows on
    // top of the crowd, then the flyers themselves above everything
    for (let pass = 0; pass < 3; pass++) {
      const wantFly = pass > 0;
      for (let i = 0; i < n; i++) {
        const k = ukind[i];
        if (KIND_FLYING[k] !== wantFly) continue;
        const usz = KIND_SPRITE[k];
        const rot = Math.atan2(uvy[i], uvx[i]);
        if (pass === 1) {
          this.push(dyn, upx[i] + SHADOW_OFF, upy[i] + SHADOW_OFF, usz, usz, rot, KIND_UV[k], 0, 0, 0, SHADOW_ALPHA);
          continue;
        }
        // hp thirds of the unit's own max, so every kind tints alike
        const t3 = (uhp[i] * 3) / uhpmax[i];
        const tint = HP_TINT[t3 <= 1 ? 0 : t3 <= 2 ? 1 : 2];
        this.push(
          dyn,
          upx[i],
          upy[i],
          usz,
          usz,
          rot,
          KIND_UV[k],
          tint[0], tint[1], tint[2], 1,
        );
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
