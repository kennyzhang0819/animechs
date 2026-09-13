"use client";

import { useEffect, useState } from "react";

import { unitIcon } from "@/game/atlas";
import { unitAccent, type UnitKind } from "@/game/levels";

/**
 * A BODY'S PORTRAIT, WHEREVER THE DOM WANTS ONE — and the reason it is a
 * module rather than an `<img src="/mindustry/sprites/units/dagger.png">`
 * is that the file under that path is no longer the unit.
 *
 * Four families draw as ANIMALS now (game/animalArt.ts, behind
 * game/animalFlag.ts): the ground line is a herd of rhinos, the venom
 * line a nest of spiders, and neither of them has a sprite file anywhere
 * — the art is generated at load and packed over the stock cells. Every
 * panel that loaded the raw PNG was showing Mindustry's dagger next to a
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
 * A carve that fails leaves the cache empty and the hook returns null,
 * which every caller draws as the stock sprite file. That fallback is
 * wrong art for the animal families, but it is a picture rather than a
 * hole, and it only happens when the sheet itself failed to build.
 */
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
