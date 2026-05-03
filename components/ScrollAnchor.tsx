"use client";

import { useEffect } from "react";

/**
 * Force the page to start at the top, robustly.
 *
 * Why a single useEffect scrollTo isn't enough:
 *  - Browser CSS scroll-anchoring can pin the user to an element
 *    when content reflows (the leads table fills in 200ms after
 *    first paint, and the browser tries to "preserve their place").
 *  - Browser scroll restoration restores prior scroll on refresh /
 *    back-nav. Setting `scrollRestoration = "manual"` inside a React
 *    effect runs AFTER the browser already restored.
 *  - Mobile Safari's bfcache restores both DOM and scroll without
 *    re-running mount effects.
 *
 * Defense:
 *  - The dashboard layout sets `scrollRestoration = "manual"` and
 *    `scrollTo(0,0)` from an inline `beforeInteractive` script — that
 *    handles the initial paint case before React even hydrates.
 *  - This component takes over after hydration: scroll once on mount,
 *    once on the next animation frame, then a few times over the
 *    next second to outlast layout reflow when the leads table
 *    renders. Stops after 1.2s so we don't fight a deliberate user
 *    scroll.
 *  - `pageshow` listener handles bfcache restore.
 */
export default function ScrollAnchor() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch {
      // some embedded contexts disallow this; ignore
    }

    const goTop = () => window.scrollTo(0, 0);

    // Mount + next paint.
    goTop();
    const raf = requestAnimationFrame(goTop);

    // Brute-force across the first ~1s. Covers the case where the
    // leads-table fetch resolves AFTER mount and shifts layout, and
    // the browser's scroll-anchoring tries to keep the user "in place".
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const ms of [50, 150, 350, 700, 1200]) {
      timers.push(setTimeout(goTop, ms));
    }

    // bfcache restore on mobile back-nav.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) goTop();
    };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
