"use client";

import { motion } from "framer-motion";

/** Layered ambient backdrop: aurora wash + animated grid + drifting orbs.
 *  Purely decorative, sits behind all content. Works in both themes. */
export function AnimatedBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 aurora opacity-80" />
      <div className="absolute inset-0 bg-grid" />
      {[
        { x: "8%", y: "12%", c: "var(--brand)", d: 18 },
        { x: "78%", y: "8%", c: "var(--brand-2)", d: 22 },
        { x: "60%", y: "75%", c: "var(--sebi)", d: 26 },
      ].map((o, i) => (
        <motion.div
          key={i}
          className="absolute h-[26rem] w-[26rem] rounded-full"
          style={{
            left: o.x,
            top: o.y,
            background: `radial-gradient(circle, rgb(${o.c} / 0.16), transparent 70%)`,
          }}
          animate={{ x: [0, 30, -20, 0], y: [0, -25, 15, 0] }}
          transition={{ duration: o.d, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
