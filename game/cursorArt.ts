// The mouse cursors, drawn as pixel grids and handed to CSS as SVG data
// URLs (app/globals.css reads --cur-*). `#` edge, `o` fill, `-` shade,
// `.` clear. At the default size they stay under 32 CSS px a side: Chrome
// hides larger cursors wherever they would overlap the browser's chrome.
import type { CursorStyle } from "./progress";

const ARROW = [
  "#........",
  "##.......",
  "#o#......",
  "#oo#.....",
  "#ooo#....",
  "#oooo#...",
  "#ooooo#..",
  "#oooooo#.",
  "#ooooooo#",
  "#oo-#####",
  "#o#o-#...",
  "##.#o-#..",
  "#..#o-#..",
  "....#o-#.",
  ".....##..",
];

const HAND = [
  "....##.......",
  "...#oo#......",
  "...#oo#......",
  "...#oo#......",
  "...#oo###....",
  "...#oo#oo###.",
  "...#oo#oo#oo#",
  "##.#oo#oo#oo#",
  "#o##ooooooo-#",
  "#oooooooooo-#",
  "#oooooooooo-#",
  "#oooooooooo#.",
  ".#ooooooooo#.",
  ".#oooooooo#..",
  "..#-------#..",
  "..########...",
];

const CROSS = [
  "......###......",
  "......#o#......",
  "......#o#......",
  "......#o#......",
  "......###......",
  "...............",
  "######...######",
  "#oooo#.o.#oooo#",
  "######...######",
  "...............",
  "......###......",
  "......#o#......",
  "......#o#......",
  "......#o#......",
  "......###......",
];

function mix(a: string, b: string, t: number): string {
  const c = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  const ch = (i: number) => Math.round(c(a, i) * (1 - t) + c(b, i) * t);
  return "#" + [1, 3, 5].map((i) => ch(i).toString(16).padStart(2, "0")).join("");
}

function svg(rows: string[], px: number, paint: Record<string, string>): string {
  const w = Math.max(...rows.map((r) => r.length)) * px;
  const h = rows.length * px;
  let body = "";
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; ) {
      const fill = paint[row[x]];
      if (!fill) {
        x++;
        continue;
      }
      let x1 = x + 1;
      while (x1 < row.length && row[x1] === row[x]) x1++;
      body += `<rect x="${x * px}" y="${y * px}" width="${(x1 - x) * px}" height="${px}" fill="${fill}"/>`;
      x = x1;
    }
  }
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" shape-rendering="crispEdges">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(doc)}")`;
}

export interface CursorSet {
  arrow: string;
  hand: string;
  cross: string;
}

/** each value is a full `cursor` list with its keyword fallback; hotspots are grid cells */
export function cursorSet(style: CursorStyle): CursorSet {
  const px = Math.max(1, Math.round(style.size * 2));
  const paint = { "#": style.edge, o: style.fill, "-": mix(style.fill, style.edge, 0.35) };
  const at = (rows: string[], hx: number, hy: number, fallback: string) =>
    `${svg(rows, px, paint)} ${hx * px} ${hy * px}, ${fallback}`;
  return {
    arrow: at(ARROW, 0, 0, "default"),
    hand: at(HAND, 5, 0, "pointer"),
    cross: at(CROSS, 7, 7, "crosshair"),
  };
}

export function applyCursors(style: CursorStyle): void {
  const set = cursorSet(style);
  const root = document.documentElement.style;
  root.setProperty("--cur-arrow", set.arrow);
  root.setProperty("--cur-hand", set.hand);
  root.setProperty("--cur-cross", set.cross);
}
