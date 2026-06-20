"use client";

import { motion } from "framer-motion";
import { cn, riskTone, verdictTone } from "@/lib/utils";

const TONE_CLASS: Record<string, string> = {
  ok: "text-ok border-ok/40 bg-ok/10",
  warn: "text-warn border-warn/40 bg-warn/10",
  danger: "text-danger border-danger/40 bg-danger/10",
  muted: "text-muted border-border bg-surface-2",
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", TONE_CLASS[verdictTone(verdict)])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {verdict}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  if (!risk || risk === "None") return null;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", TONE_CLASS[riskTone(risk)])}>
      {risk}
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.8 ? "ok" : value >= 0.6 ? "warn" : "danger";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className={cn("h-full rounded-full", tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-danger")}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className="text-xs font-medium text-muted">{pct}% confidence</span>
    </div>
  );
}

export function RiskDial({ score, label }: { score: number; label: string }) {
  // score 0..100
  const r = 52;
  const circ = 2 * Math.PI * r;
  const tone = score >= 67 ? "var(--danger)" : score >= 34 ? "var(--warn)" : "var(--ok)";
  return (
    <div className="relative grid place-items-center">
      <svg width={132} height={132} className="-rotate-90">
        <circle cx={66} cy={66} r={r} fill="none" stroke="rgb(var(--surface-2))" strokeWidth={10} />
        <motion.circle
          cx={66}
          cy={66}
          r={r}
          fill="none"
          stroke={`rgb(${tone})`}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (score / 100) * circ }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 8px rgb(${tone} / 0.6))` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums">{score}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
      </div>
    </div>
  );
}

export function Stat({ value, label, tone = "fg" }: { value: string | number; label: string; tone?: string }) {
  const color = tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg";
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4">
      <div className={cn("text-2xl font-bold tabular-nums", color)}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
