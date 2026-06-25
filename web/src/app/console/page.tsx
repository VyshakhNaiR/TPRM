"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  FileText,
  Paperclip,
  Sparkles,
  PlayCircle,
  CheckCircle2,
  XCircle,
  CircleDashed,
  Quote,
  Inbox,
  Gavel,
  AlertTriangle,
  Menu,
} from "lucide-react";
import { CONTROLS, FRAMEWORKS, VENDOR } from "@/data/seed";
import { BASELINE_CONTROLS } from "@/data/baseline";
import type { Adjudication, Verdict, Risk } from "@/data/types";
import { Sidebar } from "@/components/sidebar";
import { TracerGraph } from "@/components/tracer-graph";
import { VerdictBadge, RiskBadge, ConfidenceMeter, RiskDial, Stat, Toaster, ErrorState, errorMessage, useToasts } from "@/components/ui";
import { cn } from "@/lib/utils";
import { consolidatedRating } from "@/lib/risk";

export default function Console() {
  const router = useRouter();
  const [vendors, setVendors] = useState<{ vendorId: string; name: string; answered: number; total: number; status: string }[]>([]);
  const [vendorId, setVendorId] = useState("apex");
  const [submission, setSubmission] = useState<any>(null);
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const toast = useToasts();

  // The selected vendor may be on the standard regulatory set or the Basic Security
  // Hygiene baseline. Default to CONTROLS until the submission loads.
  const hygieneMode = submission?.questionnaireMode === "hygiene";
  const controls = hygieneMode ? BASELINE_CONTROLS : CONTROLS;

  const [selected, setSelected] = useState(CONTROLS[0].id);
  const [results, setResults] = useState<Record<string, Adjudication>>({});
  const [scanning, setScanning] = useState<Record<string, boolean>>({});
  const [runningAll, setRunningAll] = useState(false);
  const [runProgress, setRunProgress] = useState({ done: 0, total: 0 });
  const [evidenceView, setEvidenceView] = useState<{ filename: string; text: string; keywords: string[]; method: string } | null>(null);
  // "Focus: prior findings first" — sorts prior Non-Compliant controls to the top of the list (off by default).
  const [focusPrior, setFocusPrior] = useState(false);

  // Off-canvas navigation drawer (small screens only).
  const [navOpen, setNavOpen] = useState(false);

  // Override form (per-control verdict override).
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [ovVerdict, setOvVerdict] = useState<Verdict>("Compliant");
  const [ovRisk, setOvRisk] = useState<Risk>("None");
  const [ovRationale, setOvRationale] = useState("");
  const [ovSaving, setOvSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError("");
      try {
        const meRes = await fetch("/api/me");
        if (!meRes.ok) throw new Error(await errorMessage(meRes, "Could not verify your session."));
        const me = await meRes.json();
        const role = me.session?.role;
        if (role !== "assessor" && role !== "root") { router.push("/login"); return; }
        const r = await fetch("/api/vendors");
        if (!r.ok) throw new Error(await errorMessage(r, "Could not load the vendor list."));
        if (!cancelled) { setVendors((await r.json()).vendors); setLoaded(true); }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load the console.");
      }
    })();
    return () => { cancelled = true; };
  }, [router, reloadKey]);

  // Load the selected vendor's submission; reset adjudication state on switch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/submission?vendorId=${encodeURIComponent(vendorId)}`);
        if (cancelled) return;
        setSubmission(r.ok ? await r.json() : null);
        setResults({});
      } catch {
        if (!cancelled) { setSubmission(null); setResults({}); }
      }
    })();
    return () => { cancelled = true; };
  }, [vendorId]);

  // When the active control set changes (vendor switches between standard and
  // hygiene), the currently selected id may no longer exist (e.g. an "NI-…" id
  // while the vendor is now on the "HYG-…" set). Reset to the first control and
  // clear stale results so nothing crashes during the transition.
  useEffect(() => {
    if (!controls.some((c) => c.id === selected)) {
      setSelected(controls[0]?.id ?? "");
      setResults({});
    }
  }, [controls, selected]);

  async function openEvidence(ev: any) {
    setEvidenceView({ filename: ev.filename, text: "", keywords: [], method: "loading" });
    try {
      const r = await fetch(`/api/evidence?hash=${encodeURIComponent(ev.hash || "")}&controlId=${selected}`);
      if (!r.ok) throw new Error(await errorMessage(r, "Could not load this evidence file."));
      setEvidenceView({ filename: ev.filename, ...(await r.json()) });
    } catch (e) {
      setEvidenceView(null);
      toast.error(e instanceof Error ? e.message : "Could not load this evidence file.");
    }
  }

  // May be undefined for one render while `controls` and `selected` re-sync.
  const control = controls.find((c) => c.id === selected);
  const result = results[selected];
  const ans = submission?.answers?.[selected];
  const review = submission?.reviews?.[selected];
  const overrides = submission?.overrides as Record<string, { verdict: string; risk: string; rationale: string; by: string; at: string }> | undefined;
  const activeOverride = overrides?.[selected];
  const selectedVendorName = vendors.find((v) => v.vendorId === vendorId)?.name ?? VENDOR.name;

  // Prior-audit findings (parsed at onboarding). Most vendors won't have these — guard for undefined.
  const priorFindings = submission?.priorFindings as
    | Record<string, { verdict: string; note?: string; confirmed?: boolean }>
    | undefined;
  const priorAuditAt = submission?.priorAuditAt as string | undefined;
  const isPriorNC = useCallback(
    (id: string) => priorFindings?.[id]?.verdict === "Non-Compliant",
    [priorFindings]
  );
  const priorNCCount = useMemo(
    () => (priorFindings ? Object.values(priorFindings).filter((f) => f?.verdict === "Non-Compliant").length : 0),
    [priorFindings]
  );
  const selectedPriorNote = isPriorNC(selected) ? priorFindings?.[selected]?.note : undefined;

  // Re-fetch the selected vendor's submission (used after overrides).
  const refreshSubmission = useCallback(async () => {
    const s = await fetch(`/api/submission?vendorId=${encodeURIComponent(vendorId)}`);
    if (s.ok) setSubmission(await s.json());
  }, [vendorId]);

  // Close the override form when switching controls.
  useEffect(() => { setOverrideOpen(false); }, [selected]);

  const adjudicate = useCallback(
    async (id: string): Promise<boolean> => {
      setScanning((s) => ({ ...s, [id]: true }));
      try {
        const res = await fetch("/api/adjudicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ controlId: id, vendorId }),
        });
        if (!res.ok) throw new Error(await errorMessage(res, `Adjudication failed for ${id}.`));
        const data: Adjudication = await res.json();
        setResults((m) => ({ ...m, [id]: data }));
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Adjudication failed for ${id}.`);
        return false;
      } finally {
        setScanning((s) => ({ ...s, [id]: false }));
      }
    },
    [vendorId, toast]
  );

  // Run remaining controls with bounded concurrency (4 at a time) + live progress.
  async function runAll() {
    const pending = controls.filter((c) => !results[c.id]).map((c) => c.id);
    if (pending.length === 0) return;
    setRunningAll(true);
    setRunProgress({ done: 0, total: pending.length });
    let failures = 0;
    const CONCURRENCY = 4;
    let cursor = 0;
    async function worker() {
      while (cursor < pending.length) {
        const id = pending[cursor++];
        const ok = await adjudicate(id);
        if (!ok) failures++;
        setRunProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
      if (failures === 0) toast.success(`Adjudicated ${pending.length} controls.`);
      else toast.error(`${failures} of ${pending.length} adjudications failed.`);
    } finally {
      setRunningAll(false);
    }
  }

  // Return the current finding to the vendor for remediation.
  async function sendBack() {
    const r = results[selected];
    if (!r) return;
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, controlId: selected, verdict: r.verdict, risk: r.risk, riskStatement: r.riskStatement, recommendations: r.recommendations }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not send this finding back."));
      const s = await fetch(`/api/submission?vendorId=${encodeURIComponent(vendorId)}`);
      if (s.ok) setSubmission(await s.json());
      toast.success("Finding returned to vendor for remediation.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send this finding back.");
    }
  }

  // Set an assessor verdict override, then re-adjudicate so the result reflects it.
  async function saveOverride() {
    if (!ovRationale.trim()) {
      toast.error("A rationale is required to override the verdict.");
      return;
    }
    setOvSaving(true);
    try {
      const res = await fetch("/api/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, controlId: selected, verdict: ovVerdict, risk: ovRisk, rationale: ovRationale.trim() }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not save the override."));
      await refreshSubmission();
      await adjudicate(selected);
      setOverrideOpen(false);
      setOvRationale("");
      toast.success("Verdict overridden.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the override.");
    } finally {
      setOvSaving(false);
    }
  }

  // Clear an existing override, then re-adjudicate so the result reverts.
  async function clearOverride() {
    setOvSaving(true);
    try {
      const res = await fetch(`/api/override?vendorId=${encodeURIComponent(vendorId)}&controlId=${encodeURIComponent(selected)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not clear the override."));
      await refreshSubmission();
      await adjudicate(selected);
      toast.success("Override cleared.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clear the override.");
    } finally {
      setOvSaving(false);
    }
  }

  const summary = useMemo(() => {
    const vals = Object.values(results);
    const compliant = vals.filter((v) => v.verdict === "Compliant").length;
    const nc = vals.filter((v) => v.verdict === "Non-Compliant").length;
    const na = vals.filter((v) => v.verdict === "Not Applicable").length;
    const assessed = vals.length;
    // posture score: % of applicable controls compliant
    const applicable = compliant + nc;
    const posture = applicable ? Math.round((compliant / applicable) * 100) : 0;
    return { compliant, nc, na, assessed, posture };
  }, [results]);

  // per-framework coverage: covered clauses (satisfied by a Compliant control) / total clauses
  const coverage = useMemo(() => {
    const map: Record<string, { total: number; covered: number }> = {
      MAS: { total: 0, covered: 0 }, RBI: { total: 0, covered: 0 }, SEBI: { total: 0, covered: 0 },
    };
    for (const f of FRAMEWORKS) map[f.id].total = f.clauses.length;
    const compliant: Record<string, Set<string>> = { MAS: new Set(), RBI: new Set(), SEBI: new Set() };
    for (const c of controls) {
      if (results[c.id]?.verdict === "Compliant") {
        for (const m of c.mappings) compliant[m.framework].add(m.clauseId);
      }
    }
    for (const k of ["MAS", "RBI", "SEBI"]) map[k].covered = compliant[k].size;
    return map;
  }, [results, controls]);

  // group the control library by family for the sidebar
  const groups = useMemo(() => {
    const m = new Map<string, typeof controls>();
    for (const c of controls) {
      if (!m.has(c.family)) m.set(c.family, []);
      m.get(c.family)!.push(c);
    }
    return Array.from(m.entries());
  }, [controls]);

  const totalClauses = FRAMEWORKS.reduce((n, f) => n + f.clauses.length, 0);
  const consolidated = consolidatedRating(Object.values(results).filter((r) => r.verdict === "Non-Compliant").map((r) => r.risk));
  const RATING_TONE: Record<string, string> = { Good: "text-ok", Satisfactory: "text-ok", "Needs Improvement": "text-warn", Unsatisfactory: "text-danger" };

  // Whether the selected vendor has any reviewable content (real or demo).
  const hasSubmissionContent =
    !!submission?.answers && Object.keys(submission.answers).length > 0
      ? Object.values(submission.answers as Record<string, any>).some(
          (a) => a?.response?.trim() || (a?.evidence?.length ?? 0) > 0 || a?.applicable === false
        )
      : false;
  const hasDemoContent = vendorId === "apex" && controls.some((c) => c.demo);
  const showEmptyState = loaded && !hasSubmissionContent && !hasDemoContent && Object.keys(results).length === 0;

  if (loadError && !loaded) {
    return <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar activeHref="/console" mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />

      <main className="min-w-0 flex-1 pb-20">
        {/* Slim header — hamburger (mobile), title, vendor picker + Run AI */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg/70 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
              className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted hover:text-fg md:hidden"
            >
              <Menu size={18} />
            </button>
            <span className="text-sm font-semibold">Assessor Console</span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="rounded-xl border border-border bg-surface/60 px-2.5 py-2 text-xs outline-none focus:border-brand"
              aria-label="Select vendor"
            >
              {vendors.map((v) => (
                <option key={v.vendorId} value={v.vendorId}>{v.name} ({v.answered}/{v.total})</option>
              ))}
            </select>
            <button
              onClick={runAll}
              disabled={runningAll}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60"
            >
              <PlayCircle size={16} />
              {runningAll ? `Adjudicating… ${runProgress.done} / ${runProgress.total}` : "Run AI on all controls"}
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-5 pt-5">

      {/* Vendor + summary */}
      <section className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-border bg-surface-2/60 text-muted">
              <Building2 size={26} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted">Vendor under assessment</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xl font-bold">{selectedVendorName}</span>
                {hygieneMode && (
                  <span className="rounded-full border border-border bg-surface-2/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Basic Security Hygiene
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-sm text-muted">{submission?.status === "submitted" ? "Submitted for review" : "Assessment in progress"}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={summary.assessed} label="Assessed" />
            <Stat value={summary.compliant} label="Compliant" tone="ok" />
            <Stat value={summary.nc} label="Non-Compliant" tone="danger" />
            <Stat value={summary.na} label="N/A" />
          </div>
          {summary.assessed > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-sm">
              <span className="text-xs text-muted">Consolidated rating:</span>
              <span className={cn("font-bold", RATING_TONE[consolidated.rating])}>{consolidated.rating}</span>
              <span className="text-xs text-muted">· Approval authority: <span className="text-fg">{consolidated.approval}</span></span>
            </div>
          )}
        </div>
        <div className="glass flex items-center justify-between gap-4 rounded-2xl p-5">
          <RiskDial score={summary.posture} label="posture" />
          <div className="flex-1 space-y-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold">Regulatory coverage</span>
              <span className="text-[10px] text-muted">{controls.length} controls · {totalClauses} clauses mapped</span>
            </div>
            {FRAMEWORKS.map((f) => {
              const cv = coverage[f.id];
              const pct = cv.total ? Math.round((cv.covered / cv.total) * 100) : 0;
              return (
                <div key={f.id}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-semibold">{f.name}</span>
                    <span className="text-muted">{cv.covered}/{cv.total} clauses</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: `rgb(var(--${f.id.toLowerCase()}))` }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.7 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Prior-audit focus summary — only when the selected vendor has parsed prior findings */}
      {priorNCCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
            <span className="text-fg">
              <span className="font-semibold text-warn">{priorNCCount}</span> requirement{priorNCCount === 1 ? " was" : "s were"} Non-Compliant in the last audit
              {formatAuditDate(priorAuditAt) && <span className="text-muted"> ({formatAuditDate(priorAuditAt)})</span>}
              <span className="text-muted"> — re-verify these first.</span>
            </span>
          </div>
          <button
            onClick={() => setFocusPrior((v) => !v)}
            aria-pressed={focusPrior}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
              focusPrior ? "border-warn/60 bg-warn/20 text-warn shadow-glow-sm" : "border-border text-muted hover:text-fg"
            )}
          >
            <AlertTriangle size={13} />
            {focusPrior ? "Prior findings first: on" : "Focus: prior findings first"}
          </button>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[260px_1fr] lg:grid-cols-[300px_1fr]">
        {/* Control list — caps height & scrolls on every breakpoint so the detail pane stays reachable */}
        <aside className="max-h-[40vh] space-y-3 overflow-y-auto pr-1 md:max-h-[calc(100vh-7rem)]">
          {groups.map(([family, items]) => (
            <div key={family}>
              <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                {family}
              </div>
              <div className="space-y-1.5">
                {(focusPrior
                  ? [...items].sort((a, b) => Number(isPriorNC(b.id)) - Number(isPriorNC(a.id)))
                  : items
                ).map((c) => {
                  const r = results[c.id];
                  const isSel = c.id === selected;
                  const priorNC = isPriorNC(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelected(c.id)}
                      className={cn(
                        "w-full rounded-xl border p-2.5 text-left transition",
                        isSel ? "border-brand/50 bg-brand/10 shadow-glow-sm" : "border-border bg-surface/40 hover:bg-surface-2"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-muted">{c.id}</span>
                        {r ? (
                          r.verdict === "Compliant" ? <CheckCircle2 size={13} className="text-ok" /> :
                          r.verdict === "Non-Compliant" ? <XCircle size={13} className="text-danger" /> :
                          <CircleDashed size={13} className="text-muted" />
                        ) : scanning[c.id] ? (
                          <Sparkles size={13} className="animate-pulse text-brand" />
                        ) : (
                          <span className="text-[9px] uppercase tracking-wide text-muted">{c.demo ? "ready" : "—"}</span>
                        )}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs font-medium">{c.question}</div>
                      {priorNC && (
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[9px] font-semibold text-warn">
                          <AlertTriangle size={9} /> Prior finding
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* Detail */}
        <section className="space-y-5">
          {showEmptyState && (
            <div className="glass flex flex-col items-center rounded-2xl p-10 text-center">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-full border border-border bg-surface-2/60 text-muted">
                <Inbox size={22} />
              </div>
              <h3 className="text-base font-semibold">No submission yet from {selectedVendorName}</h3>
              <p className="mt-1 max-w-sm text-sm text-muted">
                This vendor has not answered any controls or attached evidence. You can still browse the control library and run AI adjudication once they submit.
              </p>
            </div>
          )}
          {control && (
          <motion.div key={control.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">{control.id}</span>
                <span className="text-xs text-muted">{control.family}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">applies: {control.applicability}</span>
              </div>
              <h2 className="mt-2 text-lg font-semibold leading-snug">{control.question}</h2>

              {isPriorNC(selected) && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-warn/50 bg-warn/10 p-3 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
                  <div>
                    <span className="font-semibold text-warn">Prior audit: Non-Compliant</span>
                    {selectedPriorNote && <span className="text-fg"> — {selectedPriorNote}</span>}
                    <span className="text-muted"> Re-verify before adjudicating.</span>
                  </div>
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Panel icon={FileText} title="RFI — evidence requested">{control.rfi || "—"}</Panel>
                <Panel icon={Paperclip} title="Vendor response & evidence">
                  {ans && (ans.response || (ans.evidence?.length ?? 0) > 0 || ans.applicable === false) ? (
                    <>
                      <p className="font-medium text-fg">{ans.applicable === false ? "(marked Not Applicable)" : ans.response || "(blank)"}</p>
                      {ans.applicable === false && ans.justification && (
                        <p className="mt-1 text-muted"><span className="font-semibold text-fg">Justification: </span>{ans.justification}</p>
                      )}
                      {(ans.evidence ?? []).map((e: any) => (
                        <button key={e.id} onClick={() => openEvidence(e)} className="mt-1 block text-left text-muted underline decoration-dotted hover:text-brand">📎 {e.filename}</button>
                      ))}
                    </>
                  ) : vendorId === "apex" && control.demo ? (
                    <>
                      <p className="font-medium text-fg">{control.demo.vendorResponse || "(blank)"}</p>
                      {control.demo.vendorEvidence && <p className="mt-1 text-muted">{control.demo.vendorEvidence}</p>}
                    </>
                  ) : (
                    <p className="italic text-muted">Awaiting vendor response.</p>
                  )}
                </Panel>
              </div>

              {!result && (
                <button
                  onClick={() => adjudicate(control.id)}
                  disabled={scanning[control.id]}
                  className={cn(
                    "mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                    scanning[control.id] ? "shimmer-track bg-surface-2 text-muted" : "bg-brand text-white shadow-glow-sm hover:brightness-110"
                  )}
                >
                  <Sparkles size={16} />
                  {scanning[control.id] ? "AI adjudicating evidence…" : "Adjudicate with AI"}
                </button>
              )}
            </div>
          </motion.div>
          )}

          {/* AI result */}
          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key={selected + "-res"}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="glass rounded-2xl p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <VerdictBadge verdict={result.verdict} />
                    <RiskBadge risk={result.risk} />
                    {(result.source === "override" || activeOverride) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-mas/15 px-2 py-0.5 text-[10px] font-semibold text-mas">
                        <Gavel size={11} /> Overridden{activeOverride?.by ? ` by ${activeOverride.by}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <ConfidenceMeter value={result.confidence} />
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        result.source === "override" ? "bg-mas/15 text-mas" :
                        result.source === "ai" ? "bg-brand/15 text-brand" :
                        result.source === "static" ? "bg-ok/15 text-ok" : "bg-surface-2 text-muted"
                      )}
                    >
                      {result.source === "override" ? "Assessor override" :
                       result.source === "ai" ? "AI engine" :
                       result.source === "static" ? "Static · rules" : "Demo verdict"}
                    </span>
                  </div>
                </div>

                {/* evidence checks */}
                <div className="mt-4 space-y-2">
                  {result.evidenceChecks.map((e, i) => (
                    <div key={i} className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2/50 p-2.5">
                      {e.substantiates ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-danger" />}
                      <div className="text-xs">
                        <div className="font-medium">{e.requirement}</div>
                        <div className="text-muted">{e.note}</div>
                        <div className="mt-0.5 flex gap-2 text-[10px] text-muted">
                          <span className={e.provided ? "text-ok" : "text-danger"}>{e.provided ? "provided" : "not provided"}</span>
                          <span>·</span>
                          <span className={e.substantiates ? "text-ok" : "text-danger"}>{e.substantiates ? "substantiates" : "insufficient"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {result.riskStatement && result.riskStatement !== "—" && (
                  <p className="mt-4 text-sm text-muted"><span className="font-semibold text-fg">Residual risk: </span>{result.riskStatement}</p>
                )}

                {result.recommendations.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted">Recommendations</div>
                    <ul className="mt-1.5 space-y-1">
                      {result.recommendations.slice(0, 4).map((r, i) => (
                        <li key={i} className="flex gap-2 text-sm text-fg/90">
                          <span className="text-brand">▸</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                  <Quote size={12} /> {result.citations.join(" · ")}
                </div>

                {/* remediation action */}
                {result.verdict === "Non-Compliant" && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                    <button onClick={sendBack} className="inline-flex items-center gap-1.5 rounded-xl border border-warn/50 bg-warn/10 px-3 py-1.5 text-xs font-semibold text-warn hover:brightness-110">
                      ↩ Send back for remediation
                    </button>
                    {review && (
                      <span className={cn("text-[11px] font-medium", review.status === "resubmitted" ? "text-ok" : "text-warn")}>
                        {review.status === "resubmitted" ? "Vendor has resubmitted — re-adjudicate" : "Returned to vendor — awaiting remediation"}
                      </span>
                    )}
                  </div>
                )}

                {/* Assessor override */}
                <div className="mt-4 border-t border-border pt-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {!overrideOpen && (
                      <button
                        onClick={() => {
                          setOvVerdict((activeOverride?.verdict as Verdict) || result.verdict);
                          setOvRisk((activeOverride?.risk as Risk) || result.risk || "None");
                          setOvRationale(activeOverride?.rationale || "");
                          setOverrideOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-mas/50 bg-mas/10 px-3 py-1.5 text-xs font-semibold text-mas hover:brightness-110"
                      >
                        <Gavel size={13} /> {activeOverride ? "Edit override" : "Override verdict"}
                      </button>
                    )}
                    {activeOverride && (
                      <button
                        onClick={clearOverride}
                        disabled={ovSaving}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-fg disabled:opacity-60"
                      >
                        Clear override
                      </button>
                    )}
                  </div>

                  <AnimatePresence>
                    {overrideOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 space-y-3 rounded-xl border border-mas/40 bg-mas/5 p-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Verdict</span>
                              <select
                                value={ovVerdict}
                                onChange={(e) => setOvVerdict(e.target.value as Verdict)}
                                className="w-full rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-mas"
                              >
                                <option value="Compliant">Compliant</option>
                                <option value="Non-Compliant">Non-Compliant</option>
                                <option value="Not Applicable">Not Applicable</option>
                              </select>
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Risk</span>
                              <select
                                value={ovRisk}
                                onChange={(e) => setOvRisk(e.target.value as Risk)}
                                className="w-full rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-mas"
                              >
                                <option value="High Risk">High Risk</option>
                                <option value="Medium Risk">Medium Risk</option>
                                <option value="Low Risk">Low Risk</option>
                                <option value="None">None</option>
                              </select>
                            </label>
                          </div>
                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Rationale <span className="text-danger">*</span></span>
                            <textarea
                              value={ovRationale}
                              onChange={(e) => setOvRationale(e.target.value)}
                              rows={3}
                              required
                              aria-required="true"
                              placeholder="Required — explain why you are overriding the AI verdict…"
                              className="w-full rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-mas"
                            />
                          </label>
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              onClick={saveOverride}
                              disabled={ovSaving || !ovRationale.trim()}
                              className="inline-flex items-center gap-2 rounded-xl bg-mas px-4 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60"
                            >
                              <Gavel size={15} />
                              {ovSaving ? "Saving…" : "Save override"}
                            </button>
                            <button
                              onClick={() => setOverrideOpen(false)}
                              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted hover:text-fg"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tracer auto-mapping graph — empty for Basic Security Hygiene (no clause mappings) */}
          {control && (
          <div className="glass rounded-2xl p-5">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-sm font-semibold">Regulatory auto-mapping</span>
              <span className="text-xs text-muted">— this control → MAS / RBI / SEBI clauses</span>
            </div>
            <TracerGraph control={control} frameworks={FRAMEWORKS} verdict={result?.verdict} active={!!result} />
          </div>
          )}

        </section>
      </div>
        </div>

        {/* Evidence viewer — real modal dialog */}
        <EvidenceDialog view={evidenceView} onClose={() => setEvidenceView(null)} />

        <Toaster toasts={toast.toasts} onDismiss={toast.dismiss} />
      </main>
    </div>
  );
}

function EvidenceDialog({
  view,
  onClose,
}: {
  view: { filename: string; text: string; keywords: string[]; method: string } | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!view) return;
    // remember what had focus, then move focus to the close button
    restoreRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      // basic focus trap within the panel
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [view, onClose]);

  return (
    <AnimatePresence>
      {view && (
        <motion.div
          className="fixed inset-0 z-40 grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-bg/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="evidence-title"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="glass relative z-10 w-full max-w-2xl rounded-2xl p-5 shadow-glow"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span id="evidence-title" className="truncate text-sm font-semibold">📎 {view.filename}</span>
              <button
                ref={closeRef}
                onClick={onClose}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-fg"
              >
                Close
              </button>
            </div>
            {view.method === "loading" ? (
              <p className="text-xs text-muted">Loading…</p>
            ) : view.text ? (
              <>
                <p className="mb-2 text-xs text-muted">Extracted via {view.method} · matched terms highlighted</p>
                <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2/40 p-3 text-xs leading-relaxed">
                  <Highlighted text={view.text} keywords={view.keywords} />
                </div>
              </>
            ) : (
              <p className="text-xs italic text-muted">No readable text extracted from this file.</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Highlighted({ text, keywords }: { text: string; keywords: string[] }) {
  if (!keywords.length) return <>{text}</>;
  // A malformed keyword must never crash the viewer — fall back to plain text.
  try {
    const re = new RegExp(`(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    const kset = new Set(keywords.map((k) => k.toLowerCase()));
    return (
      <>
        {text.split(re).map((p, i) => (kset.has(p.toLowerCase()) ? <mark key={i} className="rounded bg-warn/40 px-0.5 text-fg">{p}</mark> : <span key={i}>{p}</span>))}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}

// Format an ISO date as DD-MMM-YYYY (e.g. 14-Mar-2025); returns "" for invalid/empty input.
function formatAuditDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d.getDate()).padStart(2, "0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

function Panel({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        <Icon size={13} /> {title}
      </div>
      <div className="text-xs leading-relaxed text-muted">{children}</div>
    </div>
  );
}
