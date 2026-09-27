"use client";

import { useEffect, type RefObject } from "react";

import { modBlurb, modDef, modName, stackLine, type ModGlyph, type ModId } from "@/game/mods";
import { relicDef, type RelicGlyph, type RelicId } from "@/game/relics";
import { MOD_GRID, modGlyph } from "./modArt";
import { RARITY } from "@/game/rarity";
import { HoverCard, useHoverCard } from "./HoverCard";
import { tile } from "./tile";
import type { ModDraw, ModOffer } from "@/game/game";

/**
 * THE SHELF — every module the run owns, in a row along the top-left of
 * the field, and it never goes away.
 *
 * IT IS THE RELIC ROW OUT OF A DECK BUILDER, and it is there for exactly
 * the reason that genre puts one there: a module is a RULE or a standing
 * CHANCE, not a thing on the board, and what a player cannot see they will
 * forget they bought. A run forty minutes deep carrying nine of these has a
 * shape, and the shelf is where that shape is legible.
 *
 * IT HOLDS BOTH CATEGORIES, IN TWO RUNS, RELICS FIRST. The relics
 * (relics.ts) lead because they are the ones in force right now — a rule
 * over the whole board, bought once, and the late game's whole answer. The
 * mods (mods.ts) follow: they do nothing by themselves, and what they are
 * is a standing chance on every placement from here on, which is what a
 * player deciding whether to press T needs the odds of.
 *
 * THE TWO RUNS ARE DIVIDED AND THE DIVIDER IS THE POINT. One undifferentiated
 * row said neither thing: a chip that is always in force and a chip that is a
 * 30% roll read as the same kind of object, and the player had to hover to
 * find out which. Relics, a rule, mods — in that order, left to right.
 *
 * A RELIC CHIP CARRIES NO COUNT because a relic is held once; a mod chip
 * carries an x3 when the run has three. That asymmetry is the two
 * categories, spelled out in what the chip does and does not print.
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
 * relics read as a different kind of thing from across the room: a mod is
 * one gunmetal object with a pip of colour, a relic is the colour of what
 * it does over the whole drawing.
 *
 * They are read at 12 to 22 CSS pixels, so every one of them is a
 * silhouette and none of them is a picture.
 */
export function Glyph({
  glyph,
  className = "h-[15px] w-[15px]",
}: {
  glyph: ModGlyph | RelicGlyph;
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

/** the chip itself, with no idea which catalog it is drawing — one square,
 *  one band border, a count in the corner if there is one, and a card on
 *  hover. Both runs of the shelf and both reveals go through it */
function Chip({
  glyph,
  name,
  rarity,
  n,
  aria,
  blurb,
  note,
  stack,
}: {
  glyph: ModGlyph | RelicGlyph;
  name: string;
  rarity: keyof typeof RARITY;
  /** how many copies — 1 prints nothing, and a relic is always 1 */
  n: number;
  aria: string;
  /** the prose under the title, or null where the title already said it */
  blurb: string | null;
  /** a line under the blurb, where there is anything left to add */
  note: string | null;
  /** what the whole stack is worth right now — mods only */
  stack: string | null;
}) {
  const tip = useHoverCard("down");
  const r = RARITY[rarity];
  return (
    <span
      ref={tip.ref as RefObject<HTMLSpanElement | null>}
      {...tip.anchorProps}
      className="ms-tile ms-tile-sm pointer-events-auto flex h-[22px] w-[22px] items-center justify-center"
      style={tile(r.color)}
      aria-label={aria}
    >
      <Glyph glyph={glyph} />
      {n > 1 && <span className="ms-tile-count">{n}</span>}
      <HoverCard tip={tip} title={name} tag={r.name} color={r.color} align="left">
        {blurb}
        {note && (
          <span className="mt-1.5 block font-bold" style={{ color: r.color }}>
            {note}
          </span>
        )}
        {stack && <span className="mt-1.5 block font-bold text-[#EDEDEF]">{stack}</span>}
      </HoverCard>
    </span>
  );
}

/** one owned RELIC: no count, and no line under the blurb — a relic is
 *  bought once and it is on, so its sentence is the whole of it */
function RelicChip({ id }: { id: RelicId }) {
  const d = relicDef(id);
  return (
    <Chip
      glyph={d.glyph}
      name={d.name}
      rarity={d.rarity}
      n={1}
      aria={`${d.name}, ${RARITY[d.rarity].name} relic`}
      blurb={d.blurb}
      note={null}
      stack={null}
    />
  );
}

/** ...and one owned MOD: its odds, and how many copies the run holds */
function ModChip({ id, n }: { id: ModId; n: number }) {
  const d = modDef(id);
  // an unnamed tick is CALLED its tweak — "+10% damage" is the whole
  // thing it is, and a made-up name over the top would be a word to learn
  // in order to be told what the number already said (mods.ts)
  const name = modName(d);
  return (
    <Chip
      glyph={d.glyph}
      name={name}
      rarity={d.rarity}
      n={n}
      aria={`${name}${n > 1 ? ` times ${n}` : ""}, ${RARITY[d.rarity].name} mod`}
      // THE BLURB IS THE ODDS AND THE STATS, in one sentence (mods.ts
      // modBlurb) — "30% chance for a new turret to have +2% damage". It
      // used to be a sentence of prose with the odds on a second line
      // under it, which said the same thing twice at different lengths.
      // THE ODDS DO NOT MOVE WITH THE COPIES: a copy used to be another
      // roll folded in, so "+10% damage x3" printed 66%; copies buy the
      // NUMBER now (mods.ts), so the sentence says 30% however many are
      // on it and the stack line says what the x3 is worth
      blurb={modBlurb(d)}
      note={null}
      stack={stackLine(d, n)}
    />
  );
}

/**
 * THE ROW. It wraps rather than scrolls — a run can own two dozen of
 * these and every one of them is still in force, so none of them may be
 * hidden behind a scrollbar the player has to think about.
 */
export function RelicShelf({
  relics,
  mods,
}: {
  relics: readonly RelicId[];
  mods: readonly { id: ModId; n: number }[];
}) {
  if (relics.length === 0 && mods.length === 0) return null;
  return (
    <div className="pointer-events-none flex max-w-full flex-wrap items-center gap-1">
      {relics.map((id) => (
        <RelicChip key={id} id={id} />
      ))}
      {/* THE DIVIDER, and only where there is something on both sides of
          it: a rule in force and a standing chance are two kinds of thing
          and the row has to say so (see the header) */}
      {relics.length > 0 && mods.length > 0 && (
        <span className="mx-0.5 h-[16px] w-px shrink-0 bg-[#4d4e58]" aria-hidden="true" />
      )}
      {mods.map((m) => (
        <ModChip key={m.id} id={m.id} n={m.n} />
      ))}
    </div>
  );
}

/**
 * THE REVEAL — the card that says what the last module press handed over.
 *
 * A MODULE HAS NOWHERE TO LAND. A turret draw puts a card in the corner
 * and the player is left holding it; a module is in force the instant it
 * is paid for (Game.buyMods, Game.buyRelics), so without this the only
 * feedback for a hundred and fifty thousand scrap would be a chip quietly
 * appearing in a row at the other end of the screen. So the draw gets a
 * card of its own for a few seconds, over the buttons, in the band's
 * colour and saying what it does — and then it goes, because it is not a
 * thing being held.
 *
 * ONE PRESS IS ONE CARD, whatever the amount button said. A x10 press
 * gets ONE reveal listing its ten, not ten cards queued five seconds
 * apart: the player pressed once and wants to know what that press did,
 * and by the tenth card the wave they bought it for would be over. So a
 * single draw gets the tall card with its blurb — there is room to say
 * what it does, and a player who bought one thing is reading it — and a
 * fleet of them gets a compact list, band colour a row, which is the most
 * that can honestly be said about ten things at once.
 *
 * ONE PRESS IS ALSO ONE CATEGORY, because it is one button: a draw is all
 * mods or all relics (game.ts ModDraw), which is what lets the card say
 * the right word rather than "3 modules".
 */

/** what the card needs to know about one drawn module, whichever catalog
 *  it came out of — the reveal is the same card either way */
type Drawn = { id: string; name: string; glyph: ModGlyph | RelicGlyph; rarity: keyof typeof RARITY; blurb: string; note: string | null };

const drawnMod = (id: ModId): Drawn => {
  const d = modDef(id);
  return { id, name: modName(d), glyph: d.glyph, rarity: d.rarity, blurb: modBlurb(d), note: "on new turrets" };
};

const drawnRelic = (id: RelicId): Drawn => {
  const d = relicDef(id);
  return { id, name: d.name, glyph: d.glyph, rarity: d.rarity, blurb: d.blurb, note: null };
};

/**
 * CHOOSE 1 MOD — the panel that stands over the deal between the press of
 * M and the mod actually landing (game.ts ModOffer).
 *
 * A MOD PRESS IS A DECISION NOW. It used to be a slot machine: press,
 * something lands, press again — and a run with money did that twenty
 * times between waves for twenty numbers too small to feel. A mod costs
 * two and a half times as much and is worth two and a half times as much
 * (economy.ts MOD_ROLL_PRICE, mods.ts), so there are far fewer presses,
 * and a press that happens rarely can afford to ask a question. Three on
 * the table, one taken, the other two gone.
 *
 * THE MONEY IS ALREADY SPENT when this appears, so there is no cancel and
 * no close button: this is not a shop confirming a purchase, it is the
 * purchase asking what it bought. The panel stands until one of the three
 * is clicked — the board carries on running underneath it, the wave does
 * not stop, and a player who wants to keep fighting takes one and gets
 * back to it.
 *
 * IT SAYS "CHOOSE 1 MOD" IN WORDS, at the top, in the biggest type on the
 * panel. A row of three cards is a choice to anyone who has seen one
 * before and a mystery to everyone else, and the one thing a player must
 * not have to work out mid-wave is what the game is waiting for.
 *
 * ONE, TWO, THREE ARE KEYS. The whole corner is a keyboard — T, M, G, X,
 * R — so the panel that interrupts it is one too, and the number printed
 * on each card is the key that takes it (Deal.tsx).
 *
 * EACH CARD IS THE REVEAL'S OWN CARD (SingleReveal, right below): the
 * band's colour, the band's name and the mod's blurb. What a player needs
 * in order to choose is exactly what the reveal used to tell them once it
 * was too late to choose anything.
 */
export function ModChoice({
  offer,
  onChoose,
}: {
  offer: ModOffer | null;
  onChoose: (id: ModId) => void;
}) {
  const ids = offer?.ids ?? [];
  // the number keys take a card, the way the deal's letters buy one (Deal.tsx)
  useEffect(() => {
    if (ids.length === 0) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const m = /^Digit([1-3])$/.exec(e.code);
      if (!m) return;
      const id = ids[Number(m[1]) - 1];
      if (!id) return;
      e.preventDefault();
      onChoose(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ids, onChoose]);
  if (!offer || ids.length === 0) return null;
  const copies = Math.max(1, offer.copies);
  return (
    <div
      className="ms-pane pointer-events-auto flex w-[17rem] flex-col gap-1.5 p-2"
      role="group"
      aria-label={`Choose 1 mod of ${offer.ids.length}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-[13px] font-bold uppercase leading-none tracking-wide text-[#FFD37F]">
          {offer.from ? `${offer.from} opened` : "Choose 1 mod"}
        </span>
        {/* THE AMOUNT, WHERE IT MATTERS: a x4 press paid four fees and the
            one card taken is taken four times (game.ts ModOffer). That is
            a fact about the choice, so it is read before it and not after */}
        {copies > 1 && (
          <span className="font-display text-[10px] font-bold uppercase leading-none tabular-nums text-[#7BDFF2]">
            {"×"}
            {copies} copies
          </span>
        )}
      </div>
      <span className="text-[9px] font-bold uppercase leading-none tracking-widest text-[#8A8E98]">
        {copies > 1 ? `The one you pick, ${copies} times over` : "The other two are gone"}
      </span>
      {offer.ids.map((id, i) => (
        <ChoiceCard key={id} id={id} slot={i + 1} copies={copies} onChoose={onChoose} />
      ))}
    </div>
  );
}

/** one of the three, as a button: its band's colour, its glyph, what it
 *  does, and the number key that takes it */
function ChoiceCard({
  id,
  slot,
  copies,
  onChoose,
}: {
  id: ModId;
  /** its place on the table, which is also its key: 1, 2 or 3 */
  slot: number;
  copies: number;
  onChoose: (id: ModId) => void;
}) {
  const d = drawnMod(id);
  const r = RARITY[d.rarity];
  // WHAT THE PRESS ADDS, and only where the amount makes that differ from
  // the blurb — every mod is linear in copies (mods.ts), so the total at
  // `copies` IS what these copies are worth, and at x1 it would be the
  // blurb's own number said twice
  const stack = copies > 1 ? stackLine(modDef(id), copies) : null;
  return (
    <button
      onClick={() => onChoose(id)}
      aria-keyshortcuts={String(slot)}
      aria-label={`Take ${d.name}, ${r.name}. ${d.blurb} Shortcut ${slot}.`}
      className="ms-deal-card ms-tile flex w-full cursor-pointer flex-col gap-1 p-2 text-left"
      style={tile(r.color)}
    >
      <div className="flex items-center gap-1.5">
        {/* the number key, printed the way the deal's letters are
            (globals.css .ms-key) but sitting IN the row rather than over
            the corner, because the glyph already owns the corner */}
        <span className="shrink-0 bg-[var(--ms-key-face)] px-[3px] font-display text-[9px] font-bold leading-[12px] text-[var(--ms-outline)]">
          {slot}
        </span>
        <span
          className="ms-tile ms-tile-sm flex h-[22px] w-[22px] shrink-0 items-center justify-center"
          style={tile(r.color)}
        >
          <Glyph glyph={d.glyph} />
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase leading-none tracking-wide"
          style={{ color: r.color }}
        >
          {d.name}
        </span>
      </div>
      <span
        className="text-[9px] font-bold uppercase leading-none tracking-wide opacity-70"
        style={{ color: r.color }}
      >
        {r.name}
      </span>
      <span className="text-[10px] leading-snug text-[#EDEDEF]">{d.blurb}</span>
      {stack && (
        <span className="text-[10px] font-bold leading-snug" style={{ color: r.color }}>
          {stack} at {copies} copies
        </span>
      )}
    </button>
  );
}

export function ModReveal({ draw }: { draw: ModDraw }) {
  if (!draw || draw.ids.length === 0) return null;
  const rows: Drawn[] =
    draw.kind === "relic" ? draw.ids.map(drawnRelic) : draw.ids.map(drawnMod);
  if (rows.length === 1) return <SingleReveal d={rows[0]} />;
  // the same module drawn twice in one press is ONE row with a count on
  // it: "Coolant x3" is what happened, and three identical rows is not.
  // (A relic press can never repeat — a relic is held once — so in
  // practice this only ever folds mods)
  const folded: { d: Drawn; n: number }[] = [];
  for (const d of rows) {
    const at = folded.find((f) => f.d.id === d.id);
    if (at) at.n++;
    else folded.push({ d, n: 1 });
  }
  return (
    <div
      className="ms-pane pointer-events-none flex w-[13rem] flex-col gap-1 p-2"
      role="status"
    >
      <span className="text-[10px] font-bold uppercase leading-none tracking-widest text-[#A6A6AF]">
        {rows.length} {draw.kind === "relic" ? "relics" : "mods"}
      </span>
      {folded.map((row) => {
        const r = RARITY[row.d.rarity];
        return (
          <span key={row.d.id} className="flex items-center gap-1.5">
            <span
              className="ms-tile ms-tile-sm flex h-[18px] w-[18px] shrink-0 items-center justify-center"
              style={tile(r.color)}
            >
              <Glyph glyph={row.d.glyph} className="h-[12px] w-[12px]" />
            </span>
            <span
              className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase leading-none tracking-wide"
              style={{ color: r.color }}
            >
              {row.d.name}
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
function SingleReveal({ d }: { d: Drawn }) {
  const r = RARITY[d.rarity];
  return (
    <div
      className="ms-deal-card ms-tile pointer-events-none flex w-[13rem] flex-col gap-1 p-2"
      style={tile(r.color)}
      role="status"
    >
      <div className="flex items-center gap-1.5">
        <span
          className="ms-tile ms-tile-sm flex h-[22px] w-[22px] shrink-0 items-center justify-center"
          style={tile(r.color)}
        >
          <Glyph glyph={d.glyph} />
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase leading-none tracking-wide"
          style={{ color: r.color }}
        >
          {d.name}
        </span>
      </div>
      <span className="text-[9px] font-bold uppercase leading-none tracking-wide opacity-70" style={{ color: r.color }}>
        {d.note ? `${r.name} — ${d.note}` : r.name}
      </span>
      <span className="text-[10px] leading-snug text-[#EDEDEF]">{d.blurb}</span>
    </div>
  );
}
