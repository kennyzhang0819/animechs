"use client";

// the hero run's HUD (docs/heroes.md): the pool, the four skills with
// their cooldown wedges, and the four turrets with their prices
import { HERO_DEFS, HERO_SLOT_KEYS, type HeroSkillDef } from "@/game/heroes";
import type { HeroUi } from "@/game/game";
import { TOWERS } from "@/game/constants";
import type { TowerKind } from "@/game/types";
import { TOWER_ICONS } from "./towerIcons";

const css = (c: readonly [number, number, number], a = 1): string =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

/** the grey wedge that runs down clockwise as a wait does (Deal.tsx TierButton) */
const wedge = (left: number, of: number): string | undefined => {
  if (left <= 0 || of <= 0) return undefined;
  const swept = Math.max(0, Math.min(1, left / of));
  return `conic-gradient(from 0deg, transparent 0turn ${1 - swept}turn, rgba(8,9,12,0.8) ${1 - swept}turn 1turn)`;
};

function Slot({
  keyLabel,
  title,
  sub,
  cover,
  active,
  poor,
  tint,
  children,
}: {
  keyLabel: string;
  title: string;
  sub: string;
  cover?: string;
  active?: boolean;
  poor?: boolean;
  tint: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={`${keyLabel}: ${title}, ${sub}`}
      title={`${title} — ${sub}`}
      className={`ms-btn ms-btn-key ms-btn-tint relative flex h-[4.8rem] w-[5.4rem] flex-col items-center justify-end gap-0.5 overflow-hidden px-1 pb-1 pt-4 ${
        poor ? "opacity-60" : ""
      } ${active ? "outline outline-2 outline-white/80" : ""}`}
      style={{ ["--ms-tint" as string]: tint }}
    >
      <span className="ms-key">{keyLabel}</span>
      <div className="flex min-h-0 flex-1 items-center justify-center">{children}</div>
      <span className="w-full truncate text-center text-[9px] uppercase tracking-wide text-[#EDEDEF]">{title}</span>
      <span className="text-[10px] tabular-nums text-[#A6A6AF]">{sub}</span>
      {cover && <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: cover }} />}
    </div>
  );
}

export default function HeroBar({ hero, scrap, icons }: {
  hero: HeroUi;
  scrap: number | null;
  icons: Partial<Record<TowerKind, string>>;
}) {
  const def = HERO_DEFS[hero.id];
  const tint = css(def.accent);
  const skills: HeroSkillDef[] = [def.primary, def.secondary, def.dash, def.ult];
  const down = hero.respawn > 0;
  const frac = Math.max(0, Math.min(1, hero.hp / hero.hpMax));
  return (
    <div className="flex flex-col items-center gap-1.5">
      {hero.note && (
        <div className="ms-pane px-3 py-1 text-[12px] uppercase tracking-widest text-[#FFB4A0]">{hero.note}</div>
      )}
      <div className="ms-pane flex flex-col gap-1.5 p-2">
        <div className="flex items-center gap-3 px-1">
          <span className="font-display text-[14px] font-bold uppercase tracking-widest" style={{ color: tint }}>
            {def.name}
          </span>
          <div
            role="progressbar"
            aria-label="hero health"
            aria-valuemin={0}
            aria-valuemax={hero.hpMax}
            aria-valuenow={Math.ceil(hero.hp)}
            className="relative h-[10px] w-[16rem] border border-[#26262b] bg-[#101013]"
          >
            <span className="absolute inset-y-0 left-0" style={{ width: `${frac * 100}%`, background: tint }} />
          </div>
          <span className="w-[6.5rem] text-right text-[12px] tabular-nums text-[#EDEDEF]">
            {down ? `back in ${Math.ceil(hero.respawn)}s` : `${Math.ceil(hero.hp)} / ${hero.hpMax}`}
          </span>
          {hero.deaths > 0 && (
            <span className="text-[11px] text-[#71717C]">{hero.deaths} down</span>
          )}
        </div>
        <div className="flex gap-1.5">
          {skills.map((sk, i) => {
            const left = hero.cd[i];
            const held = i === 2 ? Math.max(hero.dashT, hero.sprintT) : i === 3 ? hero.ultT : 0;
            return (
              <Slot
                key={sk.name}
                keyLabel={HERO_SLOT_KEYS[i]}
                title={sk.name}
                sub={left > 0 ? `${left.toFixed(left < 10 ? 1 : 0)}s` : i === 0 ? `${(1 / sk.cooldown).toFixed(0)}/s` : `${sk.cooldown}s`}
                cover={down ? "rgba(8,9,12,0.7)" : wedge(left, sk.cooldown)}
                active={held > 0}
                tint={tint}
              >
                <span className="font-display text-[20px] font-bold" style={{ color: tint }}>
                  {["I", "II", "III", "IV"][i]}
                </span>
              </Slot>
            );
          })}
          <span aria-hidden="true" className="mx-1 w-px self-stretch bg-[#26262b]" />
          {def.towers.map((kind, i) => {
            const price = hero.prices[i];
            const gate = hero.gates[i];
            const shut = gate.left > 0;
            const poor = scrap !== null && scrap < price;
            return (
              <Slot
                key={kind}
                keyLabel={String(i + 1)}
                title={TOWERS[kind].name}
                sub={shut ? `${Math.ceil(gate.left)}s` : String(price)}
                cover={shut ? wedge(gate.left, gate.of) : undefined}
                poor={!shut && poor}
                tint={tint}
              >
                <img src={icons[kind] ?? TOWER_ICONS[kind]} alt="" className="h-[34px] w-[34px] object-contain" draggable={false} />
              </Slot>
            );
          })}
        </div>
      </div>
    </div>
  );
}
