"use client";

import { useEffect, useState } from "react";
import type { UiState } from "@/game/game";

/**
 * THE THREE THINGS A FINGER CANNOT REACH. Everything else on the HUD is
 * already a button — the tier square, the amount, the card itself, the
 * menu in the top corner — so this is only what lived on a key or on a
 * button a mouse has and a tablet has not: pause (space), turn (R) and
 * demolish (the right button). docs/touch.md.
 *
 * It sits in the top-right row beside the menu cog rather than floating in
 * a corner of its own, so the HUD keeps one place where controls live.
 *
 * It renders only where the pointer is COARSE, so a desktop run is exactly
 * what it was. That test is made after mount rather than during render
 * because the bundle is prerendered (`output: export`) and the server has
 * no pointer to ask about — rendering it on the server and not on the
 * client is a hydration mismatch.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const read = () => setCoarse(mq.matches || navigator.maxTouchPoints > 0);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return coarse;
}

function Key({
  label,
  hint,
  on = false,
  danger = false,
  disabled = false,
  onPress,
}: {
  label: string;
  hint: string;
  on?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      aria-label={hint}
      aria-pressed={on}
      className="ms-btn flex h-[34px] w-[34px] items-center justify-center disabled:opacity-35"
      style={
        on
          ? { borderColor: danger ? "#E0913F" : "#7BDFF2", color: danger ? "#E0913F" : "#7BDFF2" }
          : undefined
      }
    >
      <span className="font-display text-[11px] font-bold leading-none">{label}</span>
    </button>
  );
}

export default function TouchControls({
  hud,
  onPause,
  onTurn,
  onSell,
}: {
  hud: UiState;
  onPause: () => void;
  onTurn: () => void;
  onSell: () => void;
}) {
  if (hud.lost || hud.won || hud.menuOpen) return null;
  return (
    <div className="flex flex-row gap-1">
        <Key
          label={hud.paused ? "|>" : "||"}
          hint={hud.paused ? "Resume" : "Pause"}
          on={hud.paused}
          onPress={onPause}
        />
        <Key
          label="R"
          hint="Turn the shape a quarter clockwise"
          disabled={hud.buildKind === null}
          onPress={onTurn}
        />
        <Key
          label="SELL"
          hint="Demolish tool: while it is lit, a tap on the field sells what it lands on"
          on={hud.sellMode}
          danger
          onPress={onSell}
        />
    </div>
  );
}
