"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { unitQuad, UNIT_ART } from "@/game/atlas";
import { currentBalanceDoc, saveBalanceDoc } from "@/game/balance";
import { CELL } from "@/game/constants";
import {
  authoredHitbox,
  hitboxBent,
  hitboxOf,
  setHitbox,
  HITBOX_MAX,
  HITBOX_MIN,
  type HitboxSpec,
} from "@/game/hitbox";
import {
  FAMILIES,
  UNIT_KINDS,
  UNIT_STATS,
  familyOf,
  unitAccent,
  type UnitKind,
} from "@/game/levels";

/**
 * THE HITBOX BOARD — every body on the roster with its collision shape
 * drawn over its own sprite, and a shape you can drag.
 *
 * WHAT A HITBOX IS HERE (hitbox.ts): two full extents in px, `long` nose
 * to tail along the way the body faces and `wide` flank to flank across
 * it. A body whose two extents are equal is the circle every body used to
 * be. The sim measures an ELLIPSE inside that box — a closed form for the
 * radius in any direction is what let thirty distance tests stay distance
 * tests — so each card draws both: the box you are dragging, and the
 * ellipse the shots will actually meet.
 *
 * THE PICTURE IS THE BOARD'S OWN. It is the packed atlas cell, uncropped
 * and facing +x exactly as the renderer puts it on the map (atlas.ts
 * unitQuad), stretched to the world px the renderer stretches it to. So
 * the box over it sits where it sits in the game, and "the art overhangs
 * the hitbox by half a body" is a thing you can see rather than a thing
 * you have to compute. Nose is to the RIGHT on every card, because that
 * is the direction the sim calls rotation zero.
 *
 * THE GRID IS TILES. One square is one Mindustry ground tile (CELL, 20px),
 * which is the unit the roster's own comments quote a hitbox in — "a
 * 2.75x2.75-block hitbox" is two and three quarter squares here.
 *
 * NOTHING HERE IS THE SOURCE OF TRUTH. Save writes the `hitboxes` section
 * of public/balance.json over the authored shapes, the same override layer
 * the prices and the odds use; a shape that settles belongs back in
 * UNIT_STATS beside the body it describes.
 *
 * RESHAPING CHANGES WEIGHT. The sim's nominal radius is the equal-area
 * circle of the two axes, so a body dragged bigger gets heavier (it shrugs
 * off more of a tractor beam's pull), throws a wider shield halo and is
 * caught by more of a blast. A body merely STRETCHED — one axis up, the
 * other down — keeps its weight. That is deliberate: size and mass are one
 * fact about a body, not two that can drift apart.
 */

/** how big a card's picture is, in screen px */
const VIEW = 176;

/** the shapes, live, so a drag redraws every number that reads them */
type Shapes = Record<string, HitboxSpec>;

const readShapes = (): Shapes => {
  const out: Shapes = {};
  for (const k of UNIT_KINDS) out[k] = hitboxOf(k);
  return out;
};

/** px -> tiles, for the label under a dial */
const tiles = (px: number): string => (px / CELL).toFixed(2).replace(/\.?0+$/, "");

/**
 * ONE BODY'S CARD: the sprite, the shape over it, and the two dials.
 *
 * THE DRAG IS THE POINT and the number fields are the fallback, which is
 * the same split the Knob makes: the handles are for sweeping until the
 * box sits on the art, the fields for typing a round number back once you
 * know it. The right-edge handle takes `long`, the bottom-edge handle
 * takes `wide`, and the corner takes both at once.
 */
function UnitCard({
  kind,
  box,
  onChange,
}: {
  kind: UnitKind;
  box: HitboxSpec;
  onChange: (box: HitboxSpec | undefined) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [art, setArt] = useState<{ img: HTMLImageElement; size: number } | null>(null);
  // which handle has the pointer, if any — and the drag's own copy of the
  // box, so a pointer that leaves the canvas still steers it
  const drag = useRef<"long" | "wide" | "both" | null>(null);

  const sprite = UNIT_ART[kind].sprite;
  const authored = authoredHitbox(kind);
  const bent = hitboxBent(kind);
  // what the world sees on this card: the sprite quad, or the box if a
  // drag has pushed it past the art, plus a margin so a handle on the
  // edge is still grabbable
  const span = Math.max(sprite, box.long, box.wide) * 1.18;
  const scale = VIEW / span;

  // the body's picture, carved once off the packed sheet
  useEffect(() => {
    let alive = true;
    unitQuad(kind, unitAccent(kind))
      .then(({ url, size }) => {
        const img = new Image();
        img.onload = () => {
          if (alive) setArt({ img, size });
        };
        img.src = url;
      })
      .catch(() => {
        // the sheet failed to build; the card draws the shape alone
      });
    return () => {
      alive = false;
    };
  }, [kind]);

  // ...and the whole card redrawn whenever the shape or the art moves
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    c.width = VIEW * dpr;
    c.height = VIEW * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VIEW, VIEW);
    const mid = VIEW / 2;

    // THE TILE GRID, one square per ground cell, drawn from the centre out
    // so the body always stands on an intersection
    ctx.strokeStyle = "#1B1B21";
    ctx.lineWidth = 1;
    const step = CELL * scale;
    for (let d = 0; d * step < mid + step; d++) {
      for (const s of d === 0 ? [0] : [-1, 1]) {
        const p = Math.round(mid + s * d * step) + 0.5;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, VIEW);
        ctx.moveTo(0, p);
        ctx.lineTo(VIEW, p);
        ctx.stroke();
      }
    }

    // the body, at the size the renderer draws it: the whole cell stretched
    // to `sprite` world px, so the art's overhang is the art's real overhang
    if (art) {
      const s = sprite * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(art.img, mid - s / 2, mid - s / 2, s, s);
    }

    const hl = (box.long * scale) / 2, hw = (box.wide * scale) / 2;
    // THE ELLIPSE — what the sim measures
    ctx.strokeStyle = "#3987e5";
    ctx.fillStyle = "rgba(57, 135, 229, 0.16)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(mid, mid, hl, hw, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // ...and THE BOX, which is what the handles move
    ctx.strokeStyle = "rgba(57, 135, 229, 0.55)";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeRect(mid - hl, mid - hw, hl * 2, hw * 2);
    ctx.setLineDash([]);

    // the three handles: right edge (long), bottom edge (wide), corner
    ctx.fillStyle = "#EDEDEF";
    for (const [hx, hy] of [
      [mid + hl, mid],
      [mid, mid + hw],
      [mid + hl, mid + hw],
    ]) {
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // the nose, so "long" is unambiguous even on a body whose art is round
    ctx.strokeStyle = "#5B5B66";
    ctx.beginPath();
    ctx.moveTo(mid + hl + 6, mid);
    ctx.lineTo(mid + hl + 12, mid);
    ctx.stroke();
  }, [art, box.long, box.wide, scale, sprite]);

  const clamp = (v: number): number => Math.min(HITBOX_MAX, Math.max(HITBOX_MIN, v));

  const steer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>, which: "long" | "wide" | "both") => {
      const rect = e.currentTarget.getBoundingClientRect();
      const dx = Math.abs(e.clientX - rect.left - VIEW / 2) / scale;
      const dy = Math.abs(e.clientY - rect.top - VIEW / 2) / scale;
      onChange({
        long: which === "wide" ? box.long : clamp(Math.round(dx * 2)),
        wide: which === "long" ? box.wide : clamp(Math.round(dy * 2)),
      });
    },
    [box.long, box.wide, onChange, scale],
  );

  // which handle a press landed on: whichever is nearest, within reach of
  // the press. A press in open canvas takes the corner, so dragging
  // anywhere on the card resizes rather than doing nothing
  const grab = (e: React.PointerEvent<HTMLCanvasElement>): "long" | "wide" | "both" => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - VIEW / 2, py = e.clientY - rect.top - VIEW / 2;
    const hl = (box.long * scale) / 2, hw = (box.wide * scale) / 2;
    const near = (x: number, y: number) => Math.hypot(Math.abs(px) - x, Math.abs(py) - y) < 12;
    if (near(hl, hw)) return "both";
    if (near(hl, 0)) return "long";
    if (near(0, hw)) return "wide";
    return "both";
  };

  return (
    <div
      className={`rounded-lg border p-3 ${
        bent ? "border-[#3987e5]" : "border-[#2E2E36]"
      }`}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-bold text-[#EDEDEF]">{kind}</span>
        <button
          onClick={() => onChange(undefined)}
          disabled={!bent}
          className="rounded border border-[#2E2E36] px-2 py-0.5 text-[12.5px] text-[#71717C] hover:border-[#4A4A55] disabled:opacity-30"
        >
          Reset
        </button>
      </div>
      <canvas
        ref={canvas}
        style={{ width: VIEW, height: VIEW }}
        className="cursor-move touch-none rounded bg-[#0B0B0D]"
        onPointerDown={(e) => {
          drag.current = grab(e);
          e.currentTarget.setPointerCapture(e.pointerId);
          steer(e, drag.current);
        }}
        onPointerMove={(e) => {
          if (drag.current) steer(e, drag.current);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      />
      <div className="mt-2 space-y-1">
        {(["long", "wide"] as const).map((axis) => (
          <label key={axis} className="flex items-center justify-between gap-2">
            <span className="text-[13.5px] text-[#71717C]">
              {axis === "long" ? "long (nose-tail)" : "wide (flank)"}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-[12.5px] tabular-nums text-[#5B5B66]">
                {tiles(box[axis])}t
              </span>
              <input
                type="number"
                value={Math.round(box[axis])}
                min={HITBOX_MIN}
                max={HITBOX_MAX}
                step={1}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) onChange({ ...box, [axis]: clamp(v) });
                }}
                className="w-16 rounded border border-[#2E2E36] bg-[#0B0B0D] px-1.5 py-0.5 text-right font-mono text-[13.5px] tabular-nums text-[#EDEDEF]"
              />
            </span>
          </label>
        ))}
        <p className="pt-1 text-[12.5px] text-[#5B5B66]">
          radius {(Math.sqrt((box.long / 2) * (box.wide / 2))).toFixed(1)}px
          {bent && (
            <> · was {Math.round(authored.long)}×{Math.round(authored.wide)}</>
          )}
          {UNIT_STATS[kind].flying ? " · air" : UNIT_STATS[kind].naval ? " · naval" : ""}
        </p>
      </div>
    </div>
  );
}

export default function HitboxView() {
  const [shapes, setShapes] = useState<Shapes>(readShapes);
  const [status, setStatus] = useState<string | null>(null);

  const change = useCallback((kind: UnitKind, box: HitboxSpec | undefined) => {
    // the module's tables are the truth — a live Sim reads them every tick
    // — and this copy exists only so React knows something moved
    setHitbox(kind, box);
    setShapes(readShapes());
    setStatus(null);
  }, []);

  const bentCount = UNIT_KINDS.filter((k) => hitboxBent(k)).length;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="max-w-3xl text-[14.5px] text-[#71717C]">
          Every body on the roster with its collision shape over its own sprite. Drag a handle —
          right edge for <b>long</b> (nose to tail, along the facing), bottom edge for{" "}
          <b>wide</b> (flank to flank), the corner for both. One grid square is one tile. The
          dashed box is what you are dragging; the filled ellipse inside it is what the sim
          actually measures, and what every shot, blast, beam and shove is tested against. A body
          dragged bigger also gets heavier — the sim&apos;s nominal radius is the equal-area
          circle of the two axes.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {status && <span className="text-[14px] text-[#71717C]">{status}</span>}
          <span className="text-[14px] text-[#71717C]">
            {bentCount} bent
          </span>
          <button
            onClick={async () => {
              setStatus("Saving…");
              setStatus(
                (await saveBalanceDoc(currentBalanceDoc())) ? "Saved" : "Save failed",
              );
            }}
            className="rounded border border-[#2E2E36] px-3 py-1.5 text-[15px] font-bold text-[#EDEDEF] hover:border-[#4A4A55]"
          >
            Save
          </button>
        </div>
      </div>

      {/* one section per family, plus whatever is in none of them (the
          boss), because a shape is read against its siblings: a T3 that is
          longer than its own T4 is the thing this page is for spotting */}
      {[...FAMILIES.map((f) => ({ key: f.key as string, name: f.name })), { key: "", name: "Unaffiliated" }].map(
        ({ key, name }) => {
          const kinds = UNIT_KINDS.filter((k) => (familyOf(k) ?? "") === key);
          if (kinds.length === 0) return null;
          return (
            <div key={key || "none"} className="mb-6">
              <div className="mb-2 text-[17px] font-bold text-[#EDEDEF]">{name}</div>
              <div className="flex flex-wrap gap-3">
                {kinds.map((k) => (
                  <UnitCard
                    key={k}
                    kind={k}
                    box={shapes[k]}
                    onChange={(box) => change(k, box)}
                  />
                ))}
              </div>
            </div>
          );
        },
      )}
    </div>
  );
}
