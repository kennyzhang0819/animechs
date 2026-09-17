import { TOWERS } from "./constants";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * THE ECONOMY — two currencies that never touch. docs/economy.md is the
 * system: what a kill pays and why the rate bends, what a run spends on
 * and why each price is what it is, and the XP ladder.
 *
 * SCRAP is the run's money and EVERY BIT COMES OFF THE SWARM — no core
 * income, no mining, no wave bonus, no refund on a sale. Drops are fixed
 * per KIND and read AUTHORED health, so a full clear pays the same on
 * every tier and the prices can be authored against the script.
 *
 * XP is the save's progress, paid for objectives and never for kills.
 */

/** what one kill leaves on the ground */
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
 *  health at a fifteenth is the ten scrap it has always paid. It reads the
 *  AUTHORED pool, never the level-scaled one (docs/economy.md) */
export const SCRAP_PER_HP = 1 / 15;

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
export const BOSS_SCRAP = 5000;

/** the drop for one unit: scrap off its health pool, a boss its lump on top */
export function dropForUnit(hp: number, boss = false): Drop {
  return {
    scrap: Math.max(1, Math.round(payableHp(hp) * SCRAP_PER_HP)) + (boss ? BOSS_SCRAP : 0),
  };
}

/** every run opens with this much in the bank */
export const SCRAP_START = 10000;

/** the admin view's bottomless purse — past any price or bulk-buy check
 *  and still a number the HUD can render. The spending is a no-op */
export const RICH_SCRAP = 99_999_999;

/**
 * WHAT ONE TURRET CARD COSTS — the fee the player actually pays. A turret
 * is not bought at its own price: the fee rolls a rarity and a formation
 * and the card is placed for nothing, so TOWER_PRICE below is what a draw
 * is WORTH and nothing a player ever pays.
 */
export const TURRET_ROLL_PRICE = 1000;

/** what one mod costs — dearer than a turret card because a card is SPENT
 *  and a module is OWNED, and cheaper than a relic because a mod is a
 *  CHANCE and a relic is in force the moment it is paid for
 *  (docs/economy.md) */
export const MOD_ROLL_PRICE = 5000;

/** how many mods a press of M puts on the table, of which the player
 *  takes ONE. It is NOT a discount: the press pays for one, and what the
 *  three buy is the right to take the best of three rolls */
export const MOD_CHOICES = 3;

/** what one relic costs — a whole act of a run saved for, and not a typo.
 *  Every relic changes the game rather than nudging it, and at anything
 *  cheaper the G button stopped being a decision by the mid-game. The
 *  amount ladder still multiplies it: sixteen relics is sixteen relics */
export const RELIC_ROLL_PRICE = 150000;

/**
 * THE AMOUNT LADDER — the corner's fourth button, multiplying whichever
 * of the other three is pressed next. THEY ARE SQUARES because on the
 * turret button the amount TILES the shape (formation.ts). A FLAT
 * multiplier with no bulk discount: the button saves keystrokes and
 * nothing else. On the turret button it is ONE card carrying the shape
 * tiled N times; on the module buttons it is N INDEPENDENT DRAWS.
 */
export const BUY_AMOUNTS = [1, 4, 9, 16] as const;
export type BuyAmount = (typeof BUY_AMOUNTS)[number];

/** the amount after this one, wrapping — what the fourth button does */
export const nextAmount = (n: BuyAmount): BuyAmount =>
  BUY_AMOUNTS[(BUY_AMOUNTS.indexOf(n) + 1) % BUY_AMOUNTS.length];

/** EVERY AMOUNT IS A SQUARE, so every fleet tiles into a square — see
 *  BUY_AMOUNTS for why, and formation.ts fleetLayout for what reads it */
(() => {
  for (const n of BUY_AMOUNTS)
    if (!Number.isInteger(Math.sqrt(n)))
      throw new Error(`the buy amount ${n} is not a square; a fleet of it cannot tile square`);
})();

/** a placement is spent: selling returns this fraction of the price */
export const SELL_REFUND = 0;

/** the scrap a sale returns for a turret of this kind */
export const sellValue = (kind: TowerKind): number =>
  Math.floor(scrapPriceOf(kind) * SELL_REFUND);

export type TowerTier = 1 | 2 | 3;

/** three price bands along Mindustry's build-cost order, priced so the
 *  stage that meets a band is roughly what buys it. A pricing table and
 *  nothing else — no band is held shut inside a run */
export const TOWER_TIER: Record<TowerKind, TowerTier> = {
  tacker: 1,
  torch: 1,
  lobber: 1,
  coil: 1,
  airburst: 1,
  douser: 1,
  // the support pair sits a band below what it keeps alive: a fixer is
  // an opening purchase, and the projector goes down beside the first
  // tier-2 gun it is there to nurse
  fixer: 1,
  restorer: 2,
  hive: 2,
  piercer: 2,
  autocannon: 2,
  barrage: 2,
  tether: 2,
  whirl: 2,
  cleaver: 3,
  deluge: 3,
  repeater: 3,
  furnace: 3,
  railhead: 3,
};

/** every turret of one tier, in roster order */
export const towersOfTier = (tier: TowerTier): TowerKind[] =>
  TOWER_KINDS.filter((k) => TOWER_TIER[k] === tier);

/** the run cut into three stages, one a price band (see ladder.ts stageAudit) */
export const STAGES: readonly { tier: TowerTier; from: number; to: number }[] = [
  { tier: 1, from: 1, to: 20 },
  { tier: 2, from: 21, to: 35 },
  { tier: 3, from: 36, to: 50 },
];

export const TOWER_PRICE: Record<TowerKind, number> = {
  tacker: 60,
  torch: 110,
  lobber: 120,
  coil: 150,
  airburst: 180,
  douser: 300,
  fixer: 250,
  restorer: 1200,
  hive: 1000,
  piercer: 900,
  autocannon: 900,
  barrage: 1400,
  tether: 1500,
  whirl: 1800,
  cleaver: 4000,
  deluge: 5000,
  repeater: 7500,
  furnace: 9000,
  railhead: 12000,
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
 * THE CLIMB IS STARCRAFT II'S MASTERY LADDER, CUT BY A THIRD. The table
 * below is Blizzard's own, transcribed; SC2_SCALE is the only thing done
 * to it and THE ONE KNOB — moving it moves the whole grind and nothing
 * else. What the two phases are, why their commander levels are not here
 * and what the factor is worth in clears: docs/economy.md.
 */

/** what our clear is worth against a Brutal one — every SC2 number below is
 *  multiplied by this, and nothing else is done to any of them */
export const SC2_SCALE = 1.5;

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

/** how many mastery levels there are; each is a point, unspendable for now */
export const MASTERY_LEVELS = SC2_MASTERY.length;
/** the first level of the wall, where the last mastery point has been paid */
export const ASCENSION_FROM = MASTERY_LEVELS + 1;
/** what every level from the wall up costs (SC2's ascension level, scaled) */
export const XP_LEVEL_FLAT = 200_000 * SC2_SCALE;
/** the highest level a save can stand at; XP past it banks and does nothing */
export const LEVEL_CAP = 1000;

/** every step the curve authors, level 1 -> 2 first; past it, the wall */
const STEPS: readonly number[] = SC2_MASTERY.map((x) => Math.round(x * SC2_SCALE));

/** THE TABLE IS TRANSCRIBED BY HAND, SO THE SHAPE IS CHECKED AT IMPORT */
(() => {
  if (MASTERY_LEVELS !== 90) throw new Error(`the mastery ladder has ${MASTERY_LEVELS} levels, not 90`);
  if (STEPS.length !== ASCENSION_FROM - 1)
    throw new Error(`the curve authors ${STEPS.length} steps, not ${ASCENSION_FROM - 1}`);
})();

/** XP needed to climb from `level` to `level + 1` */
export function xpToNext(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return l <= STEPS.length ? STEPS[l - 1] : XP_LEVEL_FLAT;
}

/** total XP at which `level` is reached — level 1 is zero */
export function xpAtLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, LEVEL_CAP); l++) total += xpToNext(l);
  return total;
}

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
  const into = level >= LEVEL_CAP ? need : Math.max(0, Math.floor(xp)) - xpAtLevel(level);
  return { level, into, need };
}

/** the scrap sprite and colour (Mindustry Items.scrap, 777777, lifted) */
export const SCRAP_ICON = "/mindustry/sprites/items/item-scrap.png";
export const SCRAP_COLOR = "#B8B8C0";
/** XP has no Mindustry item — it draws as a star in this colour */
export const XP_COLOR = "#7BDFF2";
/** the skill-point colour, the tree's own gold */
export const POINT_COLOR = "#FFD37F";
