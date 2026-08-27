import {
  UNIT_KINDS,
  UNIT_STATS,
  waveGroups,
  WORLD,
  type LevelSpec,
  type LevelStep,
  type UnitKind,
} from "./levels";
import { TOWERS } from "./constants";
import { TECH_TREE } from "./tech";
import {
  BASE_ITEM,
  costEntries,
  ITEM_INFO,
  ITEM_KINDS,
  itemForTier,
  type Cost,
} from "./items";

/**
 * THE LADDER — four difficulties, and then the campaign is over.
 *
 * A world ships ONE authored script. A difficulty is a CUT of that script
 * plus an enemy level, and nothing else:
 *
 *   difficulty 1   waves 1-20   enemy level  0
 *   difficulty 2   waves 1-30   enemy level 10
 *   difficulty 3   waves 1-40   enemy level 20
 *   difficulty 4   waves 1-50   enemy level 30
 *
 * Nothing is generated. Wave 1 of difficulty 4 is wave 1 of the same
 * authored list difficulty 1 plays, with 30 levels on it — which is what
 * lets the level editor be the whole authoring surface.
 *
 * THE LADDER IS FINITE AND THAT IS THE POINT. There is no fifth difficulty
 * and no endless level counter above the fourth: clearing difficulty 4
 * finishes the campaign. A player who stalls farms a lower difficulty until
 * the bank covers the next one, and there are only ever three of those
 * gaps to cross, so each one has to be worth crossing — see the step
 * numbers in audit().
 */

/**
 * Mindustry's own per-level health curve. 1.06^12 = 2.01, so twelve levels
 * is exactly double health, and NOTHING else scales: armour, speed, hitbox
 * and drop all stay at their base values forever.
 *
 * Flat armour against level-scaled health is what keeps the four
 * difficulties distinct rather than merely long. A difficulty is a level
 * offset on this same curve, so a level-30 dagger has more health than a
 * fortress and still a dagger's armour, while the level-30 fortress is
 * still the thing chip damage cannot scratch.
 */
export const HP_PER_LEVEL = 1.06;

/**
 * Enemy levels added per difficulty — 10 levels is x1.79 health per body.
 *
 * This is the half of a difficulty that makes the SAME waves harder. The
 * other half is the wave cut below, which makes the run longer. Both move
 * together on purpose: without the levels, difficulty 4 would be a longer
 * difficulty 1 against identical enemies, because the authored script has
 * already fielded every unit kind by wave 20.
 */
export const LEVELS_PER_TIER = 10;

/**
 * THE FOUR DIFFICULTIES, and the only place their shape is written down.
 *
 * `waves` is how much of the authored script the difficulty plays; `level`
 * is the enemy level it plays it at. Everything else on this page is
 * arithmetic over this table.
 *
 * The wave counts are 20/30/40/50 rather than something evener because
 * difficulty 1 has to be a whole arc on its own — a fresh save's entire
 * experience of the game until it clears — while 2 through 4 are each one
 * more block of ten on top of a run the player already knows.
 */
export const DIFFICULTIES: readonly { waves: number; level: number }[] = [
  { waves: 20, level: 0 },
  { waves: 30, level: 10 },
  { waves: 40, level: 20 },
  { waves: 50, level: 30 },
];

/** the last difficulty there is — clearing it finishes the campaign */
export const TOP_TIER = DIFFICULTIES.length - 1;

/** every tier index is clamped into the table; there is nothing above it */
const clampTier = (tier: number): number =>
  Math.min(TOP_TIER, Math.max(0, Math.floor(tier)));

/**
 * Drop bonus per difficulty, applied LINEARLY: difficulty n pays x(1 + 0.3n).
 *
 * Steeper than it was under the old endless ladder, because there are only
 * three steps left to sell. Turret prices are flat (see tech.ts), so the
 * units you kill already pay for the damage needed to kill them and the
 * ladder walks with no bonus at all; the bonus exists only so a HIGHER
 * difficulty is the better farm. Without it every difficulty pays the same
 * per minute and the correct play is to grind difficulty 1 forever.
 */
export const DROP_BONUS_PER_TIER = 0.3;

/**
 * The tier as the PLAYER sees it: "Difficulty 1" is tier 0.
 *
 * `tier` is 0-based everywhere in the code and in window.__ladder, because
 * tier 0 indexes DIFFICULTIES and an offset there would put a +1 in the
 * middle of the arithmetic. But "Difficulty 0" reads as NO difficulty, so
 * the screen is 1-based. Every player-facing tier number goes through here,
 * so the two numbering schemes meet in exactly one place instead of a
 * `+ 1` per label.
 */
export const difficultyOf = (tier: number): number => clampTier(tier) + 1;

/** enemy level of a difficulty */
export const tierLevel = (tier: number): number => DIFFICULTIES[clampTier(tier)].level;

/** health multiplier of a difficulty */
export const tierHpScale = (tier: number): number => HP_PER_LEVEL ** tierLevel(tier);

/** drop multiplier of a difficulty */
export const tierDropBonus = (tier: number): number =>
  1 + DROP_BONUS_PER_TIER * clampTier(tier);

/**
 * How many of the authored waves a difficulty sends, clamped to what has
 * actually been written. A script shorter than 50 waves simply ends early
 * at the top difficulties; a script LONGER than 50 has waves nothing ever
 * plays, which check() reports.
 */
export const tierWaveCount = (spec: LevelSpec, tier: number): number =>
  Math.min(spec.script.length, DIFFICULTIES[clampTier(tier)].waves);

/**
 * The difficulty a wave first appears at — the inverse of tierWaveCount,
 * and the number an author needs when deciding where in the script to put
 * a new wave.
 *
 * Returns -1 for a wave past the top difficulty's cut: it is written but
 * unreachable, which is a bug in the script rather than a difficulty.
 */
export const tierOfWave = (index: number): number => {
  const n = Math.max(0, Math.floor(index)) + 1;
  for (let d = 0; d < DIFFICULTIES.length; d++) if (DIFFICULTIES[d].waves >= n) return d;
  return -1;
};

/** the last difficulty that still unlocks a wave — always the top one */
export const topContentTier = (spec: LevelSpec): number => {
  for (let d = TOP_TIER; d > 0; d--)
    if (tierWaveCount(spec, d) > tierWaveCount(spec, d - 1)) return d;
  return 0;
};

/** one unit's health at an enemy level (armour, speed and drop never move) */
export const unitHpAtLevel = (kind: UnitKind, level: number): number =>
  UNIT_STATS[kind].hp * HP_PER_LEVEL ** Math.max(0, level);

// ---------- expansion ----------

/** the playable spec for one difficulty: the script cut to its wave count,
 * carrying the enemy level the sim scales health by */
export function specForTier(spec: LevelSpec, tier: number): LevelSpec {
  const n = clampTier(tier);
  return {
    ...spec,
    script: spec.script.slice(0, tierWaveCount(spec, n)),
    tier: n,
    enemyLevel: tierLevel(n),
  };
}

// ---------- strength ----------

/**
 * STRENGTH IS PRINTED HEALTH. That is the whole measure, and it is
 * weapon-agnostic on purpose.
 *
 * The tempting alternative is to price a unit against one turret — armour
 * is flat, so a fortress (armour 9) soaks 9 / max(9 - 9, 0.9) = ten times
 * its printed health from a duo line. But the player never fields one
 * turret. Splash, pierce and burning all route around armour, a duo line
 * with enough waves of runway stalls anything, and the mix changes at every
 * difficulty — so any single-turret denominator says more about the
 * denominator than about the wave.
 *
 * Mindustry settles this the same way. `RtsAI` sums raw `unit.health` to
 * weigh a squad, `WaveGraph` plots counts/totals/health, and `Waves.generate`
 * controls heavy units by COUNT (`unitAmount = 6 / tier`, `max = 13`) rather
 * than by pricing their armour. Armour never enters a strength number
 * anywhere in that codebase; it lives only in the damage path.
 *
 * So armour rides along here as COMPOSITION — a share, reported next to the
 * health, never multiplied into it. An armour-heavy wave is a different
 * fight at the same strength, and that is a thing an author wants to see
 * rather than have folded into one number.
 */
export const waveHp = (step: LevelStep, level = 0): number => {
  let hp = 0;
  for (const g of waveGroups(step.wave))
    g.counts.forEach((count, i) => {
      if (count > 0) hp += unitHpAtLevel(UNIT_KINDS[i], level) * count;
    });
  return hp;
};

export interface Budget {
  waves: number;
  units: number;
  /** printed health of everything the run sends — the strength measure */
  hp: number;
  /** share of health carried by units with armour 3 or more */
  armourShare: number;
  /** share of health that flies — hail and scorch cannot touch it at all */
  airShare: number;
  /** share of health carried by unit tier 3 and up */
  t3Share: number;
  /** seconds the run lasts if it is killed as fast as it arrives */
  duration: number;
  /** health per second the fleet has to keep up with */
  hpPerSecond: number;
}

/** weigh one difficulty */
export function budget(spec: LevelSpec, tier = 0): Budget {
  const run = specForTier(spec, tier);
  const level = run.enemyLevel ?? 0;
  let units = 0;
  let hp = 0;
  let armour = 0;
  let air = 0;
  let t3 = 0;
  for (const step of run.script) {
    for (const g of waveGroups(step.wave)) {
      g.counts.forEach((count, i) => {
        if (count <= 0) return;
        const kind = UNIT_KINDS[i];
        const stats = UNIT_STATS[kind];
        const h = unitHpAtLevel(kind, level) * count;
        units += count;
        hp += h;
        if (stats.armor >= 3) armour += h;
        if (stats.flying) air += h;
        if (stats.tier >= 3) t3 += h;
      });
    }
  }
  const duration = run.script.length * run.waveGap + units / run.spawnRate;
  const share = (x: number): number => (hp > 0 ? x / hp : 0);
  return {
    waves: run.script.length,
    units,
    hp,
    armourShare: share(armour),
    airShare: share(air),
    t3Share: share(t3),
    duration,
    hpPerSecond: hp / Math.max(1e-6, duration),
  };
}

/**
 * THE FREE OPENING LOADOUT — a hand-tuned constant, and deliberately not a
 * number derived from the opening waves.
 *
 * It exists to solve a bootstrap, not to clear a run. Kills are the only
 * income and zero turrets kill nothing, so a fresh save needs enough to
 * hold WAVE ONE; from there difficulty 1 pays for itself several times over
 * while it is still being played. Duo is flat at 8 copper forever, so the
 * fleet grows with the bank in a straight line — difficulty 1's own kills
 * bank roughly 2,100 copper, some 260 more duos, and cross the granted fleet
 * about a third of the way in.
 *
 * That is why there is no arithmetic here and no check on this number. A
 * static-fleet model would be measuring a fleet that stops existing thirty
 * seconds into the run. Tune it by feel: too low and wave 1 wipes a fresh
 * save with no way to earn out, too high and the opening asks nothing.
 */
export const OPENING_DUOS = 50;

// ---------- the debut rule ----------

/**
 * The best per-shot damage the player can own by the time a difficulty
 * starts: the strongest bullet among every turret whose gate has opened.
 */
function bestShotByTier(tier: number): number {
  // DIFFICULTY 1 IS A SPECIAL CASE AND IT IS THE ONE THAT MATTERS. A fresh
  // save has banked nothing — kills are the only income — so it owns the
  // free duos and literally nothing else, however many turrets are
  // technically ungated.
  if (clampTier(tier) <= 0) return TOWERS.duo.bullet.damage;
  let best = 0;
  for (const node of TECH_TREE) {
    if (node.requiresTier != null && node.requiresTier >= tier) continue;
    best = Math.max(best, TOWERS[node.tower].bullet.damage);
  }
  return best;
}

/**
 * Units whose armour meets nothing that can efficiently hurt it at the
 * difficulty they debut on.
 *
 * This is a NOTE, not a gate. Nothing is ever unkillable — the 10% floor
 * means a duo always lands 0.9 — so a heavily armoured debut costs more
 * farming, which is a legitimate thing for a script to ask for. What it
 * reports is the size of that ask, so an author choosing it is choosing it.
 */
export function debutViolations(spec: LevelSpec = WORLD): LadderIssue[] {
  const debut = new Map<UnitKind, number>();
  spec.script.forEach((step, i) => {
    const at = tierOfWave(i);
    if (at < 0) return; // unreachable wave; check() reports it separately
    for (const g of waveGroups(step.wave))
      g.counts.forEach((count, k) => {
        if (count <= 0) return;
        const kind = UNIT_KINDS[k];
        debut.set(kind, Math.min(debut.get(kind) ?? Infinity, at));
      });
  });

  const bad: LadderIssue[] = [];
  for (const [kind, tier] of debut) {
    const { armor } = UNIT_STATS[kind];
    const shot = bestShotByTier(tier);
    const tax = shot / Math.max(shot - armor, 0.1 * shot);
    if (tax >= 2)
      bad.push({
        tier,
        kind: "debut",
        message: `${kind} (armour ${armor}) debuts here against a best shot of ${shot} — it costs a fleet ${tax.toFixed(1)}x its printed health, so budget the farming for it`,
      });
  }
  return bad;
}

/**
 * One complaint about a script. `tier` is the difficulty it belongs to, so
 * the level editor can label the wave rows that difficulty owns; null means
 * the finding is about the script as a whole.
 */
export interface LadderIssue {
  tier: number | null;
  kind: "debut" | "wall" | "filler" | "economy" | "unreachable";
  message: string;
}

// ---------- authoring aid ----------

/** what one authored wave weighs and pays, at a given enemy level */
export interface WaveCost {
  units: number;
  /** printed health — the strength measure */
  hp: number;
  /** share of that health carried by unit tier 3 and up */
  t3Share: number;
  /** share carried by units with armour 3 or more */
  armourShare: number;
  /** how much of it flies — hail and scorch cannot touch these at all */
  airShare: number;
  /** one item per kill, by unit tier: what the wave pays */
  drops: Cost;
}

export function waveCost(step: LevelStep, level = 0): WaveCost {
  const out: WaveCost = {
    units: 0,
    hp: 0,
    t3Share: 0,
    armourShare: 0,
    airShare: 0,
    drops: {},
  };
  let t3 = 0;
  let armour = 0;
  let air = 0;
  for (const g of waveGroups(step.wave)) {
    g.counts.forEach((count, i) => {
      if (count <= 0) return;
      const kind = UNIT_KINDS[i];
      const stats = UNIT_STATS[kind];
      const h = unitHpAtLevel(kind, level) * count;
      out.units += count;
      out.hp += h;
      if (stats.tier >= 3) t3 += h;
      if (stats.armor >= 3) armour += h;
      if (stats.flying) air += h;
      // the drop table lives in items.ts and covers every tier there is —
      // reading it rather than a local triple is what lets a tier-4 unit be
      // a stats edit instead of an economy edit
      const drop = itemForTier(stats.tier);
      out.drops[drop] = (out.drops[drop] ?? 0) + count;
    });
  }
  const share = (x: number): number => (out.hp > 0 ? x / out.hp : 0);
  out.t3Share = share(t3);
  out.armourShare = share(armour);
  out.airShare = share(air);
  return out;
}

/**
 * ONE WAVE, WEIGHED — the per-wave half of the number guide.
 *
 * `share` is the wave's slice of the difficulty it belongs to, which is the
 * number to author against: a wave carrying 5% of its difficulty is filler,
 * one carrying 25% is a spike, and a difficulty's LAST wave should be its
 * heaviest or the run tails off into its finale.
 */
export interface WaveRow {
  /** 1-based wave number, as the editor shows it */
  wave: number;
  /** the difficulty it first appears at; -1 if past the top cut */
  tier: number;
  units: number;
  /** printed health at enemy level 0 — the authored weight */
  hp: number;
  /** this wave's share of its own difficulty's total health */
  share: number;
  /** health relative to the wave before it */
  step: number;
  armourShare: number;
  airShare: number;
  t3Share: number;
}

/** the per-wave guide, at the authored baseline level */
export function waveGuide(spec: LevelSpec = WORLD): WaveRow[] {
  const totals = DIFFICULTIES.map(
    (_, d) => budget(spec, d).hp / Math.max(1e-6, tierHpScale(d)),
  );
  let prev = 0;
  return spec.script.map((step, i) => {
    const c = waveCost(step, 0);
    const tier = tierOfWave(i);
    const row: WaveRow = {
      wave: i + 1,
      tier,
      units: c.units,
      hp: c.hp,
      share: tier < 0 ? 0 : c.hp / Math.max(1, totals[tier]),
      step: prev ? c.hp / prev : 1,
      armourShare: c.armourShare,
      airShare: c.airShare,
      t3Share: c.t3Share,
    };
    prev = c.hp;
    return row;
  });
}

/** one difficulty, weighed — the row the editor's ladder check renders */
export interface AuditRow {
  tier: number;
  /** the 1-based number the player sees */
  difficulty: number;
  waves: number;
  units: number;
  /** enemy level the difficulty plays at */
  level: number;
  /** printed health of the whole run — THE strength number */
  hp: number;
  /** how much harder than the difficulty below */
  step: number;
  /** health per second the fleet has to keep up with */
  hpPerSecond: number;
  /** seconds the run lasts */
  duration: number;
  t3Share: number;
  armourShare: number;
  /**
   * What the difficulty pays, per currency, normalised to the base item
   * (copper) = 100. Indexed like ITEM_KINDS, so [100, titanium, thorium, ...]
   * — the shape the tech tree's cost bundles have to match.
   */
  dropRatio: number[];
}

/**
 * WALK THE LADDER AND REPORT WHAT EACH DIFFICULTY ASKS FOR.
 *
 * `step` is the number to author against. It has two sources multiplied
 * together:
 *
 *   step = 1.79 (the +10 enemy levels) x (health of the new waves ratio)
 *
 * so 1.79x is the FLOOR — what a difficulty costs if it adds no waves at
 * all — and everything above it is bought by the ten waves it unlocks. To
 * hit a target step M, the new block of ten must weigh (M / 1.79 - 1) times
 * everything below it.
 *
 * Two things that do NOT come out in the wash:
 *
 * HEALTH PER BODY is difficulty that pays nothing back. A kill drops one
 * item whatever it killed, so 100 spirocts cost fifteen times what 100
 * daggers cost and pay the same hundred items in a different currency.
 * Padding a wave with tier-1 bodies is close to free.
 *
 * THE CURRENCY MIX has to stay near what the tree charges, or one currency
 * becomes the only real constraint while the others pile up unspent.
 */
export function audit(spec: LevelSpec = WORLD): AuditRow[] {
  const rows: AuditRow[] = [];
  let prev = 0;
  for (let tier = 0; tier <= TOP_TIER; tier++) {
    const run = specForTier(spec, tier);
    const level = run.enemyLevel ?? 0;
    const b = budget(spec, tier);
    const drops: Cost = {};
    for (const step of run.script)
      for (const { item, amount } of costEntries(waveCost(step, level).drops))
        drops[item] = (drops[item] ?? 0) + amount;
    const s = Math.max(1, drops[BASE_ITEM] ?? 0);
    rows.push({
      tier,
      difficulty: difficultyOf(tier),
      waves: b.waves,
      units: b.units,
      level,
      hp: Math.round(b.hp),
      step: prev ? +(b.hp / prev).toFixed(2) : 1,
      hpPerSecond: Math.round(b.hpPerSecond),
      duration: Math.round(b.duration),
      t3Share: +b.t3Share.toFixed(2),
      armourShare: +b.armourShare.toFixed(2),
      dropRatio: ITEM_KINDS.map((k) =>
        k === BASE_ITEM ? 100 : Math.round((1000 * (drops[k] ?? 0)) / s) / 10,
      ),
    });
    prev = b.hp;
  }
  return rows;
}

/**
 * The authoring smell test, as a list of complaints. Empty means the script
 * is in line. Run it after editing waves — `window.__ladder.check()`.
 */
export function check(spec: LevelSpec = WORLD): LadderIssue[] {
  const out = debutViolations(spec);
  const rows = audit(spec);

  // a script longer than the top difficulty's cut has waves nothing ever
  // plays — silent content loss, and the easiest edit in the world to make
  // by accident
  const cut = DIFFICULTIES[TOP_TIER].waves;
  if (spec.script.length > cut)
    out.push({
      tier: null,
      kind: "unreachable",
      message: `the script has ${spec.script.length} waves but difficulty ${difficultyOf(TOP_TIER)} only plays ${cut} — waves ${cut + 1}-${spec.script.length} are never sent`,
    });

  // NOTE: there is deliberately no check on the opening loadout. See
  // OPENING_DUOS — difficulty 1 pays for hundreds of duos while it is still
  // being played, so any static-fleet prediction measures a fleet that never
  // exists. That number is tuned by feel, not by arithmetic.

  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    // NOTE: none of these are feasibility tests. Turret prices are flat and
    // every run banks something, so a player can always farm the difficulty
    // below until they can afford the next one — nothing here is unwinnable.
    // What these measure is GRIND, which is the failure mode an idle game
    // actually has.
    if (prev && r.step > WALL_STEP)
      out.push({
        tier: r.tier,
        kind: "wall",
        message: `asks ${r.step}x the health of difficulty ${prev.difficulty} — roughly ${r.step}x the farming before it opens`,
      });
    if (prev && r.step < FILLER_STEP && r.waves > prev.waves)
      out.push({
        tier: r.tier,
        kind: "filler",
        message: `adds ${r.waves - prev.waves} waves but only ${r.step}x the health — the ten new waves are barely paying for themselves`,
      });
    // The currency mix, against what the tree charges. Named off ITEM_KINDS
    // rather than written out, so shifting the whole scale one item up (as
    // the campaign did when scrap dropped off the bottom) moves these with
    // it instead of leaving them describing a currency nothing pays.
    const name = (i: number): string => ITEM_INFO[ITEM_KINDS[i]].name.toLowerCase();
    const [, second, third] = r.dropRatio;
    if (second < 7 || second > 45)
      out.push({
        tier: r.tier,
        kind: "economy",
        message: `pays ${name(1)} at 100:${second}; the tree charges near 100:15, so one currency ends up the only real constraint`,
      });
    if (r.tier >= 1 && (third < 0.8 || third > 30))
      out.push({
        tier: r.tier,
        kind: "economy",
        message: `pays ${name(2)} at 100:${third}; the tree charges near 100:2.5`,
      });
  });
  return out;
}

/**
 * A difficulty costing more than this much more than the last reads as a
 * wall. Generous, because with only three gaps in the whole campaign each
 * one is MEANT to be a real step — the +10 enemy levels alone are 1.79x
 * before a single new wave is counted.
 */
export const WALL_STEP = 4.5;
/** ...and less than this, with ten new waves, reads as padding */
export const FILLER_STEP = 2;
