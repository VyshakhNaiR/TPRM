"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Paperclip, FileText, CheckCircle2, UploadCloud, Send, LogOut, Loader2, ChevronDown, AlertTriangle } from "lucide-react";
import { CONTROLS } from "@/data/seed";
import type { CertType, CoverageMode, Submission } from "@/lib/store";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ErrorState, Toaster, errorMessage, useToasts } from "@/components/ui";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

type Answer = Submission["answers"][string];

const CERT_TYPES: { value: CertType; label: string }[] = [
  { value: "iso27001", label: "ISO/IEC 27001 Certification" },
  { value: "pci_aoc", label: "PCI DSS AOC" },
  { value: "soc2_type2", label: "SOC 2 Type 2 Attestation" },
];

/**
 * Derive how the vendor is addressing a control:
 *  - explicit `coverage` wins
 *  - else legacy answers map: applicable === false → not_applicable, otherwise evidence.
 */
function coverageOf(a: Answer | undefined): CoverageMode {
  if (a?.coverage) return a.coverage;
  if (a?.applicable === false) return "not_applicable";
  return "evidence";
}

/**
 * A control is "answered" depending on its coverage mode:
 *  - evidence: has a response OR ≥1 evidence file
 *  - certification: has a cert type + a non-empty mapping note + ≥1 uploaded file
 *  - not_applicable: has a justification
 */
function isAnswered(a: Answer | undefined): boolean {
  if (!a) return false;
  const mode = coverageOf(a);
  if (mode === "not_applicable") return !!a.justification?.trim();
  if (mode === "certification") {
    return !!a.certType && !!a.certMappingNote?.trim() && (a.evidence?.length ?? 0) > 0;
  }
  return !!a.response?.trim() || (a.evidence?.length ?? 0) > 0;
}

export default function VendorPortal() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sub, setSub] = useState<Submission | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Controls flagged client/server-side as needing an N/A reason — drives the visual flag.
  const [missingReasons, setMissingReasons] = useState<Set<string>>(new Set());
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toast = useToasts();

  const groups = useMemo(() => {
    const m = new Map<string, typeof CONTROLS>();
    for (const c of CONTROLS) {
      if (!m.has(c.family)) m.set(c.family, []);
      m.get(c.family)!.push(c);
    }
    return Array.from(m.entries());
  }, []);

  // Default: expand the first section only, collapse the rest (tidy, not a wall).
  useEffect(() => {
    if (groups.length) setOpen({ [groups[0][0]]: true });
  }, [groups]);

  // On first load with prior findings, also auto-expand sections that contain flagged controls.
  const priorExpanded = useRef(false);
  useEffect(() => {
    if (priorExpanded.current || !sub) return;
    const pf = (sub as unknown as { priorFindings?: Record<string, { verdict: string }> }).priorFindings;
    if (!pf) return;
    const flaggedFamilies = new Set(
      CONTROLS.filter((c) => pf[c.id]?.verdict === "Non-Compliant").map((c) => c.family)
    );
    if (flaggedFamilies.size === 0) return;
    priorExpanded.current = true;
    setOpen((o) => {
      const next = { ...o };
      flaggedFamilies.forEach((f) => { next[f] = true; });
      return next;
    });
  }, [sub]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError("");
      try {
        const meRes = await fetch("/api/me");
        if (!meRes.ok) throw new Error(await errorMessage(meRes, "Could not verify your session."));
        const me = await meRes.json();
        if (!me.session || me.session.role !== "vendor") {
          router.push("/login");
          return;
        }
        if (cancelled) return;
        setName(me.session.name);
        const subRes = await fetch("/api/submission");
        if (!subRes.ok) throw new Error(await errorMessage(subRes, "Could not load your questionnaire."));
        const data = await subRes.json();
        if (!cancelled) setSub(data);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load your questionnaire.");
      }
    })();
    return () => { cancelled = true; };
  }, [router, reloadKey]);

  // flush any pending debounced autosave timers on unmount
  useEffect(() => () => { Object.values(debounceTimers.current).forEach(clearTimeout); }, []);

  const answers = sub?.answers ?? {};
  // Prior-audit findings parsed at onboarding (existing vendors only — guard for undefined).
  const priorFindings = (sub as unknown as { priorFindings?: Record<string, { verdict: string; note?: string; confirmed?: boolean }> })?.priorFindings;
  const isPriorNC = useCallback(
    (id: string) => priorFindings?.[id]?.verdict === "Non-Compliant",
    [priorFindings]
  );
  const priorNCCount = useMemo(
    () => (priorFindings ? Object.values(priorFindings).filter((f) => f?.verdict === "Non-Compliant").length : 0),
    [priorFindings]
  );
  const answered = CONTROLS.filter((c) => isAnswered(answers[c.id])).length;
  const pct = Math.round((answered / CONTROLS.length) * 100);
  const submitted = sub?.status === "submitted";
  const needsAttention = Object.values((sub?.reviews ?? {}) as Record<string, { status: string }>).filter((r) => r.status === "open").length;

  const allOpen = groups.length > 0 && groups.every(([family]) => open[family]);
  const toggleSection = useCallback((family: string) => {
    setOpen((o) => ({ ...o, [family]: !o[family] }));
  }, []);
  const setAll = useCallback((value: boolean) => {
    setOpen(Object.fromEntries(groups.map(([family]) => [family, value])));
  }, [groups]);

  const save = useCallback(
    async (
      controlId: string,
      patch: {
        response?: string;
        applicable?: boolean;
        justification?: string;
        coverage?: CoverageMode;
        certType?: CertType | null;
        certMappingNote?: string;
      }
    ) => {
      setSaving((s) => ({ ...s, [controlId]: true }));
      setSaveState("saving");
      try {
        const res = await fetch("/api/submission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ controlId, ...patch }),
        });
        if (!res.ok) throw new Error(await errorMessage(res, "Could not save your answer."));
        setSub(await res.json());
        setSaveState("saved");
        setSavedAt(new Date());
        // A saved justification clears any outstanding "needs a reason" flag.
        if (patch.justification?.trim()) {
          setMissingReasons((m) => {
            if (!m.has(controlId)) return m;
            const next = new Set(m);
            next.delete(controlId);
            return next;
          });
        }
      } catch (e) {
        setSaveState("error");
        toast.error(e instanceof Error ? e.message : "Could not save your answer.");
      } finally {
        setSaving((s) => ({ ...s, [controlId]: false }));
      }
    },
    [toast]
  );

  // Debounced autosave for free-text fields (response & N/A justification) ~1.5s after typing stops.
  const queueAutosave = useCallback(
    (
      controlId: string,
      patch: { response?: string; justification?: string; certMappingNote?: string; coverage?: CoverageMode; applicable?: boolean }
    ) => {
      setSaveState("dirty");
      if (debounceTimers.current[controlId]) clearTimeout(debounceTimers.current[controlId]);
      debounceTimers.current[controlId] = setTimeout(() => {
        delete debounceTimers.current[controlId];
        save(controlId, patch);
      }, 1500);
    },
    [save]
  );

  // Cancel a pending autosave (e.g. when blur-save fires first).
  function cancelAutosave(controlId: string) {
    if (debounceTimers.current[controlId]) {
      clearTimeout(debounceTimers.current[controlId]);
      delete debounceTimers.current[controlId];
    }
  }

  async function upload(controlId: string, file: File) {
    setUploading((s) => ({ ...s, [controlId]: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("controlId", controlId);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await errorMessage(res, "Upload failed."));
      setSub((await res.json()).submission);
      toast.success(`Uploaded ${file.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading((s) => ({ ...s, [controlId]: false }));
    }
  }

  // Open every section that contains a flagged control so the vendor can see what to fix.
  const revealMissing = useCallback((ids: Set<string>) => {
    if (!ids.size) return;
    const families = new Set(CONTROLS.filter((c) => ids.has(c.id)).map((c) => c.family));
    setOpen((o) => {
      const next = { ...o };
      families.forEach((f) => { next[f] = true; });
      return next;
    });
  }, []);

  async function submitAll() {
    // Client-side gate first for immediate feedback (matches the server's rule).
    const clientMissing = CONTROLS.filter((c) => {
      const a = answers[c.id];
      return a && coverageOf(a) === "not_applicable" && !a.justification?.trim();
    }).map((c) => c.id);
    if (clientMissing.length) {
      const set = new Set(clientMissing);
      setMissingReasons(set);
      revealMissing(set);
      toast.error(`${clientMissing.length} control${clientMissing.length > 1 ? "s" : ""} marked Not Applicable still ${clientMissing.length > 1 ? "need" : "needs"} a reason.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/submission", { method: "PUT" });
      if (!res.ok) {
        // Server may return { error, missing: [...] } — surface and reveal the offenders.
        let serverMissing: string[] = [];
        try {
          const data = await res.clone().json();
          if (Array.isArray(data?.missing)) serverMissing = data.missing.filter((x: unknown): x is string => typeof x === "string");
        } catch { /* not JSON */ }
        if (serverMissing.length) {
          const set = new Set(serverMissing);
          setMissingReasons(set);
          revealMissing(set);
        }
        throw new Error(await errorMessage(res, "Could not submit for review."));
      }
      setSub(await res.json());
      setMissingReasons(new Set());
      toast.success("Questionnaire submitted for review.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit for review.");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  if (loadError && !sub) {
    return <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  if (!sub) {
    return <main className="grid min-h-screen place-items-center text-muted"><Loader2 className="animate-spin" /></main>;
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 pb-24">
      <header className="sticky top-0 z-20 -mx-5 mb-5 flex items-center justify-between border-b border-border bg-bg/70 px-5 py-3 backdrop-blur">
        <LogoLockup markWidth={38} />
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{name}</span>
          <ThemeToggle />
          <button onClick={logout} className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted hover:text-fg" aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </header>

      {/* progress + submit */}
      <section className="glass mb-6 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Security Questionnaire</h1>
            <p className="text-sm text-muted">{answered} of {CONTROLS.length} answered · {submitted ? "submitted for review" : "draft"}{needsAttention > 0 && <span className="font-semibold text-danger"> · {needsAttention} returned for remediation</span>}</p>
            <SaveIndicator state={saveState} savedAt={savedAt} />
          </div>
          <button
            onClick={submitAll}
            disabled={submitting || submitted}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60"
          >
            {submitted ? <CheckCircle2 size={16} /> : <Send size={16} />}
            {submitted ? "Submitted" : submitting ? "Submitting…" : "Submit for review"}
          </button>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
          <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">{answered} / {CONTROLS.length} answered</span>
          <button
            onClick={() => setAll(!allOpen)}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:border-brand/50 hover:text-fg"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </section>

      {/* Prior-audit focus banner — existing vendors with findings parsed at onboarding */}
      {priorNCCount > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
          <span className="text-fg">
            <span className="font-semibold text-warn">{priorNCCount}</span> requirement{priorNCCount === 1 ? " was" : "s were"} flagged in your last audit
            <span className="text-muted"> — please prioritise these.</span>
          </span>
        </div>
      )}

      {/* questionnaire — collapsible accordion grouped by control family */}
      <div className="space-y-3">
        {groups.map(([family, items]) => {
          const total = items.length;
          const done = items.filter((c) => isAnswered(answers[c.id])).length;
          const flagged = items.filter((c) => missingReasons.has(c.id)).length;
          const isOpen = !!open[family];
          const panelId = `section-${family.replace(/[^\w]+/g, "-")}`;
          return (
            <section key={family} className={cn("glass overflow-hidden rounded-2xl", flagged > 0 && "ring-1 ring-danger/50")}>
              <button
                onClick={() => toggleSection(family)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2/40"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <motion.span animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.2 }} className="shrink-0 text-muted">
                    <ChevronDown size={18} />
                  </motion.span>
                  <span className="truncate text-sm font-semibold">{family}</span>
                  {flagged > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
                      <AlertTriangle size={11} /> needs a reason
                    </span>
                  )}
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", done === total ? "bg-ok/10 text-ok" : "bg-surface-2 text-muted")}>
                  {done} / {total} answered
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={panelId}
                    key="panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
                      {items.map((c) => {
                        const a = answers[c.id];
                        const mode = coverageOf(a);
                        const na = mode === "not_applicable";
                        const rev = sub.reviews?.[c.id];
                        // A returned (open) finding re-opens the control even after submission.
                        const locked = submitted && !(rev && rev.status === "open");
                        const needsReason = na && missingReasons.has(c.id);
                        const setMode = (next: CoverageMode) => {
                          if (locked || next === mode) return;
                          if (next === "not_applicable") {
                            save(c.id, { coverage: "not_applicable", applicable: false });
                          } else if (next === "certification") {
                            save(c.id, { coverage: "certification", applicable: true });
                          } else {
                            save(c.id, { coverage: "evidence", applicable: true });
                          }
                        };
                        return (
                          <div key={c.id} className={cn("rounded-2xl border border-border bg-surface/40 p-4", needsReason && "border-danger/50")}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <span className="font-mono text-[10px] text-muted">{c.id}</span>
                                {isPriorNC(c.id) && (
                                  <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold text-warn align-middle">
                                    <AlertTriangle size={10} /> Was non-compliant last audit
                                  </span>
                                )}
                                <p className="text-sm font-medium leading-snug">{c.question}</p>
                              </div>
                              {saving[c.id] && <Loader2 size={14} className="mt-1 shrink-0 animate-spin text-muted" />}
                              {!saving[c.id] && isAnswered(a) && <CheckCircle2 size={15} className="mt-1 shrink-0 text-ok" />}
                            </div>

                            {rev && rev.status === "open" && (
                              <div className="mt-2 rounded-lg border border-danger/40 bg-danger/10 p-2 text-xs">
                                <div className="font-semibold text-danger">↩ Returned for remediation — {rev.verdict}</div>
                                {rev.riskStatement && <p className="mt-0.5 text-muted">{rev.riskStatement}</p>}
                                {(rev.recommendations ?? []).slice(0, 3).map((r: string, i: number) => <p key={i} className="mt-0.5 text-muted">▸ {r}</p>)}
                                <p className="mt-1 font-medium text-fg">Update your response / evidence below and it will be resubmitted.</p>
                              </div>
                            )}
                            {rev && rev.status === "resubmitted" && <div className="mt-2 text-xs font-medium text-ok">✓ Resubmitted — awaiting assessor re-review.</div>}

                            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-surface-2/50 p-2 text-xs text-muted">
                              <FileText size={12} className="mt-0.5 shrink-0" /><span>{c.rfi}</span>
                            </div>

                            {/* How are you addressing this? — three coverage modes */}
                            <fieldset className="mt-3" disabled={locked}>
                              <legend className="text-xs font-medium text-fg">How are you addressing this?</legend>
                              <div role="radiogroup" aria-label={`How are you addressing ${c.id}?`} className="mt-1.5 grid gap-2 sm:grid-cols-3">
                                {([
                                  { value: "evidence" as CoverageMode, label: "Provide evidence & comment" },
                                  { value: "certification" as CoverageMode, label: "Covered by an existing certification" },
                                  { value: "not_applicable" as CoverageMode, label: "Not applicable" },
                                ]).map((opt) => {
                                  const active = mode === opt.value;
                                  return (
                                    <label
                                      key={opt.value}
                                      className={cn(
                                        "flex cursor-pointer items-start gap-2 rounded-xl border bg-surface/60 px-3 py-2 text-xs transition",
                                        active ? "border-brand ring-1 ring-brand/40" : "border-border hover:border-brand/40",
                                        locked && "cursor-not-allowed opacity-60"
                                      )}
                                    >
                                      <input
                                        type="radio"
                                        name={`coverage-${c.id}`}
                                        value={opt.value}
                                        checked={active}
                                        disabled={locked}
                                        aria-checked={active}
                                        onChange={() => setMode(opt.value)}
                                        className="mt-0.5"
                                      />
                                      <span className="font-medium leading-snug">{opt.label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </fieldset>

                            {mode === "not_applicable" && (
                              <>
                                <label htmlFor={`reason-${c.id}`} className="mt-3 block text-xs font-medium text-fg">
                                  Why is this not applicable? <span className="text-danger">*</span>
                                </label>
                                <textarea
                                  id={`reason-${c.id}`}
                                  defaultValue={a?.justification ?? ""}
                                  key={`reason-${c.id}-${a?.justification ?? ""}`}
                                  disabled={locked}
                                  required
                                  aria-required="true"
                                  aria-invalid={needsReason}
                                  onChange={(e) => { if (!locked) queueAutosave(c.id, { coverage: "not_applicable", applicable: false, justification: e.target.value }); }}
                                  onBlur={(e) => { cancelAutosave(c.id); if (!locked && e.target.value !== (a?.justification ?? "")) save(c.id, { coverage: "not_applicable", applicable: false, justification: e.target.value }); }}
                                  placeholder="Explain why this control does not apply to our engagement…"
                                  rows={2}
                                  className={cn(
                                    "mt-1 w-full resize-y rounded-xl border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand",
                                    needsReason ? "border-danger/60" : "border-border"
                                  )}
                                />
                                {needsReason && (
                                  <p className="mt-1 text-xs font-medium text-danger" role="alert">A reason is required before you can submit.</p>
                                )}
                              </>
                            )}

                            {mode === "certification" && (
                              <>
                                <label htmlFor={`certtype-${c.id}`} className="mt-3 block text-xs font-medium text-fg">
                                  Certification type <span className="text-danger">*</span>
                                </label>
                                <select
                                  id={`certtype-${c.id}`}
                                  value={a?.certType ?? ""}
                                  disabled={locked}
                                  onChange={(e) => { if (!locked) save(c.id, { coverage: "certification", applicable: true, certType: (e.target.value || null) as CertType | null }); }}
                                  className="mt-1 w-full rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand"
                                >
                                  <option value="">Select a certification…</option>
                                  {CERT_TYPES.map((ct) => (
                                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                                  ))}
                                </select>

                                <label htmlFor={`certnote-${c.id}`} className="mt-3 block text-xs font-medium text-fg">
                                  How does this certification cover this requirement? <span className="text-danger">*</span>
                                </label>
                                <textarea
                                  id={`certnote-${c.id}`}
                                  defaultValue={a?.certMappingNote ?? ""}
                                  key={`certnote-${c.id}-${a?.certMappingNote ?? ""}`}
                                  disabled={locked}
                                  required
                                  aria-required="true"
                                  onChange={(e) => { if (!locked) queueAutosave(c.id, { coverage: "certification", applicable: true, certMappingNote: e.target.value }); }}
                                  onBlur={(e) => { cancelAutosave(c.id); if (!locked && e.target.value !== (a?.certMappingNote ?? "")) save(c.id, { coverage: "certification", applicable: true, certMappingNote: e.target.value }); }}
                                  placeholder="Describe which clauses / controls of this certification satisfy this requirement…"
                                  rows={3}
                                  className="mt-1 w-full resize-y rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand"
                                />

                                <p className="mt-3 text-xs font-medium text-fg">Attach the certificate / report</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <input
                                    ref={(el) => { fileRefs.current[c.id] = el; }}
                                    type="file"
                                    hidden
                                    aria-label={`Attach certificate for ${c.id}`}
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(c.id, f); e.target.value = ""; }}
                                  />
                                  <button
                                    onClick={() => fileRefs.current[c.id]?.click()}
                                    disabled={locked || uploading[c.id]}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:border-brand/50 disabled:opacity-60"
                                  >
                                    {uploading[c.id] ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                                    Attach certificate / report
                                  </button>
                                  {(a?.evidence ?? []).map((ev) => (
                                    <span key={ev.id} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-[11px] text-muted">
                                      <Paperclip size={11} /> {ev.filename}
                                    </span>
                                  ))}
                                </div>
                              </>
                            )}

                            {mode === "evidence" && (
                              <>
                                <label htmlFor={`response-${c.id}`} className="sr-only">Response for {c.id}</label>
                                <textarea
                                  id={`response-${c.id}`}
                                  defaultValue={a?.response ?? ""}
                                  disabled={locked}
                                  onChange={(e) => { if (!locked) queueAutosave(c.id, { coverage: "evidence", applicable: true, response: e.target.value }); }}
                                  onBlur={(e) => { cancelAutosave(c.id); if (!locked && e.target.value !== (a?.response ?? "")) save(c.id, { coverage: "evidence", applicable: true, response: e.target.value }); }}
                                  placeholder="Your response…"
                                  rows={2}
                                  className="mt-3 w-full resize-y rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand"
                                />
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <input
                                    ref={(el) => { fileRefs.current[c.id] = el; }}
                                    type="file"
                                    hidden
                                    aria-label={`Attach evidence for ${c.id}`}
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(c.id, f); e.target.value = ""; }}
                                  />
                                  <button
                                    onClick={() => fileRefs.current[c.id]?.click()}
                                    disabled={locked || uploading[c.id]}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:border-brand/50 disabled:opacity-60"
                                  >
                                    {uploading[c.id] ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                                    Attach evidence
                                  </button>
                                  {(a?.evidence ?? []).map((ev) => (
                                    <span key={ev.id} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-[11px] text-muted">
                                      <Paperclip size={11} /> {ev.filename}
                                    </span>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}
      </div>
      <Toaster toasts={toast.toasts} onDismiss={toast.dismiss} />
    </main>
  );
}

function SaveIndicator({ state, savedAt }: { state: SaveState; savedAt: Date | null }) {
  if (state === "idle") return null;
  const time = savedAt
    ? savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  const map: Record<Exclude<SaveState, "idle">, { text: string; cls: string }> = {
    dirty: { text: "Unsaved changes", cls: "text-warn" },
    saving: { text: "Saving…", cls: "text-muted" },
    saved: { text: time ? `Saved · ${time}` : "Saved", cls: "text-ok" },
    error: { text: "Save failed — retrying on next change", cls: "text-danger" },
  };
  const { text, cls } = map[state];
  return <p className={cn("mt-0.5 text-xs font-medium", cls)} aria-live="polite">{text}</p>;
}
