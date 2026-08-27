"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapEditor, PATH_WIDTHS } from "@/game/editor";
import { SPAWN_RADII, SPAWN_RADIUS_DEFAULT } from "@/game/maps";
import { ALL_LAYERS, type TerrainLayers } from "@/game/renderer";
import { PALETTE, SPAWN_REGIONS, saveMap, type MapData, type PaletteSet } from "@/game/maps";

const LAYER_ROWS: ReadonlyArray<[keyof TerrainLayers, string]> = [
  ["wall", "Hills"],
  ["props", "Props"],
  ["spawn", "Spawn pads"],
  ["core", "Core"],
];

const POS_KEY = "swarmdustry.editor.panels.v1";

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
      const next = { x: base.x + ev.clientX - from.x, y: base.y + ev.clientY - from.y };
      // never let a panel be dragged fully off-screen: its own box has to
      // keep a grip's worth of itself inside the viewport
      const r = ref.current?.getBoundingClientRect();
      if (r) {
        const minX = next.x - r.left - r.width + 40, maxX = next.x + (window.innerWidth - r.left - 40);
        const minY = next.y - r.top + 8, maxY = next.y + (window.innerHeight - r.top - 40);
        next.x = Math.min(Math.max(next.x, minX), maxX);
        next.y = Math.min(Math.max(next.y, minY), maxY);
      }
      setOff(next);
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
  const [pathWidth, setPathWidth] = useState(1);
  const [spawnRadius, setSpawnRadius] = useState(SPAWN_RADIUS_DEFAULT);
  const [layers, setLayers] = useState<TerrainLayers>({ ...ALL_LAYERS });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
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
    ed.pathWidth = pathWidth;
    ed.spawnRadius = spawnRadius;
    if (
      ed.layers.wall !== layers.wall ||
      ed.layers.props !== layers.props ||
      ed.layers.spawn !== layers.spawn ||
      ed.layers.core !== layers.core
    ) {
      ed.layers = { ...layers };
      ed.redraw(); // visibility changed: the static batches must be rebuilt
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
    setSaveError(false);
    const ok = await saveMap(ed.data());
    setSaving(false);
    if (ok) {
      ed.dirty = false;
      setDirty(false);
    } else {
      setSaveError(true);
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

        {/* palette */}
        <Panel
          id="palette"
          title="Palette"
          base="translateY(-50%)"
          className={`absolute left-4 top-1/2 max-h-[80vh] overflow-y-auto p-2 ${panel}`}
        >
          <div className="flex flex-col gap-1.5">
            {PALETTE.map((set) => (
              <div key={set.id}>
                <div className="mb-0.5 text-[12px] uppercase tracking-widest text-[#71717C]">
                  {set.label}
                </div>
                <div className="flex gap-1">
                  {/* noRandom variants mean different things (spawn regions),
                      so they all stay pickable even with randomize on */}
                  {(randomize && !set.noRandom ? set.icons.slice(0, 1) : set.icons).map((icon, v) => {
                    const active =
                      setId === set.id && ((randomize && !set.noRandom) || variant === v);
                    const region = set.kind === "spawn" ? set.variants[v] : 0;
                    return (
                      <button
                        key={`${set.id}:${v}`}
                        title={
                          region > 0
                            ? `${set.label} ${region}`
                            : randomize && set.icons.length > 1
                              ? `${set.label} (random of ${set.icons.length})`
                              : `${set.label} ${set.icons.length > 1 ? v + 1 : ""}`
                        }
                        aria-pressed={active}
                        onClick={() => pick(set, v)}
                        className={`relative flex h-10 w-10 items-center justify-center rounded border ${
                          active
                            ? "border-[#FFD37F] bg-[#222227]"
                            : "border-[#2E2E36] bg-[#101013] hover:border-[#4A4A55]"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
                        <img src={icon} alt={set.label} className="h-8 w-8 [image-rendering:pixelated]" />
                        {region > 0 && (
                          <span
                            className="absolute -right-1 -top-1 rounded bg-[#222227] px-1 text-[11px] font-bold"
                            style={{ color: SPAWN_REGIONS[(region - 1) % SPAWN_REGIONS.length].css }}
                          >
                            {region}
                          </span>
                        )}
                        {randomize && !set.noRandom && set.icons.length > 1 && (
                          <span className="absolute -right-1 -top-1 rounded bg-[#222227] px-1 text-[11px] text-[#FFD37F]">
                            ×{set.icons.length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
