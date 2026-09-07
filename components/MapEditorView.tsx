"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MapEditor, PATH_WIDTHS, type BrushShape } from "@/game/editor";
import { SPAWN_RADII, SPAWN_RADIUS_DEFAULT } from "@/game/maps";
import { ZONE_KINDS } from "@/game/constants";
import { ALL_LAYERS, type TerrainLayers } from "@/game/renderer";
import {
  PALETTE,
  paletteSections,
  saveMap,
  zoneStyle,
  ZONE_LABELS,
  type MapData,
  type PaletteSet,
} from "@/game/maps";

const LAYER_ROWS: ReadonlyArray<[keyof TerrainLayers, string]> = [
  ["wall", "Hills"],
  ["props", "Props"],
  ["spawn", "Spawn pads"],
  ["base", "Base"],
];

const POS_KEY = "mechswarm.editor.panels.v1";

/** remember one panel's position and minimised state */
function persist(id: string, state: { x: number; y: number; open: boolean }): void {
  try {
    const all = JSON.parse(localStorage.getItem(POS_KEY) ?? "{}");
    localStorage.setItem(POS_KEY, JSON.stringify({ ...all, [id]: state }));
  } catch {
    // storage blocked: the panel still moved for this session
  }
}

/**
 * An overlay panel the user can drag out of the way by its grip. The
 * position is an OFFSET from wherever the panel is anchored by CSS, so
 * right- and centre-anchored panels keep their anchoring, and it persists
 * per panel id — the layout someone arranges for a map survives reloads.
 */
function Panel({
  id,
  title,
  className,
  bodyClassName = "",
  base = "",
  children,
}: {
  id: string;
  /** shown in the grip bar, and the only thing left when minimised */
  title: string;
  className: string;
  /** the scrolling part: the grip stays outside it, so a long list can be
   * scrolled without losing the handle that moves the panel */
  bodyClassName?: string;
  /** transform the panel's own anchoring needs (e.g. vertical centring),
   * composed BEFORE the drag offset so the two don't overwrite each other */
  base?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [open, setOpen] = useState(true);
  // the panel's CSS-anchored position, i.e. where it sits with a ZERO offset.
  // Measured rects already include whatever offset is applied, so every clamp
  // below subtracts the applied offset to get back to this fixed origin —
  // clamping against the live rect instead lets the bounds drift with the
  // panel and the box escapes the viewport anyway
  const anchor = useRef<{ x: number; y: number } | null>(null);

  /**
   * Keep a usable piece of the panel on screen. GRIP is what has to stay
   * reachable: lose that and the panel can never be dragged back, which is
   * exactly what a saved off-screen position used to do — permanently, since
   * the restore below applied it without any clamp at all.
   */
  const clampOff = useCallback((next: { x: number; y: number }) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !anchor.current) return next;
    const { x: ax, y: ay } = anchor.current;
    const GRIP = 56;
    return {
      x: Math.min(Math.max(next.x, GRIP - ax - r.width), window.innerWidth - GRIP - ax),
      y: Math.min(Math.max(next.y, -ay), window.innerHeight - GRIP - ay),
    };
  }, []);

  // measure the anchor once mounted, then rescue anything already off-screen
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) anchor.current = { x: r.left - off.x, y: r.top - off.y };
    setOff((cur) => {
      const fixed = clampOff(cur);
      return fixed.x === cur.x && fixed.y === cur.y ? cur : fixed;
    });
  }, [off.x, off.y, clampOff]);

  // a window that shrinks must not strand a panel outside it either
  useEffect(() => {
    const onResize = (): void =>
      setOff((cur) => {
        const fixed = clampOff(cur);
        return fixed.x === cur.x && fixed.y === cur.y ? cur : fixed;
      });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampOff]);

  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(POS_KEY) ?? "{}") as Record<
        string,
        { x: number; y: number; open?: boolean }
      >;
      if (all[id]) {
        setOff({ x: all[id].x, y: all[id].y });
        if (all[id].open === false) setOpen(false);
      }
    } catch {
      // a mangled layout just means default positions
    }
  }, [id]);

  const onGrab = (e: React.PointerEvent): void => {
    e.preventDefault();
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    const from = { x: e.clientX, y: e.clientY };
    const base = off;
    const move = (ev: PointerEvent): void => {
      setOff(clampOff({ x: base.x + ev.clientX - from.x, y: base.y + ev.clientY - from.y }));
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      setOff((cur) => {
        persist(id, { ...cur, open });
        return cur;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const toggle = (): void => {
    setOpen((v) => {
      persist(id, { ...off, open: !v });
      return !v;
    });
  };

  return (
    <div ref={ref} className={className} style={{ transform: `translate(${off.x}px, ${off.y}px) ${base}`.trim() }}>
      {/* the grip is sticky, so scrolling a long palette never scrolls the
          handle (or the minimise button) out of reach */}
      <div
        onPointerDown={onGrab}
        onDoubleClick={() => {
          setOff({ x: 0, y: 0 });
          persist(id, { x: 0, y: 0, open });
        }}
        title="Drag to move · double-click to reset position"
        className="sticky top-0 z-10 -mx-1 mb-1 flex cursor-grab select-none items-center gap-2 rounded-sm bg-[#151518] px-1 py-0.5 text-[#4A4A55] hover:text-[#A6A6AF] active:cursor-grabbing"
      >
        <svg viewBox="0 0 16 4" className="h-1.5 w-4 shrink-0 fill-current" aria-hidden="true">
          <circle cx="2" cy="2" r="1" />
          <circle cx="8" cy="2" r="1" />
          <circle cx="14" cy="2" r="1" />
        </svg>
        <span className="flex-1 truncate text-[12px] uppercase tracking-widest">{title}</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggle}
          title={open ? "Minimise" : "Expand"}
          aria-expanded={open}
          className="shrink-0 rounded px-1 text-[13px] leading-none text-[#71717C] hover:bg-[#222227] hover:text-[#EDEDEF]"
        >
          {open ? "–" : "+"}
        </button>
      </div>
      {open && <div className={bodyClassName}>{children}</div>}
    </div>
  );
}

/**
 * Full-screen map editor: the WebGL canvas pair underneath (same layout as
 * the game) with the palette, randomize toggle, and brush as overlays.
 */
export default function MapEditorView({
  map,
  onClose,
}: {
  map: MapData;
  onClose: () => void;
}) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const uiRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<MapEditor | null>(null);
  const [setId, setSetId] = useState<string>(PALETTE[0].id);
  const [variant, setVariant] = useState(0);
  const [randomize, setRandomize] = useState(true);
  const [brush, setBrush] = useState(1);
  const [brushShape, setBrushShape] = useState<BrushShape>("square");
  const [pathWidth, setPathWidth] = useState(1);
  const [spawnRadius, setSpawnRadius] = useState(SPAWN_RADIUS_DEFAULT);
  /**
   * The map's height in rows — mirrored out of the editor so the control can
   * show it, and pushed back in on every change. Seeded from the document,
   * which is the only place a map's real size has ever lived.
   */
  const [mapRows, setMapRowsState] = useState(() =>
    Math.max(1, Math.floor(map.floor.length / (map.w ?? 256))),
  );
  const setMapRows = (n: number): void => {
    const ed = editorRef.current;
    if (!ed || !Number.isFinite(n)) return;
    ed.setRows(n);
    setMapRowsState(ed.rows);
    setDirty(ed.dirty);
  };
  const [layers, setLayers] = useState<TerrainLayers>({ ...ALL_LAYERS });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // why the last save was refused — null when the last attempt succeeded
  const [saveError, setSaveError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!glRef.current || !uiRef.current) return;
    let alive = true;
    let editor: MapEditor | null = null;
    MapEditor.create(glRef.current, uiRef.current, map)
      .then((ed) => {
        if (!alive) {
          ed.destroy();
          return;
        }
        editor = ed;
        editorRef.current = ed;
        if (process.env.NODE_ENV !== "production") {
          (window as unknown as Record<string, unknown>).__swarmeditor = ed;
        }
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      });
    const poll = setInterval(() => {
      if (editorRef.current) setDirty(editorRef.current.dirty);
    }, 250);
    return () => {
      alive = false;
      clearInterval(poll);
      editor?.destroy();
      editorRef.current = null;
      const w = window as unknown as Record<string, unknown>;
      if (w.__swarmeditor === editor) delete w.__swarmeditor;
    };
  }, [map]);

  // push tool state into the engine
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const set = PALETTE.find((p) => p.id === setId) ?? PALETTE[0];
    ed.setTool(set, variant);
    ed.randomize = randomize;
    ed.brush = brush;
    ed.brushShape = brushShape;
    ed.pathWidth = pathWidth;
    ed.spawnRadius = spawnRadius;
    if (
      ed.layers.wall !== layers.wall ||
      ed.layers.props !== layers.props ||
      ed.layers.spawn !== layers.spawn ||
      ed.layers.base !== layers.base
    ) {
      ed.layers = { ...layers };
      // exits live in the per-frame overlay rather than the static batches,
      // so hiding them alone needs no rebuild — but the assignment above
      // does have to happen, and redraw() is cheap enough not to special-case
      ed.redraw();
    }
  });

  const close = useCallback(() => {
    if (editorRef.current?.dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // writes straight back into this official map's JSON via /api/maps
  const save = async (): Promise<void> => {
    const ed = editorRef.current;
    if (!ed || saving) return;
    setSaving(true);
    setSaveError(null);
    const res = await saveMap(ed.data());
    setSaving(false);
    if (res.ok) {
      ed.dirty = false;
      setDirty(false);
    } else {
      setSaveError(res.error);
    }
  };

  const pick = (set: PaletteSet, v: number): void => {
    setSetId(set.id);
    setVariant(v);
  };

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#101013]">
        <p className="p-8 text-center text-[#A6A6AF]">{error}</p>
      </div>
    );
  }

  const panel = "rounded border border-[#2E2E36] bg-[#151518]/80 backdrop-blur";
  const activeKind = (PALETTE.find((p) => p.id === setId) ?? PALETTE[0]).kind;
  const isPath = activeKind === "path";
  const isSpawn = activeKind === "spawn";

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div className="relative h-full w-full">
        <canvas ref={glRef} width={2560} height={1440} className="block h-full w-full" />
        <canvas
          ref={uiRef}
          width={2560}
          height={1440}
          className="absolute inset-0 h-full w-full cursor-crosshair"
        />

        {/* header: name, save, back */}
        <Panel id="header" title="Map" className={`absolute left-4 top-4 px-3 pb-2 pt-1 ${panel}`}>
          <div className="flex items-center gap-3">
          <div>
            <div className="text-[13px] uppercase tracking-widest text-[#71717C]">Map editor</div>
            <div className="text-base font-bold text-[#EDEDEF]">
              {map.name}
              {dirty && <span className="ml-1 text-[#F0B457]">●</span>}
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="rounded border border-[#2E6E4E] bg-[#12281E]/80 px-3 py-1 text-[#7BE0A8] hover:border-[#3E9E6E] disabled:opacity-50"
          >
            {saving ? "Saving…" : saveError ? "Save failed — retry" : "Save"}
          </button>
          {/* the refusal itself, not just that there was one: these are
              author errors (a layer the route won't take, a map id with no
              file) that are unfixable while they stay invisible */}
          {saveError && (
            <p role="alert" className="max-w-md text-[13px] leading-snug text-[#F08A8A]">
              {saveError}
            </p>
          )}
          <button
            onClick={close}
            className="rounded border border-[#2E2E36] px-3 py-1 text-[#A6A6AF] hover:border-[#4A4A55]"
          >
            Back (Esc)
          </button>
          </div>
        </Panel>

        {/* right controls: randomize + brush */}
        <Panel id="controls" title="Tools" className={`absolute right-4 top-4 px-3 pb-2 pt-1 ${panel}`}>
          <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-[13px] uppercase tracking-widest text-[#71717C]">Randomize</span>
            <button
              role="switch"
              aria-checked={randomize}
              onClick={() => setRandomize(!randomize)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                randomize ? "bg-[#2E6E4E]" : "bg-[#2E2E36]"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[#EDEDEF] transition-transform ${
                  randomize ? "translate-x-4" : ""
                }`}
              />
            </button>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-[13px] uppercase tracking-widest text-[#71717C]">Brush</span>
            <span className="flex gap-1">
              {[1, 2, 3].map((b) => (
                <button
                  key={b}
                  aria-pressed={brush === b}
                  onClick={() => setBrush(b)}
                  className={`h-6 w-6 rounded border text-sm ${
                    brush === b
                      ? "border-[#FFD37F] bg-[#222227] text-[#EDEDEF]"
                      : "border-[#2E2E36] text-[#71717C] hover:border-[#4A4A55]"
                  }`}
                >
                  {2 * b - 1}
                </button>
              ))}
              {/* the presets are the everyday sizes; this takes any other.
                  A square brush is always an ODD number of cells across —
                  it is centred on the cursor's cell — so an even entry is
                  rounded up rather than quietly ignored */}
              <input
                type="number"
                min={1}
                max={99}
                step={2}
                value={2 * brush - 1}
                onChange={(e) => {
                  const w = Number(e.target.value);
                  if (!Number.isFinite(w)) return;
                  const odd = Math.max(1, Math.min(99, Math.round(w) | 1));
                  setBrush((odd + 1) / 2);
                }}
                title="Brush width in cells — odd numbers only, centred on the cursor"
                className="h-6 w-14 rounded border border-[#2E2E36] bg-[#101013] px-1.5 text-right text-sm text-[#EDEDEF] focus:border-[#FFD37F] focus:outline-none"
              />
            </span>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-[13px] uppercase tracking-widest text-[#71717C]">Shape</span>
            <span className="flex gap-1">
              {(["square", "round"] as const).map((sh) => (
                <button
                  key={sh}
                  aria-pressed={brushShape === sh}
                  onClick={() => setBrushShape(sh)}
                  title={
                    sh === "square"
                      ? "Square brush — covers the whole box"
                      : "Round brush — covers a disc inside it"
                  }
                  className={`flex h-6 w-7 items-center justify-center rounded border ${
                    brushShape === sh
                      ? "border-[#FFD37F] bg-[#222227]"
                      : "border-[#2E2E36] hover:border-[#4A4A55]"
                  }`}
                >
                  <span
                    className={`block h-3 w-3 border ${sh === "round" ? "rounded-full" : ""} ${
                      brushShape === sh ? "border-[#EDEDEF] bg-[#EDEDEF]" : "border-[#71717C]"
                    }`}
                  />
                </button>
              ))}
            </span>
          </label>
          {/* MAP HEIGHT — the map's own boundary, as a number you set.
              It used to be implied by what the arrays happened to contain,
              which is why moving an edge meant painting rock in the right
              shape and hoping the save agreed. Everything reads this: what
              is drawn, where the void starts, how far the camera goes, what
              a brush may touch, and what gets written. */}
          <label className="flex items-center justify-between gap-3 border-t border-[#2E2E36] pt-2">
            <span className="text-[13px] uppercase tracking-widest text-[#71717C]">Height</span>
            <span className="flex items-center gap-1">
              {[-10, -1].map((d) => (
                <button
                  key={d}
                  aria-label={`${d} rows`}
                  onClick={() => setMapRows(mapRows + d)}
                  className="h-6 w-8 rounded border border-[#2E2E36] text-sm text-[#A6A6AF] hover:border-[#FFD37F] hover:text-[#EDEDEF]"
                >
                  {d}
                </button>
              ))}
              <input
                type="number"
                value={mapRows}
                onChange={(e) => setMapRows(Number(e.target.value))}
                aria-label="map height in rows"
                className="h-6 w-14 rounded border border-[#2E2E36] bg-[#0B0B0D] px-1 text-center text-sm text-[#EDEDEF] focus:border-[#FFD37F] focus:outline-none"
              />
              {[1, 10].map((d) => (
                <button
                  key={d}
                  aria-label={`+${d} rows`}
                  onClick={() => setMapRows(mapRows + d)}
                  className="h-6 w-8 rounded border border-[#2E2E36] text-sm text-[#A6A6AF] hover:border-[#FFD37F] hover:text-[#EDEDEF]"
                >
                  +{d}
                </button>
              ))}
            </span>
          </label>
          <div className="flex flex-col gap-1 border-t border-[#2E2E36] pt-2">
            <span className="text-[13px] uppercase tracking-widest text-[#71717C]">Layers</span>
            {LAYER_ROWS.map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center justify-between gap-3">
                <span className={`text-[13px] ${layers[key] ? "text-[#A6A6AF]" : "text-[#4A4A55] line-through"}`}>
                  {label}
                </span>
                <button
                  role="switch"
                  aria-checked={layers[key]}
                  aria-label={`${label} layer`}
                  onClick={() => setLayers({ ...layers, [key]: !layers[key] })}
                  className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${
                    layers[key] ? "bg-[#2E6E4E]" : "bg-[#2E2E36]"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-[#EDEDEF] transition-transform ${
                      layers[key] ? "translate-x-4" : ""
                    }`}
                  />
                </button>
              </label>
            ))}
            <div className="text-[12px] leading-tight text-[#71717C]">
              A hidden layer is locked: paint straight over the ground beneath it
            </div>
          </div>
          {isSpawn && (
            <label className="flex items-center justify-between gap-3">
              <span className="text-[13px] uppercase tracking-widest text-[#71717C]">Radius</span>
              <span className="flex gap-1">
                {SPAWN_RADII.map((r) => (
                  <button
                    key={r}
                    aria-pressed={spawnRadius === r}
                    onClick={() => setSpawnRadius(r)}
                    className={`h-6 w-7 rounded border text-sm ${
                      spawnRadius === r
                        ? "border-[#FFD37F] bg-[#222227] text-[#EDEDEF]"
                        : "border-[#2E2E36] text-[#71717C] hover:border-[#4A4A55]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
                {/* the presets are the common sizes; this is for any other.
                    Clamped to something that can actually hold a drop zone —
                    a radius of 0 would be a zone nothing ever spawns in */}
                <input
                  type="number"
                  min={1}
                  max={64}
                  step={1}
                  value={spawnRadius}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setSpawnRadius(Math.max(1, Math.min(64, Math.round(v))));
                  }}
                  title="Radius in cells — applies to the next zone you place"
                  className="h-6 w-14 rounded border border-[#2E2E36] bg-[#101013] px-1.5 text-right text-sm text-[#EDEDEF] focus:border-[#FFD37F] focus:outline-none"
                />
              </span>
            </label>
          )}
          {isPath && (
            <label className="flex items-center justify-between gap-3">
              <span className="text-[13px] uppercase tracking-widest text-[#71717C]">Path</span>
              <span className="flex gap-1">
                {PATH_WIDTHS.map((w, i) => (
                  <button
                    key={w}
                    aria-pressed={pathWidth === i}
                    onClick={() => setPathWidth(i)}
                    className={`h-6 w-7 rounded border text-sm ${
                      pathWidth === i
                        ? "border-[#FFD37F] bg-[#222227] text-[#EDEDEF]"
                        : "border-[#2E2E36] text-[#71717C] hover:border-[#4A4A55]"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </span>
            </label>
          )}
          <div className="text-[12px] text-[#71717C]">
            {isPath
              ? "Drag to carve an enemy road · edges wobble on their own"
              : isSpawn
                ? "Click to drop a zone · click inside one to move it · erase removes it"
                : "LMB paint · RMB pan · wheel zoom · ⌘Z undo"}
          </div>
          </div>
        </Panel>

        {/* PALETTE — a tool tray, not a list.
            Sections stack DOWN the panel, one heading per group, and each
            group's swatches flow across and wrap inside it. The panel has a
            fixed width so that wrapping actually happens: laying the
            sections out side by side instead made one very wide strip that
            crowded the map off the screen, which is the opposite of what a
            tray is for.

            The per-set names are gone: a sprite says what it paints once it
            is grouped with its own kind, and the one thing a sprite cannot
            say — which layer a zone or exit swatch belongs to — is said by
            its colour bar and spelled out in the footer. */}
        <Panel
          id="palette"
          title="Palette"
          className={`absolute bottom-4 left-4 w-[21rem] max-w-[calc(100vw-2rem)] p-2 ${panel}`}
          // the cap and the scroll go on the BODY, not the box: the grip bar
          // lives outside it, so a palette taller than its cap scrolls
          // without taking the handle that moves the panel off screen with it
          bodyClassName="max-h-[46vh] overflow-y-auto"
        >
          <div className="flex flex-col gap-1.5">
            {paletteSections().map((section) => (
              <div key={section.label}>
                <div className="mb-0.5 text-[11px] uppercase tracking-widest text-[#71717C]">
                  {section.label}
                </div>
                <div className="flex flex-wrap gap-1">
                  {section.sets.flatMap((set) =>
                    (randomize && !set.noRandom ? set.icons.slice(0, 1) : set.icons).map(
                      (icon, v) => {
                        const active =
                          setId === set.id && ((randomize && !set.noRandom) || variant === v);
                        const zone = set.kind === "spawn" ? ZONE_KINDS[v] : null;
                        const name = zone
                          ? `${ZONE_LABELS[zone]} drop zone`
                          : randomize && set.icons.length > 1
                            ? `${set.label} (random of ${set.icons.length})`
                            : `${set.label}${set.icons.length > 1 ? ` ${v + 1}` : ""}`;
                        return (
                          <button
                            key={`${set.id}:${v}`}
                            title={name}
                            aria-label={name}
                            aria-pressed={active}
                            onClick={() => pick(set, v)}
                            className={`relative flex h-10 w-10 items-center justify-center rounded border ${
                              active
                                ? "border-[#FFD37F] bg-[#222227]"
                                : "border-[#2E2E36] bg-[#101013] hover:border-[#4A4A55]"
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
                            <img
                              src={icon}
                              alt=""
                              className="h-8 w-8 [image-rendering:pixelated]"
                            />
                            {zone && (
                              <span
                                className="absolute inset-x-1 bottom-0.5 h-1 rounded-sm"
                                style={{ background: zoneStyle(zone).css }}
                              />
                            )}
                            {randomize && !set.noRandom && set.icons.length > 1 && (
                              <span className="absolute -right-1 -top-1 rounded bg-[#222227] px-1 text-[11px] text-[#FFD37F]">
                                ×{set.icons.length}
                              </span>
                            )}
                          </button>
                        );
                      },
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* WHAT IS IN HAND, in words, in exactly one place. The swatches
              lost their names with the column, and for the zone and exit
              rows that matters most: four identical dark panels differing
              only by a colour bar. */}
          <div className="mt-1.5 border-t border-[#2E2E36] pt-1 text-[11px] text-[#A6A6AF]">
            {(() => {
              const set = PALETTE.find((p) => p.id === setId) ?? PALETTE[0];
              if (set.kind === "spawn")
                return `${ZONE_LABELS[ZONE_KINDS[Math.min(variant, ZONE_KINDS.length - 1)]]} drop zone`;
              return set.label;
            })()}
          </div>
        </Panel>
      </div>
    </div>
  );
}
