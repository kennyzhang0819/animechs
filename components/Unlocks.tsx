"use client";

import { useState, type ReactNode, type RefObject } from "react";

import { modDef, modName, modsOfScope, oddsLine, type ModId } from "@/game/mods";
import { RARITY } from "@/game/rarity";
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
import { Glyph } from "./Relics";

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
 * the guns, then the upgrades, then the shapes, then the rules, then the
 * maps (FILTERS) — so the grid is one list and not a shuffle.
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
 * is drawn, exactly as a StarCraft II player can read the mutator list
 * before queueing — the surprise is meant to be WHICH ones a run rolls,
 * not what exists.
 *
 * WHICH IS WHY THE MODULES ARE HERE TOO (game/mods.ts) — the twenty the
 * deal's M and G buttons sell, mods first and then relics. They are not
 * track unlocks: nothing hands one out at a level, and every one of them
 * is available to every run from level one. But this board answers "what
 * is there", and a catalog a player can only read by buying from it at
 * two thousand scrap a look is a catalog they cannot plan against. They
 * are drawn LIT, always, because that is the truth about them: what a run
 * does not know is which ones it will be offered.
 *
 * A LOCKED TILE IS DIMMED AND SAYS NOTHING ELSE. No level badged on it,
 * no line in its card about what hands it over. The track next door is
 * the screen that answers "when"; this one answers "what", and a number
 * repeated on forty-seven squares is the caption this board just took off.
 */

/**
 * THE ORDER, and it is the order a player thinks in rather than the order
 * the track deals in: the GUN first, then what can be bolted to it, then
 * the shape it comes in, then the rules the run is played under, then the
 * ground it is played on. Turrets, upgrades, shapes, mutators, maps — one
 * list that walks outward from the thing on the board to the world round
 * it, and the strip and the "All" grid use the same order so switching a
 * filter never re-shuffles what was already on screen.
 */
const FILTERS: readonly { id: Category | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "turret", label: "Turrets" },
  { id: "upgrade", label: "Upgrades" },
  { id: "shape", label: "Shapes" },
  { id: "mutator", label: "Mutators" },
  { id: "world", label: "Maps" },
];

/** every category, in strip order — what "All" concatenates */
const EVERY: readonly Category[] = ["turret", "upgrade", "shape", "mutator", "world"];

/**
 * A BOARD CATEGORY IS NOT QUITE A TRACK CATEGORY. They are the same five
 * names, but "upgrade" means something wider here than it does in
 * track.ts: there it is the tech tree's per-turret branches (upgrades.ts,
 * which nothing deals today), and here it is EVERY upgrade a run can end
 * up carrying — the twenty modules first (mods.ts, bought off the deal)
 * and then those branches. The player's word for all of them is the same
 * word, so the tab is the same tab.
 */
type Category = UnlockKind;

/**
 * ONE THING ON THE BOARD: a track unlock, or a module. Two kinds of tile
 * over one grid, because the two are genuinely different objects — an
 * unlock has a level it opens at and a module never will — and flattening
 * a module into a fake UnlockEntry with a level of 1 would put a lie in
 * the type just to save a branch in the renderer.
 */
type Item =
  | { readonly at: "track"; readonly entry: UnlockEntry }
  | { readonly at: "module"; readonly id: ModId };

/** everything in one category, in the order the board wants it */
function itemsOf(c: Category): Item[] {
  const track = unlocksOf(c).map((entry): Item => ({ at: "track", entry }));
  if (c !== "upgrade") return track;
  // MODS BEFORE RELICS, the order the corner's two buttons read in, and
  // the track's own branches after both (there are none today)
  return [
    ...modsOfScope("turret").map((m): Item => ({ at: "module", id: m.id })),
    ...modsOfScope("global").map((m): Item => ({ at: "module", id: m.id })),
    ...track,
  ];
}

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
 * It knows nothing about what it is drawing. An unlock and a module are
 * different objects with different rules about what "locked" even means,
 * and the two wrappers below answer that; the geometry is asked once and
 * is therefore identical for both, which is the only way a grid of mixed
 * tiles reads as one shelf.
 *
 * A dimmed tile is dimmed through its CONTENT rather than its wrapper, so
 * the card it opens reads at full strength either way.
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
  /** is this thing the save's yet? A module always is */
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
        className={`flex items-center justify-center overflow-hidden border-2 bg-black/80 ${
          lit ? "" : "opacity-40"
        }`}
        style={{
          width: CHIP_PX,
          height: CHIP_PX,
          transform: `scale(${SCALE})`,
          borderColor: lit ? color : "#3A3A40",
          color: lit ? color : "#71717C",
        }}
      >
        {face}
      </div>
      <HoverCard tip={tip} title={name} tag={tag} color={lit ? color : "#71717C"} align="center">
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
  const targeting = rewardTargeting(entry.reward);
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
      {targeting && <span className="mt-1.5 block font-bold text-[#A6A6AF]">{targeting}</span>}
    </Tile>
  );
}

/**
 * ONE MODULE (mods.ts), and it is ALWAYS LIT: no level opens one, so
 * there is no "not yet" to draw. The glyph the shelf and the reveal
 * already use, on its band's border, and the band's name in the card's
 * corner — the same three answers the same module gives in the corner of
 * the field mid-run, so the board and the run cannot teach different
 * things about it.
 *
 * THE ONE LINE UNDER THE BLURB IS THE SCOPE, because scope is the one
 * thing about a module that changes what buying it MEANS and it is not
 * visible in the face: a mod is a chance printed at ONE stack (mods.ts
 * oddsLine, the odds a first copy buys — and per CARD rather than per
 * turret for the giant) and a relic is in force the moment it lands.
 *
 * THERE IS NO LINE ABOUT STACKS. It used to say "One a run" or "Up to 2
 * of them" under all twenty tiles, which is a line of housekeeping
 * repeated twenty times to say what one rule says once: a relic is owned
 * once and an attribute has no cap at all (mods.ts). A relic explains
 * itself; an attribute's only number is its odds, and the odds are the
 * line above.
 *
 * AN UNNAMED TICK IS TITLED BY ITS TWEAK (modName). Its blurb then says
 * the same thing in a sentence, so the card prints the tweak line only
 * for the NAMED ones, where the name is a name and the stats are not in
 * it anywhere else.
 */
function ModuleTile({ id }: { id: ModId }) {
  const d = modDef(id);
  const r = RARITY[d.rarity];
  const name = modName(d);
  const line = `${oddsLine(d)}${d.scope === "turret" ? ", per copy owned" : ""}`;
  return (
    <Tile
      name={name}
      aria={`${d.scope === "turret" ? "Mod" : "Relic"}: ${name}, ${r.name}. ${d.blurb}`}
      face={<Glyph glyph={d.glyph} color="currentColor" className="h-[22px] w-[22px]" />}
      color={r.color}
      tag={r.name}
      lit
    >
      {d.blurb}
      {d.name && d.tweak && (
        <span className="mt-1.5 block font-bold text-[#EDEDEF]">{d.tweak}</span>
      )}
      <span className="mt-1.5 block font-bold" style={{ color: r.color }}>
        {line}
      </span>
    </Tile>
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
  const [filter, setFilter] = useState<Category | "all">("all");
  const items = filter === "all" ? EVERY.flatMap(itemsOf) : itemsOf(filter);
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
          {items.length === 0 ? (
            /* A CATEGORY WITH NOTHING IN IT says so in words rather than
               in an empty rectangle. No filter reaches this today — the
               upgrades tab, which used to, carries the twenty modules
               now — but a category that empties out should explain
               itself rather than look broken */
            <div className="ms-pane mt-6 max-w-md px-5 py-4 text-center text-[14px] text-[#A6A6AF]">
              <div className="mb-1 font-display text-[15px] font-bold uppercase tracking-widest text-[#EDEDEF]">
                Nothing here yet
              </div>
              These are written and waiting; nothing hands one out at the moment.
              They will show up here when something does.
            </div>
          ) : (
            items.map((item, i) =>
              item.at === "module" ? (
                <ModuleTile key={`m${item.id}`} id={item.id} />
              ) : (
                <UnlockTile
                  key={i}
                  entry={item.entry}
                  reached={level >= item.entry.level}
                  {...renderFace(item.entry)}
                />
              ),
            )
          )}
        </div>
      </div>
    </div>
  );
}
