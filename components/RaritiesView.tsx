"use client";

import { useCallback, useState } from "react";

import { currentBalanceDoc, saveBalanceDoc } from "@/game/balance";
import { SHAPE_ODDS, FORMATION_IDS, formationCount, formationDef, formationRarity } from "@/game/formation";
import {
  authoredChance,
  chanceOf,
  modName,
  MODS,
  MOD_ODDS,
  setChance,
  TURRET_MOD_IDS,
  modDef,
  type ModId,
} from "@/game/mods";
import { RELICS, RELIC_ODDS } from "@/game/relics";
import {
  RARITIES,
  RARITY,
  rarityOdds,
  TURRET_ODDS,
  turretsOfRarity,
  type Rarity,
  type WeightDial,
} from "@/game/rarity";
import { TOWERS } from "@/game/constants";
import { FIELDED_KINDS, isRetired } from "@/game/types";
import { Knob } from "./Knob";

/**
 * THE RARITIES BOARD — every roll in the game and what it is weighed
 * against, on one screen, turnable without a rebuild.
 *
 * FIVE TABLES, AND THEY ARE ONE QUESTION ASKED FIVE TIMES: how often does
 * the good thing happen.
 *
 *   THE TURRET DEAL (rarity.ts) — which gun a card turns over. The number
 *   the whole deal is composed against is the purple one: a 4x4 handed
 *   over casually is a 4x4 that stops being the thing a run hopes for.
 *
 *   THE SHAPE DEAL (formation.ts) — how much of it, in what shape. This is
 *   deliberately the GENEROUS half of the same button: what a player
 *   should feel at T is "which gun" first and "how much of it" second, and
 *   odds as steep as the turrets' would invert that.
 *
 *   THE MOD DEAL (mods.ts) — which mod M hands over.
 *
 *   THE RELIC DEAL (relics.ts) — which relic G hands over. A TABLE OF ITS
 *   OWN, and that is the point: the two used to share one dial, so bending
 *   "ultra" moved the odds of an ultra mod AND of an ultra relic at once.
 *   They are two categories bought off two buttons at two prices, so they
 *   get a knob each.
 *
 *   THE MOD ROLL (mods.ts ModDef.chance) — once a run OWNS a mod, how
 *   often it lands on a turret being placed. This is the one that decides
 *   how speckled a patch comes out, and it is the one that compounds:
 *   every mod is rolled for every turret independently, so the whole
 *   column multiplies together on one gun.
 *
 * A BAND WEIGHT IS RELATIVE, NOT A PERCENTAGE. The roll normalises
 * whatever it is handed over the bands actually in the pool, so 62/27/10/1
 * and 620/270/100/10 are the same table — which is why every weight here
 * prints its own normalised share beside it. That share is the only number
 * on this page worth reading.
 *
 * NOTHING HERE IS THE SOURCE OF TRUTH. It writes public/balance.json over
 * the authored tables (game/balance.ts), the same override layer the
 * prices use; a number that settles belongs back in the const beside the
 * reasoning for it.
 */

/** one band's live share of its own table, as the roll would take it */
function Share({ dial, band }: { dial: WeightDial; band: Rarity }) {
  const pct = rarityOdds(dial.live())[band];
  return (
    <span className="font-mono tabular-nums" style={{ color: RARITY[band].color }}>
      {(pct * 100).toFixed(pct < 0.01 ? 2 : 1)}%
    </span>
  );
}

/**
 * ONE WEIGHT TABLE, four dials. `contents` is what each band actually
 * holds — the turrets, the shapes, the modules — because a weight with
 * nothing behind it is redistributed by the roll (rollTurret) and a band
 * the dashboard shows as 1% may in practice be 0%.
 */
function OddsTable({
  title,
  blurb,
  dial,
  contents,
  onChange,
}: {
  title: string;
  blurb: string;
  dial: WeightDial;
  contents: (r: Rarity) => string;
  onChange: () => void;
}) {
  const live = dial.live();
  return (
    <div className="mb-4 rounded-lg border border-[#2E2E36] p-4">
      <div className="mb-1 text-[17px] font-bold text-[#EDEDEF]">{title}</div>
      <p className="mb-2 max-w-3xl text-[14.5px] text-[#71717C]">{blurb}</p>
      {RARITIES.map((r) => (
        <Knob
          key={r}
          label={RARITY[r].name}
          hint={contents(r)}
          value={live[r]}
          min={0}
          max={100}
          step={0.5}
          decimals={1}
          bent={live[r] !== dial.authored[r]}
          right={<Share dial={dial} band={r} />}
          onChange={(v) => {
            dial.set(r, v);
            onChange();
          }}
          onReset={() => {
            dial.set(r, undefined);
            onChange();
          }}
        />
      ))}
    </div>
  );
}

export default function RaritiesView() {
  const [, bump] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const touched = useCallback(() => {
    setStatus(null);
    bump((n) => n + 1);
  }, []);

  const save = useCallback(async () => {
    setStatus((await saveBalanceDoc(currentBalanceDoc())) ? "Saved" : "Save failed");
  }, []);

  // WHAT THE ATTRIBUTE COLUMN COMES TO, on one turret, with every
  // attribute owned exactly once: the expected count. It is the honest
  // read of "am I overtuning the commons" — a patch of thirty-six is this
  // number thirty-six times over, and the multipliers compound
  const perTurret = TURRET_MOD_IDS.filter((id) => !modDef(id).solo).reduce(
    (n, id) => n + chanceOf(id),
    0,
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-3xl text-[15px] leading-relaxed text-[#71717C]">
          Every roll in the game and what it is weighed against. Band weights are{" "}
          <span className="text-[#A6A6AF]">relative, not percentages</span> — the roll
          normalises them over whatever is actually in the pool, so the share printed
          beside each dial is the number worth reading. Saving writes{" "}
          <span className="text-[#A6A6AF]">public/balance.json</span> over the authored
          tables, alongside whatever the Balance page has bent.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {status && <span className="text-[15px] text-[#71717C]">{status}</span>}
          <button
            onClick={save}
            className="rounded border border-[#4A4A55] bg-[#1C1C21] px-3 py-1.5 text-[15px] font-bold text-[#EDEDEF] hover:border-[#71717C]"
          >
            Save
          </button>
        </div>
      </div>

      <OddsTable
        title="The turret deal — which gun T turns over"
        blurb="The number the whole deal is composed against is the purple one. A card is a
          rarity rolled first and a turret picked uniformly inside it, so adding a fourth
          ultra makes WHICH ultra less predictable and never makes ultras likelier."
        dial={TURRET_ODDS}
        // WHAT THE DEAL CAN ACTUALLY TURN OVER, which is not every kind in
        // the table: the retired ones are off the field (types.ts) and the
        // support blocks are not dealt, so listing them here would promise
        // a band contents it never hands out
        contents={(r) =>
          turretsOfRarity(r)
            .filter((k) => FIELDED_KINDS.includes(k) && !isRetired(k))
            .map((k) => TOWERS[k].name)
            .join(", ") || "nothing in this band"
        }
        onChange={touched}
      />

      <OddsTable
        title="The shape deal — how much of it, and in what shape"
        blurb="Deliberately the generous half of the same button: an ultra SHAPE should come
          up about one draw in ten against an ultra turret's one in a hundred. What a player
          feels at T is 'which gun' first and 'how much of it' second, and odds as steep as
          the turrets' would invert that."
        dial={SHAPE_ODDS}
        contents={(r) =>
          FORMATION_IDS.filter((id) => formationRarity(id) === r)
            .map((id) => `${formationDef(id).name} (${formationCount(id)})`)
            .join(", ") || "nothing in this band"
        }
        onChange={touched}
      />

      <OddsTable
        title="The mod deal — what M hands over"
        blurb="Steeper at the top than the shape table's on purpose: a formation is spent the
          moment it is placed and a mod is owned for the rest of the run. This half never runs
          out — a mod has no cap, so a copy is always worth something and the M button is never
          bought out."
        dial={MOD_ODDS}
        contents={(r) =>
          MODS.filter((d) => d.rarity === r)
            .map((d) => modName(d))
            .join(", ") || "nothing in this band"
        }
        onChange={touched}
      />

      <OddsTable
        title="The relic deal — what G hands over"
        blurb="The relics' OWN table, not the mods'. Every relic costs the same hundred and fifty
          thousand, so a band here is only how OFTEN one comes up and never how good it is — the
          common band holds Overclock Core, which doubles the damage of every gun on the field.
          A relic is held once, so this half genuinely runs out."
        dial={RELIC_ODDS}
        contents={(r) =>
          RELICS.filter((d) => d.rarity === r)
            .map((d) => d.name)
            .join(", ") || "nothing in this band"
        }
        onChange={touched}
      />

      <div className="mb-4 rounded-lg border border-[#2E2E36] p-4">
        <div className="mb-1 text-[17px] font-bold text-[#EDEDEF]">
          The mod roll — how often an owned mod lands on a new turret
        </div>
        <p className="mb-2 max-w-3xl text-[14.5px] text-[#71717C]">
          Once a run owns an attribute, every turret it places rolls for it — and for every
          other one, independently, so this whole column multiplies together on one gun.
          With each owned once an average turret carries{" "}
          <span className="font-mono tabular-nums text-[#A6A6AF]">{perTurret.toFixed(2)}</span>{" "}
          attributes; a patch of thirty-six is that thirty-six times over. These odds are
          CONSTANT: a turret either has an attribute or it does not, and a second copy owned
          buys a bigger effect rather than another roll — every copy adds its own step again
          (mods.ts), so the column below is what a run is offered and never what it is worth.
        </p>
        {(["common", "uncommon", "rare", "ultra"] as const).map((band) => {
          const ids = MODS.filter((d) => d.rarity === band).map((d) => d.id as ModId);
          if (ids.length === 0) return null;
          return (
            <div key={band} className="mt-3 first:mt-0">
              <div
                className="mb-1 text-[13px] font-bold uppercase tracking-widest"
                style={{ color: RARITY[band].color }}
              >
                {RARITY[band].name}
              </div>
              {ids.map((id) => {
                const d = modDef(id);
                const live = chanceOf(id);
                return (
                  <Knob
                    key={id}
                    label={modName(d)}
                    // AN UNNAMED TICK IS ALREADY ITS OWN TWEAK, so
                    // repeating it under the slider would print the label
                    // twice; a NAMED one says what it actually does
                    hint={
                      d.solo
                        ? `${d.tweak} — rolled ONCE PER CARD, and it replaces the shape`
                        : d.name
                          ? (d.tweak ?? "")
                          : ""
                    }
                    value={live * 100}
                    min={0}
                    max={100}
                    step={0.5}
                    decimals={1}
                    bent={live !== authoredChance(id)}
                    // the unit is not always a turret — the giant is rolled
                    // once per card, and a dial that does not say so reads
                    // as a hundred times what it is on a x10 citadel
                    right={
                      <span className="font-mono tabular-nums">
                        {(live * 100).toFixed(1)}% a {d.solo ? "card" : "turret"}
                      </span>
                    }
                    onChange={(v) => {
                      setChance(id, v / 100);
                      touched();
                    }}
                    onReset={() => {
                      setChance(id, undefined);
                      touched();
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
