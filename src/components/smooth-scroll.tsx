"use client";

import Lenis from "lenis";
import { useEffect } from "react";

/** Eased wheel scrolling for the whole site. Skipped when the visitor asks for less motion. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, lerp: 0.11 });
    return () => lenis.destroy();
  }, []);
  return null;
}
