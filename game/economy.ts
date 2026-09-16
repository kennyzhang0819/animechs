import { TOWERS } from "./constants";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * THE ECONOMY — two currencies that never touch.
 *
 * SCRAP is the run's money, and EVERY BIT OF IT COMES OFF THE SWARM. A
 * kill drops SCRAP OFF ITS OWN HEALTH POOL (SCRAP_PER_HP, a boss its lump
 * on top), and that is the WHOLE income: the core pays nothing, nothing is
 * mined, no wave pays for being survived, and a sale returns nothing
 * (SELL_REFUND). Drops are fixed per KIND — an ironhide1 always pays this, on
 * every rung, on every map — so the roll fee can be authored against the
 * script (the stage table in ladder.ts).
 *
 * XP is the save's progress, paid for objectives (the waves cleared),
 * never for kills — see MISSION_XP and waveXpShare below.
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

/**
 * WHAT A KILL PAYS, PER POINT OF HEALTH. The drop used to be one number a
 * tier — ten for an ironhide1, five hundred for an ironhide5 — and a tier is far too
 * coarse a bucket to price a body by: an ironhide4 carries sixty runts'
 * health and paid twenty runts' scrap, so the late script, where the T4
 * and T5 hulls are, was the part of the run that paid worst for the work it
 * asked. Reading the kind's OWN health pool fixes that at the root, and it
 * fixes it for every kind at once — a stats edit moves the drop with it,
 * and a new kind is priced the moment its health is written.
 *
 * The rate is anchored on the ironhide1, which is the unit every other number
 * in this game is anchored on: 150 health at a fifteenth is the ten scrap
 * it has always paid.
 *
 * It reads the AUTHORED health (UnitStats.hp), never the level-scaled pool
 * (unitHpAtLevel): a full clear has to pay the same scrap on every
 * difficulty tier, or the turret prices would mean a different thing on
 * each of them.
 */
export const SCRAP_PER_HP = 1 / 15;

/**
 * AND THE RATE BENDS AT THE HEAVY END, because a health pool is what a
 * body is worth to KILL and not what it should be worth to BANK.
 *
 * Straight health times the rate was right about the shape and wrong about
 * the late game's scale. The unit trees do not climb smoothly: a T3 hull
 * is nine hundred health and the T4 above it is nine THOUSAND, so the step
 * from the middle of the script to the end of it multiplied the income by
 * ten in one shelf. An ironhide5 paid 1,600 — a card and a half for one body —
 * and a late wave is hundreds of bodies, so by wave 40 the bank stopped
 * being a constraint at all: everything was affordable, every roll was
 * free, and the only decision left was where to put what fell out.
 *
 * So health under the knee pays the full rate and health above it pays a
 * shrinking one: the drop is the ironhide1-anchored rate applied to `hp`
 * raised to DROP_HEAVY_EXP past DROP_KNEE_HP. A heavier kind is still
 * strictly worth more than a lighter one — that is the whole reason the
 * drop reads health, and it is untouched — but the curve is flatter than
 * the health curve, so the T4 and T5 shelves no longer pay ten times the
 * shelf below them for being ten times the pool.
 *
 * The knee sits at 600, the top of the T2 shelf, which is what makes this
 * a LATE-GAME edit and not a balance sweep: every T1 and T2 body pays
 * exactly what it always paid, a T3 gives up roughly a tenth, and the
 * cut lands where the complaint was — about 55% off a T4 and 65% off a T5.
 */
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

/**
 * WHAT THE ADMIN VIEW'S BOTTOMLESS PURSE READS ON THE COUNTER. Large
 * enough that no price or bulk-buy check can ever come up short, small
 * enough to still render as a number on the HUD — the spending itself is
 * a no-op (Sim.spend), so this is a display and a threshold, not a budget.
 */
export const RICH_SCRAP = 99_999_999;

/*
 * THERE IS NO WAVE BONUS. Staging a wave used to pay a lump on top of
 * what its bodies dropped — 250 and 50 more each wave, so 500 by wave 5
 * and 2,750 by wave 50 — and it was passive income: a board that killed
 * nothing banked it anyway, just for surviving the gap. EVERY SCRAP NOW
 * COMES OFF THE SWARM. The bank moves when bodies fall and at no other
 * time, which is the only version of this economy a player can reason
 * about: build more, kill more, buy more.
 */

/**
 * WHAT ONE TURRET CARD COSTS — the run's only outgoing, and the whole
 * shape of the economy now.
 *
 * A turret is not bought at its own price any more. The player pays this
 * one fee, the deal rolls a rarity and a formation and hands over a card
 * (rarity.ts, formation.ts), and the card is placed for nothing. So
 * TOWER_PRICE below stopped being what a board spends and became what a
 * draw is WORTH: the number the odds are composed against, and nothing a
 * player ever pays.
 *
 * A THOUSAND, FLAT, on every pool and at every level. The fee was briefly
 * derived from what the save's pool was worth — which priced a level-2
 * deal fairly and a level-14 one fairly too — and it stopped being worth
 * the cleverness the moment a card started carrying a FORMATION: a draw
 * is four to thirty-six turrets now, so what it is worth swings by more
 * with one roll than the whole pool's depth ever moved it. One number a
 * player can hold in their head, and one number to turn.
 */
export const TURRET_ROLL_PRICE = 1000;

/**
 * WHAT ONE MOD COSTS, AND WHAT ONE RELIC COSTS — the deal's second and
 * third buttons, and the run's only other outgoings.
 *
 * BOTH ARE DEARER THAN A TURRET CARD, because the two things are not the
 * same purchase. A turret card is SPENT: it is placed, it is shot at, and
 * one day it is gone. A module is OWNED for the rest of the run.
 *
 * AND A RELIC IS DEARER THAN A MOD, because they are two categories and
 * not the same purchase either. A MOD (mods.ts) is a CHANCE — it improves
 * nothing standing and adds a roll to every turret placed from here on, so
 * what it is worth depends on how much board the run has left to buy. A
 * RELIC (relics.ts) is IN FORCE THE MOMENT IT IS PAID FOR, over every
 * turret already up and every one still to come, and it never stops. The
 * player pressing the third button is buying certainty and the second one
 * is buying odds, and the prices have to say so.
 *
 * THE TWO PRICES ARE ALSO THE TWO ERAS THEY WERE WRITTEN FOR. A mod at two
 * thousand is what a run spends on in the middle; a relic at a hundred and
 * fifty thousand is what a late game saves for. The track used to say the
 * same thing — mods across the front of a campaign, relics across the back
 * — and it no longer deals a relic at all (track.ts: they are reserved),
 * so for now the relic price is a number waiting for its door rather than
 * one a run can reach.
 *
 * Flat, like the roll fee and for the same reason: numbers a player can
 * hold in their head, and numbers a balance sweep turns.
 */
export const MOD_ROLL_PRICE = 2000;

/**
 * A HUNDRED AND FIFTY THOUSAND FOR A RELIC, AND IT IS NOT A TYPO. It was
 * three and a half thousand, which is where a "+10% damage" belongs, and
 * every relic in the catalog has since been rewritten to change the game
 * rather than nudge it (relics.ts) — the board fires twice as fast, every
 * kill pays triple, every turret revives. A rule that size at four
 * cards' price would be the first thing every run bought and the last
 * decision it ever made.
 *
 * THIRTY THOUSAND WAS STILL TOO CHEAP, and what proved it was how early
 * the button stopped being a decision: thirty turret cards is a bank a
 * run rebuilds inside a couple of waves once a line is holding, so the
 * relics arrived in a block in the mid-game and after that the G button
 * was a formality with nothing left behind it. At a HUNDRED AND FIFTY
 * thousand — a hundred and fifty cards, the opening bank twenty times
 * over — a relic is a whole act of a run saved for, and buying one is
 * giving up the board that money would have been. That is the trade the
 * button is supposed to put in front of the player, and it is the right
 * trade for what a relic ANSWERS: a wall of T5 hulls, which a board of
 * ordinary turrets does not beat by being a little bigger.
 *
 * The amount ladder still multiplies it, so x16 relics is two and a
 * quarter million — sixteen relics is sixteen relics.
 */
export const RELIC_ROLL_PRICE = 150000;

/**
 * THE AMOUNT LADDER — the corner's fourth button, which cycles through
 * these and multiplies whichever of the other three is pressed next.
 *
 * THEY ARE SQUARE NUMBERS, and that is the point of these four and not
 * some other four. On the turret button the amount TILES the shape
 * (formation.ts), so a square amount tiles into a square: 4 is two copies
 * by two, 9 is three by three and 16 is four by four, and a fleet comes
 * out with the proportions of the card that bought it. They were 5 and
 * 10, which are not squares, and an oblong number has to be laid out as
 * something — a plus, a five-by-two slab — that nobody designed and the
 * player has to find ground for anyway.
 *
 * IT IS A FLAT MULTIPLIER ON THE PRICE, with no bulk discount anywhere:
 * x16 turrets costs exactly sixteen roll fees. The button saves KEYSTROKES
 * and nothing else — a discount would make the single press strictly
 * wrong, and the single press is the whole T-click-T-click flow the deal
 * was built around.
 *
 * What the multiplier buys is different on the two sides. On the turret
 * button it is ONE card carrying the shape tiled N times (formation.ts —
 * one turret roll, one shape roll, a fleet on the ground). On the module
 * buttons it is N INDEPENDENT DRAWS, because there is no ground involved
 * and nothing to tile: sixteen relics is sixteen relics.
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

/**
 * THREE PRICE BANDS along Mindustry's build-cost order. A band is priced
 * so its stage (STAGES) is roughly what buys it — a pricing table and
 * nothing else; no band is held shut inside a run.
 */
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
 * whichever mission the map carries (levels.ts Mission, Sim.won). The
 * rungs below pay a share of it and the rungs above a bonus (ladder.ts
 * tierXpBonus).
 *
 * A DEFEAT IS PAID OUT OF THE SAME POT, one wave at a time as the waves
 * are broken (waveXpShare, missionXp). That is the consolation ledger and
 * not the objective: the waves stopped being what a map is finished by
 * (docs/mission-design.md), and a run that met its mission at wave twelve
 * banks the whole pot with thirty-eight waves still on the board.
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
 * below is Blizzard's own, transcribed, and SC2_SCALE is the only thing
 * done to it.
 *
 *   THE MASTERY LADDER, levels 1 to ASCENSION_FROM — MASTERY_LEVELS of
 *   them, their mastery 0 being our level 1. Theirs pays a mastery point a
 *   level; ours pays one too, and THERE IS NOTHING TO SPEND IT ON YET. The
 *   points bank against a system that is not written, and that is fine: the
 *   ladder already pays in the track (track.ts), which deals the whole
 *   toolkit over the first 15 levels and then a rule a level to MAX_LEVEL,
 *   opening the rungs that roll them at MUTATORS_FROM.
 *
 *   THE ASCENSION WALL, ASCENSION_FROM to LEVEL_CAP: XP_LEVEL_FLAT a level,
 *   forever. Nothing is handed over up here in their game or in ours. A
 *   farm has to have a KNOWN rate, and a wall is the only honest shape for
 *   one — a cost that kept climbing past the last reward is a curve quietly
 *   leaving the player behind.
 *
 * THEIR COMMANDER LEVELS ARE DELIBERATELY NOT HERE. SC2 runs 15 commander
 * levels BEFORE mastery opens, and those levels are the reason its mastery
 * table is allowed to start at 5,000 — a player reaching mastery 0 has
 * already paid 1,045,000 for the privilege. Dropping that phase and
 * starting at mastery 0 is what makes this ladder cheap early ON PURPOSE:
 * the toolkit is handed over inside the first FIVE clears, and the long
 * climb is the rules and the points, not the guns.
 *
 * SC2_SCALE MAKES IT EASIER THAN THEIRS, TWICE OVER, and the factor is
 * doing real work rather than decorating. A Brutal clear pays them 44,000;
 * a Nemesis clear pays us MISSION_XP, which is 2.27 times that, so their
 * numbers left alone would already cost us 56% fewer clears than they cost
 * a co-op player. Scaling by 1.5 hands a third of that discount back and
 * keeps the rest: we charge about A THIRD FEWER CLEARS than SC2 for the
 * same rung. Their mastery 90 is 420 Brutal clears and ours is 277; their
 * ascension level is 4.55 and ours is 3.
 *
 * THIS IS THE ONE KNOB. Every number on the ladder is SC2's times this, so
 * moving it moves the whole grind and nothing else — and the table is all
 * multiples of 500, so any sane factor lands on whole XP.
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

/*
 * A RANDOM MAP PAYS NOTHING EXTRA (RANDOM_MAP_XP_BONUS, a quarter, gone).
 * It was a bribe to leave the macro alone, and a bribe is the wrong tool:
 * Random is the DEFAULT and the best way to play the game, and a run that
 * pays a quarter more for it makes every deliberate map choice feel like
 * a tax on knowing what you want. The only thing that moves what a run
 * pays is the difficulty it is played at.
 */

/** the scrap sprite and colour (Mindustry Items.scrap, 777777, lifted) */
export const SCRAP_ICON = "/mindustry/sprites/items/item-scrap.png";
export const SCRAP_COLOR = "#B8B8C0";
/** XP has no Mindustry item — it draws as a star in this colour */
export const XP_COLOR = "#7BDFF2";
/** the skill-point colour, the tree's own gold */
export const POINT_COLOR = "#FFD37F";
