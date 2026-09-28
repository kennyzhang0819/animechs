/** The one palette every colour setting picks from. A saved colour is one of these hexes. */
export const PALETTE = [
  { hex: "#e8e4d8", name: "Bone" },
  { hex: "#a9adb5", name: "Silver" },
  { hex: "#4a4d55", name: "Slate" },
  { hex: "#0d0d10", name: "Black" },
  { hex: "#ffd37f", name: "Gold" },
  { hex: "#a86f16", name: "Bronze" },
  { hex: "#f3e979", name: "Surge" },
  { hex: "#ff9b4a", name: "Amber" },
  { hex: "#e55454", name: "Red" },
  { hex: "#8f1f2b", name: "Crimson" },
  { hex: "#ff8fd0", name: "Pink" },
  { hex: "#a97dff", name: "Violet" },
  { hex: "#6a9bff", name: "Blue" },
  { hex: "#7fe0f0", name: "Cyan" },
  { hex: "#7be58a", name: "Green" },
  { hex: "#2f7a44", name: "Forest" },
] as const;

export type PaletteHex = (typeof PALETTE)[number]["hex"];

export function isPaletteHex(v: unknown): v is PaletteHex {
  return typeof v === "string" && PALETTE.some((c) => c.hex === v);
}
