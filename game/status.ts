/**
 * THE STATUS CATALOG — everything that can be happening to a body or a
 * building right now, as one list with one symbol apiece.
 *
 * IT EXISTS BECAUSE THE STATE WAS ALREADY THERE AND NOWHERE TO BE READ.
 * A unit soaked by a wave drives at 45% and the only sign of it was a
 * blue tint; a turret under venom fire loses health every second with
 * nothing on the screen saying why; a body still inside its arrival
 * window eats shots and takes none of them. Each of those is a number in
 * an array in sim.ts, and a player who cannot see it is playing a
 * different game from the one being simulated.
 *
 * ONE CATALOG, TWO SURFACES. The inspector at the bottom of the screen
 * prints the whole row — symbol, count, and a hover card that says what
 * the thing does — and the FIELD stamps the same symbols over the body
 * they belong to (game.ts drawStatusRow), off the same drawings
 * (statusArt.ts). A player learns a symbol once.
 *
 * ORDER IS THE ORDER OF THIS FILE, everywhere, so the row over a body and
 * the row in the panel never disagree about which chip is which. ARMOUR
 * IS FIRST because it is the one that is always there.
 *
 * WHAT IS A STATUS AND WHAT IS A STAT. A status is something that is TRUE
 * OF THIS BODY RIGHT NOW and could stop being true — the soak, the fire,
 * the shield, the rot. Plating is the exception, and it is deliberate: it
 * is the number every incoming hit is measured against, it is what a
 * player is really asking when they click a body, and it belongs at the
 * front of the row rather than in a caption. Speed, health and range are
 * NOT statuses; they are the thing itself.
 */

import { AMPHIBIOUS_MAX_STACKS, HUNGRY_MAX_MEALS } from "./mutation";
import { PAL } from "./pixelArt";
import type { Sim } from "./sim";
import { isCore, type Structure, type Tower } from "./types";

export type StatusId =
  | "armor"
  | "wet"
  | "burning"
  | "shield"
  | "arriving"
  | "hungry"
  | "waded"
  | "veteran"
  | "cloaked"
  | "rot"
  | "short"
  | "jam"
  | "boost"
  | "regen"
  | "revive"
  | "soaked"
  | "conquered";

export interface StatusDef {
  id: StatusId;
  /** what it is called, on the chip's hover card */
  name: string;
  /** the ink the chip is framed and numbered in — the colour of the THING
   *  (water blue, ember, venom purple), never a rarity band */
  color: string;
  /** what it does, in the player's words */
  blurb: string;
  /**
   * DOES IT GO OVER THE BODY ON THE FIELD? Everything does except
   * PLATING, and that is the whole of the exception.
   *
   * A plate is a property rather than an event: every body on the map has
   * one, so drawing it would put a symbol over all eight hundred of them
   * at once — a field of identical chips that says nothing, on top of
   * being the most expensive thing on the overlay. The panel is where
   * "what is this made of" is asked, and the panel still leads with it.
   */
  field: boolean;
}

/**
 * ONE ENTRY PER STATUS, and the order every row is drawn in. Each has a
 * drawing under the same id in statusArt.ts, which checks itself against
 * this list on load — a status added here without a picture is an error
 * on the first page load rather than a blank square on the field.
 */
export const STATUSES: readonly StatusDef[] = [
  {
    id: "armor",
    name: "Plating",
    color: PAL.steelLite,
    blurb:
      "Every hit is shaved by this much first, down to a tenth of the hit at most — small arms bounce, the heavies still bite.",
    field: false,
  },
  {
    id: "wet",
    name: "Soaked",
    color: PAL.waterLite,
    blurb:
      "Water, off a wave or a tsunami. It drives slower for as long as this lasts, and a fresh soak re-times it rather than stacking.",
    field: true,
  },
  {
    id: "burning",
    name: "Burning",
    color: PAL.ember,
    blurb:
      "Alight, off a scorch. Fire takes health straight off the pool and ignores plating entirely.",
    field: true,
  },
  {
    id: "shield",
    name: "Force field",
    color: PAL.field,
    blurb:
      "An absorbing bubble, eaten before health is. Nothing reaches the body until it breaks.",
    field: true,
  },
  {
    id: "arriving",
    name: "Arriving",
    color: PAL.steelWhite,
    blurb:
      "Still coming through the door. It cannot be hurt while this lasts, and for the first of it cannot move either.",
    field: true,
  },
  {
    id: "hungry",
    name: "Hungry",
    color: PAL.emberLite,
    blurb:
      "It eats its neighbours, and every meal leaves it bigger and stronger. The count is the meals it has taken.",
    field: true,
  },
  {
    id: "waded",
    name: "Amphibious",
    color: PAL.heal,
    blurb:
      "It has come up out of the water faster, tougher and healing. The count is how many times it has waded in.",
    field: true,
  },
  {
    id: "veteran",
    name: "Veteran",
    color: PAL.harpoon,
    blurb:
      "A Harpoon hull, and the longer it lives the harder it hits: every shot it fires is multiplied by this. Kill it young.",
    field: true,
  },
  {
    id: "cloaked",
    name: "Cloaked",
    color: PAL.wraith,
    blurb:
      "Gone dark. Nothing can target it and nothing can hurt it until it shows again; the count is the seconds it has left.",
    field: true,
  },
  {
    id: "rot",
    name: "Rot",
    color: PAL.venom,
    blurb:
      "Venom. It takes raw health a second and ignores plating; more spitters on one building rot it faster, up to a cap.",
    field: true,
  },
  {
    id: "short",
    name: "Shorted",
    color: PAL.wraith,
    blurb:
      "A Wraith arc put this gun out. It neither reloads nor fires nor mends while this lasts; a fresh short re-times it rather than stacking.",
    field: true,
  },
  {
    id: "jam",
    name: "Jammed",
    color: PAL.bomber,
    blurb:
      "A bomber wing is blanketing the ground under it. This gun reloads slower for as long as the flight is over it.",
    field: true,
  },
  {
    id: "boost",
    name: "Last volley",
    color: PAL.flame,
    blurb:
      "A neighbour went down and left this gun its charge — it is reloading far faster while that lasts.",
    field: true,
  },
  {
    id: "regen",
    name: "Mending",
    color: PAL.heal,
    blurb: "It repairs itself, this much health a second, for as long as it stands.",
    field: true,
  },
  {
    id: "revive",
    name: "Undying",
    color: PAL.healLite,
    blurb: "It gets to stand back up when it is wrecked. The count is the stand-ups it has left.",
    field: true,
  },
  {
    id: "soaked",
    name: "Waterlogged",
    color: PAL.water,
    blurb: "Built on the shore under the Hydrophobic rule: this gun reloads slower, and always will.",
    field: true,
  },
  {
    id: "conquered",
    name: "Taken",
    color: "#FF5A5A",
    blurb: "The swarm wrecked this turret and it rose again on their side. It shoots at you now.",
    field: true,
  },
];

const BY_ID = new Map<StatusId, StatusDef>(STATUSES.map((d) => [d.id, d]));

export const statusDef = (id: StatusId): StatusDef => BY_ID.get(id)!;

/**
 * ONE CHIP IN A ROW: which status, the number printed under its symbol
 * (null prints nothing), and the line the hover card adds under the
 * blurb — what THIS instance of it is doing, as against what the status
 * is.
 */
export interface StatusChip {
  id: StatusId;
  n: number | null;
  note: string;
}

/** one decimal, and no trailing ".0" — a status row is glanced at rather
 *  than studied, and seconds and rates both read better short */
const num = (v: number): string =>
  Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);

const secs = (v: number): string => num(v) + "s left";

// ---------- bodies ----------

/**
 * IS ANYTHING HAPPENING TO BODY `i`? The field's gate, and the reason the
 * overlay can afford this at all: six typed-array reads and no
 * allocation, asked of every body every frame, answering no for nearly
 * all of them. Only the ones that say yes pay for a row.
 */
export function unitHasFieldStatus(sim: Sim, i: number): boolean {
  return (
    sim.uwet[i] > 0 ||
    sim.uburn[i] > 0 ||
    sim.ushield[i] > 0 ||
    sim.uspawn[i] > 0 ||
    sim.uhungry[i] !== 0 ||
    sim.uwade[i] !== 0 ||
    sim.uvet[i] >= 1.1 ||
    sim.ucloakT[i] > 0
  );
}

/** body `i`'s field symbols, catalog order, into a reused array — returns
 *  how many were written */
export function unitFieldStatuses(sim: Sim, i: number, out: StatusId[]): number {
  out.length = 0;
  if (sim.uwet[i] > 0) out.push("wet");
  if (sim.uburn[i] > 0) out.push("burning");
  if (sim.ushield[i] > 0) out.push("shield");
  if (sim.uspawn[i] > 0) out.push("arriving");
  if (sim.uhungry[i] !== 0) out.push("hungry");
  if (sim.uwade[i] !== 0) out.push("waded");
  if (sim.uvet[i] >= 1.1) out.push("veteran");
  if (sim.ucloakT[i] > 0) out.push("cloaked");
  return out.length;
}

/** the whole row for the inspector: plating first, then whatever is
 *  happening — built once a HUD poll, for one body */
export function unitStatusChips(sim: Sim, i: number): StatusChip[] {
  const armor = sim.uarmor[i];
  const out: StatusChip[] = [
    { id: "armor", n: Math.round(armor), note: num(armor) + " off every hit" },
  ];
  if (sim.uwet[i] > 0)
    out.push({
      id: "wet",
      n: null,
      // the slow is the whole of what a soak DOES, so the card leads with
      // it and the clock follows
      note: `drives at ${Math.round(sim.uwetSlow[i] * 100)}% — ${secs(sim.uwet[i])}`,
    });
  if (sim.uburn[i] > 0) out.push({ id: "burning", n: null, note: secs(sim.uburn[i]) });
  if (sim.ushield[i] > 0) {
    const s = Math.ceil(sim.ushield[i]);
    out.push({ id: "shield", n: s, note: `${s} absorbed before health` });
  }
  if (sim.uspawn[i] > 0)
    out.push({ id: "arriving", n: null, note: `untouchable — ${secs(sim.uspawn[i])}` });
  if (sim.uhungry[i] !== 0)
    out.push({
      id: "hungry",
      n: sim.ueaten[i],
      note: `${sim.ueaten[i]} of ${HUNGRY_MAX_MEALS} meals taken`,
    });
  if (sim.uwade[i] !== 0)
    out.push({
      id: "waded",
      n: sim.uwade[i],
      note: `${sim.uwade[i]} of ${AMPHIBIOUS_MAX_STACKS} wades`,
    });
  // the veteran's chip prints the bonus as a percentage, since "x1.6" does
  // not fit under a seven-pixel symbol and "+60" does
  if (sim.uvet[i] >= 1.1)
    out.push({
      id: "veteran",
      n: Math.round((sim.uvet[i] - 1) * 100),
      note: `hits x${sim.uvet[i].toFixed(1)} after ${Math.round(sim.uage[i])}s alive`,
    });
  if (sim.ucloakT[i] > 0)
    out.push({ id: "cloaked", n: Math.ceil(sim.ucloakT[i]), note: `untouchable — ${secs(sim.ucloakT[i])}` });
  return out;
}

// ---------- buildings ----------

/**
 * IS ANYTHING HAPPENING TO THIS BUILDING? The same gate as a body's, for
 * the same reason — a board holds a few hundred turrets and most of them
 * are standing there doing nothing worth a symbol.
 *
 * The core answers no to all of it: it wears no attributes, rots under
 * nothing, and cannot change sides.
 */
export function structHasFieldStatus(s: Structure): boolean {
  if (isCore(s)) return false;
  const t = s;
  return (
    t.poison > 0 || t.shortT > 0 || t.jamT > 0 || t.boostT > 0 || t.regen > 0 || t.revives > 0 ||
    t.fireRate < 1 || t.team === "enemy"
  );
}

/** this building's field symbols, catalog order, into a reused array */
export function structFieldStatuses(s: Structure, out: StatusId[]): number {
  out.length = 0;
  if (isCore(s)) return 0;
  if (s.poison > 0) out.push("rot");
  if (s.shortT > 0) out.push("short");
  if (s.jamT > 0) out.push("jam");
  if (s.boostT > 0) out.push("boost");
  if (s.regen > 0) out.push("regen");
  if (s.revives > 0) out.push("revive");
  if (s.fireRate < 1) out.push("soaked");
  if (s.team === "enemy") out.push("conquered");
  return out.length;
}

/**
 * THE ROW FOR A SELECTION OF BUILDINGS, which may be three hundred of
 * them (the marquee).
 *
 * PLATING LEADS, and it is printed only when every building picked wears
 * the same — an average over a mixed bag is a lie about all of them, which
 * is exactly why the panel's old armour caption was null for one.
 * Everything else is TALLIED: over a box the chip's number is how many of
 * the selection carry the thing ("rot on 4 of them" is the question a
 * player drags a box to ask), and over a single turret it is that
 * turret's own number instead.
 */
export function structSelectionChips(picked: readonly Structure[]): StatusChip[] {
  const many = picked.length > 1;
  let armor: number | null = null;
  let armorMixed = false;
  const tally = new Map<StatusId, number>();
  // the single-pick numbers. Summed or maxed so they stay meaningful for
  // one building, which is the only case that ever reads them back
  let poison = 0, boostT = 0, regen = 0, revives = 0, rate = 1, shortT = 0, jamRate = 1;
  for (const s of picked) {
    if (isCore(s)) {
      armorMixed = true; // the core wears none, so a bag holding one disagrees
      continue;
    }
    poison += s.poison;
    shortT = Math.max(shortT, s.shortT);
    if (s.jamT > 0) jamRate = Math.min(jamRate, s.jamRate);
    boostT = Math.max(boostT, s.boostT);
    regen += s.regen;
    revives += s.revives;
    rate = Math.min(rate, s.fireRate);
    // the LIVE spec's plating, this turret's attributes folded in — a
    // Bulwarked duo beside a plain one is two answers, and two answers is
    // no answer
    if (armor === null) armor = s.spec.armor;
    else if (armor !== s.spec.armor) armorMixed = true;
    const bump = (id: StatusId): void => void tally.set(id, (tally.get(id) ?? 0) + 1);
    if (s.poison > 0) bump("rot");
    if (s.shortT > 0) bump("short");
    if (s.jamT > 0) bump("jam");
    if (s.boostT > 0) bump("boost");
    if (s.regen > 0) bump("regen");
    if (s.revives > 0) bump("revive");
    if (s.fireRate < 1) bump("soaked");
    if (s.team === "enemy") bump("conquered");
  }
  const out: StatusChip[] = [];
  if (armor !== null && !armorMixed)
    out.push({ id: "armor", n: Math.round(armor), note: num(armor) + " off every hit" });
  const on = (id: StatusId, n: number | null, note: string): void => {
    const held = tally.get(id);
    if (held === undefined) return;
    out.push({
      id,
      n: many ? held : n,
      note: many ? `on ${held} of the ${picked.length} selected` : note,
    });
  };
  on("rot", null, `${num(poison)} health a second`);
  on("short", null, secs(shortT));
  on("jam", null, `reloads at ${Math.round(jamRate * 100)}%`);
  on("boost", null, secs(boostT));
  on("regen", null, `${num(regen)} health a second`);
  on("revive", revives, `${revives} stand-up${revives === 1 ? "" : "s"} left`);
  on("soaked", null, `reloads at ${Math.round(rate * 100)}%`);
  on("conquered", null, "shooting at you");
  return out;
}
