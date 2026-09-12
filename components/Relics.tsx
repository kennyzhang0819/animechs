"use client";

import type { RefObject } from "react";

import { modDef, modName, oddsLine, stackLine, type ModGlyph, type ModId } from "@/game/mods";
import { MOD_GRID, modGlyph } from "./modArt";
import { RARITY } from "@/game/rarity";
import { HoverCard, useHoverCard } from "./HoverCard";

/**
 * THE SHELF — every upgrade the run owns, in a row along the top-left of
 * the field, and it never goes away.
 *
 * IT IS THE RELIC ROW OUT OF A DECK BUILDER, and it is there for exactly
 * the reason that genre puts one there: an upgrade is a RULE, not a thing
 * on the board, and a rule the player cannot see is a rule they will
 * forget they bought. A run forty minutes deep carrying nine of these has
 * a shape, and the shelf is where that shape is legible.
 *
 * IT HOLDS BOTH SCOPES (mods.ts). The globals are the relics proper —
 * always in force, applying to everything. The turret attributes are on
 * the shelf too even though they do nothing by themselves, because what
 * they are is a standing CHANCE on every placement from here on, and a
 * player deciding whether to press T needs to know the odds they have
 * bought. THE ODDS NO LONGER MOVE: a copy used to be another roll folded
 * in, so "+10% damage x3" printed 66%; copies buy the NUMBER now (mods.ts),
 * so the chip says 30% however many are on it and the card says what the
 * x3 in the corner is worth.
 *
 * The band colour is the whole legend, the same four the cards wear.
 */

/**
 * THE FACES — every one of them pixel art (modArt.ts): a 16-square
 * drawing in the game's own palette, the same way the mutator faces are
 * drawn, because these hang beside Mindustry block sprites and a line
 * glyph beside that art reads as a placeholder.
 *
 * THERE IS NO COLOUR PROP, ON PURPOSE. A drawing carries the palette of
 * the THING it depicts and never the colour of how good it is; the band
 * is on the border of the box this sits in at every call site. That is
 * what lets the common "+10% damage" and the uncommon "+25%" share one
 * barrel — same art, different border, one legend — and it is why the
 * relics read as a different kind of thing from across the room: an
 * attribute is one gunmetal object with a pip of colour, a relic is the
 * colour of what it does over the whole drawing.
 *
 * They are read at 12 to 22 CSS pixels, so every one of them is a
 * silhouette and none of them is a picture.
 */
export function Glyph({
  glyph,
  className = "h-[15px] w-[15px]",
}: {
  glyph: ModGlyph;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${MOD_GRID} ${MOD_GRID}`}
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {modGlyph(glyph).map((layer) => (
        <path key={layer.color} fill={layer.color} d={layer.d} />
      ))}
    </svg>
  );
}

/** one owned upgrade: its face on its band's ground, how many COPIES the
 *  run holds if it is more than one, and what it does on hover */
function RelicChip({ id, n }: { id: ModId; n: number }) {
  const tip = useHoverCard("down");
  const d = modDef(id);
  const r = RARITY[d.rarity];
  // an unnamed tick is CALLED its tweak — "+10% damage" is the whole
  // thing it is, and a made-up name over the top would be a word to learn
  // in order to be told what the number already said (mods.ts)
  const name = modName(d);
  // A TURRET ATTRIBUTE PRINTS ITS ODDS and a relic prints nothing: the
  // chance is the one thing a player has to know before pressing T, and
  // it is per CARD rather than per turret where that is what it means.
  // It does not move any more — copies buy strength now (mods.ts) — so
  // what a second copy did is the line under it
  const odds = d.scope === "turret" ? oddsLine(d) : null;
  // WHAT THE WHOLE STACK IS WORTH, at the count the run holds — the one
  // number a player wanted off this chip (mods.ts stackLine)
  const stack = stackLine(d, n);
  // AN UNNAMED TICK SHOWS NO BLURB. Its title IS its tweak, so the
  // sentence under it ("a chance for a new turret to be born with +2%
  // damage...") is the title, the odds line and the total all said again
  // in prose — three lines of reading for a card that exists to be
  // glanced at mid-wave. A named attribute keeps its blurb, because a
  // name says nothing about what the thing does.
  const blurb = d.name ? d.blurb : null;
  return (
    <span
      ref={tip.ref as RefObject<HTMLSpanElement | null>}
      {...tip.anchorProps}
      className="pointer-events-auto relative flex h-[22px] w-[22px] items-center justify-center border"
      style={{ borderColor: r.color, background: r.ground }}
      aria-label={`${name}${n > 1 ? ` times ${n}` : ""}, ${r.name} upgrade`}
    >
      <Glyph glyph={d.glyph} />
      {n > 1 && (
        <span
          className="pointer-events-none absolute -bottom-[3px] -right-[2px] bg-[#0b0b0d] px-[2px] text-[9px] font-bold leading-none"
          style={{ color: r.color }}
        >
          {n}
        </span>
      )}
      <HoverCard tip={tip} title={name} tag={r.name} color={r.color} align="left">
        {blurb}
        {odds && (
          <span className="mt-1.5 block font-bold" style={{ color: r.color }}>
            {odds}
          </span>
        )}
        {stack && <span className="mt-1.5 block font-bold text-[#EDEDEF]">{stack}</span>}
      </HoverCard>
    </span>
  );
}

/**
 * THE ROW. It wraps rather than scrolls — a run can own two dozen of
 * these and every one of them is still in force, so none of them may be
 * hidden behind a scrollbar the player has to think about.
 */
export function RelicShelf({ relics }: { relics: { id: ModId; n: number }[] }) {
  if (relics.length === 0) return null;
  return (
    <div className="pointer-events-none flex max-w-full flex-wrap items-center gap-1">
      {relics.map((r) => (
        <RelicChip key={r.id} id={r.id} n={r.n} />
      ))}
    </div>
  );
}

/**
 * THE REVEAL — the card that says what the last module press handed over.
 *
 * A MODULE HAS NOWHERE TO LAND. A turret draw puts a card in the corner
 * and the player is left holding it; a module is in force the instant it
 * is paid for (Game.buyModules), so without this the only feedback for
 * a hundred and fifty thousand scrap would be a chip quietly appearing in a
 * row at the other end of the screen. So the draw gets a card of its own
 * for a few seconds, over the buttons, in the band's colour and saying
 * what it does — and then it goes, because it is not a thing being held.
 *
 * ONE PRESS IS ONE CARD, whatever the amount button said. A x10 press
 * gets ONE reveal listing its ten, not ten cards queued five seconds
 * apart: the player pressed once and wants to know what that press did,
 * and by the tenth card the wave they bought it for would be over. So a
 * single draw gets the tall card with its blurb — there is room to say
 * what it does, and a player who bought one thing is reading it — and a
 * fleet of them gets a compact list, band colour a row, which is the most
 * that can honestly be said about ten things at once.
 */
export function ModReveal({ ids }: { ids: readonly ModId[] }) {
  if (ids.length === 0) return null;
  if (ids.length === 1) return <SingleReveal id={ids[0]} />;
  // the same module drawn twice in one press is ONE row with a count on
  // it: "Coolant x3" is what happened, and three identical rows is not
  const rows: { id: ModId; n: number }[] = [];
  for (const id of ids) {
    const at = rows.find((r) => r.id === id);
    if (at) at.n++;
    else rows.push({ id, n: 1 });
  }
  const scope = modDef(ids[0]).scope;
  return (
    <div
      className="ms-pane pointer-events-none flex w-[13rem] flex-col gap-1 p-2"
      role="status"
    >
      <span className="text-[10px] font-bold uppercase leading-none tracking-widest text-[#A6A6AF]">
        {ids.length} {scope === "global" ? "relics" : "mods"}
      </span>
      {rows.map((row) => {
        const d = modDef(row.id);
        const r = RARITY[d.rarity];
        return (
          <span key={row.id} className="flex items-center gap-1.5">
            <span
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center border"
              style={{ borderColor: r.color }}
            >
              <Glyph glyph={d.glyph} className="h-[12px] w-[12px]" />
            </span>
            <span
              className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase leading-none tracking-wide"
              style={{ color: r.color }}
            >
              {modName(d)}
            </span>
            {row.n > 1 && (
              <span className="text-[10px] font-bold leading-none" style={{ color: r.color }}>
                x{row.n}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** one module, with room to say what it does */
function SingleReveal({ id }: { id: ModId }) {
  const d = modDef(id);
  const r = RARITY[d.rarity];
  return (
    <div
      className="ms-deal-card pointer-events-none flex w-[13rem] flex-col gap-1 border-[3px] p-2"
      style={{ borderColor: r.color, background: r.ground }}
      role="status"
    >
      <div className="flex items-center gap-1.5">
        <span
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center border"
          style={{ borderColor: r.color }}
        >
          <Glyph glyph={d.glyph} />
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase leading-none tracking-wide"
          style={{ color: r.color }}
        >
          {modName(d)}
        </span>
      </div>
      <span className="text-[9px] font-bold uppercase leading-none tracking-wide opacity-70" style={{ color: r.color }}>
        {r.name} — {d.scope === "global" ? "in force now" : "on new turrets"}
      </span>
      <span className="text-[10px] leading-snug text-[#EDEDEF]">{d.blurb}</span>
    </div>
  );
}
