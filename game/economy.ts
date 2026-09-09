import { TOWERS } from "./constants";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * THE ECONOMY, in two currencies that never touch.
 *
 *   SCRAP  is IN-RUN money, and THE CORE MAKES ALL OF IT. Every run
 *          starts with SCRAP_START and the core ships CORE_BATCH at a
 *          time for as long as it stands, at CORE_INCOME a second PLUS
 *          DRILL_CORE_INCOME for every drill the run has standing — a
 *          drill mines nothing of its own, it DEEPENS THE CORE'S
 *          EXCAVATION, so there is still exactly one income and building
 *          drills is how it grows. Nothing the enemy does or dies of pays
 *          anything: a kill drops nothing, a wave lands with no bonus, a
 *          wrecked enemy building pays no bounty.
 *          So a run's whole budget is a CLOCK, and what it buys is
 *          factories (TOWER_PRICE); the bodies they make are free
 *          (CYCLE_SECONDS). Selling refunds SELL_REFUND of the price.
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
 * not afford to answer. The core's pay is a clock nothing on the board can
 * change, so the waves are free to be exactly as heavy as the mission
 * wants. It used to be a clock PLUS the ore veins a run expanded out to
 * claim; the veins went when the base moved onto the highground, out of
 * the war (Sim.untouchable) — a vein is a thing you hold against someone,
 * and there is nobody to hold it against any more.
 */

// ---------------------------------------------------------------------------
// SCRAP — the run's money
// ---------------------------------------------------------------------------

/**
 * What a run opens with, and what the four-minute grace is spent on: the
 * first factories, and which lines they belong to. At the tier-1 price
 * (TOWER_PRICE) it is twenty of them, or a handful of tier-3s, or a
 * spread — deliberately a fraction of what the core pays over the grace
 * (CORE_INCOME x GRACE_DEFAULT is twice this), so the opening is a
 * decision about what to build first, not a board bought whole.
 */
export const SCRAP_START = 3000;

/**
 * THE CORE'S PAY: scrap a second, for as long as the core stands and
 * before any drill deepens it. Over a 25-minute run the bare rate is about
 * 37,000, and every price in this file is written against that one number.
 * Sim.income is the live rate; the core actually pays it CORE_BATCH at a
 * time (Sim.updateMining).
 */
export const CORE_INCOME = 25;

/**
 * THE LOAD THE SCRAP ARRIVES IN, and why it arrives in loads at all.
 *
 * A core paying 25 a second pays 0.4 a frame: a number that cannot be seen
 * happening. Shipping is a CYCLE instead — the core fills a CORE_BATCH
 * load, a bar over its footprint fills with it (Game.drawStructureBars),
 * and the load lands in the bank whole every four seconds. Averaged over
 * any stretch longer than a load the income is exactly CORE_INCOME, which
 * is the number the prices and the stage audit (ladder.ts) are written
 * against.
 */
export const CORE_BATCH = 100;

/**
 * WHAT ONE DRILL ADDS to the core's excavation, in scrap a second.
 *
 * A drill does not mine. It sinks a shaft beside the core's and the core
 * ships faster for it — one income, made quicker — which is why the bar
 * over the core visibly fills faster as drills go up, and why a drill lost
 * is income lost rather than a second engine stopping.
 *
 * At 5 a second against a price of 400 a drill pays for itself in eighty
 * seconds, under three cycles (CYCLE_SECONDS), and is pure profit after.
 * That is deliberately a strong return: the drill is the only building in
 * the game that pays for the others, so the whole of a run's opening is
 * the question of how many to sink before the first bodies — and every
 * one of them is a factory not built while the first wave is walking in.
 *
 * NOTHING CAPS IT. Drills fund drills, so a run left alone compounds; what
 * stops it is the highground a map hands out (Sim.canPlace) and the clock
 * the swarm is keeping.
 */
export const DRILL_CORE_INCOME = 5;

/** how long the core takes to fill one CORE_BATCH shipment at the bare
 *  rate — the length a load actually takes is the LIVE rate's
 *  (Sim.coreLoadSeconds), which every drill shortens */
export const CORE_LOAD_SECONDS = CORE_BATCH / CORE_INCOME;

/**
 * THE CYCLE — one clock for the whole base, and the beat the run is played
 * to.
 *
 * Every CYCLE_SECONDS every finished building of the player's fires at
 * once: a drill pays DRILL_CYCLE_PAY, a factory sets FACTORY_CYCLE_UNITS
 * bodies of its tier down beside the core. Nothing runs a clock of its
 * own, nothing is queued and nothing is owed — a cycle that finds the
 * field full (PLAYER_UNIT_CAP) simply makes fewer bodies and the next one
 * tries again.
 *
 * WHY ONE CLOCK AND NOT ONE PER BUILDING. A factory used to run its own
 * timer and charge UNIT_PRICE per body, which made a base a set of
 * subscriptions the drills were paying off at different rates: what the
 * player watched was a dozen bars filling out of step, and what they
 * decided was nothing. One beat makes the whole base a single readable
 * event — the bar fills, the base fires, the army grows by exactly what is
 * standing — and it moves every decision back onto WHAT IS BUILT.
 *
 * A FACTORY'S BODY IS FREE. The building was the purchase; what it buys is
 * one body of that tier every cycle for the rest of the run. That is what
 * lets a player spend a whole cycle's income on the next building rather
 * than holding a float back to pay for bodies they have already bought.
 *
 * A DRILL'S PAY IS FLAT, with no ore under it to ask about — there is no
 * ore on any map any more (maps.ts terrainOf). The rate is what a drill
 * squarely on a full vein used to earn over the same thirty seconds
 * (DRILL_INCOME_PER_ORE x 4 x 30), so the shape of the opening — a drill
 * pays for itself inside two cycles — is the shape it always had.
 */
export const CYCLE_SECONDS = 30;
export const DRILL_CYCLE_PAY = 180;
export const FACTORY_CYCLE_UNITS = 1;

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
  /**
   * THE FACTORIES — the only thing a run buys, and the whole of what it
   * decides. Priced against ONE CLOCK: the core pays CORE_INCOME a second,
   * which is 750 scrap a cycle (CYCLE_SECONDS), and every price below is
   * read as "how many cycles of the core's pay is this".
   *
   *   T1  150   a fifth of a cycle. SPAM. Five of them off one cycle's
   *   T2  400   income, twenty out of the opening stipend — a tier-1 line
   *             is something a player lays down by the row and keeps
   *             laying down, and a tier-2 is the same gesture at half the
   *             rate. These two are the floor of every board.
   *   T3  1500  two cycles: the first purchase a player actually saves
   *             for, and the one that ends the opening.
   *   T4  8000  eleven cycles, five and a half minutes of everything.
   *   T5  20000 twenty-seven cycles. A T5 factory is most of a run's
   *             income spent on one building — it is the thing a long
   *             game is FOR, and a board that has one had to give up
   *             fifty tier-1s to get it.
   *
   * The curve is steeper than it was on purpose. The old spread (500 to
   * 12000) made every tier affordable within a few cycles of each other,
   * so the board converged on "whatever is highest" and the low tiers were
   * a phase a run passed through. At these prices the cheap lines never
   * stop being worth buying — a hundred daggers a cycle is a real answer
   * to a wave — and the dear ones are a commitment rather than a step.
   */
  // THE DRILL pays for itself in under three cycles and then keeps
  // paying: it is the only building that makes the others affordable, so
  // it is priced where an opening has to CHOOSE between the first drills
  // and the first bodies rather than taking both
  drill: 400,
  "factory-t1": 150,
  "factory-t2": 400,
  "factory-t3": 1500,
  "factory-t4": 8000,
  "factory-t5": 20000,
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
