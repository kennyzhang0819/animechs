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
 * screen, with a filter over it.
 *
 * IT REPLACES THE MUTATOR CODEX, and it replaces the shape that codex
 * was. That board was a pannable, zoomable CAMERA over a shelf of tiles —
 * the tech tree's own machinery, kept after the tree it was built for
 * went away — and a camera is the wrong instrument for a list you read
 * once and close. A player asking "what is there" wants to scroll, and a
 * board that needs to be dragged into view first is a board that answers
 * slower than a page. So: a page.
 *
 * AND IT OPENS ON EVERYTHING. The filter strip is a filter and not a set
 * of doors: the default is ALL, every turret, shape, map and rule in one
 * grid, because the first question is "what is there" and only the second
 * one is "what shapes are there". Categories stay contiguous inside it —
 * the guns, then the shapes, then the maps, then the rules — so the grid
 * is one list and not a shuffle.
 *
 * IT IS A WALL OF SQUARES AND NOTHING ELSE. No names under the tiles: the
 * square IS the answer at this size — a turret's own sprite, a shape's
 * own diagram, a map's own thumbnail, a rule's own face — and forty-seven
 * captions under forty-seven pictures is a page of text pretending to be
 * a shelf. What the thing is CALLED is one hover away, with everything
 * else worth knowing about it.
 *
 * THE SQUARE IS THE TRACK'S OWN CHIP, ENLARGED. Not a new tile drawn to a
 * new size — the same markup the track's rows wear (RewardChip in
 * Progress.tsx), scaled bodily, so the padding inside the border and the
 * size of the face within it are identical to the ones a player has
 * already learned downstairs. A tile redrawn at a bigger size drifts; a
 * tile SCALED cannot.
 *
 * NOTHING HERE IS BUYABLE and nothing is hidden. Every unlock that exists
 * is drawn, locked ones dimmed and badged with the level that opens them,
 * exactly as a StarCraft II player can read the mutator list before
 * queueing. The surprise is meant to be WHICH ones a run rolls, not what
 * exists.
 */

/** the filters, in the order the track deals them out */
const FILTERS: readonly { id: UnlockKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "turret", label: "Turrets" },
  { id: "shape", label: "Shapes" },
  { id: "world", label: "Maps" },
  { id: "mutator", label: "Mutators" },
  { id: "upgrade", label: "Upgrades" },
];

/** every category, in strip order — what "All" concatenates */
const EVERY: readonly UnlockKind[] = ["turret", "shape", "world", "mutator", "upgrade"];

/**
 * THE CHIP'S OWN SIZE (Progress.tsx: h-9 w-9, border-2, a 26px face), and
 * what this board multiplies it by. Everything inside the square — the
 * border, the sprite, the padding between them — comes along at the same
 * factor, which is the whole point of scaling rather than re-sizing.
 */
const CHIP_PX = 36;
const TILE_PX = 60;
const SCALE = TILE_PX / CHIP_PX;

/**
 * ONE UNLOCK, AS A SQUARE. The track's chip at TILE_PX, its border in
 * whatever the thing's own colour is (rewardLook), and everything else —
 * the name included — in the card that opens on hover.
 *
 * A locked tile is dimmed through its CONTENT rather than its wrapper, so
 * the level badged on it and the card it opens stay readable at full
 * strength. The badge is the one thing printed on the square, because it
 * is the one thing a locked tile owes the player: when.
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
  /** the corner word of the hover card: the band, the weight — or nothing */
  tag?: string;
}) {
  const tip = useHoverCard("auto");
  const text = rewardText(entry.reward);
  const targeting = rewardTargeting(entry.reward);
  // the name without its "Turret: " / "Map: " prefix — the card's title
  // is a name, and the kind is said by the tile it is hanging off
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
      className="relative flex shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD37F]"
      style={{ width: TILE_PX, height: TILE_PX }}
    >
      {/* THE TRACK'S CHIP, SCALED. transform rather than width/height, so
          the border and the face inside keep their exact proportions —
          and rather than `zoom`, which would compound with the page's
          ui-zoom and throw the hover card's anchor arithmetic off
          (HoverCard.tsx divides by --ui-scale exactly once) */}
      <div
        className={`flex items-center justify-center overflow-hidden border-2 bg-black/80 ${
          reached ? "" : "opacity-40"
        }`}
        style={{
          width: CHIP_PX,
          height: CHIP_PX,
          transform: `scale(${SCALE})`,
          borderColor: reached ? color : "#3A3A40",
          color: reached ? color : "#71717C",
        }}
      >
        {face}
      </div>
      {/* WHEN, and only where it is still owed. A tile already earned has
          nothing to say here — printing "3" on something a player has had
          for twenty levels is a number to read and then discard */}
      {!reached && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-0 bg-[#0b0b0d]/90 px-[4px] py-[1px] text-[11px] font-bold leading-none text-[#A6A6AF]"
        >
          {entry.level}
        </span>
      )}
      <HoverCard
        tip={tip}
        title={name}
        tag={reached ? tag : `Level ${entry.level}`}
        color={reached ? color : "#71717C"}
        align="center"
      >
        {rewardBlurb(entry.reward)}
        {targeting && <span className="mt-1.5 block font-bold text-[#A6A6AF]">{targeting}</span>}
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
  const [filter, setFilter] = useState<UnlockKind | "all">("all");
  const entries = filter === "all" ? EVERY.flatMap((k) => unlocksOf(k)) : unlocksOf(filter);
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0B0B0D] text-[#EDEDEF]">
      {/* the chrome: back and the board tabs, in the same corner the track
          pins them to, so switching never moves the hand */}
      <div className="ui-zoom absolute left-[1rem] top-[1rem] z-10 flex items-center gap-2">
        <BackButton label={backLabel} onClick={onBack} />
        {tabs}
      </div>

      <div className="ui-zoom mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 pt-[5rem]">
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
          className="flex flex-1 flex-wrap content-start justify-center gap-1.5 overflow-y-auto pb-12"
        >
          {entries.length === 0 ? (
            /* the upgrades on their own, which exist in the code and are
               dealt by nothing yet (track.ts UPGRADES_ON_TRACK). An empty
               shelf with a sentence on it is honest; a shelf of rungs no
               save can ever be handed is a lie told in tiles */
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
