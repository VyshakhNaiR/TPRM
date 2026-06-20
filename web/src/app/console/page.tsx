"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  ArrowLeft,
  FileText,
  Paperclip,
  Sparkles,
  PlayCircle,
  CheckCircle2,
  XCircle,
  CircleDashed,
  Quote,
  LogOut,
} from "lucide-react";
import { CONTROLS, FRAMEWORKS, VENDOR } from "@/data/seed";
import type { Adjudication } from "@/data/types";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoLockup } from "@/components/animated-logo";
import { TracerGraph } from "@/components/tracer-graph";
import { VerdictBadge, RiskBadge, ConfidenceMeter, RiskDial, Stat } from "@/components/ui";
import { cn } from "@/lib/utils";

export default function Console() {
  const router = useRouter();
  const [vendors, setVendors] = useState<{ vendorId: string; name: string; answered: number; total: number; status: string }[]>([]);
  const [vendorId, setVendorId] = useState("apex");
  const [submission, setSubmission] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const me = await (await fetch("/api/me")).json();
      const role = me.session?.role;
      if (role !== "assessor" && role !== "root" && role !== "viewer") { router.push("/login"); return; }
      const r = await fetch("/api/vendors");
      if (r.ok) setVendors((await r.json()).vendors);
    })();
  }, [router]);

  // Load the selected vendor's submission; reset adjudication state on switch.
  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/submission?vendorId=${encodeURIComponent(vendorId)}`);
      setSubmission(r.ok ? await r.json() : null);
      setResults({});
    })();
  }, [vendorId]);

  const [selected, setSelected] = useState(CONTROLS[0].id);
  const [results, setResults] = useState<Record<string, Adjudication>>({});
  const [scanning, setScanning] = useState<Record<string, boolean>>({});
  const [runningAll, setRunningAll] = useState(false);

  const control = CONTROLS.find((c) => c.id === selected)!;
  const result = results[selected];
  const ans = submission?.answers?.[selected];
  const selectedVendorName = vendors.find((v) => v.vendorId === vendorId)?.name ?? VENDOR.name;

  async function adjudicate(id: string) {
    setScanning((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch("/api/adjudicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlId: id, vendorId }),
      });
      const data: Adjudication = await res.json();
      // small delay so the "scanning" shimmer is visible (demo polish)
      await new Promise((r) => setTimeout(r, 450));
      setResults((m) => ({ ...m, [id]: data }));
    } finally {
      setScanning((s) => ({ ...s, [id]: false }));
    }
  }

  async function runAll() {
    setRunningAll(true);
    for (const c of CONTROLS) {
      if (!results[c.id]) await adjudicate(c.id);
    }
    setRunningAll(false);
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
    for (const c of CONTROLS) {
      if (results[c.id]?.verdict === "Compliant") {
        for (const m of c.mappings) compliant[m.framework].add(m.clauseId);
      }
    }
    for (const k of ["MAS", "RBI", "SEBI"]) map[k].covered = compliant[k].size;
    return map;
  }, [results]);

  // group the control library by family for the sidebar
  const groups = useMemo(() => {
    const m = new Map<string, typeof CONTROLS>();
    for (const c of CONTROLS) {
      if (!m.has(c.family)) m.set(c.family, []);
      m.get(c.family)!.push(c);
    }
    return Array.from(m.entries());
  }, []);

  const totalClauses = FRAMEWORKS.reduce((n, f) => n + f.clauses.length, 0);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 pb-20">
      {/* Top bar */}
      <header className="sticky top-0 z-20 -mx-5 mb-5 flex items-center justify-between border-b border-border bg-bg/70 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/" className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-fg">
            <ArrowLeft size={16} />
          </Link>
          <LogoLockup markWidth={38} />
          <span className="hidden text-sm text-muted sm:inline">· Assessor Console</span>
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
          <Link href="/portfolio" className="hidden rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted hover:text-fg sm:block">Portfolio</Link>
          <button
            onClick={runAll}
            disabled={runningAll}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60"
          >
            <PlayCircle size={16} />
            {runningAll ? "Adjudicating…" : "Run AI on all controls"}
          </button>
          <ThemeToggle />
          <button
            onClick={async () => { await fetch("/api/logout", { method: "POST" }); window.location.href = "/login"; }}
            className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted hover:text-fg"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Vendor + summary */}
      <section className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-border bg-surface-2/60 text-muted">
              <Building2 size={26} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted">Vendor under assessment</div>
              <div className="mt-1 text-xl font-bold">{selectedVendorName}</div>
              <div className="mt-0.5 text-sm text-muted">{submission?.status === "submitted" ? "Submitted for review" : "Assessment in progress"}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3">
            <Stat value={summary.assessed} label="Assessed" />
            <Stat value={summary.compliant} label="Compliant" tone="ok" />
            <Stat value={summary.nc} label="Non-Compliant" tone="danger" />
            <Stat value={summary.na} label="N/A" />
          </div>
        </div>
        <div className="glass flex items-center justify-between gap-4 rounded-2xl p-5">
          <RiskDial score={summary.posture} label="posture" />
          <div className="flex-1 space-y-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold">Regulatory coverage</span>
              <span className="text-[10px] text-muted">{CONTROLS.length} controls · {totalClauses} clauses mapped</span>
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

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* Control list */}
        <aside className="space-y-3 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
          {groups.map(([family, items]) => (
            <div key={family}>
              <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                {family}
              </div>
              <div className="space-y-1.5">
                {items.map((c) => {
                  const r = results[c.id];
                  const isSel = c.id === selected;
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
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* Detail */}
        <section className="space-y-5">
          <motion.div key={control.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">{control.id}</span>
                <span className="text-xs text-muted">{control.family}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">applies: {control.applicability}</span>
              </div>
              <h2 className="mt-2 text-lg font-semibold leading-snug">{control.question}</h2>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Panel icon={FileText} title="RFI — evidence requested">{control.rfi || "—"}</Panel>
                <Panel icon={Paperclip} title="Vendor response & evidence">
                  {ans && (ans.response || (ans.evidence?.length ?? 0) > 0 || ans.applicable === false) ? (
                    <>
                      <p className="font-medium text-fg">{ans.applicable === false ? "(marked Not Applicable)" : ans.response || "(blank)"}</p>
                      {(ans.evidence ?? []).map((e: any) => <p key={e.id} className="mt-1 text-muted">📎 {e.filename}</p>)}
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

          {/* AI result */}
          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key={control.id + "-res"}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="glass rounded-2xl p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <VerdictBadge verdict={result.verdict} />
                    <RiskBadge risk={result.risk} />
                  </div>
                  <div className="flex items-center gap-3">
                    <ConfidenceMeter value={result.confidence} />
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", result.source === "ai" ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted")}>
                      {result.source === "ai" ? "Claude" : "offline demo"}
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

                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
                  <Quote size={11} /> {result.citations.join(" · ")}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tracer auto-mapping graph */}
          <div className="glass rounded-2xl p-5">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-sm font-semibold">Regulatory auto-mapping</span>
              <span className="text-xs text-muted">— this control → MAS / RBI / SEBI clauses</span>
            </div>
            <TracerGraph control={control} frameworks={FRAMEWORKS} verdict={result?.verdict} active={!!result} />
          </div>
        </section>
      </div>
    </main>
  );
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
