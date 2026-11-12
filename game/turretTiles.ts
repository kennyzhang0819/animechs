// The turret tiles at every footprint (docs/style-concepts.html): a 1x1 is
// the hand-drawn 16 px tile in chibiArt.ts; a 2x2, 3x3 and 4x4 are drawn
// here at 32, 48 and 64 px with the same vocabulary — a plate with a light
// top edge and a dark front strip, a round breech, barrels, one accent —
// so a bigger turret is a bigger gun with more parts, never a scaled one.
import { PLATE, WEAPON_PIC, type Ammo, type Pic } from "./chibiArt";
import { INK, Pen, lift, shade } from "./spriteArt";

const C = {
  plate: "#a8a39c", plateLit: "#d6d3cc", plateDark: "#6f6a66",
  iron: "#4a4f63", ironLit: "#6f7590", steel: "#d0d6e4", brass: "#f0c04a", wood: "#c98a4b", woodDark: "#8a5a2b",
  bullet: "#e08a3f", shell: "#f0c04a", flame: "#ff6a3d", flameLit: "#ffd84a", tank: "#e8413f",
  beam: "#5ea8ff", beamLit: "#dff6ff", water: "#3d8dff", waterLit: "#bfe6ff", field: "#5fe2b0", missile: "#ff5f7a", toxin: "#8ee04a", toxinLit: "#d4ff3a", bore: INK,
};

/** the plate for a footprint `size` cells on a side, 16 px a cell */
export function platePic(size: number): Pic {
  if (size <= 1) return PLATE;
  const n = size * 16;
  const P = new Pen(n, n);
  const cut = 2;
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const dx = Math.min(x - 1, n - 2 - x), dy = Math.min(y - 1, n - 2 - y);
    if (dx + dy < cut) continue;
    const c = y >= n - 4 ? C.plateDark : y === 1 || (x === 1 && y < n - 4) ? C.plateLit : C.plate;
    P.put(x, y, c);
  }
  // a seam a cell in from the rim, so the slab reads as courses
  for (let i = 1; i < size; i++) { for (let x = 3; x < n - 3; x++) P.put(x, i * 16, C.plateDark); }
  P.outline();
  return P.pic(n / 2);
}

/** a barrel pointing up from (x, y0) to y1, `w` wide, with a dark muzzle */
function barrel(P: Pen, x: number, y0: number, y1: number, w: number, col: string): void {
  P.rect(x - w / 2, y1, x + w / 2, y0, C.iron);
  P.rect(x - w / 2 + 1, y1, x + w / 2 - 1, y1 + Math.max(1, Math.round(w * 0.6)), col);
  P.rect(x - w / 2 + 1, y1 + Math.max(1, Math.round(w * 0.6)), x + w / 2 - 1, y1 + Math.max(2, Math.round(w * 0.6) + 1), C.bore);
}
/** the breech: a round body with a lighter cap and a brass band */
function breech(P: Pen, cx: number, cy: number, r: number, body = C.iron): void {
  P.ellipse(cx, cy, r, r, body);
  P.rect(cx - r, cy - 1, cx + r + 1, cy + 1, C.brass);
  P.ellipse(cx, cy, r * 0.45, r * 0.45, C.ironLit);
  P.put(cx - r * 0.3, cy - r * 0.3, C.steel);
}
const rockets = (P: Pen, x0: number, y0: number, cols: number, rows: number, w: number, gap: number): void => {
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = x0 + i * (w + gap), y = y0 + j * (w * 2 + gap);
    P.rect(x, y + w, x + w, y + w * 2, C.steel);
    P.rect(x, y, x + w, y + w, C.missile);
  }
};

/** the weapon seen from above, pointing up, on an n = 16 * size px tile */
export function weaponPic(ammo: Ammo, size: number): Pic {
  if (size <= 1) return WEAPON_PIC[ammo];
  const n = size * 16;
  const P = new Pen(n, n);
  const c = n / 2;
  const u = n / 16; // one px of the 1x1 tile
  switch (ammo) {
    case "bullet": { // a battery: two, three or four barrels off a heavy breech
      const r = 3.6 * u;
      const k = size === 2 ? 2 : size === 3 ? 3 : 4;
      const w = Math.max(3, Math.round((size === 4 ? 2.2 : 1.8) * u));
      const span = (k - 1) * (w + 2);
      for (let i = 0; i < k; i++) barrel(P, c - span / 2 + i * (w + 2), c + 2 * u, 2 * u, w, C.bullet);
      if (size === 4) P.rect(c - r, c - r * 0.3, c + r, c + r * 0.3, C.steel);
      breech(P, c, c + 2.5 * u, r);
      break;
    }
    case "shell": { // a mortar mouth, and at the big sizes a row of them
      const k = size === 2 ? 1 : size === 3 ? 2 : 3;
      const rr = size === 2 ? 5.5 * u : size === 3 ? 3.6 * u : 3.2 * u;
      const gap = rr * 2 + Math.round(u);
      for (let i = 0; i < k; i++) {
        const x = c - ((k - 1) * gap) / 2 + i * gap, y = c + (size === 2 ? 0 : -u);
        P.ellipse(x, y, rr, rr, C.steel);
        P.ellipse(x, y, rr - 2, rr - 2, C.iron);
        P.ellipse(x, y, rr * 0.5, rr * 0.5, C.bore);
      }
      P.rect(c - 7 * u, c + 5 * u, c + 7 * u, c + 7 * u, C.shell);
      if (size === 4) P.rect(c - 7 * u, c - 7 * u, c + 7 * u, c - 5 * u, C.iron);
      break;
    }
    case "flame": { // a red tank and nozzles up with flame tips
      const k = size === 2 ? 1 : size === 3 ? 2 : 3;
      const w = Math.max(3, Math.round(2 * u));
      const span = (k - 1) * (w + 3);
      for (let i = 0; i < k; i++) {
        const x = c - span / 2 + i * (w + 3);
        P.rect(x - w / 2, 3.5 * u, x + w / 2, c, C.steel);
        P.tri([x - w, 3.5 * u], [x + w, 3.5 * u], [x, 0.5 * u], C.flame);
        P.tri([x - w * 0.4, 3 * u], [x + w * 0.4, 3 * u], [x, 1.5 * u], C.flameLit);
      }
      P.ellipse(c, c + 3 * u, 5 * u, 4.5 * u, C.tank);
      P.rect(c - 5 * u, c + 2.5 * u, c + 5 * u + 1, c + 3.5 * u, C.steel);
      P.ellipse(c, c + 3 * u, 1.5 * u, 1.5 * u, C.iron);
      if (size >= 3) { P.ellipse(c - 6 * u, c + 5 * u, 2 * u, 2 * u, C.tank); P.ellipse(c + 6 * u, c + 5 * u, 2 * u, 2 * u, C.tank); }
      break;
    }
    case "beam": { // a big orb, and at the big sizes a ring of small ones
      P.rect(c - 2 * u, c + 2 * u, c + 2 * u, c + 7 * u, C.iron);
      P.ellipse(c, c, 4.5 * u, 4.5 * u, C.beam);
      P.ellipse(c - 1.5 * u, c - 1.5 * u, 1.5 * u, 1.5 * u, C.beamLit);
      if (size >= 3) for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; P.ellipse(c + Math.cos(a) * 6 * u, c + Math.sin(a) * 6 * u, 1.5 * u, 1.5 * u, C.beam); }
      for (let i = 0; i < (size === 2 ? 4 : 6); i++) { const a = (i / (size === 2 ? 4 : 6)) * Math.PI * 2; P.put(c + Math.cos(a) * 7 * u, c + Math.sin(a) * 7 * u, C.beamLit); }
      break;
    }
    case "water": { // a blue tank with nozzles up
      const k = size === 2 ? 1 : 2;
      const w = Math.max(3, Math.round(2 * u));
      for (let i = 0; i < k; i++) { const x = c - ((k - 1) * (w + 4)) / 2 + i * (w + 4); P.rect(x - w / 2, 2 * u, x + w / 2, c, C.steel); P.rect(x - w / 2 + 1, 2 * u, x + w / 2 - 1, 3 * u, C.water); }
      P.ellipse(c, c + 2.5 * u, 5.5 * u, 5 * u, C.water);
      P.ellipse(c - 2 * u, c + 0.5 * u, 2 * u, 1.3 * u, C.waterLit);
      P.rect(c - 5.5 * u, c + 2 * u, c + 5.5 * u + 1, c + 3 * u, C.steel);
      if (size === 4) P.ellipse(c, c + 2.5 * u, 2 * u, 2 * u, C.iron);
      break;
    }
    case "field": { // a crossbow: the bow across, the stock down, arrows up
      const bw = 7 * u;
      P.line(c - bw, c, c - bw * 0.5, c - 3 * u, Math.max(2, 1.2 * u), C.woodDark);
      P.line(c - bw * 0.5, c - 3 * u, c + bw * 0.5, c - 3 * u, Math.max(2, 1.2 * u), C.woodDark);
      P.line(c + bw * 0.5, c - 3 * u, c + bw, c, Math.max(2, 1.2 * u), C.woodDark);
      P.rect(c - 1.5 * u, c - 3 * u, c + 1.5 * u, c + 7 * u, C.wood);
      const k = size >= 3 ? 2 : 1;
      for (let i = 0; i < k; i++) { const x = c + (i - (k - 1) / 2) * 3 * u; P.rect(x - 0.5 * u, 2 * u, x + 0.5 * u + 1, c + 3 * u, C.steel); P.tri([x - 1.2 * u, 2.5 * u], [x + 1.2 * u + 1, 2.5 * u], [x, 0.5 * u], C.steel); }
      P.rect(c - 2 * u, c + 4 * u, c + 2 * u + 1, c + 5 * u, C.field);
      break;
    }
    case "missile": { // a rack of rockets: 2x2, 3x2, 4x3
      const cols = size === 2 ? 2 : size === 3 ? 3 : 4, rows = size === 4 ? 3 : 2;
      const w = Math.max(3, Math.round(2.2 * u)), gap = Math.max(1, Math.round(u));
      const bw = cols * (w + gap) + gap, bh = rows * (w * 2 + gap) + gap;
      P.rect(c - bw / 2 - u, c - bh / 2 - u, c + bw / 2 + u, c + bh / 2 + u, C.iron);
      P.rect(c - bw / 2, c - bh / 2, c + bw / 2, c + bh / 2, shade(C.iron));
      rockets(P, c - bw / 2 + gap, c - bh / 2 + gap, cols, rows, w, gap);
      break;
    }
    case "toxin": { // a green pot with nozzles and bubbles
      const k = size === 2 ? 1 : size === 3 ? 2 : 3;
      const w = Math.max(3, Math.round(2 * u));
      for (let i = 0; i < k; i++) { const x = c - ((k - 1) * (w + 3)) / 2 + i * (w + 3); P.rect(x - w / 2, 2 * u, x + w / 2, c, C.steel); }
      P.ellipse(c, c + 2.5 * u, 5.5 * u, 5 * u, C.toxin);
      P.ellipse(c, c + 2.5 * u, 2.5 * u, 2.5 * u, C.toxinLit);
      P.ellipse(c, c + 2.5 * u, 1.2 * u, 1.2 * u, shade(C.toxin));
      for (const [bx, by, br] of [[c - 6.5 * u, c - 3 * u, 1.2 * u], [c + 6 * u, c - 4 * u, 1.5 * u], [c + 7 * u, c + 1 * u, 0.9 * u]]) P.ellipse(bx, by, br, br, lift(C.toxin));
      break;
    }
  }
  P.outline();
  return P.pic(c);
}
