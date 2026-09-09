"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useConfirm } from "./ConfirmDialog";
import { MapEditor, PATH_WIDTHS, type BrushShape } from "@/game/editor";
import { LEGACY_COLS, SPAWN_RADII, SPAWN_RADIUS_DEFAULT } from "@/game/maps";
import {
  blueprintById,
  BLUEPRINTS,
  loadBlueprints,
  putBlueprint,
  removeBlueprint,
  saveBlueprints,
  slug,
  type Blueprint,
} from "@/game/blueprints";
import { MISSION_STRUCTS, TOWERS, ZONE_KINDS } from "@/game/constants";
import { MISSION_STRUCT_KINDS, TOWER_KINDS } from "@/game/types";
import { ALL_LAYERS, type TerrainLayers } from "@/game/renderer";
import {
  PALETTE,
  formationPalette,
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
        <span className="flex-1 truncate text-[14px] uppercase tracking-widest">{title}</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggle}
          title={open ? "Minimise" : "Expand"}
          aria-expanded={open}
          className="shrink-0 rounded px-1 text-[15px] leading-none text-[#71717C] hover:bg-[#222227] hover:text-[#EDEDEF]"
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
/**
 * What the Formations panel needs off the engine each tick: the box the
 * marquee is holding and what is inside it, the blueprint currently broken
 * open for editing, and the instance last clicked. All of it is pointer
 * state that belongs to the canvas, so the panel mirrors rather than owns
 * it (see the poll in the mount effect).
 */
interface FormationUi {
  box: { w: number; h: number } | null;
  count: number;
  editing: string | null;
  picked: { name: string; id: string; rot: number } | null;
}

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
    Math.max(1, Math.floor(map.floor.length / (map.w ?? LEGACY_COLS))),
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
  /**
   * THE FORMATION PANEL'S MIRROR OF THE ENGINE. The marquee, the
   * selection and the open edit all live on the MapEditor — they are
   * pointer state, and the pointer is the canvas's — so the panel reads
   * them off the same 250ms poll that watches `dirty` rather than trying
   * to own them. `libN` is bumped whenever the library changes so the
   * palette re-renders with a swatch the author has just made.
   */
  const [form, setForm] = useState<FormationUi>({ box: null, count: 0, editing: null, picked: null });
  const [libN, setLibN] = useState(0);
  const [formName, setFormName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [replaceId, setReplaceId] = useState("");

  useEffect(() => {
    if (!glRef.current || !uiRef.current) return;
    let alive = true;
    let editor: MapEditor | null = null;
    // THE LIBRARY BEFORE THE MAP: a document read before the blueprints
    // have loaded resolves no formations at all (formationsOf), so the two
    // are one await rather than a race. A library that will not load is
    // warned about and survived — the map still has its loose stamps.
    loadBlueprints()
      .then(() => {
        if (alive) setLibN((n) => n + 1);
      })
      .catch(() => {})
      .then(() => {
        // unmounted while the library was in flight: there is nothing left
        // to build an editor onto, and the canvases may already be gone
        const gl = glRef.current, ui = uiRef.current;
        if (!alive || !gl || !ui) return null;
        return MapEditor.create(gl, ui, map);
      })
      .then((ed) => {
        if (!ed) return;
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
      const ed = editorRef.current;
      if (!ed) return;
      setDirty(ed.dirty);
      const box = ed.marqueeBox();
      const sel = ed.selectedFormation();
      setForm({
        box: box ? { w: box.w, h: box.h } : null,
        count: box ? ed.marqueeCount() : 0,
        editing: ed.editing ? (blueprintById(ed.editing.id)?.name ?? ed.editing.id) : null,
        picked: sel ? { name: sel.bp.name, id: sel.bp.id, rot: sel.inst.rot } : null,
      });
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
    // the formation set is built from the LOADED LIBRARY and so is not in
    // PALETTE — see formationPalette()
    const set =
      setId === "formation" ? formationPalette()
      : (PALETTE.find((p) => p.id === setId) ?? PALETTE[0]);
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

  const { confirm, dialog: confirmDialog } = useConfirm();

  const close = useCallback(async () => {
    // the game's own dialog, never the browser's (ConfirmDialog)
    if (
      editorRef.current?.dirty &&
      !(await confirm({
        title: "Discard unsaved changes?",
        body: "This map has edits that have not been saved. Leaving throws them away.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
      }))
    ) {
      return;
    }
    onClose();
  }, [confirm, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // the dialog owns Escape while it is up, and answers it itself
      if (e.code === "Escape" && !e.defaultPrevented) void close();
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

  /**
   * SAVE THE MARQUEE AS A BLUEPRINT — a new one, or over an existing one.
   *
   * Saving over is the whole point of the library: every instance on every
   * map is a reference, so the moment the library accepts this, every copy
   * of that outpost everywhere is the outpost you just drew. Nothing else
   * has to be visited and nothing can be missed.
   *
   * The library is written to disk immediately rather than on the map's
   * own Save, because it is not part of this map: an author who makes a
   * blueprint here and opens another map to stamp it must find it there.
   */
  const saveFormation = async (over: string | null): Promise<void> => {
    const ed = editorRef.current;
    if (!ed) return;
    setFormError(null);
    const existing = over ? blueprintById(over) : null;
    const id = existing ? existing.id : slug(formName);
    const name = existing ? existing.name : formName.trim();
    if (!existing) {
      if (!name) return setFormError("give the formation a name");
      if (!id) return setFormError("that name has no letters or digits in it");
      if (blueprintById(id))
        return setFormError(`there is already a formation called "${name}" — save over it instead`);
    }
    const made = ed.makeFormation(id, name, putBlueprint);
    if (!made.ok) return setFormError(made.error ?? "could not save that formation");
    const res = await saveBlueprints();
    setLibN((n) => n + 1);
    setFormName("");
    setReplaceId("");
    if (!res.ok) setFormError(res.error);
  };

  /**
   * DELETE A BLUEPRINT, AND WITH IT EVERY INSTANCE OF IT ON EVERY MAP.
   * The route sweeps the map documents on disk; this drops them off the
   * board being edited, which is the one document the route cannot reach
   * because its unsaved state lives here.
   */
  const deleteFormation = async (bp: Blueprint): Promise<void> => {
    const ed = editorRef.current;
    const gone = ed ? ed.terrain.formations.filter((f) => f.id === bp.id).length : 0;
    if (
      !(await confirm({
        title: `Delete "${bp.name}"?`,
        body:
          "This deletes the formation and every instance of it on every map — " +
          (gone > 0 ? `${gone} on this one, and any on the others. ` : "") +
          "It cannot be undone.",
        confirmLabel: "Delete everywhere",
        cancelLabel: "Keep it",
      }))
    )
      return;
    ed?.dropFormations(bp.id);
    removeBlueprint(bp.id);
    if (setId === "formation") setVariant(0);
    const res = await saveBlueprints([bp.id]);
    setLibN((n) => n + 1);
    setFormError(res.ok ? null : res.error);
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
            <div className="text-[15px] uppercase tracking-widest text-[#71717C]">Map editor</div>
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
            <p role="alert" className="max-w-md text-[15px] leading-snug text-[#F08A8A]">
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
            <span className="text-[15px] uppercase tracking-widest text-[#71717C]">Randomize</span>
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
            <span className="text-[15px] uppercase tracking-widest text-[#71717C]">Brush</span>
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
            <span className="text-[15px] uppercase tracking-widest text-[#71717C]">Shape</span>
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
            <span className="text-[15px] uppercase tracking-widest text-[#71717C]">Height</span>
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
            <span className="text-[15px] uppercase tracking-widest text-[#71717C]">Layers</span>
            {LAYER_ROWS.map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center justify-between gap-3">
                <span className={`text-[15px] ${layers[key] ? "text-[#A6A6AF]" : "text-[#4A4A55] line-through"}`}>
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
            <div className="text-[14px] leading-tight text-[#71717C]">
              A hidden layer is locked: paint straight over the ground beneath it
            </div>
          </div>
          {isSpawn && (
            <label className="flex items-center justify-between gap-3">
              <span className="text-[15px] uppercase tracking-widest text-[#71717C]">Radius</span>
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
              <span className="text-[15px] uppercase tracking-widest text-[#71717C]">Path</span>
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
          <div className="text-[14px] text-[#71717C]">
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
        {/* THE FORMATIONS PANEL. A blueprint is the one thing in this
            editor that is not about THIS map — it is a design shared by
            every map — so it gets its own box rather than a row in the
            palette, and the box says plainly which of its buttons reach
            beyond the document you have open. */}
        <Panel
          id="formations"
          title="Formations"
          className={`absolute bottom-4 right-4 w-[19rem] max-w-[calc(100vw-2rem)] p-2 ${panel}`}
          bodyClassName="max-h-[46vh] overflow-y-auto"
        >
          <div className="flex flex-col gap-2 text-[13px] text-[#A6A6AF]">
            {/* what the marquee is holding, and what can be done with it */}
            {form.editing ? (
              <div className="rounded border border-[#7C5CCB] bg-[#1B1730] p-2">
                <div className="font-bold text-[#C4B5FD]">Editing “{form.editing}”</div>
                <p className="mt-1 leading-snug">
                  Its buildings are loose on the board. Change them, then save — every
                  instance on every map changes with it.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void saveFormation(form.editing ? replaceId || null : null)}
                    className="rounded border border-[#2E6E4E] bg-[#12281E]/80 px-2 py-1 text-[#7BE0A8] hover:border-[#3E9E6E]"
                  >
                    Save formation
                  </button>
                  <button
                    onClick={() => {
                      editorRef.current?.cancelEdit();
                      setFormError(null);
                    }}
                    className="rounded border border-[#2E2E36] px-2 py-1 hover:border-[#4A4A55]"
                  >
                    Stop editing
                  </button>
                </div>
              </div>
            ) : form.box ? (
              <div className="rounded border border-[#2E2E36] p-2">
                <div className="text-[#EDEDEF]">
                  {form.box.w}×{form.box.h} — {form.count} building{form.count === 1 ? "" : "s"}
                </div>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Name this formation"
                  className="mt-1.5 w-full rounded border border-[#2E2E36] bg-[#101013] px-2 py-1 text-[#EDEDEF] placeholder:text-[#4A4A55]"
                />
                <button
                  disabled={form.count === 0}
                  onClick={() => void saveFormation(null)}
                  className="mt-1.5 w-full rounded border border-[#2E6E4E] bg-[#12281E]/80 px-2 py-1 text-[#7BE0A8] hover:border-[#3E9E6E] disabled:opacity-40"
                >
                  Save as new formation
                </button>
                {BLUEPRINTS.length > 0 && (
                  <div className="mt-1.5 flex gap-1">
                    <select
                      value={replaceId}
                      onChange={(e) => setReplaceId(e.target.value)}
                      className="min-w-0 flex-1 rounded border border-[#2E2E36] bg-[#101013] px-1 py-1 text-[#EDEDEF]"
                    >
                      <option value="">save over…</option>
                      {BLUEPRINTS.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.w}×{b.h})
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!replaceId || form.count === 0}
                      onClick={() => void saveFormation(replaceId)}
                      className="rounded border border-[#2E2E36] px-2 py-1 hover:border-[#4A4A55] disabled:opacity-40"
                    >
                      Replace
                    </button>
                  </div>
                )}
              </div>
            ) : form.picked ? (
              <div className="rounded border border-[#FFD37F] bg-[#221B10] p-2">
                <div className="font-bold text-[#FFD37F]">
                  {form.picked.name}
                  {form.picked.rot ? ` · ${form.picked.rot * 90}°` : ""}
                </div>
                <button
                  onClick={() => {
                    const ed = editorRef.current;
                    if (!ed) return;
                    const sel = ed.selectedFormation();
                    if (sel) ed.breakFormationAt(sel.inst.gx, sel.inst.gy);
                    setReplaceId(sel ? sel.bp.id : "");
                    setFormError(null);
                  }}
                  className="mt-1.5 w-full rounded border border-[#2E2E36] px-2 py-1 hover:border-[#4A4A55]"
                >
                  Break apart to edit
                </button>
              </div>
            ) : (
              <p className="leading-snug">
                Lay out an outpost with the enemy tools, then drag a box round it with{" "}
                <span className="text-[#EDEDEF]">Select formation</span> and save it. Stamp it
                anywhere from the palette; <span className="text-[#EDEDEF]">R</span> turns it.
                Click one to pick it.
              </p>
            )}
            {formError && <div className="text-[#F25555]">{formError}</div>}
            {/* the library itself: what exists, and the one button that
                reaches every map at once */}
            {BLUEPRINTS.length > 0 && (
              <div key={libN} className="border-t border-[#2E2E36] pt-1.5">
                {BLUEPRINTS.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 py-0.5">
                    <span className="min-w-0 flex-1 truncate text-[#EDEDEF]">{b.name}</span>
                    <span className="text-[#4A4A55]">
                      {b.w}×{b.h} · {b.parts.length}
                    </span>
                    <button
                      title={`Delete "${b.name}" and every instance on every map`}
                      aria-label={`Delete ${b.name}`}
                      onClick={() => void deleteFormation(b)}
                      className="rounded px-1 leading-none text-[#71717C] hover:bg-[#3A1F1F] hover:text-[#F25555]"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
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
                <div className="mb-0.5 text-[13px] uppercase tracking-widest text-[#71717C]">
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
                          : set.kind === "enemy"
                            ? `Enemy ${TOWERS[TOWER_KINDS[v]].name}`
                            : set.kind === "mission"
                            ? `Mission ${MISSION_STRUCTS[MISSION_STRUCT_KINDS[v]].name}`
                            : set.kind === "formation"
                            ? `${BLUEPRINTS[v]?.name ?? "Formation"} (${BLUEPRINTS[v]?.w}×${BLUEPRINTS[v]?.h}) — R turns it`
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
                              <span className="absolute -right-1 -top-1 rounded bg-[#222227] px-1 text-[13px] text-[#FFD37F]">
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
          <div className="mt-1.5 border-t border-[#2E2E36] pt-1 text-[13px] text-[#A6A6AF]">
            {(() => {
              const set =
                setId === "formation" ? formationPalette()
                : (PALETTE.find((p) => p.id === setId) ?? PALETTE[0]);
              if (set.kind === "spawn")
                return `${ZONE_LABELS[ZONE_KINDS[Math.min(variant, ZONE_KINDS.length - 1)]]} drop zone`;
              if (set.kind === "enemy")
                return `Enemy ${TOWERS[TOWER_KINDS[Math.min(variant, TOWER_KINDS.length - 1)]].name}`;
              if (set.kind === "formation") {
                const b = BLUEPRINTS[Math.min(variant, BLUEPRINTS.length - 1)];
                return b ? `${b.name} — ${b.w}×${b.h}, ${b.parts.length} buildings · R turns it`
                  : "no formations yet";
              }
              if (set.kind === "mission") {
                const k = MISSION_STRUCT_KINDS[Math.min(variant, MISSION_STRUCT_KINDS.length - 1)];
                // the stamps are NUMBERED on the board and the number is
                // the list's order, which is the order the mission uses
                // them in — so the one thing worth saying here is that
                // stamping order is authoring, not decoration
                return `Mission ${MISSION_STRUCTS[k].name} — numbered in the order the mission uses them`;
              }
              return set.label;
            })()}
          </div>
        </Panel>
      </div>
      {confirmDialog}
    </div>
  );
}
