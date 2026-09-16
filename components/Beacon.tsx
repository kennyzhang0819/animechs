"use client";

import { BORE, MAST, POWER, STEEL, type Mat } from "@/game/turretArt";
import type { BeaconPanel } from "@/game/game";

/**
 * THE BEACON PANEL — what the beacon you just clicked is, what it costs,
 * and the button that buys it, along the bottom of the field between the
 * two corners.
 *
 * IT STANDS WHERE THE INSPECTOR STANDS (components/Inspector.tsx) and for
 * the same reason: the minimap owns the bottom-left, the deal owns the
 * bottom-right, and the middle is where an RTS has always put "what is
 * selected". A click on a turret prints a turret there; a click on a
 * beacon prints this. They are never up together — a click that makes one
 * clears the other (Game.selectBeacon) — so the bottom of the screen
 * always holds exactly one answer to "what did I just click".
 *
 * WHY THE PRICE MOVED HERE OFF THE FIELD. Every beacon on the map used to
 * wear its price as a number stamped over it, all the time, and every
 * unbought one drew its sixty-cell circle on top of that. On a map with a
 * dozen beacons that is most of the board covered in offers nobody asked
 * to see, drawn over the wave the player is trying to read. Worse, the
 * price was the ONLY warning attached to a press that spent four or five
 * figures the instant it landed. Both problems have the same answer: a
 * beacon is a thing you SELECT, like everything else on this board, and
 * what it costs is printed where a player already looks to read what they
 * selected — beside a button, which is how every other purchase in this
 * game is made.
 *
 * THE BUTTON IS THE ONE LOUD THING ON IT. There is one decision in this
 * panel and the panel is shaped around it: the picture and the two lines
 * of prose say what a beacon is, and the gold button on the right says
 * what it costs and takes the money. A beacon already bought has no
 * button at all — there is nothing left to decide, and a greyed-out
 * button would be a control implying otherwise.
 */

/**
 * THE MAST, AS THE BLOCK IS DRAWN (atlas.ts beaconBlock) — four nested
 * diamonds, each filled twice down the midline so its dark half is on the
 * left and its light half on the right.
 *
 * IT IS RE-DRAWN HERE RATHER THAN SHARED, and that is on purpose: the
 * block is generated into a WebGL atlas at pack time and there is no image
 * to point an `<img>` at. Both readings come off the same four materials
 * in turretArt.ts, so the palette cannot drift — only the geometry is
 * restated, and it is four lines of it.
 */
function Mast({ className = "h-9 w-9" }: { className?: string }) {
  // the same radii as the block, in its own 96-unit frame
  const parts: { r: number; mat: Mat }[] = [
    { r: 38, mat: MAST },
    { r: 27, mat: STEEL },
    { r: 18, mat: BORE },
  ];
  return (
    <svg viewBox="0 0 96 96" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <defs>
        {/* the shade: one clip per side of the sprite, so the form stays
            symmetric and only the light is not */}
        <clipPath id="beacon-dark">
          <rect x="0" y="0" width="48" height="96" />
        </clipPath>
        <clipPath id="beacon-light">
          <rect x="48" y="0" width="48" height="96" />
        </clipPath>
      </defs>
      {parts.map(({ r, mat }) => (
        <g key={r}>
          <polygon
            points={`48,${48 - r} ${48 + r},48 48,${48 + r} ${48 - r},48`}
            fill={mat[0]}
            clipPath="url(#beacon-dark)"
          />
          <polygon
            points={`48,${48 - r} ${48 + r},48 48,${48 + r} ${48 - r},48`}
            fill={mat[1]}
            clipPath="url(#beacon-light)"
          />
        </g>
      ))}
      <rect x="37" y="37" width="22" height="22" fill={POWER[0]} clipPath="url(#beacon-dark)" />
      <rect x="37" y="37" width="22" height="22" fill={POWER[1]} clipPath="url(#beacon-light)" />
    </svg>
  );
}

export function Beacon({
  beacon,
  scrap,
  onBuy,
}: {
  beacon: BeaconPanel;
  /** the run's purse, or null where building is free — the button says so */
  scrap: number | null;
  onBuy: (i: number) => void;
}) {
  const { bought, price, next, taken, total, poor, radius, gains } = beacon;
  const free = scrap === null || price <= 0;
  // WHAT THIS ONE IS FOR, in one line, and it is not the same line for
  // every state. A bought beacon is history; an unbought one whose whole
  // circle is already inside ground you own is a price for nothing, and
  // the ring on the field draws nothing at all to say so — which looks
  // like a fault unless it is said in words. Everything else is the offer.
  const note = bought
    ? "Powered. The ground inside its reach is yours to build on."
    : gains
      ? "Buying it opens the ground inside its reach to your turrets, for the rest of the run."
      : "Every acre it reaches is already yours. Buying it would open nothing.";
  // THE LADDER, IN THE ONE LINE THAT MATTERS: every beacon on this map is
  // offered at this price, and paying it puts the rest up to the next rung
  // (Game.beaconPrice). Without this the panel is a price tag on a hill,
  // and a player learns the rule by watching four figures appear on a
  // beacon they did not touch — which reads as a bug and teaches nothing.
  // A board whose last rung has been reached says the price is flat rather
  // than promising a rise that will not come.
  const ladder =
    bought || free
      ? null
      : next > price
        ? `Every beacon on this map costs ${price.toLocaleString()}. Buy one and the rest go to ${next.toLocaleString()}.`
        : `Every beacon on this map costs ${price.toLocaleString()}, and this is as dear as they get.`;
  return (
    <div
      className="ms-pane pointer-events-auto flex max-w-[calc(100vw-30rem)] items-center gap-3 px-3 py-2"
      role="status"
      aria-label={`Selected: beacon, ${
        bought ? "powered" : free ? "free to switch on" : `${price} scrap`
      }, reaches ${radius} tiles`}
    >
      {/* THE PICTURE WITH THE NAME UNDER IT, laid out exactly as the
          inspector lays a turret out — same column, same floor and
          ceiling on its width — so the two panels are plainly the same
          piece of furniture answering about two different things */}
      <div className="flex min-w-[4.5rem] max-w-[8rem] shrink-0 flex-col items-center gap-1">
        <Mast />
        <span className="w-full truncate text-center text-[11px] font-bold uppercase leading-none tracking-wide text-[#EDEDEF]">
          Beacon
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {/* WHAT IT IS AND WHAT IT REACHES. The reach is in TILES, which is
            the unit every other range in this game is read in, and it is
            the number the dashed ring on the field is drawing */}
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase leading-none tracking-wide">
          <span className={bought ? "text-[#7BE58A]" : "text-[#FFD37F]"}>
            {bought ? "Powered" : "For sale"}
          </span>
          <span className="text-[#4A4A55]">|</span>
          <span className="text-[#A1A1AA]">
            Reaches <span className="tabular-nums text-[#EDEDEF]">{radius}</span> tiles
          </span>
          {/* HOW MANY OF THIS BOARD ARE ALREADY LIT — the rung the run is
              standing on, which is the only reason the price is what it
              is (Game.beaconPrice) */}
          {total > 0 && (
            <>
              <span className="text-[#4A4A55]">|</span>
              <span className="text-[#A1A1AA]">
                <span className="tabular-nums text-[#EDEDEF]">{taken}</span> of{" "}
                <span className="tabular-nums text-[#EDEDEF]">{total}</span> powered
              </span>
            </>
          )}
        </div>
        <p className="max-w-[30rem] text-[12px] leading-snug text-[#A1A1AA]">{note}</p>
        {ladder && (
          <p className="max-w-[30rem] text-[12px] leading-snug text-[#71717C]">{ladder}</p>
        )}
      </div>
      {/* THE PURCHASE, and nothing else in this corner of the panel. It
          carries the price on its own face rather than beside it: the
          number and the thing that spends it are one control, so there is
          no way to read a price and press something else.

          IT GOES RED RATHER THAN AWAY when the bank is short. A missing
          button says "this is not for sale"; a red number on a dead button
          says "this is the number you are saving towards", which is the
          true thing and the one a run spends most of its middle acting on. */}
      {!bought && (
        <div className="ml-1 shrink-0 border-l border-[#26262b] pl-3">
          <button
            type="button"
            className={`ms-btn ${poor ? "" : "ms-btn-accent"} px-4 py-2 text-[13px]`}
            disabled={poor}
            onClick={() => onBuy(beacon.i)}
          >
            {free ? (
              "Switch on"
            ) : (
              <>
                <span>Buy</span>
                <span
                  className="tabular-nums"
                  style={poor ? { color: "#FF7468" } : undefined}
                >
                  {price.toLocaleString()}
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
