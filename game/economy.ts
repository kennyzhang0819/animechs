import { TOWERS } from "./constants";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * THE ECONOMY, in two currencies that never touch.
 *
 *   SCRAP  is IN-RUN money. Every run starts with SCRAP_START, every kill
 *          drops its tier's scrap (SCRAP_BY_TIER), every wave that lands
 *          pays a small bonus (waveBonusScrap), and every turret placed
 *          costs scrap (TOWER_PRICE). Selling refunds SELL_REFUND of the
 *          price. Nothing carries between runs — a run is solved from
 *          its opening board to its last wave on what it earns.
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
 *          level is a rung on the track (track.ts): maps, paces, upgrades.
 *
 * THIS REPLACED FIVE CURRENCIES AND A COUNT MODEL. The bank used to hold
 * copper, titanium, thorium, plastanium and phase fabric, one per enemy
 * tier, and a tech-tree point WAS a placement — a save that owned 300 duos
 * could stand 300 duos on wave 1 for free. The run had no economy and so
 * no decisions: the whole board went down before the first wave, and the
 * correct opening on every map was the best turret the save owned, up to
 * its count. Scrap is what puts an early, a middle and a late game back
 * inside one run, and the level ladder is what the tree is paid in now.
 *
 * KILLS DROP SCRAP AND NOTHING ELSE. A dagger always pays the same scrap,
 * on every rung, on every map — scrap income is a fact about the SCRIPT,
 * which is what lets the turret prices below be authored against it. XP
 * used to come off the same kills (one point per 110 hp of the body), and
 * that put most of a run's XP behind the tier-5 wall: the last fifteen
 * waves paid two thirds of a clear and the first twenty under a tenth, so
 * a run that died on wave 25 banked almost nothing for the twenty-four
 * waves it held. Paying for the WAVE rather than the BODY is what fixes
 * that — see MISSION_XP.
 */

// ---------------------------------------------------------------------------
// DROPS
// ---------------------------------------------------------------------------

/**
 * what one kill pays: scrap into the run. It is a record and not a bare
 * number because it used to carry XP too, and every ledger that sums
 * drops (a wave's, a stage's, a run's) reads it by name
 */
export interface Drop {
  scrap: number;
}

export const emptyDrop = (): Drop => ({ scrap: 0 });

/** n copies of a drop folded into an accumulator */
export function addDrop(into: Drop, d: Drop, n = 1): void {
  if (n <= 0) return;
  into.scrap += d.scrap * n;
}

export const isEmptyDrop = (d: Drop): boolean => d.scrap === 0;

/**
 * WHAT EACH UNIT TIER PAYS IN SCRAP, indexed by tier (index 0 is unused).
 * A T1 always drops exactly this; a T5 always drops exactly that. XP is
 * NOT on this table — a kill pays no XP at all, see MISSION_XP.
 *
 * The shape is the point. Confluence sends tier-1 bodies by the
 * thousand and tier-5 bodies by the dozen, so the low rows are cheap per
 * body and the high rows are dear, and the three stages of a run come out
 * paying what the three turret tiers cost — see TOWER_PRICE and the stage
 * audit in ladder.ts. Against Confluence's script (public/levels/1.json)
 * the kills alone pay about:
 *
 *   waves  1-20   ~217,000 scrap
 *   waves 21-35   ~486,000 scrap
 *   waves 36-50   ~791,000 scrap
 *
 * THE SCRAP IS GENEROUS ON PURPOSE. A run is meant to be cleared FIRST
 * TRY by a player who builds sensibly, the way a Bloons map is — the
 * fifty waves are the fixed thing and the money is tuned to them, not the
 * other way round. Headless runs of the shipped script with a plain
 * round-robin builder clear all fifty at this income and die on wave 11
 * at half of it, so this is the floor, not a ceiling.
 */
export const SCRAP_BY_TIER: readonly number[] = [0, 10, 30, 80, 200, 500];

/**
 * A boss is one body a run and its SCRAP is an event: a lump for the
 * board that fells it, whatever tier it is.
 */
export const BOSS_SCRAP = 5000;

/** the drop for one unit: scrap off its tier, a boss its lump */
export function dropForUnit(tier: number, boss = false): Drop {
  const i = Math.max(1, Math.floor(tier));
  return {
    scrap: boss ? BOSS_SCRAP : SCRAP_BY_TIER[Math.min(i, SCRAP_BY_TIER.length - 1)],
  };
}

// ---------------------------------------------------------------------------
// SCRAP — the run's money
// ---------------------------------------------------------------------------

/**
 * What a run opens with. A hundred-odd tier-1 turrets' worth — wave 1 is
 * forty daggers but wave 9 is five hundred crawlers and wave 10 six
 * hundred daggers, and the opening has to buy the board that meets them
 * before their own kills have paid for it. Past wave 10 the run pays for
 * itself.
 */
export const SCRAP_START = 7500;

/**
 * THE WAVE BONUS, paid the moment a wave starts entering: a small stipend
 * so a board that leaked its way through one wave can still afford to fix
 * itself for the next. Bloons pays end-of-round cash the same way. It is
 * deliberately a rounding error against the kill drops (about 5% of a
 * full run's scrap) — the swarm is the income, this is the floor under it.
 */
export const WAVE_BONUS_BASE = 250;
export const WAVE_BONUS_PER_WAVE = 50;
export const waveBonusScrap = (wave: number): number =>
  WAVE_BONUS_BASE + WAVE_BONUS_PER_WAVE * Math.max(0, Math.floor(wave));

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
  // walls are band-1 goods: bought by the dozen from the first wave's income
  "copper-wall": 1,
  "titanium-wall": 1,
  "thorium-wall": 1,
  "copper-wall-large": 1,
  "titanium-wall-large": 1,
  "thorium-wall-large": 1,
};

/** every turret of one tier, in roster order */
/** the GUNS of a band — the walls are priced in band 1 but are not what
 *  a stage is audited against: a lane of walls is bought beside the guns,
 *  not instead of them, and would drag the band's mean price down */
export const towersOfTier = (tier: TowerTier): TowerKind[] =>
  TOWER_KINDS.filter((k) => TOWER_TIER[k] === tier && !TOWERS[k].wall);

/**
 * THE STAGES OF A RUN, as 1-based inclusive wave ranges — the three
 * stretches the three price bands are priced for. Waves 1-20 pay for band
 * 1, 21-35 for band 2, 36-50 for band 3, and the audit (ladder.ts) sums
 * what each stage pays and holds it against its band's prices. THAT IS ALL
 * THEY DO. The stage gate that once held a band shut until its stage
 * opened is gone: what may be placed is what the save owns (track.ts),
 * and it may be placed from the first wave.
 */
export const STAGES: readonly { tier: TowerTier; from: number; to: number }[] = [
  { tier: 1, from: 1, to: 20 },
  { tier: 2, from: 21, to: 35 },
  { tier: 3, from: 36, to: 50 },
];

/**
 * WHAT EVERY TURRET COSTS, in scrap, AUTHORED.
 *
 * Priced against the stage income above, tier by tier:
 *
 *   TIER 1 (waves 1-20, ~21,700 scrap). About 150 a turret, so the whole
 *   stage buys a board of roughly 140 tier-1 emplacements — a duo wall
 *   with the specialists mixed in. Duo is the volume turret and stays
 *   cheap; wave is the dearest because it multiplies everything beside it.
 *
 *   TIER 2 (waves 21-35, ~48,600 scrap). A thousand and up — six to fifteen
 *   duos each, so one is a real save in stage 1 and a wave's income in
 *   stage 2. The opening board is sunk (SELL_REFUND is 0), so the
 *   transition is funded from stage-2 income alone — which is exactly the
 *   decision the stage asks: what to stop buying before the gate opens.
 *
 *   TIER 3 (waves 36-50, ~79,100 scrap). Four thousand and up — a wave or
 *   two of stage-3 income apiece, so a run fields a handful of them and
 *   places each one on purpose.
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
  // WALLS: a third of a duo for copper, so a lane is lined for the price
  // of a few guns, and the heavier two priced at what their pool is worth
  // against it (see WALL_HP_SCALE in constants.ts)
  "copper-wall": 20,
  "titanium-wall": 50,
  "thorium-wall": 120,
  // the large walls are four of the small at the small's price a tile —
  // the same deal Mindustry makes (six items a tile either way)
  "copper-wall-large": 80,
  "titanium-wall-large": 200,
  "thorium-wall-large": 480,
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
 * WHAT A MISSION IS WORTH, in XP, before the rung and map bonuses: the
 * whole pot a full clear pays, THE SAME ON EVERY MAP AND EVERY SCRIPT.
 * Nothing about the bodies moves it — not their tier, not their health,
 * not how many there were. A mission is one assignment and it pays one
 * price for being done.
 *
 * THE POT IS DEALT OUT BY OBJECTIVE, and the objectives are the waves:
 * every wave the run CLEARS (every body it sent is down — killed,
 * devoured or blown up) banks that wave's share the moment its last body
 * drops, and a run that dies on wave 25 keeps what waves 1 to 24 paid. A
 * win is every objective met and pays the whole pot, however the last
 * wave ended. Kills pay nothing: they drop scrap (SCRAP_BY_TIER) and that
 * is the whole of what a body is worth.
 *
 * WHY. Under the kill rule the pot was ~246,000 XP on the reference
 * script and it sat where the health sat: waves 1-20 paid 23,000 of it
 * (under a tenth), waves 36-50 paid 161,000 (two thirds). A save that
 * could hold twenty waves and not thirty was earning at a twentieth of
 * the rate of one that cleared, which made the early ladder a grind and
 * the tier-5 wall the only thing worth killing. On this rule the same
 * twenty waves pay 27,755 of 100,000 — more XP than before in absolute
 * terms, and three times the share.
 */
export const MISSION_XP = 100_000;

/**
 * HOW THE POT RAMPS ACROSS THE WAVES: the last wave's share is this many
 * times the first wave's, and the shares between climb linearly. At 3 on
 * a fifty-wave script wave 1 pays 1% of the pot and wave 50 pays 3% —
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
 * THE LEVEL CURVE, in two pieces.
 *
 *   THE CLIMB, levels 1 to XP_LEVEL_PLATEAU (100). Going from level n to
 *   n+1 costs XP_LEVEL_BASE x n to the power XP_LEVEL_POWER — a little
 *   more than the last one every time, never a wall. The power is set so
 *   the hundredth step is just under a million: 5,000 at level 1,
 *   ~61,000 at 10, ~422,000 at 50, ~942,000 at 99.
 *
 *   THE PLATEAU, levels 100 to LEVEL_CAP (1000). Every level costs the
 *   same XP_LEVEL_FLAT (1,000,000): the long tail a save keeps earning
 *   after it owns everything, with the tick of a level at a fixed, known
 *   price — ten base clears, or two at the top rung.
 *
 *   level    2      3      5      10     24     50     100     1000
 *   to next  5k     11k    24k    61k    178k   422k   1m      1m
 *   total    5k     16k    58k    288k   2.0m   9.9m   44m     944m
 *
 * WHAT THAT MEANS AGAINST A MAP. A full clear at the base rung pays
 * MISSION_XP (100,000), so the first run lands level 6; a wipe after
 * twenty waves banks ~27,800 and lands level 3. The rung bonus
 * (tierXpBonus, up to x5.5) is the multiplier on all of it, and that is
 * how the track is climbed: the end of the ROSTER phase (ROSTER_TOP in
 * track.ts, where the last wall opens) stands at about 714,000 XP —
 * seven base clears, or one or two at the top rung — and the MUTATOR
 * phase behind it runs to about 2,000,000 at MAX_LEVEL (24). Everything
 * above that is the long tail: level 100 is 44 million, and the cap is
 * 944 million. Nothing on the track is handed out up there (track.ts);
 * the number is the number.
 */
export const XP_LEVEL_BASE = 5000;
export const XP_LEVEL_POWER = 1.14;
/** the level the climb stops at and the plateau begins */
export const XP_LEVEL_PLATEAU = 100;
/** what every level on the plateau costs */
export const XP_LEVEL_FLAT = 1_000_000;
/** the highest level a save can stand at; XP past it banks and does nothing */
export const LEVEL_CAP = 1000;

/** XP needed to climb from `level` to `level + 1` */
export const xpToNext = (level: number): number =>
  level >= XP_LEVEL_PLATEAU
    ? XP_LEVEL_FLAT
    : Math.round(XP_LEVEL_BASE * Math.max(1, level) ** XP_LEVEL_POWER);

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
 * (grantRunReward), so it stacks: the top difficulty on a random map is x5.5 x1.25.
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
