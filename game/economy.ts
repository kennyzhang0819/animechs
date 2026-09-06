import { TOWERS } from "./constants";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * THE ECONOMY, in two currencies that never touch.
 *
 *   SCRAP  is IN-RUN money. Every run starts with SCRAP_START, every kill
 *          drops its tier's scrap (DROP_BY_TIER), every wave that lands
 *          pays a small bonus (waveBonusScrap), and every turret placed
 *          costs scrap (TOWER_PRICE). Selling refunds SELL_REFUND of the
 *          price. Nothing carries between runs — a run is solved from
 *          its opening board to its last wave on what it earns.
 *
 *   XP     is META progress. The same kills pay XP (DROP_BY_TIER again),
 *          the rung played multiplies it (tierXpBonus in ladder.ts), and
 *          the first clear of any (world, rung) pays FIRST_CLEAR_XP on top.
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
 * DROPS ARE FIXED. A tier-1 body always pays the same scrap and the same
 * XP, on every rung, on every map. Difficulty scales the XP through the
 * rung's bonus and nothing else — scrap income is a fact about the SCRIPT,
 * which is what lets the turret prices below be authored against it.
 */

// ---------------------------------------------------------------------------
// DROPS
// ---------------------------------------------------------------------------

/** what one kill pays: scrap into the run, XP into the save */
export interface Drop {
  scrap: number;
  xp: number;
}

export const emptyDrop = (): Drop => ({ scrap: 0, xp: 0 });

/** n copies of a drop folded into an accumulator */
export function addDrop(into: Drop, d: Drop, n = 1): void {
  if (n <= 0) return;
  into.scrap += d.scrap * n;
  into.xp += d.xp * n;
}

export const isEmptyDrop = (d: Drop): boolean => d.scrap === 0 && d.xp === 0;

/**
 * WHAT EACH UNIT TIER PAYS, indexed by tier (index 0 is unused). A T1
 * always drops exactly this; a T5 always drops exactly that.
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
export const DROP_BY_TIER: readonly Drop[] = [
  { scrap: 0, xp: 0 },
  { scrap: 10, xp: 2 },
  { scrap: 30, xp: 5 },
  { scrap: 80, xp: 12 },
  { scrap: 200, xp: 30 },
  { scrap: 500, xp: 80 },
];

/**
 * A boss is one body a run and it pays like an event: a lump of scrap for
 * the board that fells it, and a lump of XP for the save. It is on the
 * table rather than off it because there is no once-only trophy currency
 * any more (surge alloy, gone with the bank) — the first-clear bonus
 * (FIRST_CLEAR_XP) is what pays for the run being NEW.
 */
export const BOSS_DROP: Drop = { scrap: 5000, xp: 1000 };

/** the drop for a unit tier; a boss pays BOSS_DROP whatever its tier */
export function dropForTier(tier: number, boss = false): Drop {
  if (boss) return BOSS_DROP;
  const i = Math.max(1, Math.floor(tier));
  return DROP_BY_TIER[Math.min(i, DROP_BY_TIER.length - 1)];
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
 * What a sold turret hands back, as a fraction of its price. THE WHOLE
 * PRICE: a board is never a commitment, and tearing the duo wall down to
 * fund a salvo line costs nothing but the seconds it takes. What a stage
 * asks is WHEN to make that swap, not whether it can be afforded.
 */
export const SELL_REFUND = 1;

/** the scrap a sale returns for a turret of this kind */
export const sellValue = (kind: TowerKind): number =>
  Math.floor(scrapPriceOf(kind) * SELL_REFUND);

/**
 * THE THREE TURRET TIERS, and the stage of a run each one is priced for.
 *
 * The split follows Mindustry's own build-cost ranking (MINDUSTRY_VALUE in
 * tech.ts): the six cheapest are tier 1, the next six tier 2, the five
 * dearest tier 3. A tier's turrets are priced so the STAGE they belong to
 * is roughly what buys them — see TOWER_PRICE — and the stage audit in
 * ladder.ts is where that is checked against the script.
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
};

/** every turret of one tier, in roster order */
export const towersOfTier = (tier: TowerTier): TowerKind[] =>
  TOWER_KINDS.filter((k) => TOWER_TIER[k] === tier);

/**
 * THE STAGES OF A RUN, as 1-based inclusive wave ranges — the three
 * stretches the three turret tiers are priced for, AND THE GATE ON THEM:
 * a tier's turrets cannot be placed before its stage opens (unlockWaveOf,
 * read by Sim.canPlace against the wave the CLOCK says it is —
 * Sim.stageWave — so a map whose waves queue behind its drop zones still
 * opens its tiers on time). Waves 1-20 are solved with tier 1, tier 2 joins
 * at 21, tier 3 at 36 — so every run is an early game, a mid game and a
 * late game, and no run opens on the best turret the save owns. The
 * audit (ladder.ts) sums what each stage pays and holds it against its
 * tier's prices.
 */
export const STAGES: readonly { tier: TowerTier; from: number; to: number }[] = [
  { tier: 1, from: 1, to: 20 },
  { tier: 2, from: 21, to: 35 },
  { tier: 3, from: 36, to: 50 },
];

/** the stage a 1-based wave number falls in; past the last stage it is the last */
export function stageOfWave(wave: number): (typeof STAGES)[number] {
  for (const s of STAGES) if (wave <= s.to) return s;
  return STAGES[STAGES.length - 1];
}

/** the first wave a turret may be placed on — its tier's stage opening */
export function unlockWaveOf(kind: TowerKind): number {
  const tier = TOWER_TIER[kind];
  for (const s of STAGES) if (s.tier === tier) return s.from;
  return 1;
}

/** may this turret be placed while `wave` (1-based) is the current one? */
export const tierOpenAt = (kind: TowerKind, wave: number): boolean =>
  wave >= unlockWaveOf(kind);

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
 *   stage 2. Selling the opening board back in full (SELL_REFUND) is how the
 *   transition is funded, which is exactly the decision the stage asks.
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
 * THE LEVEL CURVE. Going from level n to n+1 costs XP_LEVEL_BASE x n to
 * the power XP_LEVEL_POWER, so the track gets steeper the way a co-op
 * commander's does — never a wall, always a little more than the last one.
 *
 *   level    2      3      4      5      6      7      8      10     30
 *   to next  10k    25k    44k    65k    88k    113k   139k   ~195k  ~1.0m
 *   total    10k    35k    80k    145k   233k   346k   485k   ~843k  ~12.1m
 *
 * WHAT THAT MEANS AGAINST A MAP. A full rung-1 clear of Confluence pays
 * about 245,000 XP in kills plus the first-clear bonus, so the first run
 * lands around level 6 — the second pace and the second map fall out of
 * the opening night; a wipe at the end of stage 1 pays about 40,000 and
 * lands level 3. Ten rungs on one world, with the rung bonus, are about
 * 7,000,000 XP — level 25 or so; the top of the track (MAX_LEVEL in
 * track.ts) takes a second map's ladder or a lot of Brutal.
 */
export const XP_LEVEL_BASE = 10000;
export const XP_LEVEL_POWER = 1.35;

/** XP needed to climb from `level` to `level + 1` */
export const xpToNext = (level: number): number =>
  Math.round(XP_LEVEL_BASE * Math.max(1, level) ** XP_LEVEL_POWER);

/** total XP at which `level` is reached — level 1 is zero */
export function xpAtLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

/**
 * The level a lifetime XP total stands at. A loop rather than a closed
 * form: the sum of a power law has none, and a save's level is a two-digit
 * number, so the walk is a few dozen additions.
 */
export function levelForXp(xp: number): number {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  for (;;) {
    const need = xpToNext(level);
    if (left < need) return level;
    left -= need;
    level++;
  }
}

/** how far into the current level a total is: xp earned since it, and the
 *  xp the next one needs */
export function levelProgress(xp: number): { level: number; into: number; need: number } {
  const level = levelForXp(xp);
  return { level, into: Math.max(0, Math.floor(xp)) - xpAtLevel(level), need: xpToNext(level) };
}


/**
 * THE FIRST-CLEAR BONUS: paid once for beating any (world, rung) the save
 * has not beaten before, and multiplied by that rung's XP bonus like every
 * other XP the run pays. About a quarter of what a full clear's kills pay,
 * so a new clear is always visibly better than a replay without the replay
 * being pointless.
 */
export const FIRST_CLEAR_XP = 60000;

// ---------------------------------------------------------------------------
// LIVES
// ---------------------------------------------------------------------------

/**
 * THE BASE'S HEALTH. A hundred, flat, on every save and every rung —
 * plating is not sold any more (the Extra Lives node is gone). A run is
 * won for as long as any is left.
 */
export const LIVES_START = 100;

/**
 * WHAT A LEAK COSTS, by the tier of the body that walked off the board.
 * Indexed by tier like DROP_BY_TIER (index 0 unused). A dagger is a
 * scratch, a scepter is a wound, and a hundred lives is twelve tier-4
 * leaks or a hundred daggers — which is what makes the number a resource
 * to spend rather than a countdown of bodies.
 */
export const LEAK_LIVES_BY_TIER: readonly number[] = [0, 1, 2, 4, 8, 16];

/** lives one leaked body of this tier takes; a boss takes them all */
export function leakCost(tier: number, boss = false): number {
  if (boss) return LIVES_START;
  const i = Math.max(1, Math.floor(tier));
  return LEAK_LIVES_BY_TIER[Math.min(i, LEAK_LIVES_BY_TIER.length - 1)];
}

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
