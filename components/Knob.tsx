"use client";

/**
 * ONE DIAL ON THE ADMIN DASHBOARD: a slider plus a number field, because
 * neither alone is enough — the slider is for sweeping until it looks
 * right, the field for typing the value back once you know it.
 *
 * IT LIVES IN ITS OWN FILE because two boards wear it now (BalanceView's
 * prices and difficulties, RaritiesView's odds) and a third will. It was a
 * local function in BalanceView, which is where the second board would
 * have copied it from, and a copied slider is a slider whose Reset button
 * stops matching the other one's six months later.
 *
 * `bent` is what greys the Reset: a dial sitting on its authored value has
 * nothing to return to, and a Reset that is always live gives no answer to
 * "what have I actually changed on this page".
 */
export function Knob({
  label,
  hint,
  value,
  min,
  max,
  step,
  decimals,
  onChange,
  onReset,
  bent,
  right,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  onChange: (v: number) => void;
  onReset: () => void;
  /** is this dial off its authored value? */
  bent: boolean;
  /** what the dial MEANS right now — the normalised odds, the odds per
   *  turret — printed beside the label, because a relative weight is
   *  meaningless until it is read against its own table */
  right?: React.ReactNode;
}) {
  return (
    <div className="border-t border-[#2E2E36] py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-bold text-[#EDEDEF]">
          {label}
          {right && <span className="ml-2 font-normal text-[#71717C]">{right}</span>}
        </span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={Number(value.toFixed(decimals))}
            min={min}
            step={step}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange(v);
            }}
            className="w-24 rounded border border-[#2E2E36] bg-[#0B0B0D] px-2 py-1 text-right font-mono text-[15px] tabular-nums text-[#EDEDEF]"
          />
          <button
            onClick={onReset}
            disabled={!bent}
            className="rounded border border-[#2E2E36] px-2 py-1 text-[13px] text-[#71717C] hover:border-[#4A4A55] disabled:opacity-30"
          >
            Reset
          </button>
        </div>
      </div>
      <input
        type="range"
        value={Math.min(max, Math.max(min, value))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[#3987e5]"
        aria-label={label}
      />
      <p className="mt-1 text-[13.5px] text-[#71717C]">{hint}</p>
    </div>
  );
}
