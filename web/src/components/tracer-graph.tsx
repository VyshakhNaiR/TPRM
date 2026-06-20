"use client";

import { motion } from "framer-motion";
import type { Control, Framework, Verdict } from "@/data/types";
import { FRAMEWORK_VAR, RELATIONSHIP_LABEL } from "@/lib/utils";

/**
 * SIGNATURE VISUAL — live regulatory auto-mapping.
 * A vendor's control answer (left) propagates along animated "tracer" beams
 * to the MAS / RBI / SEBI clause nodes (right), which light up by coverage.
 */
export function TracerGraph({
  control,
  frameworks,
  verdict,
  active,
}: {
  control: Control;
  frameworks: Framework[];
  verdict?: Verdict;
  active: boolean; // true once adjudicated -> beams flow + nodes colour
}) {
  const clauseById = (id: string) =>
    frameworks.flatMap((f) => f.clauses).find((c) => c.id === id);

  const W = 920;
  const rowH = 64;
  const topPad = 28;
  const H = topPad * 2 + Math.max(control.mappings.length, 1) * rowH;
  const leftX = 196;
  const rightX = 678;
  const cy = H / 2;

  const tone =
    verdict === "Compliant"
      ? "var(--ok)"
      : verdict === "Non-Compliant"
      ? "var(--danger)"
      : "var(--muted)";

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[680px]" style={{ height: H }}>
        <defs>
          {frameworks.map((f) => (
            <linearGradient key={f.id} id={`beam-${f.id}`} x1="0" x2="1">
              <stop offset="0%" stopColor={`rgb(var(--${FRAMEWORK_VAR[f.id]}))`} stopOpacity="0.15" />
              <stop offset="100%" stopColor={`rgb(var(--${FRAMEWORK_VAR[f.id]}))`} stopOpacity="0.95" />
            </linearGradient>
          ))}
        </defs>

        {/* Beams */}
        {control.mappings.map((m, i) => {
          const y = topPad + i * rowH + rowH / 2;
          const path = `M ${leftX} ${cy} C ${(leftX + rightX) / 2} ${cy}, ${(leftX + rightX) / 2} ${y}, ${rightX} ${y}`;
          return (
            <g key={m.clauseId + i}>
              <path d={path} fill="none" stroke="rgb(var(--border))" strokeWidth={2} />
              {active && (
                <motion.path
                  d={path}
                  fill="none"
                  stroke={`url(#beam-${m.framework})`}
                  strokeWidth={2.5}
                  className="tracer"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.7, delay: 0.15 * i, ease: "easeOut" }}
                />
              )}
            </g>
          );
        })}

        {/* Left node — the control / vendor answer */}
        <motion.g
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 22 }}
        >
          <rect
            x={20}
            y={cy - 34}
            rx={14}
            width={168}
            height={68}
            fill="rgb(var(--surface))"
            stroke={active ? tone : "rgb(var(--border))"}
            strokeWidth={active ? 2 : 1.5}
            style={{ filter: active ? `drop-shadow(0 0 14px ${tone})` : "none" }}
          />
          <text x={36} y={cy - 12} fontSize={11} fill="rgb(var(--muted))" fontFamily="var(--font-mono)">
            {control.id}
          </text>
          <text x={36} y={cy + 8} fontSize={13} fill="rgb(var(--fg))" fontWeight={600}>
            {control.family.length > 20 ? control.family.slice(0, 19) + "…" : control.family}
          </text>
          <text x={36} y={cy + 25} fontSize={11} fill={active ? tone : "rgb(var(--muted))"} fontWeight={600}>
            {active ? verdict ?? "Assessed" : "Awaiting AI"}
          </text>
          {active && (
            <circle cx={180} cy={cy} r={5} fill={tone}>
              <animate attributeName="r" values="5;8;5" dur="1.8s" repeatCount="indefinite" />
            </circle>
          )}
        </motion.g>

        {/* Right nodes — regulatory clauses */}
        {control.mappings.map((m, i) => {
          const y = topPad + i * rowH + rowH / 2;
          const clause = clauseById(m.clauseId);
          const fvar = FRAMEWORK_VAR[m.framework];
          const lit = active;
          const covered = verdict === "Compliant";
          return (
            <motion.g
              key={m.clauseId}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: lit ? 1 : 0.55, x: 0 }}
              transition={{ delay: 0.2 + 0.15 * i, type: "spring", stiffness: 200, damping: 22 }}
            >
              <circle cx={rightX} cy={y} r={6} fill={`rgb(var(--${fvar}))`} />
              <rect
                x={rightX + 16}
                y={y - 24}
                rx={11}
                width={214}
                height={48}
                fill="rgb(var(--surface))"
                stroke={lit ? `rgb(var(--${fvar}))` : "rgb(var(--border))"}
                strokeWidth={lit ? 1.6 : 1}
                style={{ filter: lit ? `drop-shadow(0 0 10px rgb(var(--${fvar}) / 0.5))` : "none" }}
              />
              <text x={rightX + 28} y={y - 7} fontSize={10.5} fontFamily="var(--font-mono)" fill={`rgb(var(--${fvar}))`} fontWeight={700}>
                {m.framework} · {m.clauseId}
              </text>
              <text x={rightX + 28} y={y + 9} fontSize={11} fill="rgb(var(--fg))">
                {(clause?.title ?? "").slice(0, 30)}
              </text>
              <text x={rightX + 28} y={y + 22} fontSize={9.5} fill="rgb(var(--muted))">
                {RELATIONSHIP_LABEL[m.relationship]}
                {lit ? ` · ${covered ? "covered" : "gap"}` : ""}
              </text>
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
