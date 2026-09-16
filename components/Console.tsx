"use client";
import { useEffect, useRef, useState } from "react";
import type { Game, UiState } from "@/game/game";
import { profileLines } from "@/game/simreport";

/**
 * THE IN-GAME CONSOLE. Backquote (`) opens it over anything, in ANY build
 * — the shipped one included, on purpose: it is the one door to the debug
 * switches that does not need devtools, and the switches behind it are
 * the same ones the keyboard shortcuts reach (Ctrl+Shift+S for the
 * sandbox, Ctrl+Shift+M for the admin page). Type `help`.
 *
 * It is deliberately small: a line of the live numbers, a log, a prompt.
 * Every command is a one-liner over the handles the HUD already holds;
 * anything that needs a Game says so when there is no level running.
 */

export interface ConsoleHost {
  /** the level in play, or null on the menu */
  game: () => Game | null;
  /** the last HUD poll — the live numbers at the top */
  hud: UiState | null;
  /** the sandbox door (Ctrl+Shift+S): every lock lifted, the purse bottomless */
  sandbox: boolean;
  setSandbox: (on: boolean) => void;
  /** the admin page (Ctrl+Shift+M): map, level and balance editors */
  admin: () => void;
  /** the FPS counter and its saved preference */
  fps: boolean;
  setFps: (on: boolean) => void;
}

interface Line {
  readonly text: string;
  readonly kind: "in" | "out" | "err";
}

const HELP: readonly string[] = [
  "help                 this",
  "sandbox [on|off]     the sandbox door: every lock lifted, purse bottomless (Ctrl+Shift+S)",
  "admin                the admin page: map, level and balance editors (Ctrl+Shift+M)",
  "profile [on|off]     arm the sim's phase clock; the heaviest phases show up here live",
  "                     the figures AVERAGE from the moment you arm it — `profile on` again",
  "                     at the slow part clears the tally and measures only from there",
  "phases               the whole reading, copied to the clipboard: the window, the board,",
  "                     the broad-phase pad, and every phase with its worst step, the",
  "                     candidates it walked and what one of them cost. Paste it whole —",
  "                     the times alone cannot say WHY a pass is dear, and the rest can",
  "fps [on|off]         the frame counter (sim · draw · bodies · thread in dev builds)",
  "time M[:SS]          jump the run to that time — waves, mission and tide",
  "effects [on|off]     ambient effects (dressing; weapons always show)",
  "routes               toggle the flow-field overlay",
  "local [on|off]       step the sim on the page thread instead of its worker — NEXT level",
  "stats                bodies, kills, step and draw times, thread",
  "clear                clear this log",
];

const onOff = (arg: string | undefined, cur: boolean): boolean =>
  arg === undefined ? !cur : arg === "on" || arg === "1" || arg === "true";

/**
 * A RUN TIME AS TYPED: "12" is twelve minutes, "12:30" is twelve and a
 * half, "0:45" is forty-five seconds. Null when it is not a time at all.
 *
 * MINUTES LEAD because a run is a twenty-minute sitting and a wave lands
 * every twenty-odd seconds — "jump to 14" is the question somebody
 * actually has, and "jump to 840" is that question done as arithmetic.
 */
export function parseClock(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const m = /^(\d+)(?::([0-5]?\d))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
}

/** ...and back, as m:ss — what a parsed jump is echoed as */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function GameConsole({ host }: { host: ConsoleHost }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // the door: backquote, anywhere, any build
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== "Backquote" || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, open]);

  const say = (text: string, kind: Line["kind"] = "out"): void =>
    setLines((l) => [...l.slice(-199), { text, kind }]);

  const run = (raw: string): void => {
    const line = raw.trim();
    if (!line) return;
    say(line, "in");
    const [cmd, arg] = line.split(/\s+/);
    const g = host.game();
    const need = (): Game | null => {
      if (!g) say("no level running", "err");
      return g;
    };
    switch (cmd) {
      case "help":
        for (const h of HELP) say(h);
        break;
      case "sandbox": {
        const on = onOff(arg, host.sandbox);
        host.setSandbox(on);
        say(`sandbox ${on ? "on" : "off"}`);
        break;
      }
      case "admin":
        host.admin();
        say("admin page");
        break;
      case "profile": {
        const gm = need();
        if (!gm) break;
        const on = onOff(arg, (host.hud?.phases ?? "") !== "");
        gm.profile(on);
        // arming CLEARS the tally (Sim.profile), which is the whole trick
        // for a late wave: arm it again when the board turns slow and the
        // average stops carrying the easy waves that came before
        say(
          on
            ? "phase clock armed, tally cleared — phases show above, `phases` for all of them"
            : "phase clock off (the reading is kept; `phases` still reads it)",
        );
        break;
      }
      case "phases": {
        const gm = need();
        if (!gm) break;
        // THE WHOLE BLOCK, not a table of times: the window, the board,
        // the pad and then the phases with their per-candidate cost. A
        // phase table on its own cannot say whether a pass is dear
        // because it was handed more work or because each piece of work
        // got dearer, and those have opposite fixes (simreport.ts
        // profileLines says the rest)
        const p = gm.profileFull();
        if (!p || p.phases.length === 0) {
          say("phase clock is off — run `profile` first, then play through the slow part", "err");
          break;
        }
        const block = profileLines(p);
        for (const l of block) say(l);
        // ...AND ONTO THE CLIPBOARD, because the block exists to be
        // handed to somebody. Selecting twenty lines out of a console
        // overlay with a mouse, in a game, mid-run, is exactly the
        // friction that turns a measurement into a paraphrase
        // `?.` on the writeText alone would leave an undefined to call
        // .then on wherever the page is not a secure context, which is a
        // crash in the one command a slow board is being read with
        const copied = navigator.clipboard?.writeText(block.join("\n"));
        if (copied)
          void copied.then(
            () => say("(copied)"),
            () => {
              /* refused: the lines are above to select by hand */
            },
          );
        break;
      }
      case "fps": {
        const on = onOff(arg, host.fps);
        host.setFps(on);
        say(`fps counter ${on ? "on" : "off"}`);
        break;
      }
      // THE JUMP IS A TIME, not a wave number (Sim.skipToTime): the run
      // syncs everything to one clock, so `time 12:30` moves the waves, the
      // mission's own schedule and the tide together. Minutes, or m:ss.
      case "time": {
        const gm = need();
        if (!gm) break;
        const secs = parseClock(arg);
        if (secs === null) say("time M or M:SS — where to jump the run to", "err");
        else {
          gm.skipToTime(secs);
          say(`time ${clockText(secs)}`);
        }
        break;
      }
      case "effects": {
        const gm = need();
        if (!gm) break;
        const on = onOff(arg, true);
        gm.setEffects(on);
        say(`ambient effects ${on ? "on" : "off"}`);
        break;
      }
      case "routes": {
        const gm = need();
        if (!gm) break;
        gm.toggleRoutes();
        say("routes toggled");
        break;
      }
      case "local": {
        let cur = false;
        try {
          cur = localStorage.getItem("animechsLocalSim") === "1";
        } catch {
          /* no storage: the switch cannot be kept */
        }
        const on = onOff(arg, cur);
        try {
          if (on) localStorage.setItem("animechsLocalSim", "1");
          else localStorage.removeItem("animechsLocalSim");
          say(`sim on the ${on ? "page thread" : "worker"} from the next level (dev builds)`);
        } catch {
          say("no storage on this page; cannot keep the switch", "err");
        }
        break;
      }
      case "stats": {
        const gm = need();
        if (!gm) break;
        const s = gm.stats();
        const h = host.hud;
        say(
          `bodies ${s.units} · kills ${s.kills} · sim ${s.simMs.toFixed(1)}ms · draw ${s.drawMs.toFixed(1)}ms · ` +
            `${s.fps} fps · ${h?.host ?? "?"}` + (h?.phases ? ` · [${h.phases}]` : ""),
        );
        break;
      }
      case "clear":
        setLines([]);
        break;
      default:
        say(`unknown: ${cmd} — try help`, "err");
    }
  };

  if (!open) return null;
  const h = host.hud;
  const live = h
    ? `sim ${h.simMs.toFixed(1)} · draw ${h.drawMs.toFixed(1)} · ${h.bodies} bodies · ${h.host} · ${h.fps} fps` +
      (h.phases ? `   [${h.phases}]` : "")
    : "no level running";
  return (
    <div
      className="absolute inset-x-0 top-0 z-50 border-b border-[#3F3F46] bg-black/85 font-mono text-[13px] text-[#D4D4D8] select-text"
      // the console's keys are its own: nothing here reaches the game's
      // window listener (Game.onKeyDown) — the same stop the chat input
      // uses
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <div className="px-3 py-1 text-[#A1A1AA]">{live}</div>
      <div ref={logRef} className="max-h-48 overflow-y-auto px-3 pb-1">
        {lines.map((l, i) => (
          <div
            key={i}
            // WHITESPACE IS CONTENT HERE. `phases` prints a column table
            // padded with spaces, and HTML collapses runs of them — the
            // block that reads straight in the clipboard would arrive on
            // screen as one ragged smear without this
            className={
              "whitespace-pre-wrap " +
              (l.kind === "in" ? "text-[#FAFAFA]" : l.kind === "err" ? "text-[#F87171]" : "text-[#D4D4D8]")
            }
          >
            {l.kind === "in" ? `> ${l.text}` : l.text}
          </div>
        ))}
      </div>
      <form
        className="flex items-center gap-2 border-t border-[#27272A] px-3 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          run(text);
          setText("");
        }}
      >
        <span className="text-[#71717A]">&gt;</span>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 bg-transparent outline-none"
          spellCheck={false}
          autoComplete="off"
          placeholder="help"
        />
      </form>
    </div>
  );
}
