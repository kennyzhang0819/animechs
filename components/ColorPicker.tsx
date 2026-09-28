"use client";

import { PALETTE, type PaletteHex } from "@/game/palette";

export { PALETTE, isPaletteHex, type PaletteHex } from "@/game/palette";

export default function ColorPicker({
  label,
  value,
  onPick,
}: {
  label: string;
  value: PaletteHex;
  onPick: (hex: PaletteHex) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid shrink-0 grid-cols-8 gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c.hex}
          role="radio"
          aria-checked={value === c.hex}
          aria-label={c.name}
          className="ms-swatch"
          style={{ background: c.hex }}
          onClick={() => onPick(c.hex)}
        />
      ))}
    </div>
  );
}
