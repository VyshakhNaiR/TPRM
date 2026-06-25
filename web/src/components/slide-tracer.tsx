"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * SlideTracer — a luminous segment that runs clockwise around the BORDER of
 * the parent card. Implemented as an absolutely-positioned SVG <rect> overlay
 * sized to the parent via ResizeObserver, animated with strokeDasharray +
 * strokeDashoffset. Respects prefers-reduced-motion (motion disabled).
 *
 * Drop inside a `position: relative` container. It fills the container,
 * is pointer-events-none, and renders behind the content (negative z).
 */
export function SlideTracer({
  radius = 16,
  inset = 1,
  duration = 8,
  className,
}: {
  /** corner radius in px — match the card's rounded-* */
  radius?: number;
  /** stroke inset from the edge in px */
  inset?: number;
  /** seconds per full lap */
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = size.w;
  const h = size.h;
  const ready = w > 0 && h > 0;

  // Perimeter of a rounded rect (approx): straight runs + 4 quarter-arcs.
  const sw = Math.max(0, w - inset * 2);
  const sh = Math.max(0, h - inset * 2);
  const r = Math.min(radius, sw / 2, sh / 2);
  const perimeter =
    2 * (sw - 2 * r) + 2 * (sh - 2 * r) + 2 * Math.PI * r;

  // The glowing comet is a short lit segment chased by a long gap.
  const lit = Math.max(70, perimeter * 0.16);
  const gap = Math.max(0, perimeter - lit);

  return (
    <div
      ref={ref}
      aria-hidden
      className={
        "pointer-events-none absolute inset-0 z-0 overflow-visible " +
        (className ?? "")
      }
    >
      {ready && (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          className="absolute inset-0"
          fill="none"
        >
          {/* faint always-on rail so the frame reads even with motion off */}
          <rect
            x={inset}
            y={inset}
            width={sw}
            height={sh}
            rx={r}
            ry={r}
            stroke="rgb(var(--brand) / 0.18)"
            strokeWidth={1.25}
          />
          {reduce ? (
            // Reduced motion: a static soft glow on the border, no travel.
            <rect
              x={inset}
              y={inset}
              width={sw}
              height={sh}
              rx={r}
              ry={r}
              stroke="rgb(var(--brand) / 0.45)"
              strokeWidth={1.5}
              style={{ filter: "drop-shadow(0 0 6px rgb(var(--brand) / 0.5))" }}
            />
          ) : (
            <motion.rect
              x={inset}
              y={inset}
              width={sw}
              height={sh}
              rx={r}
              ry={r}
              stroke="rgb(var(--brand))"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={`${lit} ${gap}`}
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: -perimeter }}
              transition={{ duration, ease: "linear", repeat: Infinity }}
              style={{
                filter:
                  "drop-shadow(0 0 5px rgb(var(--brand) / 0.9)) drop-shadow(0 0 12px rgb(var(--brand) / 0.55))",
              }}
            />
          )}
        </svg>
      )}
    </div>
  );
}
