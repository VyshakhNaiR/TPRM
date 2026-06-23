"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Paperclip, FileText, CheckCircle2, UploadCloud, Send, LogOut, Loader2 } from "lucide-react";
import { CONTROLS } from "@/data/seed";
import type { Submission } from "@/lib/store";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ErrorState, Toaster, errorMessage, useToasts } from "@/components/ui";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

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
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toast = useToasts();

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

  const groups = useMemo(() => {
    const m = new Map<string, typeof CONTROLS>();
    for (const c of CONTROLS) {
      if (!m.has(c.family)) m.set(c.family, []);
      m.get(c.family)!.push(c);
    }
    return Array.from(m.entries());
  }, []);

  const answers = sub?.answers ?? {};
  const answered = CONTROLS.filter((c) => answers[c.id] && (answers[c.id].response?.trim() || answers[c.id].applicable === false)).length;
  const pct = Math.round((answered / CONTROLS.length) * 100);
  const submitted = sub?.status === "submitted";
  const needsAttention = Object.values((sub?.reviews ?? {}) as Record<string, { status: string }>).filter((r) => r.status === "open").length;

  const save = useCallback(
    async (controlId: string, patch: { response?: string; applicable?: boolean }) => {
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
      } catch (e) {
        setSaveState("error");
        toast.error(e instanceof Error ? e.message : "Could not save your answer.");
      } finally {
        setSaving((s) => ({ ...s, [controlId]: false }));
      }
    },
    [toast]
  );

  // Debounced autosave for the free-text response (~1.5s after typing stops).
  const queueAutosave = useCallback(
    (controlId: string, value: string) => {
      setSaveState("dirty");
      if (debounceTimers.current[controlId]) clearTimeout(debounceTimers.current[controlId]);
      debounceTimers.current[controlId] = setTimeout(() => {
        delete debounceTimers.current[controlId];
        save(controlId, { response: value });
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

  async function submitAll() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/submission", { method: "PUT" });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not submit for review."));
      setSub(await res.json());
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
      </section>

      {/* questionnaire */}
      <div className="space-y-6">
        {groups.map(([family, items]) => (
          <section key={family}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{family}</h2>
            <div className="space-y-3">
              {items.map((c) => {
                const a = answers[c.id];
                const na = a?.applicable === false;
                const rev = sub.reviews?.[c.id];
                // A returned (open) finding re-opens the control even after submission.
                const locked = submitted && !(rev && rev.status === "open");
                return (
                  <div key={c.id} className="glass rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-mono text-[10px] text-muted">{c.id}</span>
                        <p className="text-sm font-medium leading-snug">{c.question}</p>
                      </div>
                      {saving[c.id] && <Loader2 size={14} className="mt-1 shrink-0 animate-spin text-muted" />}
                      {!saving[c.id] && a && (a.response?.trim() || na) && <CheckCircle2 size={15} className="mt-1 shrink-0 text-ok" />}
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

                    <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={na}
                        disabled={locked}
                        onChange={(e) => save(c.id, { applicable: !e.target.checked })}
                      />
                      Not applicable to our engagement
                    </label>

                    {!na && (
                      <>
                        <label htmlFor={`response-${c.id}`} className="sr-only">Response for {c.id}</label>
                        <textarea
                          id={`response-${c.id}`}
                          defaultValue={a?.response ?? ""}
                          disabled={locked}
                          onChange={(e) => { if (!locked) queueAutosave(c.id, e.target.value); }}
                          onBlur={(e) => { cancelAutosave(c.id); if (!locked && e.target.value !== (a?.response ?? "")) save(c.id, { response: e.target.value }); }}
                          placeholder="Your response…"
                          rows={2}
                          className="mt-2 w-full resize-y rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand"
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
          </section>
        ))}
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
