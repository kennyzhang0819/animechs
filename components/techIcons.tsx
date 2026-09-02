"use client";

import { isTowerNode, isUpgradeNode, type TechKind } from "@/game/tech";
import { upgradeDef, type UpgradeGlyph } from "@/game/upgrades";
import { TOWER_ICONS } from "./towerIcons";

/**
 * WHAT EVERY TECH NODE LOOKS LIKE, in one place.
 *
 * It lives here rather than in TechTree.tsx because there are two boards
 * drawing the same tree now: the one a player buys from, and the admin
 * layout editor. An editor that drew name labels where the game draws
 * sprites would be composing a layout against the wrong thing — a
 * scatter's icon and the word "SCATTER" are not the same size, the same
 * weight, or the same amount of visual noise, and the whole job of that
 * editor is to judge how the board READS.
 *
 * Turrets and home have block sprites. The utility nodes do not — there is
 * no block in Mindustry that means "run the clock faster" — so they get a
 * glyph instead: fast-forward for the pace switches (the name underneath
 * says which multiplier), a grid of squares for the slot nodes, a plated
 * shield for base plating.
 */
const FF_GLYPH = "M2 4v16l10-8zM12 4v16l10-8z";
const SLOT_GLYPH = "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z";
/** a bolt — rate of fire, the node that makes the barrel run hot */
const ROF_GLYPH = "M13 2 4 14h6l-1 8 9-12h-6z";
/** a shot leaving two bodies behind it — pierce */
const PIERCE_GLYPH = "M1 11h3v2H1zM7 11h3v2H7zM13 11h3V8l6 4-6 4v-3h-3z";
/** a shield with a plate across it — Extra Lives, the one node that buys
 *  mistakes rather than firepower */
const PLATE_GLYPH =
  "M12 2 4 5v6c0 4.4 3.4 8.5 8 9.9 4.6-1.4 8-5.5 8-9.9V5zm-6 8h12v2H6z";

/** the glyph a sprite-less node wears; the pace switches are the default */
const GLYPH: Partial<Record<TechKind, string>> = {
  "slot-7": SLOT_GLYPH,
  "slot-8": SLOT_GLYPH,
  "lives": PLATE_GLYPH,
};

/**
 * THE UPGRADE FACES. An upgrade node has no block to wear — there is no
 * Mindustry sprite that means "five per cent more blast radius" — so the
 * branches share a small vocabulary of glyphs and every rung names the one
 * that fits it (TurretUpgradeDef.glyph). Reusing a dozen shapes across
 * every branch in the game is the point: a bolt means rate of fire on every
 * turret there is, so a branch can be read at a glance without opening a
 * card.
 *
 * `surge` is the exception and never appears here — an ultimate wears the
 * surge alloy it costs (SURGE_ICON), because the thing that makes it an
 * ultimate IS the currency.
 */
const UPGRADE_GLYPH: Record<Exclude<UpgradeGlyph, "surge">, string> = {
  rate: ROF_GLYPH,
  pierce: PIERCE_GLYPH,
  // a wall on the left and a shot running away from it
  range: "M3 11h11V8l6 4-6 4v-3H3zM0 4h2v16H0z",
  // a round, nose up
  damage: "M12 2 8 8v9a4 4 0 0 0 8 0V8z",
  // a four-pointed burst
  splash: "M12 1l2.2 6.8L21 10l-6.8 2.2L12 19l-2.2-6.8L3 10l6.8-2.2z",
  // a flame
  burn: "M12 2c3 4 1 5 3 8 1-1 1-2 1-3 2 2 3 5 3 7a7 7 0 0 1-14 0c0-3 2-6 5-8 1 2 1 3 2 4 1-3 0-5 0-8z",
  // a snowflake
  frost: "M11 1h2v22h-2zM2.2 5.6l1-1.73 18.6 10.74-1 1.73zM21.8 5.6l1 1.73L4.2 18.07l-1-1.73z",
  // a clock: how long a status hangs on the thing it landed on
  duration:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15zM11 6h2v6.4l4.2 2.5-1 1.7L11 13.5z",
  // a crosshair with a lock in the middle
  homing:
    "M11 1h2v4h-2zM11 19h2v4h-2zM1 11h4v2H1zM19 11h4v2h-4zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  // a fan of shots leaving one muzzle
  spread: "M12 21 3 6l2-1 7 11 7-11 2 1z",
  // a beam with flare above and below
  beam: "M2 10h20v4H2zM4 5h4v2H4zM16 5h4v2h-4zM4 17h4v2H4zM16 17h4v2h-4z",
  // a flyer seen from below, and a shot going up at it
  air: "M12 2 4 10h5l-1 5 4-3 4 3-1-5h5zM7 19h10v2H7z",
};

/** the item an ultimate is paid for, and the face it wears */
export const SURGE_ICON = "/mindustry/sprites/items/item-surge-alloy.png";

/**
 * SURGE ALLOY'S OWN COLOUR (Mindustry Items.surgeAlloy, f3e979), and the
 * one colour on this board that is not the tree's gold.
 *
 * Gold means BOUGHT. An ultimate is bought too, so gold would have been
 * true and useless — the whole job of the fourth rung is to read as a
 * different KIND of thing from the three beside it, at a glance, without
 * being hovered. So it gets its own shape (a hexagon, not a rounded
 * square), its own colour, and, when it is lit and switched on, a halo
 * that moves. Nothing else on the board moves.
 */
export const SURGE = "#F3E979";

export const HOME_ICON = "/mindustry/sprites/blocks/storage/core-shard.png";

/** utility nodes whose face is an item or block sprite rather than a glyph */
const UTIL_ICONS: Partial<Record<TechKind, string>> = {
  // the two one-shot duo nodes wear the item that IS them: a graphite round
  // is graphite, and Duo Power's whole gate is the one surge alloy it costs
  "duo-graphite": "/mindustry/sprites/items/item-graphite.png",
  "duo-power": "/mindustry/sprites/items/item-surge-alloy.png",
};

/** the sprite a node wears, or null for one that wears a glyph instead */
export function nodeSprite(id: TechKind): string | null {
  if (isTowerNode(id)) return TOWER_ICONS[id] ?? null;
  if (id === "home") return HOME_ICON;
  const util = UTIL_ICONS[id];
  if (util) return util;
  if (isUpgradeNode(id) && upgradeDef(id).glyph === "surge") return SURGE_ICON;
  return null;
}

/** the path a glyph-wearing node draws, in a 24x24 box */
export function nodeGlyph(id: TechKind): string {
  if (isUpgradeNode(id)) {
    const g = upgradeDef(id).glyph;
    return g === "surge" ? FF_GLYPH : UPGRADE_GLYPH[g];
  }
  return GLYPH[id] ?? FF_GLYPH;
}

/**
 * ONE NODE'S FACE: its sprite where it has one, its glyph where it does
 * not. `sprite` and `glyph` are sized separately because they are not the
 * same kind of picture — a block sprite fills its box and a line glyph
 * needs air around it, so a shared size would leave one of them wrong
 * wherever the other looked right.
 */
export function NodeFace({
  id,
  sprite,
  glyph,
  color,
  dim,
}: {
  id: TechKind;
  /** tailwind size classes for a block sprite, e.g. "h-14 w-14" */
  sprite: string;
  /** ...and for a glyph, which wants to be smaller in the same box */
  glyph: string;
  /** the glyph's fill; sprites ignore it */
  color?: string;
  /** an unowned node's sprite is greyed rather than recoloured */
  dim?: boolean;
}) {
  const src = nodeSprite(id);
  if (src)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite
      <img
        src={src}
        alt=""
        className={`${sprite} [image-rendering:pixelated] ${dim ? "grayscale" : ""}`}
      />
    );
  return (
    <svg
      viewBox="0 0 24 24"
      className={glyph}
      style={{ fill: color }}
      aria-hidden="true"
    >
      <path fillRule="evenodd" d={nodeGlyph(id)} />
    </svg>
  );
}
