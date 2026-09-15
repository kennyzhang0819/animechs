/**
 * THE STATUS CATALOG — everything that can be happening to a body or a
 * building right now, as one list with one symbol apiece.
 *
 * IT EXISTS BECAUSE THE STATE WAS ALREADY THERE AND NOWHERE TO BE READ.
 * A unit soaked by a douser drives at 45% and the only sign of it was a
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

import { CELL, firesBullets, WET_SHOCK_MUL } from "./constants";
import { UNIT_KINDS, UNIT_STATS, type UnitKind } from "./levels";
import { AMPHIBIOUS_MAX_STACKS, HUNGRY_MAX_MEALS, LEADERSHIP_CAP, VIRUS_DPS } from "./mutation";
import { PAL } from "./pixelArt";
import type { Sim } from "./sim";
// the field row reads the picture's view of the bodies and not the sim: it is
// drawn on the side that may not have one (simview.ts)
import type { UnitsView } from "./simview";
import { isCore, type Structure, type Tower } from "./types";

export type StatusId =
  | "armor"
  // the four TURRET TRAITS — properties of the gun, not events on it (see
  // STATUSES). They sit here, immediately behind plating, because that is
  // where they are read: plating is what a building can take and these are
  // what it can DO, and a player clicking a turret is asking both at once
  | "nonbullet"
  | "ignites"
  | "soaks"
  | "electric"
  // ...and the BODY TRAITS, on the same terms: what a unit can DO, as
  // against what is being done to it. Same place in the row for the same
  // reason — a player clicking a body is asking what it is
  | "bubble"
  | "shields"
  | "heals"
  | "plates"
  | "hastens"
  | "jams"
  | "spots"
  | "drills"
  | "ages"
  | "blinks"
  | "vanishes"
  | "charges"
  | "bomb"
  | "immune"
  | "wet"
  | "burning"
  | "shield"
  | "arriving"
  | "hungry"
  | "waded"
  | "veteran"
  | "cloaked"
  | "led"
  | "virus"
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
  // ---- THE TURRET TRAITS ----------------------------------------------
  //
  // Four chips that are TRUE OF THE GUN rather than happening to it, on
  // plating's terms exactly (see the note at the top of this file): a
  // property, always there, never stamped on the field. A turret's row
  // therefore opens "what it is made of, what its shot is, what its shot
  // lays" and only then gets to what is being done to it.
  {
    id: "nonbullet",
    name: "Non-bullet",
    color: PAL.sparkLite,
    blurb:
      "Its shot is fire, a bolt, a beam or a rail — not a round. A cloaked hull stops rounds and nothing else, so this keeps aiming at one that has gone dark, and keeps hurting it.",
    field: false,
  },
  {
    id: "ignites",
    name: "Ignites",
    color: PAL.ember,
    blurb: "What it hits catches fire — health straight off the pool, plating ignored.",
    field: false,
  },
  {
    id: "soaks",
    name: "Soaks",
    color: PAL.waterLite,
    blurb:
      "What it hits comes away wet and slowed — and a wet body takes double from an electric shot, so this is half of a pair.",
    field: false,
  },
  {
    id: "electric",
    name: "Electric",
    color: PAL.spark,
    blurb:
      "Its shot conducts. Against a SOAKED body it is worth double, and against a dry one it is worth nothing extra. Put one of these behind a douser.",
    field: false,
  },
  // ---- THE BODY TRAITS --------------------------------------------------
  //
  // WHAT A UNIT CAN DO, and until now none of it was anywhere on the
  // screen. A player could watch a tusker4's bubble eat a volley, or a
  // skate3 make the fleet around it outrange the board, or a livewire
  // step out from under a beam, and have no way at all to find out WHY —
  // the sim knew, the panel did not, and the only place any of it was
  // written down was a source comment. These say it.
  //
  // THE NOTES CARRY THE NUMBERS (see unitTraits), because "it shields the
  // crowd" is trivia and "150 of shield to everything within seven tiles"
  // is a decision about where to put the next turret.
  //
  // THEY ARE PROPERTIES, so like plating they never go on the field. What
  // the overlay stamps is the live half — the bubble that is up right now
  // is `shield`, the cloak that is dark right now is `cloaked` — and the
  // two answer different questions. A trait that is down still shows,
  // which is the point: a broken bubble is coming back.
  {
    id: "bubble",
    name: "Force field",
    color: PAL.field,
    blurb:
      "It carries a bubble that eats shots at its outline before they reach the hull — and the bubble comes back a few seconds after it breaks. Break it and kill the body inside the window, or the window closes.",
    field: false,
  },
  {
    id: "shields",
    name: "Shield field",
    color: PAL.fieldLite,
    blurb:
      "It hands an absorbing bar to every body around it, on a pulse. The crowd is tougher than it looks for as long as this one is alive: kill the carrier and the bar stops being renewed.",
    field: false,
  },
  {
    id: "heals",
    name: "Repair field",
    color: PAL.heal,
    blurb:
      "It mends the bodies around it, itself included, on a pulse. A line that cannot out-damage the mend is a line that never gets anywhere — kill this one first.",
    field: false,
  },
  {
    id: "plates",
    name: "Plating field",
    color: PAL.steelLite,
    blurb:
      "It stamps extra plating onto every body around it. Plating is a flat shave off each hit, so this hurts volume far more than it hurts calibre — answer it with the big guns, or kill the carrier.",
    field: false,
  },
  {
    id: "hastens",
    name: "Haste field",
    color: PAL.flame,
    blurb:
      "It drives the bodies around it faster. Less time in your kill zone for the whole crowd, not just for itself.",
    field: false,
  },
  {
    id: "jams",
    name: "Jam field",
    color: PAL.bomber,
    blurb: "Guns underneath it reload slower for as long as it is overhead.",
    field: false,
  },
  {
    id: "spots",
    name: "Spotter",
    color: PAL.harpoon,
    blurb:
      "Every weapon around it reaches further. A fleet already firing from outside your board's reach fires from further still while this one lives — it is the hull to kill, and you may have to build to reach it.",
    field: false,
  },
  {
    id: "drills",
    name: "Drill",
    color: PAL.harpoonDark,
    blurb:
      "The bodies around it grow their veterancy faster — they get to hitting hard sooner. Only a body that ages at all takes anything from it.",
    field: false,
  },
  {
    id: "ages",
    // NOT "Veteran": that is the LIVE chip two rows down, the one that
    // prints how far up this body has already climbed. This is the
    // ability — that it climbs at all — and two chips with one name is
    // one chip as far as a player is concerned
    name: "Grows",
    color: PAL.harpoon,
    blurb:
      "THE LONGER IT LIVES THE HARDER IT HITS — every weapon on it climbs with its age, to a ceiling. There is no answer to an old one; the answer is reaching out and killing it young.",
    field: false,
  },
  {
    id: "blinks",
    name: "Blink",
    color: PAL.wraith,
    blurb:
      "A hit that lands throws it FORWARD along its route, past the gun that landed it, on a cooldown. A line that opens fire on it is a line it is suddenly behind — answer it with bursts and with fields that catch a body wherever it lands.",
    field: false,
  },
  {
    id: "vanishes",
    name: "Cloak",
    color: PAL.wraith,
    blurb:
      "It goes dark on a cycle. No round can find it while it is gone — but fire, bolts, beams, rays and rails go straight through a cloak, so a non-bullet turret keeps working on it.",
    field: false,
  },
  {
    id: "charges",
    name: "Charge",
    color: PAL.tusk,
    blurb:
      "IT LEAVES THE ROUTE. With a structure in sight it drops the flow field and walks straight at it, so mazing it past your line does not work — it was never going to the core. Every answer is on the approach.",
    field: false,
  },
  {
    id: "bomb",
    name: "Payload",
    color: PAL.bomber,
    blurb:
      "It carries no gun: the BODY is the bomb. It dives at the nearest structure and goes off on contact — and goes off the same way wherever it is shot down, so an AA line standing over your guns detonates these on top of them. Kill them over nothing.",
    field: false,
  },
  {
    id: "immune",
    name: "Immune",
    color: PAL.steel,
    blurb:
      "A status simply never takes on it. Not a resistance — it is never applied at all, so the turret that lays it is doing nothing but its contact damage here.",
    field: false,
  },
  // ---- and back to the things that HAPPEN -----------------------------
  {
    id: "wet",
    name: "Soaked",
    color: PAL.waterLite,
    blurb:
      "Water, off a douser or a deluge. It drives slower for as long as this lasts, a fresh soak re-times it rather than stacking, and while it is wet an ELECTRIC shot on it is worth double. That is the whole of the pairing: the water is on the body, the electricity is on the gun.",
    field: true,
  },
  {
    id: "burning",
    name: "Burning",
    color: PAL.ember,
    blurb:
      "Alight, off a torch. Fire takes health straight off the pool and ignores plating entirely.",
    field: true,
  },
  {
    id: "shield",
    name: "Shielded",
    color: PAL.field,
    blurb:
      "An absorbing pool standing in front of health — its own bubble, or a bar handed to it by a carrier's shield field. Nothing reaches the body until it is gone.",
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
      "Gone dark. No ROUND can find it until it shows again — but fire, bolts, beams, rays and rails go straight through a cloak, so a non-bullet turret still aims at it and still hurts it. The count is the seconds it has left.",
    field: true,
  },
  {
    id: "led",
    name: "Led",
    color: PAL.steelWhite,
    blurb:
      "A tier five is standing near it, and nothing can take more than a scratch off it in one hit. Kill the big one and the order is gone.",
    field: true,
  },
  {
    id: "virus",
    name: "Mech virus",
    color: PAL.venom,
    blurb:
      "A machine plague. On a body it is waiting for the thing to die; in a turret it is eating a share of the pool every second, and when the turret goes it jumps to the nearest one left.",
    field: true,
  },
  {
    id: "rot",
    name: "Rot",
    color: PAL.venom,
    blurb:
      "Venom. It takes raw health a second and ignores plating; the more spitters on one building, the faster it rots.",
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

/** a plain LENGTH of time — a cooldown, a pulse, a cycle. `secs` above is
 *  a countdown on a live clock and says "left"; a trait's numbers are not
 *  ticking down, so they must not borrow its wording */
const dur = (v: number): string => num(v) + "s";

// ---------- bodies ----------

/**
 * IS ANYTHING HAPPENING TO BODY `i`? The field's gate, and the reason the
 * overlay can afford this at all: six typed-array reads and no
 * allocation, asked of every body every frame, answering no for nearly
 * all of them. Only the ones that say yes pay for a row.
 */
export function unitHasFieldStatus(sim: UnitsView, i: number): boolean {
  return (
    sim.uwet[i] > 0 ||
    sim.uburn[i] > 0 ||
    sim.ushield[i] > 0 ||
    sim.uspawn[i] > 0 ||
    sim.uhungry[i] !== 0 ||
    sim.uwade[i] !== 0 ||
    sim.uvet[i] >= 1.1 ||
    sim.ucloakT[i] > 0 ||
    sim.uled[i] > 0 ||
    sim.uvirus[i] !== 0
  );
}

/** body `i`'s field symbols, catalog order, into a reused array — returns
 *  how many were written */
export function unitFieldStatuses(sim: UnitsView, i: number, out: StatusId[]): number {
  out.length = 0;
  if (sim.uwet[i] > 0) out.push("wet");
  if (sim.uburn[i] > 0) out.push("burning");
  if (sim.ushield[i] > 0) out.push("shield");
  if (sim.uspawn[i] > 0) out.push("arriving");
  if (sim.uhungry[i] !== 0) out.push("hungry");
  if (sim.uwade[i] !== 0) out.push("waded");
  if (sim.uvet[i] >= 1.1) out.push("veteran");
  if (sim.ucloakT[i] > 0) out.push("cloaked");
  if (sim.uled[i] > 0) out.push("led");
  if (sim.uvirus[i] !== 0) out.push("virus");
  return out.length;
}

/** a field's radius as the player reads the board: whole-ish tiles */
const tiles = (px: number): string => `${(Math.round((px / CELL) * 10) / 10).toFixed(1)}t`;

/** a per-pulse amount as a rate, which is how a player weighs it against a gun */
const perSec = (amount: number, reload: number): string =>
  `${num(amount / Math.max(reload, 0.0001))} a second`;

/**
 * WHAT THIS BODY CAN DO — the ability chips, behind plating, on exactly
 * the terms the turret traits sit behind it (see turretTraits).
 *
 * NONE OF THIS WAS ANYWHERE ON THE SCREEN. A player could watch a
 * tusker4's bubble eat a volley, or a skate3 make the fleet around it
 * outrange the board, or a livewire step out from under a beam the
 * instant it landed, and have no way to find out why: the sim knew, and
 * the only place it was written down was a source comment. A mechanic the
 * player cannot see is a mechanic they cannot play against.
 *
 * THE NOTES CARRY THE NUMBERS, because the number is the decision. "It
 * shields the crowd" is trivia; "150 of shield to everything within seven
 * tiles, every three seconds" is where the next turret goes.
 *
 * READ OFF THE KIND, not off the body: these are what the thing IS, and a
 * clock that has run down does not make it something else. That is the
 * split with the live chips below — the bubble that is up RIGHT NOW is
 * `shield` and carries what is left in it, the cloak that is dark RIGHT
 * NOW is `cloaked` and carries its seconds. A trait that is spent still
 * shows, which is the whole point of showing it: a broken bubble is a
 * bubble that is coming back.
 */
function unitTraits(kind: UnitKind): StatusChip[] {
  const u = UNIT_STATS[kind];
  const out: StatusChip[] = [];
  const add = (id: StatusId, note: string): void => void out.push({ id, n: null, note });
  if (u.forceField)
    add(
      "bubble",
      `${num(u.forceField.max)} absorbed at ${tiles(u.forceField.radius)} — back ${dur(u.forceField.cooldown)} after it breaks`,
    );
  if (u.shieldField)
    add(
      "shields",
      `${num(u.shieldField.amount)} shield every ${dur(u.shieldField.reload)} to everything within ${tiles(u.shieldField.range)}, up to ${num(u.shieldField.max)}`,
    );
  if (u.repairField)
    add(
      "heals",
      `${perSec(u.repairField.amount, u.repairField.reload)} to everything within ${tiles(u.repairField.range)}`,
    );
  else if (u.energyField)
    add(
      "heals",
      `${u.energyField.healPercent}% of max health every ${dur(u.energyField.reload)} to ${u.energyField.maxTargets} within ${tiles(u.energyField.range)}`,
    );
  if (u.armorField)
    add(
      "plates",
      `+${num(u.armorField.amount)} plating to everything within ${tiles(u.armorField.range)}`,
    );
  if (u.hasteField)
    add(
      "hastens",
      `x${u.hasteField.mult} pace to everything within ${tiles(u.hasteField.range)}`,
    );
  if (u.jamField)
    add(
      "jams",
      `guns within ${tiles(u.jamField.range)} reload at ${Math.round(u.jamField.rate * 100)}%`,
    );
  if (u.spotterField)
    add(
      "spots",
      `everything within ${tiles(u.spotterField.range)} reaches x${u.spotterField.mult} further`,
    );
  if (u.drillField)
    add(
      "drills",
      `veterancy runs x${u.drillField.mult} faster within ${tiles(u.drillField.range)}`,
    );
  if (u.veteran)
    add("ages", `hits up to x${(1 + u.veteran.max).toFixed(1)} the longer it stays alive`);
  if (u.blink)
    add("blinks", `a hit throws it ${tiles(u.blink.dist)} forward, at most every ${dur(u.blink.cooldown)}`);
  if (u.cloak)
    add(
      "vanishes",
      `${dur(u.cloak.duration)} dark in every ${dur(u.cloak.period)}` +
        (u.cloak.veil ? ` — and takes everything within ${tiles(u.cloak.veil)} with it` : ""),
    );
  if (u.charge) add("charges", `leaves the route for any structure within ${tiles(u.charge.range)}`);
  if (u.payload)
    add(
      "bomb",
      `${num(u.payload.splash)} over ${tiles(u.payload.radius)} where it dies, however it dies`,
    );
  if (u.immunities && u.immunities.length > 0)
    add("immune", `${u.immunities.map((k) => (k === "burning" ? "fire" : "water")).join(" and ")} never takes on it`);
  return out;
}

/** the whole row for the inspector: plating, then what the body CAN do,
 *  then what is being done to it — built once a HUD poll, for one body */
export function unitStatusChips(sim: Sim, i: number): StatusChip[] {
  const armor = sim.uarmor[i];
  const out: StatusChip[] = [
    { id: "armor", n: Math.round(armor), note: num(armor) + " off every hit" },
    ...unitTraits(UNIT_KINDS[sim.ukind[i]]),
  ];
  if (sim.uwet[i] > 0)
    out.push({
      id: "wet",
      n: null,
      // the slow is what a soak DOES and the conducting is what it SETS
      // UP, so the note carries both and the clock follows. THE ELECTRIC
      // HALF LIVES HERE AND NOWHERE ELSE: being wet is the whole of what
      // the swarm carries, and a soaked body takes the multiple from the
      // first electric shot that lands on it
      note: `drives at ${Math.round(sim.uwetSlow[i] * 100)}% — takes x${WET_SHOCK_MUL} from electric shots — ${secs(sim.uwet[i])}`,
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
  // NOT "untouchable" ANY MORE, and the note is the only place a player
  // would ever have been told so: a cloak stops ROUNDS, and the seven
  // non-bullet turrets go straight through it (constants.ts
  // NON_BULLET_KINDS, Sim.damageUnit)
  if (sim.ucloakT[i] > 0)
    out.push({
      id: "cloaked",
      n: Math.ceil(sim.ucloakT[i]),
      note: `rounds miss it — ${secs(sim.ucloakT[i])}`,
    });
  if (sim.uled[i] > 0)
    out.push({ id: "led", n: null, note: `at most ${LEADERSHIP_CAP} off any one hit` });
  if (sim.uvirus[i] !== 0)
    out.push({ id: "virus", n: null, note: "it infects a turret when it dies" });
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
/**
 * THE TEN SYMBOLS A BUILDING CAN WEAR, in the order they are drawn.
 *
 * The order is the wire format as well as the catalogue: a building's row
 * crosses to the drawing side as one bitmask over this list (see
 * structStatusMask), which is ten clocks' worth of answer in one number —
 * and keeps the RULE about what counts as a status on the side that owns
 * the clocks, rather than copying nine of them across to be re-judged.
 */
export const STRUCT_FIELD_STATUSES: readonly StatusId[] = [
  "virus",
  "rot",
  "short",
  "jam",
  "boost",
  "regen",
  "revive",
  "soaked",
  "conquered",
];

/** which of them this building is wearing, as a bitmask over the list above */
export function structStatusMask(s: Structure): number {
  if (isCore(s)) return 0;
  return (
    (s.virus ? 1 : 0) |
    (s.poison > 0 ? 2 : 0) |
    (s.shortT > 0 ? 4 : 0) |
    (s.jamT > 0 ? 8 : 0) |
    (s.boostT > 0 ? 16 : 0) |
    (s.regen > 0 ? 32 : 0) |
    (s.revives > 0 ? 64 : 0) |
    (s.fireRate < 1 ? 128 : 0) |
    (s.team === "enemy" ? 256 : 0)
  );
}

/** ...and back out of one, catalog order, into a reused array */
export function statusesFromMask(mask: number, out: StatusId[]): number {
  out.length = 0;
  for (let i = 0; i < STRUCT_FIELD_STATUSES.length; i++)
    if (mask & (1 << i)) out.push(STRUCT_FIELD_STATUSES[i]);
  return out.length;
}

export function structHasFieldStatus(s: Structure): boolean {
  return structStatusMask(s) !== 0;
}

/** this building's field symbols, catalog order, into a reused array */
export function structFieldStatuses(s: Structure, out: StatusId[]): number {
  return statusesFromMask(structStatusMask(s), out);
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
/**
 * WHAT A GUN IS AND WHAT ITS SHOT LAYS — the four chips that sit behind
 * plating in a turret's row (STATUSES, the turret traits).
 *
 * THEY ARE PROPERTIES, NOT EVENTS, which is plating's own exception and
 * the reason they live beside it: a player clicking a turret is asking
 * "what is this thing" at least as much as "what is happening to it", and
 * three of the four answers were previously nowhere on the screen at all.
 * A player could not tell that a torch reaches a cloaked hull and a tacker
 * does not, or that a douser and a coil are worth more together than
 * apart, without being told outside the game.
 *
 * READ OFF THE LIVE SPEC, exactly as plating is — so a turret whose
 * upgrades have given it an incendiary round (upgrades.ts) starts saying
 * it IGNITES the moment that is bought, and stops if the run never buys
 * it. The one exception is NON-BULLET, which is read off the kind: what a
 * turret's shot fundamentally is belongs to the roster
 * (constants.ts NON_BULLET_KINDS) and is not something an upgrade may move.
 *
 * A MIXED BAG KEEPS ONLY WHAT THEY ALL SHARE. Plating's rule for a
 * selection is "one number or nothing"; a trait's is "every one of these
 * does it", which for the single turret this panel usually holds is the
 * same rule and for a dragged box is still a true sentence about
 * everything in it. The core carries no gun and so carries no trait, and
 * one in the bag empties the row.
 */
function turretTraits(picked: readonly Structure[]): StatusChip[] {
  let n = 0;
  let nonbullet = true, ignites = true, soaks = true, electric = true;
  for (const st of picked) {
    if (isCore(st)) return [];
    const t = st as Tower;
    n++;
    if (firesBullets(t.kind)) nonbullet = false;
    if (t.spec.bullet.burn === undefined) ignites = false;
    if (t.spec.bullet.wet === undefined) soaks = false;
    if (!t.spec.bullet.electric) electric = false;
  }
  if (n === 0) return [];
  const out: StatusChip[] = [];
  if (nonbullet)
    out.push({ id: "nonbullet", n: null, note: "a cloaked hull does not stop it" });
  if (ignites) out.push({ id: "ignites", n: null, note: "what it hits catches fire" });
  if (soaks) out.push({ id: "soaks", n: null, note: "what it hits comes away wet" });
  if (electric)
    out.push({ id: "electric", n: null, note: `x${WET_SHOCK_MUL} on anything soaked` });
  return out;
}

export function structSelectionChips(picked: readonly Structure[]): StatusChip[] {
  const many = picked.length > 1;
  let armor: number | null = null;
  let armorMixed = false;
  const tally = new Map<StatusId, number>();
  // the single-pick numbers. Summed or maxed so they stay meaningful for
  // one building, which is the only case that ever reads them back
  let poison = 0, boostT = 0, regen = 0, revives = 0, rate = 1, shortT = 0, jamRate = 1;
  let virusDps = 0;
  for (const s of picked) {
    if (isCore(s)) {
      armorMixed = true; // the core wears none, so a bag holding one disagrees
      continue;
    }
    poison += s.poison;
    shortT = Math.max(shortT, s.shortT);
    if (s.jamT > 0) jamRate = Math.min(jamRate, s.jamRate);
    virusDps += s.virus ? s.hpMax * VIRUS_DPS : 0;
    boostT = Math.max(boostT, s.boostT);
    regen += s.regen;
    revives += s.revives;
    rate = Math.min(rate, s.fireRate);
    // the LIVE spec's plating, this turret's attributes folded in — a
    // Bulwarked tacker beside a plain one is two answers, and two answers is
    // no answer
    if (armor === null) armor = s.spec.armor;
    else if (armor !== s.spec.armor) armorMixed = true;
    const bump = (id: StatusId): void => void tally.set(id, (tally.get(id) ?? 0) + 1);
    if (s.virus) bump("virus");
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
  out.push(...turretTraits(picked));
  const on = (id: StatusId, n: number | null, note: string): void => {
    const held = tally.get(id);
    if (held === undefined) return;
    out.push({
      id,
      n: many ? held : n,
      note: many ? `on ${held} of the ${picked.length} selected` : note,
    });
  };
  on(
    "virus",
    null,
    `${num(virusDps)} health a second — it jumps when this goes`,
  );
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
