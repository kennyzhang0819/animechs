"use client";

import type { RefObject } from "react";

import { modDef, modName, type ModId } from "@/game/mods";
import { RARITY } from "@/game/rarity";
import type { UiState } from "@/game/game";
import { statusDef, type StatusChip as Chip } from "@/game/status";
import { statusGlyph, STATUS_GRID } from "@/game/statusArt";
import type { TowerKind, UnitKind } from "@/game/levels";
import { HoverCard, useHoverCard } from "./HoverCard";
import { Glyph } from "./Relics";
import { TOWER_ICONS } from "./towerIcons";
import { tile } from "./tile";
import { useUnitIcon } from "./unitIcons";

/**
 * THE INSPECTOR — what the thing you just clicked is, along the bottom of
 * the field between the two corners.
 *
 * A CLICK ALREADY DID SOMETHING: on a turret it drew a range ring
 * (Game.drawSelection), and on an enemy it told every gun in range to drop
 * what it was doing (Sim.setInspectUnit). Neither of them said what the
 * thing WAS. A turret born with three attributes is the story of a patch
 * (mods.ts: every placement rolls for every attribute the run owns, so a
 * card comes out speckled); a body halfway across the field is a pool, a
 * plate, and whatever the line has managed to put on it.
 *
 * IT ANSWERS FOR BODIES TOO, and that is the half this panel was missing.
 * The swarm's units carry real state — armour every shot is measured
 * against, a soak that halves their pace, fire that ignores the plate, an
 * absorbing bubble, meals eaten, wades taken — and until now every bit of
 * it was invisible except as a tint. Click one and the panel reads it.
 *
 * IT GOES BOTTOM-CENTRE because that is the one edge of the field with
 * nothing on it: the minimap owns the bottom-left, the deal owns the
 * bottom-right, and the middle is where an RTS has always put "what is
 * selected". It is centred on the SCREEN rather than on the gap, so it
 * does not slide about as the corners change size, and it is capped at the
 * width between them so it never slips under either.
 *
 * ONE PANEL FOR ONE THING OR THREE HUNDRED. A marquee is a selection too,
 * so the panel reads a SUMMARY (UiState.inspect): the pools summed into
 * one bar, the attributes tallied across everything picked, and the
 * statuses counted the same way — "rot on 4 of them" is the question a
 * player drags a box to ask.
 *
 * IT IS PICTURES AND A BAR AND NOTHING ELSE. Every attribute already has a
 * face the player has learned in two other places — the shelf at the
 * top-left and the codex — and every status has one they have learned on
 * the field, where the same symbols sit over the bodies wearing them
 * (game.ts drawStatusRow). A panel that spelled the names out in words
 * would be a paragraph over the field, mid-wave, for a glance. The names
 * are one hover away, as they are everywhere else.
 */


/**
 * ONE ATTRIBUTE IN THE SELECTION: its glyph on its band's border, and the
 * count ONLY when the selection is more than one turret.
 *
 * THE NUMBER MEANS SOMETHING DIFFERENT HERE than on the shelf, which is
 * why it is hidden for a single pick. On the shelf a count is how many
 * COPIES the run has bought (and therefore the odds); here it is how many
 * of the SELECTED TURRETS carry the thing. Printing "x1" over a single
 * turret's chip would read as the first of those and mean the second.
 */
function ModPip({ id, n, total }: { id: ModId; n: number; total: number }) {
  const many = total > 1;
  const tip = useHoverCard("up");
  const d = modDef(id);
  const r = RARITY[d.rarity];
  return (
    <span
      ref={tip.ref as RefObject<HTMLSpanElement | null>}
      {...tip.anchorProps}
      className="ms-tile ms-tile-sm pointer-events-auto flex h-[24px] w-[24px] shrink-0 items-center justify-center"
      style={tile(r.color)}
      aria-label={many ? `${modName(d)}, on ${n} of them` : modName(d)}
    >
      <Glyph glyph={d.glyph} className="h-[16px] w-[16px]" />
      {many && <span className="ms-tile-count">{n}</span>}
      <HoverCard tip={tip} title={modName(d)} tag={r.name} color={r.color} align="center">
        {d.blurb}
        {many && (
          <span className="mt-1.5 block font-bold" style={{ color: r.color }}>
            On {n} of the {total} selected
          </span>
        )}
      </HoverCard>
    </span>
  );
}

/** one status symbol, at whatever size it is asked for — the same drawing
 *  the field stamps over the body itself (game/statusArt.ts) */
export function StatusGlyph({
  id,
  className = "h-[15px] w-[15px]",
}: {
  id: Chip["id"];
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${STATUS_GRID} ${STATUS_GRID}`}
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {statusGlyph(id).map((layer) => (
        <path key={layer.color} fill={layer.color} d={layer.d} />
      ))}
    </svg>
  );
}

/**
 * ONE STATUS IN THE ROW: its symbol on a chip framed in the status's own
 * ink, and the number it carries when it has one — the plate's value, the
 * shield's pool, the meals eaten, or how many of a selection are wearing
 * it.
 *
 * THE FRAME IS THE COLOUR OF THE THING and never of a rarity band (the
 * house rule, pixelArt.ts rule 4): water blue for a soak, ember for fire,
 * the venom line's purple for rot. A player reading the row is being told
 * what is happening, not how lucky they got.
 */
function StatusPip({ chip }: { chip: Chip }) {
  const tip = useHoverCard("up");
  const d = statusDef(chip.id);
  return (
    <span
      ref={tip.ref as RefObject<HTMLSpanElement | null>}
      {...tip.anchorProps}
      className="ms-tile ms-tile-sm pointer-events-auto flex h-[22px] w-[22px] shrink-0 items-center justify-center"
      style={tile(d.color)}
      aria-label={`${d.name}${chip.n !== null ? ` ${chip.n}` : ""}, ${chip.note}`}
    >
      <StatusGlyph id={chip.id} className="h-[15px] w-[15px]" />
      {chip.n !== null && <span className="ms-tile-count">{chip.n}</span>}
      {/* THE NOTE IS A STAT, NOT A TAG. It used to ride the title's line as
          a corner label, which was fine while every note was "3s left" and
          broke the moment they carried what a thing actually does — "60
          shield every 2s to everything within 9.5t, up to 420" pushed the
          status's own name out of the card. */}
      <HoverCard tip={tip} title={d.name} stat={chip.note} color={d.color} align="center">
        {d.blurb}
      </HoverCard>
    </span>
  );
}

/**
 * THE POOL, AS A BAR, in the field's own hp thirds — the same green /
 * amber / red a unit's bar and a structure's damage tint already use
 * (renderer HP_TINT), so "this is nearly gone" reads the same colour
 * wherever a player happens to be looking.
 */
function HealthBar({ hp, max }: { hp: number; max: number }) {
  const f = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  const color = f > 2 / 3 ? "#7BE58A" : f > 1 / 3 ? "#FFD37F" : "#e55454";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-[10px] w-[9rem] overflow-hidden border border-[#26262b] bg-[#101013]">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-150"
          style={{ width: `${f * 100}%`, background: color }}
        />
      </div>
      <span className="shrink-0 text-[13px] font-bold tabular-nums" style={{ color }}>
        {hp.toLocaleString()}
        <span className="text-[#71717C]"> / {max.toLocaleString()}</span>
      </span>
    </div>
  );
}

export function Inspector({
  inspect,
  icons,
}: {
  inspect: NonNullable<UiState["inspect"]>;
  icons: Partial<Record<TowerKind, string>>;
}) {
  const { n, kind, unit, name, hp, hpMax, statuses, mods } = inspect;
  const many = n > 1;
  const carved = useUnitIcon(unit);
  // the picture, and ONLY when the whole selection is one thing — a tacker
  // over a box that also holds repeaters would be the one part of this
  // panel that could lie
  const art = unit
    ? carved
    : kind
      ? (icons[kind] ?? TOWER_ICONS[kind])
      : null;
  return (
    <div
      className="ms-pane pointer-events-auto flex max-w-[calc(100vw-30rem)] items-center gap-3 px-3 py-2"
      role="status"
      aria-label={`Selected: ${many ? `${n} ` : ""}${name}, ${hp} of ${hpMax} health, ${
        statuses.length
      } statuses, ${mods.length} attributes`}
    >
      {/* THE PICTURE WITH THE NAME UNDER IT. The name used to run along
          the top of the right-hand column, which put it on the same line
          as the plating caption and left the sprite floating beside a
          stack it was not part of. A label belongs under the thing it
          labels, and moving it there freed the whole top of the panel for
          the status row. */}
      {/* the column is given a floor so a two-letter name does not
          collapse it under the sprite, and a ceiling so "Mega shield
          tower" cannot push the bar off the far corner — between the two
          it is as wide as what it is labelling */}
      <div className="flex min-w-[4.5rem] max-w-[8rem] shrink-0 flex-col items-center gap-1">
        {art && (
          // eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted
          <img src={art} alt="" className="h-9 w-9 shrink-0 object-contain [image-rendering:pixelated]" />
        )}
        <span className="w-full truncate text-center text-[11px] font-bold uppercase leading-none tracking-wide text-[#EDEDEF]">
          {many && <span className="text-[#FFD37F]">{n}× </span>}
          {name}
        </span>
      </div>
      {/* ...and to the right of it, the two rows that move: what is being
          done to the thing, over what is left of it. */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <div
          role="list"
          aria-label="statuses"
          className="flex min-h-[22px] items-center gap-1"
        >
          {statuses.length > 0 ? (
            statuses.map((chip) => <StatusPip key={chip.id} chip={chip} />)
          ) : (
            /* A THING WITH NOTHING ON IT STILL KEEPS THE ROW. The bar
               below would otherwise jump up by a chip's height the moment
               a soak expired, under a cursor that is already hovering
               something in it. */
            <span className="text-[11px] uppercase tracking-wide text-[#4A4A55]">nothing on it</span>
          )}
        </div>
        <HealthBar hp={hp} max={hpMax} />
      </div>
      {mods.length > 0 && (
        /* TWO ROWS, FILLED COLUMN BY COLUMN. A single wrapping line grew
           the panel as wide as the field a turret born with eight
           attributes was standing on; two rows is the same pips in half
           the width, and it is a GRID rather than a wrapped flex so the
           second row starts on the second pip and not on whatever pip the
           available width happened to run out at */
        <div
          role="list"
          aria-label="attributes"
          className={`ml-1 grid max-w-[26rem] grid-flow-col justify-start gap-1 overflow-x-auto border-l border-[#26262b] pl-3 ${
            mods.length > 1 ? "grid-rows-2" : "grid-rows-1"
          }`}
        >
          {mods.map((m) => (
            <ModPip key={m.id} id={m.id} n={m.n} total={n} />
          ))}
        </div>
      )}
    </div>
  );
}
