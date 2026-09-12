import { PAL, type TowerStats } from "./constants";
import { RARITIES, weightDial, type Rarity, type RarityWeights, type WeightDial } from "./rarity";
import { faster, piercing, stronger } from "./upgrades";

/**
 * RELICS — THE LATE GAME'S ANSWER, and the second of the game's two
 * categories of module.
 *
 * THERE ARE EXACTLY TWO CATEGORIES AND "UPGRADE" IS NOT ONE OF THEM.
 * MODS (mods.ts) are the mid game: a chance riding every turret placed
 * from now on, bought by the fistful, each one a number on a gun. RELICS
 * are the late game: a RULE over the whole board, bought once, and every
 * one of them is a thing the board could not do before. They used to live
 * in one file behind a `scope` field, which meant the code said a relic
 * was a kind of mod — and a player reading a screen that grouped the two
 * under one word was being told the same untruth. The word "upgrade" is
 * gone from both halves; a mod is a mod and a relic is a relic.
 *
 * WHAT A RELIC IS FOR: A SWARM OF T5s. By the back half of the track the
 * thing walking up the lane is twenty thousand health behind twenty-two
 * points of armour, and it is not alone. Nothing a mod does answers that
 * — a stack of "+4% damage" is a bigger number against a wall that
 * subtracts a flat twenty-two off every round, which is the wall winning
 * by arithmetic. So the relics are the answers that change the
 * arithmetic: armour simply stops applying, the round hits harder for
 * every tier the body stands above the first, the last sliver of a pool
 * is skipped, and a dead hull takes its neighbours with it. A run that has
 * banked relics is not playing the same game as a run that has banked
 * mods.
 *
 * A RELIC ADDS SOMETHING; IT NEVER SWITCHES SOMETHING OFF. This is the one
 * rule about what may go in the catalog, and it is a rule about the GAME
 * and not about the code: a relic that reaches over and disables a system
 * somebody authored — the support line's auras, a mutator, a unit's
 * ability — is a relic whose whole effect is that content stops happening.
 * It reads as the game doing less rather than the player doing more, and
 * it quietly deletes the reason the disabled thing was written. An Aegis
 * Breaker that turned the swarm's mender, shield, plating and haste fields
 * off lived here for exactly one commit and is gone for this reason.
 *
 * CHANGING AN ARITHMETIC IS NOT SWITCHING A SYSTEM OFF, and the line is
 * worth saying out loud because Monofilament sits close to it. Armour
 * stopping applying changes how a number resolves; every body on the field
 * still does every single thing it was authored to do. The support hull
 * still mends, the reign still stamps its plating — the player just has an
 * answer to it.
 *
 * AND THE TRACK SAYS SO (track.ts RELICS_FROM). The relic half of the
 * catalog opens in the LATE half of the campaign, where the mutator phase
 * is and where the heavies arrive, and every one of the fourteen is dealt
 * after it. A save's front half is mods; its back half is relics.
 *
 * EVERY RELIC IS POWERFUL, AND THE PRICE IS WHY. A hundred and fifty
 * thousand scrap (economy.ts RELIC_ROLL_PRICE) is a hundred and fifty
 * turret cards, or the whole opening bank twenty times over, and nothing
 * at that price may be a percentage: the board fires TWICE as fast, every
 * kill pays TRIPLE, armour stops existing, every turret stands back up. A
 * relic at "+10% damage" would be a mod with a worse price tag, and the
 * run could not tell the two buttons apart by what they did — only by
 * what they cost.
 *
 * A RELIC IS HELD ONCE. A rule in force does not get more in force, so
 * there is nothing a second copy could mean; the roll never offers one
 * already held (rollRelic), which is what lets the R button be bought
 * out. That is why the run's holdings are a SET and not a tally — the
 * mods keep the tally, because a mod is a number that grows.
 *
 * EVERY RELIC IS NAMED, all fourteen. A mod in the low bands is called its
 * own tweak ("+2% damage" IS its name) because a made-up name over a
 * number is a word to learn in order to be told what the number said. A
 * relic is never a number, so it always has a name.
 *
 * THE BAND IS HOW OFTEN, NOT HOW GOOD. Every relic costs the same hundred
 * and fifty thousand, so the four rarities (rarity.ts) are only the odds
 * the R button draws against: a COMMON relic is the one that comes up
 * often, and it still has to be worth the six figures when it does.
 * Overclock Core is a common and it doubles the damage of every gun on
 * the field.
 *
 * MOST OF THEM ARE READ BY NAME AND NOT BY `apply`. A relic that composes
 * onto a turret's table carries one (Overclock, Coolant, Phosphor, Twin
 * Fire) and the rest are MOMENTS — a revive, a refund, a body's parting
 * blast, armour that stops applying — which no stat can express. The sim
 * owns WHEN each of those happens and this file owns HOW MUCH, the same
 * split the mutators keep (mutation.ts).
 *
 * WHY THE ANTI-T5 FOUR LIVE IN THE SIM AND NOT ON A BULLET. Monofilament,
 * Titan, Terminal and Cascade all reach the swarm rather than the gun, and
 * the honest place for that is Sim.damageUnit and Sim.killUnit —
 * the chokepoints EVERY damage path in the game goes through. Written as
 * bullet fields instead they would have been silently inert for half the
 * roster: `pierceArmor` is honoured on exactly one of the sim's damage
 * paths and `wet` on two, so a "every round ignores armour" relic bolted
 * onto BulletStats would have done nothing at all for a lancer, an arc or
 * a meltdown. A relic is a rule over the whole board, so it is enforced
 * where the whole board passes.
 */

/**
 * EVERY RELIC, in catalog order — the order the shelf, the codex and the
 * track's rows all read in, band by band. A save's holdings are keyed by
 * these ids, so renaming one would silently take a relic off a shelf.
 */
export const RELIC_IDS = [
  // ---- the commons: the board, turned up --------------------------------
  "overclock",
  "coolant",
  "scavenger",
  // ---- the uncommons: what a death is worth, whose ever it was ---------
  "insurance",
  "phosphor",
  "lastVolley",
  "cascade",
  // ---- the rares: the arithmetic of a heavy body ------------------------
  "phoenix",
  "twinfire",
  "monofil",
  "titan",
  // ---- the ultras: the run stops scaling like a run ---------------------
  "undying",
  "terminal",
  "ascendancy",
] as const;
export type RelicId = (typeof RELIC_IDS)[number];

/**
 * WHAT A RUN IS HOLDING: a set, because a relic is held once (see the
 * header). Everything that reads the run's relics — the sim's own
 * ledger, the roll that must not offer one twice, the shelf — takes this
 * one shape.
 */
export type RelicsHeld = ReadonlySet<RelicId>;

/**
 * The face a relic wears on its chip. There are no sprites for these — a
 * relic is not a building — so every screen draws it as a 16-square pixel
 * drawing (components/modArt.ts), and the glyph is which drawing.
 *
 * A RELIC IS DRAWN LOUDER THAN A MOD. A mod's picture is one object in
 * gunmetal with a pip of colour; a relic's carries the colour of what it
 * DOES over the whole drawing, so the two categories are legible apart
 * before a single border is read. No two relics of one band may share a
 * glyph — inside a band the border colour cannot tell them apart — and
 * that is checked at import, along with the fact that no relic wears a
 * mod's glyph at all.
 */
export type RelicGlyph =
  | "core"
  | "coolant"
  | "coin"
  | "vault"
  | "flame"
  | "volley"
  | "chain"
  | "phoenix"
  | "twin"
  | "thread"
  | "titan"
  | "legion"
  | "terminal"
  | "star";

export interface RelicDef {
  id: RelicId;
  /** ALWAYS SET — a relic is never a number (see the header) */
  name: string;
  /** which band the R button draws it in, and nothing about how good it is */
  rarity: Rarity;
  glyph: RelicGlyph;
  /** what owning it does, in the player's own terms — the hover card */
  blurb: string;
  /**
   * THE STAT SURGERY, for the four relics that are one. A relic is held
   * once, so unlike a mod's this takes no copy count: what it returns is
   * already the whole of what the relic is worth.
   *
   * A relic with no `apply` is a MOMENT — a revive, a refund, armour that
   * stops applying, a body's parting blast — and the sim reads it by name
   * at the one place it happens (see the header). There is no way to
   * express "when this body dies" as a table.
   */
  apply?: (s: TowerStats) => TowerStats;
}

// ---------------------------------------------------------------------------
// THE TUNING
//
// Every number a relic's effect needs, written here beside the def it
// belongs to rather than at the sim site that reads it — the sim owns WHEN
// a thing happens and this file owns HOW MUCH.
// ---------------------------------------------------------------------------

/** overclock and coolant: the board's damage and rate, DOUBLED */
export const OVERCLOCK_MUL = 2;
export const COOLANT_MUL = 2;

/** scavenger: what it adds to every kill's drop — TWO more of it, so a
 *  kill pays triple. The economy relic, and the one that has to pay its
 *  own six figures back fastest */
export const SCAVENGER_BONUS = 2;

/**
 * INSURANCE: what a wrecked turret pays, EVERY time. It used to be a 40%
 * chance at five hundred — an expected two hundred scrap a death, which
 * on a relic priced in six figures pays itself back after seven hundred
 * and fifty wrecks, which is a relic that never pays. Two cards' worth,
 * certain, is seventy-five wrecks: a line that is being chewed through is
 * also a line that is funding its own replacement.
 */
export const INSURANCE_SCRAP = 2000;

/** phosphor: every round hits half again as hard and goes through two
 *  more bodies, on top of burning white */
export const PHOSPHOR_MUL = 1.5;
export const PHOSPHOR_PIERCE = 2;

/** last volley: the reload multiplier a death hands its neighbours, how
 *  long it lasts, and how far it reaches (in tiles). Triple, for a
 *  quarter of a minute, over a bigger ring — a death is an EVENT now */
export const LAST_VOLLEY_RATE = 3;
export const LAST_VOLLEY_SECONDS = 15;
export const LAST_VOLLEY_TILES = 8;

/**
 * CASCADE CHARGES: what a heavy hull is worth when it comes apart.
 *
 * THE TIER GATE IS THE WHOLE RELIC. A T1 body carries nothing worth
 * detonating — a hundred and fifty health over six tiles is a puff — and
 * a swarm of them dying in a chain would be a free board-wide nuke every
 * wave. From T4 up the hull IS the bomb: a fifth of twenty-two thousand
 * is four and a half thousand over six tiles, which kills the crowd
 * escorting it outright and takes a real bite out of the hull beside it.
 * That is the answer to a SWARM of T5s rather than to one of them: the
 * first one down starts a chain that rolls through the rest.
 *
 * THE BLAST IS A BLAST LIKE ANY OTHER — Sim.splash, so it falls off to
 * 40% at the edge, is soaked by shields, and can kill, which is what lets
 * one detonation set off the next.
 */
export const CASCADE_MIN_TIER = 4;
export const CASCADE_FRACTION = 0.2;
export const CASCADE_TILES = 6;

/**
 * ...AND HOW LONG A CHAIN MAY RUN IN ONE FRAME (Sim.drainCascades). A
 * detonation kills, a kill queues a detonation, so the chain is walked
 * inside the frame it started in — which is what makes a wall of heavies
 * unzip rather than pop one hull a tick. This is the stop on it: enough
 * that a real chain finishes, low enough that no board can spend a frame
 * detonating. Anything past it does not go off at all rather than being
 * carried over, because a charge that fires a second late lands on a
 * board that has moved.
 */
export const CASCADE_CHAIN_CAP = 64;


/** PHOENIX: the odds a wrecked turret stands back up — EVERY time, not
 *  once. A coin flip with no floor under it is worth one extra life on
 *  average, the same as Undying's certain one, and it never runs out; the
 *  two are the same relic told as certainty and as luck, and a run that
 *  owns both spends the certainty first (Sim.reviveTower). */
export const PHOENIX_CHANCE = 0.5;

/** twin fire: one more round in every volley on the board */
export const TWINFIRE_SHOTS = 1;

/**
 * TITAN ROUNDS: what the round gains for every tier the body it lands on
 * stands above the first. A quarter again a tier, so a T1 takes what it
 * always did, a T3 takes half again, and a T5 hull takes DOUBLE.
 *
 * IT IS NOT OVERCLOCK AT A DIFFERENT PRICE. Overclock is a flat double on
 * everything the board shoots; this is a RAMP, worth nothing at the
 * bottom of the roster and everything at the top, and the two stack
 * because they are different shapes. A run that has both is hitting a T5
 * for four times what it started at, which is roughly what it takes to
 * make a duo matter in the back half of the campaign.
 */
export const TITAN_PER_TIER = 0.25;

/**
 * TERMINAL PROTOCOL: the fraction of its own pool a body does not get to
 * spend. Anything at or below this much of its maximum health dies where
 * it stands, on the next hit that lands on it.
 *
 * A FLAT FRACTION IS WHY IT IS AN ULTRA. Fifteen per cent of a dagger is
 * twenty health and nobody notices; fifteen per cent of an eclipse is
 * three thousand three hundred, and it comes off the END of the pool —
 * the part a board grinds through at its slowest, with the hull already
 * inside the line. Every heavy in the game is a sixth shorter.
 */
export const TERMINAL_FRACTION = 0.15;

/**
 * ASCENDANCY: what the relic does to the TURRET deal's odds (rarity.ts
 * BASE_WEIGHTS). It multiplies the two top bands rather than replacing
 * the table, so a future relic that also bends the odds composes with it
 * instead of fighting it.
 *
 * Twenty times on purple is one draw in twenty rather than one in a
 * hundred — the run stops hoping for a 4x4 and starts planning around
 * them, which is exactly what an ultra relic should be worth.
 */
export const ASCENDANCY_MUL: Readonly<Record<Rarity, number>> = {
  common: 1,
  uncommon: 1,
  rare: 5,
  ultra: 20,
};

// ---------------------------------------------------------------------------
// THE CATALOG
// ---------------------------------------------------------------------------

export const RELICS: readonly RelicDef[] = [
  // EVERY RELIC BELOW IS THE BOARD DOING A DIFFERENT THING, not the same
  // thing a little better — see the header
  {
    id: "overclock",
    name: "Overclock Core",
    rarity: "common",
    glyph: "core",
    blurb: "Every turret on the field deals DOUBLE damage.",
    apply: (s) => stronger(s, OVERCLOCK_MUL),
  },
  {
    id: "coolant",
    name: "Coolant Loop",
    rarity: "common",
    glyph: "coolant",
    blurb: "Every turret on the field fires TWICE as fast.",
    apply: (s) => faster(s, COOLANT_MUL),
  },
  {
    id: "scavenger",
    name: "Scavenger Rig",
    rarity: "common",
    glyph: "coin",
    blurb: "Every kill pays TRIPLE scrap.",
  },
  {
    id: "insurance",
    name: "Salvage Insurance",
    rarity: "uncommon",
    glyph: "vault",
    blurb: "Every destroyed turret pays out 2,000 scrap — two cards' worth, every time.",
  },
  {
    id: "phosphor",
    name: "Phosphor Rounds",
    rarity: "uncommon",
    glyph: "flame",
    // the "bullet upgrade that changes what an attack LOOKS like": every
    // round on the board goes white-hot, muzzle spray and hit included —
    // and now it goes THROUGH things, which is what white-hot should mean
    blurb: "Every shot on the field burns phosphor-white: half again the damage, and it punches through two more bodies.",
    apply: (s) => {
      const hot = piercing(stronger(s, PHOSPHOR_MUL), PHOSPHOR_PIERCE);
      return {
        ...hot,
        bullet: {
          ...hot.bullet,
          fxColor: PAL.bulletYellow,
          ...(hot.bullet.sprite
            ? {
                sprite: {
                  ...hot.bullet.sprite,
                  front: PAL.white,
                  back: PAL.bulletYellowBack,
                },
              }
            : null),
        },
      };
    },
  },
  {
    id: "lastVolley",
    name: "Last Volley",
    rarity: "uncommon",
    glyph: "volley",
    blurb:
      "A destroyed turret spends its last charge on its neighbours: every turret within 8 tiles fires at TRIPLE rate for 15 seconds.",
  },
  {
    id: "cascade",
    name: "Cascade Charges",
    rarity: "uncommon",
    glyph: "chain",
    blurb:
      "A T4 or T5 hull comes apart where it falls, for a FIFTH of its own maximum health over 6 tiles — enough to set off the next one. A wall of heavies unzips itself.",
  },
  {
    id: "phoenix",
    name: "Phoenix Protocol",
    rarity: "rare",
    glyph: "phoenix",
    blurb: "A destroyed turret has a 50% chance to stand straight back up at full health — every time it falls, with no limit.",
  },
  {
    id: "twinfire",
    name: "Twin Fire",
    rarity: "rare",
    glyph: "twin",
    blurb: "Every turret on the field fires one more round in every volley.",
    apply: (s) => ({ ...s, shots: s.shots + TWINFIRE_SHOTS }),
  },
  {
    id: "monofil",
    name: "Monofilament Rounds",
    rarity: "rare",
    glyph: "thread",
    blurb:
      "ARMOUR STOPS APPLYING. Every hit the board lands is dealt in full, whatever the body is plated in — and the heaviest hulls in the game are plated in twenty-two.",
  },
  {
    id: "titan",
    name: "Titan Rounds",
    rarity: "rare",
    glyph: "titan",
    blurb:
      "The bigger the body, the harder the round lands: every hit gains a quarter again for each tier its target stands above the first, so a T5 hull takes DOUBLE.",
  },
  {
    id: "undying",
    name: "Undying Legion",
    rarity: "ultra",
    glyph: "legion",
    blurb:
      "EVERY turret you own stands back up once, at full health, the first time it is destroyed — the ones already on the field included.",
  },
  {
    id: "terminal",
    name: "Terminal Protocol",
    rarity: "ultra",
    glyph: "terminal",
    blurb:
      "Nothing finishes dying slowly. Any body knocked to 15% of its own health dies on the spot — and 15% of an eclipse is three thousand the board never has to grind through.",
  },
  {
    id: "ascendancy",
    name: "Ascendancy Protocol",
    rarity: "ultra",
    glyph: "star",
    blurb:
      "The deal starts handing over the big guns: rare turrets come up five times as often and ULTRA turrets twenty times as often, for the rest of the run.",
  },
];

const BY_ID = new Map<RelicId, RelicDef>(RELICS.map((r) => [r.id, r]));

export const relicDef = (id: RelicId): RelicDef => {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`no such relic: ${id}`);
  return d;
};

/**
 * THE ONE LINE EVERY RELIC PRINTS UNDER ITS BLURB. A mod's says the odds
 * it rolls at, because that is the one thing a player has to know before
 * paying for one; a relic's says the opposite — there is no roll, it is
 * simply on.
 */
export const RELIC_NOTE = "In force over the whole board the moment it is bought";

/**
 * THE ODDS AT THE R BUTTON, and they are the module curve: steeper at the
 * top than the turret deal's, because a formation is spent the moment it
 * is placed and a relic is owned for the rest of the run.
 *
 * IT IS THE RELICS' OWN TABLE NOW. The two halves of the catalog used to
 * share one dial, which meant bending the odds of an ultra MOD bent the
 * odds of an ultra RELIC with it — two categories with one knob between
 * them. They are separate purchases at separate prices off separate
 * buttons, so they get separate tables and the dashboard shows both.
 */
export const RELIC_WEIGHTS: RarityWeights = {
  common: 52,
  uncommon: 30,
  rare: 16,
  ultra: 2,
};

/** ...and the same table as a dial the dashboard can turn (rarity.ts) */
export const RELIC_ODDS: WeightDial = weightDial(RELIC_WEIGHTS);

/**
 * ONE DRAW OFF THE RELIC TABLE: a band against the weights, then a relic
 * uniformly inside it — the same two-step every table in this game uses,
 * for the same reason: adding a fourth ultra relic must make WHICH ultra
 * less predictable and never make ultras more likely.
 *
 * A RELIC ALREADY HELD IS NOT IN THE POOL, and its band's weight is
 * redistributed — a late run draws from what is left rather than paying
 * six figures to be told it already has the thing. Null when the whole
 * half is owned out, which is the one case the R button must refuse.
 *
 * `open` IS WHAT THE TRACK HAS DEALT (track.ts relicsAt). Null is every
 * relic there is, which is what a free board draws from — the sandbox and
 * the editors are not a campaign and have nothing to unlock.
 */
export function rollRelic(
  held: RelicsHeld = new Set(),
  weights: RarityWeights = RELIC_ODDS.live(),
  rng: () => number = Math.random,
  open: ReadonlySet<RelicId> | null = null,
): RelicId | null {
  const byRarity = new Map<Rarity, RelicId[]>();
  for (const d of RELICS) {
    if (open && !open.has(d.id)) continue;
    if (held.has(d.id)) continue;
    const list = byRarity.get(d.rarity);
    if (list) list.push(d.id);
    else byRarity.set(d.rarity, [d.id]);
  }
  const live = RARITIES.filter((r) => (byRarity.get(r)?.length ?? 0) > 0);
  if (live.length === 0) return null;
  const pick = (r: Rarity): RelicId => {
    const list = byRarity.get(r)!;
    return list[Math.floor(rng() * list.length) % list.length];
  };
  const total = live.reduce((n, r) => n + Math.max(0, weights[r]), 0);
  if (total <= 0) return pick(live[live.length - 1]);
  let n = rng() * total;
  for (const r of live) {
    n -= Math.max(0, weights[r]);
    if (n <= 0) return pick(r);
  }
  return pick(live[live.length - 1]);
}

/** is there a relic left to draw? — what greys the R button out on a run
 *  that has bought the half out. `open` is the save's earned catalog */
export const anyRelicLeft = (held: RelicsHeld, open: ReadonlySet<RelicId> | null = null): boolean =>
  RELICS.some((d) => (!open || open.has(d.id)) && !held.has(d.id));

/** has the track opened the relic half AT ALL? — the difference between a
 *  button that has been bought out and one not yet earned */
export const anyRelicOpen = (open: ReadonlySet<RelicId> | null): boolean =>
  !open || RELICS.some((d) => open.has(d.id));

/**
 * THE RUN'S RELICS FOLDED ONTO ONE KIND'S STATS — the four that are stat
 * surgery, in catalog order. Called once per kind per refreshSpecs and
 * never per shot (see Sim.specs).
 *
 * It takes no turret kind: a relic is a rule over the WHOLE board, and
 * the day one is written that means something to only one gun it belongs
 * in the mod catalog, which is where "one turret's business" lives.
 */
export function applyRelics(s: TowerStats, held: RelicsHeld): TowerStats {
  let out = s;
  for (const d of RELICS) if (d.apply && held.has(d.id)) out = d.apply(out);
  return out;
}

/** the turret deal's odds as the run's relics leave them (ascendancy) */
export function shiftedWeights(base: RarityWeights, held: RelicsHeld): RarityWeights {
  if (!held.has("ascendancy")) return base;
  return Object.fromEntries(
    RARITIES.map((r) => [r, base[r] * ASCENDANCY_MUL[r]]),
  ) as unknown as RarityWeights;
}

/** what one kill pays, times this — the scavenger relic and nothing else */
export const dropScale = (held: RelicsHeld): number =>
  held.has("scavenger") ? 1 + SCAVENGER_BONUS : 1;

/**
 * THE TITAN RAMP, per tier — what a round is multiplied by against a body
 * of that tier. Indexed by TIER and not by kind, because the sim has the
 * tier to hand at the one place that reads this (Sim.damageUnit).
 *
 * Written out to eight so a tier the roster does not have yet still reads
 * a number rather than undefined.
 */
export const TITAN_MUL: readonly number[] = Array.from(
  { length: 9 },
  (_, tier) => 1 + TITAN_PER_TIER * Math.max(0, tier - 1),
);

/**
 * THE CATALOG IS WELL FORMED — checked at import, so a relic written
 * wrong fails the build rather than quietly doing nothing on a shelf.
 */
(() => {
  const seen = new Set<RelicId>();
  for (const d of RELICS) {
    if (seen.has(d.id)) throw new Error(`the relic "${d.id}" is in the catalog twice`);
    seen.add(d.id);
    // EVERY RELIC IS NAMED. A relic is never a number, so there is
    // nothing for an unnamed one to be called
    if (!d.name) throw new Error(`the relic "${d.id}" has no name`);
    if (!d.blurb) throw new Error(`the relic "${d.id}" does not say what it does`);
  }
  for (const id of RELIC_IDS)
    if (!seen.has(id)) throw new Error(`RELIC_IDS names "${id}" and the catalog has no such relic`);
  if (RELICS.length !== RELIC_IDS.length)
    throw new Error("the catalog and RELIC_IDS disagree about how many relics there are");
  // THE CATALOG IS IN BAND ORDER, cheapest first — the order the shelf,
  // the codex and the track all read in, so nothing has to re-sort it
  let band = -1;
  for (const d of RELICS) {
    const at = RARITIES.indexOf(d.rarity);
    if (at < band) throw new Error(`the relic "${d.id}" is out of band order in the catalog`);
    band = at;
  }
  // ONE GLYPH MAY BE WORN TWICE, but never inside one band, where the
  // border colour could not tell the two apart (see RelicGlyph)
  const worn = new Set<string>();
  for (const d of RELICS) {
    const key = `${d.glyph}/${d.rarity}`;
    if (worn.has(key))
      throw new Error(`two ${d.rarity} relics wear the ${d.glyph} glyph — nothing can tell them apart`);
    worn.add(key);
  }
})();
