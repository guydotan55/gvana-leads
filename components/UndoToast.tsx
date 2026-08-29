"use client";

/**
 * UndoToast — bottom-start (RTL = bottom-right) ephemeral toast used to
 * surface optimistic actions with a chance to undo. After `duration` ms
 * without an undo click, `onCommit` fires; clicking "בטל" cancels the
 * timer and fires `onUndo` instead.
 *
 * The toast deliberately replaces an "Are you sure?" modal:
 * forgiveness-by-default per the UX prime directives. The action
 * happens optimistically in the parent; this component just owns the
 * countdown UI and the commit/cancel decision.
 */

import { useEffect, useRef, useState } from "react";

interface UndoToastProps {
  message: string;
  undoLabel?: string;
  duration?: number;
  onUndo: () => void;
  onCommit: () => void;
}

export default function UndoToast({
  message,
  undoLabel = "בטל",
  duration = 8000,
  onUndo,
  onCommit,
}: UndoToastProps) {
  const committedRef = useRef(false);
  const [remaining, setRemaining] = useState(duration);

  useEffect(() => {
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setRemaining(Math.max(0, duration - elapsed));
    }, 100);

    const timer = setTimeout(() => {
      committedRef.current = true;
      onCommit();
    }, duration);

    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
    // Intentionally only depend on duration — onCommit identity may
    // change but we want the timer pinned to the initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  function handleUndo() {
    if (committedRef.current) return;
    committedRef.current = true;
    onUndo();
  }

  // Progress fraction 0..1 of time remaining
  const progress = Math.max(0, Math.min(1, remaining / duration));

  return (
    <div
      className="fixed bottom-4 start-4 z-50 max-w-[calc(100%-2rem)] pb-[env(safe-area-inset-bottom)]"
      role="status"
      aria-live="polite"
    >
      <div className="relative overflow-hidden rounded-xl bg-gray-900 text-white shadow-2xl ring-1 ring-black/10 min-w-[260px]">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-sm font-medium leading-snug flex-1">{message}</span>
          <button
            type="button"
            onClick={handleUndo}
            className="inline-flex items-center justify-center min-w-[48px] min-h-[48px] px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-white/10 hover:bg-white/20 transition-colors"
          >
            {undoLabel}
          </button>
        </div>
        {/* Countdown bar — visual cue that the action is about to commit */}
        <div
          className="absolute bottom-0 start-0 h-[3px] bg-amber-400/90"
          style={{ width: `${progress * 100}%`, transition: "width 100ms linear" }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
