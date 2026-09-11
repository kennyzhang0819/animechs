"use client";

import { useState, type ReactNode, type RefObject } from "react";

import {
  rewardBlurb,
  rewardTargeting,
  rewardText,
  unlocksOf,
  type UnlockEntry,
  type UnlockKind,
} from "@/game/track";
import { BackButton } from "./Board";
import { HoverCard, useHoverCard } from "./HoverCard";

/**
 * THE UNLOCKS BOARD — everything the track will ever hand out, on one
 * screen, filtered by what kind of thing it is.
 *
 * IT REPLACES THE MUTATOR CODEX, and it replaces the shape that codex
 * was. That board was a pannable, zoomable CAMERA over a shelf of tiles —
 * the tech tree's own machinery, kept after the tree it was built for
 * went away — and a camera is the wrong instrument for a list you read
 * once and close. A player asking "what is there" wants to scroll, and a
 * board that needs to be dragged into view first is a board that answers
 * slower than a page. So: a page.
 *
 * AND IT IS EVERY CATEGORY, not just the rules. The codex answered "what
 * can happen to me"; a save also wants "what guns are there", "what
 * shapes are there", "which maps", and soon "what upgrades" — all of them
 * the same question in four coats, and all of them were only answerable
 * by walking the track row by row looking for the right chips. One board,
 * one strip of filters, one tile design for all of it.
 *
 * NOTHING HERE IS BUYABLE and nothing is hidden. Every unlock that exists
 * is drawn, locked ones dimmed with the level that opens them, exactly as
 * a StarCraft II player can read the mutator list before queueing. The
 * surprise is meant to be WHICH ones a run rolls, not what exists.
 */

/** the filters, in the order the track deals them out */
const FILTERS: readonly { id: UnlockKind; label: string }[] = [
  { id: "turret", label: "Turrets" },
  { id: "shape", label: "Shapes" },
  { id: "world", label: "Maps" },
  { id: "mutator", label: "Mutators" },
  { id: "upgrade", label: "Upgrades" },
];

/**
 * ONE UNLOCK, AS A TILE: its face in a bordered square, its name under
 * it, and everything else in a card that opens on hover.
 *
 * IT IS THE CODEX TILE WITH THE CAMERA TAKEN OUT — same square, same
 * label, same card — so a player who learned that board has learned this
 * one. The FACE and the BORDER are what it is read by: the turret's
 * sprite in its rarity's colour, the shape's own diagram in its band's,
 * the map's thumbnail, the mutator's face in its weight's. A locked tile
 * is dimmed through its CONTENT rather than its wrapper, so the name
 * under it and the card it opens stay readable at full strength.
 */
function UnlockTile({
  entry,
  reached,
  face,
  color,
  tag,
}: {
  entry: UnlockEntry;
  reached: boolean;
  face: ReactNode;
  color: string;
  /** the corner word: the band, the weight — or nothing */
  tag?: string;
}) {
  const tip = useHoverCard("auto");
  const text = rewardText(entry.reward);
  const targeting = rewardTargeting(entry.reward);
  // the name without its "Turret: " / "Map: " prefix — the strip above
  // already says which kind is on screen, and a column of tiles all
  // captioned "Turret:" is a column of noise
  const name = text.includes(": ") ? text.slice(text.indexOf(": ") + 2) : text;
  return (
    <div
      ref={tip.ref as RefObject<HTMLDivElement | null>}
      {...tip.anchorProps}
      role="listitem"
      tabIndex={0}
      aria-label={`${text}${tag ? `, ${tag}` : ""}. ${
        reached ? "" : `Locked — opens at level ${entry.level}. `
      }${rewardBlurb(entry.reward)}`}
      className="flex w-[7.5rem] shrink-0 flex-col items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD37F]"
    >
      <div
        className={`relative flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden border-2 bg-[#0b0b0d] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.85)] ${
          reached ? "" : "opacity-40"
        }`}
        style={{ borderColor: reached ? color : "#3A3A40", color: reached ? color : "#71717C" }}
      >
        {face}
      </div>
      <div
        className="w-full truncate text-center text-[13px] font-bold uppercase tracking-wide"
        style={{ color: reached ? "#EDEDEF" : "#71717C" }}
      >
        {name}
      </div>
      {/* THE LEVEL, under the name, and only where it is still owed. A
          tile that is already earned has nothing to say here — printing
          "Level 3" on something a player has had for twenty levels is a
          number they have to read and then discard */}
      <div className="text-[11px] font-bold uppercase tracking-widest text-[#71717C]">
        {reached ? "" : `Level ${entry.level}`}
      </div>
      <HoverCard
        tip={tip}
        title={name}
        tag={reached ? tag : `Level ${entry.level}`}
        color={reached ? color : "#71717C"}
        align="center"
      >
        {rewardBlurb(entry.reward)}
        {targeting && (
          <span className="mt-1.5 block font-bold text-[#A6A6AF]">{targeting}</span>
        )}
        {!reached && (
          <span className="mt-1.5 block text-[#71717C]">
            Not yours yet — level {entry.level} hands it over.
          </span>
        )}
      </HoverCard>
    </div>
  );
}

export default function Unlocks({
  onBack,
  backLabel,
  level,
  tabs,
  renderFace,
}: {
  onBack: () => void;
  backLabel: string;
  /** the level the save PLAYS at — the dev door's, so a fully unlocked
   *  save reads a fully lit board */
  level: number;
  /** the strip that switches boards — built by the screen that owns both */
  tabs: ReactNode;
  /** how one entry is drawn and coloured. It lives in Progress.tsx beside
   *  the track's own chips, so a turret wears the same face and the same
   *  rarity in both places and the two boards cannot drift apart */
  renderFace: (entry: UnlockEntry) => { face: ReactNode; color: string; tag?: string };
}) {
  const [filter, setFilter] = useState<UnlockKind>("turret");
  const entries = unlocksOf(filter);
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0B0B0D] text-[#EDEDEF]">
      {/* the chrome: back and the board tabs, in the same corner the track
          pins them to, so switching never moves the hand */}
      <div className="ui-zoom absolute left-[1rem] top-[1rem] z-10 flex items-center gap-2">
        <BackButton label={backLabel} onClick={onBack} />
        {tabs}
      </div>

      <div className="ui-zoom mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden px-4 pt-[5rem]">
        {/* THE FILTER STRIP, one segment a category. It is a filter and
            not a set of headings down one long page: the board is read
            with a question already in mind ("what shapes are there"), and
            the answer should be the only thing on screen */}
        <div role="tablist" aria-label="unlocks" className="ms-seg mb-4 flex self-center">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={f.id === filter}
              onClick={() => setFilter(f.id)}
              className="ms-btn h-9 px-4 text-[14px]"
            >
              {f.label}
            </button>
          ))}
        </div>

        <div
          role="list"
          aria-label={`${FILTERS.find((f) => f.id === filter)?.label} unlocks`}
          className="flex flex-1 flex-wrap content-start justify-center gap-x-2 gap-y-5 overflow-y-auto pb-12"
        >
          {entries.length === 0 ? (
            /* the upgrades, which exist in the code and are dealt by
               nothing yet (track.ts UPGRADES_ON_TRACK). An empty shelf
               with a sentence on it is honest; a shelf of rungs no save
               can ever be handed is a lie told in tiles */
            <div className="ms-pane mt-6 max-w-md px-5 py-4 text-center text-[14px] text-[#A6A6AF]">
              <div className="mb-1 font-display text-[15px] font-bold uppercase tracking-widest text-[#EDEDEF]">
                Nothing here yet
              </div>
              Turret upgrades are written and waiting; nothing on the track hands
              one out at the moment. They will show up here when it does.
            </div>
          ) : (
            entries.map((e, i) => {
              const { face, color, tag } = renderFace(e);
              return (
                <UnlockTile
                  key={i}
                  entry={e}
                  reached={level >= e.level}
                  face={face}
                  color={color}
                  tag={tag}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
