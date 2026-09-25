// Rolls a board off the page's thread for the menu's ground (MenuBackground):
// a roll is about a second, which the page cannot spend while a menu is up.
import { generateRandomMap } from "./mapgen";
import type { MapData } from "./maps";

export type MapgenRequest = { seed: number };
export type MapgenReply = { seed: number; doc: MapData };

const own = self as unknown as {
  postMessage(m: MapgenReply): void;
  addEventListener(t: "message", h: (e: { data: MapgenRequest }) => void): void;
};

own.addEventListener("message", (e) => {
  const gen = generateRandomMap(e.data.seed);
  own.postMessage({ seed: gen.seed, doc: gen.doc });
});
