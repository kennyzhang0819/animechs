// the icon table lives on the game side (game/towerIcons.ts) so the map
// model can read it; the components keep importing it from here
export { TOWER_ICONS } from "@/game/towerIcons";

import { useEffect, useState } from "react";

import { towerIcon } from "@/game/atlas";
import { TOWER_ICONS as ICON_PATHS } from "@/game/towerIcons";
import type { TowerKind } from "@/game/types";

const CACHE = new Map<TowerKind, string>();
const CARVING = new Map<TowerKind, Promise<void>>();

/**
 * THE PICTURE OF ONE TURRET KIND, for a panel that is not handed the
 * bar's icons (the progress screen): the Foundry head as the sheet
 * draws it (atlas.ts towerIcon), cached for the life of the page, and
 * the stock sprite's path until the first carve lands — the same
 * fallback the card and the inspector use.
 */
export function useTowerIcon(kind: TowerKind): string {
  const [url, setUrl] = useState<string>(() => CACHE.get(kind) ?? ICON_PATHS[kind]);
  useEffect(() => {
    const have = CACHE.get(kind);
    setUrl(have ?? ICON_PATHS[kind]);
    if (have) return;
    let job = CARVING.get(kind);
    if (!job) {
      job = towerIcon(kind)
        .then((u) => {
          CACHE.set(kind, u);
        })
        .catch(() => {
          // the path fallback covers it
        });
      CARVING.set(kind, job);
    }
    let alive = true;
    void job.then(() => {
      if (alive) setUrl(CACHE.get(kind) ?? ICON_PATHS[kind]);
    });
    return () => {
      alive = false;
    };
  }, [kind]);
  return url;
}
