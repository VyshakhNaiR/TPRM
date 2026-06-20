"use client";

import { motion } from "framer-motion";
import { BackgroundMarquee } from "./background-marquee";

// Fixed (non-random) so SSR and client markup match — no hydration mismatch.
const ORBS = [
  { x: "6%", y: "10%", c: "var(--brand)", s: "28rem", d: 20 },
  { x: "76%", y: "6%", c: "var(--brand-2)", s: "24rem", d: 24 },
  { x: "58%", y: "70%", c: "var(--sebi)", s: "26rem", d: 28 },
  { x: "20%", y: "78%", c: "var(--accent)", s: "20rem", d: 32 },
];

/** Layered ambient backdrop: animated aurora + panning grid + drifting orbs +
 *  a kinetic-typography marquee of NI services/keywords. Behind all content. */
export function AnimatedBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 aurora" />
      <div className="absolute inset-0 bg-grid" />

      {/* drifting orbs (soft depth) */}
      {ORBS.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ left: o.x, top: o.y, width: o.s, height: o.s, background: `radial-gradient(circle, rgb(${o.c} / 0.16), transparent 70%)` }}
          animate={{ x: [0, 36, -24, 0], y: [0, -28, 18, 0], scale: [1, 1.1, 0.95, 1] }}
          transition={{ duration: o.d, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* kinetic typography marquee */}
      <BackgroundMarquee />
    </div>
  );
}
