"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * THE GAME'S OWN "ARE YOU SURE".
 *
 * Nothing in the game asks a question through window.confirm any more: the
 * browser's — and on the desktop build, the OS shell's — dialog is a white
 * box in the system face, drawn OUTSIDE the game's own frame, which on a
 * fullscreen window means the shell dims and a Windows sheet slides in over
 * the battlefield. It also blocks the main thread while it is up, so the
 * frame under it freezes on whatever it last drew.
 *
 * This is that dialog rebuilt out of the game's own parts — the same
 * ms-pane-solid panel, the same bevelled buttons, the same heading rule the
 * pickers wear (PickerDialog) — and it closes every way a dialog anyone has
 * met closes: the confirm button, the cancel button, Escape, and a click on
 * the ground outside it. Enter takes the confirm.
 *
 * It sits OUTSIDE any `ui-zoom` wrapper for the same reason PickerDialog
 * does: `ui-zoom` is a CSS `zoom`, and a fixed backdrop inside one covers
 * the scaled box rather than the viewport. The panel carries its own
 * ui-zoom, so the UI-size knob still moves it.
 */
export interface ConfirmOptions {
  /** the question, as a heading — a few words, not a sentence */
  title: string;
  /** what saying yes actually does; a line or two under the heading */
  body?: ReactNode;
  /** the yes button. Name the ACTION ("Wipe", "Quit"), never "OK" */
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * `danger` paints the confirm red and leaves the cursor on Cancel: the
   * default answer to a question about something that cannot be undone is
   * no. `accent` is the ordinary gold confirm, focused, for a question
   * whose yes is the expected one.
   */
  tone?: "danger" | "accent";
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // the cursor starts on the safe answer for a destructive question, so a
  // player who hits Enter out of habit does NOT wipe their save
  useEffect(() => {
    const btn = tone === "danger" ? cancelRef.current : confirmRef.current;
    btn?.focus();
  }, [tone]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        // stop the press here: every screen behind this one also listens
        // for Escape (useEscapeBack), and one press must close one thing
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
    };
    // capture: ahead of the listeners the screen underneath registered
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, onConfirm]);

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="ui-zoom ms-pane-solid flex w-full max-w-[24rem] flex-col p-5 shadow-2xl"
      >
        <h2 className="ms-heading text-[15px] tracking-[0.35em]">{title}</h2>
        {body !== undefined && body !== null && (
          <div className="mt-3 text-[15px] leading-relaxed text-[#a2a2a2]">{body}</div>
        )}
        {/* the safe answer is on the left and the committing one on the
            right, the order every sheet in the game already reads in */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="ms-btn px-5 py-2 text-[15px]"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`ms-btn px-5 py-2 text-[15px] ${
              tone === "danger" ? "ms-btn-red" : "ms-btn-accent"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * window.confirm's shape, with the game's dialog behind it: `await
 * confirm({…})` resolves true or false, so a caller reads exactly like the
 * blocking one it replaces —
 *
 *     if (!(await confirm({ title: "Discard unsaved changes?" }))) return;
 *
 * The caller renders `dialog` somewhere that is not inside a `ui-zoom`
 * wrapper; it is null while nothing is being asked. A second ask while one
 * is open answers the first one no, so a queue can never build up.
 */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [ask, setAsk] = useState<ConfirmOptions | null>(null);
  // the pending answer lives in a ref rather than in state: resolving is a
  // side effect, and a state updater can be run twice (StrictMode)
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        pending.current?.(false);
        pending.current = resolve;
        setAsk(options);
      }),
    [],
  );

  const answer = useCallback((ok: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setAsk(null);
    resolve?.(ok);
  }, []);

  const dialog = ask ? (
    <ConfirmDialog
      {...ask}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  ) : null;

  return { confirm, dialog };
}
