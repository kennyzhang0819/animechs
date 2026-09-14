import { UNIT_KINDS, UNIT_STATS, type UnitKind } from "./levels";

/**
 * THE SHAPE OF A BODY.
 *
 * Every hitbox in this game used to be a circle: one `radius` per kind
 * (UnitStats.radius), the same distance in every direction. That is fine
 * for a mech and wrong for an animal — a deer is long and narrow, a frog
 * is nearly square, an elephant is simply bigger than both — and a swarm
 * of animals whose shots all land on a circle reads as a swarm of discs
 * wearing animal pictures.
 *
 * So a kind's hitbox is two numbers instead of one:
 *
 *   `long`   nose to tail, ALONG the way the body faces (urot)
 *   `wide`   flank to flank, ACROSS it
 *
 * Both are FULL EXTENTS in px, the way the roster's comments have always
 * quoted a hitbox ("a 2.75x2.75-block hitbox"), so a square one is
 * `long === wide === radius * 2` and is exactly the circle it was before.
 * That is the default for every kind that does not say otherwise, which is
 * why adding this module changed no number anywhere: the authored roster
 * is still thirty-six circles until somebody reshapes one.
 *
 * IT IS AN ELLIPSE, NOT A RECTANGLE, and the reason is the sim. Some
 * thirty places ask the same question — `is (x, y) within r of this
 * body?` — and every one of them is written as
 *
 *     dx * dx + dy * dy < (r + urad[i]) ** 2
 *
 * An ellipse has a closed form for its radius in any direction, so all
 * thirty keep their shape and swap one scalar (see Sim.hitR). A rectangle
 * would need a different test, a different early-out and a different
 * broad-phase pad at every one of them, for a difference of a few px in
 * the corners of a shape the player never sees drawn. The admin editor
 * draws the bounding box AND the ellipse inside it, so what you reshape
 * is what the sim uses.
 *
 * THE NOMINAL RADIUS IS DERIVED FROM THE SHAPE, not carried beside it:
 * `urad` is the GEOMETRIC MEAN of the two semi-axes, which is the radius
 * of the circle with the same area. That is what mass (impulse), splash
 * reach, aura reach, the shield halo, the pick target and every effect
 * size read, so a body reshaped in the editor gets heavier when it gets
 * bigger and keeps its weight when it is merely stretched. A square
 * hitbox's mean is its own radius, so nothing moves until a dial does.
 */
export interface HitboxSpec {
  /** nose to tail, along the facing — full extent in px */
  long: number;
  /** flank to flank, across the facing — full extent in px */
  wide: number;
}

/**
 * The sane range a saved extent may land in. The floor is a body a shot
 * can still be aimed at; the ceiling is comfortably past the widest thing
 * on the roster (the stoop5's 7.25-block hull, 145px), so it catches a
 * fat finger rather than expressing a design.
 */
export const HITBOX_MIN = 2;
export const HITBOX_MAX = 400;

const N = UNIT_KINDS.length;

/**
 * The physics size split: the roster's radii cluster into a numerous small
 * class (10..18.75px — runts to elites, the actual swarm) and a sparse
 * heavy class (25px up — the stoop3 and the T4/T5 hulls). Cut between the
 * clusters. A HEAVY unit owns every pair it is part of in the physics
 * pass, so the swarm's scan window is sized by the widest SMALL unit alive
 * rather than by the ironhide5 three lanes over; the handful of heavies
 * scan the wide window themselves. The split reads the OUTER radius, so a
 * body stretched past the line in the editor starts owning its own pairs.
 */
export const HEAVY_R = 20;

// --- the derived tables, REWRITTEN IN PLACE -------------------------------
//
// The sim holds these arrays directly and reads them every tick, and the
// override document lands at startup AFTER this module is imported (see
// balance.ts loadBalanceDoc). So a rebuild must never hand out new arrays:
// it refills the ones every reader is already pointing at, and a reshape
// therefore reaches a Sim that is already running.

/** semi-axis ALONG the facing, px */
export const HB_A = new Float32Array(N);
/** semi-axis ACROSS the facing, px */
export const HB_B = new Float32Array(N);
/** sqrt(a * b) — the equal-area circle, and what `urad` is set to */
export const HB_MEAN = new Float32Array(N);
/** max(a, b) — what every broad-phase pad has to reach */
export const HB_OUTER = new Float32Array(N);
/** 1 when the two axes differ, so the round kinds skip the oval maths */
export const HB_OVAL = new Uint8Array(N);
/** 1 when this kind owns its physics pairs (see HEAVY_R) */
export const HB_HEAVY = new Uint8Array(N);
/**
 * The widest OUTER radius on each layer over the whole roster — the static
 * broad-phase bound. Ground and air never touch each other, so a
 * ground-only query that padded itself by the stoop4's hull would sweep
 * more than twice the buckets it can ever hit. An object rather than three
 * consts because the numbers move when a shape is overridden.
 */
export const HB_RMAX = { ground: 0, air: 0, both: 0 };

/** the shape a kind is AUTHORED with: its own, or the circle its radius makes */
export function authoredHitbox(kind: UnitKind): HitboxSpec {
  const s = UNIT_STATS[kind];
  return s.hitbox ?? { long: s.radius * 2, wide: s.radius * 2 };
}

/** what the admin editor has bent, by kind — empty in a shipped build */
const OVERRIDES = new Map<UnitKind, HitboxSpec>();

/** the shape in force right now: the override if there is one, else authored */
export function hitboxOf(kind: UnitKind): HitboxSpec {
  return OVERRIDES.get(kind) ?? authoredHitbox(kind);
}

/** is this kind bent away from what the roster authored? */
export const hitboxBent = (kind: UnitKind): boolean => OVERRIDES.has(kind);

const clampExtent = (v: number): number =>
  Math.min(HITBOX_MAX, Math.max(HITBOX_MIN, v));

/** refill every derived table from the shapes in force */
function rebuild(): void {
  let g = 0, a = 0;
  for (let i = 0; i < N; i++) {
    const kind = UNIT_KINDS[i];
    const box = hitboxOf(kind);
    const ha = clampExtent(box.long) / 2;
    const hb = clampExtent(box.wide) / 2;
    HB_A[i] = ha;
    HB_B[i] = hb;
    HB_MEAN[i] = Math.sqrt(ha * hb);
    const outer = Math.max(ha, hb);
    HB_OUTER[i] = outer;
    HB_OVAL[i] = ha === hb ? 0 : 1;
    HB_HEAVY[i] = outer > HEAVY_R ? 1 : 0;
    if (UNIT_STATS[kind].flying) {
      if (outer > a) a = outer;
    } else if (outer > g) g = outer;
  }
  HB_RMAX.ground = g;
  HB_RMAX.air = a;
  HB_RMAX.both = Math.max(g, a);
}

rebuild();

/**
 * Reshape one kind, or hand `undefined` to put it back to what the roster
 * authored. The editor calls this on every drag, which is why the rebuild
 * is a pass over thirty-six kinds and not over the units on the field —
 * the shape is per kind, and a live Sim reads these tables every tick.
 */
export function setHitbox(kind: UnitKind, box: HitboxSpec | undefined): void {
  if (box) OVERRIDES.set(kind, { long: clampExtent(box.long), wide: clampExtent(box.wide) });
  else OVERRIDES.delete(kind);
  rebuild();
}

/**
 * The `hitboxes` section of the balance document, applied whole. CLEARS
 * what it held first, so a kind dropped from the file goes back to its
 * authored shape rather than lingering from the last load — the same
 * contract every other apply* in balance.ts keeps.
 */
export function applyHitboxOverrides(o: Record<string, Partial<HitboxSpec>>): void {
  OVERRIDES.clear();
  for (const kind of UNIT_KINDS) {
    const raw = o[kind];
    if (!raw || typeof raw !== "object") continue;
    const authored = authoredHitbox(kind);
    const long = typeof raw.long === "number" && Number.isFinite(raw.long) ? raw.long : authored.long;
    const wide = typeof raw.wide === "number" && Number.isFinite(raw.wide) ? raw.wide : authored.wide;
    OVERRIDES.set(kind, { long: clampExtent(long), wide: clampExtent(wide) });
  }
  rebuild();
}

/** every shape bent right now, as the document section — for currentBalanceDoc */
export function allHitboxOverrides(): Record<string, HitboxSpec> {
  const out: Record<string, HitboxSpec> = {};
  for (const [kind, box] of OVERRIDES) out[kind] = { ...box };
  return out;
}

/**
 * The body's radius in ONE direction — the ellipse's own polar form,
 * r(t) = 1 / sqrt((cos t / a)^2 + (sin t / b)^2), with the direction
 * rotated into the body's frame first. `dx, dy` is the vector between the
 * body and whatever is asking (either way round: an ellipse is symmetric
 * through its centre) and `d2` is its squared length, which every caller
 * has already computed for the distance test it is about to run.
 *
 * The sim's own copy of this is Sim.hitR, which reaches the same answer
 * off the sim's arrays without a call per candidate. This one is for
 * everybody else — the editor's preview, and anything that has a kind and
 * a heading rather than a unit index.
 */
export function hitboxRadius(
  kindId: number,
  rot: number,
  dx: number,
  dy: number,
  d2: number,
): number {
  const a = HB_A[kindId], b = HB_B[kindId];
  if (a === b) return a;
  if (d2 <= 1e-8) return Math.min(a, b);
  const inv = 1 / Math.sqrt(d2);
  const c = Math.cos(rot), s = Math.sin(rot);
  const lx = ((dx * c + dy * s) * inv) / a;
  const ly = ((dy * c - dx * s) * inv) / b;
  return 1 / Math.sqrt(lx * lx + ly * ly);
}
