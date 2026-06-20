"use client";

import { motion } from "framer-motion";

// Fixed (non-random) so SSR and client markup match — no hydration mismatch.
const ORBS = [
  { x: "6%", y: "10%", c: "var(--brand)", s: "28rem", d: 20 },
  { x: "76%", y: "6%", c: "var(--brand-2)", s: "24rem", d: 24 },
  { x: "58%", y: "70%", c: "var(--sebi)", s: "26rem", d: 28 },
  { x: "20%", y: "78%", c: "var(--accent)", s: "20rem", d: 32 },
];
const PARTICLES = [
  { left: "12%", size: 3, delay: 0, dur: 9 },
  { left: "23%", size: 2, delay: 3, dur: 12 },
  { left: "34%", size: 4, delay: 6, dur: 10 },
  { left: "47%", size: 2, delay: 1.5, dur: 13 },
  { left: "58%", size: 3, delay: 4.5, dur: 11 },
  { left: "69%", size: 2, delay: 2, dur: 14 },
  { left: "78%", size: 4, delay: 7, dur: 9 },
  { left: "88%", size: 2, delay: 5, dur: 12 },
  { left: "94%", size: 3, delay: 8, dur: 10 },
];

/** Layered ambient backdrop: animated aurora + panning grid + a slow rotating
 *  colour sheen + drifting orbs + rising particles. Decorative, behind content. */
export function AnimatedBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 aurora" />
      <div className="absolute inset-0 bg-grid" />

      {/* slow rotating colour sheen */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2 opacity-[0.06]"
        style={{ background: "conic-gradient(from 0deg, rgb(var(--brand)), rgb(var(--brand-2)), rgb(var(--accent)), rgb(var(--sebi)), rgb(var(--brand)))" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 70, repeat: Infinity, ease: "linear" }}
      />

      {/* drifting orbs */}
      {ORBS.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ left: o.x, top: o.y, width: o.s, height: o.s, background: `radial-gradient(circle, rgb(${o.c} / 0.18), transparent 70%)` }}
          animate={{ x: [0, 36, -24, 0], y: [0, -28, 18, 0], scale: [1, 1.1, 0.95, 1] }}
          transition={{ duration: o.d, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* rising particles */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="particle"
          style={{ left: p.left, bottom: "20%", width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }}
        />
      ))}
    </div>
  );
}
