import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * RARITY — what a turret is worth to draw, and the colour it is drawn in.
 *
 * The build card is gone (components/MechSwarm.tsx): a turret is not
 * picked off a shelf any more, it is DEALT. The player pays a flat fee
 * (TURRET_ROLL_PRICE in economy.ts), the deal rolls a rarity against the
 * weights below and then a turret uniformly inside it, and what comes out
 * pops onto the field as a card to place. So a rarity is two things at
 * once — how often the deal hands the thing over, and the border the card
 * wears so the answer is readable across a room.
 *
 * THE RARITIES ARE FIXED FOR THE WHOLE RUN, but the WEIGHTS are not: they
 * are handed in at the roll (rollTurret) rather than read off this module,
 * because the upgrades that are coming shift them — that is what an
 * upgrade will BE, a run that draws purple more often than one in a
 * hundred. Nothing here may assume BASE_WEIGHTS is what is in force.
 */
export const RARITIES = ["common", "uncommon", "rare", "ultra"] as const;
export type Rarity = (typeof RARITIES)[number];

export interface RarityDef {
  id: Rarity;
  /** what the card's tag says */
  name: string;
  /** the border, and the colour every word about the rarity is printed in */
  color: string;
  /**
   * THE GROUND THE CARD SITS ON, and it is OPAQUE. It is the rarity's
   * colour mixed a tenth or so into the panel black (#0b0b0d) and then
   * written down as a solid hex — not that colour at a tenth ALPHA, which
   * is what it used to be and which made every card a window: the board
   * under it moved, a card over grass read green and a card over deep
   * water read blue, and the tint that was supposed to say "purple" said
   * whatever the terrain behind it said. A card is a thing held in front
   * of the field, so it stops the field.
   */
  ground: string;
}

/**
 * THE FOUR BORDERS. Greyish white, blue, the amber the field's corner has
 * always been (the deal stack and the old build card both wear it), and
 * purple at the top — the ladder every card game has trained its players
 * to read without a legend.
 */
export const RARITY: Readonly<Record<Rarity, RarityDef>> = {
  common: { id: "common", name: "Common", color: "#C6C6CE", ground: "#1E1E20" },
  uncommon: { id: "uncommon", name: "Uncommon", color: "#5A9BF2", ground: "#141C28" },
  rare: { id: "rare", name: "Rare", color: "#FFD37F", ground: "#28231B" },
  ultra: { id: "ultra", name: "Ultra Rare", color: "#B07BFF", ground: "#221B2F" },
};

/**
 * WHICH TURRET IS WHICH — authored, not derived from price.
 *
 * It reads close to Mindustry's own build cost and deliberately is not it:
 * fuse is an uncommon at four thousand scrap and tsunami a rare at five,
 * because what the rarity is pricing is how much a board WANTS the thing,
 * and a liquid turret that stops a naval push cold is a rarer answer than
 * a short-range shotgun. The top rarity is the three 4x4s and nothing
 * else: the biggest footprint in the game is the thing a run is hoping
 * for, and one line says so.
 *
 * The two menders are retired from the field (types.ts RETIRED_KINDS) and
 * are never dealt; they are filed as commons so the table stays total and
 * the day they come back they come back with a border already on them.
 */
export const TURRET_RARITY: Readonly<Record<TowerKind, Rarity>> = {
  // greyish white: the 1x1s and the 2x2 support guns — the board's floor
  duo: "common",
  hail: "common",
  scatter: "common",
  scorch: "common",
  arc: "common",
  wave: "common",
  // blue: the guns that answer one hard body or one massed lane
  salvo: "uncommon",
  lancer: "uncommon",
  parallax: "uncommon",
  ripple: "uncommon",
  fuse: "uncommon",
  // amber: the specialists
  swarmer: "rare",
  cyclone: "rare",
  tsunami: "rare",
  // purple: every 4x4 in the game
  spectre: "ultra",
  meltdown: "ultra",
  foreshadow: "ultra",
  // retired — see the note above
  mender: "common",
  mendProjector: "common",
};

export const rarityOf = (kind: TowerKind): Rarity => TURRET_RARITY[kind];
export const rarityDef = (kind: TowerKind): RarityDef => RARITY[TURRET_RARITY[kind]];

export type RarityWeights = Readonly<Record<Rarity, number>>;

/**
 * THE OPENING ODDS. A hundred draws, and one of them is purple — the
 * number the whole deal is composed against, because a 4x4 handed over
 * casually is a 4x4 that stops being the thing a run is hoping for. The
 * weights are relative, not percentages: the roll normalises whatever it
 * is given over the rarities actually available (rollTurret), so a save
 * that has not been dealt an ultra turret yet still draws a card.
 */
export const BASE_WEIGHTS: RarityWeights = {
  common: 62,
  uncommon: 27,
  rare: 10,
  ultra: 1,
};

/**
 * A WEIGHT TABLE THAT CAN BE TURNED WITHOUT A REBUILD — the shape behind
 * every "rarities" dial on the admin dashboard (components/RaritiesView).
 *
 * THERE ARE THREE OF THESE AND THEY ARE THE SAME MACHINE: the turret
 * deal's odds (here), the shape deal's (formation.ts) and the module
 * deal's (mods.ts). Each is a four-number table read at the roll, so each
 * wants exactly the same four things — read the live table, bend one band,
 * hand the bent ones to the balance document, take a document back. Three
 * copies of that is three places for the fourth band to be forgotten.
 *
 * THE OVERRIDE LAYER IS NEVER THE SOURCE OF TRUTH, the same rule
 * economy.ts keeps for prices: the authored table is what ships, this is
 * the scratch pad for the afternoon of small edits, and a number that
 * settles belongs back in the const with the reasoning beside it.
 */
export interface WeightDial {
  /** the table as it stands — authored, with whatever is bent on top */
  live(): RarityWeights;
  /** what a Reset returns to */
  readonly authored: RarityWeights;
  /** bend one band; undefined restores the authored weight */
  set(r: Rarity, v: number | undefined): void;
  /** only what is actually bent — what the balance document carries */
  overrides(): Partial<Record<Rarity, number>>;
  /** take a saved section, replacing everything bent right now */
  apply(doc: Record<string, unknown>): void;
}

export function weightDial(authored: RarityWeights): WeightDial {
  const bent = new Map<Rarity, number>();
  return {
    authored,
    live: () =>
      bent.size === 0
        ? authored
        : (Object.fromEntries(
            RARITIES.map((r) => [r, bent.get(r) ?? authored[r]]),
          ) as unknown as RarityWeights),
    set(r, v) {
      if (v === undefined || !Number.isFinite(v) || v < 0) bent.delete(r);
      else bent.set(r, v);
    },
    overrides: () => Object.fromEntries([...bent]) as Partial<Record<Rarity, number>>,
    apply(doc) {
      bent.clear();
      for (const r of RARITIES) {
        const v = doc[r];
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) bent.set(r, v);
      }
    },
  };
}

/**
 * THE TURRET DEAL'S ODDS, as a dial. Read `TURRET_ODDS.live()` rather than
 * BASE_WEIGHTS anywhere the answer has to reflect what the dashboard has
 * bent — which is everywhere except the dashboard's own "authored" column.
 */
export const TURRET_ODDS: WeightDial = weightDial(BASE_WEIGHTS);

/** the odds as the HUD prints them: what share of draws each rarity takes */
export function rarityOdds(weights: RarityWeights): Record<Rarity, number> {
  const total = RARITIES.reduce((n, r) => n + Math.max(0, weights[r]), 0);
  return Object.fromEntries(
    RARITIES.map((r) => [r, total > 0 ? Math.max(0, weights[r]) / total : 0]),
  ) as Record<Rarity, number>;
}

/**
 * ONE DRAW: a rarity against the weights, then a turret uniformly inside
 * it. Two rolls rather than one weight per turret, so the odds a player is
 * told ("one in a hundred is purple") stay true however many turrets the
 * save has been dealt — adding a fourth ultra must not make ultras more
 * likely, only make WHICH ultra less predictable.
 *
 * `pool` is what the save may field right now (TechState.unlocked, already
 * shorn of the retired kinds). A rarity with nothing in the pool is
 * skipped and its weight redistributed, which is what makes the deal work
 * at level 1 with four commons and a blue in hand. An empty pool draws
 * nothing.
 */
export function rollTurret(
  pool: readonly TowerKind[],
  weights: RarityWeights = TURRET_ODDS.live(),
  rng: () => number = Math.random,
): TowerKind | null {
  const byRarity = new Map<Rarity, TowerKind[]>();
  for (const k of pool) {
    const r = TURRET_RARITY[k];
    const list = byRarity.get(r);
    if (list) list.push(k);
    else byRarity.set(r, [k]);
  }
  const live = RARITIES.filter((r) => (byRarity.get(r)?.length ?? 0) > 0);
  if (live.length === 0) return null;
  const total = live.reduce((n, r) => n + Math.max(0, weights[r]), 0);
  // every live rarity weighted at zero: fall back to the deepest one
  // rather than returning nothing — a paid roll always hands something over
  if (total <= 0) {
    const list = byRarity.get(live[live.length - 1])!;
    return list[Math.floor(rng() * list.length) % list.length];
  }
  let n = rng() * total;
  for (const r of live) {
    n -= Math.max(0, weights[r]);
    if (n <= 0) {
      const list = byRarity.get(r)!;
      return list[Math.floor(rng() * list.length) % list.length];
    }
  }
  const list = byRarity.get(live[live.length - 1])!;
  return list[Math.floor(rng() * list.length) % list.length];
}

/** every turret of one rarity, in roster order — for the codex and the odds card */
export const turretsOfRarity = (r: Rarity): TowerKind[] =>
  TOWER_KINDS.filter((k) => TURRET_RARITY[k] === r);
