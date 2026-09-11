"use client";

import type { RefObject } from "react";

import { modDef, modName, oddsLine, type ModGlyph, type ModId } from "@/game/mods";
import { DRAWN_GLYPHS, MOD_GRID, modGlyph } from "./modArt";
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
 * bought. The hover card prints the live chance with every COPY owned
 * folded in, so "+10% damage x3" says 66% and not 30% (mods.ts oddsLine).
 * A copy is another roll and never a second application — a turret either
 * has the attribute or does not — so that number is the whole of what a
 * second copy buys.
 *
 * The band colour is the whole legend, the same four the cards wear.
 */

/**
 * THE FACES, AND THERE ARE TWO KINDS OF THEM HERE.
 *
 * THE TURRET HALF IS PIXEL ART (modArt.ts): a 16-square drawing in the
 * game's own palette, the same way the mutator faces are drawn, because
 * these hang beside Mindustry block sprites and a line glyph beside that
 * art reads as a placeholder. The `color` prop does NOT reach them — a
 * drawing carries the palette of the THING it depicts and never the
 * colour of how good it is, and the band is on the border of the box this
 * sits in at all three call sites below. That is also what lets the
 * common "+10% damage" and the uncommon "+25%" share one barrel: same
 * art, different border, one legend.
 *
 * THE RELIC HALF IS STILL STROKES — a few marks on a 24x24 grid in the
 * band's colour. Nothing about that is principled; they simply have not
 * been drawn yet, and anything modArt.ts does not know falls through to
 * the old drawing below.
 *
 * Either way they are read at 12 to 22 CSS pixels, so every one of them
 * is a silhouette and none of them is a picture.
 */
export function Glyph({
  glyph,
  color,
  className = "h-[15px] w-[15px]",
}: {
  glyph: ModGlyph;
  color: string;
  className?: string;
}) {
  if (DRAWN_GLYPHS.has(glyph))
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
  const s = { stroke: color, strokeWidth: 2, fill: "none", strokeLinecap: "round" as const };
  const f = { fill: color, stroke: "none" };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {glyph === "crosshair" && (
        <>
          <circle cx="12" cy="12" r="7" {...s} />
          <path d="M12 1v6M12 17v6M1 12h6M17 12h6" {...s} />
        </>
      )}
      {glyph === "coolant" && (
        <>
          <path d="M12 2v20M12 6l-4-3M12 6l4-3M12 18l-4 3M12 18l4 3" {...s} />
          <path d="M4 7l16 10M4 17L20 7" {...s} strokeWidth={1.2} />
        </>
      )}
      {glyph === "coin" && (
        <>
          <circle cx="12" cy="12" r="8" {...s} />
          <path d="M12 7v10M9 9.5h6M9 14.5h6" {...s} strokeWidth={1.6} />
        </>
      )}
      {glyph === "vault" && (
        <>
          <rect x="3" y="4" width="18" height="16" rx="1" {...s} />
          <circle cx="12" cy="12" r="4" {...s} />
          <path d="M12 12l3-3" {...s} />
        </>
      )}
      {glyph === "flame" && (
        <>
          <path d="M12 2c4 5 6 7 6 11a6 6 0 01-12 0c0-2 1-3 2-5 1 2 2 2 3 1 0-3 0-5 1-7z" {...s} />
        </>
      )}
      {glyph === "volley" && (
        <>
          <circle cx="12" cy="12" r="2.5" {...f} />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" {...s} />
          <circle cx="12" cy="12" r="8" {...s} strokeWidth={1.1} />
        </>
      )}
      {glyph === "phoenix" && (
        <>
          <path d="M12 21c-5-3-8-6-8-10a5 5 0 018-4 5 5 0 018 4c0 4-3 7-8 10z" {...s} />
          <path d="M12 12l-3-3M12 12l3-3" {...s} strokeWidth={1.2} />
        </>
      )}
      {glyph === "fan" && (
        <>
          <path d="M12 21L5 5M12 21L12 3M12 21L19 5" {...s} />
        </>
      )}
      {glyph === "legion" && (
        <>
          <path d="M6 21V9l6-6 6 6v12" {...s} />
          <path d="M6 15h12M10 21v-5h4v5" {...s} strokeWidth={1.3} />
        </>
      )}
      {glyph === "star" && (
        <>
          <path d="M12 2l2.8 6.6 7.2.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.2-.6z" {...s} />
        </>
      )}
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
  // A TURRET ATTRIBUTE PRINTS ITS LIVE ODDS and a relic prints nothing:
  // the chance is the only number about these that MOVES, and the only
  // one a player has to re-read after a purchase. Every copy owned folded
  // in, and per CARD rather than per turret where that is what it means
  const odds = d.scope === "turret" ? oddsLine(d, n) : null;
  return (
    <span
      ref={tip.ref as RefObject<HTMLSpanElement | null>}
      {...tip.anchorProps}
      className="pointer-events-auto relative flex h-[22px] w-[22px] items-center justify-center border"
      style={{ borderColor: r.color, background: r.ground }}
      aria-label={`${name}${n > 1 ? ` times ${n}` : ""}, ${r.name} upgrade`}
    >
      <Glyph glyph={d.glyph} color={r.color} />
      {n > 1 && (
        <span
          className="pointer-events-none absolute -bottom-[3px] -right-[2px] bg-[#0b0b0d] px-[2px] text-[9px] font-bold leading-none"
          style={{ color: r.color }}
        >
          {n}
        </span>
      )}
      <HoverCard tip={tip} title={name} tag={r.name} color={r.color} align="left">
        {d.blurb}
        {odds && (
          <span className="mt-1.5 block font-bold" style={{ color: r.color }}>
            {odds}
          </span>
        )}
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
 * three and a half thousand scrap would be a chip quietly appearing in a
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
              <Glyph glyph={d.glyph} color={r.color} className="h-[12px] w-[12px]" />
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
      className="ms-deal-card pointer-events-none flex w-[13rem] flex-col gap-1 border-2 p-2"
      style={{ borderColor: r.color, background: r.ground }}
      role="status"
    >
      <div className="flex items-center gap-1.5">
        <span
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center border"
          style={{ borderColor: r.color }}
        >
          <Glyph glyph={d.glyph} color={r.color} />
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
