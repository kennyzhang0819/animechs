import { MU, PAL, TOWERS, type BulletStats, type TowerStats } from "./constants";
import { FxKind, TOWER_KINDS, type TowerKind } from "./types";

/**
 * THE TURRET UPGRADE BRANCHES — four nodes hanging off every turret in the
 * tree, and the one part of the tech tree whose points buy neither a
 * placement nor a switch but STATS, applied to every turret of that kind
 * standing on the board at once.
 *
 * IT STARTED AS DUO'S BRANCH AND IT IS NOW EVERY TURRET'S. Duo had four
 * nodes — rate of fire, pierce, graphite rounds, duo power — and they were
 * hand-written into tech.ts as utilities that happened to name duo. That
 * shape turned out to be the right one for every turret in the game, so it
 * is a TABLE now: seventeen branches of four, each one a chain, each one
 * priced off the turret it improves. Duo's four keep their original ids so
 * a save that bought them keeps them.
 *
 * THE FOUR RUNGS ARE THE SAME SHAPE EVERYWHERE, and that shape is the
 * contract this file is written to:
 *
 *   1  a cheap stacking dial. Weak on its own — a few per cent a point —
 *      and bought over a campaign rather than in one go.
 *   2  a second stacking dial on a DIFFERENT axis, so the two do not
 *      compete for the same number. Also weak per point.
 *   3  a one-shot that is genuinely good: an ammunition swap, a doubling,
 *      a capability the stock turret does not have. Bought once.
 *   4  THE ULTIMATE. One shot, paid for in SURGE ALLOY and nothing else,
 *      and it does not improve the turret so much as replace it — a
 *      scatter that shoots the ground, an arc that forks three ways, a
 *      salvo that fires missiles. See ULTIMATE_SURGE in tech.ts for what
 *      one costs; the short version is that a turret's own difficulty
 *      decides, because surge is the currency a boss pays and nothing
 *      else does.
 *
 * WHY STATS AND NOT MORE TURRETS. A tech tree that only ever sells the
 * NEXT turret asks the player to abandon what they have every time they
 * climb a rung — the duos that carried the first ten waves are dead weight
 * by wave thirty. These branches are the other offer: keep what works and
 * make it worth keeping. A maxed duo line and a bare salvo are a real
 * choice, which is the whole point.
 *
 * NOTHING HERE IS GATED BY DIFFICULTY, exactly as nothing else in the tree
 * is. What a run may BRING is the difficulty's own question (bandForTier);
 * what a save OWNS is this. The price is the only pacing, and because an
 * upgrade's bundle is its turret's bundle scaled up, an upgrade opens on
 * the same difficulty its turret does and never before it.
 */

/** every upgrade node id, in tree order — the tech tree's third namespace */
export const UPGRADE_KINDS = [
  // duo's four keep the ids they shipped with: a save's points are keyed
  // by id, and renaming one would silently delete what a player bought
  "duo-rof",
  "duo-pierce",
  "duo-graphite",
  "duo-power",
  "scatter-loader",
  "scatter-fuse",
  "scatter-metaglass",
  "scatter-storm",
  "arc-coils",
  "arc-reach",
  "arc-ionised",
  "arc-cascade",
  "hail-bore",
  "hail-charge",
  "hail-incendiary",
  "hail-cluster",
  "scorch-pressure",
  "scorch-fuel",
  "scorch-pyratite",
  "scorch-incinerator",
  "salvo-autoload",
  "salvo-pierce",
  "salvo-pyratite",
  "salvo-missiles",
  "wave-pump",
  "wave-nozzle",
  "wave-cryo",
  "wave-flashfreeze",
  "lancer-capacitor",
  "lancer-lens",
  "lancer-optics",
  "lancer-prism",
  "ripple-barrels",
  "ripple-frag",
  "ripple-plastanium",
  "ripple-saturation",
  "parallax-field",
  "parallax-aperture",
  "parallax-phase",
  "parallax-singularity",
  "fuse-choke",
  "fuse-reach",
  "fuse-surge",
  "fuse-annihilator",
  "swarmer-fins",
  "swarmer-racks",
  "swarmer-warheads",
  "swarmer-doctrine",
  "cyclone-belt",
  "cyclone-fuse",
  "cyclone-surge",
  "cyclone-storm",
  "tsunami-chamber",
  "tsunami-spray",
  "tsunami-cryo",
  "tsunami-zero",
  "spectre-cooling",
  "spectre-cores",
  "spectre-surge",
  "spectre-siege",
  "meltdown-loop",
  "meltdown-array",
  "meltdown-phase",
  "meltdown-fusion",
  "foreshadow-caps",
  "foreshadow-servos",
  "foreshadow-surge",
  "foreshadow-orbital",
] as const;
export type UpgradeKind = (typeof UPGRADE_KINDS)[number];

const UPGRADE_SET: ReadonlySet<string> = new Set<string>(UPGRADE_KINDS);

/** is this node one of the turret upgrade branches? */
export const isUpgradeNode = (id: string): id is UpgradeKind => UPGRADE_SET.has(id);

/** how many rungs every branch has — the tier numbers are 1..UPGRADE_RUNGS */
export const UPGRADE_RUNGS = 4;

/**
 * What the branch is allowed to know about the board it is being resolved
 * against. Today that is one number, and it exists for the one upgrade
 * whose worth is a HEAD COUNT rather than a purchase (duo power): every
 * duo hits harder for each OTHER duo standing.
 *
 * It is resolved at the moments the count can move — a tower placed, sold
 * or cleared — and never per shot. See Sim.refreshSpecs.
 */
export interface UpgradeContext {
  /** how many turrets of this kind are standing right now */
  count: number;
}

/** the chip face an upgrade wears in the tree — see GLYPH in TechTree.tsx */
export type UpgradeGlyph =
  | "rate"
  | "pierce"
  | "range"
  | "damage"
  | "splash"
  | "burn"
  | "frost"
  | "duration"
  | "homing"
  | "spread"
  | "beam"
  | "air"
  | "surge";

export interface TurretUpgradeDef {
  id: UpgradeKind;
  /** the turret this rung improves — its parent in the tree */
  turret: TowerKind;
  /** 1..4, and the whole of what the node costs and how it reads */
  tier: number;
  name: string;
  /** what owning it does, in the player's own terms */
  blurb: string;
  /**
   * The chip's face. NO TWO RUNGS OF ONE BRANCH MAY WEAR THE SAME ONE —
   * the row is read left to right at a zoom where the labels are too small
   * to see, so two identical glyphs under one turret are two nodes the
   * player cannot tell apart.
   */
  glyph: UpgradeGlyph;
  /** the most points this rung will take — 1 for the two one-shots */
  cap: number;
  /** the upgraded stats, given the points held and the board it stands on */
  apply: (s: TowerStats, points: number, ctx: UpgradeContext) => TowerStats;
  /**
   * WHAT THE NODE IS DOING RIGHT NOW, not what a point is worth. A dial is
   * bought a point at a time over a whole campaign, and "+4% a point" is no
   * help to someone deciding whether the fourteenth one is worth paying
   * for — "+56% attack speed" is. Absent on the one-shots, whose blurb
   * already says the whole story.
   */
  effect?: (points: number) => string;
}

// ---------------------------------------------------------------------------
// THE STAT SURGERY, written once
//
// Every `apply` below is built out of these. They are pure — a new
// TowerStats every time, never a mutation of the table in constants.ts —
// because the stock stats are shared by every save, every editor preview
// and the balance page, and one in-place edit would poison all of them.
// ---------------------------------------------------------------------------

/** the same turret with some of its bullet's fields replaced */
const withBullet = (s: TowerStats, b: Partial<BulletStats>): TowerStats => ({
  ...s,
  bullet: { ...s.bullet, ...b },
});

/**
 * Attack speed, which is the RECIPROCAL of reload: +100% rate is half the
 * wait. Every rate node in the file goes through this, so "+n%" always
 * means the same thing.
 */
const faster = (s: TowerStats, mul: number): TowerStats => ({ ...s, reload: s.reload / mul });

/**
 * Damage, and the splash that goes with it. A shell's blast and its direct
 * hit are the same round doing the same thing, so a damage node that moved
 * only one of them would read as broken on exactly the turrets — hail,
 * ripple, scatter — whose damage IS the blast.
 */
const stronger = (s: TowerStats, mul: number): TowerStats =>
  withBullet(s, { damage: s.bullet.damage * mul, splash: s.bullet.splash * mul });

/**
 * REACH, and everything that has to move with it.
 *
 * A turret's `range` is only what it will SHOOT at; how far the shot
 * actually travels is the bullet's own business, and for a plain
 * projectile that is speed x lifetime. Raise one without the other and the
 * turret acquires targets it cannot reach, then watches its rounds die in
 * mid-air — which is why this touches the lifetime and every hitscan
 * length there is rather than the range alone.
 */
const reaching = (s: TowerStats, mul: number): TowerStats => {
  const b = s.bullet;
  return {
    ...s,
    range: s.range * mul,
    bullet: {
      ...b,
      lifetime: b.lifetime * mul,
      ...(b.ray ? { ray: { ...b.ray, length: b.ray.length * mul } } : null),
      ...(b.laser ? { laser: { ...b.laser, length: b.laser.length * mul } } : null),
      ...(b.rail ? { rail: { ...b.rail, length: b.rail.length * mul } } : null),
      ...(b.continuous
        ? { continuous: { ...b.continuous, length: b.continuous.length * mul } }
        : null),
    },
  };
};

/** the blast's radius, left where the damage is */
const wider = (s: TowerStats, mul: number): TowerStats =>
  withBullet(s, { splashRadius: s.bullet.splashRadius * mul });

/** a flak shell's proximity fuse — how far off a body it goes off */
const fusedAt = (s: TowerStats, mul: number): TowerStats =>
  s.bullet.flak
    ? withBullet(s, { flak: { ...s.bullet.flak, explodeRange: s.bullet.flak.explodeRange * mul } })
    : s;

/** the tractor beam's pull, both the flat term and the point-blank one */
const pulling = (s: TowerStats, mul: number): TowerStats =>
  s.bullet.tractor
    ? withBullet(s, {
        tractor: {
          force: s.bullet.tractor.force * mul,
          scaledForce: s.bullet.tractor.scaledForce * mul,
        },
      })
    : s;

/** turn a shot into a piercing one, or raise the cap on one that already is */
const piercing = (s: TowerStats, extra: number): TowerStats =>
  withBullet(s, {
    pierce: true,
    pierceCap: (s.bullet.pierceCap ?? 1) + extra,
  });

/**
 * The composed stats with a few turret fields and a few bullet fields
 * replaced — the shape almost every ultimate wants, because an ultimate is
 * usually "these multipliers, AND it now does this".
 *
 * It exists to stop the same composed expression being written twice in one
 * rung: `{...reaching(s, 1.3), bullet: {...reaching(s, 1.3).bullet, ...}}`
 * is correct, does the work twice, and hides a live bug the moment the two
 * copies stop matching.
 */
const then = (
  s: TowerStats,
  turret: Partial<Omit<TowerStats, "bullet">>,
  bullet: Partial<BulletStats> = {},
): TowerStats => ({ ...s, ...turret, bullet: { ...s.bullet, ...bullet } });

/** percent, as the cards print it */
const pct = (n: number): string => `${Math.round(n * 100)}%`;

/** a stacking dial: the same per-point multiplier and the same sentence */
const dial = (
  per: number,
  label: string,
  build: (s: TowerStats, mul: number) => TowerStats,
): Pick<TurretUpgradeDef, "apply" | "effect"> => ({
  apply: (s, n) => build(s, 1 + per * n),
  effect: (n) => `+${pct(per * n)} ${label}`,
});

// ---------------------------------------------------------------------------
// THE BRANCHES
// ---------------------------------------------------------------------------

const DUO: readonly TurretUpgradeDef[] = [
  {
    id: "duo-rof",
    turret: "duo",
    tier: 1,
    name: "Rate of Fire",
    blurb: "Every duo on the board fires 5% faster per point, up to twice its stock rate.",
    glyph: "rate",
    cap: 20,
    ...dial(0.05, "attack speed", faster),
  },
  {
    id: "duo-pierce",
    turret: "duo",
    tier: 2,
    name: "Pierce",
    blurb: "Each point lets a duo's shot punch through one more body before it is spent.",
    glyph: "pierce",
    cap: 10,
    // PIERCE IS A CAP, NOT A FLAG. A stock duo bullet has no `pierce` at
    // all, which the sim reads as "spent on the first body". One point
    // turns pierce on with a cap of two, so "+1 pierce" is one EXTRA body,
    // and the cap keeps a shot from running its whole lifetime down a lane
    apply: (s, n) => piercing(s, n),
    effect: (n) => `Shots punch through ${1 + n} bodies`,
  },
  {
    id: "duo-graphite",
    turret: "duo",
    tier: 3,
    name: "Graphite Rounds",
    blurb: "Duos load graphite instead of copper: 9 damage a shot becomes 18. Bought once.",
    glyph: "damage",
    cap: 1,
    // THE GRAPHITE ROUND, 1:1 from Blocks.java's duo ammo() block:
    //
    //   Items.graphite, new BasicBulletType(3.5f, 18){{
    //     width = 9f; height = 12f;
    //     hitColor = backColor = trailColor = Pal.graphiteAmmoBack;
    //     frontColor = Pal.graphiteAmmoFront;
    //   }}
    //
    // Copper is a warm tan (eac1a8 over d39169) and graphite is a pale
    // blue-white over blue-violet (dae1ee over 7d89d8), so the swap is the
    // most visible thing the upgrade does — which is the point: a node
    // that doubles every duo's damage must not fire a shot that looks
    // identical to the one before it.
    //
    // NOT IMPORTED: speed 3.5 (copper 2.5), rangeChange +16, and
    // reloadMultiplier 0.8. The first two are unasked-for buffs and the
    // third is a NERF that would fight the rate-of-fire node one rung up.
    apply: (s) =>
      withBullet(stronger(s, 2), {
        ...(s.bullet.sprite
          ? {
              sprite: {
                ...s.bullet.sprite,
                across: 9 * MU,
                along: 12 * MU,
                back: PAL.graphiteAmmoBack,
                front: PAL.graphiteAmmoFront,
              },
            }
          : null),
        fxColor: PAL.graphiteAmmoBack,
      }),
  },
  {
    id: "duo-power",
    turret: "duo",
    tier: 4,
    name: "Duo Power",
    blurb:
      "Every duo hits 1% harder for each OTHER duo standing. A hundred of them is a hundred per cent.",
    glyph: "surge",
    cap: 1,
    apply: (s, _n, ctx) => stronger(s, 1 + 0.01 * Math.max(0, ctx.count - 1)),
    // there is no point count to report — what it is worth is the board,
    // and the board is not in scope here. The card says so instead
  },
];

const SCATTER: readonly TurretUpgradeDef[] = [
  {
    id: "scatter-loader",
    turret: "scatter",
    tier: 1,
    name: "Belt Loader",
    blurb: "A shorter cycle between bursts — 4% more flak in the air per point.",
    glyph: "rate",
    cap: 15,
    ...dial(0.04, "attack speed", faster),
  },
  {
    id: "scatter-fuse",
    turret: "scatter",
    tier: 2,
    name: "Proximity Fuse",
    blurb: "The shell goes off further from what set it off, and the blast reaches further still.",
    glyph: "homing",
    cap: 10,
    apply: (s, n) => wider(fusedAt(s, 1 + 0.08 * n), 1 + 0.04 * n),
    effect: (n) => `+${pct(0.08 * n)} fuse range, +${pct(0.04 * n)} blast`,
  },
  {
    id: "scatter-metaglass",
    turret: "scatter",
    tier: 3,
    name: "Metaglass Flak",
    blurb:
      "Metaglass instead of lead: double the damage, half again the blast, and a fuse that trips a third further out.",
    glyph: "damage",
    cap: 1,
    // Mindustry's own metaglass flak is scatter's best ammo — damage 5
    // over lead's 3 and splashDamage 33 over 22. Taken as ratios rather
    // than absolutes, because our scatter's numbers are already scaled
    apply: (s) => fusedAt(wider(stronger(s, 2), 1.15), 1.35),
  },
  {
    id: "scatter-storm",
    turret: "scatter",
    tier: 4,
    name: "Flechette Storm",
    blurb:
      "The flak gun stops being an anti-air gun. Four shells a burst, each bursting again into five flechettes, and every one of them bites the ground as happily as the sky.",
    glyph: "surge",
    cap: 1,
    // THE TRANSFORMATION IS THE TARGET LIST, not the numbers. Scatter is
    // the one turret in the game that cannot touch the ground at all, and
    // an upgrade that hands it the ground hands the player a completely
    // different block to place — which is what a surge alloy is for.
    // Both flags have to move: `targetGround` is what the turret will
    // acquire and `collidesGround` is what its shell will bite
    apply: (s) =>
      then(
        wider(s, 1.25),
        { shots: 4, targetGround: true },
        {
        collidesGround: true,
        frag: {
          count: 5,
          spread: 2 * Math.PI,
          velMin: 0.3,
          velMax: 1,
          offsetMin: 1 * MU,
          offsetMax: 6 * MU,
          bullet: {
            speed: 2.4 * 60 * MU,
            damage: 14,
            lifetime: 16 / 60,
            splash: 0,
            splashRadius: 0,
            collidesAir: true,
            collidesGround: true,
            sprite: {
              region: "bullet",
              across: 8 * MU,
              along: 10 * MU,
              shrinkX: 0,
              shrinkY: 1,
              back: PAL.bulletYellowBack,
              front: PAL.bulletYellow,
            },
            hitFx: FxKind.BulletHit,
            fxColor: PAL.lightOrange,
          },
        },
        },
      ),
  },
];

const ARC: readonly TurretUpgradeDef[] = [
  {
    id: "arc-coils",
    turret: "arc",
    tier: 1,
    name: "Overcharged Coils",
    blurb: "Six per cent more current down the bolt for every point.",
    glyph: "damage",
    cap: 15,
    ...dial(0.06, "damage", stronger),
  },
  {
    id: "arc-reach",
    turret: "arc",
    tier: 2,
    name: "Extended Arcs",
    blurb: "The bolt walks two more nodes per point before it dies — a longer file, further back.",
    glyph: "range",
    cap: 10,
    apply: (s, n) =>
      withBullet(s, {
        lightning: { length: (s.bullet.lightning?.length ?? 0) + 2 * n },
      }),
    effect: (n) => `Bolt walks ${Math.floor(((TOWERS.arc.bullet.lightning?.length ?? 0) + 2 * n) / 2)} nodes`,
  },
  {
    id: "arc-ionised",
    turret: "arc",
    tier: 3,
    name: "Ionised Air",
    blurb: "Charged air carries. The arc reaches a third further and finally jumps to flyers.",
    glyph: "air",
    cap: 1,
    apply: (s) => then(reaching(s, 1.3), { targetAir: true }, { collidesAir: true }),
  },
  {
    id: "arc-cascade",
    turret: "arc",
    tier: 4,
    name: "Tesla Cascade",
    blurb:
      "Three bolts a shot instead of one, each walking twice as far and catching everything within eight units of the nodes it lands on. A lane in front of an arc stops being a lane.",
    glyph: "surge",
    cap: 1,
    apply: (s) =>
      then(
        faster(stronger(s, 1.5), 1.35),
        { shots: 3, spread: (14 * Math.PI) / 180 },
        {
          // the bolt's own catch radius — every node it lands on takes a
          // small cluster with it rather than the one body it touched
          hitRadius: 8 * MU,
          lightning: { length: (s.bullet.lightning?.length ?? 0) * 2 },
        },
      ),
  },
];

const HAIL: readonly TurretUpgradeDef[] = [
  {
    id: "hail-bore",
    turret: "hail",
    tier: 1,
    name: "Rifled Bore",
    blurb: "Four per cent off the reload per point — a shell a second is the ceiling.",
    glyph: "rate",
    cap: 15,
    ...dial(0.04, "attack speed", faster),
  },
  {
    id: "hail-charge",
    turret: "hail",
    tier: 2,
    name: "Bigger Charge",
    blurb: "More propellant behind the shell: the blast widens 5% a point.",
    glyph: "splash",
    cap: 10,
    ...dial(0.05, "blast radius", wider),
  },
  {
    id: "hail-incendiary",
    turret: "hail",
    tier: 3,
    name: "Incendiary Shells",
    blurb:
      "Pyratite in the shell: half again the blast damage, and everything caught in it burns for six seconds.",
    glyph: "burn",
    cap: 1,
    // A STATUS LAID BY A BLAST, which is a thing only this tier of the
    // tree does. An artillery shell arcs OVER its target and never lands a
    // direct hit, so a burn on the bullet would have burned nothing at all
    // until Sim.splash learned to carry the status with the damage
    apply: (s) =>
      withBullet(stronger(s, 1.5), { burn: 6, fxColor: PAL.lightOrange }),
  },
  {
    id: "hail-cluster",
    turret: "hail",
    tier: 4,
    name: "Cluster Munitions",
    blurb:
      "Three shells an arc instead of one, scattered down the lane, each cracking open into six bomblets over what it lands on.",
    glyph: "surge",
    cap: 1,
    apply: (s) =>
      then(
        reaching(s, 1.15),
        { shots: 3, shotDelay: 4 / 60, spread: (5 * Math.PI) / 180 },
        {
        // the roll that turns three shells into a pattern rather than a hole
        lifeScaleRand: [0.8, 1.15] as const,
        frag: {
          count: 6,
          spread: 2 * Math.PI,
          velMin: 0.2,
          velMax: 0.9,
          offsetMin: 1 * MU,
          offsetMax: 8 * MU,
          bullet: {
            speed: 1.6 * 60 * MU,
            damage: 0,
            lifetime: 14 / 60,
            splash: 24,
            splashRadius: 16 * MU,
            collidesAir: false,
            collidesGround: true,
            sprite: {
              region: "shell",
              across: 7 * MU,
              along: 7 * MU,
              shrinkX: 0.5,
              shrinkY: 0.5,
              back: PAL.blastAmmoBack,
              front: PAL.blastAmmoFront,
            },
            hitFx: FxKind.BlastExplosion,
            fxColor: PAL.blastAmmoBack,
          },
        },
        },
      ),
  },
];

const SCORCH: readonly TurretUpgradeDef[] = [
  {
    id: "scorch-pressure",
    turret: "scorch",
    tier: 1,
    name: "Pressure Feed",
    blurb: "Five per cent more reach per point, on the turret whose only real fault is its reach.",
    glyph: "range",
    cap: 15,
    ...dial(0.05, "range", reaching),
  },
  {
    id: "scorch-fuel",
    turret: "scorch",
    tier: 2,
    name: "Rich Fuel",
    blurb: "Six tenths of a second longer burning per point — and burning ignores armour.",
    glyph: "burn",
    cap: 10,
    apply: (s, n) => withBullet(s, { burn: (s.bullet.burn ?? 0) + 0.6 * n }),
    effect: (n) => `Burns for ${((TOWERS.scorch.bullet.burn ?? 0) + 0.6 * n).toFixed(1)}s`,
  },
  {
    id: "scorch-pyratite",
    turret: "scorch",
    tier: 3,
    name: "Pyratite Feed",
    blurb: "Pyratite instead of coal: nearly double the damage and twice as long alight.",
    glyph: "damage",
    cap: 1,
    apply: (s) =>
      withBullet(stronger(s, 1.9), {
        burn: (s.bullet.burn ?? 0) * 2,
        hitRadius: (s.bullet.hitRadius ?? 2.5) * 1.4,
      }),
  },
  {
    id: "scorch-incinerator",
    turret: "scorch",
    tier: 4,
    name: "Incinerator",
    blurb:
      "Two jets instead of one, reaching nearly twice as far — as far as a duo, on the turret that has never reached past its own doorstep — and they climb: the incinerator burns flyers out of the sky.",
    glyph: "surge",
    cap: 1,
    apply: (s) =>
      then(
        stronger(reaching(s, 1.8), 1.5),
        { shots: 2, spread: (9 * Math.PI) / 180, targetAir: true },
        { collidesAir: true },
      ),
  },
];

const SALVO: readonly TurretUpgradeDef[] = [
  {
    id: "salvo-autoload",
    turret: "salvo",
    tier: 1,
    name: "Autoloader",
    blurb: "Four per cent off the wait between volleys per point.",
    glyph: "rate",
    cap: 15,
    ...dial(0.04, "attack speed", faster),
  },
  {
    id: "salvo-pierce",
    turret: "salvo",
    tier: 2,
    name: "Piercing Rounds",
    blurb: "Hardened cores: each point takes one more body out of a file per shell.",
    glyph: "pierce",
    cap: 8,
    apply: (s, n) => piercing(s, n),
    effect: (n) => `Shells punch through ${1 + n} bodies`,
  },
  {
    id: "salvo-pyratite",
    turret: "salvo",
    tier: 3,
    name: "Pyratite Shells",
    blurb: "Half again the damage, and everything a shell touches burns for five seconds.",
    glyph: "burn",
    cap: 1,
    apply: (s) =>
      withBullet(stronger(s, 1.5), {
        burn: 5,
        fxColor: PAL.blastAmmoBack,
        ...(s.bullet.sprite
          ? { sprite: { ...s.bullet.sprite, back: PAL.blastAmmoBack, front: PAL.blastAmmoFront } }
          : null),
      }),
  },
  {
    id: "salvo-missiles",
    turret: "salvo",
    tier: 4,
    name: "Missile Rack",
    blurb:
      "The magazine is repacked with guided warheads: seven a volley, each chasing what it locked and blasting where it lands. Salvo stops being a cannon.",
    glyph: "surge",
    cap: 1,
    apply: (s) =>
      then(
        faster(s, 1.1),
        { shots: 7 },
        {
        damage: s.bullet.damage * 1.1,
        splash: 40,
        splashRadius: 26 * MU,
        homing: { power: ((0.09 * 50 * Math.PI) / 180) * 60, range: 70 * MU },
        hitFx: FxKind.BlastExplosion,
        fxColor: PAL.missileYellowBack,
        ...(s.bullet.sprite
          ? {
              sprite: {
                ...s.bullet.sprite,
                region: "missile" as const,
                back: PAL.missileYellowBack,
                front: PAL.missileYellow,
              },
            }
          : null),
        },
      ),
  },
];

const WAVE: readonly TurretUpgradeDef[] = [
  {
    id: "wave-pump",
    turret: "wave",
    tier: 1,
    name: "High-Pressure Pump",
    blurb: "Four tenths of a second longer soaking per point — a slow that outlives the stream.",
    glyph: "duration",
    cap: 15,
    apply: (s, n) =>
      s.bullet.wet
        ? withBullet(s, { wet: { ...s.bullet.wet, duration: s.bullet.wet.duration + 0.4 * n } })
        : s,
    effect: (n) => `Soaked for ${((TOWERS.wave.bullet.wet?.duration ?? 0) + 0.4 * n).toFixed(1)}s`,
  },
  {
    id: "wave-nozzle",
    turret: "wave",
    tier: 2,
    name: "Wide Nozzle",
    blurb: "Five per cent more reach per point — one wave covering two lanes instead of one.",
    glyph: "range",
    cap: 10,
    ...dial(0.05, "range", reaching),
  },
  {
    id: "wave-cryo",
    turret: "wave",
    tier: 3,
    name: "Cryofluid Mix",
    blurb:
      "Cryofluid in the tank: what it soaks drives at 40% speed rather than 65%, and stays soaked half again as long.",
    glyph: "frost",
    cap: 1,
    apply: (s) =>
      s.bullet.wet
        ? withBullet(s, {
            wet: { duration: s.bullet.wet.duration * 1.5, slow: 0.4 },
            fxColor: PAL.lancerLaser,
          })
        : s,
  },
  {
    id: "wave-flashfreeze",
    turret: "wave",
    tier: 4,
    name: "Flash Freeze",
    blurb:
      "The stream becomes a burst. Three shots a cycle, each detonating into a freezing cloud that soaks everything inside it down to a quarter speed — a wave stops being support and starts stopping waves.",
    glyph: "surge",
    cap: 1,
    // THE SPLASH IS THE POINT: a wave hoses ONE body at a time, and a
    // status the blast carries is the only way a support turret ever
    // catches a crowd (see Sim.splash, which learned to lay burn and wet
    // with its damage for exactly this rung of the tree)
    apply: (s) =>
      then(
        s,
        { shots: 3, spread: (7 * Math.PI) / 180 },
        {
          damage: s.bullet.damage * 15,
          splash: 12,
          splashRadius: 24 * MU,
          wet: { duration: (s.bullet.wet?.duration ?? 2) * 2, slow: 0.25 },
          orb: (s.bullet.orb ?? 3 * MU) * 1.6,
          hitFx: FxKind.HitLiquid,
          fxColor: PAL.lancerLaser,
        },
      ),
  },
];

const LANCER: readonly TurretUpgradeDef[] = [
  {
    id: "lancer-capacitor",
    turret: "lancer",
    tier: 1,
    name: "Capacitor Bank",
    blurb: "Five per cent more charge behind the beam per point.",
    glyph: "damage",
    cap: 15,
    ...dial(0.05, "damage", stronger),
  },
  {
    id: "lancer-lens",
    turret: "lancer",
    tier: 2,
    name: "Focusing Lens",
    blurb: "The beam holds together through one more body per point before it gives out.",
    glyph: "pierce",
    cap: 8,
    apply: (s, n) =>
      s.bullet.laser
        ? withBullet(s, { laser: { ...s.bullet.laser, pierceCap: s.bullet.laser.pierceCap + n } })
        : s,
    effect: (n) => `Beam cuts ${(TOWERS.lancer.bullet.laser?.pierceCap ?? 0) + n} deep`,
  },
  {
    id: "lancer-optics",
    turret: "lancer",
    tier: 3,
    name: "Charged Optics",
    blurb:
      "A faster charge, a heavier beam, and no more quadruple armour: lancer stops being the turret a fortress laughs at.",
    glyph: "beam",
    cap: 1,
    // armorMultiplier 4 is stock lancer's one real weakness — armour
    // counts QUADRUPLE against it, which is why a 140-damage beam does
    // almost nothing to the things that most need hitting. Putting it back
    // to 1 is the largest single number in this file and it is deliberate:
    // this is the rung that is supposed to be worth saving for
    apply: (s) =>
      then(
        s,
        { chargeTime: (s.chargeTime ?? 0) * 0.4 },
        {
          armorMultiplier: 1,
          ...(s.bullet.laser
            ? { laser: { ...s.bullet.laser, width: s.bullet.laser.width * 1.4 } }
            : null),
        },
      ),
  },
  {
    id: "lancer-prism",
    turret: "lancer",
    tier: 4,
    name: "Prism Array",
    blurb:
      "The lens splits the beam three ways, each one cutting six bodies deeper than before, and the array tracks air. One lancer covers a front.",
    glyph: "surge",
    cap: 1,
    apply: (s) =>
      then(
        reaching(stronger(s, 1.35), 1.15),
        { shots: 3, spread: (11 * Math.PI) / 180, targetAir: true },
        {
          collidesAir: true,
          ...(s.bullet.laser
            ? {
                laser: {
                  ...s.bullet.laser,
                  length: s.bullet.laser.length * 1.15,
                  pierceCap: s.bullet.laser.pierceCap + 6,
                },
              }
            : null),
        },
      ),
  },
];

const RIPPLE: readonly TurretUpgradeDef[] = [
  {
    id: "ripple-barrels",
    turret: "ripple",
    tier: 1,
    name: "Long Barrels",
    blurb: "Five per cent further down the lane per point, from the turret that already reaches furthest.",
    glyph: "range",
    cap: 15,
    ...dial(0.05, "range", reaching),
  },
  {
    id: "ripple-frag",
    turret: "ripple",
    tier: 2,
    name: "Fragmentation",
    blurb: "A thinner casing and more of it: the blast widens 5% a point.",
    glyph: "splash",
    cap: 10,
    ...dial(0.05, "blast radius", wider),
  },
  {
    id: "ripple-plastanium",
    turret: "ripple",
    tier: 3,
    name: "Plastanium Shells",
    blurb: "Six shells an arc instead of four, and a third more blast behind each one.",
    glyph: "spread",
    cap: 1,
    apply: (s) =>
      then(
        stronger(s, 1.35),
        { shots: 6 },
        s.bullet.sprite
          ? { sprite: { ...s.bullet.sprite, back: PAL.plastaniumBack, front: PAL.plastaniumFront } }
          : {},
      ),
  },
  {
    id: "ripple-saturation",
    turret: "ripple",
    tier: 4,
    name: "Saturation Barrage",
    blurb:
      "Twice the shells, scattered twice as wide over a longer arc — the lane is not shelled so much as erased. The tubes take a fifth longer to reload, and it does not matter.",
    glyph: "surge",
    cap: 1,
    apply: (s) =>
      then(
        faster(wider(s, 1.15), 1 / 1.2),
        {
          shots: s.shots * 2,
          spread: s.spread + (6 * Math.PI) / 180,
          inaccuracy: s.inaccuracy * 1.5,
        },
        {
          splash: s.bullet.splash * 1.4,
          // a wider roll on the shell's flight time is what turns a volley
          // into a carpet rather than a heap
          lifeScaleRand: [0.65, 1.25] as const,
        },
      ),
  },
];

const PARALLAX: readonly TurretUpgradeDef[] = [
  {
    id: "parallax-field",
    turret: "parallax",
    tier: 1,
    name: "Stronger Field",
    blurb: "Six per cent more pull per point — and the pull is the whole turret.",
    glyph: "homing",
    cap: 15,
    ...dial(0.06, "pull", pulling),
  },
  {
    id: "parallax-aperture",
    turret: "parallax",
    tier: 2,
    name: "Wide Aperture",
    blurb: "Five per cent more reach per point, on the second-longest range in the game.",
    glyph: "range",
    cap: 10,
    ...dial(0.05, "range", reaching),
  },
  {
    id: "parallax-phase",
    turret: "parallax",
    tier: 3,
    name: "Phase Coils",
    blurb:
      "Phase fabric in the emitter: four times the armour-piercing damage and half again the pull. The beam starts killing what it drags.",
    glyph: "damage",
    cap: 1,
    apply: (s) => pulling(stronger(s, 4), 1.6),
  },
  {
    id: "parallax-singularity",
    turret: "parallax",
    tier: 4,
    name: "Singularity",
    blurb:
      "The field stops caring what flies. Ground units are dragged off the lane the same way flyers are, at two and a half times the force — a parallax can hold a push in place while everything else kills it.",
    glyph: "surge",
    cap: 1,
    apply: (s) =>
      then(
        reaching(pulling(stronger(s, 6), 2.5), 1.2),
        { targetGround: true },
        { collidesGround: true },
      ),
  },
];

const FUSE: readonly TurretUpgradeDef[] = [
  {
    id: "fuse-choke",
    turret: "fuse",
    tier: 1,
    name: "Choked Barrels",
    blurb: "Five per cent more behind each ray per point.",
    glyph: "damage",
    cap: 15,
    ...dial(0.05, "damage", stronger),
  },
  {
    id: "fuse-reach",
    turret: "fuse",
    tier: 2,
    name: "Extended Rays",
    blurb: "Five per cent more reach per point, on the shortest range in the game.",
    glyph: "range",
    cap: 10,
    ...dial(0.05, "range", reaching),
  },
  {
    id: "fuse-surge",
    turret: "fuse",
    tier: 3,
    name: "Surge Shot",
    blurb: "Five rays a shot instead of three, spread wider, each a third heavier.",
    glyph: "spread",
    cap: 1,
    apply: (s) => ({ ...stronger(s, 1.3), shots: 5, spread: (16 * Math.PI) / 180 }),
  },
  {
    id: "fuse-annihilator",
    turret: "fuse",
    tier: 4,
    name: "Annihilator",
    blurb:
      "Seven rays across a fifty-degree arc, reaching nearly twice as far, and armour stops counting. Nothing walks into a fuse's cone twice.",
    glyph: "surge",
    cap: 1,
    // THE RANGE IS THE RESTRAINT HERE, not the damage. Fuse already does
    // more damage a second than anything below the phase tier; what stops
    // it being the only turret worth owning is that it has to be stood in
    // front of. Nearly doubling that (and the dial above it does the rest)
    // is a transformation; tripling it would have been a replacement for
    // the whole roster
    apply: (s) =>
      then(
        stronger(reaching(s, 1.7), 1.7),
        { shots: 7, spread: (50 * Math.PI) / 180 },
        { pierceArmor: true },
      ),
  },
];

const SWARMER: readonly TurretUpgradeDef[] = [
  {
    id: "swarmer-fins",
    turret: "swarmer",
    tier: 1,
    name: "Guidance Fins",
    blurb: "Eight per cent tighter turns and a wider lock per point — fewer missiles wasted on air.",
    glyph: "homing",
    cap: 15,
    apply: (s, n) =>
      s.bullet.homing
        ? withBullet(s, {
            homing: {
              power: s.bullet.homing.power * (1 + 0.08 * n),
              range: s.bullet.homing.range * (1 + 0.04 * n),
            },
          })
        : s,
    effect: (n) => `+${pct(0.08 * n)} turn, +${pct(0.04 * n)} lock`,
  },
  {
    id: "swarmer-racks",
    turret: "swarmer",
    tier: 2,
    name: "Missile Racks",
    blurb: "Four per cent off the reload per point.",
    glyph: "rate",
    cap: 10,
    ...dial(0.04, "attack speed", faster),
  },
  {
    id: "swarmer-warheads",
    turret: "swarmer",
    tier: 3,
    name: "Surge Warheads",
    blurb: "Six missiles a volley, each with half again the blast over a third more ground.",
    glyph: "splash",
    cap: 1,
    apply: (s) => then(wider(s, 1.3), { shots: 6 }, { splash: s.bullet.splash * 1.6 }),
  },
  {
    id: "swarmer-doctrine",
    turret: "swarmer",
    tier: 4,
    name: "Swarm Doctrine",
    blurb:
      "Twice the missiles, a lock two and a half times as wide, and each warhead throws three more of itself where it lands. The sky fills up.",
    glyph: "surge",
    cap: 1,
    apply: (s) =>
      then(
        s,
        { shots: s.shots * 2 },
        {
        ...(s.bullet.homing
          ? {
              homing: {
                power: s.bullet.homing.power * 1.6,
                range: s.bullet.homing.range * 2.5,
              },
            }
          : null),
        frag: {
          count: 3,
          spread: 2 * Math.PI,
          velMin: 0.3,
          velMax: 1,
          offsetMin: 2 * MU,
          offsetMax: 8 * MU,
          bullet: {
            speed: 2.2 * 60 * MU,
            damage: 8,
            lifetime: 22 / 60,
            splash: 18,
            splashRadius: 18 * MU,
            collidesAir: true,
            collidesGround: true,
            homing: { power: ((0.08 * 50 * Math.PI) / 180) * 60, range: 60 * MU },
            sprite: {
              region: "missile",
              across: 6 * MU,
              along: 8 * MU,
              shrinkX: 0,
              shrinkY: 0.5,
              back: PAL.missileYellowBack,
              front: PAL.missileYellow,
            },
            hitFx: FxKind.BlastExplosion,
            fxColor: PAL.missileYellowBack,
          },
        },
        },
      ),
  },
];

const CYCLONE: readonly TurretUpgradeDef[] = [
  {
    id: "cyclone-belt",
    turret: "cyclone",
    tier: 1,
    name: "Belt Feed",
    blurb: "Four per cent off the cycle per point, on a gun that already never stops.",
    glyph: "rate",
    cap: 15,
    ...dial(0.04, "attack speed", faster),
  },
  {
    id: "cyclone-fuse",
    turret: "cyclone",
    tier: 2,
    name: "Proximity Fuse",
    blurb: "The shell trips six per cent further from what set it off per point.",
    glyph: "homing",
    cap: 10,
    ...dial(0.06, "fuse range", fusedAt),
  },
  {
    id: "cyclone-surge",
    turret: "cyclone",
    tier: 3,
    name: "Surge Rounds",
    blurb:
      "Surge alloy in the casing: half again the blast, a third more on the hit, and ten fragments out of every shell instead of six.",
    glyph: "splash",
    cap: 1,
    apply: (s) =>
      withBullet(stronger(s, 1.3), {
        splash: s.bullet.splash * 1.5,
        ...(s.bullet.frag ? { frag: { ...s.bullet.frag, count: 10 } } : null),
      }),
  },
  {
    id: "cyclone-storm",
    turret: "cyclone",
    tier: 4,
    name: "Flak Storm",
    blurb:
      "Three shells at once, tripping almost twice as far out, and every fragment carries its own blast. A cyclone stops being a gun and becomes weather.",
    glyph: "surge",
    cap: 1,
    apply: (s) =>
      then(
        wider(fusedAt(s, 1.8), 1.35),
        { shots: 3, shotDelay: 3 / 60 },
        {
        ...(s.bullet.frag
          ? {
              frag: {
                ...s.bullet.frag,
                count: s.bullet.frag.count * 2,
                bullet: {
                  ...s.bullet.frag.bullet,
                  splash: 22,
                  splashRadius: 16 * MU,
                  hitFx: FxKind.PlasticExplosion,
                },
              },
            }
          : null),
        },
      ),
  },
];

const TSUNAMI: readonly TurretUpgradeDef[] = [
  {
    id: "tsunami-chamber",
    turret: "tsunami",
    tier: 1,
    name: "Pressure Chamber",
    blurb: "Six tenths of a second longer under the umbrella per point.",
    glyph: "duration",
    cap: 15,
    apply: (s, n) =>
      s.bullet.wet
        ? withBullet(s, { wet: { ...s.bullet.wet, duration: s.bullet.wet.duration + 0.6 * n } })
        : s,
    effect: (n) => `Soaked for ${((TOWERS.tsunami.bullet.wet?.duration ?? 0) + 0.6 * n).toFixed(1)}s`,
  },
  {
    id: "tsunami-spray",
    turret: "tsunami",
    tier: 2,
    name: "Wide Spray",
    blurb: "Five per cent more umbrella per point.",
    glyph: "range",
    cap: 10,
    ...dial(0.05, "range", reaching),
  },
  {
    id: "tsunami-cryo",
    turret: "tsunami",
    tier: 3,
    name: "Cryofluid Mix",
    blurb: "Cryofluid in the tank: what it soaks drives at a quarter speed rather than 45%.",
    glyph: "frost",
    cap: 1,
    apply: (s) =>
      s.bullet.wet
        ? withBullet(s, {
            wet: { duration: s.bullet.wet.duration * 1.4, slow: 0.25 },
            fxColor: PAL.lancerLaser,
          })
        : s,
  },
  {
    id: "tsunami-zero",
    turret: "tsunami",
    tier: 4,
    name: "Absolute Zero",
    blurb:
      "Four jets, each bursting into a freezing cloud that all but stops what it catches — a tenth of drive speed, for twice as long, over a crowd rather than a body. Nothing crosses a tsunami's umbrella under its own power again.",
    glyph: "surge",
    cap: 1,
    apply: (s) =>
      then(
        s,
        { shots: 4, spread: (8 * Math.PI) / 180 },
        {
          damage: s.bullet.damage * 40,
          splash: 25,
          splashRadius: 30 * MU,
          wet: { duration: (s.bullet.wet?.duration ?? 4) * 2, slow: 0.1 },
          orb: (s.bullet.orb ?? 4 * MU) * 1.5,
          hitFx: FxKind.HitLiquid,
          fxColor: PAL.lancerLaser,
        },
      ),
  },
];

const SPECTRE: readonly TurretUpgradeDef[] = [
  {
    id: "spectre-cooling",
    turret: "spectre",
    tier: 1,
    name: "Cooling Jacket",
    blurb: "Four per cent off the cycle per point, on the highest sustained damage in the game.",
    glyph: "rate",
    cap: 15,
    ...dial(0.04, "attack speed", faster),
  },
  {
    id: "spectre-cores",
    turret: "spectre",
    tier: 2,
    name: "Hardened Cores",
    blurb: "Five per cent more shell per point.",
    glyph: "damage",
    cap: 10,
    ...dial(0.05, "damage", stronger),
  },
  {
    id: "spectre-surge",
    turret: "spectre",
    tier: 3,
    name: "Surge Shells",
    blurb:
      "A third more damage, five bodies to a shell instead of two, and armour stops counting at all.",
    glyph: "pierce",
    cap: 1,
    apply: (s) =>
      withBullet(stronger(s, 1.35), { pierce: true, pierceCap: 5, pierceArmor: true }),
  },
  {
    id: "spectre-siege",
    turret: "spectre",
    tier: 4,
    name: "Siege Battery",
    blurb:
      "Four barrels instead of two, three shells a volley, and each one detonates where it finally stops. A spectre becomes a siege gun that flattens what it does not punch through.",
    glyph: "surge",
    cap: 1,
    apply: (s) =>
      then(
        reaching(stronger(s, 1.4), 1.2),
        {
          shots: 3,
          shotDelay: 4 / 60,
          barrels: { count: 4, spread: (s.barrels?.spread ?? 8 * MU) * 0.8 },
        },
        {
          splash: 60,
          splashRadius: 26 * MU,
          knockback: (s.bullet.knockback ?? 0) * 2,
          hitFx: FxKind.BlastExplosion,
        },
      ),
  },
];

const MELTDOWN: readonly TurretUpgradeDef[] = [
  {
    id: "meltdown-loop",
    turret: "meltdown",
    tier: 1,
    name: "Coolant Loop",
    blurb: "Five per cent less cooling between beams per point.",
    glyph: "rate",
    cap: 15,
    ...dial(0.05, "cooling speed", faster),
  },
  {
    id: "meltdown-array",
    turret: "meltdown",
    tier: 2,
    name: "Focusing Array",
    blurb: "Five per cent more energy in the beam per point.",
    glyph: "damage",
    cap: 10,
    ...dial(0.05, "damage", stronger),
  },
  {
    id: "meltdown-phase",
    turret: "meltdown",
    tier: 3,
    name: "Phase Lens",
    blurb:
      "A third more reach, and the beam bites every three and a half ticks rather than every five.",
    glyph: "beam",
    cap: 1,
    apply: (s) => {
      const lens = reaching(s, 1.35);
      return lens.bullet.continuous
        ? then(lens, {}, {
            continuous: {
              ...lens.bullet.continuous,
              damageInterval: lens.bullet.continuous.damageInterval * 0.7,
            },
          })
        : lens;
    },
  },
  {
    id: "meltdown-fusion",
    turret: "meltdown",
    tier: 4,
    name: "Sustained Fusion",
    blurb:
      "The beam burns three times as long, cools in a third of the time and tracks at full speed while lit. In practice a meltdown that has anything to point at never stops pointing at it.",
    glyph: "surge",
    cap: 1,
    apply: (s) => {
      const hot = faster(stronger(reaching(s, 1.15), 1.5), 1 / 0.35);
      return hot.bullet.continuous
        ? then(hot, {}, {
            continuous: { ...hot.bullet.continuous, duration: hot.bullet.continuous.duration * 3, moveFract: 1 },
          })
        : hot;
    },
  },
];

const FORESHADOW: readonly TurretUpgradeDef[] = [
  {
    id: "foreshadow-caps",
    turret: "foreshadow",
    tier: 1,
    name: "Rail Capacitors",
    blurb: "Five per cent more budget behind the rail per point — and the budget IS the shot.",
    glyph: "damage",
    cap: 15,
    ...dial(0.05, "damage", stronger),
  },
  {
    id: "foreshadow-servos",
    turret: "foreshadow",
    tier: 2,
    name: "Servo Motors",
    blurb:
      "Fifteen per cent faster on the turntable per point, and a degree more slack in the cone — the rail commits less and fires more.",
    glyph: "spread",
    cap: 10,
    apply: (s, n) => ({
      ...s,
      rotateSpeed: s.rotateSpeed * (1 + 0.15 * n),
      shootCone: s.shootCone + ((1 * Math.PI) / 180) * n,
    }),
    effect: (n) => `+${pct(0.15 * n)} traverse, ${2 + n}° cone`,
  },
  {
    id: "foreshadow-surge",
    turret: "foreshadow",
    tier: 3,
    name: "Surge Rail",
    blurb: "A third more budget a shot, fired in six tenths of the time.",
    glyph: "rate",
    cap: 1,
    apply: (s) => faster(stronger(s, 1.3), 1 / 0.6),
  },
  {
    id: "foreshadow-orbital",
    turret: "foreshadow",
    tier: 4,
    name: "Orbital Strike",
    blurb:
      "Half again the range — far enough to shell a spawn pad from behind the core — two rails a shot, and two and a half times the health pool deleted by each one.",
    glyph: "surge",
    cap: 1,
    apply: (s) => ({
      ...faster(stronger(reaching(s, 1.5), 2.4), 1 / 1.15),
      shots: 2,
      shotDelay: 10 / 60,
    }),
  },
];

/**
 * THE TABLE. Four rungs per turret, in tier order — the order they are
 * bought in, because each one requires the one above it (see tech.ts).
 */
export const TURRET_UPGRADES: Record<TowerKind, readonly TurretUpgradeDef[]> = {
  duo: DUO,
  scatter: SCATTER,
  arc: ARC,
  hail: HAIL,
  scorch: SCORCH,
  salvo: SALVO,
  wave: WAVE,
  lancer: LANCER,
  ripple: RIPPLE,
  parallax: PARALLAX,
  fuse: FUSE,
  swarmer: SWARMER,
  cyclone: CYCLONE,
  tsunami: TSUNAMI,
  spectre: SPECTRE,
  meltdown: MELTDOWN,
  foreshadow: FORESHADOW,
};

/** every upgrade def, flat — what tech.ts turns into nodes */
export const ALL_UPGRADES: readonly TurretUpgradeDef[] = TOWER_KINDS.flatMap(
  (k) => TURRET_UPGRADES[k],
);

const BY_ID = new Map<string, TurretUpgradeDef>(ALL_UPGRADES.map((u) => [u.id, u]));

/** the def behind one upgrade node id */
export function upgradeDef(id: UpgradeKind): TurretUpgradeDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`"${id}" is not a turret upgrade`);
  return def;
}

/** the rung above this one, or null for a tier-1 node — the tree's edges */
export function upgradeParent(id: UpgradeKind): UpgradeKind | null {
  const def = upgradeDef(id);
  return def.tier <= 1 ? null : TURRET_UPGRADES[def.turret][def.tier - 2].id;
}

/** points per rung, tier 1 first — the shape the sim and the tree both hold */
export type UpgradePoints = readonly number[];

/** nothing bought: what a stock turret plays with */
export const NO_UPGRADES: UpgradePoints = [0, 0, 0, 0];

/** does this spread of points change the turret at all? */
export const hasUpgrades = (p: UpgradePoints): boolean => p.some((n) => n > 0);

/**
 * THE UPGRADED TURRET, as one TowerStats the sim can use in place of the
 * stock one.
 *
 * The rungs are folded in TIER ORDER and each one takes the stats the one
 * before it produced, which is what lets a later rung read what an earlier
 * one wrote — the ultimate that doubles a shell count doubles the count
 * rung three already raised. It also means the order is part of the
 * design: swapping two rungs would change the arithmetic, not just the
 * reading order.
 *
 * A turret with nothing bought returns the SHARED stock object, so a save
 * that has bought none of this pays nothing at all for the branch existing.
 */
export function upgradedTower(
  kind: TowerKind,
  points: UpgradePoints,
  ctx: UpgradeContext,
): TowerStats {
  const stock = TOWERS[kind];
  if (!hasUpgrades(points)) return stock;
  const rungs = TURRET_UPGRADES[kind];
  let s = stock;
  for (let i = 0; i < rungs.length; i++) {
    const n = Math.max(0, Math.floor(points[i] ?? 0));
    if (n > 0) s = rungs[i].apply(s, n, ctx);
  }
  return s;
}
