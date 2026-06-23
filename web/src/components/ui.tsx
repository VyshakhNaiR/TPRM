"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, RefreshCw, X } from "lucide-react";
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
  // score: HIGHER IS BETTER (90+ = good posture) — green at the top, red at the bottom.
  const tone = score >= 67 ? "var(--ok)" : score >= 34 ? "var(--warn)" : "var(--danger)";
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

/* ---------------------------------------------------------------- */
/* Toast — lightweight per-page notifications (no provider needed)   */
/* ---------------------------------------------------------------- */

export type ToastKind = "error" | "success" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

let toastSeq = 0;

/**
 * Minimal toast state owned by the page. Returns the live list plus
 * helpers. Pair with <Toaster toasts={...} onDismiss={...} />.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message: string, kind: ToastKind = "error") => {
      const id = ++toastSeq;
      setToasts((t) => [...t, { id, kind, message }]);
      const ttl = kind === "error" ? 6000 : 3500;
      setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss]
  );

  const error = useCallback((message: string) => push(message, "error"), [push]);
  const success = useCallback((message: string) => push(message, "success"), [push]);

  return { toasts, push, error, success, dismiss };
}

const TOAST_TONE: Record<ToastKind, string> = {
  error: "border-danger/50 bg-danger/10 text-danger",
  success: "border-ok/50 bg-ok/10 text-ok",
  info: "border-border bg-surface-2 text-fg",
};

export function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
      role="region"
      aria-live="assertive"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = t.kind === "success" ? CheckCircle2 : AlertTriangle;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "glass pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm shadow-glow-sm",
                TOAST_TONE[t.kind]
              )}
              role="alert"
            >
              <Icon size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1 text-fg">{t.message}</span>
              <button
                onClick={() => onDismiss(t.id)}
                className="shrink-0 rounded-md p-0.5 text-muted hover:text-fg"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* ErrorState — full-screen load failure with a Retry button        */
/* ---------------------------------------------------------------- */

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="glass max-w-md rounded-2xl p-8 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full border border-danger/40 bg-danger/10 text-danger">
          <AlertTriangle size={22} />
        </div>
        <h2 className="text-base font-semibold">Something went wrong</h2>
        <p className="mt-1 text-sm text-muted">{message}</p>
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110"
        >
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    </main>
  );
}

/** Pull a human-readable message out of a failed fetch Response. */
export async function errorMessage(res: Response, fallback = "Request failed."): Promise<string> {
  try {
    const data = await res.clone().json();
    if (data && typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    /* not JSON — fall through */
  }
  return `${fallback} (${res.status})`;
}
