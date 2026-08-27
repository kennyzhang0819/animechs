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
 * A world ships ONE authored baseline script (the tier-0 run). Every tier
 * above it is that same script re-scaled by three dials and nothing else:
 *
 *   +LEVELS_PER_TIER enemy levels   difficulty  (health only)
 *   +WAVES_PER_TIER  waves          duration and income
 *   x(1 + DROP_BONUS_PER_TIER * n)  drops       income
 *
 * The tiers never run out, so there is always a next number to go up, and
 * a player who stalls farms the highest tier they can clear until the bank
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

/** enemy levels added per tier — 5 levels is x1.338 health */
export const LEVELS_PER_TIER = 5;

/**
 * How many waves a tier-0 run sends — the first four of the authored script.
 * Small on purpose: the wave count is one of the two things a tier visibly
 * BUYS, and starting at four is what makes going to seven feel like
 * something rather than a rounding error.
 */
export const BASE_WAVES = 4;

/**
 * How many further waves each tier unlocks off the authored script.
 *
 * This is the ladder's second reward and it is not a side effect. A tier
 * pays more because it sends more, but it is also simply MORE GAME — three
 * waves nobody has seen, hand-written in levels.ts, with kinds the tiers
 * below never fielded — and that is a reason to push that a bigger number
 * on the same four waves could never be.
 */
export const WAVES_PER_TIER = 3;

/**
 * Drop bonus per tier, applied LINEARLY: tier n pays x(1 + 0.15n).
 *
 * Linear on purpose. The bonus is not what pays for the treadmill —
 * turret prices are flat (see tech.ts), so the units you kill already pay
 * for the damage needed to kill them, and the ladder walks with no bonus
 * at all. The bonus exists only so a HIGHER tier is the better farm;
 * without it every tier pays the same per minute and there is no reason to
 * climb. Compound it (x1.2 a tier, say) and income outruns health, so no
 * tier is ever harder than the last and the ladder stops being a ladder.
 *
 * It is deliberately NOT the main reason to push. A tier above pays a
 * little better per body and a lot better per run, but what it really sells
 * is more waves, more enemies and kinds of enemy the tier below never
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

/**
 * The tier as the PLAYER sees it: "Difficulty 1" is tier 0.
 *
 * `tier` is 0-based everywhere in the code and in window.__ladder, because
 * tier 0 is the authored baseline every other tier is expanded from and an
 * offset there would put a +1 in the middle of the arithmetic. But
 * "Difficulty 0" reads as NO difficulty, so the screen is 1-based. Every
 * player-facing tier number goes through here, so the two numbering schemes
 * meet in exactly one place instead of a `+ 1` per label.
 */
export const difficultyOf = (tier: number): number =>
  Math.max(0, Math.floor(tier)) + 1;

/** enemy level of a tier-n run */
export const tierLevel = (tier: number): number => Math.max(0, Math.floor(tier)) * LEVELS_PER_TIER;

/** health multiplier of a tier-n run */
export const tierHpScale = (tier: number): number => HP_PER_LEVEL ** tierLevel(tier);

/** drop multiplier of a tier-n run */
export const tierDropBonus = (tier: number): number =>
  1 + DROP_BONUS_PER_TIER * Math.max(0, Math.floor(tier));

/**
 * How many of the authored waves a tier-n run sends, clamped to what has
 * actually been written. Once a tier runs past the end of the script the
 * wave count stops growing and the ladder continues on enemy level alone —
 * so the campaign never hard-stops, it just stops adding new content.
 */
export const tierWaveCount = (spec: LevelSpec, tier: number): number =>
  Math.min(spec.script.length, BASE_WAVES + WAVES_PER_TIER * Math.max(0, Math.floor(tier)));

/**
 * The tier at which a wave first appears — the inverse of tierWaveCount, and
 * the number an author needs when deciding where in the script to put a new
 * enemy kind.
 */
export const tierOfWave = (index: number): number =>
  Math.max(0, Math.ceil((index + 1 - BASE_WAVES) / WAVES_PER_TIER));

/** the last tier that still unlocks a wave; past it only health rises */
export const topContentTier = (spec: LevelSpec): number =>
  tierOfWave(spec.script.length - 1);

/** one unit's health at an enemy level (armour, speed and drop never move) */
export const unitHpAtLevel = (kind: UnitKind, level: number): number =>
  UNIT_STATS[kind].hp * HP_PER_LEVEL ** Math.max(0, level);

// ---------- expansion ----------

/**
 * The playable spec for one tier: the authored script cut to this tier's
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
 * Weigh a tier. duration = waves * gap + units / spawnRate is the whole run
 * front to back, and total effective health <= fleet DPS * COVERAGE *
 * duration is the clear condition, so the duo count that satisfies it with
 * equality is exactly what the tier asks for.
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

export const OPENING_DUOS = 70;

// ---------- the debut rule, enforced ----------

/**
 * The best per-shot damage the player can own by the time a tier starts:
 * the strongest bullet among every turret whose gate has opened.
 *
 * Splash and pierce are ignored on purpose. What the debut rule cares about
 * is the SINGLE-SHOT number armour is subtracted from, because that is what
 * decides whether a unit reads at its printed health or at ten times it.
 */
function bestShotByTier(tier: number): number {
  // TIER 0 IS A SPECIAL CASE AND IT IS THE ONE THAT MATTERS. A fresh save
  // has banked nothing — kills are the only income — so it owns the free
  // duos and literally nothing else, however many turrets are technically
  // ungated. Counting hail's 20 damage here because hail has no tier gate
  // is what let three fortresses into wave 4 without a word of complaint.
  if (Math.floor(tier) <= 0) return TOWERS.duo.bullet.damage;
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
 * the tier reads as "too hard" rather than as "mispriced armour".
 *
 * Returns the offending debuts, empty when the script is sound.
 */
export function debutViolations(spec: LevelSpec = WORLD): LadderIssue[] {
  const debut = new Map<UnitKind, number>();
  spec.script.forEach((step, i) => {
    const at = tierOfWave(i);
    for (const g of waveGroups(step.wave))
      g.counts.forEach((count, k) => {
        if (count <= 0) return;
        const kind = UNIT_KINDS[k];
        debut.set(kind, Math.min(debut.get(kind) ?? Infinity, at));
      });
  });

  const bad: LadderIssue[] = [];
  for (const [kind, tier] of debut) {
    const { armor, hp } = UNIT_STATS[kind];
    const shot = bestShotByTier(tier);
    if (armor >= shot)
      bad.push({
        tier,
        kind: "debut",
        message: `${kind} (armour ${armor}) debuts here, but the best shot on sale is ${shot} — it lands the 10% floor and plays as ${Math.round(hp / 0.1).toLocaleString()} health instead of ${hp.toLocaleString()}`,
      });
  }
  return bad;
}

/**
 * One complaint about a script. `tier` is the tier it belongs to, so the
 * level editor can label the wave rows that tier owns; null means the
 * finding is about the script as a whole.
 */
export interface LadderIssue {
  tier: number | null;
  kind: "debut" | "opening" | "wall" | "filler" | "economy";
  message: string;
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
    units: 0,
    hp: 0,
    effectiveHp: 0,
    t3Share: 0,
    airShare: 0,
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

/** one tier, weighed — the row the editor's ladder check renders */
export interface AuditRow {
  tier: number;
  waves: number;
  units: number;
  /** duos the tier asks for, at COVERAGE */
  duos: number;
  /** how much harder than the tier below — the number to keep even */
  step: number;
  t3Share: number;
  /** scrap : copper : titanium the tier pays, normalised to scrap = 100 */
  dropRatio: [number, number, number];
}

/**
 * Walk the ladder and report what each tier actually asks for.
 *
 * Hand-written waves are free to be whatever they want, but three things do
 * NOT come out in the wash, because the tier scales HEALTH and nothing else.
 *
 * ARMOUR is the big one. It is flat and never scales, so it is a permanent
 * multiplier on a wave's cost at every tier forever: max(dmg - armor,
 * 0.1 * dmg) means a fortress costs a duo line ten times its printed health
 * at tier 0 and still ten times at tier 40. `duos` counts that, `units`
 * does not.
 *
 * HEALTH PER BODY is difficulty that pays nothing back. A kill drops one
 * item whatever it killed, so 100 spirocts cost fifteen times what 100
 * daggers cost and pay the same hundred items in a different currency.
 * Padding a wave with tier-1 bodies is close to free.
 *
 * THE CURRENCY MIX has to stay near what the tree charges, or one currency
 * becomes the only real constraint while the others pile up unspent.
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
export function check(spec: LevelSpec = WORLD, through = 20): LadderIssue[] {
  const out = debutViolations(spec);
  const rows = audit(spec, through);

  // The free opening loadout is solved off the SHIPPED baseline in code,
  // because a save is read the moment the page opens and level documents
  // arrive later (see levels.ts). So an edit that makes tier 0 heavier does
  // NOT move the fleet handed out to answer it, and a fresh save walks into
  // a run it cannot clear with no way to earn its way out — kills are the
  // only income and a wipe on wave 1 banks almost nothing.
  const granted = OPENING_DUOS;
  if (rows[0] && rows[0].duos > granted)
    out.push({
      tier: 0,
      kind: "opening",
      message: `needs ${rows[0].duos} duos but a fresh save is handed ${granted} — either lighten the opening waves or update the shipped baseline in levels.ts`,
    });

  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    // NOTE: none of these are feasibility tests. Turret prices are flat and
    // every run banks something, so a player can always farm the tier below
    // until they can afford the next one — nothing here is unwinnable. What
    // these measure is GRIND, which is the failure mode an idle game
    // actually has: a tier costing twice what the last one did is not
    // impossible, it is twice the farming, and three of those stacked is a
    // chore rather than a climb
    if (prev && r.step > WALL_STEP)
      out.push({
        tier: r.tier,
        kind: "wall",
        message: `asks ${r.step}x the fleet of tier ${prev.tier} — roughly ${r.step}x the farming before it opens`,
      });
    if (prev && r.step < FILLER_STEP && r.waves > prev.waves)
      out.push({
        tier: r.tier,
        kind: "filler",
        message: `adds ${r.waves - prev.waves} waves but only ${r.step}x the difficulty — reads as padding`,
      });
    const [, cu, ti] = r.dropRatio;
    if (cu < 7 || cu > 45)
      out.push({
        tier: r.tier,
        kind: "economy",
        message: `pays copper at 100:${cu}; the tree charges near 100:15, so one currency ends up the only real constraint`,
      });
    if (r.tier >= 3 && (ti < 0.8 || ti > 30))
      out.push({
        tier: r.tier,
        kind: "economy",
        message: `pays titanium at 100:${ti}; the tree charges near 100:2.5`,
      });
  });
  return out;
}

/** a tier costing more than this much more than the last reads as a wall */
export const WALL_STEP = 1.85;
/** ...and less than this, with new waves, reads as padding */
export const FILLER_STEP = 1.1;
