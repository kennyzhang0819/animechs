"use client";

import { MUTATIONS, MUT_COST_MAX, type MutationDef } from "@/game/mutation";
import { RUNG_COUNT, rungColor, rungLabel, tierMutationPoints } from "@/game/ladder";
import Board, { BackButton, useTouchOnly, type Cam } from "./Board";
import { useState, type ReactNode, type RefObject } from "react";

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
 * ONE NUMBER SURVIVED, on the rail: the points each difficulty spends.
 * That is not the algorithm leaking out — it is the ladder, and it is the
 * only thing here that tells a player stepping from Level 5 to Level 6
 * what they are taking on.
 *
 * NOTHING IS HIDDEN AND NOTHING IS TEASED: every rule that exists is
 * drawn, exactly as a StarCraft II player can read the mutator list before
 * queueing. The surprise is meant to be WHICH ones, not what exists.
 */

/** the codex's colour, kept from the old column — deliberately NOT the
 *  tree's gold, because gold on the other board means "bought, owned,
 *  yours", and there is nothing here to own */
export const MUT_LIT = "#FF8ACB";

/** three chevrons climbing — the codex tab's face, and the fallback card
 *  glyph for a mutator with no face of its own */
export const MUT_GLYPH = "M12 2 4 9h5v2H4l8 7 8-7h-5V9h5z";
/** a disc with a wedge bitten out of it — Hungry's maw */
const HUNGER_GLYPH = "M12 2a10 10 0 1 0 8.66 15L12 12l8.66-5A9.98 9.98 0 0 0 12 2z";

/** the face a mutator wears on its card, as a path; MUT_GLYPH is the
 *  fallback, so a rule added without art still draws as something */
const MUT_FACE: Record<string, string> = {
  hungry: HUNGER_GLYPH,
};

/**
 * ART, where a rule has some — pixel sprites, drawn at the scale the
 * turret icons are, because a card whose whole job is "how bad is this"
 * leads with a face rather than a number. A drawn icon beats a path the
 * moment one exists, so the glyphs below are only ever reached by a rule
 * nobody has illustrated yet.
 */
const MUT_ART: Record<string, string> = {
  hungry: "/mutators/hungry.png",
  speedy: "/mutators/speedy.png",
};

/** the card's face: the sprite if the rule has one, else its glyph */
function MutationFace({ id, size }: { id: string; size: string }) {
  const art = MUT_ART[id];
  if (art)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite
      <img
        src={art}
        alt=""
        className={`${size} shrink-0 object-contain [image-rendering:pixelated]`}
      />
    );
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${size} shrink-0 fill-current`}
      style={{ color: MUT_LIT }}
      aria-hidden="true"
    >
      <path fillRule="evenodd" d={MUT_FACE[id] ?? MUT_GLYPH} />
    </svg>
  );
}

/**
 * THE THREE WEIGHTS — a border colour and a word, and no longer a column.
 *
 * THE COST SCALE (MUT_COST_MIN), WORN RATHER THAN PRINTED. `max` is the
 * top cost that lands in the band; it picks the tile's border colour and
 * is never shown, because a player does not need to know Speedy is worth
 * five points to know it is the worst thing in the catalog. The word turns
 * up once, in the hover card, where it is the answer to "how bad is this".
 *
 * The tiles used to be grouped under these as three labelled columns.
 * Grouping was a second thing to read before you could read anything else,
 * and with the colour on every border it said nothing the border did not.
 *
 * The last band must reach MUT_COST_MAX or a legal mutator would have no
 * colour at all (checked below, the way mutation.ts checks its own
 * catalog).
 */
const BANDS: readonly { label: string; color: string; max: number }[] = [
  { label: "Light", color: "#7BE58A", max: 2 },
  { label: "Heavy", color: "#FFB65C", max: 4 },
  { label: "Brutal", color: "#FF6B6B", max: MUT_COST_MAX },
];

if (BANDS[BANDS.length - 1].max < MUT_COST_MAX)
  throw new Error(
    `the weights stop at ${BANDS[BANDS.length - 1].max} but a mutator may cost ${MUT_COST_MAX}`,
  );

/** how bad a rule is, as the hover card says it */
const bandOf = (cost: number): { label: string; color: string } =>
  BANDS.find((b) => cost <= b.max) ?? BANDS[BANDS.length - 1];

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

const ROOT_W = 520;
const ROOT_H = 86;
const ROOT_Y = 56;
const GRID_Y = 200;

const COUNT = MUTATIONS.length;
const COLS = Math.max(1, Math.min(GRID_COLS, COUNT));
const ROWS = Math.max(1, Math.ceil(COUNT / COLS));

const GRID_W = COLS * CELL_W;
const BOARD_W = Math.max(GRID_W, ROOT_W) + PAD * 2;
/** the board carries a taller bottom margin than top, so the fit-on-mount
 *  zoom leaves the ladder rail somewhere to sit that is not on top of the
 *  last row of tiles */
const BOTTOM_PAD = 150;
const BOARD_H = GRID_Y + ROWS * CELL_H + BOTTOM_PAD;
const ROOT_CX = BOARD_W / 2;

/** the centre of tile `i`, in board px. A short last row is centred under
 *  the full ones rather than left-aligned under them */
function tileAt(i: number): { cx: number; cy: number } {
  const row = Math.floor(i / COLS);
  const inRow = Math.min(COLS, COUNT - row * COLS);
  const col = i - row * COLS;
  const rowW = inRow * CELL_W;
  return {
    cx: ROOT_CX - rowW / 2 + (col + 0.5) * CELL_W,
    cy: GRID_Y + (row + 0.5) * CELL_H,
  };
}

/**
 * ONE MUTATOR, AS A THUMBNAIL: its face in a bordered square, its name
 * under it, and the rule in a card that opens on hover.
 *
 * IT IS THE TECH TREE'S NODE WITH THE MONEY TAKEN OUT. Same square, same
 * label, same card, same touch rule — the first tap opens the card — and
 * that is the whole point: a player who has learned one board has learned
 * this one. What it does not have is a second tap that spends, because
 * there is nothing here to buy.
 */
function MutationTile({
  def,
  index,
  touch,
  armed,
  onArm,
}: {
  def: MutationDef;
  index: number;
  touch: boolean;
  armed: string | null;
  onArm: (id: string | null) => void;
}) {
  const band = bandOf(def.cost);
  const { cx, cy } = tileAt(index);
  // on touch the card follows `armed`, not the pointer: iOS does not
  // reliably focus a <button> it was tapped on, so hanging the card off
  // focus-within alone would leave taps opening nothing
  const showCard = touch && armed === def.id;
  return (
    <div
      className="group absolute"
      style={{ left: cx - NODE / 2, top: cy - NODE / 2, width: NODE, height: NODE }}
    >
      <button
        aria-label={`${def.name}: ${band.label} mutator. ${def.blurb}`}
        onClick={() => onArm(armed === def.id ? null : def.id)}
        className="flex h-full w-full items-center justify-center rounded-lg border-2 bg-[#151518] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FF8ACB]"
        style={{ borderColor: band.color }}
      >
        <MutationFace id={def.id} size="h-14 w-14" />
      </button>
      <div className="text-center text-[12px] font-bold uppercase tracking-widest text-[#EDEDEF]">
        {def.name}
      </div>
      {/* hover card: what this rule does — opened by resting on the tile
          with a mouse, and by a tap with a finger */}
      <div
        className={`pointer-events-none absolute left-1/2 top-full z-10 mt-5 w-56 -translate-x-1/2 rounded border p-3 text-left shadow-lg ${
          showCard ? "block" : "hidden group-hover:block group-focus-within:block"
        }`}
        style={{ borderColor: band.color, background: "#151518" }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-bold text-[#EDEDEF]">{def.name}</span>
          <span
            className="text-[12px] font-bold uppercase tracking-widest"
            style={{ color: band.color }}
          >
            {band.label}
          </span>
        </div>
        <div className="mt-1 text-[14px] leading-snug text-[#A6A6AF]">{def.blurb}</div>
      </div>
    </div>
  );
}

/**
 * THE LADDER RAIL — pinned to the bottom, not laid on the board.
 *
 * THE ONE NUMBER ON THIS SCREEN: what each difficulty spends on its roll.
 * It is here rather than on the cards because it is the only thing true of
 * every card at once, and because it is the ladder rather than the
 * algorithm — a player stepping up a difficulty can see the number go up
 * without ever being told what a rule costs.
 *
 * IT CARRIED THE RULE COUNT TOO AND THAT WAS ONE NUMBER TOO MANY. Two
 * figures per tile read as a spec sheet; one reads as a difficulty.
 *
 * LEVEL 1 IS DRAWN AS A DASH RATHER THAN A ZERO. A tier that rolls nothing
 * is not a tier that rolls cheaply, and a zero reads as the bottom of a
 * scale rather than as "off".
 */
function LadderRail() {
  return (
    <div
      className="pointer-events-auto absolute bottom-[max(1rem,var(--safe-b))] left-1/2 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded border border-[#2E2E36] bg-[#151518]/90 px-3 py-1.5 backdrop-blur"
      data-ui
    >
      <span className="text-[12px] uppercase tracking-widest text-[#71717C]">
        Mutation points
      </span>
      <div className="flex flex-wrap justify-center gap-1">
        {Array.from({ length: RUNG_COUNT }, (_, t) => {
          const pts = tierMutationPoints(t);
          return (
            <div
              key={t}
              title={`${rungLabel(t)}: ${pts} mutation points`}
              className="flex min-w-[38px] items-baseline justify-center gap-1 rounded border border-[#2E2E36] bg-[#101013] px-1.5 py-0.5"
            >
              <span className="text-[11px] font-bold" style={{ color: rungColor(t) }}>
                {t + 1}
              </span>
              <span
                className={`text-[13px] font-bold ${pts > 0 ? "text-[#EDEDEF]" : "text-[#4A4A55]"}`}
              >
                {pts > 0 ? pts : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MutationTree({
  onBack,
  backLabel,
  tabs,
  cam,
}: {
  onBack: () => void;
  backLabel: string;
  /** the strip that switches boards — built by the screen that owns both,
   *  so the two tabs can never disagree about what the other is called */
  tabs: ReactNode;
  cam: RefObject<Cam | null>;
}) {
  const touch = useTouchOnly();
  // the one tile a finger has opened; tapping another moves the card there
  const [armed, setArmed] = useState<string | null>(null);
  return (
    <Board
      width={BOARD_W}
      height={BOARD_H}
      cam={cam}
      chrome={
        <>
          <div
            className="absolute top-[max(1rem,var(--safe-t))] left-[max(1rem,var(--safe-l))] flex items-center gap-2"
            data-ui
          >
            <BackButton label={backLabel} onClick={onBack} />
            {tabs}
          </div>
          <LadderRail />
        </>
      }
    >
      {/* the root: one line, because the tiles are the rest of the answer */}
      <div
        className="absolute flex flex-col justify-center rounded-lg border-2 bg-[#151518] px-5 text-center"
        style={{
          left: ROOT_CX - ROOT_W / 2,
          top: ROOT_Y,
          width: ROOT_W,
          height: ROOT_H,
          borderColor: MUT_LIT,
        }}
      >
        <div
          className="text-[15px] font-bold uppercase tracking-widest"
          style={{ color: MUT_LIT }}
        >
          Mutators
        </div>
        <p className="mt-1 text-[14px] leading-snug text-[#A6A6AF]">
          Rolled for you at deploy, from{" "}
          <span className="font-bold" style={{ color: rungColor(1) }}>
            {rungLabel(1)}
          </span>{" "}
          up.
        </p>
      </div>

      {MUTATIONS.map((m, i) => (
        <MutationTile
          key={m.id}
          def={m}
          index={i}
          touch={touch}
          armed={armed}
          onArm={setArmed}
        />
      ))}
    </Board>
  );
}
