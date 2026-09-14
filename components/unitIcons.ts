"use client";

import { useEffect, useState } from "react";

import { unitIcon } from "@/game/atlas";
import { unitAccent, type UnitKind } from "@/game/levels";

/**
 * A BODY'S PORTRAIT, WHEREVER THE DOM WANTS ONE — and the reason it is a
 * module rather than an `<img>` pointed at a file under
 * public/mindustry is that the file under that path is no longer the unit.
 *
 * Four families draw as ANIMALS now (game/animalArt.ts, behind
 * game/animalFlag.ts): the ground line is a herd of rhinos, the venom
 * line a nest of spiders, and neither of them has a sprite file anywhere
 * — the art is generated at load and packed over the stock cells. Every
 * panel that loaded the raw PNG was showing upstream's mech next to a
 * board full of rhinos, so every panel asks for the packed cell instead
 * (atlas.ts `unitIcon`): outlined, antialiased, and wearing its family's
 * accent on its team cell, exactly as the body on the field does.
 *
 * It is CARVED LAZILY AND CACHED FOREVER. The sheet has to be built and a
 * cell composited per body, which is too much to do on every render and
 * far too much to do for all thirty-one at boot when a panel wants one.
 * So the first ask for a kind starts the carve, every later ask shares
 * that promise, and the answer is kept for the life of the page — the
 * atlas it came off is memoised the same way and never changes.
 *
 * THERE IS NO SPRITE-FILE FALLBACK, and there cannot be one: a kind is
 * `ironhide1` now, and nothing under public/mindustry is called that.
 * Building a path out of the kind is what the panels used to do, and
 * after the rename every one of those was a 404. A carve that has not
 * landed yet — or that failed, which only happens if the sheet itself
 * failed to build — draws BLANK, so a slot holds its size and the
 * portrait appears when it is ready.
 */

/** a transparent 1x1: the placeholder under a portrait still being carved.
 *  Inline, so it costs no request and cannot 404 */
export const BLANK_ICON =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const CACHE = new Map<UnitKind, string>();
const CARVING = new Map<UnitKind, Promise<void>>();

/** the portrait if it has already been carved, else null */
export const unitIconOf = (kind: UnitKind): string | null => CACHE.get(kind) ?? null;

/** carve it if nobody has yet; resolves when the cache has it (or has failed) */
export function carveUnitIcon(kind: UnitKind): Promise<void> {
  let job = CARVING.get(kind);
  if (!job) {
    job = unitIcon(kind, unitAccent(kind))
      .then((url) => {
        CACHE.set(kind, url);
      })
      .catch(() => {
        // the caller's fallback covers it
      });
    CARVING.set(kind, job);
  }
  return job;
}

/**
 * The portrait for one body, as a data URL — null on the first render and
 * on every render until the carve lands, so draw the fallback until it is
 * there rather than an empty box.
 */
export function useUnitIcon(kind: UnitKind | null): string | null {
  const [url, setUrl] = useState<string | null>(kind ? unitIconOf(kind) : null);
  useEffect(() => {
    if (!kind) {
      setUrl(null);
      return;
    }
    // synchronously if it is already carved, so a panel that has shown
    // this body before never flashes the fallback
    const have = unitIconOf(kind);
    setUrl(have);
    if (have) return;
    let alive = true;
    void carveUnitIcon(kind).then(() => {
      if (alive) setUrl(unitIconOf(kind));
    });
    return () => {
      alive = false;
    };
  }, [kind]);
  return url;
}

/**
 * The portraits for a whole roster at once — the level editor's rows, which
 * want all thirty-one and want them to arrive together rather than as a
 * row of pop-ins. One re-render when the last of them lands.
 */
export function useUnitIcons(kinds: readonly UnitKind[]): (kind: UnitKind) => string | null {
  const [, carved] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.all(kinds.map(carveUnitIcon)).then(() => {
      if (alive) carved((n) => n + 1);
    });
    return () => {
      alive = false;
    };
    // the roster is a module constant at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return unitIconOf;
}
