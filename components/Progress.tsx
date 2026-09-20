"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { levelProgress, POINT_COLOR, XP_COLOR } from "@/game/economy";
import { WORLDS } from "@/game/levels";
import { drawThumb, loadMap, loadOfficialMaps, OFFICIAL_MAP_IDS } from "@/game/maps";
import { modDef } from "@/game/mods";
import { relicDef } from "@/game/relics";
import { mutationById } from "@/game/mutation";
import { effectiveLevel, levelOf, type Progress } from "@/game/progress";
import {
  MAX_LEVEL,
  rewardBlurb,
  rewardNote,
  rewardText,
  TRACK,
  type Reward,
  type UnlockEntry,
} from "@/game/track";
import type { TowerKind } from "@/game/types";
import { upgradeDef } from "@/game/upgrades";
import { BackButton, BoardTabs } from "./Board";
import { HoverCard, useHoverCard } from "./HoverCard";
import { CurrencyIcon, itemCount } from "./Items";
import Codex from "./Codex";
import SkillTree from "./SkillTree";
import { bandFor, MutationFace, MUT_LIT } from "./mutationFace";
import { Glyph } from "./Relics";
import { RARITY, rarityDef } from "@/game/rarity";
import { useTowerIcon } from "./towerIcons";
import { tile } from "./tile";

/**
 * THE PROGRESS SCREEN: the track, centred on where the save stands.
 *
 * One list, one row a level to the top of the track (MAX_LEVEL), each row
 * a level and what reaching it hands out
 * (track.ts). The level the save is ON sits in the middle of the screen
 * with its bar to the next one, and the rest of the track expands out from
 * it: the levels already climbed fade off above, the ones still to earn
 * fade off below. NOTHING SCROLLS. What fits on the screen is what is
 * shown, because the question this screen answers is "where am I and what
 * is next", and both are within a glance of the centre. Nothing here is a
 * button: the track is not spent, it is climbed.
 *
 * THE CODEX rides beside it as a second tab (Codex.tsx): every turret,
 * module, map and rule the track will ever hand out, filtered by kind. It
 * was called "Unlocks" until the name was weighed against what the board
 * actually does — nothing on it is hidden and nothing is earned by
 * looking, so a word about EARNING was the wrong sign over an index. The
 * rest of the code had already settled on "codex" (mods.ts, mutation.ts,
 * rarity.ts, and the pink in pixelArt.ts); the tab now agrees with it. The two answer the two halves of one question — this one is
 * "where am I and what is next", that one is "what is there at all" — and
 * the tab strip sits in the SAME corner on both, beside back, so
 * switching never moves the hand.
 *
 * It replaced the mutator codex, which answered only the rules half and
 * did it through a pannable, zoomable camera left over from the tech tree
 * that used to live there. A camera is the wrong instrument for a list
 * read once and closed.
 */

const TRACK_GLYPH = "M3 19h18v2H3zM3 6l5 4 4-7 4 7 5-4-2 11H5z";
/** the codex's own mark: an open book. It was a padlock, which promised a
 *  board about what is SHUT — the one thing this board never shows */
const CODEX_GLYPH =
  "M2 5c3-1 6-1 9 1v13c-3-2-6-2-9-1V5zm20 0c-3-1-6-1-9 1v13c3-2 6-2 9-1V5z";
/** the tree's own mark: a trunk with two branches off it */
const TREE_GLYPH = "M11 21V11L6 8V4l5 3V2h2v9l5-3v4l-5 3v6z";
const TABS = [
  { id: "track", label: "Progress", color: "#FFD37F", glyph: TRACK_GLYPH },
  { id: "skills", label: "Upgrades", color: "#7BE58A", glyph: TREE_GLYPH },
  { id: "codex", label: "Codex", color: MUT_LIT, glyph: CODEX_GLYPH },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** the colour a reward chip wears, by what it is — except a turret, which
 *  wears its RARITY (rarityOf below) rather than one flat orange */
const REWARD_COLOR: Record<Reward["kind"], string> = {
  // the points wear the tree's own gold, the same colour the board that
  // spends them prints its pool in (SkillTree.tsx)
  points: POINT_COLOR,
  world: "#7BE58A",
  turret: "#FF9A62",
  // a mutator wears the codex's pink here, not its own weight band: the
  // question a row answers is "what kind of thing is this handing me",
  // and the weight rides in the hover card's corner instead (the `tag`
  // rewardLook returns). The FACE does not carry it either — it used to
  // be tinted by the band and now carries the rule's own colours
  // (mutationArt.ts) — which is the right way round on a row where the
  // chip below holds a full-colour turret sprite and a flat-tinted glyph
  // was the odd one out
  mutator: MUT_LIT,
  // a mod and a relic each wear their own band (rarityDef below), like a
  // turret does — these two are the fallback nothing reaches
  mod: "#C6C6CE",
  relic: "#C08BFF",
  upgrade: "#FFD37F",
};

/** the map document a world is played on — the first official map is the
 *  fallback, exactly as the deploy screen's card resolves it */
function worldMapId(worldId: string): string {
  return WORLDS.find((w) => w.id === worldId)?.map ?? OFFICIAL_MAP_IDS[0];
}

/**
 * A map reward's face: the map itself, painted at 1px per cell into a
 * chip-sized canvas (drawThumb, the same picture the deploy card shows).
 * The documents are fetched with the menu, but this screen can be opened
 * before that settles, so a miss re-runs the fetch and paints on the way
 * back rather than leaving an empty square.
 */
function MapThumb({ mapId }: { mapId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const map = loadMap(mapId);
    if (map) {
      if (ref.current) drawThumb(map, ref.current);
      return;
    }
    void loadOfficialMaps()
      .then(() => alive && setTick((t) => t + 1))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mapId, tick]);
  return <canvas ref={ref} className="h-full w-full object-cover [image-rendering:pixelated]" />;
}

/** what a reward chip WEARS: the turret's own menu sprite, the map's own
 *  thumbnail, a pace as its multiplier. An
 *  upgrade rung shows the turret it buffs — the ring colour is what
 *  separates it from owning the gun */
/** a turret's picture, the head the board builds (components/towerIcons.ts useTowerIcon) */
function TurretFace({ kind }: { kind: TowerKind }) {
  const src = useTowerIcon(kind);
  return <img src={src} alt="" className="h-[26px] w-[26px] object-contain [image-rendering:pixelated]" />;
}

function RewardFace({ reward }: { reward: Reward }) {
  if (reward.kind === "points") return <CurrencyIcon glyph="point" className="h-[22px] w-[22px]" />;
  if (reward.kind === "world") return <MapThumb mapId={worldMapId(reward.worldId)} />;
  if (reward.kind === "mutator") return <MutationFace id={reward.id} size="h-6 w-6" />;
  // a module has no sprite — it is not a building — so it wears the same
  // small geometry the shelf and the reveal draw it as (Relics.tsx), and
  // a mod and a relic read the drawing off their own catalog
  if (reward.kind === "mod")
    return <Glyph glyph={modDef(reward.id).glyph} className="h-[22px] w-[22px]" />;
  if (reward.kind === "relic")
    return <Glyph glyph={relicDef(reward.id).glyph} className="h-[22px] w-[22px]" />;
  return <TurretFace kind={reward.kind === "turret" ? reward.id : upgradeDef(reward.id).turret} />;
}

/**
 * One reward on a track row, AS A PICTURE: the turret's sprite or the
 * map's thumbnail in a square the colour of its kind, with the words a
 * hover away. The chip used to print "Turret: Furnace" and a row of them
 * read as a paragraph; the sprite is the thing the player will look for
 * in the build bar, and the map is the place they will play, so the face
 * is the label and the card behind it carries the name and the sentence
 * (rewardText, rewardBlurb). Focusable, so the keyboard gets the same
 * card the mouse does, and the name still rides in aria-label for a
 * screen reader, which cannot see the sprite at all.
 *
 * The card is the shared HoverCard, portalled onto the body (see that
 * file for why): nothing in the track — its edge masks, a dimmed row —
 * can fade it, and it opens away from whichever edge of the window the
 * chip is nearest ("auto"), which keeps it on screen at any scroll.
 */
/**
 * WHAT ONE REWARD IS DRAWN AND COLOURED BY — the single answer both
 * boards read.
 *
 * A TURRET IS BORDERED BY ITS RARITY (rarity.ts), and a mod and a relic by
 * their own, not by the fact of what kind of thing they are.
 * The track is where a player learns what the deal can hand them, and it
 * teaches the border at the same time it teaches the gun: the row that
 * opens a repeater is purple here, the tile on the codex is purple
 * there, and the card that turns one over mid-wave is purple too. Nothing
 * has to say so.
 */
export function rewardLook(reward: Reward): {
  face: ReactNode;
  color: string;
  tag?: string;
} {
  const rarity =
    reward.kind === "turret"
      ? rarityDef(reward.id)
      : reward.kind === "mod"
        ? RARITY[modDef(reward.id).rarity]
        : reward.kind === "relic"
          ? RARITY[relicDef(reward.id).rarity]
          : null;
  return {
    face: <RewardFace reward={reward} />,
    color: rarity ? rarity.color : REWARD_COLOR[reward.kind],
    tag: rarity
      ? rarity.name
      : reward.kind === "mutator"
        ? bandFor(mutationById(reward.id)).label
        : undefined,
  };
}

function RewardChip({ reward, reached }: { reward: Reward; reached: boolean }) {
  const { color, tag } = rewardLook(reward);
  const rarity = tag;
  const text = rewardText(reward);
  // THE AMOUNT RIDES IN THE CORNER, not in the face: the icon is what
  // says which currency and the badge is what says how much, so a level
  // paying two points is the same picture with a different number on it
  const count = reward.kind === "points" && reward.amount > 1 ? reward.amount : null;
  // "auto": the list scrolls, so which side of the window a chip is on is
  // not a property of its row — the card picks its side when it opens
  const tip = useHoverCard("auto");
  return (
    <>
      <span
        ref={tip.ref}
        tabIndex={0}
        aria-label={`${text}${rarity ? `, ${rarity}` : ""}. ${rewardBlurb(reward)}${
          rewardNote(reward) ? `. ${rewardNote(reward)}` : ""
        }`}
        {...tip.anchorProps}
        className="relative flex h-9 w-9 shrink-0 cursor-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
      >
        {/* THE FRAME FADES WITH THE FACE, so a reward the save has not
            reached reads as one dim thing rather than a lit border round
            a ghost (Codex.tsx says the same). The hue rides through it:
            a purple that is not open yet is still legibly a purple, which
            is why the chip is faded and not repainted grey.

            The fade is a layer IN from the focusable span, so the ring
            and the card this anchors keep their full strength. */}
        <span
          className={`ms-tile flex h-full w-full items-center justify-center overflow-hidden ${
            reached ? "" : "opacity-45"
          }`}
          style={tile(color)}
        >
          <RewardFace reward={reward} />
        </span>
        {count !== null && (
          <span className="ms-tile-count" style={{ color, opacity: reached ? 1 : 0.45 }}>
            {count}
          </span>
        )}
      </span>
      <HoverCard
        tip={tip}
        title={text}
        // the weight is the one thing a mutator's card says that a
        // turret's cannot: it is the answer to "how bad is this"
        tag={tag}
        color={color}
      >
        {rewardBlurb(reward)}
        {/* a turret's card carries the same targeting line the build menu
            prints, on its own line under the prose */}
        {rewardNote(reward) && (
          <span className="mt-1.5 block font-bold text-[#A6A6AF]">{rewardNote(reward)}</span>
        )}
      </HoverCard>
    </>
  );
}

/** one level of the track: its number, its rewards, and — on the row the
 *  save is on — the bar to the next one, the one number here that moves */
function TrackRow({
  level,
  rewards,
  reached,
  current,
  into,
  need,
  rowRef,
}: {
  level: number;
  rewards: readonly Reward[];
  reached: boolean;
  current: boolean;
  into: number;
  need: number;
  /** set on the row the save is ON — the one the list scrolls to on open */
  rowRef?: RefObject<HTMLDivElement | null>;
}) {
  const top = level === MAX_LEVEL;
  return (
    <div
      ref={rowRef}
      role="listitem"
      aria-current={current ? "step" : undefined}
      // an unreached row is dimmed through its CONTENT (the grey number,
      // the half-faded chips), never through the row's own opacity, so
      // nothing it holds is read through
      className={`ms-pane flex items-start gap-4 px-4 py-2.5 ${
        current ? "border-[#FFD37F]" : reached ? "" : "border-[#252525]"
      }`}
    >
      {/* the number alone. It used to carry a "LEVEL" caption over it,
          fifteen times down one screen, saying nothing the column's
          position did not */}
      <div className="w-10 shrink-0 pt-1.5">
        <div
          className="font-display text-xl font-bold leading-none"
          style={{ color: reached ? POINT_COLOR : "#71717C" }}
        >
          {level}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        {rewards.length === 0 ? (
          <span className="text-[14px] text-[#71717C]">
            —
          </span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {rewards.map((r, i) => (
              <RewardChip key={i} reward={r} reached={reached} />
            ))}
          </div>
        )}
        {current && !top && (
          <div className="mt-3 flex items-center gap-3 text-[14px] text-[#A6A6AF]">
            <span className="ms-bar h-4 w-64 max-w-full">
              <span
                className="block h-full"
                style={{
                  width: `${Math.min(100, (100 * into) / Math.max(1, need))}%`,
                  background: XP_COLOR,
                }}
              />
            </span>
            {itemCount(into)} / {itemCount(need)} XP to level {level + 1}
          </div>
        )}
        {current && top && (
          <div className="mt-1 text-[13px] uppercase tracking-widest text-[#7BE58A]">
            Top of the track
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProgressView({
  progress,
  onBack,
  backLabel = "Back",
  onProgress,
}: {
  progress: Progress;
  onBack: () => void;
  backLabel?: string;
  /** the skill tree writes to the save — the shell re-reads it through this */
  onProgress?: (p: Progress) => void;
}) {
  const [tab, setTab] = useState<TabId>("track");
  const here = useRef<HTMLDivElement | null>(null);
  const tabStrip = <BoardTabs tabs={TABS} active={tab} onPick={setTab} />;

  const level = levelOf(progress);
  // what the save PLAYS at — the whole track while the back door is open
  const plays = effectiveLevel(progress);
  const { into, need } = levelProgress(progress.xp);
  // the dev switch plays every save at the top of the track (progress.ts)
  const door = plays > level;

  /**
   * THE LIST OPENS ON THE SAVE. It scrolls now — twenty-four rows do not
   * fit on a laptop and the second half of the track was simply
   * unreadable — but where it STARTS is still the answer to "where am I",
   * so the current row is put in the middle of the window before the
   * first paint (useLayoutEffect, "instant": a progress screen that
   * animates its way down to your level on every open is a screen you
   * have to wait for). After that the wheel is the player's.
   */
  useLayoutEffect(() => {
    if (tab === "track") here.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [tab, level]);

  /** back, the tabs and the dev-door note — the same corner on every tab */
  const chrome = (
    <div className="ui-zoom absolute left-[1rem] top-[1rem] z-10 flex items-center gap-2">
      <BackButton label={backLabel} onClick={onBack} />
      {tabStrip}
      {door && (
        <span className="ml-2 text-[14px] uppercase tracking-widest text-[#7BE58A]">
          Full unlock is on — every row reads as reached
        </span>
      )}
    </div>
  );

  if (tab === "skills")
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0B0B0D] text-[#EDEDEF]">
        {chrome}
        <SkillTree progress={progress} onProgress={onProgress ?? (() => {})} />
      </div>
    );

  if (tab === "codex")
    return (
      <Codex
        onBack={onBack}
        backLabel={backLabel}
        // the board dims what the track has not opened — the level it
        // reads is the one the save PLAYS at, dev door included
        level={plays}
        tabs={tabStrip}
        renderFace={(e: UnlockEntry) => rewardLook(e.reward)}
      />
    );

  const row = (l: number) => {
    const { rewards } = TRACK[l - 1];
    return (
      <TrackRow
        key={l}
        level={l}
        rewards={rewards}
        reached={l <= plays}
        current={l === level && !door}
        into={into}
        need={need}
        rowRef={l === Math.min(level, MAX_LEVEL) ? here : undefined}
      />
    );
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0B0B0D] text-[#EDEDEF]">
      {/* the chrome: back and the tabs, in the corner the codex board pins
          them to as well (Codex), so the switch never moves. Both
          the chrome and the track opt into the UI-size knob (ui-zoom):
          this screen is read, not played, and a HUD set to 150% for a TV
          wants its progress list at 150% too */}
      {chrome}

      {/* THE WHOLE TRACK, IN ONE SCROLLER. It used to be three boxes — the
          climbed half, the current row, the half ahead — pinned so that
          nothing ever scrolled, which worked while the track was fifteen
          rows and hid a third of it once the mutator phase doubled it.
          One column now, faded at both edges rather than cut, scrolled to
          the save's own row on open. */}
      <div
        role="list"
        className="ui-zoom mx-auto flex w-full max-w-2xl flex-1 flex-col gap-1.5 overflow-y-auto px-4 pt-[6.5rem] pb-12"
        // THE PADDING MATCHES THE FADE. It also stopped asking for safe-area
        // insets it never had: the classes here read calc(1rem+var(--safe-l))
        // and nothing in the app defines --safe-*, so every one of those
        // paddings was an invalid declaration the browser dropped on the
        // floor — which is why the first row used to sit under the chrome. The list's own top padding is the
        // point at which the mask turns opaque (6.5rem, clear of the
        // chrome) and its bottom padding clears the bottom fade — so at
        // either end of the scroll the first and last rows are FULLY
        // readable, and everything between the ends dissolves under the
        // back button rather than being cut off by it
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 3.5rem, black 6.5rem, black calc(100% - 2rem), transparent 100%)",
        }}
      >
        {TRACK.map((t) => (
          <div key={t.level} className="contents">
            {row(t.level)}
          </div>
        ))}
      </div>
    </div>
  );
}
