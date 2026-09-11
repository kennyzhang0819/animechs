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
import { mutationById } from "@/game/mutation";
import { effectiveLevel, levelOf, type Progress } from "@/game/progress";
import {
  MAX_LEVEL,
  rewardBlurb,
  rewardTargeting,
  rewardText,
  ROSTER_TOP,
  TRACK,
  type Reward,
  type UnlockEntry,
} from "@/game/track";
import { upgradeDef } from "@/game/upgrades";
import { BackButton, BoardTabs } from "./Board";
import { HoverCard, useHoverCard } from "./HoverCard";
import { itemCount } from "./Items";
import Unlocks from "./Unlocks";
import { bandFor, MutationFace, MUT_LIT } from "./mutationFace";
import { formationDef, formationRarity, type FormationId } from "@/game/formation";
import { RARITY, rarityDef } from "@/game/rarity";
import { TOWER_ICONS } from "./towerIcons";

/**
 * THE PROGRESS SCREEN: the track, centred on where the save stands.
 *
 * One list, thirty rows, each row a level and what reaching it hands out
 * (track.ts). The level the save is ON sits in the middle of the screen
 * with its bar to the next one, and the rest of the track expands out from
 * it: the levels already climbed fade off above, the ones still to earn
 * fade off below. NOTHING SCROLLS. What fits on the screen is what is
 * shown, because the question this screen answers is "where am I and what
 * is next", and both are within a glance of the centre. Nothing here is a
 * button: the track is not spent, it is climbed.
 *
 * THE UNLOCKS BOARD rides beside it as a second tab (Unlocks.tsx): every
 * turret, shape, map and rule the track will ever hand out, filtered by
 * kind. The two answer the two halves of one question — this one is
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
/** the unlocks board's own mark: a padlock, open */
const UNLOCK_GLYPH =
  "M12 2a5 5 0 0 1 5 5h-2a3 3 0 0 0-6 0v3h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5zm1 12h-2v4h2z";
const TABS = [
  { id: "track", label: "Progress", color: "#FFD37F", glyph: TRACK_GLYPH },
  { id: "unlocks", label: "Unlocks", color: MUT_LIT, glyph: UNLOCK_GLYPH },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** the colour a reward chip wears, by what it is — except a turret, which
 *  wears its RARITY (rarityOf below) rather than one flat orange */
const REWARD_COLOR: Record<Reward["kind"], string> = {
  world: "#7BE58A",
  speed: "#7FC4FF",
  turret: "#FF9A62",
  // a shape wears its own band (formationRarity), like a turret does
  shape: "#C6C6CE",
  // a mutator wears the codex's pink here, not its own weight band: the
  // question a row answers is "what kind of thing is this handing me",
  // and the weight rides in the hover card's corner instead (the `tag`
  // rewardLook returns). The FACE does not carry it either — it used to
  // be tinted by the band and now carries the rule's own colours
  // (mutationArt.ts) — which is the right way round on a row where the
  // chip below holds a full-colour turret sprite and a flat-tinted glyph
  // was the odd one out
  mutator: MUT_LIT,
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

/** A SHAPE REWARD'S FACE: the formation itself, drawn the size of a
 *  sprite — the same diagram the card in a run wears in its corner, so
 *  the track teaches the picture and the field reads it back */
function ShapeFace({ id }: { id: FormationId }) {
  const f = formationDef(id);
  const n = Math.max(f.w, f.h);
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className="h-[24px] w-[24px]" aria-hidden="true">
      <g transform={`translate(${(n - f.w) / 2} ${(n - f.h) / 2})`}>
        {f.cells.map(([x, y]) => (
          <rect key={`${x},${y}`} x={x + 0.08} y={y + 0.08} width={0.84} height={0.84} fill="currentColor" />
        ))}
      </g>
    </svg>
  );
}

/** what a reward chip WEARS: the turret's own menu sprite, the map's own
 *  thumbnail, the shape's own diagram, a pace as its multiplier. An
 *  upgrade rung shows the turret it buffs — the ring colour is what
 *  separates it from owning the gun */
function RewardFace({ reward }: { reward: Reward }) {
  if (reward.kind === "world") return <MapThumb mapId={worldMapId(reward.worldId)} />;
  if (reward.kind === "speed")
    return <span className="font-display text-[13px] font-bold leading-none">{reward.mult}x</span>;
  if (reward.kind === "mutator") return <MutationFace id={reward.id} size="h-6 w-6" />;
  if (reward.kind === "shape") return <ShapeFace id={reward.id} />;
  const kind = reward.kind === "turret" ? reward.id : upgradeDef(reward.id).turret;
  return (
    <img
      src={TOWER_ICONS[kind]}
      alt=""
      className="h-[26px] w-[26px] object-contain [image-rendering:pixelated]"
    />
  );
}

/**
 * One reward on a track row, AS A PICTURE: the turret's sprite or the
 * map's thumbnail in a square the colour of its kind, with the words a
 * hover away. The chip used to print "Turret: Meltdown" and a row of them
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
 * A TURRET IS BORDERED BY ITS RARITY (rarity.ts), and a shape by its band
 * (formationRarity), not by the fact that they are a turret and a shape.
 * The track is where a player learns what the deal can hand them, and it
 * teaches the border at the same time it teaches the gun: the row that
 * opens a spectre is purple here, the tile on the unlocks board is purple
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
      : reward.kind === "shape"
        ? RARITY[formationRarity(reward.id)]
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
  // "auto": the list scrolls, so which side of the window a chip is on is
  // not a property of its row — the card picks its side when it opens
  const tip = useHoverCard("auto");
  return (
    <>
      <span
        ref={tip.ref}
        tabIndex={0}
        aria-label={`${text}${rarity ? `, ${rarity}` : ""}. ${rewardBlurb(reward)}${
          rewardTargeting(reward) ? `. ${rewardTargeting(reward)}` : ""
        }`}
        {...tip.anchorProps}
        className={`relative flex h-9 w-9 shrink-0 cursor-default items-center justify-center overflow-hidden border-2 bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
          reached ? "" : "opacity-45"
        }`}
        style={{ borderColor: color, color }}
      >
        <RewardFace reward={reward} />
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
        {rewardTargeting(reward) && (
          <span className="mt-1.5 block font-bold text-[#A6A6AF]">{rewardTargeting(reward)}</span>
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
}: {
  progress: Progress;
  onBack: () => void;
  backLabel?: string;
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

  if (tab === "unlocks")
    return (
      <Unlocks
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
          them to as well (Unlocks), so the switch never moves. Both
          the chrome and the track opt into the UI-size knob (ui-zoom):
          this screen is read, not played, and a HUD set to 150% for a TV
          wants its progress list at 150% too */}
      <div className="ui-zoom absolute left-[1rem] top-[1rem] z-10 flex items-center gap-2">
        <BackButton label={backLabel} onClick={onBack} />
        {tabStrip}
        {door && (
          <span className="ml-2 text-[14px] uppercase tracking-widest text-[#7BE58A]">
            Full unlock is on — every row reads as reached
          </span>
        )}
      </div>

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
