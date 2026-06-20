"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Paperclip, FileText, CheckCircle2, UploadCloud, Send, LogOut, Loader2 } from "lucide-react";
import { CONTROLS } from "@/data/seed";
import type { Submission } from "@/lib/store";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export default function VendorPortal() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sub, setSub] = useState<Submission | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    (async () => {
      const me = await (await fetch("/api/me")).json();
      if (!me.session || me.session.role !== "vendor") {
        router.push("/login");
        return;
      }
      setName(me.session.name);
      setSub(await (await fetch("/api/submission")).json());
    })();
  }, [router]);

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

  async function save(controlId: string, patch: { response?: string; applicable?: boolean }) {
    setSaving((s) => ({ ...s, [controlId]: true }));
    const res = await fetch("/api/submission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controlId, ...patch }),
    });
    if (res.ok) setSub(await res.json());
    setSaving((s) => ({ ...s, [controlId]: false }));
  }

  async function upload(controlId: string, file: File) {
    setUploading((s) => ({ ...s, [controlId]: true }));
    const fd = new FormData();
    fd.append("file", file);
    fd.append("controlId", controlId);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.ok) setSub((await res.json()).submission);
    setUploading((s) => ({ ...s, [controlId]: false }));
  }

  async function submitAll() {
    setSubmitting(true);
    const res = await fetch("/api/submission", { method: "PUT" });
    if (res.ok) setSub(await res.json());
    setSubmitting(false);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
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
            <p className="text-sm text-muted">{answered} of {CONTROLS.length} answered · {submitted ? "submitted for review" : "draft"}</p>
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

                    <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-surface-2/50 p-2 text-[11px] text-muted">
                      <FileText size={12} className="mt-0.5 shrink-0" /><span>{c.rfi}</span>
                    </div>

                    <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={na}
                        disabled={submitted}
                        onChange={(e) => save(c.id, { applicable: !e.target.checked })}
                      />
                      Not applicable to our engagement
                    </label>

                    {!na && (
                      <>
                        <textarea
                          defaultValue={a?.response ?? ""}
                          disabled={submitted}
                          onBlur={(e) => { if (e.target.value !== (a?.response ?? "")) save(c.id, { response: e.target.value }); }}
                          placeholder="Your response…"
                          rows={2}
                          className="mt-2 w-full resize-y rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand"
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            ref={(el) => { fileRefs.current[c.id] = el; }}
                            type="file"
                            hidden
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(c.id, f); e.target.value = ""; }}
                          />
                          <button
                            onClick={() => fileRefs.current[c.id]?.click()}
                            disabled={submitted || uploading[c.id]}
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
    </main>
  );
}
