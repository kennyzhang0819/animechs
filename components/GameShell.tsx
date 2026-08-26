"use client";

import { useEffect, useState } from "react";
import type { LevelSpec } from "@/game/levels";
import {
  buyNode,
  loadProgress,
  resetProgress,
  techOf,
  type Progress,
} from "@/game/progress";
import LevelSelect from "./LevelSelect";
import Swarmfield from "./Swarmfield";
import TechTree from "./TechTree";

type Screen = { t: "menu" } | { t: "tech" } | { t: "play"; level: LevelSpec };

/**
 * The campaign's screen switch: level select (the default), the tech tree,
 * and a run on the field. The save lives in localStorage, so it loads in an
 * effect — the server render carries no progress and the first client frame
 * fills it in, avoiding a hydration mismatch.
 */
export default function GameShell() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [screen, setScreen] = useState<Screen>({ t: "menu" });

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  if (!progress) return <div className="fixed inset-0 bg-[#070B14]" />;

  if (screen.t === "play") {
    return (
      <Swarmfield
        key={screen.level.id}
        level={screen.level}
        tech={techOf(progress)}
        onExit={() => {
          // the run already settled its payout straight into the save;
          // re-read it so the menus show the banked scrap and new unlocks
          setProgress(loadProgress());
          setScreen({ t: "menu" });
        }}
      />
    );
  }

  if (screen.t === "tech") {
    return (
      <TechTree
        progress={progress}
        onBuy={(id) => {
          const p = buyNode(id);
          if (p) setProgress(p);
        }}
        onBack={() => setScreen({ t: "menu" })}
      />
    );
  }

  return (
    <LevelSelect
      progress={progress}
      onPlay={(level) => setScreen({ t: "play", level })}
      onTech={() => setScreen({ t: "tech" })}
      onReset={() => {
        resetProgress();
        setProgress(loadProgress());
      }}
    />
  );
}
