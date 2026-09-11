import { TOWERS } from "./constants";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * THE ECONOMY — two currencies that never touch.
 *
 * SCRAP is the run's money, and EVERY BIT OF IT COMES OFF THE SWARM. A
 * kill drops SCRAP OFF ITS OWN HEALTH POOL (SCRAP_PER_HP, a boss its lump
 * on top), and that is the WHOLE income: the core pays nothing, nothing is
 * mined, no wave pays for being survived, and a sale returns nothing
 * (SELL_REFUND). Drops are fixed per KIND — a dagger always pays this, on
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
 * tier — ten for a dagger, five hundred for a reign — and a tier is far too
 * coarse a bucket to price a body by: a scepter carries sixty daggers'
 * health and paid twenty daggers' scrap, so the late script, where the T4
 * and T5 hulls are, was the part of the run that paid worst for the work it
 * asked. Reading the kind's OWN health pool fixes that at the root, and it
 * fixes it for every kind at once — a stats edit moves the drop with it,
 * and a new kind is priced the moment its health is written.
 *
 * The rate is anchored on the dagger, which is the unit every other number
 * in this game is anchored on: 150 health at a fifteenth is the ten scrap
 * it has always paid. So the opening stages bank what they always banked
 * and the heavy end of the script is what actually moves.
 *
 * It reads the AUTHORED health (UnitStats.hp), never the rung-scaled pool
 * (unitHpAtLevel): a full clear has to pay the same scrap on every rung, or
 * the turret prices would mean a different thing on each of them.
 */
export const SCRAP_PER_HP = 1 / 15;

/** a boss is an event as well as a body: it pays this ON TOP of its health */
export const BOSS_SCRAP = 5000;

/** the drop for one unit: scrap off its health pool, a boss its lump on top */
export function dropForUnit(hp: number, boss = false): Drop {
  const pool = Math.max(0, hp);
  return {
    scrap: Math.max(1, Math.round(pool * SCRAP_PER_HP)) + (boss ? BOSS_SCRAP : 0),
  };
}

/** every run opens with this much in the bank */
export const SCRAP_START = 7500;

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
 * is four to twenty-five turrets now, so what it is worth swings by more
 * with one roll than the whole pool's depth ever moved it. One number a
 * player can hold in their head, and one number to turn.
 */
export const TURRET_ROLL_PRICE = 1000;

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
  duo: 1,
  scorch: 1,
  hail: 1,
  arc: 1,
  scatter: 1,
  wave: 1,
  // the support pair sits a band below what it keeps alive: a mender is
  // an opening purchase, and the projector goes down beside the first
  // tier-2 gun it is there to nurse
  mender: 1,
  mendProjector: 2,
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

/** the run cut into three stages, one a price band (see ladder.ts stageAudit) */
export const STAGES: readonly { tier: TowerTier; from: number; to: number }[] = [
  { tier: 1, from: 1, to: 20 },
  { tier: 2, from: 21, to: 35 },
  { tier: 3, from: 36, to: 50 },
];

export const TOWER_PRICE: Record<TowerKind, number> = {
  duo: 60,
  scorch: 110,
  hail: 120,
  arc: 150,
  scatter: 180,
  wave: 300,
  mender: 250,
  mendProjector: 1200,
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

/**
 * THE MISSION POT: what a full clear at Nemesis is worth, dealt out one
 * wave at a time as the waves are cleared (waveXpShare). The rungs below
 * pay a share of it and the rungs above a bonus (ladder.ts tierXpBonus).
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

/** the XP `cleared` waves of `waves` bank — the whole pot for a full clear */
export function missionXp(cleared: number, waves: number): number {
  const n = Math.max(0, Math.floor(waves));
  const c = Math.min(n, Math.max(0, Math.floor(cleared)));
  if (n === 0) return 0;
  if (c >= n) return MISSION_XP;
  let total = 0;
  for (let w = 1; w <= c; w++) total += waveXp(w, n);
  return total;
}

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

/** a run on a random map pays this much more XP */
export const RANDOM_MAP_XP_BONUS = 0.25;

/** the scrap sprite and colour (Mindustry Items.scrap, 777777, lifted) */
export const SCRAP_ICON = "/mindustry/sprites/items/item-scrap.png";
export const SCRAP_COLOR = "#B8B8C0";
/** XP has no Mindustry item — it draws as a star in this colour */
export const XP_COLOR = "#7BDFF2";
/** the skill-point colour, the tree's own gold */
export const POINT_COLOR = "#FFD37F";
