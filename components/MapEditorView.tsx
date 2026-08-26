"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapEditor } from "@/game/editor";
import { PALETTE, SPAWN_REGIONS, saveMap, type MapData, type PaletteSet } from "@/game/maps";

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
        <div className={`absolute left-4 top-4 flex items-center gap-3 px-3 py-2 ${panel}`}>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-[#71717C]">Map editor</div>
            <div className="text-sm font-semibold text-[#EDEDEF]">
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

        {/* right controls: randomize + brush */}
        <div className={`absolute right-4 top-4 flex flex-col gap-2 px-3 py-2 ${panel}`}>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-[11px] uppercase tracking-widest text-[#71717C]">Randomize</span>
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
            <span className="text-[11px] uppercase tracking-widest text-[#71717C]">Brush</span>
            <span className="flex gap-1">
              {[1, 2, 3].map((b) => (
                <button
                  key={b}
                  aria-pressed={brush === b}
                  onClick={() => setBrush(b)}
                  className={`h-6 w-6 rounded border text-xs ${
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
          <div className="text-[10px] text-[#71717C]">
            LMB paint · RMB pan · wheel zoom · ⌘Z undo
          </div>
        </div>

        {/* palette */}
        <div
          className={`absolute left-4 top-1/2 max-h-[80vh] -translate-y-1/2 overflow-y-auto p-2 ${panel}`}
        >
          <div className="flex flex-col gap-1.5">
            {PALETTE.map((set) => (
              <div key={set.id}>
                <div className="mb-0.5 text-[10px] uppercase tracking-widest text-[#71717C]">
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
                            className="absolute -right-1 -top-1 rounded bg-[#222227] px-1 text-[9px] font-semibold"
                            style={{ color: SPAWN_REGIONS[(region - 1) % SPAWN_REGIONS.length].css }}
                          >
                            {region}
                          </span>
                        )}
                        {randomize && !set.noRandom && set.icons.length > 1 && (
                          <span className="absolute -right-1 -top-1 rounded bg-[#222227] px-1 text-[9px] text-[#FFD37F]">
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
        </div>
      </div>
    </div>
  );
}
