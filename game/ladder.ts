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

/**
 * THE LADDER — the campaign's only difficulty axis.
 *
 * A world ships ONE authored baseline script (the tier-0 run). Every rung
 * above it is that same script re-scaled by three dials and nothing else:
 *
 *   +LEVELS_PER_TIER enemy levels   difficulty  (health only)
 *   +WAVES_PER_TIER  waves          duration and income
 *   x(1 + DROP_BONUS_PER_TIER * n)  drops       income
 *
 * The rungs never run out, so there is always a next number to go up, and
 * a player who stalls farms the highest rung they can clear until the bank
 * covers the next one. That is the whole idle loop.
 *
 * The three dials are deliberately SEPARATE. Units are income; health is
 * difficulty. A level is pure cost — it doubles what the fleet must chew
 * through every 12 levels and pays nothing back — while a wave is pure
 * income at constant difficulty per body. Moving one never silently moves
 * the other.
 */

/**
 * Mindustry's own per-level health curve. 1.06^12 = 2.01, so twelve levels
 * is exactly double health, and NOTHING else scales: armour, speed, hitbox
 * and drop all stay at their base values forever.
 *
 * Flat armour against level-scaled health is what keeps the whole tier
 * ladder relevant. A tier is just a level offset on this same curve —
 * T2 is +22 levels, T3 is +32, T4 would be +72 — so a level-32 dagger has
 * a fortress's health with a dagger's armour, and a level-32 fortress is
 * still the thing your duos cannot scratch. Tiers stay distinct by their
 * armour long after their health has been overtaken.
 */
export const HP_PER_LEVEL = 1.06;

/** enemy levels added per rung — 5 levels is x1.338 health per tier */
export const LEVELS_PER_TIER = 5;

/**
 * How many waves a tier-0 run sends — the first four of the authored script.
 * Small on purpose: the wave count is one of the two things a rung visibly
 * BUYS, and starting at four is what makes going to seven feel like
 * something rather than a rounding error.
 */
export const BASE_WAVES = 4;

/**
 * How many further waves each rung unlocks off the authored script.
 *
 * This is the ladder's second reward and it is not a side effect. A rung
 * pays more because it sends more, but it is also simply MORE GAME — three
 * waves nobody has seen, hand-written in levels.ts, with kinds the rungs
 * below never fielded — and that is a reason to push that a bigger number
 * on the same four waves could never be.
 */
export const WAVES_PER_TIER = 3;

/**
 * Drop bonus per rung, applied LINEARLY: tier n pays x(1 + 0.15n).
 *
 * Linear on purpose. The bonus is not what pays for the treadmill —
 * turret prices are flat (see tech.ts), so the units you kill already pay
 * for the damage needed to kill them, and the ladder walks with no bonus
 * at all. The bonus exists only so a HIGHER rung is the better farm;
 * without it every rung pays the same per minute and there is no reason to
 * climb. Compound it (x1.2 a rung, say) and income outruns health, so no
 * rung is ever harder than the last and the ladder stops being a ladder.
 *
 * It is deliberately NOT the main reason to push. A rung above pays a
 * little better per body and a lot better per run, but what it really sells
 * is more waves, more enemies and kinds of enemy the rung below never
 * fielded. Climbing buys content; the bonus only stops farming from being
 * the arithmetically correct answer.
 */
export const DROP_BONUS_PER_TIER = 0.15;


/**
 * Coverage: the fraction of its theoretical DPS a placed fleet actually
 * lands, once turrets with nothing in range, travel time and overkill are
 * paid for. It is the single number standing between the arithmetic below
 * and the field, and the one number here that cannot be reasoned out — it
 * has to be MEASURED, against a placement a real player would make.
 *
 * 0.48 is that measurement, back-solved from a human clear of tier 0 with
 * 84 duos: 65,220 effective health / (84 x 27 DPS x 60.1 s).
 *
 * Two things it is NOT. It is not the textbook 0.6, which predicts 67 and
 * hands out a fleet that clears the opening run without asking anything of
 * the player. And it is not the 0.41 a scripted harness reports when it
 * strides duos evenly along the route by flow-field distance: that number
 * is real but it measures the HARNESS, which wastes turrets on stretches a
 * player would leave bare and misses the pinch points a player aims for.
 *
 * Re-measure from a real clear whenever the baseline, the map, or duo's
 * stats change.
 */
export const COVERAGE = 0.48;

/** enemy level of a tier-n run */
export const tierLevel = (tier: number): number => Math.max(0, Math.floor(tier)) * LEVELS_PER_TIER;

/** health multiplier of a tier-n run */
export const tierHpScale = (tier: number): number => HP_PER_LEVEL ** tierLevel(tier);

/** drop multiplier of a tier-n run */
export const tierDropBonus = (tier: number): number =>
  1 + DROP_BONUS_PER_TIER * Math.max(0, Math.floor(tier));

/**
 * How many of the authored waves a tier-n run sends, clamped to what has
 * actually been written. Once a rung runs past the end of the script the
 * wave count stops growing and the ladder continues on enemy level alone —
 * so the campaign never hard-stops, it just stops adding new content.
 */
export const tierWaveCount = (spec: LevelSpec, tier: number): number =>
  Math.min(spec.script.length, BASE_WAVES + WAVES_PER_TIER * Math.max(0, Math.floor(tier)));

/**
 * The rung at which a wave first appears — the inverse of tierWaveCount, and
 * the number an author needs when deciding where in the script to put a new
 * enemy kind.
 */
export const tierOfWave = (index: number): number =>
  Math.max(0, Math.ceil((index + 1 - BASE_WAVES) / WAVES_PER_TIER));

/** the last rung that still unlocks a wave; past it only health rises */
export const topContentTier = (spec: LevelSpec): number =>
  tierOfWave(spec.script.length - 1);

/** one unit's health at an enemy level (armour, speed and drop never move) */
export const unitHpAtLevel = (kind: UnitKind, level: number): number =>
  UNIT_STATS[kind].hp * HP_PER_LEVEL ** Math.max(0, level);

// ---------- expansion ----------

/**
 * The playable spec for one rung: the authored script cut to this tier's
 * wave count, carrying the enemy level the sim scales health by.
 *
 * Nothing is generated. Wave 1 of tier 40 is wave 1 of the same authored
 * list tier 0 plays, just with 200 levels on it — which is what lets the
 * level editor be the whole authoring surface.
 */
export function specForTier(spec: LevelSpec, tier: number): LevelSpec {
  const n = Math.max(0, Math.floor(tier));
  return {
    ...spec,
    script: spec.script.slice(0, tierWaveCount(spec, n)),
    tier: n,
    enemyLevel: tierLevel(n),
  };
}

// ---------- the difficulty budget ----------

/**
 * Duo DPS against bare flesh: damage 9 every 20 ticks is 27/s. The whole
 * budget is denominated in duos because the duo is the fleet's unit of
 * account — flat-priced, one tile, and the only turret a stalled player can
 * always buy more of.
 */
export const DUO_DPS = (TOWERS.duo.bullet.damage * 60) / (TOWERS.duo.reload * 60);

/**
 * A unit's health as the duo fleet experiences it. Armour is subtracted
 * per shot with a 10% floor, so a unit with armour a soaks 9 / max(9 - a,
 * 0.9) times its printed health from a duo line. Budgeting on printed
 * health instead is how a wave of maces quietly costs double what it looks
 * like, and a wave of fortresses ten times.
 */
export function duoEffectiveHp(kind: UnitKind, level = 0): number {
  const dmg = TOWERS.duo.bullet.damage;
  const { armor } = UNIT_STATS[kind];
  return (unitHpAtLevel(kind, level) * dmg) / Math.max(dmg - armor, 0.1 * dmg);
}

export interface Budget {
  waves: number;
  units: number;
  /** printed health of everything the run sends */
  hp: number;
  /** ...and what it costs a duo line, after armour */
  effectiveHp: number;
  /** share of printed health carried by tier 3 and up — the real difficulty */
  t3Share: number;
  /** seconds the run lasts if it is killed as fast as it arrives */
  duration: number;
  /** duos needed to clear it at COVERAGE */
  duos: number;
}

/**
 * Weigh a rung. duration = waves * gap + units / spawnRate is the whole run
 * front to back, and total effective health <= fleet DPS * COVERAGE *
 * duration is the clear condition, so the duo count that satisfies it with
 * equality is exactly what the rung asks for.
 *
 * One optimism to know about: this counts a level's WAVE GAP as productive
 * time, when part of it is an empty field. That is folded into COVERAGE
 * rather than modelled, which is fine while the gap is what it was measured
 * at and wrong as soon as it moves — raising waveGap lengthens `duration`
 * and so LOWERS the fleet this predicts, exactly backwards from the truth.
 * Change waveGap or spawnRate and COVERAGE has to be measured again.
 */
export function budget(spec: LevelSpec, tier = 0): Budget {
  const run = specForTier(spec, tier);
  const level = run.enemyLevel ?? 0;
  let units = 0;
  let hp = 0;
  let effectiveHp = 0;
  let t3hp = 0;
  for (const step of run.script) {
    for (const g of waveGroups(step.wave)) {
      g.counts.forEach((count, i) => {
        if (count <= 0) return;
        const kind = UNIT_KINDS[i];
        const h = unitHpAtLevel(kind, level) * count;
        units += count;
        hp += h;
        effectiveHp += duoEffectiveHp(kind, level) * count;
        if (UNIT_STATS[kind].tier >= 3) t3hp += h;
      });
    }
  }
  const duration = run.script.length * run.waveGap + units / run.spawnRate;
  return {
    waves: run.script.length,
    units,
    hp,
    effectiveHp,
    t3Share: hp > 0 ? t3hp / hp : 0,
    duration,
    duos: effectiveHp / Math.max(1e-6, duration * COVERAGE * DUO_DPS),
  };
}

/**
 * The opening loadout, SOLVED rather than guessed: the duo count that
 * clears the baseline exactly. A fresh save must beat tier 0 outright with
 * nothing bought — the core has one hit point, so a 100% kill rate is
 * mandatory and every unit authored is DPS the player must actually have.
 * Undersize this and the game opens as a die-and-grind loop.
 *
 * A 10% margin covers the fact that the budget assumes a perfectly spread
 * fleet and a first-time player's is not.
 */
export function startingDuos(spec: LevelSpec): number {
  return Math.ceil(budget(spec, 0).duos * OPENING_MARGIN);
}

/**
 * How much more than the tier-0 budget the opening loadout carries: nothing.
 * The opening run is meant to be a fight — placement is the only skill the
 * game asks for and the first rung is where it is taught, so the fleet is
 * sized to exactly what the budget says clears it and no more. A player who
 * spreads it well has a little room; one who bunches it on the wrong ridge
 * leaks, and the answer is to move the duos, not to buy more.
 */
const OPENING_MARGIN = 1;

// ---------- the debut rule, enforced ----------

/**
 * The best per-shot damage the player can own by the time a rung starts:
 * the strongest bullet among every turret whose gate has opened.
 *
 * Splash and pierce are ignored on purpose. What the debut rule cares about
 * is the SINGLE-SHOT number armour is subtracted from, because that is what
 * decides whether a unit reads at its printed health or at ten times it.
 */
function bestShotByTier(tier: number): number {
  let best = 0;
  for (const node of TECH_TREE) {
    if (node.requiresTier != null && node.requiresTier >= tier) continue;
    best = Math.max(best, TOWERS[node.tower].bullet.damage);
  }
  return best;
}

/**
 * Every unit debuts against a turret that can actually hurt it — the one
 * authoring rule the extension pool has to keep. A violation is silent in
 * play: the wave simply cannot be killed, the core takes its one hit, and
 * the rung reads as "too hard" rather than as "mispriced armour".
 *
 * Returns the offending debuts, empty when the pool is sound.
 */
export function debutViolations(): string[] {
  const debut = new Map<UnitKind, number>();
  WORLD.script.forEach((step, i) => {
    const at = tierOfWave(i);
    for (const g of waveGroups(step.wave))
      g.counts.forEach((count, k) => {
        if (count <= 0) return;
        const kind = UNIT_KINDS[k];
        debut.set(kind, Math.min(debut.get(kind) ?? Infinity, at));
      });
  });

  const bad: string[] = [];
  for (const [kind, tier] of debut) {
    const { armor, hp } = UNIT_STATS[kind];
    const shot = bestShotByTier(tier);
    if (armor >= shot)
      bad.push(
        `${kind} (armour ${armor}) debuts at tier ${tier}, where the best shot available is ${shot} — it would land the 10% floor and read as ${Math.round(hp / 0.1)} health rather than ${hp}`,
      );
  }
  return bad;
}



// ---------- authoring aid ----------

/** what one authored wave costs and pays, at a given enemy level */
export interface WaveCost {
  units: number;
  /** printed health */
  hp: number;
  /** ...and what it costs a duo line once flat armour is paid */
  effectiveHp: number;
  /** share of effective health carried by tier 3 and up */
  t3Share: number;
  /** how much of it flies — hail and scorch cannot touch these at all */
  airShare: number;
  /** one item per kill, by tier: what the wave pays */
  drops: { scrap: number; copper: number; titanium: number };
}

export function waveCost(step: LevelStep, level = 0): WaveCost {
  const out: WaveCost = {
    units: 0, hp: 0, effectiveHp: 0, t3Share: 0, airShare: 0,
    drops: { scrap: 0, copper: 0, titanium: 0 },
  };
  const item = ["scrap", "copper", "titanium"] as const;
  let t3 = 0;
  let air = 0;
  for (const g of waveGroups(step.wave)) {
    g.counts.forEach((count, i) => {
      if (count <= 0) return;
      const kind = UNIT_KINDS[i];
      const stats = UNIT_STATS[kind];
      const eff = duoEffectiveHp(kind, level) * count;
      out.units += count;
      out.hp += unitHpAtLevel(kind, level) * count;
      out.effectiveHp += eff;
      if (stats.tier >= 3) t3 += eff;
      if (stats.flying) air += eff;
      out.drops[item[Math.min(stats.tier, 3) - 1]] += count;
    });
  }
  out.t3Share = out.effectiveHp > 0 ? t3 / out.effectiveHp : 0;
  out.airShare = out.effectiveHp > 0 ? air / out.effectiveHp : 0;
  return out;
}

export interface AuditRow {
  tier: number;
  waves: number;
  units: number;
  /** duos the rung asks for, at COVERAGE */
  duos: number;
  /** how much harder than the rung below — the number to keep even */
  step: number;
  t3Share: number;
  /** scrap : copper : titanium the rung pays, normalised to scrap = 100 */
  dropRatio: [number, number, number];
}

/**
 * Walk the ladder and report what each rung actually asks for. This is the
 * authoring aid: hand-written waves are free to be whatever they want, but
 * three things do NOT come out in the wash, because the tier scales HEALTH
 * and nothing else.
 *
 * ARMOUR is the big one. It is flat and never scales, so it is a permanent
 * multiplier on a wave's cost at every rung forever: max(dmg - armor,
 * 0.1 * dmg) means a fortress costs a duo line ten times its printed health
 * at tier 0 and still ten times at tier 40. Swapping daggers for maces in a
 * wave roughly doubles it; swapping them for fortresses multiplies it
 * sixtyfold. `duos` below counts that, `units` does not.
 *
 * HEALTH PER BODY is difficulty that pays nothing back. A kill drops one
 * item whatever it killed, so 100 spirocts cost fifteen times what 100
 * daggers cost and pay the same hundred items (in a different currency).
 * Padding a wave with T1 bodies is close to free — it adds cost and income
 * at about the same rate — which is why the swarm waves can be as big as
 * they look good at.
 *
 * THE CURRENCY MIX has to stay near what the tree charges. Prices are
 * written at roughly scrap : copper : titanium = 100 : 15 : 2.5 (tech.ts),
 * and if the script drifts far from that, one currency becomes the only
 * real constraint while the others pile up unspent.
 *
 * Two more that this cannot measure but that matter at the table: AIR
 * (hail and scorch cannot shoot up at all, so an all-air wave switches off
 * half a fleet — waveCost reports airShare) and CRAWLER SPEED (twice the
 * line's pace, so they reach the core before the kill zone has finished
 * with them, whatever their health says).
 */
export function audit(spec: LevelSpec = WORLD, through = 20): AuditRow[] {
  const rows: AuditRow[] = [];
  let prev = 0;
  for (let tier = 0; tier <= through; tier++) {
    const run = specForTier(spec, tier);
    const level = run.enemyLevel ?? 0;
    let units = 0, eff = 0, t3 = 0;
    const drops = { scrap: 0, copper: 0, titanium: 0 };
    for (const step of run.script) {
      const c = waveCost(step, level);
      units += c.units;
      eff += c.effectiveHp;
      t3 += c.effectiveHp * c.t3Share;
      drops.scrap += c.drops.scrap;
      drops.copper += c.drops.copper;
      drops.titanium += c.drops.titanium;
    }
    const duration = run.script.length * run.waveGap + units / run.spawnRate;
    const duos = eff / Math.max(1e-6, duration * COVERAGE * DUO_DPS);
    const s = Math.max(1, drops.scrap);
    rows.push({
      tier,
      waves: run.script.length,
      units,
      duos: Math.round(duos),
      step: prev ? +(duos / prev).toFixed(2) : 1,
      t3Share: +(t3 / Math.max(1, eff)).toFixed(2),
      dropRatio: [100, Math.round((100 * drops.copper) / s), Math.round((1000 * drops.titanium) / s) / 10],
    });
    prev = duos;
  }
  return rows;
}

/**
 * The authoring smell test, as a list of complaints. Empty means the script
 * is in line. Run it after editing waves — `window.__ladder.check()`.
 */
export function check(spec: LevelSpec = WORLD, through = 20): string[] {
  const out = debutViolations();
  for (const r of audit(spec, through)) {
    // a rung should cost about half again what the one below it did. Much
    // more and it reads as a wall; much less and it reads as filler
    if (r.tier > 0 && r.step > 1.85)
      out.push(`tier ${r.tier} asks ${r.step}x the fleet of tier ${r.tier - 1} — a wall, not a rung`);
    if (r.tier > 0 && r.step < 1.1 && r.waves > (audit(spec, r.tier - 1).at(-1)?.waves ?? 0))
      out.push(`tier ${r.tier} adds waves but barely any difficulty (${r.step}x) — filler`);
    // the tree charges roughly 100 : 15 : 2.5; drifting far from what the
    // script pays makes one currency the only real constraint
    const [, cu, ti] = r.dropRatio;
    if (cu < 7 || cu > 45)
      out.push(`tier ${r.tier} pays copper at 100:${cu} — the tree charges near 100:15`);
    if (r.tier >= 3 && (ti < 0.8 || ti > 30))
      out.push(`tier ${r.tier} pays titanium at 100:${ti} — the tree charges near 100:2.5`);
  }
  return out;
}

// dev builds shout about an out-of-line script the moment it loads, so an
// edit that breaks the ladder is caught at the console rather than at tier 9
if (process.env.NODE_ENV !== "production")
  for (const why of check()) console.warn(`ladder: ${why}`);
