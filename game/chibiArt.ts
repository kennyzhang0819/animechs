// The chibi sprite set (docs/style-concepts.html, scripts/chibi-concepts.mjs):
// hand-authored 16 x 20 px sprites, one size for everything — a big head,
// large eyes, a mouth, a small body, one feature that says who it is, a
// dark outline, flat colours. Enemies by family, turrets by what they
// throw, the props and the core.
export type Ink = string | null;
export interface Pic { w: number; h: number; px: Ink[] }

// ── the palette ────────────────────────────────────────────────────────
const K = "#1a1a2e"; // the outline
export const PAL: Record<string, string> = {
  W: "#ffffff", P: "#1a1a2e", // eye white, pupil
  r: "#ff7b7b", // cheek
  // rhino
  G: "#9fb0c8", g: "#6d7f9c", H: "#f5efd9", R: "#e8413f",
  // stag
  T: "#e0a860", t: "#a8713a", A: "#fff2d6", E: "#55b857",
  // frog
  F: "#6ad06a", f: "#3f9a46", L: "#d4ff3a", B: "#3f6fe0",
  // bat
  V: "#b385d8", v: "#7a4fa8", M: "#ff5fd6", D: "#3b2a55",
  // manta
  C: "#6fb8e8", c: "#3f7fb8", S: "#dff3ff",
  // boss eagle
  Y: "#f2c94c", y: "#b8862a", N: "#5a3a1a", O: "#ff9a3b",
  // turrets
  I: "#4a4f63", i: "#2c2f3e", s: "#d0d6e4", o: "#c98a4b", d: "#8a5a2b", a: "#f0c04a", e: "#ff6a3d", l: "#ffd84a",
  b: "#5ea8ff", u: "#3d8dff", m: "#ff5f7a", n: "#8ee04a", p: "#5fe2b0", q: "#a8a39c", x: "#6f6a66",
  Q: "#d6d3cc",
  // props
  j: "#58b84c", J: "#9be36a", k2: "#2f8a3c", h: "#9a6a3a", z: "#b3ab9f", Z: "#7d766e",
};

/** a 16 x 20 sprite from rows of letters; `.` is clear, `k` is the outline */
export function sprite(rows: readonly string[], pal: Record<string, string> = PAL): Pic {
  const h = rows.length, w = rows[0].length;
  for (const r of rows) if (r.length !== w) throw new Error(`a sprite row is ${r.length} wide, not ${w}: ${r}`);
  const px: Ink[] = new Array<Ink>(w * h).fill(null);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === ".") continue;
    if (ch === "k") { px[y * w + x] = K; continue; }
    const c = pal[ch];
    if (!c) throw new Error(`no colour for '${ch}' at ${x},${y}`);
    px[y * w + x] = c;
  }
  return { w, h, px };
}

// ── enemies: one animal a line, one size ───────────────────────────────
export const RHINO = sprite([
  "................",
  "....kk....kk....",
  "...kGGk..kGGk...",
  "..kkGGkkkkGGkk..",
  ".kGGGGGGGGGGGGk.",
  ".kGGGGGGGGGGGGk.",
  ".kGGkWWkGGkWWkGk",
  ".kGGkWPkGGkWPkGk",
  ".kGGGGGGGGGGGGk.",
  ".kGGGGkHHkGGGGk.",
  "..kGGGkHHkGGGk..",
  "...kkkkHHkkkk...",
  "...kggkkkkggk...",
  "..kggRRRRRRggk..",
  "..kgggRRRRgggk..",
  "...kgggggggg k..".replace(" ", "k"),
  "....kggkkggk....",
  "....kggk.kggk...",
  "....kkkk.kkkk...",
  "................",
]);
export const STAG = sprite([
  "..kAk......kAk..",
  ".kAAAk....kAAAk.",
  ".kAkAk....kAkAk.",
  "..kkAk....kAkk..",
  "...kTkkkkkkTk...",
  "..kTTTTTTTTTTk..",
  ".kTTTTTTTTTTTTk.",
  ".kTkWWkTTkWWkTk.",
  ".kTkWPkTTkWPkTk.",
  ".kTTTTTAAAATTTk.",
  "..kTTTTAkkATTk..",
  "...kkkkAAAAkk...",
  "...kEEkkkkkEEk..",
  "..kEEEEEEEEEEk..",
  "..kEtEEEEEEtEk..",
  "...kEEEEEEEEk...",
  "....kttkkttk....",
  "....kttk.kttk...",
  "....kkkk.kkkk...",
  "................",
]);
export const FROG = sprite([
  "................",
  "...kkk....kkk...",
  "..kWWWk..kWWWk..",
  "..kWPWk..kWPWk..",
  ".kkWWWkkkkWWWkk.",
  ".kFFkkkFFFkkkFFk",
  ".kFFFFFFFFFFFFFk",
  ".kFFFFFFFFFFFFFk",
  ".kFkkkkkkkkkkkFk",
  ".kFFFFFFFFFFFFFk",
  "..kFFLLLLLLLFFk.",
  "...kkLLLLLLLkk..",
  "...kffkkkkkffk..",
  "..kfffBBBBfffk..",
  "..kffBBBBBBffk..",
  "...kffffffffk...",
  "..kffk.kk.kffk..",
  "..kkkk....kkkk..",
  "................",
  "................",
]);
export const BAT = sprite([
  "..kk........kk..",
  ".kVVk......kVVk.",
  ".kVMVk....kVMVk.",
  ".kVVVVkkkkVVVVk.",
  ".kVVVVVVVVVVVVk.",
  "kkVVVVVVVVVVVVkk",
  "kDkVkWWkVVkWWkDk",
  "kDkVkWPkVVkWPkDk",
  "kDkVVVVVVVVVVkDk",
  "kDkVVVkWkWkVVkDk",
  "kDkkVVVkkkVVkkDk",
  "kDDkkkvvvvkkkDDk",
  "kDDkvvMMMMvvkDDk",
  ".kkkvvvMMvvvkkk.",
  "...kvvvvvvvvk...",
  "....kvvkkvvk....",
  "....kvvk.kvvk...",
  "....kkkk.kkkk...",
  "................",
  "................",
]);
export const MANTA = sprite([
  "................",
  ".......kk.......",
  "......kccK......".replace("K", "k"),
  ".....kccckk.....",
  "...kkkCCCCkkk...",
  "..kCCCCCCCCCCk..",
  ".kCCCCCCCCCCCCk.",
  ".kCkWWkCCkWWkCk.",
  ".kCkWPkCCkWPkCk.",
  ".kCCCCCCCCCCCCk.",
  ".kCCCCCkkCCCCCk.",
  "kkCCCCCCCCCCCCkk",
  "kckkSSSSSSSSkkck",
  "kcckSSSSSSSSkcck",
  ".kkkSSSSSSSSkkk.",
  "...kkSSSSSSkk...",
  ".....kkSSkk.....",
  "......kkkk......",
  "................",
  "................",
]);
export const EAGLE = sprite([
  "......kkkk......",
  ".....kYYYYk.....",
  "....kYYYYYYk....",
  "...kYYYYYYYYk...",
  "..kYYYYYYYYYYk..",
  "..kYkWWkYYkWWkk.",
  "..kYkWPkYYkWPkYk",
  "..kYYYYYOOYYYYk.",
  "..kYYYYkOOkYYYk.",
  "...kYYYYkkYYYk..",
  "kk..kkkkkkkkk.kk",
  "kNkkkNNNNNNkkkNk",
  "kNNNkNNNNNNkNNNk",
  "kNNNNkNNNNkNNNNk",
  ".kNNNNkkkkNNNNk.",
  "..kkkkyyyykkkk..",
  ".....kyykyyk....",
  ".....kOOkOOk....",
  ".....kkkkkkk....",
  "................",
]);

// ── turrets: small weapon objects on a stone pad ───────────────────────
export const CANNON = sprite([
  "................",
  "................",
  "................",
  ".......kkkk.....",
  "....kkkkIIkk....",
  "...kIIIIIIIIk...",
  "..kIIIIIIIIIIkkk",
  "..kIIisssIIIIkik",
  "..kIIisssIIIIkik",
  "..kIIIIIIIIIIkkk",
  "...kIIIIIIIIk...",
  "..kkkkkkkkkkkk..",
  ".kooooooooooook.",
  ".kodkkkookkkdok.",
  ".kokddkookddkok.",
  ".kokddkookddkok.",
  ".kokkkkookkkkok.",
  "..kkkkkkkkkkkk..",
  "................",
  "................",
]);
export const CROSSBOW = sprite([
  "................",
  "................",
  "....kk....kk....",
  "...kddk..kddk...",
  "...kdddkkdddk...",
  "....kddddddk....",
  ".....kddddk.....",
  "...kkkkddkkkk...",
  "..ksssskakssssk.",
  "...kkkkkakkkkk..",
  ".......kak......",
  ".......kak......",
  "......kkkkk.....",
  "....kkooooookk..",
  "...koooooooooook".replace("oook", "ook."),
  "...koddddddddok.",
  "...kooooooooook.",
  "....kkkkkkkkkk..",
  "................",
  "................",
]);
export const MORTAR = sprite([
  "................",
  "................",
  "........kkkkk...",
  ".......kiiiiik..",
  "......kiikkkiik.",
  ".....kIIkiiikIk.",
  "....kIIIIkkkIIk.",
  "...kIIIIIIIIIk..",
  "..kIIIIIIIIIk...",
  "..kIIIIIIIIk....",
  "..kkIIIIIIk.....",
  ".kaakkkkkk......",
  ".kaaaak.........",
  ".kkkkkkkkkkkkk..",
  "kqqqqqqqqqqqqqk.",
  "kqxxxxxxxxxxxqk.",
  "kqxxxxxxxxxxxqk.",
  "kqqqqqqqqqqqqqk.",
  ".kkkkkkkkkkkkk..",
  "................",
]);
export const FLAMER = sprite([
  "................",
  "........kk.kk...",
  ".......klkklk...",
  "......kleellek..",
  "......keeeeeek..",
  ".......keeek....",
  "....kkkkkkkkk...",
  "...kRRRRRRRRRk..",
  "..kRRRRRRRRRRRk.",
  "..kRRkkkkkkRRRk.",
  "..kRRksssskRRRkk",
  "..kRRksssskRRRki",
  "..kRRkkkkkkRRRkk",
  "..kRRRRRRRRRRRk.",
  "...kRRRRRRRRRk..",
  "....kkkkkkkkk...",
  "...kqqqqqqqqqk..",
  "...kxxxxxxxxxk..",
  "....kkkkkkkkk...",
  "................",
]);
export const TESLA = sprite([
  "....k.......k...",
  ".....k.kkk.k....",
  "......kbbbk.....",
  ".....kbbSbbk....",
  "....kbbbbbbbk...",
  "..k.kbbbbbbbk.k.",
  ".k..kbbbbbbbk..k",
  ".....kbbbbbk....",
  "......kbbbk.....",
  ".......kkk......",
  "......kIIIk.....",
  "......kIIIk.....",
  "......kIIIk.....",
  ".....kkIIIkk....",
  "....kIIIIIIIk...",
  "...kqqqqqqqqqk..",
  "...kxxxxxxxxxk..",
  "....kkkkkkkkk...",
  "................",
  "................",
]);
export const ROCKETS = sprite([
  "................",
  "................",
  "..kk..kk..kk....",
  ".kmmkkmmkkmmk...",
  ".kmmkkmmkkmmk...",
  ".kskkkskkkskk...",
  "kkskkkskkkskkkk.",
  "kIIIIIIIIIIIIIk.",
  "kIIsssssssssIIk.",
  "kIIsssssssssIIk.",
  "kIIIIIIIIIIIIIk.",
  "kkkkkkkkkkkkkkk.",
  ".kooooooooooook.",
  ".kodkkkookkkdok.",
  ".kokddkookddkok.",
  ".kokkkkookkkkok.",
  "..kkkkkkkkkkkk..",
  "................",
  "................",
  "................",
]);
export const WATER = sprite([
  "................",
  "................",
  "................",
  ".....kkkkkk.....",
  "....kuuuuuuk....",
  "...kuuSSuuuuk...",
  "...kuuuuuuuukkk.",
  "...kuuuuuuuuksbk",
  "...kuuuuuuuuksbk",
  "...kkuuuuuukkkk.",
  "....kIIIIIIk....",
  "...kdddddddddk..",
  "...kdoooooooodk.",
  "...kdoooooooodk.",
  "...kdddddddddk..",
  "...kdoooooooodk.",
  "...kkkkkkkkkkk..",
  "................",
  "................",
  "................",
]);
export const SPRAYER = sprite([
  "..............kk",
  ".....kk......knk",
  "....knnk.....kk.",
  "....knnk..kk....",
  ".....kk..knnk...",
  ".....kkkkkkkk...",
  "....knnnnnnnnk..",
  "...knnnnnnnnnnk.",
  "...knnkkkknnnnkk",
  "...knnkLLknnnnks",
  "...knnkLLknnnnks",
  "...knnkkkknnnnkk",
  "...knnnnnnnnnnk.",
  "....knnnnnnnnk..",
  ".....kkkkkkkk...",
  "...kqqqqqqqqqqk.",
  "...kxxxxxxxxxxk.",
  "....kkkkkkkkkk..",
  "................",
  "................",
]);
// props
export const PALM = sprite([
  "....kkkk.kkk....",
  "..kkJJJJkjjjkk..",
  ".kJJJJJjkjjjjjk.",
  "kJJJJkkhkkkjjjjk",
  ".kkkkkhhhkkkkkk.",
  "......khhk......",
  "......khhk......",
  ".....khhhk......",
  ".....khhhk......",
  ".....khhk.......",
  "....khhhk.......",
  "....khhhk.......",
  "....khhk........",
  "...kkhhkk.......",
  "..kjjhhjjk......",
  ".kjjjhhjjjk.....",
  "..kkkkkkkk......",
  "................",
  "................",
  "................",
]);
export const BUSH = sprite([
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "......kkkk......",
  "....kkJJJJkk....",
  "...kJJJJJjjjk...",
  "..kJJJjjjjjjjk..",
  "..kjjjjjjjjjjk..",
  "..kjjjjjjjjjjk..",
  "...kjjjjjjjjk...",
  "....kkjjjjkk....",
  "......kkkk......",
  "................",
  "................",
  "................",
  "................",
  "................",
]);
export const ROCK = sprite([
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "......kkkk......",
  "....kkzzzzkk....",
  "...kzzzzzzzzk...",
  "..kzzzzzzzzzzk..",
  "..kzzzzzZZZzzk..",
  "..kZZZZZZZZZZk..",
  "...kZZZZZZZZk...",
  "....kkkkkkkk....",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
]);


export const KEEP = sprite([
  "................",
  "..kk.kkkkkk.kk..",
  "..kqkkqqqqkkqk..",
  ".kkqqqqqqqqqqkk.",
  ".kqqqkkkkkkqqqk.",
  ".kqqkaaaaaakqqk.",
  ".kqqkaeeeeakqqk.",
  ".kqqkaelleakqqk.",
  ".kqqkaelleakqqk.",
  ".kqqkaeeeeakqqk.",
  ".kqqkaaaaaakqqk.",
  ".kqqqkkkkkkqqqk.",
  ".kqqqqqqqqqqqqk.",
  ".kxxxxxxxxxxxxk.",
  ".kxxkddddddkxxk.",
  ".kxxkddddddkxxk.",
  ".kxxxxxxxxxxxxk.",
  "..kkkkkkkkkkkk..",
  "................",
  "................",
]);

export type Family = "rhino" | "stag" | "frog" | "bat" | "hull" | "boss";
export const FAMILY_OF: Record<string, Family> = {
  ironhide: "rhino", starhart: "stag", dartback: "frog", stoop: "bat", tusker: "rhino", ratking: "rhino", grapnel: "frog", kettle: "bat", whale: "hull", skate: "hull", livewire: "hull", boss: "boss",
};
export const UNIT_PIC: Record<Family, Pic> = { rhino: RHINO, stag: STAG, frog: FROG, bat: BAT, hull: MANTA, boss: EAGLE };
export type Ammo = "bullet" | "shell" | "flame" | "beam" | "water" | "field" | "missile" | "toxin";
export const GUN_PIC: Record<Ammo, Pic> = { bullet: CANNON, shell: MORTAR, flame: FLAMER, beam: TESLA, water: WATER, field: CROSSBOW, missile: ROCKETS, toxin: SPRAYER };
export const GUN_AMMO: Record<string, Ammo> = {
  tacker: "bullet", lobber: "shell", torch: "flame", coil: "beam", duster: "toxin",
  autocannon: "bullet", airburst: "missile", piercer: "beam", douser: "water", tether: "field", hive: "missile", blighter: "toxin",
  cleaver: "flame", barrage: "shell", deluge: "water", whirl: "missile", drifter: "toxin",
  repeater: "bullet", furnace: "beam", railhead: "shell", stinger: "toxin",
};
export const GUN_SIZE: Record<string, number> = {
  tacker: 1, lobber: 1, torch: 1, coil: 1, duster: 1, autocannon: 2, airburst: 2, piercer: 2, douser: 2, tether: 2, hive: 2, blighter: 2,
  cleaver: 3, barrage: 3, deluge: 3, whirl: 3, drifter: 3, repeater: 4, furnace: 4, railhead: 4, stinger: 4,
};
export type PropShape = "palm" | "bush" | "rock";
export const PROP_PIC: Record<PropShape, Pic> = { palm: PALM, bush: BUSH, rock: ROCK };
/** the prop for a footprint: the big palm from two cells up */
export const propPic = (shape: PropShape, tiles: number): Pic => (shape === "palm" && tiles >= 2 ? PALM2 : PROP_PIC[shape]);
export function propShapeOf(id: string): PropShape {
  if (/palm|canopy|tree|pine|mangrove|jungle|cactus|fungus|column|stalk/.test(id)) return "palm";
  if (/shrub|reeds|bush|scrub|fern|grass|tuft|moss|coral|kelp|lily|pod|flow/.test(id)) return "bush";
  return "rock";
}
/** the sprite mirrored, for a thing that looks the other way */
export function flipped(p: Pic): Pic {
  const px: Ink[] = new Array<Ink>(p.w * p.h);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) px[y * p.w + x] = p.px[y * p.w + (p.w - 1 - x)];
  return { w: p.w, h: p.h, px };
}
/** the sprite at k px a pixel, into a cw x ch cell, its bottom row `anchor` of the way down, centred across */
export function laid(p: Pic, k: number, cw: number, ch: number, anchor: number): Ink[] {
  const px: Ink[] = new Array<Ink>(cw * ch).fill(null);
  const W = Math.round(p.w * k), H = Math.round(p.h * k);
  const ox = Math.round((cw - W) / 2), oy = p.h === p.w ? Math.round((ch - H) / 2) : Math.round(ch * anchor - H * 0.9);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = p.px[Math.min(p.h - 1, Math.floor(y / k)) * p.w + Math.min(p.w - 1, Math.floor(x / k))];
    const X = x + ox, Y = y + oy;
    if (c !== null && X >= 0 && Y >= 0 && X < cw && Y < ch) px[Y * cw + X] = c;
  }
  return px;
}


// ── turrets, top-down: a raised plate and the weapon on it, pointing up ──
// the plate: a slab with a light top edge, a dark front strip, cut corners
export const PLATE = sprite([
  "..kkkkkkkkkkkk..",
  ".kQQQQQQQQQQQQk.",
  "kQqqqqqqqqqqqqQk",
  "kQqqqqqqqqqqqqqk",
  "kQqqqqqqqqqqqqqk",
  "kQqqqqqqqqqqqqqk",
  "kQqqqqqqqqqqqqqk",
  "kQqqqqqqqqqqqqqk",
  "kQqqqqqqqqqqqqqk",
  "kQqqqqqqqqqqqqqk",
  "kQqqqqqqqqqqqqqk",
  "kQqqqqqqqqqqqqqk",
  "kQqqqqqqqqqqqqqk",
  "kxxxxxxxxxxxxxxk",
  ".kxxxxxxxxxxxxk.",
  "..kkkkkkkkkkkk..",
]);
// a cannon from above: a round breech, a barrel up, a brass band
export const W_CANNON = sprite([
  "......kkkk......",
  "......kiik......",
  "......kIIk......",
  ".....kkIIkk.....",
  ".....kaIIak.....",
  ".....kkIIkk.....",
  "......kIIk......",
  ".....kkIIkk.....",
  "....kIIIIIIk....",
  "...kIIIIIIIIk...",
  "...kIIsIIIIIk...",
  "...kIIIIIIIIk...",
  "....kIIIIIIk....",
  ".....kkkkkk.....",
  "................",
  "................",
]);
// a mortar: a wide mouth with a black bore
export const W_MORTAR = sprite([
  "................",
  "................",
  ".....kkkkkk.....",
  "....kssssssk....",
  "...kssiiiiissk..",
  "...ksiikkkkiisk.",
  "...ksikPPPPkisk.",
  "...ksikPPPPkisk.",
  "...ksikPPPPkisk.",
  "...ksiikkkkiisk.",
  "...kssiiiiissk..",
  "....kssssssk....",
  ".....kkkkkk.....",
  "................",
  "................",
  "................",
]);
// a flamethrower: a red tank, a nozzle up with a flame
export const W_FLAMER = sprite([
  "......kllk......",
  ".....kleelk.....",
  ".....keeeek.....",
  "......kssk......",
  "......kssk......",
  ".....kkssSk.....",
  "....kRRRRRRk....",
  "...kRRRRRRRRk...",
  "...kRRkkkkRRk...",
  "...kRRkssRRRk...",
  "...kRRkkkkRRk...",
  "...kRRRRRRRRk...",
  "....kRRRRRRk....",
  ".....kkkkkk.....",
  "................",
  "................",
]);
// a tesla orb: a blue ball on a dark mount, sparks round it
export const W_TESLA = sprite([
  "................",
  "..k..........k..",
  "...k..kkkk..k...",
  ".....kbbbbk.....",
  "....kbbSSbbk....",
  "....kbSbbbbk....",
  "....kbbbbbbk....",
  ".....kbbbbk.....",
  "..k...kkkk...k..",
  "...k.kIIIIk.k...",
  ".....kIIIIk.....",
  ".....kIIIIk.....",
  "......kkkk......",
  "................",
  "................",
  "................",
]);
// a water cannon: a blue barrel, a steel nozzle up, a drop
export const W_WATER = sprite([
  "......kkkk......",
  "......kssk......",
  "......kssk......",
  ".....kkuukk.....",
  "....kuuuuuuk....",
  "...kuuSSuuuuk...",
  "...kuuSuuuuuk...",
  "...kuuuuuuuuk...",
  "...kuuuuuuuuk...",
  "...kuuuuuuuuk...",
  "....kuuuuuuk....",
  ".....kkkkkk.....",
  "................",
  "................",
  "................",
  "................",
]);
// a crossbow: the bow across, the stock down, an arrow up
export const W_CROSSBOW = sprite([
  "......kkkk......",
  "......kssk......",
  ".......kk.......",
  ".kk....kk....kk.",
  "kddkk..oo..kkddk",
  "kddddddddddddddk",
  ".kkkddddddddkkk.",
  "....kkkoookkk...",
  "......koook.....",
  "......koook.....",
  "......koook.....",
  "......koook.....",
  ".....kkoookk....",
  ".....koooook....",
  "......kkkkk.....",
  "................",
]);
// a rocket rack: a steel frame, two rockets with red tips
export const W_ROCKETS = sprite([
  "....kk....kk....",
  "...kmmk..kmmk...",
  "...kmmk..kmmk...",
  "...kssk..kssk...",
  "...kssk..kssk...",
  "..kkkkkkkkkkkk..",
  "..kIIIIIIIIIIk..",
  "..kIksskkkssIk..",
  "..kIksskkkssIk..",
  "..kIksskkkssIk..",
  "..kIkkkkkkkkIk..",
  "..kIIIIIIIIIIk..",
  "..kkkkkkkkkkkk..",
  "................",
  "................",
  "................",
]);
// a sprayer: a green pot, a nozzle up, bubbles beside it
export const W_SPRAYER = sprite([
  "......kkkk......",
  "..kk..kssk..kk..",
  ".knnk.kssk.knnk.",
  "..kk.kkssk..kk..",
  "....knnnnnnk....",
  "...knnnnnnnnk...",
  "...knnkkkknnk...",
  "...knnkLLknnk...",
  "...knnkLLknnk...",
  "...knnkkkknnk...",
  "...knnnnnnnnk...",
  "....knnnnnnk....",
  ".....kkkkkk.....",
  "................",
  "................",
  "................",
]);

// ── the keep, from tiles at the same density ────────────────────────────
const WALL_TOP = sprite([
  "kkkkkkkkkkkkkkkk",
  "QQkkQQkkQQkkQQkk",
  "qqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqq",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "kkkkkkkkkkkkkkkk",
]);
const FLOOR = sprite([
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
  "xxxxxxxxxxxxxxxx",
]);
const TOWER = sprite([
  "....kkkkkkkk....",
  "..kkQQQQQQQQkk..",
  ".kQQqqqqqqqqQQk.",
  ".kQqqqqqqqqqqQk.",
  "kQqqqqkkkkqqqqQk",
  "kQqqqkxxxxkqqqqk",
  "kQqqkxxxxxxkqqqk",
  "kQqqkxxxxxxkqqqk",
  "kQqqkxxxxxxkqqqk",
  "kQqqkxxxxxxkqqqk",
  "kqqqqkxxxxkqqqqk",
  "kqqqqqkkkkqqqqqk",
  ".kqqqqqqqqqqqqk.",
  ".kxxqqqqqqqqxxk.",
  "..kkxxxxxxxxkk..",
  "....kkkkkkkk....",
]);
const BRAZIER = sprite([
  "....kkkkkkkk....",
  "..kkxxxxxxxxkk..",
  ".kxxxxkkkkxxxxk.",
  ".kxxkkaaaakkxxk.",
  "kxxkaaeeeeaakxxk",
  "kxxkaeellleeakxk",
  "kxkaeelllleeakxk",
  "kxkaelllllleakxk",
  "kxkaelllllleakxk",
  "kxkaeelllleeakxk",
  "kxxkaeellleeakxk",
  "kxxkaaeeeeaakxxk",
  ".kxxkkaaaakkxxk.",
  ".kxxxxkkkkxxxxk.",
  "..kkxxxxxxxxkk..",
  "....kkkkkkkk....",
]);
/** the keep: 10 x 10 cells of wall, floor, four corner towers and a brazier, at 16 px a cell */
export function keepPic(): Pic {
  const n = 160;
  const px: Ink[] = new Array<Ink>(n * n).fill(null);
  const blit = (p: Pic, x0: number, y0: number, k = 1): void => {
    for (let y = 0; y < p.h * k; y++) for (let x = 0; x < p.w * k; x++) {
      const c = p.px[Math.floor(y / k) * p.w + Math.floor(x / k)];
      if (c !== null && x0 + x < n && y0 + y < n) px[(y0 + y) * n + x0 + x] = c;
    }
  };
  for (let ty = 0; ty < 10; ty++) for (let tx = 0; tx < 10; tx++) {
    const edge = tx === 0 || ty === 0 || tx === 9 || ty === 9;
    blit(edge ? WALL_TOP : FLOOR, tx * 16, ty * 16);
  }
  for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128]]) blit(TOWER, x, y, 2);
  blit(BRAZIER, 64, 64, 2);
  return { w: n, h: n, px };
}

// ── a bigger palm, for the two-cell trees ───────────────────────────────
export const PALM2 = sprite([
  "..........kkkkkk..kkkkkk........",
  "........kkJJJJJJkkjjjjjjkk......",
  "......kkJJJJJJJJkjjjjjjjjjkk....",
  ".....kJJJJJJJJJJkjjjjjjjjjjjk...",
  "....kJJJJJJJkkkkkkkkjjjjjjjjjk..",
  "....kJJJJJkkhhhhhhkkkjjjjjjjjk..",
  ".....kJJkkhhhhhhhhhhkkjjjjjjk...",
  "......kkhhhhhkkkkhhhhhkkjjjk....",
  "........kkkkk....kkkkk.kkkk.....",
  "............khhhhk..............",
  "............khhhhk..............",
  "...........khhhhhk..............",
  "...........khhhhhk..............",
  "...........khhhhk...............",
  "..........khhhhhk...............",
  "..........khhhhhk...............",
  "..........khhhhk................",
  ".........khhhhhk................",
  ".........khhhhhk................",
  ".........khhhhk.................",
  "........khhhhhk.................",
  "........khhhhhk.................",
  "........khhhhk..................",
  ".......kkhhhhkk.................",
  ".....kkjjhhhhjjkk...............",
  "....kjjjjhhhhjjjjk..............",
  "...kjjjjjjhhjjjjjjk.............",
  "...kjjjjjjjjjjjjjjk.............",
  "....kkkkkkkkkkkkkk..............",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
]);

export const WEAPON_PIC: Record<Ammo, Pic> = { bullet: W_CANNON, shell: W_MORTAR, flame: W_FLAMER, beam: W_TESLA, water: W_WATER, field: W_CROSSBOW, missile: W_ROCKETS, toxin: W_SPRAYER };
/** art px a cell: the one density everything is drawn at */
export const PX_PER_CELL = 16;
