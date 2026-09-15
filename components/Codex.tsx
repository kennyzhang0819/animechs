"use client";

import { useState, type ReactNode, type RefObject } from "react";

import {
  rewardBlurb,
  rewardNote,
  rewardText,
  unlocksOf,
  type UnlockEntry,
  type UnlockKind,
} from "@/game/track";
import { BackButton } from "./Board";
import { HoverCard, useHoverCard } from "./HoverCard";
import { tile } from "./tile";

/**
 * THE CODEX — everything the track will ever hand out, on one
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
 * of doors: the default is ALL, every turret, mod, relic, map and rule in
 * one grid, because the first question is "what is there" and only the
 * second one is "what kind of thing is there". Categories stay contiguous
 * inside it — the guns, then the mods, then the relics, then the rules,
 * then the maps (FILTERS) — so the grid is one list and not a shuffle.
 *
 * THE SHAPES ARE NOT ON IT. Every save owns all five squares from wave
 * one (formation.ts), nothing on the track deals one, and a tab of tiles
 * that are lit for everybody forever answers no question this board is
 * for.
 *
 * AND INSIDE A CATEGORY IT IS SORTED BY RARITY (track.ts, unlocksOf):
 * commons first and purples last, with the level a tiebreak inside a
 * band. The tiles carry no captions, so the border is the only thing a
 * row of them can teach — and a shelf that walks the four colours in
 * order teaches it, where one sorted by level scatters them.
 *
 * IT IS A WALL OF SQUARES AND NOTHING ELSE. No names under the tiles: the
 * square IS the answer at this size — a turret's own sprite, a module's
 * own glyph, a map's own thumbnail, a rule's own face — and forty-odd
 * captions under forty-odd pictures is a page of text pretending to be
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
 * NOTHING HERE IS BUYABLE and nothing is hidden — which is why it is not
 * called "Unlocks" any more. A word about EARNING was the wrong sign over
 * a board that draws the whole game whether you have reached it or not;
 * this is the index the rest of the code already called a codex
 * (pixelArt.ts names the pink it is tinted with). Every entry that exists
 * is drawn, exactly as a StarCraft II player can read the mutator list
 * before queueing — the surprise is meant to be WHICH ones a run rolls,
 * not what exists.
 *
 * WHICH IS WHY THE MODULES ARE HERE TOO — what the deal's M and G buttons
 * sell, in the two tabs they actually are: MODS (game/mods.ts) and RELICS
 * (game/relics.ts). They used to be one tab called "Upgrades", which put
 * two different purchases and the tech tree's per-turret rungs under a
 * word none of the three is called; a player reading it could not tell
 * that half the shelf was a chance on a placement and the other half a
 * rule over the whole board. Two categories, two tabs, and no tab named
 * for a thing that does not exist.
 *
 * THE TWO TABS ALSO READ AS THE TWO HALVES OF THE TRACK. The mods are all
 * dealt by level 14 and the relics all after RELICS_FROM (track.ts), so a
 * save part way up sees a Mods tab that is mostly lit and a Relics tab
 * that is mostly dim — which is the pacing of the catalog, visible.
 *
 * A LOCKED TILE IS DIMMED AND SAYS NOTHING ELSE. No level badged on it,
 * no line in its card about what hands it over. The track next door is
 * the screen that answers "when"; this one answers "what", and a number
 * repeated on forty-seven squares is the caption this board just took off.
 */

/**
 * THE ORDER, and it is the order a player thinks in rather than the order
 * the track deals in: the GUN first, then what can be bolted to it, then
 * the rule that governs the whole board, then the rules the run is played
 * under, then the ground it is played on. Turrets, mods, relics, mutators,
 * maps — one list that walks outward from the thing on the board to the
 * world round it, and the strip and the "All" grid use the same order so
 * switching a filter never re-shuffles what was already on screen.
 *
 * MODS BEFORE RELICS, which is both the order the corner's two buttons
 * read in and the order the track deals them in (track.ts): the mid game's
 * answer, then the late game's.
 */
const FILTERS: readonly { id: Category | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "turret", label: "Turrets" },
  { id: "mod", label: "Mods" },
  { id: "relic", label: "Relics" },
  { id: "mutator", label: "Mutators" },
  { id: "world", label: "Maps" },
];

/** every category, in strip order — what "All" concatenates */
const EVERY: readonly Category[] = ["turret", "mod", "relic", "mutator", "world"];

/**
 * A BOARD CATEGORY IS A TRACK CATEGORY — the same five names, asked of the
 * same function (unlocksOf). There is no sixth for the tech tree's
 * per-turret rungs: nothing deals one and nothing sells one, and the tab
 * that used to hold them held two other things as well under a name none
 * of the three went by.
 */
type Category = UnlockKind;

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
 * ONE SQUARE, and every tile on this board is one: the track's chip at
 * TILE_PX, its border in whatever the thing's own colour is, and
 * everything else — the name included — in the card that opens on hover.
 *
 * It knows nothing about what it is drawing — the geometry is asked once,
 * which is the only way a grid of turrets, modules, rules and maps reads
 * as one shelf.
 *
 * A LOCKED TILE KEEPS ITS OWN COLOUR AND IS DIMMED, exactly as the
 * track's chip is (RewardChip in Progress.tsx): the border stays the
 * thing's own band and the whole chip is faded, so a purple a save has
 * not reached is still legibly a purple. It used to be repainted flat
 * grey, which threw away the one thing the border is for — the board
 * teaches the bands, and it cannot teach them on half a shelf.
 *
 * FRAME AND FACE GO DOWN TOGETHER. The fade sat on the face alone for a
 * while, which left a locked tile wearing a lit border round a ghost —
 * it read as a drawing that had failed to load rather than as a thing
 * that is not open yet. The chip fades whole. The hue survives it: the
 * colour loses strength against the ground without being replaced, which
 * is the whole point of not painting it grey.
 *
 * It is the CHIP that fades and not this wrapper, so the card the tile
 * opens reads at full strength either way — the colour in the card's
 * corner is the real one on a locked tile, and so is the focus ring.
 */
function Tile({
  name,
  aria,
  face,
  color,
  tag,
  lit,
  children,
}: {
  /** the card's title — a name, never a "Turret: " prefix */
  name: string;
  aria: string;
  face: ReactNode;
  color: string;
  /** the hover card's corner word: the band, the weight — or nothing */
  tag?: string;
  /** has the save reached the level that opens this? */
  lit: boolean;
  /** the card's prose, and whatever line goes under it */
  children: ReactNode;
}) {
  const tip = useHoverCard("auto");
  return (
    <div
      ref={tip.ref as RefObject<HTMLDivElement | null>}
      {...tip.anchorProps}
      role="listitem"
      tabIndex={0}
      aria-label={aria}
      className="relative flex shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD37F]"
      style={{ width: TILE_PX, height: TILE_PX }}
    >
      {/* THE TRACK'S CHIP, SCALED. transform rather than width/height, so
          the border and the face inside keep their exact proportions —
          and rather than `zoom`, which would compound with the page's
          ui-zoom and throw the hover card's anchor arithmetic off
          (HoverCard.tsx divides by --ui-scale exactly once) */}
      <div
        className={`ms-tile flex items-center justify-center overflow-hidden ${
          lit ? "" : "opacity-40"
        }`}
        style={{
          ...tile(color),
          width: CHIP_PX,
          height: CHIP_PX,
          transform: `scale(${SCALE})`,
        }}
      >
        {/* frame and face fade together, and the hue rides through it: a
            locked purple is still legibly a purple (the note above) */}
        <span className="flex items-center justify-center">{face}</span>
      </div>
      <HoverCard tip={tip} title={name} tag={tag} color={color} align="center">
        {children}
      </HoverCard>
    </div>
  );
}

/** one thing off the track: dim until the save has reached its level */
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
  tag?: string;
}) {
  const text = rewardText(entry.reward);
  const note = rewardNote(entry.reward);
  // the name without its "Turret: " / "Map: " prefix — the card's title
  // is a name, and the kind is said by the tile it is hanging off
  const name = text.includes(": ") ? text.slice(text.indexOf(": ") + 2) : text;
  return (
    <Tile
      name={name}
      aria={`${text}${tag ? `, ${tag}` : ""}${reached ? "" : ", locked"}. ${rewardBlurb(
        entry.reward,
      )}`}
      face={face}
      color={color}
      tag={tag}
      lit={reached}
    >
      {rewardBlurb(entry.reward)}
      {note && <span className="mt-1.5 block font-bold text-[#A6A6AF]">{note}</span>}
    </Tile>
  );
}

export default function Codex({
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
  const [filter, setFilter] = useState<Category | "all">("all");
  const items = filter === "all" ? EVERY.flatMap(unlocksOf) : unlocksOf(filter);
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0B0B0D] text-[#EDEDEF]">
      {/* the chrome: back and the board tabs, in the same corner the track
          pins them to, so switching never moves the hand */}
      <div className="ui-zoom absolute left-[1rem] top-[1rem] z-10 flex items-center gap-2">
        <BackButton label={backLabel} onClick={onBack} />
        {tabs}
      </div>

      <div className="ui-zoom mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 pt-[5rem]">
        <div role="tablist" aria-label="codex categories" className="ms-seg mb-4 flex self-center">
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
          aria-label={`${FILTERS.find((f) => f.id === filter)?.label} entries`}
          className="flex flex-1 flex-wrap content-start justify-center gap-1.5 overflow-y-auto pb-12"
        >
          {items.length === 0 ? (
            /* A CATEGORY WITH NOTHING IN IT says so in words rather than
               in an empty rectangle. No filter reaches this today — all
               five tabs have something in them — but a category that
               empties out should explain itself rather than look broken */
            <div className="ms-pane mt-6 max-w-md px-5 py-4 text-center text-[14px] text-[#A6A6AF]">
              <div className="mb-1 font-display text-[15px] font-bold uppercase tracking-widest text-[#EDEDEF]">
                Nothing here yet
              </div>
              These are written and waiting; nothing hands one out at the moment.
              They will show up here when something does.
            </div>
          ) : (
            items.map((entry, i) => (
              <UnlockTile
                key={i}
                entry={entry}
                reached={level >= entry.level}
                {...renderFace(entry)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
