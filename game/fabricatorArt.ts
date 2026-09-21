/**
 * THE FABRICATORS — the two houses a map may stand up to keep sending the
 * swarm (levels.ts `fabricatorSmall`, `fabricatorLarge`;
 * docs/mission-marks.md). Drawn out of the siege's plate and crux
 * (wardenArt.ts) like the pylons are: built things, not animals.
 *
 * One body plan at two sizes — a bay slot at the front on a crux sill, a
 * skull filling the hull behind it — and the face says which house: the
 * small one wears a bare skull, the large one a horned skull with its jaw.
 */
import type { MechParts } from "./animalArt";
import { scaler } from "./ironhideArt";
import { FABRICATOR_TILES } from "./levels";
import { BORE, GUN, STEEL, bars, draw, drawWithCell, plate, rev, type Mat, type Pen } from "./turretArt";
import { ARMOUR, CRUX, type WardenTier } from "./wardenArt";

export interface FabricatorTier extends WardenTier {
  /** 3 for the small house, 5 for the large — the heaviest tier it sends */
  t: number;
}

/** one grid a house, 32 native px a tile of footprint */
export const FABRICATOR_TIERS: readonly FabricatorTier[] = FABRICATOR_TILES.map((tiles, i) => ({
  n: tiles * 32,
  stride: 0,
  t: [3, 5][i],
}));

const ARMOUR_R = rev(ARMOUR);

function skull(P: Pen, cx: number, cy: number, r: number, jaw: boolean, horns: boolean): void {
  const R = Math.round;
  const rx = R(r * 0.9);
  if (horns) {
    // one horn behind the cranium, a stair of crux blocks sweeping out
    // and up from its shoulder; the mirror puts the other on
    const step = Math.max(4, R(r * 0.16));
    let x = cx - R(rx * 0.8), y = cy - R(r * 0.55);
    for (let k = 0; k < 5; k++) {
      P.box(x - step, y - step, x + step, y + step, k === 4 ? rev(CRUX) : CRUX);
      x -= step;
      y -= R(step * 0.55);
    }
  }
  // the cranium: a chamfered dome, wider than tall, carried on down to
  // the chin in one piece — angles, not a circle
  P.octa(cx - rx, cy - r, cx + rx, cy + R(r * 0.45), R(r * 0.4), STEEL);
  const ck = R(r * 0.7);
  const chin = cy + R(r * (jaw ? 0.95 : 0.85));
  P.octa(cx - ck, cy + R(r * 0.2), cx + ck, chin, R(r * (jaw ? 0.2 : 0.15)), STEEL);
  // the sockets: wide chamfered cuts, the outer top corner filled back so
  // each one slants inward — a glare rather than a stare
  const sw = R(r * 0.36), sh = R(r * 0.26), ch = Math.max(2, R(r * 0.1));
  const sx = cx - R(r * 0.45), sy = cy - R(r * 0.2);
  P.octa(sx - sw, sy - sh, sx + sw, sy + sh, ch, BORE);
  P.box(sx - sw, sy - sh, sx - (sw >> 1), sy - sh + Math.max(3, R(r * 0.14)), STEEL);
  P.diamond(cx, cy + R(r * 0.42), Math.max(3, R(r * 0.14)), BORE);
  if (jaw) P.box(cx - ck + R(r * 0.2), cy + R(r * 0.72), cx + ck - R(r * 0.2), cy + R(r * 0.72) + Math.max(3, R(r * 0.07)), BORE);
  // fangs: chamfered blocks hanging half off the chin, the hull showing
  // between them
  const nr = Math.max(3, R(r * 0.16));
  for (let x = cx - ck + R(r * 0.1) + nr * 2; x < cx; x += R(nr * 2.5))
    P.octa(x - nr, chin - nr, x + nr, chin + nr, nr - 1, STEEL);
}

function fabricatorBody(P: Pen, T: FabricatorTier): void {
  const { n, t } = T;
  const { q, w } = scaler(n);
  const c = n / 2;
  const R = Math.round;
  const large = t >= 5;
  // the hull, inset so the foundation's rim shows round it
  P.octa(w(2), w(2), n - w(2), n - w(2), w(5), ARMOUR);
  P.octa(q(6), q(6), n - q(6), n - q(6), w(3), ARMOUR_R);
  bars(P, q(9), c - w(3), n - q(8), 2, w(2), w(2));
  P.box(q(4), q(14), q(4) + w(4), n - q(6), GUN);
  P.box(q(4), q(14), q(4) + w(4), q(14) + w(3), rev(GUN));
  // square anchors, never discs: two pale rounds at the front are eyes
  if (large) {
    P.box(w(3), w(3), w(3) + w(5), w(3) + w(5), STEEL);
    P.box(w(3), n - w(3) - w(5), w(3) + w(5), n - w(3), STEEL);
  }
  // the bay at the front: a dark slot between two steel posts, on a crux
  // sill — the sill is the accent both houses wear
  const dw = w(5 + t);
  P.box(c - dw - w(1), q(2), c + dw + w(1), q(6), STEEL);
  P.box(c - dw, q(2), c + dw, q(6), BORE);
  P.box(c - dw - w(1), q(6), c + dw + w(1), q(6) + w(2), CRUX);
  // the skull fills what is left of the hull behind the sill
  const mid = (q(6) + w(2) + n - w(2)) / 2;
  const r = q(large ? 8 : 7);
  const below = large ? 1.07 : 0.97;
  skull(P, c, R(mid - (r * (1 + below)) / 2 + r), r, large, large);
}

function fabricatorBase(P: Pen, T: FabricatorTier): void {
  const { n } = T;
  const { w } = scaler(n);
  plate(P, 0, 0, n, n, w(6), GUN, w(2));
}

export function fabricatorMech(T: FabricatorTier): MechParts {
  const { art, cell } = drawWithCell(T.n, (P) => fabricatorBody(P, T), CRUX);
  return {
    body: art,
    base: draw(T.n, (P) => fabricatorBase(P, T)),
    leg: { n: T.n, px: new Array<string | null>(T.n * T.n).fill(null) },
    cell,
    stride: T.stride,
  };
}

export const FABRICATOR_MATS: readonly Mat[] = [ARMOUR, CRUX, GUN, STEEL, BORE];
