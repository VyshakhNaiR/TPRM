"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import * as XLSX from "xlsx";
import {
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Download,
  FileSpreadsheet,
  Inbox,
  Loader2,
  LogOut,
  Printer,
  X,
} from "lucide-react";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  VerdictBadge,
  Stat,
  Toaster,
  ErrorState,
  errorMessage,
  useToasts,
} from "@/components/ui";
import { cn, FRAMEWORK_VAR } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Types (mirror the /api/customer payloads)                           */
/* ------------------------------------------------------------------ */

interface CustomerRow {
  vendorId: string;
  name: string;
  tier: string;
  posture: number;
  rating: string;
  compliant: number;
  nc: number;
  na: number;
  total: number;
  regulators: string[];
  initiatedAt: string;
  nextDueAt: string;
  overdue: boolean;
}

type Verdict = "Compliant" | "Non-Compliant" | "Not Applicable";

interface RequirementDetail {
  id: string;
  family: string;
  question: string;
  verdict: Verdict;
  frameworks: string[];
}

interface DetailPayload {
  vendor: CustomerRow | null;
  controls: RequirementDetail[];
}

type SortKey = "name" | "tier" | "posture" | "nextDueAt";
type SortDir = "asc" | "desc";

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                 */
/* ------------------------------------------------------------------ */

const TIER_RANK: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
  Unrated: 0,
};

const TIER_TONE: Record<string, string> = {
  Critical: "text-danger border-danger/40 bg-danger/10",
  High: "text-warn border-warn/40 bg-warn/10",
  Medium: "text-brand border-brand/40 bg-brand/10",
  Low: "text-muted border-border bg-surface-2",
  Unrated: "text-muted border-border bg-surface-2",
};

const RATING_TONE: Record<string, string> = {
  Good: "text-ok",
  Satisfactory: "text-ok",
  "Needs Improvement": "text-warn",
  Unsatisfactory: "text-danger",
  Unrated: "text-muted",
};

const DUE_SOON_DAYS = 60;
const DAY_MS = 86_400_000;

function fmtDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Math.ceil((t - Date.now()) / DAY_MS);
}

function postureTone(pct: number): string {
  return pct >= 75 ? "bg-ok" : pct >= 50 ? "bg-warn" : "bg-danger";
}

/* ------------------------------------------------------------------ */
/* Chart helpers                                                       */
/* ------------------------------------------------------------------ */

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutArc(cx: number, cy: number, ro: number, ri: number, s: number, e: number) {
  const p1 = polarToCartesian(cx, cy, ro, s);
  const p2 = polarToCartesian(cx, cy, ro, e);
  const p3 = polarToCartesian(cx, cy, ri, e);
  const p4 = polarToCartesian(cx, cy, ri, s);
  const lg = e - s > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${ro} ${ro} 0 ${lg} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${ri} ${ri} 0 ${lg} 0 ${p4.x} ${p4.y} Z`;
}

const STATUS_SEGMENTS = [
  { label: "Good / Satisfactory", cssVar: "ok", match: (r: string) => r === "Good" || r === "Satisfactory" },
  { label: "Needs Improvement",   cssVar: "warn",   match: (r: string) => r === "Needs Improvement" },
  { label: "Unsatisfactory",      cssVar: "danger",  match: (r: string) => r === "Unsatisfactory" },
  { label: "Unrated",             cssVar: "muted",   match: (r: string) => !["Good","Satisfactory","Needs Improvement","Unsatisfactory"].includes(r) },
];

const TIER_BARS = [
  { label: "Critical", cssVar: "danger" },
  { label: "High",     cssVar: "warn"   },
  { label: "Medium",   cssVar: "brand"  },
  { label: "Low",      cssVar: "ok"     },
  { label: "Unrated",  cssVar: "muted"  },
];

function ComplianceDonut({ rows }: { rows: CustomerRow[] }) {
  const total = rows.length;
  const [hovered, setHovered] = useState<number | null>(null);
  const buckets = STATUS_SEGMENTS.map((s) => ({ ...s, count: rows.filter((r) => s.match(r.rating)).length })).filter((b) => b.count > 0);

  let angle = 0;
  const segments = buckets.map((b) => {
    const span = (b.count / total) * 358;
    const seg = { ...b, start: angle, end: angle + span };
    angle += span + (360 - 358) / (buckets.length || 1);
    return seg;
  });

  const hov = hovered !== null ? segments[hovered] : null;

  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="mb-4 text-sm font-semibold">Compliance Status</h3>
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width={120} height={120} viewBox="0 0 120 120">
            {segments.map((seg, i) => (
              <motion.path
                key={i}
                d={donutArc(60, 60, 52, 32, seg.start, seg.end)}
                style={{ fill: `rgb(var(--${seg.cssVar}))`, transformOrigin: "60px 60px", cursor: "pointer" }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: hovered === i ? 1.06 : 1, opacity: hovered === i ? 1 : 0.85 }}
                transition={{ scale: { duration: 0.15 }, opacity: { duration: 0.5, delay: i * 0.1 } }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
            <text x="60" y="56" textAnchor="middle" style={{ fontSize: 22, fontWeight: 700, fill: "rgb(var(--fg))", pointerEvents: "none" }}>{total}</text>
            <text x="60" y="70" textAnchor="middle" style={{ fontSize: 10, fill: "rgb(var(--muted))", pointerEvents: "none" }}>vendors</text>
          </svg>
          {hov && (
            <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1 text-center shadow-glow-sm">
              <div className="text-xs font-bold" style={{ color: `rgb(var(--${hov.cssVar}))` }}>{hov.count}</div>
              <div className="text-[10px] text-muted">{Math.round((hov.count / total) * 100)}%</div>
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2.5">
          {buckets.map((b, i) => (
            <motion.div
              key={i}
              className="flex cursor-default items-center gap-2 rounded-lg px-1.5 py-1 transition"
              style={{ background: hovered === i ? `rgb(var(--${b.cssVar}) / 0.08)` : "transparent" }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `rgb(var(--${b.cssVar}))` }} />
              <span className="flex-1 text-xs text-muted">{b.label}</span>
              <span className="text-xs font-bold tabular-nums">{b.count}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CriticalityBars({ rows }: { rows: CustomerRow[] }) {
  const tiers = TIER_BARS.map((t) => ({ ...t, count: rows.filter((r) => r.tier === t.label).length })).filter((t) => t.count > 0);
  const max = Math.max(...tiers.map((t) => t.count), 1);
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="mb-4 text-sm font-semibold">Vendor Criticality</h3>
      <div className="space-y-3.5">
        {tiers.map((t, i) => (
          <div key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: `rgb(var(--${t.cssVar}))` }}>{t.label}</span>
              <span className="text-xs font-bold tabular-nums text-muted">{t.count} vendor{t.count !== 1 ? "s" : ""}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(to right, rgb(var(--${t.cssVar}) / 0.5), rgb(var(--${t.cssVar})))`,
                  filter: hovered === i ? `drop-shadow(0 0 4px rgb(var(--${t.cssVar}) / 0.6))` : "none",
                }}
                initial={{ width: 0 }}
                animate={{ width: `${(t.count / max) * 100}%` }}
                transition={{ duration: 0.8, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small presentational bits                                           */
/* ------------------------------------------------------------------ */

function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        TIER_TONE[tier] ?? TIER_TONE.Unrated
      )}
    >
      {tier}
    </span>
  );
}

function DueBadge({ row }: { row: CustomerRow }) {
  const d = daysUntil(row.nextDueAt);
  if (row.overdue || d < 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">
        Overdue
      </span>
    );
  }
  if (d <= DUE_SOON_DAYS) {
    return (
      <span className="inline-flex items-center rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[10px] font-semibold text-warn">
        Due soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
      On track
    </span>
  );
}

function RegChips({ regulators }: { regulators: string[] }) {
  if (!regulators?.length) return <span className="text-xs text-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {regulators.map((r) => (
        <span
          key={r}
          className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            color: `rgb(var(--${FRAMEWORK_VAR[r] ?? "muted"}))`,
            borderColor: `rgb(var(--${FRAMEWORK_VAR[r] ?? "border"}) / 0.4)`,
            background: `rgb(var(--${FRAMEWORK_VAR[r] ?? "muted"}) / 0.1)`,
          }}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function PostureBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", postureTone(pct))} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-xs text-muted">{pct}%</span>
    </div>
  );
}

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (c: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === col;
  const Icon = !active ? ChevronsUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("px-3 py-2", className)}>
      <button
        onClick={() => onSort(col)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-fg",
          active ? "text-fg" : "text-muted"
        )}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <Icon size={12} className={active ? "text-brand" : "opacity-50"} />
      </button>
    </th>
  );
}

/* ------------------------------------------------------------------ */
/* Drill-down dialog                                                   */
/* ------------------------------------------------------------------ */

function DrillDown({
  detail,
  loading,
  onClose,
  onExport,
}: {
  detail: DetailPayload | null;
  loading: boolean;
  onClose: () => void;
  onExport: (d: DetailPayload) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const families = useMemo(() => {
    if (!detail) return [] as { family: string; controls: RequirementDetail[]; compliant: number; applicable: number }[];
    const map = new Map<string, RequirementDetail[]>();
    for (const c of detail.controls) {
      const arr = map.get(c.family) ?? [];
      arr.push(c);
      map.set(c.family, arr);
    }
    return Array.from(map.entries()).map(([family, controls]) => {
      const applicable = controls.filter((c) => c.verdict !== "Not Applicable").length;
      const compliant = controls.filter((c) => c.verdict === "Compliant").length;
      return { family, controls, compliant, applicable };
    });
  }, [detail]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Vendor requirement detail"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="glass flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border sm:rounded-2xl"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">{detail?.vendor?.name ?? "Vendor detail"}</h2>
              {detail?.vendor && <TierBadge tier={detail.vendor.tier} />}
            </div>
            {detail?.vendor && (
              <p className="mt-1 text-xs text-muted">
                <span className={RATING_TONE[detail.vendor.rating]}>{detail.vendor.rating}</span> · {detail.vendor.posture}% posture · {detail.vendor.compliant}/{detail.vendor.compliant + detail.vendor.nc} compliant · next due {fmtDate(detail.vendor.nextDueAt)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {detail && detail.vendor && (
              <button
                onClick={() => onExport(detail)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted hover:text-fg"
              >
                <FileSpreadsheet size={14} /> Excel
              </button>
            )}
            <button
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted hover:text-fg"
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading || !detail ? (
            <div className="grid place-items-center py-16 text-muted">
              <Loader2 className="animate-spin" />
            </div>
          ) : families.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">No requirements found for this vendor.</p>
          ) : (
            <div className="space-y-5">
              {families.map((f) => (
                <section key={f.family}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{f.family}</h3>
                    <span className="text-xs text-muted tabular-nums">
                      {f.compliant}/{f.applicable} compliant
                    </span>
                  </div>
                  <div className="space-y-2">
                    {f.controls.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-xl border border-border/60 bg-surface/40 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm">{c.question}</p>
                          <div className="shrink-0">
                            <VerdictBadge verdict={c.verdict} />
                          </div>
                        </div>
                        {c.frameworks.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {c.frameworks.map((fw) => (
                              <span
                                key={fw}
                                className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
                                style={{
                                  color: `rgb(var(--${FRAMEWORK_VAR[fw] ?? "muted"}))`,
                                  borderColor: `rgb(var(--${FRAMEWORK_VAR[fw] ?? "border"}) / 0.4)`,
                                  background: `rgb(var(--${FRAMEWORK_VAR[fw] ?? "muted"}) / 0.1)`,
                                }}
                              >
                                {fw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function CustomerPortfolio() {
  const router = useRouter();
  const { toasts, success, error, dismiss } = useToasts();

  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [sortKey, setSortKey] = useState<SortKey>("tier");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // initial load + auth gate
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError("");
      try {
        const meRes = await fetch("/api/me");
        if (!meRes.ok) throw new Error(await errorMessage(meRes, "Could not verify your session."));
        const me = await meRes.json();
        const role = me.session?.role;
        if (role !== "customer" && role !== "assessor" && role !== "root") {
          router.push("/login");
          return;
        }
        const res = await fetch("/api/customer");
        if (!res.ok) throw new Error(await errorMessage(res, "Could not load the portfolio."));
        const data = await res.json();
        if (!cancelled) setRows(Array.isArray(data.vendors) ? data.vendors : []);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load the portfolio.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, reloadKey]);

  async function logout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  const onSort = useCallback((col: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir(col === "name" ? "asc" : "desc");
      return col;
    });
  }, []);

  const sorted = useMemo(() => {
    if (!rows) return [];
    const arr = [...rows];
    const mul = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "tier":
          cmp = (TIER_RANK[a.tier] ?? 0) - (TIER_RANK[b.tier] ?? 0);
          break;
        case "posture":
          cmp = a.posture - b.posture;
          break;
        case "nextDueAt":
          cmp = (Date.parse(a.nextDueAt) || 0) - (Date.parse(b.nextDueAt) || 0);
          break;
      }
      if (cmp === 0) cmp = a.name.localeCompare(b.name);
      return cmp * mul;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const summary = useMemo(() => {
    const list = rows ?? [];
    const total = list.length;
    const critical = list.filter((r) => r.tier === "Critical").length;
    const overdue = list.filter((r) => r.overdue || daysUntil(r.nextDueAt) < 0).length;
    const avg = total ? Math.round(list.reduce((s, r) => s + r.posture, 0) / total) : 0;
    return { total, critical, overdue, avg };
  }, [rows]);

  // open drill-down
  async function openVendor(id: string) {
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/customer?vendorId=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await errorMessage(res, "Could not load vendor detail."));
      const data = (await res.json()) as DetailPayload;
      setDetail(data);
    } catch (e) {
      error(e instanceof Error ? e.message : "Could not load vendor detail.");
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDrill() {
    setOpenId(null);
    setDetail(null);
  }

  // exports
  function exportListExcel() {
    try {
      const list = sorted;
      if (!list.length) {
        error("Nothing to export.");
        return;
      }
      const ws = XLSX.utils.json_to_sheet(
        list.map((r) => ({
          Vendor: r.name,
          Criticality: r.tier,
          "Compliance status": r.rating,
          "Posture %": r.posture,
          Compliant: r.compliant,
          "Non-Compliant": r.nc,
          "Not Applicable": r.na,
          Total: r.total,
          Regulators: r.regulators.join(", ") || "—",
          "TPRM initiated": fmtDate(r.initiatedAt),
          "Next due": fmtDate(r.nextDueAt),
          Status: r.overdue ? "Overdue" : daysUntil(r.nextDueAt) <= DUE_SOON_DAYS ? "Due soon" : "On track",
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Portfolio");
      XLSX.writeFile(wb, "tprm-portfolio.xlsx");
      success("Portfolio exported to Excel.");
    } catch {
      error("Excel export failed.");
    }
  }

  function exportVendorExcel(d: DetailPayload) {
    try {
      if (!d.vendor) return;
      const wb = XLSX.utils.book_new();
      const summaryWs = XLSX.utils.json_to_sheet([
        {
          Vendor: d.vendor.name,
          Criticality: d.vendor.tier,
          "Compliance status": d.vendor.rating,
          "Posture %": d.vendor.posture,
          Compliant: d.vendor.compliant,
          "Non-Compliant": d.vendor.nc,
          "Not Applicable": d.vendor.na,
          Regulators: d.vendor.regulators.join(", ") || "—",
          "TPRM initiated": fmtDate(d.vendor.initiatedAt),
          "Next due": fmtDate(d.vendor.nextDueAt),
        },
      ]);
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
      const reqWs = XLSX.utils.json_to_sheet(
        d.controls.map((c) => ({
          Family: c.family,
          Requirement: c.question,
          Verdict: c.verdict,
          Frameworks: c.frameworks.join(", ") || "—",
        }))
      );
      XLSX.utils.book_append_sheet(wb, reqWs, "Requirements");
      const slug = d.vendor.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "vendor";
      XLSX.writeFile(wb, `tprm-${slug}.xlsx`);
      success(`${d.vendor.name} exported to Excel.`);
    } catch {
      error("Excel export failed.");
    }
  }

  function exportPdf() {
    success("Opening print dialog — choose ‘Save as PDF’.");
    setTimeout(() => window.print(), 150);
  }

  if (loadError && !rows) {
    return <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }
  if (!rows) {
    return (
      <main className="grid min-h-screen place-items-center text-muted">
        <Loader2 className="animate-spin" />
      </main>
    );
  }

  const hasVendors = rows.length > 0;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 pb-20">
      {/* HEADER — hidden in print */}
      <header className="no-print sticky top-0 z-20 -mx-5 mb-6 flex items-center justify-between border-b border-border bg-bg/70 px-5 py-3 backdrop-blur print:hidden">
        <div className="flex items-center gap-3">
          <LogoLockup markWidth={38} />
          <span className="hidden text-sm text-muted sm:inline">· Portfolio</span>
        </div>
        <div className="flex items-center gap-2">
          {hasVendors && (
            <>
              <button
                onClick={exportListExcel}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted hover:text-fg"
              >
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button
                onClick={exportPdf}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted hover:text-fg"
              >
                <Printer size={14} /> Download PDF
              </button>
            </>
          )}
          <ThemeToggle />
          <button
            onClick={logout}
            className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted hover:text-fg"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Print-only report title */}
      <div className="hidden print:block print:mb-6">
        <h1 className="text-xl font-bold">TPRM Portfolio Report</h1>
        <p className="text-sm text-muted">
          Generated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {summary.total} vendors
        </p>
      </div>

      {!hasVendors && (
        <div className="glass mt-6 flex flex-col items-center rounded-2xl p-12 text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-full border border-border bg-surface-2/60 text-muted">
            <Inbox size={22} />
          </div>
          <h2 className="text-base font-semibold">No vendors in scope yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Once vendors onboard and complete their assessments, their criticality, compliance status and review cadence will appear here.
          </p>
        </div>
      )}

      {hasVendors && (
        <div className="report-content">
          {/* SUMMARY STRIP */}
          <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={summary.total} label="Vendors" />
            <Stat value={summary.critical} label="Critical criticality" tone="warn" />
            <Stat value={summary.overdue} label="Overdue reviews" tone="danger" />
            <Stat value={`${summary.avg}%`} label="Avg compliance posture" tone="ok" />
          </section>

          {/* CHARTS */}
          <section className="mb-5 grid gap-4 sm:grid-cols-2">
            <ComplianceDonut rows={sorted} />
            <CriticalityBars rows={sorted} />
          </section>

          {/* TABLE */}
          <section className="glass overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between gap-2 px-5 py-3">
              <h2 className="text-sm font-semibold">Vendor portfolio</h2>
              <span className="text-xs text-muted">Click a row for the requirement-wise detail</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-y border-border bg-surface/60 text-left text-[10px] uppercase tracking-wider">
                  <tr>
                    <SortHeader label="Vendor" col="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortHeader label="Criticality" col="tier" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortHeader label="Compliance status" col="posture" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <th className="px-3 py-2 text-muted">Regulators</th>
                    <th className="px-3 py-2 text-muted">TPRM initiated</th>
                    <SortHeader label="Next due" col="nextDueAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <motion.tr
                      key={r.vendorId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      onClick={() => openVendor(r.vendorId)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open detail for ${r.name}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openVendor(r.vendorId);
                        }
                      }}
                      className="cursor-pointer border-t border-border/50 outline-none transition hover:bg-surface/50 hover:shadow-[inset_0_0_0_1px_rgb(var(--brand)/0.2)] focus-visible:bg-surface/50"
                    >
                      <td className="px-3 py-3 font-medium">{r.name}</td>
                      <td className="px-3 py-3">
                        <TierBadge tier={r.tier} />
                      </td>
                      <td className="px-3 py-3">
                        <div className={cn("text-xs font-semibold", RATING_TONE[r.rating])}>{r.rating}</div>
                        <PostureBar pct={r.posture} />
                      </td>
                      <td className="px-3 py-3">
                        <RegChips regulators={r.regulators} />
                      </td>
                      <td className="px-3 py-3 text-xs text-muted">{fmtDate(r.initiatedAt)}</td>
                      <td className="px-3 py-3">
                        <div className="text-xs text-muted">{fmtDate(r.nextDueAt)}</div>
                        <div className="mt-1">
                          <DueBadge row={r} />
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="mt-4 text-center text-xs text-muted">
            Read-only stakeholder view. Criticality reflects vendor tier; compliance status combines the assessor rating with compliant-of-applicable posture.
          </p>
        </div>
      )}

      {/* DRILL-DOWN */}
      <AnimatePresence>
        {openId && (
          <DrillDown
            detail={detail}
            loading={detailLoading}
            onClose={closeDrill}
            onExport={exportVendorExcel}
          />
        )}
      </AnimatePresence>

      <Toaster toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}
