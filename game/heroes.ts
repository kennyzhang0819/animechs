// the hero roster — a run played as one mobile mech of a turret line.
// The mechanics are herosim.ts; the doc is docs/heroes.md
import { PAL } from "./constants";
import type { RGB } from "./types";
import type { TowerKind } from "./types";

export const HERO_IDS = ["blight", "pyre", "arc", "gunner"] as const;
export type HeroId = (typeof HERO_IDS)[number];

/** an ability's HUD row: what the key is and what pressing it does */
export interface HeroSkillDef {
  name: string;
  /** seconds between uses; the primary's is its reload */
  cooldown: number;
  blurb: string;
}

export interface HeroDef {
  id: HeroId;
  name: string;
  line: string;
  blurb: string;
  accent: RGB;
  /** keys 1-4: the line's turrets, the first is also the body the hero is drawn as */
  towers: readonly [TowerKind, TowerKind, TowerKind, TowerKind];
  hp: number;
  /** px a second on the ground */
  speed: number;
  radius: number;
  primary: HeroSkillDef & {
    /** whose ammo the gun throws, and how it throws it */
    kind: TowerKind;
    shots: number;
    spread: number;
    inaccuracy: number;
  };
  secondary: HeroSkillDef;
  dash: HeroSkillDef & { distance: number; duration: number };
  ult: HeroSkillDef & { duration: number };
}

const deg = (d: number): number => (d * Math.PI) / 180;

export const HERO_DEFS: Record<HeroId, HeroDef> = {
  blight: {
    id: "blight",
    name: "Blight",
    line: "toxin",
    blurb: "Rot that never caps. Needles, gas and a cloud that walks.",
    accent: PAL.toxinFront,
    towers: ["duster", "blighter", "drifter", "stinger"],
    hp: 2200,
    speed: 230,
    radius: 14,
    primary: {
      name: "Needle",
      kind: "stinger",
      cooldown: 0.25,
      shots: 1,
      spread: 0,
      inaccuracy: deg(1.5),
      blurb: "A stinger needle through every body on its line, laying rot on each.",
    },
    secondary: {
      name: "Gas Bomb",
      cooldown: 4,
      blurb: "Three blighter shells arc onto the cursor, rot flat across each blast.",
    },
    dash: {
      name: "Vent",
      cooldown: 3,
      distance: 140,
      duration: 0.18,
      blurb: "A short dash that vents poison along its path.",
    },
    ult: {
      name: "Miasma",
      cooldown: 30,
      duration: 0,
      blurb: "Three drifter clouds released toward the cursor, pulsing rot for fourteen seconds.",
    },
  },
  pyre: {
    id: "pyre",
    name: "Pyre",
    line: "flame",
    blurb: "Close, hot and spreading. A torch, a cleaver and a furnace beam.",
    accent: PAL.ember,
    towers: ["torch", "airburst", "cleaver", "furnace"],
    hp: 2800,
    speed: 250,
    radius: 14,
    primary: {
      name: "Flame",
      kind: "torch",
      cooldown: 0.1,
      shots: 1,
      spread: 0,
      inaccuracy: deg(4),
      blurb: "A torch's tongue: short, piercing, two fire stacks a hit.",
    },
    secondary: {
      name: "Cleave",
      cooldown: 1.5,
      blurb: "A cleaver slash: every body in a wide cone ahead takes the blade.",
    },
    dash: {
      name: "Blaze",
      cooldown: 3,
      distance: 160,
      duration: 0.16,
      blurb: "A burning dash that lights everything it passes through.",
    },
    ult: {
      name: "Furnace",
      cooldown: 40,
      duration: 3,
      blurb: "Hold a furnace beam on the cursor for three seconds; it follows the aim.",
    },
  },
  arc: {
    id: "arc",
    name: "Arc",
    line: "beam",
    blurb: "Nothing here flies: every shot lands the instant it leaves.",
    accent: PAL.piercerLaser,
    towers: ["coil", "piercer", "tether", "railhead"],
    hp: 1800,
    speed: 250,
    radius: 13,
    primary: {
      name: "Spark",
      kind: "coil",
      cooldown: 0.3,
      shots: 1,
      spread: 0,
      inaccuracy: 0,
      blurb: "A coil bolt that chains through three more bodies.",
    },
    secondary: {
      name: "Lance",
      cooldown: 2,
      blurb: "A piercer beam down the aim, through the first eight bodies.",
    },
    dash: {
      name: "Blink",
      cooldown: 4,
      distance: 200,
      duration: 0,
      blurb: "Teleport to the cursor, up to ten tiles away.",
    },
    ult: {
      name: "Rail",
      cooldown: 35,
      duration: 0,
      blurb: "Three railhead shots in a tight fan, across the whole screen.",
    },
  },
  gunner: {
    id: "gunner",
    name: "Gunner",
    line: "kinetic",
    blurb: "Rounds and shells. Reliable, and the barrage is a whole board's worth.",
    accent: PAL.copperAmmoFront,
    towers: ["tacker", "autocannon", "barrage", "repeater"],
    hp: 3200,
    speed: 220,
    radius: 15,
    primary: {
      name: "Autocannon",
      kind: "autocannon",
      cooldown: 0.11,
      shots: 1,
      spread: 0,
      inaccuracy: deg(3),
      blurb: "An autocannon round, nine a second.",
    },
    secondary: {
      name: "Shell",
      cooldown: 3,
      blurb: "Three lobber shells onto the cursor.",
    },
    dash: {
      name: "Overdrive",
      cooldown: 6,
      distance: 0,
      duration: 2.5,
      blurb: "Run at double speed for two and a half seconds.",
    },
    ult: {
      name: "Barrage",
      cooldown: 30,
      duration: 0,
      blurb: "Twelve barrage shells scattered over the cursor.",
    },
  },
};

export const HERO_RESPAWN_SECONDS = 10;
/** how far from the hero a turret may be dropped, in px */
export const HERO_BUILD_REACH = 12 * 20;
/** raw damage a second one touching body of tier t does to the hero */
export const HERO_CONTACT_DPS = [0, 30, 50, 80, 140, 220];
/** seconds of immunity after a respawn */
export const HERO_SPAWN_GRACE = 1.5;

/** the skill slots in HUD order, with the key each answers to */
export const HERO_SLOT_KEYS = ["LMB", "RMB", "Space", "R"] as const;
