"use client";

import type { RefObject } from "react";

import { modDef, modName, type ModId } from "@/game/mods";
import { RARITY } from "@/game/rarity";
import type { UiState } from "@/game/game";
import type { TowerKind } from "@/game/types";
import { HoverCard, useHoverCard } from "./HoverCard";
import { Glyph } from "./Relics";
import { TOWER_ICONS } from "./towerIcons";

/**
 * THE INSPECTOR — what the thing you just clicked is, along the bottom of
 * the field between the two corners.
 *
 * A CLICK ON A TURRET ALREADY DID SOMETHING: it drew a range ring
 * (Game.drawSelection). But the two facts a player actually wants off a
 * building — what is left of it, and WHICH ATTRIBUTES IT WON — were
 * nowhere on the screen. A turret born with three attributes is the story
 * of a patch (mods.ts: every placement rolls for every attribute the run
 * owns, so a card comes out speckled), and until now the only sign of it
 * was a single coloured pip in the corner of the footprint saying "this
 * one is special" without saying how.
 *
 * IT GOES BOTTOM-CENTRE because that is the one edge of the field with
 * nothing on it: the minimap owns the bottom-left, the deal owns the
 * bottom-right, and the middle is where an RTS has always put "what is
 * selected". It is centred on the SCREEN rather than on the gap, so it
 * does not slide about as the corners change size, and it is capped at the
 * width between them so it never slips under either.
 *
 * ONE PANEL FOR ONE TURRET OR THREE HUNDRED. A marquee is a selection too,
 * so the panel reads a SUMMARY (UiState.inspect): the pools summed into
 * one bar, and the attributes tallied across everything picked. Select one
 * turret and that summary is just that turret; drag a box over a wall and
 * the same row answers "how much of this patch came out gleaming", which
 * is the better question anyway.
 *
 * IT IS ICONS AND A BAR AND NOTHING ELSE. Every attribute already has a
 * face the player has learned in two other places — the shelf at the
 * top-left and the codex — and a fourth place that spelled the names out
 * in words would be a paragraph over the field, mid-wave, for a glance.
 * The names are one hover away, as they are everywhere else.
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
      className="pointer-events-auto relative flex h-[24px] w-[24px] shrink-0 items-center justify-center border"
      style={{ borderColor: r.color, background: r.ground }}
      aria-label={many ? `${modName(d)}, on ${n} of them` : modName(d)}
    >
      <Glyph glyph={d.glyph} className="h-[16px] w-[16px]" />
      {many && (
        <span
          className="pointer-events-none absolute -bottom-[4px] -right-[3px] bg-[#0b0b0d] px-[2px] text-[9px] font-bold leading-none"
          style={{ color: r.color }}
        >
          {n}
        </span>
      )}
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
      <div className="relative h-[10px] w-[11rem] overflow-hidden border border-[#26262b] bg-[#101013]">
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
  const { n, kind, name, hp, hpMax, mods } = inspect;
  const many = n > 1;
  return (
    <div
      className="ms-pane pointer-events-auto flex max-w-[calc(100vw-30rem)] items-center gap-3 px-3 py-2"
      role="status"
      aria-label={`Selected: ${many ? `${n} ` : ""}${name}, ${hp} of ${hpMax} health, ${
        mods.length
      } attributes`}
    >
      {/* the sprite, and ONLY when the selection is all one kind — a
          picture of a duo over a box that also holds spectres would be the
          one part of this panel that could lie */}
      {kind && (
        // eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted
        <img
          src={icons[kind] ?? TOWER_ICONS[kind]}
          alt=""
          className="h-8 w-8 shrink-0 [image-rendering:pixelated]"
        />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[13px] font-bold uppercase leading-none tracking-wide text-[#EDEDEF]">
          {many && <span className="text-[#FFD37F]">{n}× </span>}
          {name}
        </span>
        <HealthBar hp={hp} max={hpMax} />
      </div>
      {mods.length > 0 && (
        <div
          role="list"
          aria-label="attributes"
          className="ml-1 flex max-w-[26rem] flex-wrap items-center gap-1 border-l border-[#26262b] pl-3"
        >
          {mods.map((m) => (
            <ModPip key={m.id} id={m.id} n={m.n} total={n} />
          ))}
        </div>
      )}
    </div>
  );
}
