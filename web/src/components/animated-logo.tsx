"use client";

import { useId } from "react";

type Variant = "full" | "mark";

const ARCH = "M 40,118 C 40,44 128,44 128,118";
const STEM = "M 152,118 L 152,72";

/**
 * Network Intelligence "ni" logo — refined "living" animation.
 * - soft bloom on entrance
 * - the crimson->purple gradient gently shimmers (slow tilt), so the colour feels alive
 * - a breathing glow aura behind the mark
 * - a slow specular glint sweeps across every few seconds (light catching glass)
 * - the gold "i" dot quietly breathes
 * No literal "segments travelling down the stroke". Theme-aware.
 *
 * Faithful vector recreation; swap in the official vector for pixel accuracy.
 */
export function AnimatedLogo({
  width = 200,
  variant = "full",
  className,
}: {
  width?: number;
  variant?: Variant;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const full = variant === "full";
  const vbH = full ? 210 : 132;
  const g = (s: string) => `${s}-${uid}`;

  return (
    <svg
      viewBox={`0 0 200 ${vbH}`}
      width={width}
      height={(width * vbH) / 200}
      className={className}
      role="img"
      aria-label="Network Intelligence"
    >
      <defs>
        {/* brand gradient that gently shimmers via a slow tilt */}
        <linearGradient id={g("grad")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#b01e4f" />
          <stop offset="52%" stopColor="#8e2c7a" />
          <stop offset="100%" stopColor="#5b2a8c" />
          <animateTransform
            attributeName="gradientTransform"
            type="rotate"
            values="-6 0.5 0.5; 6 0.5 0.5; -6 0.5 0.5"
            dur="7s"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0;0.5;1"
            keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"
          />
        </linearGradient>

        {/* moving specular band — a quick glint then a long pause */}
        <linearGradient id={g("sheen")} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="46" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            values="-70 0; 210 0; 210 0"
            keyTimes="0; 0.3; 1"
            dur="6s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.5 0 0.2 1; 0 0 1 1"
          />
        </linearGradient>

        <filter id={g("aura")} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <radialGradient id={g("dotrad")}>
          <stop offset="0%" stopColor="#F4C20D" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#F4C20D" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#F4C20D" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g className="ni-enter">
        {/* breathing glow aura */}
        <g className="ni-aura" filter={`url(#${g("aura")})`}>
          <path d={ARCH} fill="none" stroke={`url(#${g("grad")})`} strokeWidth={21} strokeLinecap="round" />
          <path d={STEM} fill="none" stroke="#5b2a8c" strokeWidth={21} strokeLinecap="round" />
        </g>

        {/* base monogram */}
        <path d={ARCH} fill="none" stroke={`url(#${g("grad")})`} strokeWidth={21} strokeLinecap="round" />
        <path d={STEM} fill="none" stroke="#5b2a8c" strokeWidth={21} strokeLinecap="round" />

        {/* specular glint, masked to the mark shape */}
        <path d={ARCH} fill="none" stroke={`url(#${g("sheen")})`} strokeWidth={21} strokeLinecap="round" />
        <path d={STEM} fill="none" stroke={`url(#${g("sheen")})`} strokeWidth={21} strokeLinecap="round" />

        {/* "i" dot — radiating cube: pulsing glow + emanating rings + breathing core */}
        <circle className="ni-dotpulse" cx={152} cy={50} r={26} fill={`url(#${g("dotrad")})`} />
        <rect className="ni-radiate" x={142} y={40} width={20} height={20} rx={3} fill="none" stroke="#F4C20D" strokeWidth={2} />
        <rect className="ni-radiate d2" x={142} y={40} width={20} height={20} rx={3} fill="none" stroke="#F4C20D" strokeWidth={2} />
        <rect className="ni-dot" x={142} y={40} width={20} height={20} rx={3} fill="#F4C20D" />

        {full && (
          <>
            <text
              x={100}
              y={158}
              textAnchor="middle"
              className="ni-word fill-fg"
              style={{ fontWeight: 800, fontSize: 30, letterSpacing: 4, animationDelay: "0.4s" }}
            >
              NETWORK
            </text>
            <text
              x={100}
              y={184}
              textAnchor="middle"
              className="ni-word fill-fg"
              style={{ fontWeight: 500, fontSize: 18.5, letterSpacing: 3, animationDelay: "0.55s" }}
            >
              INTELLIGENCE
            </text>
          </>
        )}
      </g>
    </svg>
  );
}

/** Horizontal lockup for headers: animated mark + stacked wordmark text. */
export function LogoLockup({ markWidth = 42, className }: { markWidth?: number; className?: string }) {
  return (
    <div className={"flex items-center gap-2.5 " + (className ?? "")}>
      <AnimatedLogo width={markWidth} variant="mark" />
      <div className="leading-tight">
        <div className="text-[13px] font-extrabold tracking-wide">
          NETWORK <span className="text-brand">INTELLIGENCE</span>
        </div>
        <div className="text-[9.5px] font-medium uppercase tracking-[0.25em] text-muted">
          TPRM Platform
        </div>
      </div>
    </div>
  );
}
