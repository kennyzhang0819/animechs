import { TOWERS } from "./constants";
import { TOWER_KINDS, type TowerKind, FIELDED_KINDS } from "./types";

/**
 * THE ECONOMY — two currencies that never touch. docs/economy.md is the
 * system: what the core pays and why the rate bends, what a run spends on
 * and why each price is what it is, and the XP ladder.
 *
 * SCRAP is the run's money and ALL OF IT COMES OFF THE CORE, on a clock —
 * no kill drops, no wave bonus, no refund on a sale. The income reads the
 * RUN CLOCK and nothing about the board or the swarm, so a rung is harder
 * without also being poorer and the prices can be authored against the
 * schedule (levels.ts: wave n lands at a fixed second).
 *
 * XP is the save's progress, paid for objectives and never for kills.
 */

/** what one kill leaves on the ground. NOTHING IN A RUN READS THIS any
 *  more — the income is the core's clock (coreIncomeRate) — but the level
 *  editor and the ladder audit still weigh a script by what it would have
 *  paid, so the table stays */
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

/** what a kill pays per point of health, anchored on the ironhide1: 150
 *  health at a hundred-and-fiftieth is one scrap. It reads the AUTHORED
 *  pool, never the level-scaled one (docs/economy.md) */
export const SCRAP_PER_HP = 1 / 150;

/** ...and the rate bends at the heavy end: health under the knee pays
 *  full and health above it pays a shrinking rate, because the unit trees
 *  step by ten between shelves and a T5 paying a card and a half a body
 *  made the bank stop being a constraint by wave 40. Every T1 and T2 body
 *  pays exactly what it always paid */
export const DROP_KNEE_HP = 600;
export const DROP_HEAVY_EXP = 0.7;

/** health as the drop prices it: full under the knee, shrinking above */
export function payableHp(hp: number): number {
  const pool = Math.max(0, hp);
  if (pool <= DROP_KNEE_HP) return pool;
  return DROP_KNEE_HP * Math.pow(pool / DROP_KNEE_HP, DROP_HEAVY_EXP);
}

/** a boss is an event as well as a body: it pays this ON TOP of its health */
export const BOSS_SCRAP = 500;

/** the drop for one unit: scrap off its health pool, a boss its lump on top */
export function dropForUnit(hp: number, boss = false): Drop {
  return {
    scrap: Math.max(1, Math.round(payableHp(hp) * SCRAP_PER_HP)) + (boss ? BOSS_SCRAP : 0),
  };
}

/** every run opens with this much in the bank — six tier-1 presses and
 *  change, which is the opening decision and not a board */
export const SCRAP_START = 1200;

/**
 * THE CORE'S INCOME — the whole of a run's money, and a function of the
 * RUN CLOCK alone (docs/economy.md). Scrap per second at time zero, and
 * the seconds it takes that rate to double; the rate stops climbing at
 * CORE_INCOME_RAMP so the tide cannot be banked out of.
 *
 * The doubling is the one knob that matters: 205s against the 24s wave
 * cadence is about 8.5% a wave, so the rate at the ramp is nearly sixty times
 * the opening one. A much longer doubling was tried and it put 98% of a
 * run's money after wave twenty and starved the opening — a tier-2 press
 * cost one and a half waves of TOTAL income at wave eight, so the only
 * way to reach the band was to stop building for two waves while the
 * swarm grew. A doubling that long is a curve that only pays the player
 * who already survived it.
 */
export const CORE_INCOME_RATE = 52;
export const CORE_INCOME_DOUBLING = 205;
/** the shipped campaign's own length, 3 + 50 x 24 (levels.ts) */
export const CORE_INCOME_RAMP = 1203;

/** scrap a second at `t` seconds of run time */
export function coreIncomeRate(t: number): number {
  const at = Math.min(Math.max(0, t), CORE_INCOME_RAMP);
  return CORE_INCOME_RATE * Math.pow(2, at / CORE_INCOME_DOUBLING);
}

/** everything the core has paid by `t` seconds — the curve integrated,
 *  flat past the ramp */
export function coreIncomeBy(t: number): number {
  const at = Math.max(0, t);
  const ramp = Math.min(at, CORE_INCOME_RAMP);
  const grown =
    ((CORE_INCOME_RATE * CORE_INCOME_DOUBLING) / Math.LN2) *
    (Math.pow(2, ramp / CORE_INCOME_DOUBLING) - 1);
  return grown + Math.max(0, at - CORE_INCOME_RAMP) * coreIncomeRate(CORE_INCOME_RAMP);
}

/** the admin view's bottomless purse — past any price or bulk-buy check
 *  and still a number the HUD can render. The spending is a no-op */
export const RICH_SCRAP = 9_999_999;

/** what one mod costs. THE MODULE BUTTONS ARE OFF THE CORNER (mods.ts,
 *  relics.ts are still here, and the track deals neither) — the prices
 *  stay against the day either category comes back */
export const MOD_ROLL_PRICE = 500;
export const MOD_CHOICES = 3;
export const RELIC_ROLL_PRICE = 15000;

/** a placement is spent: selling returns this fraction of the price */
export const SELL_REFUND = 0;

/** the scrap a sale returns for a turret of this kind */
export const sellValue = (kind: TowerKind): number =>
  Math.floor(scrapPriceOf(kind) * SELL_REFUND);

export type TowerTier = 1 | 2 | 3 | 4;
export const TOWER_TIERS = [1, 2, 3, 4] as const;

/**
 * THE TIER IS THE TURRET'S FOOTPRINT, in tiles — a tier-3 gun is 3x3 and
 * nothing else is filed there. The corner's 1/2/3/4 keys pick the tier
 * and the gun is rolled uniformly inside it, so the number has to mean
 * something before the roll: it means how much ground the card will want.
 * That also makes the price legible, since a card is the tier's price
 * times its cell count and a tier-3 block is a 9x9 patch of map.
 *
 * The two retired kinds (types.ts RETIRED_KINDS) are filed by footprint
 * like everything else so the table stays total.
 */
export const TOWER_TIER: Record<TowerKind, TowerTier> = {
  tacker: 1,
  torch: 1,
  lobber: 1,
  coil: 1,
  duster: 1,
  fixer: 1,
  autocannon: 2,
  airburst: 2,
  piercer: 2,
  douser: 2,
  tether: 2,
  hive: 2,
  blighter: 2,
  restorer: 2,
  cleaver: 3,
  barrage: 3,
  deluge: 3,
  whirl: 3,
  drifter: 3,
  repeater: 4,
  furnace: 4,
  railhead: 4,
  stinger: 4,
};

/**
 * WHAT ONE TURRET OF A TIER IS PRICED AT. A press costs this times
 * CARD_CELLS (cardPrice), so a tier-4 press is 38,400 and no opening
 * bank comes near one.
 *
 * ONE STEP, ABOUT SIX TIMES, ALL THE WAY UP — 200x end to end. It used to
 * steepen into tier 4 on the argument that the 4x4 is the thing worth
 * gating; the gate is the run clock now (TIER_UNLOCK), and a band that is
 * already shut until fifteen minutes does not also need to be the dearest
 * step on the ladder. A steeper tier 4 bought two presses in a whole run,
 * which made the band a thing you bought once rather than built with.
 *
 * A steeper tier 2 walled its band off for the whole opening: a press is
 * sixteen turrets, so a step in the per-turret price is the same step in
 * the smallest purchase that band can make.
 *
 * Per tile that is 12 / 17.5 / 44.4 / 150. docs/economy.md.
 */
export const TIER_PRICE: Record<TowerTier, number> = {
  1: 12,
  2: 70,
  3: 400,
  4: 2400,
};

/** every turret of one tier, in roster order */
export const towersOfTier = (tier: TowerTier): TowerKind[] =>
  TOWER_KINDS.filter((k) => TOWER_TIER[k] === tier);

/**
 * THE SHAPE A PRESS IS PRICED AT, in turrets — and it is a CONSTANT, not
 * the shape that comes up.
 *
 * THE SIZE IS THE LUCK (formation.ts rollFormation). A press buys one
 * tier and one amount, and how big a patch of it lands is the roll: 9,
 * 16, 25 or 36 turrets for exactly the same scrap. So the price cannot
 * be the cell count — it has to be paid before the roll, or the button
 * would be a number that changes after the press.
 *
 * SIXTEEN IS THE MEAN SHAPE under the shipped odds (FORMATION_WEIGHTS:
 * 40/30/20/10 over 9/16/25/36 averages 17), rounded down to a square so
 * "the price of a 4x4" is a thing a player can hold in their head. A run
 * that draws badly pays over the odds and one that draws well pays
 * under, and across a run it comes out where the old per-cell price was.
 */
export const CARD_CELLS = 16;

/** what one press at this tier costs — flat, and the same however the
 *  shape rolls (docs/economy.md) */
export const cardPrice = (tier: TowerTier, amount = 1): number =>
  TIER_PRICE[tier] * CARD_CELLS * Math.max(1, Math.floor(amount));

/**
 * THE AMOUNT LADDER — the corner's X button, multiplying whichever tier
 * is pressed next. It TILES the rolled shape rather than rolling again
 * (formation.ts fleetLayout), so a x4 press is one gun, one shape and
 * four times the ground.
 *
 * EVERY AMOUNT IS A SQUARE so the copies butt with no gap — checked below
 * rather than trusted.
 */
export const BUY_AMOUNTS = [1, 4, 9, 16] as const;
export type BuyAmount = (typeof BUY_AMOUNTS)[number];

/** the amount after this one, wrapping — what one press of X does */
export const nextBuyAmount = (n: BuyAmount): BuyAmount =>
  BUY_AMOUNTS[(BUY_AMOUNTS.indexOf(n) + 1) % BUY_AMOUNTS.length];

(() => {
  for (const n of BUY_AMOUNTS)
    if (!Number.isInteger(Math.sqrt(n)))
      throw new Error(`the buy amount ${n} is not a square; a fleet of it cannot tile square`);
})();

/**
 * WHEN EACH BAND OPENS, in seconds of run time. Tier 1 from the first
 * frame; the rest on the clock, five minutes apart.
 *
 * IT IS THE RUN CLOCK AND NOT THE BANK, which is the point. Income is a
 * function of time alone (coreIncomeRate), so a bank gate would be a
 * clock gate wearing a disguise and a player who saved would meet the
 * same wall a player who spent did — later, and with nothing to show for
 * the wait. A clock says the same thing out loud, and the corner can
 * draw it counting down.
 *
 * THE LAST ONE IS THE ONE THAT MATTERS. Fifteen minutes is wave forty of
 * fifty (levels.ts WAVE_GAP_DEFAULT), which is where STAGES puts tier 4
 * anyway — so the gate is the stage table said in seconds rather than a
 * new rule on top of it.
 */
export const TIER_UNLOCK: Record<TowerTier, number> = {
  1: 0,
  2: 300,
  3: 600,
  4: 900,
};

/** the run cut into four stages, one a tier (see ladder.ts stageAudit) */
export const STAGES: readonly { tier: TowerTier; from: number; to: number }[] = [
  { tier: 1, from: 1, to: 14 },
  { tier: 2, from: 15, to: 28 },
  { tier: 3, from: 29, to: 40 },
  { tier: 4, from: 41, to: 50 },
];

/** the price of one turret, per kind — the tier's, for every kind in it */
export const TOWER_PRICE: Record<TowerKind, number> = Object.fromEntries(
  TOWER_KINDS.map((k) => [k, TIER_PRICE[TOWER_TIER[k]]]),
) as Record<TowerKind, number>;

/**
 * THE TIER IS THE FOOTPRINT, and the corner's four keys promise it.
 *
 * IT IS A PROMISE ABOUT THE BUILD CARD, so it is asked of the kinds the
 * card can offer and no others (types.ts FIELDED_KINDS). The shelved
 * Wardens are never dealt and never bought, and one of them is six tiles
 * — a size the card has no key for, because nothing the player places is
 * ever that big.
 */
(() => {
  for (const k of FIELDED_KINDS)
    if (TOWERS[k].size !== TOWER_TIER[k])
      throw new Error(`${k} is ${TOWERS[k].size}x${TOWERS[k].size} but filed at tier ${TOWER_TIER[k]}`);
})();

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

/**
 * THE MISSION POT: what a CLEAR at Nemesis is worth — the mission met,
 * whichever mission the map carries. Tiers below pay a share and tiers
 * above a bonus (ladder.ts). A DEFEAT IS PAID OUT OF THE SAME POT, one
 * wave at a time: that is the consolation ledger and not the objective,
 * and a run that met its mission at wave twelve banks the whole pot.
 */
export const MISSION_XP = 100_000;

/** the last wave pays this many times the first; the shares ramp linearly */
export const WAVE_XP_RAMP = 3;

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

/** the XP `cleared` waves of `waves` bank — the whole pot once every wave
 *  the run SENT has been broken (a tide run's `waves` is bigger than the
 *  document's, see Sim.totalWaves) */
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
 * THE CLIMB RAMPS, and it ramps to the number at the top of it: a level
 * near the start is a few minutes and the hundredth is five Nemesis
 * clears. See docs/economy.md.
 *
 * IT IS STARCRAFT II'S MASTERY TABLE, resampled and scaled. That curve is
 * the reference this game's progression is cut from, and what it buys is
 * a first hour that moves: the first level costs a fortieth of the
 * hundredth, so a new save is levelling while it is still learning the
 * board, and the grind arrives only once there is something to grind for.
 *
 * A FLAT CLIMB WAS TRIED AND IT WAS WRONG AT BOTH ENDS. Every level at
 * XP_PER_LEVEL meant the first level cost five clears — a save that has
 * seen one map paying the hundredth level's price — and it meant the
 * curve said nothing about where a player was. The flat number is the
 * TOP of the ramp now, not the whole of it, and past SKILL_POINT_LEVELS
 * (where the last point is paid) it is all there is.
 */

/** SC2's mastery levels: 0 -> 1 up to 89 -> 90, verbatim */
const SC2_MASTERY: readonly number[] = [
  5_000, 20_000, 20_500, 21_000, 21_500, 22_000, 22_500, 23_000, 24_000, 25_000, 26_000, 27_000,
  28_000, 30_000, 32_000, 34_000, 36_000, 38_000, 41_000, 44_000, 47_000, 50_000, 54_000, 58_000,
  62_000, 66_000, 71_000, 76_000, 81_000, 86_000, 89_000, 92_000, 95_000, 99_000, 103_000, 107_000,
  111_000, 115_000, 119_000, 123_000, 127_000, 131_000, 135_000, 139_000, 143_000, 147_000, 151_000,
  155_000, 160_000, 165_000, 170_000, 175_000, 180_000, 185_000, 191_000, 197_000, 203_000, 209_000,
  215_000, 222_000, 229_000, 236_000, 243_000, 250_000, 258_000, 266_000, 274_000, 282_000, 290_000,
  299_000, 308_000, 317_000, 326_000, 335_000, 345_000, 355_000, 365_000, 375_000, 385_000, 395_000,
  415_000, 445_000, 485_000, 535_000, 595_000, 665_000, 745_000, 835_000, 935_000, 1_035_000,
];

/** WHAT THE HUNDREDTH LEVEL COSTS, and every level past it — the one knob
 *  the whole climb is scaled against */
export const XP_PER_LEVEL = 500_000;

/**
 * THE LAST LEVEL THAT PAYS AN UPGRADE POINT. HOW MANY it pays is the
 * track's (track.ts POINTS — one a level, two on a level that hands over
 * nothing else), and the budget a save can ever hold is TOTAL_POINTS
 * there. This is also where the ramp ends and the flat climb starts — see
 * docs/skills.md.
 */
export const SKILL_POINT_LEVELS = 100;

/**
 * THE RAMP, one step a level from 1 -> 2 up to SKILL_POINT_LEVELS ->
 * next: SC2's ninety steps stretched over a hundred and multiplied until
 * the last of them IS XP_PER_LEVEL. Rounded to the nearest five hundred,
 * because a level's price is a number a player reads.
 */
const STEPS: readonly number[] = (() => {
  const n = SKILL_POINT_LEVELS;
  const raw: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i * (SC2_MASTERY.length - 1)) / (n - 1);
    const a = Math.floor(p);
    const b = Math.min(SC2_MASTERY.length - 1, a + 1);
    raw.push(SC2_MASTERY[a] + (SC2_MASTERY[b] - SC2_MASTERY[a]) * (p - a));
  }
  const k = XP_PER_LEVEL / raw[n - 1];
  return raw.map((v) => Math.round((v * k) / 500) * 500);
})();

/** the XP standing at the front of each level, so a lookup is not a sum */
const AT: readonly number[] = (() => {
  const out = [0];
  for (const step of STEPS) out.push(out[out.length - 1] + step);
  return out;
})();

/** THE TABLE IS DERIVED, SO THE SHAPE IS CHECKED AT IMPORT */
(() => {
  if (STEPS.length !== SKILL_POINT_LEVELS)
    throw new Error(`the climb authors ${STEPS.length} steps, not ${SKILL_POINT_LEVELS}`);
  if (STEPS[STEPS.length - 1] !== XP_PER_LEVEL)
    throw new Error(`the last step is ${STEPS[STEPS.length - 1]}, not XP_PER_LEVEL`);
  for (let i = 1; i < STEPS.length; i++)
    if (STEPS[i] < STEPS[i - 1]) throw new Error(`the climb falls at level ${i + 1}`);
})();

/** the highest level a save can stand at; XP past it banks and does nothing */
export const LEVEL_CAP = 1000;

/** XP needed to climb from `level` to `level + 1` */
export function xpToNext(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return l <= STEPS.length ? STEPS[l - 1] : XP_PER_LEVEL;
}

/** total XP at which `level` is reached — level 1 is zero */
export function xpAtLevel(level: number): number {
  const l = Math.max(1, Math.min(Math.floor(level), LEVEL_CAP));
  if (l <= AT.length) return AT[l - 1];
  return AT[AT.length - 1] + (l - AT.length) * XP_PER_LEVEL;
}

export function levelForXp(xp: number): number {
  const total = Math.max(0, Math.floor(xp));
  // the ramp first, by walking the prefix; the flat climb past it is
  // arithmetic
  if (total < AT[AT.length - 1]) {
    let lo = 1, hi = AT.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (AT[mid - 1] <= total) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  const over = total - AT[AT.length - 1];
  return Math.min(LEVEL_CAP, AT.length + Math.floor(over / XP_PER_LEVEL));
}

/** how far into the current level a total is: xp earned since it, and the
 *  xp the next one needs */
export function levelProgress(xp: number): { level: number; into: number; need: number } {
  const level = levelForXp(xp);
  const need = xpToNext(level);
  const into = level >= LEVEL_CAP ? need : Math.max(0, Math.floor(xp)) - xpAtLevel(level);
  return { level, into, need };
}

/** the scrap tint — the sprite is drawn in code (components/currencyArt.ts) */
export const SCRAP_COLOR = "#B8B8C0";
/** XP has no Mindustry item — it draws as a star in this colour */
export const XP_COLOR = "#7BDFF2";
/** the upgrade-point colour, the tree's own gold */
export const POINT_COLOR = "#FFD37F";
