"use client";

import { useEffect } from "react";

/**
 * Aggressively force the page to start at the top.
 *
 * Why one mount-effect isn't enough:
 *  - Mobile Safari (and Chrome on iOS) use bfcache: when the user
 *    navigates back/forward, the page is restored from cache with
 *    its prior scroll position. React's mount effect doesn't fire
 *    because the component was never unmounted.
 *  - Next.js App Router has its own scroll restoration that runs
 *    AFTER our mount effect, so a scrollTo inside useEffect can be
 *    overridden a tick later.
 *  - Long pages render their tail content asynchronously (e.g. the
 *    leads table fills in after a fetch). Browsers can keep the
 *    scroll position constant relative to the bottom of the page,
 *    leaving the user mid-scroll.
 *
 * This component:
 *  - Disables `history.scrollRestoration` so the browser stops
 *    restoring scroll on its own.
 *  - Scrolls to top on mount.
 *  - Re-scrolls to top on the `pageshow` event (fires on bfcache
 *    restore as well as initial load).
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

    const goTop = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    // Initial mount.
    goTop();
    // After paint — covers the case where the layout grows after
    // first render and the browser silently re-anchors.
    requestAnimationFrame(goTop);

    // bfcache restore on mobile.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) goTop();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}
