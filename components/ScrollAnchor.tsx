"use client";

import { useEffect } from "react";

/**
 * Scroll-to-top watchdog.
 *
 * The dashboard kept landing the user mid-table on entry, even after
 * we disabled CSS scroll-anchoring, set scrollRestoration to manual
 * via a beforeInteractive script, and removed an offending autoFocus
 * on inline-edit inputs. Something else still scrolls — most likely
 * a browser focus-restore for a previously-focused form field, or
 * some interaction we can't identify by static analysis.
 *
 * This component is the nuclear option: for the first 2 seconds
 * after mount, it watches scroll position and snaps it back to 0
 * UNLESS the user has shown intent to scroll (wheel / touchstart /
 * keydown / mousedown). After 2s it disengages and the page behaves
 * normally.
 *
 * Trade-off: if a user scrolls within the first 2s of page load we
 * still ignore it. But humans don't usually scroll in that window;
 * they're reading what just rendered.
 */
const WATCHDOG_DURATION_MS = 2000;

export default function ScrollAnchor() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch {
      // ignore
    }

    let userIntent = false;
    let active = true;

    const goTop = () => {
      if (!active || userIntent) return;
      if (window.scrollY !== 0 || window.pageYOffset !== 0) {
        window.scrollTo(0, 0);
      }
    };

    const markUser = () => {
      userIntent = true;
    };

    const intentEvents: (keyof WindowEventMap)[] = [
      "wheel",
      "touchstart",
      "keydown",
      "mousedown",
    ];
    intentEvents.forEach((evt) => {
      window.addEventListener(evt, markUser, { passive: true } as AddEventListenerOptions);
    });

    // Snap back on every scroll AND on a micro-tick. The tick catches
    // programmatic scrolls (focus restore, etc.) that don't fire all
    // the events we listen to.
    const onScroll = () => goTop();
    window.addEventListener("scroll", onScroll, { passive: true });

    goTop();
    requestAnimationFrame(goTop);
    const tick = setInterval(goTop, 50);

    const disengage = setTimeout(() => {
      active = false;
      clearInterval(tick);
      window.removeEventListener("scroll", onScroll);
    }, WATCHDOG_DURATION_MS);

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        userIntent = false;
        active = true;
        goTop();
      }
    };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      active = false;
      clearInterval(tick);
      clearTimeout(disengage);
      intentEvents.forEach((evt) => window.removeEventListener(evt, markUser));
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
