"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AUTHORED,
  blankSpec,
  CORE_END,
  type BiasTerm,
  type GraphRoad,
  type GraphSpec,
} from "@/game/mapgraph";

/**
 * THE MAP GRAPH EDITOR — draw the room graph, press Generate, read the
 * checks. The terrain is never drawn here and never can be: what an
 * author places is ROOMS, ROADS and CHOKES, and mapgen.mjs makes the
 * ground out of noise every time. That is the whole point — a shape
 * asked for in the graph comes back as terrain that never looks drawn.
 *
 * NOTHING HERE PLACES A SPAWN. The game paints one spawn layer with no
 * kinds on it, so the tiles go on in the map editor once the ground
 * exists — see docs/map-graph.md.
 *
 * The board is the AUTHORED 256, which the generator doubles on the way
 * in; the preview it returns is 512, so one authored cell is two preview
 * pixels and the overlay is drawn at that scale.
 */

/**
 * The preview the generator returns is 512 across — one pixel per grid
 * cell — and that is what the background canvas holds, at that size,
 * however large it is drawn. The GRAPH canvas is a different matter: its
 * lines are vector, so it gets a backing store the size it is actually
 * shown at and stays crisp however far the board is opened up.
 */
const PREVIEW = 512;

type Tool = "select" | "room" | "road" | "choke";

type Sel =
  | { kind: "room"; i: number }
  | { kind: "choke"; i: number }
  | { kind: "road"; i: number }
  | { kind: "core" }
  | null;

interface GenResult {
  ok: boolean;
  threw: string | null;
  fails: string[];
  log: string[];
  png: string | null;
  hills: string | null;
}

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "select", label: "Select", hint: "click a room, choke, core or road — drag to move, Delete to remove" },
  { id: "room", label: "Room", hint: "click to carve a clearing — a small one is a bend in a road" },
  { id: "road", label: "Road", hint: "click two rooms, or a room and the core, to carve a corridor between them" },
  { id: "choke", label: "Choke", hint: "click to pinch the corridor there" },
];

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** a number field that keeps its own text so a half-typed value survives */
function Num({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-[#8A8A96]">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-20 rounded border border-[#2E2E36] bg-[#141418] px-1 py-0.5 text-right text-[#D8D8E0]"
      />
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-[11px]">
      <span className="flex justify-between text-[#8A8A96]">
        {label}
        <span className="text-[#D8D8E0]">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#E0A64B]"
      />
    </label>
  );
}

export default function MapGraphEditor({ openId }: { openId?: string }) {
  const [spec, setSpec] = useState<GraphSpec>(() => blankSpec("sketch"));
  const [tool, setTool] = useState<Tool>("select");
  const [sel, setSel] = useState<Sel>(null);
  // the first end of a road being drawn — a room index, or CORE_END
  const [roadFrom, setRoadFrom] = useState<number | null>(null);
  const [res, setRes] = useState<GenResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>("");
  // a note that is bad news reads as bad news
  const [noteBad, setNoteBad] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [darkHills, setDarkHills] = useState(true);
  const [showGraph, setShowGraph] = useState(true);

  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: "room" | "choke" | "core"; i: number } | null>(null);
  // THE BOARD IS SQUARE AND FILLS WHAT IT IS GIVEN: the largest square
  // that fits the space left over beside the panel, remeasured whenever
  // the window is
  const [size, setSize] = useState(512);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => {
      const r = box.getBoundingClientRect();
      setSize(Math.max(320, Math.floor(Math.min(r.width, r.height))));
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // the saved graphs and the tile palette, once
  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/mapgen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      if (!r.ok) return;
      const j = (await r.json()) as { ids: string[] };
      setIds(j.ids);
    })();
  }, []);

  const generate = useCallback(async () => {
    setBusy(true);
    setNote("");
    setNoteBad(false);
    try {
      const r = await fetch("/api/mapgen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "generate", spec }),
      });
      const j = (await r.json()) as GenResult & { error?: string };
      if (j.error) {
        setNote(j.error);
        setNoteBad(true);
        return;
      }
      setRes(j);
    } finally {
      setBusy(false);
    }
  }, [spec]);

  /**
   * SAVE — the spec always, and the map too when this id already is one.
   *
   * THE MAP CAN BE REFUSED WHILE THE SPEC IS WRITTEN. A document that
   * does not pass the checks is not written, and that used to be silent:
   * the note said "wrote ..." and the map a player loads stayed on the
   * old terrain. So the refusal and the check that caused it are said out
   * loud, and `alsoMap` is the only difference between Save and Publish.
   */
  const write = useCallback(
    async (alsoMap: boolean) => {
      setBusy(true);
      try {
        const r = await fetch("/api/mapgen", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "save", spec, ...(alsoMap ? { alsoMap } : {}) }),
        });
        const j = (await r.json()) as {
          wrote?: string[];
          error?: string;
          mapError?: string;
          mapFails?: string[];
        };
        if (j.error) {
          setNote(j.error);
          setNoteBad(true);
          return;
        }
        const wrote = j.wrote ?? [];
        const map = wrote.some((f) => f.startsWith("public/maps/"));
        if (j.mapError) {
          setNote(
            `spec saved, MAP NOT UPDATED — ${j.mapError}${
              j.mapFails?.length ? `: ${j.mapFails.join("; ")}` : ""
            }`,
          );
          setNoteBad(true);
        } else {
          setNote(map ? `wrote ${wrote.join(", ")} — the map is updated` : `wrote ${wrote.join(" and ")} — this id is not a map yet, use Publish map`);
          setNoteBad(!map);
        }
        if (wrote.length && !ids.includes(spec.id)) setIds([...ids, spec.id].sort());
      } finally {
        setBusy(false);
      }
    },
    [spec, ids],
  );
  const save = useCallback(() => write(false), [write]);
  const publishMap = useCallback(() => write(true), [write]);

  const load = useCallback(async (id: string) => {
    const r = await fetch("/api/mapgen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "load", id }),
    });
    const j = (await r.json()) as { spec?: GraphSpec; error?: string };
    if (j.spec) {
      setSpec(j.spec);
      setSel(null);
      setRes(null);
      setNote(`loaded ${id}`);
      setNoteBad(false);
    } else {
      setNote(j.error ?? "could not load");
      setNoteBad(true);
    }
  }, []);

  // OPENED ONTO ONE MAP. The door on a map's card in the admin list
  // carries its id, so the editor lands on that graph rather than on a
  // blank board somebody then has to find their map in
  const opened = useRef(false);
  useEffect(() => {
    if (!openId || opened.current) return;
    opened.current = true;
    void load(openId);
  }, [openId, load]);


  // ---------- the picture ----------
  useEffect(() => {
    const c = bgRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, PREVIEW, PREVIEW);
    if (!res?.png) {
      ctx.fillStyle = "#0B0B0E";
      ctx.fillRect(0, 0, PREVIEW, PREVIEW);
      return;
    }
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, PREVIEW, PREVIEW);
      if (darkHills && res.hills) {
        // THE HILLS, PUSHED DOWN — the ROCK only. Deep water is blocked
        // as well, and dimming that too turned every lake and channel
        // into another dark patch, so the mask the route sends is the
        // blocked cells with the water taken back out.
        const mask = decode(res.hills);
        const frame = ctx.getImageData(0, 0, PREVIEW, PREVIEW);
        const px = frame.data;
        for (let i = 0; i < mask.length && i < PREVIEW * PREVIEW; i++) {
          if (!mask[i]) continue;
          const o = i * 4;
          px[o] = (px[o] * 0.22) | 0;
          px[o + 1] = (px[o + 1] * 0.22) | 0;
          px[o + 2] = (px[o + 2] * 0.22) | 0;
        }
        ctx.putImageData(frame, 0, 0);
      }
    };
    img.src = `data:image/png;base64,${res.png}`;
  }, [res, darkHills]);

  // ---------- the graph on top ----------
  useEffect(() => {
    const c = fgRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    if (!showGraph) return;
    const K = size / AUTHORED; // authored cell -> shown pixel
    const P = (v: number) => v * K;

    // roads first, so the handles sit on top of them
    const drawLine = (a: { x: number; y: number }, b: { x: number; y: number }, w: number, colour: string) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(1.5, w * K * 0.5);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(P(a.x), P(a.y));
      ctx.lineTo(P(b.x), P(b.y));
      ctx.stroke();
    };
    spec.roads.forEach((r, i) => {
      const a = r.ends[0] === CORE_END ? spec.core : spec.rooms[r.ends[0]];
      const b = r.ends[1] === CORE_END ? spec.core : spec.rooms[r.ends[1]];
      if (!a || !b) return;
      const on = sel?.kind === "road" && sel.i === i;
      const colour = r.water
        ? on ? "rgba(79,176,232,0.95)" : "rgba(79,176,232,0.45)"
        : on ? "rgba(224,166,75,0.95)" : "rgba(224,166,75,0.4)";
      drawLine(a, b, r.width[1], colour);
    });
    if (roadFrom != null) {
      const a = roadFrom === CORE_END ? spec.core : spec.rooms[roadFrom];
      if (a) {
        ctx.beginPath();
        ctx.arc(P(a.x), P(a.y), (a.r + 2) * K, 0, Math.PI * 2);
        ctx.strokeStyle = "#FFD37F";
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // rooms
    spec.rooms.forEach((r, i) => {
      const on = sel?.kind === "room" && sel.i === i;
      ctx.beginPath();
      ctx.arc(P(r.x), P(r.y), r.r * K, 0, Math.PI * 2);
      ctx.strokeStyle = r.water ? "#4FB0E8" : r.dry ? "#CFB488" : on ? "#FFD37F" : "#9A9AA8";
      ctx.lineWidth = on ? 2.5 : 1.2;
      ctx.stroke();
      ctx.fillStyle = on ? "#FFD37F" : "#C8C8D4";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(String(i), P(r.x) + 3, P(r.y) - 3);
    });

    // chokes and the funnel
    spec.chokes.forEach((ch, i) => {
      const on = sel?.kind === "choke" && sel.i === i;
      ctx.strokeStyle = on ? "#FF8080" : "#FF4040";
      ctx.lineWidth = on ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.arc(P(ch.x), P(ch.y), ch.reach * K, 0, Math.PI * 2);
      ctx.stroke();
    });
    if (spec.funnel) {
      ctx.strokeStyle = "rgba(255,64,64,0.9)";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(P(spec.funnel.x), P(spec.funnel.y), spec.funnel.r * K, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // the core
    const on = sel?.kind === "core";
    ctx.fillStyle = "#FFD37F";
    ctx.fillRect(P(spec.core.x) - 4, P(spec.core.y) - 4, 8, 8);
    ctx.strokeStyle = on ? "#FFFFFF" : "rgba(255,211,127,0.6)";
    ctx.lineWidth = on ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.arc(P(spec.core.x), P(spec.core.y), spec.core.r * K, 0, Math.PI * 2);
    ctx.stroke();
  }, [spec, sel, roadFrom, showGraph, size]);

  // ---------- hit testing ----------
  const at = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) / box.width) * AUTHORED,
      y: ((e.clientY - box.top) / box.height) * AUTHORED,
    };
  };
  /** how far a point is from a road's line, so a road can be clicked */
  const toSegment = (
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): number => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const endOf = (v: number) => (v === CORE_END ? spec.core : spec.rooms[v]);

  /**
   * WHAT IS UNDER THE CURSOR. The handles first — a room, a choke, the
   * core — and only then the roads, so a click on a room end picks the
   * room and a click along the run picks the road.
   */
  const pick = (p: { x: number; y: number }): Sel => {
    const near = (a: { x: number; y: number }, r: number) => Math.hypot(a.x - p.x, a.y - p.y) <= r + 3;
    for (let i = spec.rooms.length - 1; i >= 0; i--) if (near(spec.rooms[i], spec.rooms[i].r)) return { kind: "room", i };
    for (let i = spec.chokes.length - 1; i >= 0; i--) if (near(spec.chokes[i], spec.chokes[i].reach)) return { kind: "choke", i };
    if (near(spec.core, spec.core.r)) return { kind: "core" };
    for (let i = spec.roads.length - 1; i >= 0; i--) {
      const a = endOf(spec.roads[i].ends[0]);
      const b = endOf(spec.roads[i].ends[1]);
      // half the road's own width, and never a target smaller than a
      // comfortable click
      if (a && b && toSegment(p, a, b) <= Math.max(4, spec.roads[i].width[1] / 2)) return { kind: "road", i };
    }
    return null;
  };
  const roomAt = (p: { x: number; y: number }): number | null => {
    for (let i = spec.rooms.length - 1; i >= 0; i--)
      if (Math.hypot(spec.rooms[i].x - p.x, spec.rooms[i].y - p.y) <= spec.rooms[i].r + 3) return i;
    return null;
  };

  const onDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = at(e);
    const round = (v: number) => Math.max(4, Math.min(AUTHORED - 4, Math.round(v)));
    if (tool === "room") {
      setSpec({ ...spec, rooms: [...spec.rooms, { x: round(p.x), y: round(p.y), r: 12 }] });
      setSel({ kind: "room", i: spec.rooms.length });
      return;
    }
    if (tool === "choke") {
      setSpec({ ...spec, chokes: [...spec.chokes, { x: round(p.x), y: round(p.y), w: 10, reach: 8 }] });
      setSel({ kind: "choke", i: spec.chokes.length });
      return;
    }
    if (tool === "road") {
      // an end is a room, or the core — a road may finish on either
      const hit = pick(p);
      const e = hit?.kind === "core" ? CORE_END : hit?.kind === "room" ? hit.i : null;
      if (e == null) return;
      if (roadFrom == null) setRoadFrom(e);
      else if (roadFrom !== e) {
        const r: GraphRoad = { ends: [roadFrom, e], width: [8, 12] };
        setSpec({ ...spec, roads: [...spec.roads, r] });
        setSel({ kind: "road", i: spec.roads.length });
        setRoadFrom(null);
      }
      return;
    }
    // select
    const hit = pick(p);
    setSel(hit);
    if (hit && hit.kind !== "road")
      drag.current = hit.kind === "core" ? { kind: "core", i: 0 } : { kind: hit.kind, i: hit.i };
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const p = at(e);
    const x = Math.max(4, Math.min(AUTHORED - 4, Math.round(p.x)));
    const y = Math.max(4, Math.min(AUTHORED - 4, Math.round(p.y)));
    const d = drag.current;
    if (d.kind === "core") setSpec({ ...spec, core: { ...spec.core, x, y } });
    else if (d.kind === "room")
      setSpec({ ...spec, rooms: spec.rooms.map((r, i) => (i === d.i ? { ...r, x, y } : r)) });
    else setSpec({ ...spec, chokes: spec.chokes.map((c, i) => (i === d.i ? { ...c, x, y } : c)) });
  };
  const onUp = () => void (drag.current = null);

  // Delete removes the selection; Enter commits a route
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape") {
        setRoadFrom(null);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!sel) return;
      e.preventDefault();
      setSpec((s) => {
        if (sel.kind === "room") {
          // a room's index is its identity in every road, so renumber
          const drop = sel.i;
          const shift = (i: number) => (i > drop ? i - 1 : i);
          return {
            ...s,
            rooms: s.rooms.filter((_, i) => i !== drop),
            roads: s.roads
              .filter((r) => !r.ends.includes(drop))
              .map((r) => ({ ...r, ends: [shift(r.ends[0]), shift(r.ends[1])] as [number, number] })),
          };
        }
        if (sel.kind === "choke") return { ...s, chokes: s.chokes.filter((_, i) => i !== sel.i) };
        if (sel.kind === "road") return { ...s, roads: s.roads.filter((_, i) => i !== sel.i) };
        return s;
      });
      setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  const setBias = (i: number, t: BiasTerm) =>
    setSpec({ ...spec, water: { ...spec.water, bias: spec.water.bias.map((b, k) => (k === i ? t : b)) } });

  const selected = useMemo(() => {
    if (!sel) return null;
    if (sel.kind === "room") return spec.rooms[sel.i];
    if (sel.kind === "choke") return spec.chokes[sel.i];
    if (sel.kind === "road") return spec.roads[sel.i];
    return spec.core;
  }, [sel, spec]);

  const hint = TOOLS.find((t) => t.id === tool)?.hint ?? "";

  return (
    <div className="flex h-full min-h-0 gap-4 p-3 text-[#D8D8E0]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-2 flex flex-wrap gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTool(t.id);
                setRoadFrom(null);
              }}
              className={`rounded px-2 py-1 text-[11px] ${
                tool === t.id ? "bg-[#E0A64B] text-black" : "bg-[#1C1C22] text-[#A8A8B4] hover:bg-[#25252D]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div ref={boxRef} className="min-h-0 flex-1">
          <div className="relative" style={{ width: size, height: size }} onMouseLeave={onUp}>
            <canvas
              ref={bgRef}
              width={PREVIEW}
              height={PREVIEW}
              style={{ width: size, height: size }}
              className="absolute inset-0 [image-rendering:pixelated]"
            />
            <canvas
              ref={fgRef}
              style={{ width: size, height: size }}
              className="absolute inset-0 cursor-crosshair"
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
            />
          </div>
        </div>
        <p className="mt-1 h-4 text-[11px] text-[#7A7A86]">
          {roadFrom != null
            ? `road from ${roadFrom === CORE_END ? "the core" : `room ${roadFrom}`} — click its other end (Esc to drop it)`
            : hint}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => void generate()}
            disabled={busy}
            className="rounded bg-[#E0A64B] px-3 py-1.5 text-[12px] font-medium text-black disabled:opacity-50"
          >
            {busy ? "…" : "Generate"}
          </button>
          <button
            onClick={() => setSpec({ ...spec, seed: 0x1000 + ((Math.random() * 0xefff) | 0) })}
            className="rounded bg-[#1C1C22] px-3 py-1.5 text-[12px] text-[#A8A8B4] hover:bg-[#25252D]"
          >
            Reseed
          </button>
          <button
            onClick={() => void save()}
            disabled={busy}
            title="write the graph, the .mjs spec, and the map itself when this id already is one"
            className="rounded bg-[#E0A64B]/20 px-3 py-1.5 text-[12px] text-[#E8C88A] hover:bg-[#E0A64B]/30 disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={() => void publishMap()}
            disabled={busy}
            title="write public/maps/<id>.json for an id that is not a map yet — Save already updates one that is"
            className="rounded bg-[#1C1C22] px-3 py-1.5 text-[12px] text-[#A8A8B4] hover:bg-[#25252D] disabled:opacity-50"
          >
            Publish map
          </button>
          <label className="ml-1 flex items-center gap-1 text-[11px] text-[#8A8A96]">
            <input type="checkbox" checked={darkHills} onChange={(e) => setDarkHills(e.target.checked)} />
            dark hills
          </label>
          <label className="flex items-center gap-1 text-[11px] text-[#8A8A96]">
            <input type="checkbox" checked={showGraph} onChange={(e) => setShowGraph(e.target.checked)} />
            graph
          </label>
        </div>
        {note && (
          <p className={`mt-1 text-[11px] ${noteBad ? "text-[#FF8080]" : "text-[#7BE58A]"}`}>{note}</p>
        )}
      </div>

      <div className="w-[320px] shrink-0 space-y-3 overflow-y-auto pr-1 text-[12px]">
        <div className="space-y-1 rounded border border-[#2E2E36] p-2">
          <div className="flex gap-2">
            <input
              value={spec.id}
              onChange={(e) => setSpec({ ...spec, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              className="w-1/2 rounded border border-[#2E2E36] bg-[#141418] px-1 py-0.5"
            />
            <input
              value={spec.name}
              onChange={(e) => setSpec({ ...spec, name: e.target.value })}
              className="w-1/2 rounded border border-[#2E2E36] bg-[#141418] px-1 py-0.5"
            />
          </div>
          <select
            onChange={(e) => e.target.value && void load(e.target.value)}
            value=""
            className="w-full rounded border border-[#2E2E36] bg-[#141418] px-1 py-0.5 text-[11px]"
          >
            <option value="">load a saved graph…</option>
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1 rounded border border-[#2E2E36] p-2">
          <p className="text-[11px] font-medium text-[#A8A8B4]">Rock</p>
          <Slider
            label="threshold (higher = MORE open)"
            value={spec.rock.threshold}
            min={0.25}
            max={0.6}
            step={0.005}
            onChange={(v) => setSpec({ ...spec, rock: { ...spec.rock, threshold: v } })}
          />
          <Slider label="scale" value={spec.rock.scale} min={12} max={40} step={1} onChange={(v) => setSpec({ ...spec, rock: { ...spec.rock, scale: v } })} />
          <Slider label="warp" value={spec.rock.warp} min={0} max={24} step={1} onChange={(v) => setSpec({ ...spec, rock: { ...spec.rock, warp: v } })} />
        </div>

        <div className="space-y-1 rounded border border-[#2E2E36] p-2">
          <p className="text-[11px] font-medium text-[#A8A8B4]">Water — terms sum, positive is drier</p>
          <Slider label="level" value={spec.water.level} min={0} max={0.6} step={0.01} onChange={(v) => setSpec({ ...spec, water: { ...spec.water, level: v } })} />
          <Slider label="shore" value={spec.water.shore} min={0.02} max={0.16} step={0.01} onChange={(v) => setSpec({ ...spec, water: { ...spec.water, shore: v } })} />
          <Slider label="scale" value={spec.water.scale} min={20} max={80} step={2} onChange={(v) => setSpec({ ...spec, water: { ...spec.water, scale: v } })} />
          {spec.water.bias.map((t, i) => (
            <div key={i} className="rounded bg-[#141418] p-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-[#7A7A86]">{t.kind}</span>
                <button
                  onClick={() => setSpec({ ...spec, water: { ...spec.water, bias: spec.water.bias.filter((_, k) => k !== i) } })}
                  className="text-[10px] text-[#8A8A96] hover:text-[#FF8080]"
                >
                  remove
                </button>
              </div>
              {t.kind === "const" && <Num label="v" step={0.01} value={t.v} onChange={(v) => setBias(i, { ...t, v })} />}
              {t.kind === "well" && (
                <>
                  <Num label="x" value={t.x} onChange={(v) => setBias(i, { ...t, x: v })} />
                  <Num label="y" value={t.y} onChange={(v) => setBias(i, { ...t, y: v })} />
                  <Num label="r" value={t.r} onChange={(v) => setBias(i, { ...t, r: v })} />
                  <Num label="depth" step={0.05} value={t.depth} onChange={(v) => setBias(i, { ...t, depth: v })} />
                </>
              )}
              {t.kind === "ramp" && (
                <>
                  <label className="flex items-center justify-between text-[11px]">
                    <span className="text-[#8A8A96]">from</span>
                    <select
                      value={t.dir}
                      onChange={(e) => setBias(i, { ...t, dir: e.target.value as typeof t.dir })}
                      className="rounded border border-[#2E2E36] bg-[#141418] px-1"
                    >
                      {["north", "south", "east", "west"].map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                  <Num label="at" value={t.at} onChange={(v) => setBias(i, { ...t, at: v })} />
                  <Num label="span" value={t.span} onChange={(v) => setBias(i, { ...t, span: v })} />
                  <Num label="amount" step={0.05} value={t.amount} onChange={(v) => setBias(i, { ...t, amount: v })} />
                </>
              )}
              {t.kind === "channel" && (
                <>
                  <label className="flex items-center justify-between text-[11px]">
                    <span className="text-[#8A8A96]">axis</span>
                    <select
                      value={t.axis}
                      onChange={(e) => setBias(i, { ...t, axis: e.target.value as "x" | "y" })}
                      className="rounded border border-[#2E2E36] bg-[#141418] px-1"
                    >
                      <option value="x">x (runs north–south)</option>
                      <option value="y">y (runs east–west)</option>
                    </select>
                  </label>
                  <Num label="at" value={t.at} onChange={(v) => setBias(i, { ...t, at: v })} />
                  <Num label="width" value={t.width} onChange={(v) => setBias(i, { ...t, width: v })} />
                  <Num label="depth" step={0.05} value={t.depth} onChange={(v) => setBias(i, { ...t, depth: v })} />
                  <Num label="skew" step={0.05} value={t.skew ?? 0} onChange={(v) => setBias(i, { ...t, skew: v })} />
                </>
              )}
            </div>
          ))}
          <div className="flex gap-1">
            {(["const", "well", "ramp", "channel"] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  const t: BiasTerm =
                    k === "const"
                      ? { kind: "const", v: 0.16 }
                      : k === "well"
                        ? { kind: "well", x: 128, y: 128, r: 14, depth: 0.45 }
                        : k === "ramp"
                          ? { kind: "ramp", dir: "north", at: 26, span: 150, amount: 0.5 }
                          : { kind: "channel", axis: "x", at: 128, width: 15, depth: 0.35 };
                  setSpec({ ...spec, water: { ...spec.water, bias: [...spec.water.bias, t] } });
                }}
                className="flex-1 rounded bg-[#1C1C22] px-1 py-0.5 text-[10px] text-[#A8A8B4] hover:bg-[#25252D]"
              >
                +{k}
              </button>
            ))}
          </div>
        </div>

        {sel && selected && (
          <div className="space-y-1 rounded border border-[#E0A64B]/40 p-2">
            <p className="text-[11px] font-medium text-[#E0A64B]">
              {sel.kind}
              {"i" in sel ? ` ${sel.i}` : ""}
            </p>
            {sel.kind === "room" && (
              <>
                <Num label="radius" value={spec.rooms[sel.i].r} onChange={(v) => setSpec({ ...spec, rooms: spec.rooms.map((r, i) => (i === sel.i ? { ...r, r: v } : r)) })} />
                <div className="flex gap-2 text-[11px]">
                  {(["water", "dry"] as const).map((f) => (
                    <label key={f} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={!!spec.rooms[sel.i][f]}
                        onChange={(e) =>
                          setSpec({ ...spec, rooms: spec.rooms.map((r, i) => (i === sel.i ? { ...r, [f]: e.target.checked || undefined } : r)) })
                        }
                      />
                      {f}
                    </label>
                  ))}
                </div>
                <input
                  placeholder="note"
                  value={spec.rooms[sel.i].note ?? ""}
                  onChange={(e) => setSpec({ ...spec, rooms: spec.rooms.map((r, i) => (i === sel.i ? { ...r, note: e.target.value || undefined } : r)) })}
                  className="w-full rounded border border-[#2E2E36] bg-[#141418] px-1 py-0.5 text-[11px]"
                />
              </>
            )}
            {sel.kind === "core" && <Num label="radius" value={spec.core.r} onChange={(v) => setSpec({ ...spec, core: { ...spec.core, r: v } })} />}
            {sel.kind === "choke" && (
              <>
                <Num label="width" value={spec.chokes[sel.i].w} onChange={(v) => setSpec({ ...spec, chokes: spec.chokes.map((c, i) => (i === sel.i ? { ...c, w: v } : c)) })} />
                <Num label="reach" value={spec.chokes[sel.i].reach} onChange={(v) => setSpec({ ...spec, chokes: spec.chokes.map((c, i) => (i === sel.i ? { ...c, reach: v } : c)) })} />
                <button
                  onClick={() => setSpec({ ...spec, funnel: { x: spec.chokes[sel.i].x, y: spec.chokes[sel.i].y, r: spec.chokes[sel.i].reach } })}
                  className="w-full rounded bg-[#1C1C22] px-1 py-0.5 text-[10px] text-[#A8A8B4] hover:bg-[#25252D]"
                >
                  make this the funnel
                </button>
              </>
            )}
            {sel.kind === "road" && (
              <>
                <Num
                  label="width min"
                  value={spec.roads[sel.i].width[0]}
                  onChange={(v) =>
                    setSpec({ ...spec, roads: spec.roads.map((r, i) => (i === sel.i ? { ...r, width: [v, r.width[1]] } : r)) })
                  }
                />
                <Num
                  label="width max"
                  value={spec.roads[sel.i].width[1]}
                  onChange={(v) =>
                    setSpec({ ...spec, roads: spec.roads.map((r, i) => (i === sel.i ? { ...r, width: [r.width[0], v] } : r)) })
                  }
                />
                <label className="flex items-center gap-1 text-[11px]">
                  <input
                    type="checkbox"
                    checked={!!spec.roads[sel.i].water}
                    onChange={(e) =>
                      setSpec({
                        ...spec,
                        roads: spec.roads.map((r, i) => (i === sel.i ? { ...r, water: e.target.checked || undefined } : r)),
                      })
                    }
                  />
                  water — cut a channel, not a road
                </label>
                <p className="text-[10px] text-[#7A7A86]">
                  a road meant to READ as a road wants about 3x a lane beside it, and a
                  board under 40% open to read against
                </p>
              </>
            )}
          </div>
        )}

        <div className="space-y-1 rounded border border-[#2E2E36] p-2">
          <Num label="holes" value={spec.holes} onChange={(v) => setSpec({ ...spec, holes: v })} />
          <Num label="lumps" value={spec.lumps} onChange={(v) => setSpec({ ...spec, lumps: v })} />
          <Num label="ruins" value={spec.ruins} onChange={(v) => setSpec({ ...spec, ruins: v })} />
        </div>

        {res && (
          <div className="rounded border border-[#2E2E36] p-2">
            <p className={`text-[11px] font-medium ${res.ok ? "text-[#7BE58A]" : "text-[#FF8080]"}`}>
              {res.threw ? "threw" : res.ok ? "clean" : `${res.fails.length} check(s) failed`}
            </p>
            {res.threw && <p className="mt-1 text-[11px] text-[#FF8080]">{res.threw}</p>}
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-[10px] leading-4 text-[#9A9AA8]">
              {res.log.filter((l) => l.startsWith("  ok") || l.startsWith("FAIL") || l.startsWith("  --")).join("\n")}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
