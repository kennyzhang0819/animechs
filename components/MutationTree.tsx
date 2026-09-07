"use client";

import {
  MUTATIONS,
  MUT_COST_MAX,
  type MutationDef,
} from "@/game/mutation";
import { mutatorUnlockLevel } from "@/game/track";
import Board, { BackButton, type Cam } from "./Board";
import { HoverCard, useHoverCard } from "./HoverCard";
// the face and the weight live beside the deploy dialog that also draws
// them (mutationFace.tsx) — one rule must not read Brutal here and
// Heavy there
import { bandFor, MutationFace, MUT_GLYPH, MUT_LIT } from "./mutationFace";

/** the tab strip over both boards wears the codex glyph — re-exported so
 *  TechTree keeps asking the board it is a tab of, not a module below it */
export { MUT_GLYPH, MUT_LIT };
import { type ReactNode, type RefObject } from "react";

/**
 * THE MUTATOR CODEX — a BOARD of its own, behind a tab, beside the tech
 * tree rather than on top of it.
 *
 * IT WAS A DIALOG AND THAT WAS THE WRONG SHAPE. Mutation started as the
 * tree's left column (a chain of switches a player flipped on for a harder
 * run), became a chrome button and a modal panel when the rules stopped
 * being chosen at all (see mutation.ts), and is now a second board. The
 * modal was wrong for the same reason a scrolling page was wrong for the
 * tree: a catalog that grows in two directions — more rules, and more
 * weights of rule — is a MAP, and a 500px dialog with a scrollbar in it
 * is a keyhole to read a map through.
 *
 * IT IS A TAB, NOT A SCREEN. The player's question here is "what can
 * happen to me, and what can I do about it", and the two halves of that
 * answer are these two boards. One tab strip, one back button, one camera
 * apiece that survives the switch (see Cam), so flicking between them
 * costs nothing and loses nothing.
 *
 * NOTHING ON THIS BOARD IS BUYABLE, and that is the whole reason it is not
 * an eleventh branch of the tree. Every click over there spends money;
 * every click here spends nothing, because there is nothing to own.
 *
 * IT IS A SHELF OF THUMBNAILS, NOT A SPEC SHEET, and that is a deliberate
 * cut. It has been, in order: a paragraph on how the roll works, a point
 * cost on every card, a weight range on every branch, and three labelled
 * columns to hang them from. All of that is TRUE and none of it is a
 * player's question. What they came to ask is "what can happen to me, and
 * how bad is it" — which a FACE answers at a glance and a table does not.
 *
 * SO: one tile per rule, all of them in one wrapped row, and the severity
 * is the colour of the tile's border and nothing else. There is no
 * grouping left to read, no header over a column and no number on a card.
 * The words — the rule, and the word for how bad it is — are in the hover
 * card, which is the tech tree's own gesture: a mouse rests on a tile and
 * it opens, a finger taps it and it opens, and nothing on this board ever
 * costs anything to ask about.
 *
 * AND NOW NO NUMBERS AT ALL. A rail along the bottom used to print what
 * each difficulty spends on its roll, and a bordered banner over the grid
 * used to say the roll happens at deploy. Both were true and neither was
 * the player's question, which is "what can happen to me, and how bad is
 * it" — a face and a border colour answer that, and a points table only
 * invites arithmetic about a roll nobody controls. What is left on this
 * board is the tiles, the tab strip and the way back.
 *
 * NOTHING IS HIDDEN AND NOTHING IS TEASED: every rule that exists is
 * drawn, exactly as a StarCraft II player can read the mutator list before
 * queueing. The surprise is meant to be WHICH ones, not what exists.
 *
 * WHAT IS DRAWN AND WHAT IS IN THE DECK ARE TWO DIFFERENT THINGS. The
 * track opens one rule a level past its roster phase (MUTATOR_UNLOCKS in
 * track.ts), and until it does, that rule cannot be rolled at this save.
 * A locked tile is therefore DIMMED and its border goes grey — it is
 * still drawn, still named, still readable, because a codex that hides
 * what is coming is the tease this board refuses to be. The card says
 * which level puts it in the deck, which is the one number a locked tile
 * owes the player.
 */

// ---------- board geometry ---------------------------------------------
//
// A ROW OF TILES UNDER A LINE OF TEXT, wrapping at GRID_COLS. There is no
// tree to lay out any more — no trunk, no branches, no columns — so the
// only arithmetic left is where the next tile goes.
//
// It is still a BOARD rather than a page: the catalog is meant to grow,
// and a shelf of thirty rules wants the same camera the tech tree has
// rather than a scrollbar. Two rules fit on a phone today; the layout is
// the same either way.

const PAD = 90;
/** the tile itself — the same 88px square the tech tree's nodes are, so
 *  the two boards read as one game */
const NODE = 88;
/** cell = tile + the name under it + the gap to the next one */
const CELL_W = 150;
const CELL_H = 140;
/** how many tiles a row holds before it wraps */
const GRID_COLS = 6;

/**
 * WHERE THE FIRST ROW STARTS. There is no banner over it any more — the
 * board opened with a bordered frame reading "Mutators / rolled for you at
 * deploy", which is a caption on a shelf of faces that already says it,
 * and a title nobody needs is a thing to scroll past on a phone. The tiles
 * ARE the answer, so they start near the top.
 */
const GRID_Y = 70;

const COUNT = MUTATIONS.length;
const COLS = Math.max(1, Math.min(GRID_COLS, COUNT));
const ROWS = Math.max(1, Math.ceil(COUNT / COLS));

const GRID_W = COLS * CELL_W;
const BOARD_W = GRID_W + PAD * 2;
/** matched to GRID_Y, so the fit-on-mount zoom centres the tiles. It was
 *  half again as deep to leave the ladder rail somewhere to sit that was
 *  not on top of the last row; with the rail gone that margin was just a
 *  shelf of tiles sitting high on the screen */
const BOTTOM_PAD = GRID_Y;
const BOARD_H = GRID_Y + ROWS * CELL_H + BOTTOM_PAD;
/** the board's centre line — every row of tiles is centred on it */
const GRID_CX = BOARD_W / 2;

/** the centre of tile `i`, in board px. A short last row is centred under
 *  the full ones rather than left-aligned under them */
function tileAt(i: number): { cx: number; cy: number } {
  const row = Math.floor(i / COLS);
  const inRow = Math.min(COLS, COUNT - row * COLS);
  const col = i - row * COLS;
  const rowW = inRow * CELL_W;
  return {
    cx: GRID_CX - rowW / 2 + (col + 0.5) * CELL_W,
    cy: GRID_Y + (row + 0.5) * CELL_H,
  };
}

/**
 * ONE MUTATOR, AS A THUMBNAIL: its face in a bordered square, its name
 * under it, and the rule in a card that opens on hover.
 *
 * IT IS THE TECH TREE'S NODE WITH THE MONEY TAKEN OUT. Same square, same
 * label, same card, and
 * that is the whole point: a player who has learned one board has learned
 * this one. What it does not have is a second tap that spends, because
 * there is nothing here to buy.
 */
function MutationTile({
  def,
  index,
  level,
}: {
  def: MutationDef;
  index: number;
  /** the level this save plays at — what decides whether the rule is in
   *  the deck yet (mutatorUnlockLevel) */
  level: number;
}) {
  const band = bandFor(def);
  const opens = mutatorUnlockLevel(def.id);
  const locked = level < opens;
  const { cx, cy } = tileAt(index);
  // the card is the shared HoverCard on the body (see HoverCard.tsx): it
  // stays one size whatever the board is zoomed to, and nothing on the
  // board can clip or fade it. Centred under the tile, opening downward
  const tip = useHoverCard("down");
  return (
    // the whole tile — face AND name — is the anchor, so the card opens
    // under the name rather than across it. Focus bubbles up from the
    // button, so the keyboard opens it the same way
    <div
      ref={tip.ref as RefObject<HTMLDivElement | null>}
      {...tip.anchorProps}
      // no height on the wrapper: it grows to take the name in, so its
      // rectangle (the card's anchor) ends under the name and not the face
      className="absolute"
      style={{ left: cx - NODE / 2, top: cy - NODE / 2, width: NODE }}
    >
      <button
        type="button"
        aria-label={`${def.name}: ${band.label} mutator. ${def.blurb}${
          locked ? ` Locked — opens at level ${opens}.` : ""
        }`}
        // a locked tile is dimmed through its CONTENT and its border, not
        // through the wrapper: the name under it and the card that opens
        // on it are read at full strength either way
        className={`flex w-full items-center justify-center border-[3px] bg-[#0b0b0d] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.85)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FF8ACB] ${
          locked ? "opacity-40" : ""
        }`}
        style={{ height: NODE, borderColor: locked ? "#3A3A40" : band.color }}
      >
        <MutationFace id={def.id} size="h-14 w-14" />
      </button>
      <div
        className="text-center text-[14px] font-bold uppercase tracking-widest"
        style={{ color: locked ? "#71717C" : "#EDEDEF" }}
      >
        {def.name}
      </div>
      <HoverCard
        tip={tip}
        title={def.name}
        // a locked rule's corner says WHEN, not how bad: the weight is
        // what to fear about a rule you can meet, and the level is the
        // only thing worth knowing about one you cannot
        tag={locked ? `Level ${opens}` : band.label}
        color={locked ? "#71717C" : band.color}
        align="center"
      >
        {def.blurb}
        {locked && (
          <span className="mt-1 block" style={{ color: "#71717C" }}>
            Not in the deck yet — level {opens} puts it in.
          </span>
        )}
      </HoverCard>
    </div>
  );
}

export default function MutationTree({
  onBack,
  backLabel,
  level,
  tabs,
  cam,
}: {
  onBack: () => void;
  backLabel: string;
  /** the level the save PLAYS at — the dev door's level, not the raw one,
   *  so a fully unlocked save reads a fully lit codex */
  level: number;
  /** the strip that switches boards — built by the screen that owns both,
   *  so the two tabs can never disagree about what the other is called */
  tabs: ReactNode;
  cam: RefObject<Cam | null>;
}) {
  return (
    <Board
      width={BOARD_W}
      height={BOARD_H}
      cam={cam}
      chrome={
        <>
          <div
            className="absolute top-[1rem] left-[1rem] flex items-center gap-2"
            data-ui
          >
            <BackButton label={backLabel} onClick={onBack} />
            {tabs}
          </div>
        </>
      }
    >
      {MUTATIONS.map((m, i) => (
        <MutationTile
          key={m.id}
          def={m}
          index={i}
          level={level}
        />
      ))}
    </Board>
  );
}
