// the side sites a rolled board carries — see docs/sites.md
import type { UnitKind } from "./levels";
import type { MapMark } from "./missionMarks";
import type { RarityWeights } from "./rarity";

export const SITE_KINDS = ["cairn", "mirror", "sleeper", "shrine", "beacon", "bomber"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];
export const SITE_SIZES = ["small", "medium", "large"] as const;
export type SiteSize = (typeof SITE_SIZES)[number];
export const SITE_MARK = "site";

/** the odds a cache's mod rolls at, the same for every site; the size sets the copies */
export const SITE_MOD_ODDS: RarityWeights = { common: 55, uncommon: 30, rare: 12, ultra: 3 };
export const SITE_MOD_COPIES: Readonly<Record<SiteSize, number>> = { small: 1, medium: 3, large: 10 };

export interface SiteTier {
  /** the circle the guards hold and the board rings, in cells */
  radius: number;
  guards?: Readonly<Partial<Record<UnitKind, number>>>;
  /** the cache's pool; the prop's own when unset */
  hp?: number;
  /** the share of every hit the cache hands back to the nearest turret */
  reflect?: number;
  houses?: readonly { kind: "fabricatorSmall" | "fabricatorLarge"; every: number }[];
  pylons?: readonly ("goad" | "bastion")[];
  branders?: number;
  /** the flight, launched at `launch` seconds from a pad `flight` cells out */
  bombers?: readonly UnitKind[];
  launch?: number;
  flight?: number;
}

export interface SiteDef {
  id: SiteKind;
  name: string;
  blurb: string;
  tiers: Readonly<Record<SiteSize, SiteTier>>;
}

export const SITE_DEFS: Readonly<Record<SiteKind, SiteDef>> = {
  cairn: {
    id: "cairn",
    name: "Cairn",
    blurb: "A cache in a ring of stones, and the Wardens that hold it.",
    tiers: {
      small: { radius: 12, hp: 80000, guards: { lance: 1 } },
      medium: { radius: 20, hp: 200000, guards: { lance: 2, bulwark: 1 } },
      large: { radius: 36, hp: 440000, guards: { lance: 3, bulwark: 3, halberd: 2 } },
    },
  },
  mirror: {
    id: "mirror",
    name: "Mirror cache",
    blurb: "Unguarded. Every hit on it comes back at the nearest turret.",
    tiers: {
      small: { radius: 6, hp: 60000, reflect: 0.1 },
      medium: { radius: 9, hp: 160000, reflect: 0.2 },
      large: { radius: 14, hp: 320000, reflect: 0.35 },
    },
  },
  sleeper: {
    id: "sleeper",
    name: "Sleeping house",
    blurb: "A dormant Fabricator beside the cache. Wake it and it blasts everything near, then sends.",
    tiers: {
      small: { radius: 10, hp: 80000, houses: [{ kind: "fabricatorSmall", every: 2 }] },
      medium: { radius: 16, hp: 180000, houses: [{ kind: "fabricatorLarge", every: 4 }] },
      large: {
        radius: 28,
        hp: 360000,
        houses: [
          { kind: "fabricatorLarge", every: 2 },
          { kind: "fabricatorLarge", every: 3 },
          { kind: "fabricatorSmall", every: 1 },
          { kind: "fabricatorSmall", every: 1 },
        ],
      },
    },
  },
  shrine: {
    id: "shrine",
    name: "Shrine",
    blurb: "A Pylon over the cache buffs every body near it, waves included, until it falls.",
    tiers: {
      small: { radius: 12, hp: 80000, pylons: ["goad"], guards: { lance: 1 } },
      medium: { radius: 20, hp: 200000, pylons: ["bastion"], guards: { lance: 1, bulwark: 1 } },
      large: { radius: 36, hp: 440000, pylons: ["goad", "goad", "goad", "goad", "bastion"], guards: { lance: 2, bulwark: 3, halberd: 1 } },
    },
  },
  beacon: {
    id: "beacon",
    name: "Beacon",
    blurb: "A Brander beside the cache burns any turret in its reach.",
    tiers: {
      small: { radius: 12, hp: 80000, branders: 1 },
      medium: { radius: 20, hp: 200000, branders: 1, guards: { bulwark: 2 } },
      large: { radius: 36, hp: 440000, branders: 4, guards: { bulwark: 3, halberd: 2 } },
    },
  },
  bomber: {
    id: "bomber",
    name: "Bomber run",
    blurb: "Bombers fly from the pad to the cache on the clock. Shoot every one down and it opens.",
    tiers: {
      small: { radius: 6, bombers: ["stoop3"], launch: 91, flight: 60 },
      medium: { radius: 9, bombers: ["stoop4", "stoop3"], launch: 182, flight: 90 },
      large: { radius: 14, bombers: ["stoop5", "stoop5", "stoop4", "stoop4"], launch: 318, flight: 120 },
    },
  },
};

export const siteTier = (kind: SiteKind, size: SiteSize): SiteTier => SITE_DEFS[kind].tiers[size];

/**
 * HOW MANY OF EACH SIZE A BOARD ROLLS: `tries` coin flips at `chance`, so
 * the count is binomial — about ten smalls, three or four mediums, one or
 * two larges on an ordinary draw, and a lucky one can stack to the tries
 * or an unlucky one to none (docs/sites.md).
 */
export const SITE_ROLLS: Readonly<Record<SiteSize, { tries: number; chance: number }>> = {
  small: { tries: 16, chance: 0.62 },
  medium: { tries: 8, chance: 0.44 },
  large: { tries: 6, chance: 0.25 },
};
/** the most sites a board carries, whatever the roll (Sim.siteStates packs two bits each) */
export const MAX_SITES = 24;

export function rollSiteCounts(rnd: () => number): Record<SiteSize, number> {
  const out = { small: 0, medium: 0, large: 0 };
  for (const size of SITE_SIZES) {
    const { tries, chance } = SITE_ROLLS[size];
    for (let t = 0; t < tries; t++) if (rnd() < chance) out[size]++;
  }
  return out;
}

export interface Site {
  kind: SiteKind;
  size: SiteSize;
  tier: SiteTier;
  /** the cache's top-left cell */
  x: number;
  y: number;
  /** the ring, in cells */
  radius: number;
  /** the bomber pad, in cells; the cache itself for any other kind */
  padX: number;
  padY: number;
}

const isKind = (v: unknown): v is SiteKind => typeof v === "string" && (SITE_KINDS as readonly string[]).includes(v);
const isSize = (v: unknown): v is SiteSize => typeof v === "string" && (SITE_SIZES as readonly string[]).includes(v);

/** a site mark read back, or null for any other mark */
export function siteOf(m: MapMark): Site | null {
  if (m.kind !== SITE_MARK) return null;
  const o = m.opts ?? {};
  const kind = isKind(o.site) ? o.site : "cairn";
  const size = isSize(o.size) ? o.size : "small";
  const tier = siteTier(kind, size);
  const radius = Number(o.radius) > 0 ? Number(o.radius) : tier.radius;
  return {
    kind,
    size,
    tier,
    x: m.x,
    y: m.y,
    radius,
    padX: Number.isFinite(Number(o.padX)) ? Number(o.padX) : m.x,
    padY: Number.isFinite(Number(o.padY)) ? Number(o.padY) : m.y,
  };
}

/** every site on a map, in mark order — the index is what the sim reports */
export const sitesOf = (marks: readonly MapMark[]): Site[] =>
  marks.map(siteOf).filter((s): s is Site => s !== null);
