"use client";

import { useEffect, useState } from "react";

/**
 * Floating "back to top" button. Hidden by default; appears once the
 * page is scrolled past `threshold` pixels. Clicking smooth-scrolls
 * to the top. Hides on prefers-reduced-motion → instant scroll.
 */
export default function BackToTop({ threshold = 320 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > threshold);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  function scrollUp() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      onClick={scrollUp}
      aria-label="חזרה לראש העמוד"
      title="חזרה לראש העמוד"
      style={{
        position: "fixed",
        insetInlineEnd: "calc(env(safe-area-inset-right, 0px) + 16px)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        zIndex: 50,
        width: 44,
        height: 44,
        borderRadius: 22,
        border: "none",
        background: "var(--brand-primary, #1d2752)",
        color: "white",
        boxShadow: "0 6px 20px rgba(0,0,0,.18)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: visible ? 1 : 0,
        transform: `translateY(${visible ? 0 : 16}px)`,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity .2s ease, transform .2s ease",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}
