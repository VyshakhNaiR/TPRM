"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Paperclip, FileText, CheckCircle2, UploadCloud, Send, LogOut, Loader2, ChevronDown, AlertTriangle, ShieldCheck, Trash2, MessageCircle, X, Lock } from "lucide-react";
import { CONTROLS } from "@/data/seed";
import { BASELINE_CONTROLS } from "@/data/baseline";
import type { CertType, CoverageMode, Submission, VendorCert } from "@/lib/store";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ErrorState, Toaster, errorMessage, useToasts } from "@/components/ui";

function CompletionRing({ pct }: { pct: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const tone = pct >= 75 ? "var(--ok)" : pct >= 40 ? "var(--warn)" : "var(--brand)";
  return (
    <div className="relative grid shrink-0 place-items-center">
      <svg width={68} height={68} className="-rotate-90">
        <circle cx={34} cy={34} r={r} fill="none" stroke="rgb(var(--surface-2))" strokeWidth={6} />
        <motion.circle
          cx={34} cy={34} r={r}
          fill="none"
          stroke={`rgb(${tone})`}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (pct / 100) * circ }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 5px rgb(${tone} / 0.5))` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-sm font-bold tabular-nums leading-none">{pct}%</span>
      </div>
    </div>
  );
}
import { cn } from "@/lib/utils";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

type Answer = Submission["answers"][string];

const CERT_TYPES: { value: CertType; label: string }[] = [
  { value: "iso27001", label: "ISO/IEC 27001 Certification" },
  { value: "pci_aoc", label: "PCI DSS AOC" },
  { value: "soc2_type2", label: "SOC 2 Type 2 Attestation" },
];

// Concise labels used in the certification library list + per-control references.
const CERT_SHORT: Record<CertType, string> = {
  iso27001: "ISO/IEC 27001",
  pci_aoc: "PCI DSS AOC",
  soc2_type2: "SOC 2 Type 2",
};

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
 * A control is "complete" depending on its coverage mode (mirrors the server's
 * answerComplete() + certification library check in PUT /api/submission):
 *  - evidence: has a response OR ≥1 evidence file
 *  - certification: has a cert type + a non-empty mapping note + a cert of that
 *    type present in the vendor's certification library
 *  - not_applicable: has a justification
 */
function isAnswered(a: Answer | undefined, certTypes: Set<CertType>): boolean {
  if (!a) return false;
  const mode = coverageOf(a);
  if (mode === "not_applicable") return !!a.justification?.trim();
  if (mode === "certification") {
    return !!a.certType && !!a.certMappingNote?.trim() && certTypes.has(a.certType);
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
  // Controls flagged client/server-side as incomplete (any mode) — drives the visual flag.
  const [incompleteFlags, setIncompleteFlags] = useState<Set<string>>(new Set());
  // Vendor certification library (upload once, reference everywhere).
  const [certs, setCerts] = useState<VendorCert[]>([]);
  const [certUploadType, setCertUploadType] = useState<CertType | "">("");
  const [certBusy, setCertBusy] = useState(false);
  const [certDeleting, setCertDeleting] = useState<Record<string, boolean>>({});
  const certFileRef = useRef<HTMLInputElement | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const scrollRestoreRef = useRef<number | null>(null);
  const toast = useToasts();

  // CompliQ chatbot state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatControlId, setChatControlId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);


  // Which questionnaire is this vendor assigned? The mode rides along on the
  // /api/submission response (not part of the core Submission type), so read it
  // via a narrow cast and pick the active control set. Defaults to the full
  // regulatory CONTROLS until the submission has loaded.
  const questionnaireMode = (sub as unknown as { questionnaireMode?: "standard" | "hygiene" } | null)?.questionnaireMode;
  const controls = questionnaireMode === "hygiene" ? BASELINE_CONTROLS : CONTROLS;

  const groups = useMemo(() => {
    const m = new Map<string, typeof CONTROLS>();
    for (const c of controls) {
      if (!m.has(c.family)) m.set(c.family, []);
      m.get(c.family)!.push(c);
    }
    return Array.from(m.entries());
  }, [controls]);

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
      controls.filter((c) => pf[c.id]?.verdict === "Non-Compliant").map((c) => c.family)
    );
    if (flaggedFamilies.size === 0) return;
    priorExpanded.current = true;
    setOpen((o) => {
      const next = { ...o };
      flaggedFamilies.forEach((f) => { next[f] = true; });
      return next;
    });
  }, [sub, controls]);

  // Load the vendor's certification library (used both by the panel and to decide
  // whether a certification-mode answer is complete).
  const loadCerts = useCallback(async () => {
    try {
      const res = await fetch("/api/cert");
      if (!res.ok) throw new Error(await errorMessage(res, "Could not load your certifications."));
      const data = await res.json();
      setCerts(Array.isArray(data?.certs) ? data.certs : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load your certifications.");
    }
  }, [toast]);

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
        if (!cancelled) loadCerts();
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load your questionnaire.");
      }
    })();
    return () => { cancelled = true; };
  }, [router, reloadKey, loadCerts]);

  // Restore scroll position after state updates (prevents page-top-jump on save).
  useLayoutEffect(() => {
    if (scrollRestoreRef.current !== null) {
      window.scrollTo(0, scrollRestoreRef.current);
      scrollRestoreRef.current = null;
    }
  });

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
  // Cert types the vendor has uploaded to their library — a certification answer is
  // only complete when its certType is present here.
  const availableCertTypes = useMemo(() => new Set(certs.map((c) => c.certType)), [certs]);
  const answered = controls.filter((c) => isAnswered(answers[c.id], availableCertTypes)).length;
  const pct = controls.length ? Math.round((answered / controls.length) * 100) : 0;
  const allComplete = controls.length > 0 && answered === controls.length;
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
        scrollRestoreRef.current = window.scrollY;
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
        // Any successful edit clears the generic "incomplete" flag for this control;
        // it'll be recomputed/re-flagged on the next submit attempt if still pending.
        setIncompleteFlags((m) => {
          if (!m.has(controlId)) return m;
          const next = new Set(m);
          next.delete(controlId);
          return next;
        });
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

  // CompliQ chatbot — ask for guidance on a specific control.
  function openChat(controlId: string) {
    setChatControlId(controlId);
    setChatMessages([]);
    setChatInput("");
    setChatOpen(true);
  }

  async function sendChat() {
    if (!chatInput.trim() || !chatControlId || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    const history = [...chatMessages, { role: "user" as const, content: msg }];
    setChatMessages(history);
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlId: chatControlId, message: msg, history: chatMessages }),
      });
      const data = res.ok ? await res.json() : null;
      const reply = data?.reply ?? "Sorry, I couldn't get a response right now. Please try again.";
      setChatMessages([...history, { role: "assistant", content: reply }]);
    } catch {
      setChatMessages([...history, { role: "assistant", content: "Connection error — please retry." }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
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
      setIncompleteFlags((m) => {
        if (!m.has(controlId)) return m;
        const next = new Set(m);
        next.delete(controlId);
        return next;
      });
      toast.success(`Uploaded ${file.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading((s) => ({ ...s, [controlId]: false }));
    }
  }

  // ---- Certification library (upload once, reference everywhere) ----
  async function uploadCert(file: File) {
    if (!certUploadType) {
      toast.error("Choose a certificate type first.");
      return;
    }
    setCertBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("certType", certUploadType);
      const res = await fetch("/api/cert", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not upload certificate."));
      const data = await res.json();
      setCerts(Array.isArray(data?.certs) ? data.certs : []);
      setCertUploadType("");
      toast.success(`Uploaded ${file.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload certificate.");
    } finally {
      setCertBusy(false);
    }
  }

  async function deleteCert(id: string) {
    setCertDeleting((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/cert?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not remove certificate."));
      const data = await res.json();
      setCerts(Array.isArray(data?.certs) ? data.certs : []);
      toast.success("Certificate removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove certificate.");
    } finally {
      setCertDeleting((s) => { const next = { ...s }; delete next[id]; return next; });
    }
  }

  // Open every section that contains a flagged control so the vendor can see what to fix.
  const revealMissing = useCallback((ids: Set<string>) => {
    if (!ids.size) return;
    const families = new Set(controls.filter((c) => ids.has(c.id)).map((c) => c.family));
    setOpen((o) => {
      const next = { ...o };
      families.forEach((f) => { next[f] = true; });
      return next;
    });
  }, [controls]);

  async function submitAll() {
    // Client-side gate first for immediate feedback (matches the server's rule):
    // 1) N/A controls without a reason, 2) any other incomplete control.
    const clientMissing = controls.filter((c) => {
      const a = answers[c.id];
      return a && coverageOf(a) === "not_applicable" && !a.justification?.trim();
    }).map((c) => c.id);
    const clientIncomplete = controls.filter(
      (c) => !isAnswered(answers[c.id], availableCertTypes) && !clientMissing.includes(c.id)
    ).map((c) => c.id);
    if (clientMissing.length || clientIncomplete.length) {
      const missingSet = new Set(clientMissing);
      const incompleteSet = new Set(clientIncomplete);
      setMissingReasons(missingSet);
      setIncompleteFlags(incompleteSet);
      revealMissing(new Set([...clientMissing, ...clientIncomplete]));
      if (clientMissing.length) {
        toast.error(`${clientMissing.length} control${clientMissing.length > 1 ? "s" : ""} marked Not Applicable still ${clientMissing.length > 1 ? "need" : "needs"} a reason.`);
      } else {
        toast.error(`Complete all requirements to submit — ${clientIncomplete.length} still pending.`);
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/submission", { method: "PUT" });
      if (!res.ok) {
        // Server may return { error, missing: [...] } and/or { error, incomplete: [...] } —
        // surface and reveal the offenders for whichever it sent.
        let serverMissing: string[] = [];
        let serverIncomplete: string[] = [];
        try {
          const data = await res.clone().json();
          const arr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === "string") : [];
          serverMissing = arr(data?.missing);
          serverIncomplete = arr(data?.incomplete);
        } catch { /* not JSON */ }
        if (serverMissing.length) setMissingReasons(new Set(serverMissing));
        if (serverIncomplete.length) setIncompleteFlags(new Set(serverIncomplete));
        if (serverMissing.length || serverIncomplete.length) {
          revealMissing(new Set([...serverMissing, ...serverIncomplete]));
        }
        throw new Error(await errorMessage(res, "Could not submit for review."));
      }
      setSub(await res.json());
      setMissingReasons(new Set());
      setIncompleteFlags(new Set());
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
        <div className="flex items-start gap-4">
          <CompletionRing pct={pct} />
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold">Security Questionnaire</h1>
              <p className="text-sm text-muted">{answered} of {controls.length} complete · {submitted ? "submitted for review" : "draft"}{needsAttention > 0 && <span className="font-semibold text-danger"> · {needsAttention} returned for remediation</span>}</p>
              <SaveIndicator state={saveState} savedAt={savedAt} />
            </div>
            <button
              onClick={submitAll}
              disabled={submitting || submitted || !allComplete}
              title={!submitted && !allComplete ? "Complete all requirements to submit" : undefined}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitted ? <CheckCircle2 size={16} /> : <Send size={16} />}
              {submitted ? "Submitted" : submitting ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">{answered} / {controls.length} complete</span>
          <button
            onClick={() => setAll(!allOpen)}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:border-brand/50 hover:text-fg"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </section>

      {/* Baseline questionnaire banner — vendors with no specific regulatory scope */}
      {questionnaireMode === "hygiene" && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand" />
          <span className="text-fg">
            <span className="font-semibold">Basic Security Hygiene questionnaire</span>
            <span className="text-muted"> — a baseline set for vendors with no specific regulatory scope.</span>
          </span>
        </div>
      )}

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

      {/* My certifications — upload each certificate ONCE, reference it per control */}
      <section className="glass mb-6 rounded-2xl p-5">
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand" />
          <div>
            <h2 className="text-sm font-semibold">My certifications</h2>
            <p className="text-xs text-muted">Upload each certificate or attestation once — then reference it from any requirement without re-uploading.</p>
          </div>
        </div>

        {certs.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {certs.map((ct) => (
              <li key={ct.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <CheckCircle2 size={15} className="shrink-0 text-ok" />
                  <span className="shrink-0 rounded-md bg-ok/10 px-1.5 py-0.5 text-[11px] font-semibold text-ok">{CERT_SHORT[ct.certType]}</span>
                  <span className="truncate text-xs text-muted"><Paperclip size={11} className="mr-1 inline align-middle" />{ct.filename}</span>
                </div>
                <button
                  onClick={() => deleteCert(ct.id)}
                  disabled={!!certDeleting[ct.id] || submitted}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border text-muted transition hover:border-danger/50 hover:text-danger disabled:opacity-60"
                  aria-label={`Remove ${CERT_SHORT[ct.certType]} certificate`}
                >
                  {certDeleting[ct.id] ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-border bg-surface/40 px-3 py-2.5 text-xs text-muted">No certificates uploaded yet.</p>
        )}

        {!submitted && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="cert-upload-type" className="sr-only">Certificate type</label>
            <select
              id="cert-upload-type"
              value={certUploadType}
              disabled={certBusy}
              onChange={(e) => setCertUploadType((e.target.value || "") as CertType | "")}
              className="rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-60"
            >
              <option value="">Select a certificate type…</option>
              {CERT_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>{ct.label}</option>
              ))}
            </select>
            <input
              ref={certFileRef}
              type="file"
              hidden
              aria-label="Upload certificate file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCert(f); e.target.value = ""; }}
            />
            <button
              onClick={() => { if (!certUploadType) { toast.error("Choose a certificate type first."); return; } certFileRef.current?.click(); }}
              disabled={certBusy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium transition hover:border-brand/50 disabled:opacity-60"
            >
              {certBusy ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
              Upload certificate
            </button>
          </div>
        )}
      </section>


      {/* questionnaire — collapsible accordion grouped by control family */}
      <div className="space-y-3">
        {groups.map(([family, items]) => {
          const total = items.length;
          const done = items.filter((c) => isAnswered(answers[c.id], availableCertTypes)).length;
          const flaggedReason = items.filter((c) => missingReasons.has(c.id)).length;
          const flaggedIncomplete = items.filter((c) => incompleteFlags.has(c.id)).length;
          const flagged = flaggedReason + flaggedIncomplete;
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
                      <AlertTriangle size={11} /> {flaggedReason > 0 ? "needs a reason" : "incomplete"}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {items.map((c) => {
                      const a = answers[c.id];
                      const complete = isAnswered(a, availableCertTypes);
                      const returned = sub.reviews?.[c.id]?.status === "open";
                      return (
                        <span
                          key={c.id}
                          title={`${c.id}: ${returned ? "returned" : complete ? "complete" : "pending"}`}
                          className={cn(
                            "inline-block h-1.5 w-1.5 rounded-full",
                            returned ? "bg-danger" : complete ? "bg-ok" : "border border-border bg-surface-2"
                          )}
                        />
                      );
                    })}
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", done === total ? "bg-ok/10 text-ok" : "bg-surface-2 text-muted")}>
                    {done} / {total}
                  </span>
                </div>
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
                        const incompleteFlag = incompleteFlags.has(c.id) && !needsReason;
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
                          <div key={c.id} className={cn("rounded-2xl border border-border bg-surface/40 p-4", (needsReason || incompleteFlag) && "border-danger/50")}>
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
                              {!saving[c.id] && isAnswered(a, availableCertTypes) && <CheckCircle2 size={15} className="mt-1 shrink-0 text-ok" />}
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

                            <div className="mt-2 flex items-start justify-between gap-2">
                              <div className="flex flex-1 items-start gap-1.5 rounded-lg bg-surface-2/50 p-2 text-xs text-muted">
                                <FileText size={12} className="mt-0.5 shrink-0" /><span>{c.rfi}</span>
                              </div>
                              <button
                                onClick={() => openChat(c.id)}
                                title="Ask CompliQ for evidence guidance"
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-brand/30 bg-brand/5 px-2 py-1.5 text-[11px] font-semibold text-brand hover:bg-brand/10 transition"
                              >
                                <MessageCircle size={11} /> Ask CompliQ
                              </button>
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

                                {/* Reference the certification library — no per-control upload */}
                                {a?.certType && (
                                  availableCertTypes.has(a.certType) ? (
                                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-ok">
                                      <CheckCircle2 size={13} className="shrink-0" />
                                      Uses your {CERT_SHORT[a.certType]} from My certifications
                                    </p>
                                  ) : (
                                    <p className="mt-2 inline-flex items-start gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-2 py-1.5 text-xs font-medium text-warn">
                                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                                      Upload your {CERT_SHORT[a.certType]} in My certifications above to complete this.
                                    </p>
                                  )
                                )}
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
                                {/* Password hint for encrypted PDFs */}
                                {!locked && (a?.evidence ?? []).length === 0 && (
                                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
                                    <Lock size={10} className="shrink-0" />
                                    Uploading a password-protected PDF? Attach it and note the password in your response above so the assessor can access it.
                                  </p>
                                )}
                              </>
                            )}

                            {incompleteFlag && (
                              <p className="mt-2 text-xs font-medium text-danger" role="alert">Complete this requirement before you can submit.</p>
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
      {/* CompliQ chat panel — slides in from bottom-right */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-6 right-6 z-50 flex w-[min(95vw,380px)] flex-col glass rounded-2xl shadow-glow border border-border overflow-hidden"
            style={{ maxHeight: "70vh" }}
          >
            {/* Chat header */}
            <div className="flex items-center justify-between gap-2 border-b border-border bg-brand/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageCircle size={16} className="text-brand" />
                <span className="text-sm font-semibold text-brand">CompliQ</span>
                {chatControlId && <span className="rounded-md bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] text-brand">{chatControlId}</span>}
              </div>
              <button onClick={() => setChatOpen(false)} aria-label="Close CompliQ" className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted hover:text-fg"><X size={14} /></button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ minHeight: 180 }}>
              {chatMessages.length === 0 && (
                <div className="text-center py-6 text-xs text-muted">
                  <MessageCircle size={24} className="mx-auto mb-2 text-brand/40" />
                  <p className="font-medium text-fg">Hi! I'm CompliQ.</p>
                  <p className="mt-1">Ask me what evidence is typically needed for this control and I'll guide you.</p>
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
                    m.role === "user" ? "bg-brand text-white rounded-br-md" : "bg-surface-2 text-fg rounded-bl-md border border-border"
                  )}>
                    {m.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
                    <Loader2 size={13} className="animate-spin" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder="Ask about evidence requirements…"
                  rows={2}
                  disabled={chatLoading}
                  className="flex-1 resize-none rounded-xl border border-border bg-surface/60 px-3 py-2 text-xs outline-none focus:border-brand disabled:opacity-60"
                />
                <button
                  onClick={sendChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60"
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
