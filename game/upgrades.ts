import { MU, PAL, TOWERS, type BulletStats, type TowerStats } from "./constants";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * THE TURRET UPGRADE BRANCHES — a chain of nodes hanging off every turret
 * in the tree, and the part of the tech tree whose points buy neither a
 * turret nor a switch but STATS, applied to every turret of that kind
 * standing on the board at once.
 *
 * EVERY RUNG IS BOUGHT ONCE. The tree is paid in SKILL POINTS now — one a
 * player level (economy.ts), a few dozen over a whole campaign — so a rung
 * is a single click that does its whole job, never a dial of a hundred
 * half-per-cent stops. The shape of a branch is the contract this file is
 * written to:
 *
 *   1  a solid multiplier on one axis — rate, damage, range, pull. One
 *      point, and the turret is noticeably better at what it already does.
 *   2  a second step on a DIFFERENT axis, so the two never compete for the
 *      same number. One point.
 *   3  a one-shot that is genuinely good: an ammunition swap, a doubling,
 *      a capability the stock turret does not have. Two points (see
 *      AMMO_POINTS in tech.ts).
 *   4  THE ULTIMATE. Three points and a level gate, and it does not
 *      improve the turret so much as replace it.
 *
 * ONLY DUO AND ARC SHIP A FOURTH RUNG TODAY, and the other fifteen are
 * deliberately unwritten rather than missing: an ultimate is a turret
 * REPLACED, which is a design decision per turret and not a formula, so
 * they are authored by hand and land here when they are ready. Writing one
 * is adding a fourth entry to a branch below with `tier: ULTIMATE_TIER`
 * and its id in UPGRADE_KINDS. Nothing else has to change.
 *
 * A BRANCH IS THEREFORE NOT A FIXED LENGTH. Read it as an array; do not
 * assume four. `tier` says which rung a def is, and ULTIMATE_TIER is what
 * makes one the ultimate — never its index.
 *
 * WHY STATS AND NOT MORE TURRETS. A tech tree that only ever sells the
 * NEXT turret asks the player to abandon what they have every time they
 * climb a stage — the duos that carried the first ten waves are dead
 * weight by wave thirty. These branches are the other offer: keep what
 * works and make it worth keeping. A maxed duo line and a bare salvo are a
 * real choice, which is the whole point — and in-run, where every turret
 * costs scrap, an upgraded cheap turret is a cheaper answer.
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
  "arc-coils",
  "arc-reach",
  "arc-ionised",
  "arc-cascade",
  "hail-bore",
  "hail-charge",
  "hail-incendiary",
  "scorch-pressure",
  "scorch-fuel",
  "scorch-pyratite",
  "salvo-autoload",
  "salvo-pierce",
  "salvo-pyratite",
  "wave-pump",
  "wave-nozzle",
  "wave-cryo",
  "lancer-capacitor",
  "lancer-lens",
  "lancer-optics",
  "ripple-barrels",
  "ripple-frag",
  "ripple-plastanium",
  "parallax-field",
  "parallax-aperture",
  "parallax-phase",
  "fuse-choke",
  "fuse-reach",
  "fuse-surge",
  "swarmer-fins",
  "swarmer-racks",
  "swarmer-warheads",
  "cyclone-belt",
  "cyclone-fuse",
  "cyclone-surge",
  "tsunami-chamber",
  "tsunami-spray",
  "tsunami-cryo",
  "spectre-cooling",
  "spectre-bases",
  "spectre-surge",
  "meltdown-loop",
  "meltdown-array",
  "meltdown-phase",
  "foreshadow-caps",
  "foreshadow-servos",
  "foreshadow-surge",
] as const;
export type UpgradeKind = (typeof UPGRADE_KINDS)[number];

const UPGRADE_SET: ReadonlySet<string> = new Set<string>(UPGRADE_KINDS);

/** is this node one of the turret upgrade branches? */
export const isUpgradeNode = (id: string): id is UpgradeKind => UPGRADE_SET.has(id);

/**
 * THE TIER NUMBER AN ULTIMATE CARRIES. A branch's rungs are numbered from
 * one, so `tier === ULTIMATE_TIER` is what makes a rung the ultimate —
 * and that is a property of the RUNG, not of its position in the array,
 * because most branches do not have one yet (see the note at the top of
 * the file). A branch's real length is its array's own.
 */
export const ULTIMATE_TIER = 4;

/** the tier of the one-shot ammunition rung — the two-point one */
export const AMMO_TIER = 3;

/** the most rungs any one branch holds — what the tree's chain sizes to */
export const MAX_RUNGS = ULTIMATE_TIER;

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

/** the chip face an upgrade wears — kept on the rung for whatever draws it next */
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
  /** the upgraded stats, given the board it stands on */
  apply: (s: TowerStats, ctx: UpgradeContext) => TowerStats;
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
export const faster = (s: TowerStats, mul: number): TowerStats => ({ ...s, reload: s.reload / mul });

/**
 * Damage, and the splash that goes with it. A shell's blast and its direct
 * hit are the same round doing the same thing, so a damage node that moved
 * only one of them would read as broken on exactly the turrets — hail,
 * ripple, scatter — whose damage IS the blast.
 */
export const stronger = (s: TowerStats, mul: number): TowerStats =>
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
export const reaching = (s: TowerStats, mul: number): TowerStats => {
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

/** a lock beam's SPOOL: how long it takes to reach full power (`faster`,
 *  a multiplier on the rate) and how much power that is (`peak`, added to
 *  the multiplier at the top of the ramp). Neither touches `damage` — the
 *  cold beam is what `stronger` moves */
const spooling = (
  s: TowerStats,
  { faster = 1, peak = 0 }: { faster?: number; peak?: number },
): TowerStats =>
  s.bullet.lock
    ? withBullet(s, {
        lock: {
          spool: s.bullet.lock.spool / faster,
          peak: s.bullet.lock.peak + peak,
        },
      })
    : s;

/** PLATING, added flat — armour is a shave per hit and never a multiplier,
 *  so "+6 armour" means the same six on a duo as on a spectre */
export const armored = (s: TowerStats, add: number): TowerStats => ({ ...s, armor: s.armor + add });

/** turn a shot into a piercing one, or raise the cap on one that already is */
export const piercing = (s: TowerStats, extra: number): TowerStats =>
  withBullet(s, {
    pierce: true,
    pierceCap: (s.bullet.pierceCap ?? 1) + extra,
  });

/** a longer soak, on the two liquid turrets */
const soaking = (s: TowerStats, extraSeconds: number): TowerStats =>
  s.bullet.wet
    ? withBullet(s, { wet: { ...s.bullet.wet, duration: s.bullet.wet.duration + extraSeconds } })
    : s;

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

// ---------------------------------------------------------------------------
// THE BRANCHES
// ---------------------------------------------------------------------------

const DUO: readonly TurretUpgradeDef[] = [
  {
    id: "duo-rof",
    turret: "duo",
    tier: 1,
    name: "Rate of Fire",
    blurb: "+50% attack speed.",
    glyph: "rate",
    apply: (s) => faster(s, 1.5),
  },
  {
    id: "duo-pierce",
    turret: "duo",
    tier: 2,
    name: "Pierce",
    blurb: "Shots punch through 3 bodies instead of stopping at the first.",
    glyph: "pierce",
    // PIERCE IS A CAP, NOT A FLAG. A stock duo bullet has no `pierce` at
    // all, which the sim reads as "spent on the first body". Two extra
    // bodies makes a cap of three, and the cap keeps a shot from running
    // its whole lifetime down a lane
    apply: (s) => piercing(s, 2),
  },
  {
    id: "duo-graphite",
    turret: "duo",
    tier: 3,
    name: "Graphite Rounds",
    blurb: "Loads graphite instead of copper: 9 damage a shot becomes 18.",
    glyph: "damage",
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
    blurb: "+1% damage for every OTHER duo standing. A hundred duos is +99% damage each.",
    glyph: "surge",
    apply: (s, ctx) => stronger(s, 1 + 0.01 * Math.max(0, ctx.count - 1)),
  },
];

const SCATTER: readonly TurretUpgradeDef[] = [
  {
    id: "scatter-loader",
    turret: "scatter",
    tier: 1,
    name: "Belt Loader",
    blurb: "+40% attack speed.",
    glyph: "rate",
    apply: (s) => faster(s, 1.4),
  },
  {
    id: "scatter-fuse",
    turret: "scatter",
    tier: 2,
    name: "Proximity Fuse",
    blurb: "+50% fuse range and +25% blast radius.",
    glyph: "homing",
    apply: (s) => wider(fusedAt(s, 1.5), 1.25),
  },
  {
    id: "scatter-metaglass",
    turret: "scatter",
    tier: 3,
    name: "Metaglass Flak",
    blurb: "Loads metaglass instead of lead: +100% damage, +15% blast radius, +35% fuse range.",
    glyph: "damage",
    // Mindustry's own metaglass flak is scatter's best ammo — damage 5
    // over lead's 3 and splashDamage 33 over 22. Taken as ratios rather
    // than absolutes, because our scatter's numbers are already scaled
    apply: (s) => fusedAt(wider(stronger(s, 2), 1.15), 1.35),
  },
];

const ARC: readonly TurretUpgradeDef[] = [
  {
    id: "arc-coils",
    turret: "arc",
    tier: 1,
    name: "Overcharged Coils",
    blurb: "+50% damage.",
    glyph: "damage",
    apply: (s) => stronger(s, 1.5),
  },
  {
    id: "arc-reach",
    turret: "arc",
    tier: 2,
    name: "Extended Arcs",
    blurb: "The bolt jumps to 4 more bodies before it dies.",
    glyph: "range",
    // a lightning length is two per node walked
    apply: (s) =>
      withBullet(s, {
        lightning: { length: (s.bullet.lightning?.length ?? 0) + 8 },
      }),
  },
  {
    id: "arc-ionised",
    turret: "arc",
    tier: 3,
    name: "Ionised Air",
    blurb: "+30% range, and the arc can hit air units.",
    glyph: "air",
    apply: (s) => then(reaching(s, 1.3), { targetAir: true }, { collidesAir: true }),
  },
  {
    id: "arc-cascade",
    turret: "arc",
    tier: 4,
    name: "Tesla Cascade",
    blurb:
      "3 bolts a shot instead of 1: +50% damage, +35% attack speed, each bolt chains twice as far, and every node it lands on hits everything within 8 units.",
    glyph: "surge",
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
    blurb: "+40% attack speed.",
    glyph: "rate",
    apply: (s) => faster(s, 1.4),
  },
  {
    id: "hail-charge",
    turret: "hail",
    tier: 2,
    name: "Bigger Charge",
    blurb: "+30% blast radius.",
    glyph: "splash",
    apply: (s) => wider(s, 1.3),
  },
  {
    id: "hail-incendiary",
    turret: "hail",
    tier: 3,
    name: "Incendiary Shells",
    blurb:
      "Loads pyratite shells: +50% damage, and everything caught in the blast burns for 6s. Burning ignores armour.",
    glyph: "burn",
    // A STATUS LAID BY A BLAST, which is a thing only this tier of the
    // tree does. An artillery shell arcs OVER its target and never lands a
    // direct hit, so a burn on the bullet would have burned nothing at all
    // until Sim.splash learned to carry the status with the damage
    apply: (s) => withBullet(stronger(s, 1.5), { burn: 6, fxColor: PAL.lightOrange }),
  },
];

const SCORCH: readonly TurretUpgradeDef[] = [
  {
    id: "scorch-pressure",
    turret: "scorch",
    tier: 1,
    name: "Pressure Feed",
    blurb: "+40% range.",
    glyph: "range",
    apply: (s) => reaching(s, 1.4),
  },
  {
    id: "scorch-fuel",
    turret: "scorch",
    tier: 2,
    name: "Rich Fuel",
    blurb: "Burns for 3s longer. Burning ignores armour.",
    glyph: "burn",
    apply: (s) => withBullet(s, { burn: (s.bullet.burn ?? 0) + 3 }),
  },
  {
    id: "scorch-pyratite",
    turret: "scorch",
    tier: 3,
    name: "Pyratite Feed",
    blurb: "Burns pyratite instead of coal: +90% damage, double burn duration, +40% flame radius.",
    glyph: "damage",
    apply: (s) =>
      withBullet(stronger(s, 1.9), {
        burn: (s.bullet.burn ?? 0) * 2,
        hitRadius: (s.bullet.hitRadius ?? 2.5) * 1.4,
      }),
  },
];

const SALVO: readonly TurretUpgradeDef[] = [
  {
    id: "salvo-autoload",
    turret: "salvo",
    tier: 1,
    name: "Autoloader",
    blurb: "+40% attack speed.",
    glyph: "rate",
    apply: (s) => faster(s, 1.4),
  },
  {
    id: "salvo-pierce",
    turret: "salvo",
    tier: 2,
    name: "Piercing Rounds",
    blurb: "Each shell takes 2 more bodies out of a file.",
    glyph: "pierce",
    apply: (s) => piercing(s, 2),
  },
  {
    id: "salvo-pyratite",
    turret: "salvo",
    tier: 3,
    name: "Pyratite Shells",
    blurb: "Loads pyratite shells: +50% damage, and anything a shell touches burns for 5s.",
    glyph: "burn",
    apply: (s) =>
      withBullet(stronger(s, 1.5), {
        burn: 5,
        fxColor: PAL.blastAmmoBack,
        ...(s.bullet.sprite
          ? { sprite: { ...s.bullet.sprite, back: PAL.blastAmmoBack, front: PAL.blastAmmoFront } }
          : null),
      }),
  },
];

const WAVE: readonly TurretUpgradeDef[] = [
  {
    id: "wave-pump",
    turret: "wave",
    tier: 1,
    name: "High-Pressure Pump",
    blurb: "Soaked enemies stay slowed 3s longer.",
    glyph: "duration",
    apply: (s) => soaking(s, 3),
  },
  {
    id: "wave-nozzle",
    turret: "wave",
    tier: 2,
    name: "Wide Nozzle",
    blurb: "+30% range.",
    glyph: "range",
    apply: (s) => reaching(s, 1.3),
  },
  {
    id: "wave-cryo",
    turret: "wave",
    tier: 3,
    name: "Cryofluid Mix",
    blurb:
      "Uses cryofluid instead of water: soaked enemies move at 40% speed rather than 65%, and stay soaked 50% longer.",
    glyph: "frost",
    apply: (s) =>
      s.bullet.wet
        ? withBullet(s, {
            wet: { duration: s.bullet.wet.duration * 1.5, slow: 0.4 },
            fxColor: PAL.lancerLaser,
          })
        : s,
  },
];

const LANCER: readonly TurretUpgradeDef[] = [
  {
    id: "lancer-capacitor",
    turret: "lancer",
    tier: 1,
    name: "Capacitor Bank",
    blurb: "+50% damage.",
    glyph: "damage",
    apply: (s) => stronger(s, 1.5),
  },
  {
    id: "lancer-lens",
    turret: "lancer",
    tier: 2,
    name: "Focusing Lens",
    blurb: "The beam holds through 3 more bodies.",
    glyph: "pierce",
    apply: (s) =>
      s.bullet.laser
        ? withBullet(s, { laser: { ...s.bullet.laser, pierceCap: s.bullet.laser.pierceCap + 3 } })
        : s,
  },
  {
    id: "lancer-optics",
    turret: "lancer",
    tier: 3,
    name: "Charged Optics",
    blurb: "Armour stops counting quadruple against the beam: −60% charge time, +40% beam width.",
    glyph: "beam",
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
];

const RIPPLE: readonly TurretUpgradeDef[] = [
  {
    id: "ripple-barrels",
    turret: "ripple",
    tier: 1,
    name: "Long Barrels",
    blurb: "+40% range.",
    glyph: "range",
    apply: (s) => reaching(s, 1.4),
  },
  {
    id: "ripple-frag",
    turret: "ripple",
    tier: 2,
    name: "Fragmentation",
    blurb: "+30% blast radius.",
    glyph: "splash",
    apply: (s) => wider(s, 1.3),
  },
  {
    id: "ripple-plastanium",
    turret: "ripple",
    tier: 3,
    name: "Plastanium Shells",
    blurb: "Loads plastanium shells: 6 shells an arc instead of 4, +35% damage.",
    glyph: "spread",
    apply: (s) =>
      then(
        stronger(s, 1.35),
        { shots: 6 },
        s.bullet.sprite
          ? { sprite: { ...s.bullet.sprite, back: PAL.plastaniumBack, front: PAL.plastaniumFront } }
          : {},
      ),
  },
];

// the ramp is what parallax IS, so its branch buys the ramp: a hotter
// beam at both ends, then reach, then the spool itself. Nothing here may
// take the fully-upgraded beam anywhere near foreshadow's rail — the top
// rung lands it at 405 damage a second against ONE body, where an
// upgraded foreshadow spends better than four times that on a queue
const PARALLAX: readonly TurretUpgradeDef[] = [
  {
    id: "parallax-field",
    turret: "parallax",
    tier: 1,
    name: "Focused Emitter",
    blurb: "+50% beam damage, cold and fully spooled alike.",
    glyph: "damage",
    apply: (s) => stronger(s, 1.5),
  },
  {
    id: "parallax-aperture",
    turret: "parallax",
    tier: 2,
    name: "Wide Aperture",
    blurb: "+30% range.",
    glyph: "range",
    apply: (s) => reaching(s, 1.3),
  },
  {
    id: "parallax-phase",
    turret: "parallax",
    tier: 3,
    name: "Phase Coils",
    blurb: "Phase fabric in the emitter: the beam spools twice as fast and burns up to 9x the cold beam.",
    glyph: "beam",
    apply: (s) => spooling(s, { faster: 2, peak: 2 }),
  },
];

const FUSE: readonly TurretUpgradeDef[] = [
  {
    id: "fuse-choke",
    turret: "fuse",
    tier: 1,
    name: "Choked Barrels",
    blurb: "+50% damage.",
    glyph: "damage",
    apply: (s) => stronger(s, 1.5),
  },
  {
    id: "fuse-reach",
    turret: "fuse",
    tier: 2,
    name: "Extended Rays",
    blurb: "+30% range.",
    glyph: "range",
    apply: (s) => reaching(s, 1.3),
  },
  {
    id: "fuse-surge",
    turret: "fuse",
    tier: 3,
    name: "Surge Shot",
    blurb: "5 rays a shot instead of 3: +30% damage, and a wider spread.",
    glyph: "spread",
    apply: (s) => ({ ...stronger(s, 1.3), shots: 5, spread: (16 * Math.PI) / 180 }),
  },
];

const SWARMER: readonly TurretUpgradeDef[] = [
  {
    id: "swarmer-fins",
    turret: "swarmer",
    tier: 1,
    name: "Guidance Fins",
    blurb: "+60% missile turn rate and +30% lock range.",
    glyph: "homing",
    apply: (s) =>
      s.bullet.homing
        ? withBullet(s, {
            homing: {
              power: s.bullet.homing.power * 1.6,
              range: s.bullet.homing.range * 1.3,
            },
          })
        : s,
  },
  {
    id: "swarmer-racks",
    turret: "swarmer",
    tier: 2,
    name: "Missile Racks",
    blurb: "+30% attack speed.",
    glyph: "rate",
    apply: (s) => faster(s, 1.3),
  },
  {
    id: "swarmer-warheads",
    turret: "swarmer",
    tier: 3,
    name: "Surge Warheads",
    blurb: "6 missiles a volley instead of 4: +60% splash damage, +30% blast radius.",
    glyph: "splash",
    apply: (s) => then(wider(s, 1.3), { shots: 6 }, { splash: s.bullet.splash * 1.6 }),
  },
];

const CYCLONE: readonly TurretUpgradeDef[] = [
  {
    id: "cyclone-belt",
    turret: "cyclone",
    tier: 1,
    name: "Belt Feed",
    blurb: "+40% attack speed.",
    glyph: "rate",
    apply: (s) => faster(s, 1.4),
  },
  {
    id: "cyclone-fuse",
    turret: "cyclone",
    tier: 2,
    name: "Proximity Fuse",
    blurb: "+40% fuse range.",
    glyph: "homing",
    apply: (s) => fusedAt(s, 1.4),
  },
  {
    id: "cyclone-surge",
    turret: "cyclone",
    tier: 3,
    name: "Surge Rounds",
    blurb:
      "Surge alloy casings: +30% direct damage, +50% splash damage, and 10 fragments a shell instead of 6.",
    glyph: "splash",
    apply: (s) =>
      withBullet(stronger(s, 1.3), {
        splash: s.bullet.splash * 1.5,
        ...(s.bullet.frag ? { frag: { ...s.bullet.frag, count: 10 } } : null),
      }),
  },
];

const TSUNAMI: readonly TurretUpgradeDef[] = [
  {
    id: "tsunami-chamber",
    turret: "tsunami",
    tier: 1,
    name: "Pressure Chamber",
    blurb: "Soaked enemies stay slowed 4s longer.",
    glyph: "duration",
    apply: (s) => soaking(s, 4),
  },
  {
    id: "tsunami-spray",
    turret: "tsunami",
    tier: 2,
    name: "Wide Spray",
    blurb: "+30% range.",
    glyph: "range",
    apply: (s) => reaching(s, 1.3),
  },
  {
    id: "tsunami-cryo",
    turret: "tsunami",
    tier: 3,
    name: "Cryofluid Mix",
    blurb:
      "Uses cryofluid instead of water: soaked enemies move at 25% speed rather than 45%, and stay soaked 40% longer.",
    glyph: "frost",
    apply: (s) =>
      s.bullet.wet
        ? withBullet(s, {
            wet: { duration: s.bullet.wet.duration * 1.4, slow: 0.25 },
            fxColor: PAL.lancerLaser,
          })
        : s,
  },
];

const SPECTRE: readonly TurretUpgradeDef[] = [
  {
    id: "spectre-cooling",
    turret: "spectre",
    tier: 1,
    name: "Cooling Jacket",
    blurb: "+40% attack speed.",
    glyph: "rate",
    apply: (s) => faster(s, 1.4),
  },
  {
    id: "spectre-bases",
    turret: "spectre",
    tier: 2,
    name: "Hardened Bases",
    blurb: "+30% damage.",
    glyph: "damage",
    apply: (s) => stronger(s, 1.3),
  },
  {
    id: "spectre-surge",
    turret: "spectre",
    tier: 3,
    name: "Surge Shells",
    blurb: "Surge shells: +35% damage, 5 pierce instead of 2, and armour is ignored entirely.",
    glyph: "pierce",
    apply: (s) =>
      withBullet(stronger(s, 1.35), { pierce: true, pierceCap: 5, pierceArmor: true }),
  },
];

const MELTDOWN: readonly TurretUpgradeDef[] = [
  {
    id: "meltdown-loop",
    turret: "meltdown",
    tier: 1,
    name: "Coolant Loop",
    blurb: "+50% cooling speed — the beam is back sooner.",
    glyph: "rate",
    apply: (s) => faster(s, 1.5),
  },
  {
    id: "meltdown-array",
    turret: "meltdown",
    tier: 2,
    name: "Focusing Array",
    blurb: "+30% damage.",
    glyph: "damage",
    apply: (s) => stronger(s, 1.3),
  },
  {
    id: "meltdown-phase",
    turret: "meltdown",
    tier: 3,
    name: "Phase Lens",
    blurb: "+35% range, and the beam bites every 3.5 ticks instead of every 5.",
    glyph: "beam",
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
];

const FORESHADOW: readonly TurretUpgradeDef[] = [
  {
    id: "foreshadow-caps",
    turret: "foreshadow",
    tier: 1,
    name: "Rail Capacitors",
    blurb: "+50% damage.",
    glyph: "damage",
    apply: (s) => stronger(s, 1.5),
  },
  {
    id: "foreshadow-servos",
    turret: "foreshadow",
    tier: 2,
    name: "Servo Motors",
    blurb: "Double traverse speed and a 5° wider firing cone.",
    glyph: "spread",
    apply: (s) => ({
      ...s,
      rotateSpeed: s.rotateSpeed * 2,
      shootCone: s.shootCone + (Math.PI / 180) * 5,
    }),
  },
  {
    id: "foreshadow-surge",
    turret: "foreshadow",
    tier: 3,
    name: "Surge Rail",
    blurb: "+30% damage, and the reload drops to 60% of stock.",
    glyph: "rate",
    apply: (s) => faster(stronger(s, 1.3), 1 / 0.6),
  },
];

/**
 * THE TABLE. One branch per turret, in tier order — the order they are
 * bought in, because each rung requires the one above it (see tech.ts).
 * Three rungs on most turrets and four on duo and arc, which are the two
 * that have an ultimate written for them so far.
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
  // the support pair has no branch yet: every rung written so far bends a
  // gun (range, damage, a volley's shape), and a block that fires nothing
  // has none of those to bend
  mender: [],
  mendProjector: [],
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

/** owned-or-not per rung, tier 1 first — the shape the sim and the tree
 *  both hold. Every entry is 0 or 1 now that a rung is bought once */
export type UpgradePoints = readonly number[];

/**
 * Nothing bought: what a stock turret plays with.
 *
 * Longer than the longest branch on purpose — every reader indexes it
 * per rung and stops at its own branch's length, so a spare zero costs
 * nothing and a short one would read `undefined` the day a fourth rung is
 * written for a turret that has three.
 */
export const NO_UPGRADES: UpgradePoints = [0, 0, 0, 0];

/** does this spread of points change the turret at all? */
export const hasUpgrades = (p: UpgradePoints): boolean => p.some((n) => n > 0);

/**
 * THE UPGRADED TURRET, as one TowerStats the sim can use in place of the
 * stock one.
 *
 * The rungs are folded in TIER ORDER and each one takes the stats the one
 * before it produced, which is what lets a later rung read what an earlier
 * one wrote — an ultimate that doubles a shell count doubles the count
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
    if ((points[i] ?? 0) > 0) s = rungs[i].apply(s, ctx);
  }
  return s;
}
