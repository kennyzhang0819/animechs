import { TOWERS } from "./constants";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * THE ECONOMY, in two currencies that never touch.
 *
 *   SCRAP  is IN-RUN money, and THE PLAYER MAKES ALL OF IT. Every run
 *          starts with SCRAP_START, the core ships CORE_BATCH at a time
 *          for as long as it stands, and every drill on an ore vein hands
 *          over a DRILL_BATCH load as often as the ore under it fills one.
 *          The RATES behind those loads are CORE_INCOME and
 *          DRILL_INCOME_PER_ORE a second, so what a run earns over a
 *          minute is what it always was — it simply arrives in loads with
 *          a bar filling toward each one, rather than as a trickle no
 *          single frame can show. Nothing
 *          the enemy does or dies of pays anything: a kill drops nothing,
 *          a wave lands with no bonus, a wrecked enemy building pays no
 *          bounty. Every turret, wall, drill and factory placed costs
 *          scrap (TOWER_PRICE), and every unit a factory builds costs its
 *          tier's UNIT_PRICE. Selling refunds SELL_REFUND of the price.
 *          Nothing carries between runs.
 *
 *   XP     is META progress, and IT IS PAID FOR OBJECTIVES, NOT KILLS.
 *          Every mission is worth the same fixed MISSION_XP for a full
 *          clear, and that pot is dealt out one wave at a time as the
 *          waves are CLEARED — the way a StarCraft II co-op mission pays
 *          for each objective met rather than for each body dropped.
 *          Wave 1 is worth a sliver (WAVE_XP_RAMP), the last wave a few
 *          times that, and the shares sum to the whole pot. The rung
 *          played multiplies it (tierXpBonus in ladder.ts) and a random
 *          map pays RANDOM_MAP_XP_BONUS more on top.
 *          XP turns into PLAYER LEVEL through the curve below, and every
 *          level is a rung on the track (track.ts): the factions, the maps.
 *
 * WHY THE INCOME IS THE PLAYER'S AND NOT THE SWARM'S. Kills used to drop
 * scrap by tier, which tied the economy to the wave script: the waves had
 * to be authored so that their bodies paid for the turrets that killed
 * them, and a wave the designer wanted small was a wave the player could
 * not afford to answer. An RTS economy comes out of the ground instead —
 * the core's steady pay, and the veins the run expands out to claim — so
 * the waves are free to be exactly as heavy as the mission wants, and
 * expansion is worth something on its own. This also replaced five
 * currencies and a count model before it, where a tech-tree point WAS a
 * placement and the whole board went down before the first wave.
 */

// ---------------------------------------------------------------------------
// SCRAP — the run's money
// ---------------------------------------------------------------------------

/**
 * What a run opens with, and what the four-minute grace is spent on: a
 * first line of a dozen guns and a wall, a drill or two on the nearest
 * vein, and the first factory. Deliberately a fraction of what the core
 * pays over the grace (CORE_INCOME x GRACE_DEFAULT is twice this): the
 * opening is a decision about what to build first, not a board bought
 * whole.
 */
export const SCRAP_START = 3000;

/**
 * THE CORE'S PAY: scrap a second, for as long as the core stands. This is
 * the run's base income — over a 25-minute run it is about 37,000, which
 * buys a faction's whole line once, so the run's second line and its
 * heavy tier come out of the drills. Sim.income is the rate; the core
 * actually pays it CORE_BATCH at a time (Sim.updateMining).
 */
export const CORE_INCOME = 25;

/**
 * A DRILL'S PAY: scrap a second per ORE CELL under its 2x2 footprint
 * (Tower.ore), so a drill squarely on a vein pays four times this and one
 * hanging off its edge pays for the cell that is on it — Mindustry's own
 * rule, where a drill's speed is its ore count. Six a second for a full
 * drill: a drill pays itself back (TOWER_PRICE) inside a minute, and four
 * of them match the core, which is what makes the veins worth walking
 * out to and worth holding.
 *
 * THIS IS A RATE, NOT A DRIP. What the drill actually does with it is
 * fill a DRILL_BATCH load and hand the whole load over at once — see
 * drillLoadSeconds below.
 */
export const DRILL_INCOME_PER_ORE = 1.5;

/**
 * THE LOADS THE SCRAP ARRIVES IN, and why it arrives in loads at all.
 *
 * A drill that paid 6 scrap a second paid 0.1 a frame: a number that
 * could not be seen happening, on a building that looked identical
 * whether it was on four ore cells or one. Mining is now a CYCLE — the
 * drill fills a DRILL_BATCH load at its ore's rate, a bar over its
 * footprint fills with it (Game.drawStructureBars), and the load lands
 * in the bank whole. The core ships the same way, CORE_BATCH at a time.
 *
 * THE BATCH SIZES ARE CHOSEN BY THEIR CLOCKS, not by their round numbers.
 * A drill on a full vein delivers every DRILL_BATCH / (4 x 1.5) = 5
 * seconds — often enough to feel like an engine running, slow enough that
 * the bar is worth looking at — and one hanging off a vein by a single
 * cell takes 20, which is the same "is this spot worth it" question the
 * ore count always asked, now visible on the building. The core's 100
 * lands every 4 seconds, so the opening still ticks along while nothing
 * is built yet.
 *
 * NOTHING ABOUT THE ECONOMY'S SIZE MOVED. Averaged over any stretch
 * longer than a load, income is exactly CORE_INCOME plus the drills'
 * rates — the stage audit (ladder.ts) and every price above are priced
 * against the same numbers they always were.
 */
export const DRILL_BATCH = 30;
export const CORE_BATCH = 100;

/** how long a drill on `ore` cells takes to fill one DRILL_BATCH load —
 *  Infinity for a drill on no ore, which never fills one */
export const drillLoadSeconds = (ore: number): number =>
  ore > 0 ? DRILL_BATCH / (ore * DRILL_INCOME_PER_ORE) : Infinity;

/** how long the core takes to fill one CORE_BATCH shipment */
export const CORE_LOAD_SECONDS = CORE_BATCH / CORE_INCOME;

/**
 * WHAT A FACTORY CHARGES FOR A UNIT, by the unit's tier (index 0 unused),
 * and how long it takes to make one. The prices follow the turret bands:
 * a tier-1 body is a turret and a half, a tier-3 body is a tier-2 turret,
 * a tier-5 body is a tier-3 turret — and the clocks are Mindustry's
 * factory and reconstructor times, near enough, so a T5 is minutes of a
 * building's life. A factory that cannot afford its next unit waits
 * (Sim.updateProduction); nothing is queued and nothing is owed.
 */
export const UNIT_PRICE: readonly number[] = [0, 100, 300, 900, 3000, 8000];
export const UNIT_BUILD_SECONDS: readonly number[] = [0, 15, 25, 45, 90, 150];

/**
 * THE MOST BODIES THE PLAYER'S FACTORIES KEEP ON THE FIELD AT ONCE, all
 * tiers together — there is no per-tier allowance, and never was: a T1
 * swarm and a T5 line draw on the same one number. A factory that finds
 * the field full waits, having paid nothing.
 *
 * 800, up from Mindustry's own 80. The old figure was the reason a board
 * full of factories went quiet after a few minutes and looked broken: the
 * bar sat empty, the scrap piled up, and nothing said why. 800 is a cap
 * the SIM still holds (MAX_UNITS is 6000, and the swarm shares it) but
 * one an ordinary run does not spend its whole length pressed against.
 */
export const PLAYER_UNIT_CAP = 800;

/**
 * What a sold turret hands back, as a fraction of its price. NOTHING: a
 * placed turret is spent, and demolishing it only clears the ground it
 * stood on. A board is a commitment, so what a stage asks is which turrets
 * are worth the scrap they sink — a duo wall bought in stage 1 is still a
 * duo wall in stage 2, and the salvo line beside it is paid for out of
 * stage-2 income alone.
 */
export const SELL_REFUND = 0;

/** the scrap a sale returns for a turret of this kind */
export const sellValue = (kind: TowerKind): number =>
  Math.floor(scrapPriceOf(kind) * SELL_REFUND);

/**
 * THE THREE PRICE BANDS, and the stage of a run each one is priced for.
 *
 * A PRICING TABLE, NOT A GATE. The split follows Mindustry's own build-cost
 * ranking (MINDUSTRY_VALUE in tech.ts): the six cheapest are band 1, the
 * next six band 2, the five dearest band 3, and a band's turrets are
 * priced so the STAGE it belongs to is roughly what buys them — see
 * TOWER_PRICE — which the stage audit in ladder.ts checks against the
 * script. Nothing in a run reads it: a turret the save owns (the track,
 * track.ts) may be placed from wave 1, spectre included.
 */
export type TowerTier = 1 | 2 | 3;

export const TOWER_TIER: Record<TowerKind, TowerTier> = {
  duo: 1,
  scorch: 1,
  hail: 1,
  arc: 1,
  scatter: 1,
  wave: 1,
  swarmer: 2,
  lancer: 2,
  salvo: 2,
  ripple: 2,
  parallax: 2,
  cyclone: 2,
  fuse: 3,
  tsunami: 3,
  spectre: 3,
  meltdown: 3,
  foreshadow: 3,
  // the drill and the factories are band-1 goods: bought from the first wave's income
  // the economy and the army: the drill and the first factory are opening
  // buys, the heavy reconstructors are the middle and the end of the run
  drill: 1,
  "factory-t1": 1,
  "factory-t2": 1,
  "factory-t3": 2,
  "factory-t4": 2,
  "factory-t5": 3,
};

/**
 * The GUNS of a band, in roster order — what a stage is audited against.
 * The buildings are priced in band 1 and left out of this: a drill or a
 * factory is bought BESIDE the guns rather than instead of them, and
 * counting them would drag the band's mean price down. (It read "walls"
 * until the walls were removed; the rule was always about anything with
 * no gun on it.)
 */
export const towersOfTier = (tier: TowerTier): TowerKind[] =>
  TOWER_KINDS.filter((k) => TOWER_TIER[k] === tier && !TOWERS[k].building);

/**
 * THE STAGES OF A RUN, as 1-based inclusive wave ranges — the three
 * stretches the three price bands are priced for. Waves 1-3 pay for band
 * 1, 4-6 for band 2, 7-8 for band 3, and the audit (ladder.ts) sums
 * what each stage pays and holds it against its band's prices. THAT IS ALL
 * THEY DO. The stage gate that once held a band shut until its stage
 * opened is gone: what may be placed is what the save owns (track.ts),
 * and it may be placed from the first wave.
 */
export const STAGES: readonly { tier: TowerTier; from: number; to: number }[] = [
  { tier: 1, from: 1, to: 3 },
  { tier: 2, from: 4, to: 6 },
  { tier: 3, from: 7, to: 8 },
];

/**
 * WHAT EVERY TURRET COSTS, in scrap, AUTHORED.
 *
 * Priced against the stage income above, tier by tier:
 *
 *   TIER 1 (waves 1-3, ~11,400 scrap with the opening). About 150 a
 *   turret, so the stage buys a line of roughly 70 tier-1 emplacements —
 *   a duo line with the specialists mixed in. Duo is the volume turret
 *   and stays cheap; wave is the dearest because it multiplies everything
 *   beside it.
 *
 *   TIER 2 (waves 4-6, ~20,000 scrap). A thousand and up — six to fifteen
 *   duos each, so one is a real save in stage 1 and a wave's income in
 *   stage 2. The opening board is sunk (SELL_REFUND is 0), so the
 *   transition is funded from stage-2 income alone — which is exactly the
 *   decision the stage asks: what to stop buying before the gate opens.
 *
 *   TIER 3 (waves 7-8, ~43,000 scrap). Four thousand and up — a wave of
 *   stage-3 income apiece, so a run fields a handful of them and places
 *   each one on purpose.
 *
 * The ORDER within a tier follows Mindustry's build costs; the SIZE is
 * what the stage pays. Tune from the balance dashboard (scrapPriceOf
 * reads an override layer) and write a settled number back here.
 */
export const TOWER_PRICE: Record<TowerKind, number> = {
  duo: 60,
  scorch: 110,
  hail: 120,
  arc: 150,
  scatter: 180,
  wave: 300,
  swarmer: 1000,
  lancer: 900,
  salvo: 900,
  ripple: 1400,
  parallax: 1500,
  cyclone: 1800,
  fuse: 4000,
  tsunami: 5000,
  spectre: 7500,
  meltdown: 9000,
  foreshadow: 12000,
  // THE DRILL pays itself back in under a minute on a full vein (see
  // DRILL_INCOME_PER_ORE): cheap enough to be the first thing bought,
  // dear enough that a vein under fire is a loss
  drill: 300,
  // THE FACTORIES are the run's clock (levels.ts: T1-3 units by seven
  // minutes, T4 by fourteen, T5 after): each is priced at roughly what the
  // core has paid by the time its tier is due
  "factory-t1": 500,
  "factory-t2": 1200,
  "factory-t3": 3000,
  "factory-t4": 6000,
  "factory-t5": 12000,
};

const priceOverrides = new Map<TowerKind, number>();

/** the scrap price in force — the authored one unless the dashboard bent it */
export const scrapPriceOf = (kind: TowerKind): number =>
  priceOverrides.get(kind) ?? TOWER_PRICE[kind];

/** the price as authored — where a Reset returns to */
export const authoredScrapPrice = (kind: TowerKind): number => TOWER_PRICE[kind];

/** point one price somewhere else; undefined restores the authored value */
export function setScrapPrice(kind: TowerKind, value: number | undefined): void {
  if (value === undefined || !Number.isFinite(value) || value < 0) priceOverrides.delete(kind);
  else priceOverrides.set(kind, Math.round(value));
}

/** only what has actually been bent, for the balance document */
export function allScrapPriceOverrides(): Record<string, number> {
  return Object.fromEntries([...priceOverrides]);
}

/** replace every override at once — what a saved balance document applies */
export function applyScrapPriceOverrides(doc: Record<string, unknown>): void {
  priceOverrides.clear();
  for (const k of TOWER_KINDS) {
    const v = doc[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) priceOverrides.set(k, Math.round(v));
  }
}

/** scrap per tile of footprint — the number to compare two turrets by */
export const pricePerTile = (kind: TowerKind): number =>
  scrapPriceOf(kind) / TOWERS[kind].size ** 2;

// ---------------------------------------------------------------------------
// XP — the save's progress
// ---------------------------------------------------------------------------

/**
 * WHAT A MISSION IS WORTH, in XP: the whole pot a full clear pays AT
 * NEMESIS — the last named difficulty, the script sent whole with no
 * rules (XP_BASE_TIER in ladder.ts) — THE SAME ON EVERY MAP AND EVERY
 * SCRIPT. Nothing about the bodies moves it — not their tier, not their
 * health, not how many there were. A mission is one assignment and it
 * pays one price for being done. The rung multiplies it from there
 * (tierXpBonus: Incursion x0.4, Nemesis +6 x2.2) and a random map adds
 * a quarter.
 *
 * THE POT IS DEALT OUT BY OBJECTIVE, and the objectives are the waves:
 * every wave the run CLEARS (every body it sent is down — killed,
 * devoured or blown up) banks that wave's share the moment its last body
 * drops, and a run that dies on wave 25 keeps what waves 1 to 24 paid. A
 * win is every objective met and pays the whole pot, however the last
 * wave ended. Kills pay nothing at all — not XP, and not scrap either
 * (the income is the player's: CORE_INCOME and the drills).
 *
 * WHY. Under the kill rule the pot was ~246,000 XP on the reference
 * script and it sat where the health sat: waves 1-20 paid 23,000 of it
 * (under a tenth), waves 36-50 paid 161,000 (two thirds). A save that
 * could hold twenty waves and not thirty was earning at a twentieth of
 * the rate of one that cleared, which made the early ladder a grind and
 * the tier-5 wall the only thing worth killing. On this rule the same
 * twenty waves pay 27,755 of 100,000 at Nemesis — more XP than before in
 * absolute terms, and three times the share.
 */
export const MISSION_XP = 100_000;

/**
 * HOW THE POT RAMPS ACROSS THE WAVES: the last wave's share is this many
 * times the first wave's, and the shares between climb linearly. At 3 on
 * the eight-wave script wave 1 pays 6% of the pot and wave 8 pays 19% —
 * every wave is worth something, and the deep ones are worth the most
 * because they are the hardest to reach. Shares always sum to exactly 1
 * whatever the wave count, so a shorter script pays the same pot in
 * fewer, larger pieces.
 */
export const WAVE_XP_RAMP = 3;

/**
 * The share of MISSION_XP that clearing wave `wave` (1-based) of a
 * `waves`-wave mission pays, in [0, 1]. Linear from 1 to WAVE_XP_RAMP
 * across the script, normalised so the whole script sums to 1: the sum
 * of the raw weights 1 + (r - 1) x (w - 1) / (n - 1) over n waves is
 * n x (1 + r) / 2.
 */
export function waveXpShare(wave: number, waves: number): number {
  const n = Math.max(1, Math.floor(waves));
  const w = Math.floor(wave);
  if (w < 1 || w > n) return 0;
  if (n === 1) return 1;
  const weight = 1 + ((WAVE_XP_RAMP - 1) * (w - 1)) / (n - 1);
  return weight / ((n * (1 + WAVE_XP_RAMP)) / 2);
}

/** the XP clearing one wave banks, before the rung and map bonuses */
export const waveXp = (wave: number, waves: number): number =>
  Math.round(MISSION_XP * waveXpShare(wave, waves));

/**
 * WHAT A RUN HAS EARNED, before the rung and map bonuses: the shares of
 * the first `cleared` waves of a `waves`-wave mission, and the whole pot
 * once every wave is cleared. Summed wave by wave from the rounded
 * per-wave payouts rather than from the closed form, so what the HUD
 * counts up during a run and what the results screen banks at the end
 * are the same arithmetic — and the last wave's share is whatever brings
 * the total to exactly MISSION_XP, so rounding never leaves a clear a
 * point short.
 */
export function missionXp(cleared: number, waves: number): number {
  const n = Math.max(0, Math.floor(waves));
  const c = Math.min(n, Math.max(0, Math.floor(cleared)));
  if (n === 0) return 0;
  if (c >= n) return MISSION_XP;
  let total = 0;
  for (let w = 1; w <= c; w++) total += waveXp(w, n);
  return total;
}

/**
 * THE LEVEL CURVE, in three pieces.
 *
 *   THE CLIMB, levels 1 to XP_LEVEL_KNEE (15) — the track (track.ts),
 *   where every level opens something. Going from level n to n+1 costs
 *   XP_LEVEL_BASE x n to the power XP_LEVEL_POWER — a little more than
 *   the last one every time, never a wall: 5,000 at level 1, ~61,000 at
 *   10, ~110,000 at 15.
 *
 *   THE RAMP, levels 15 to XP_LEVEL_PLATEAU (100). The step climbs in a
 *   straight line from what level 15 cost to XP_LEVEL_FLAT at level 100
 *   — about 4,600 more a level — so no level on the way up ever costs
 *   more than a level on the plateau does. Level 99 is ~495,000.
 *
 *   THE PLATEAU, levels 100 to LEVEL_CAP (1000). Every level costs the
 *   same XP_LEVEL_FLAT (500,000): the long tail a save keeps earning
 *   after it owns everything, with the tick of a level at a fixed, known
 *   price — five Nemesis clears, or two or three at the top rung.
 *
 *   level    2      3      5      10     15     24     50     100    1000
 *   to next  5k     11k    24k    61k    110k   151k   270k   500k   500k
 *   total    5k     16k    58k    288k   714k   1.9m   7.2m   26m    476m
 *
 * WHAT THAT MEANS AGAINST A MAP. A full clear at Nemesis pays MISSION_XP
 * (100,000) and lands level 6; at Incursion it pays 40,000 and lands
 * level 4; a Nemesis wipe after twenty waves banks ~27,800 and lands
 * level 3. The rung bonus (tierXpBonus, x0.4 to x2.2) is the multiplier
 * on all of it, and that is how the track is climbed: the end of the
 * ROSTER phase (ROSTER_TOP in track.ts, where the last wall opens)
 * stands at about 714,000 XP — seven or eight Nemesis clears, or three
 * or four at the top rung — and the MUTATOR phase behind it runs to
 * about 1,900,000 at MAX_LEVEL (24). Everything above that is the long
 * tail: level 100 is 26 million, and the cap is 476 million. Nothing on
 * the track is handed out up there (track.ts); the number is the number.
 */
export const XP_LEVEL_BASE = 5000;
export const XP_LEVEL_POWER = 1.14;
/** the level the power curve hands over to the straight ramp */
export const XP_LEVEL_KNEE = 15;
/** the level the ramp reaches the plateau */
export const XP_LEVEL_PLATEAU = 100;
/** what every level on the plateau costs — and what the ramp climbs to */
export const XP_LEVEL_FLAT = 500_000;
/** the highest level a save can stand at; XP past it banks and does nothing */
export const LEVEL_CAP = 1000;

/** the climb's step: XP_LEVEL_BASE x level to the power */
const climbStep = (level: number): number => XP_LEVEL_BASE * Math.max(1, level) ** XP_LEVEL_POWER;

/** XP needed to climb from `level` to `level + 1` */
export function xpToNext(level: number): number {
  if (level >= XP_LEVEL_PLATEAU) return XP_LEVEL_FLAT;
  if (level < XP_LEVEL_KNEE) return Math.round(climbStep(level));
  const knee = climbStep(XP_LEVEL_KNEE);
  const t = (level - XP_LEVEL_KNEE) / (XP_LEVEL_PLATEAU - XP_LEVEL_KNEE);
  return Math.round(knee + (XP_LEVEL_FLAT - knee) * t);
}

/** total XP at which `level` is reached — level 1 is zero */
export function xpAtLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, LEVEL_CAP); l++) total += xpToNext(l);
  return total;
}

/**
 * The level a lifetime XP total stands at, LEVEL_CAP at most. A loop
 * rather than a closed form: the sum of a power law has none, and the
 * walk is at most a thousand additions.
 */
export function levelForXp(xp: number): number {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (level < LEVEL_CAP) {
    const need = xpToNext(level);
    if (left < need) return level;
    left -= need;
    level++;
  }
  return LEVEL_CAP;
}

/** how far into the current level a total is: xp earned since it, and the
 *  xp the next one needs */
export function levelProgress(xp: number): { level: number; into: number; need: number } {
  const level = levelForXp(xp);
  const need = xpToNext(level);
  // at the cap the bar is simply full: there is no next level to fill toward
  const into = level >= LEVEL_CAP ? need : Math.max(0, Math.floor(xp)) - xpAtLevel(level);
  return { level, into, need };
}


/**
 * THE RANDOM-MAP BONUS: what a run pays on top for letting the game pick
 * the map. The menu's map macro defaults to Random, and a player who
 * leaves it there banks a quarter more XP than one who chose — a nudge
 * towards playing every front rather than farming the one they know.
 * Multiplies the run's objective XP the same way the rung's bonus does
 * (grantRunReward), so it stacks: the top difficulty on a random map is x2.2 x1.25.
 */
export const RANDOM_MAP_XP_BONUS = 0.25;

// ---------------------------------------------------------------------------
// display
// ---------------------------------------------------------------------------

/** the scrap sprite and colour (Mindustry Items.scrap, 777777, lifted) */
export const SCRAP_ICON = "/mindustry/sprites/items/item-scrap.png";
export const SCRAP_COLOR = "#B8B8C0";
/** XP has no Mindustry item — it draws as a star in this colour */
export const XP_COLOR = "#7BDFF2";
/** the skill-point colour, the tree's own gold */
export const POINT_COLOR = "#FFD37F";
