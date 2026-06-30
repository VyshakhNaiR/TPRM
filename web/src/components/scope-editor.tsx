"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, Save, CheckCircle2, XCircle, Clock, Sparkles, FileText } from "lucide-react";
import { errorMessage, useToasts, Toaster } from "@/components/ui";
import type { AssessmentScope, ScopeChangeRequest } from "@/lib/users";
import { cn } from "@/lib/utils";

const FRAMEWORK_OPTS = ["RBI", "MAS", "SEBI", "None"];
const HOSTING_OPTS: { value: AssessmentScope["hostingModel"]; label: string }[] = [
  { value: "on_prem", label: "On-premise" },
  { value: "cloud", label: "Cloud" },
  { value: "hybrid", label: "Hybrid" },
];
const TYPE_OPTS = ["Onboarding", "Annual", "Re-assessment", "Ad-hoc"];
const CLASSIFICATION_OPTS = [
  { value: "public", label: "Public" },
  { value: "internal", label: "Internal" },
  { value: "confidential", label: "Confidential" },
  { value: "regulated", label: "Regulated / PII" },
];
const ACCESS_OPTS = [
  { value: "none", label: "No access" },
  { value: "read", label: "Read-only" },
  { value: "privileged", label: "Privileged" },
];
const LEVEL_OPTS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
const CONNECTIVITY_OPTS = [
  { value: "none", label: "None" },
  { value: "api", label: "API" },
  { value: "vpn", label: "VPN" },
  { value: "dedicated", label: "Dedicated link" },
];

const input = "w-full rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand";
const labelCls = "block text-xs font-semibold text-muted";

function empty(): AssessmentScope {
  return { services: [], applications: [], regions: [], dataTypes: [], subcontractors: [], frameworks: ["None"], status: "draft", version: 1 };
}

// Merge AI-inferred scope into the current form: an inferred value wins only when
// it's non-empty, so the assessor never loses fields the document didn't cover.
function mergeScope(cur: AssessmentScope, ai: Partial<AssessmentScope>): AssessmentScope {
  const out: AssessmentScope = { ...cur };
  const scalars: (keyof AssessmentScope)[] = ["name", "type", "periodStart", "periodEnd", "hostingModel", "cloudProvider", "dataClassification", "accessLevel", "businessCriticality", "dataVolume", "connectivity", "outOfScope"];
  for (const k of scalars) { const v = ai[k]; if (v) (out as any)[k] = v; }
  const lists: (keyof AssessmentScope)[] = ["services", "applications", "subcontractors", "regions", "dataTypes"];
  for (const k of lists) { const v = ai[k] as unknown[] | undefined; if (Array.isArray(v) && v.length) (out as any)[k] = v; }
  if (Array.isArray(ai.frameworks) && ai.frameworks.length && !(ai.frameworks.length === 1 && ai.frameworks[0] === "None")) out.frameworks = ai.frameworks;
  if (ai.crossBorderTransfer) out.crossBorderTransfer = true;
  return out;
}

export function ScopeEditor({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const toast = useToasts();
  const [scope, setScope] = useState<AssessmentScope>(empty());
  const [requests, setRequests] = useState<ScopeChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [scopeDoc, setScopeDoc] = useState<{ filename: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/scope?vendorId=${encodeURIComponent(vendorId)}`);
      if (r.ok) {
        const d = await r.json();
        setScope({ ...empty(), ...d.scope });
        setRequests(d.requests ?? []);
        setScopeDoc(d.scopeDoc ?? null);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [vendorId]);
  useEffect(() => { load(); }, [load]);

  function patch(p: Partial<AssessmentScope>) { setScope((s) => ({ ...s, ...p })); }
  function toggleFramework(f: string) {
    setScope((s) => {
      const has = s.frameworks.includes(f);
      let next = has ? s.frameworks.filter((x) => x !== f) : [...s.frameworks.filter((x) => x !== "None"), f];
      if (f === "None") next = ["None"];
      if (next.length === 0) next = ["None"];
      return { ...s, frameworks: next };
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/scope", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, scope }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not save scope."));
      const d = await res.json();
      setScope({ ...empty(), ...d.scope });
      toast.success(`Scope saved (v${d.scope.version}). Questionnaire set to ${d.scope.frameworks.join("/")}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save scope.");
    } finally { setSaving(false); }
  }

  // Upload a scope document (Excel/PDF/Word) → AI structures it → merge the
  // inferred fields into the form (assessor reviews + edits before saving).
  async function autofill(file: File) {
    setAutofilling(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/scope/extract", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not read that document."));
      const { scope: ai, method } = await res.json();
      setScope((cur) => mergeScope(cur, ai));
      toast.success(method === "ai" ? "Scope auto-filled from the document — review and edit before saving." : "Scope drafted from the document (no AI configured) — please review.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that document.");
    } finally {
      setAutofilling(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function decide(req: ScopeChangeRequest, decision: "approved" | "rejected") {
    try {
      const res = await fetch("/api/scope/request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, requestId: req.id, decision }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not record the decision."));
      toast.success(`Request ${decision}.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the decision.");
    }
  }

  const pending = requests.filter((r) => r.status === "pending");

  if (loading) return <div className="grid place-items-center py-16 text-muted"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-5">
      {/* Pending change requests */}
      {pending.length > 0 && (
        <section className="glass overflow-hidden rounded-2xl border border-warn/40">
          <div className="border-b border-border bg-warn/10 px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-warn"><Clock size={15} /> {pending.length} pending scope-change request{pending.length > 1 ? "s" : ""}</h3>
          </div>
          <div className="divide-y divide-border/60">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted">{r.requestedBy} · {new Date(r.createdAt).toLocaleString("en-GB")}</div>
                  <p className="mt-0.5 text-sm">{r.justification}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => decide(r, "approved")} className="inline-flex items-center gap-1.5 rounded-xl border border-ok/50 bg-ok/10 px-3 py-1.5 text-xs font-semibold text-ok hover:brightness-110"><CheckCircle2 size={13} /> Approve</button>
                  <button onClick={() => decide(r, "rejected")} className="inline-flex items-center gap-1.5 rounded-xl border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger hover:brightness-110"><XCircle size={13} /> Reject</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Scope editor */}
      <section className="glass overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold">Assessment scope — {vendorName}</h3>
            <p className="text-xs text-muted">Assessor-defined. Vendors view this read-only and must request changes. <span className="font-medium text-fg">v{scope.version}</span> · <span className={cn("font-medium", scope.status === "active" ? "text-ok" : "text-muted")}>{scope.status}</span>{scopeDoc && <span> · <span className="inline-flex items-center gap-1 text-brand"><FileText size={11} /> {scopeDoc.filename}</span></span>}</p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) autofill(f); }} />
            <button onClick={() => fileRef.current?.click()} disabled={autofilling} title="Upload a scope document (Excel/PDF/Word) and let AI fill the fields" className="inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/5 px-3.5 py-2 text-sm font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-60">
              {autofilling ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{autofilling ? "Reading…" : "Auto-fill from document"}
            </button>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{saving ? "Saving…" : "Save scope"}
            </button>
          </div>
        </div>

        <div className="space-y-6 p-5">
          {/* Header fields */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className={labelCls}>Assessment name<input className={cn(input, "mt-1")} value={scope.name ?? ""} onChange={(e) => patch({ name: e.target.value })} placeholder="2026 Annual TPRM" /></label>
            <label className={labelCls}>Type
              <select className={cn(input, "mt-1")} value={scope.type ?? ""} onChange={(e) => patch({ type: e.target.value })}>
                <option value="">—</option>
                {TYPE_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className={labelCls}>Period start<input type="date" className={cn(input, "mt-1")} value={scope.periodStart ?? ""} onChange={(e) => patch({ periodStart: e.target.value })} /></label>
            <label className={labelCls}>Period end<input type="date" className={cn(input, "mt-1")} value={scope.periodEnd ?? ""} onChange={(e) => patch({ periodEnd: e.target.value })} /></label>
          </div>

          {/* Hosting + frameworks */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelCls}>Hosting model
              <select className={cn(input, "mt-1")} value={scope.hostingModel ?? ""} onChange={(e) => patch({ hostingModel: (e.target.value || undefined) as AssessmentScope["hostingModel"] })}>
                <option value="">—</option>
                {HOSTING_OPTS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </label>
            <label className={labelCls}>Cloud provider<input className={cn(input, "mt-1")} value={scope.cloudProvider ?? ""} onChange={(e) => patch({ cloudProvider: e.target.value })} placeholder="AWS / Azure / GCP" disabled={scope.hostingModel === "on_prem"} /></label>
            <div>
              <span className={labelCls}>Frameworks <span className="font-normal">(drive the questionnaire)</span></span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {FRAMEWORK_OPTS.map((f) => (
                  <button key={f} type="button" onClick={() => toggleFramework(f)} className={cn("rounded-lg border px-2.5 py-1 text-xs font-medium transition", scope.frameworks.includes(f) ? "border-brand bg-brand/10 text-brand" : "border-border text-muted hover:text-fg")}>{f}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Risk-mapping parameters — drive the inherent-risk tier + framework applicability */}
          <div className="rounded-xl border border-border/70 bg-surface-2/30 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Risk profile (drives the inherent-risk tier)</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className={labelCls}>Data classification
                <select className={cn(input, "mt-1")} value={scope.dataClassification ?? ""} onChange={(e) => patch({ dataClassification: (e.target.value || undefined) as AssessmentScope["dataClassification"] })}>
                  <option value="">—</option>
                  {CLASSIFICATION_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className={labelCls}>Access to bank systems/data
                <select className={cn(input, "mt-1")} value={scope.accessLevel ?? ""} onChange={(e) => patch({ accessLevel: (e.target.value || undefined) as AssessmentScope["accessLevel"] })}>
                  <option value="">—</option>
                  {ACCESS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className={labelCls}>Business criticality
                <select className={cn(input, "mt-1")} value={scope.businessCriticality ?? ""} onChange={(e) => patch({ businessCriticality: (e.target.value || undefined) as AssessmentScope["businessCriticality"] })}>
                  <option value="">—</option>
                  {LEVEL_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className={labelCls}>Data volume
                <select className={cn(input, "mt-1")} value={scope.dataVolume ?? ""} onChange={(e) => patch({ dataVolume: (e.target.value || undefined) as AssessmentScope["dataVolume"] })}>
                  <option value="">—</option>
                  {LEVEL_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className={labelCls}>Connectivity / integration
                <select className={cn(input, "mt-1")} value={scope.connectivity ?? ""} onChange={(e) => patch({ connectivity: (e.target.value || undefined) as AssessmentScope["connectivity"] })}>
                  <option value="">—</option>
                  {CONNECTIVITY_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-muted">
                <input type="checkbox" checked={!!scope.crossBorderTransfer} onChange={(e) => patch({ crossBorderTransfer: e.target.checked })} className="accent-brand" />
                Cross-border data transfer
              </label>
            </div>
          </div>

          {/* Data residency + data types */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>Data residency / regions <span className="font-normal">(comma-separated)</span><input className={cn(input, "mt-1")} value={scope.regions.join(", ")} onChange={(e) => patch({ regions: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="India, Singapore" /></label>
            <label className={labelCls}>Data types <span className="font-normal">(comma-separated)</span><input className={cn(input, "mt-1")} value={scope.dataTypes.join(", ")} onChange={(e) => patch({ dataTypes: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="PII, Cardholder data, KYC" /></label>
          </div>

          <RowList label="Services in scope" rows={scope.services} onChange={(services) => patch({ services })} fields={[{ key: "name", placeholder: "Service name" }, { key: "description", placeholder: "Description" }]} />
          <RowList label="Applications" rows={scope.applications} onChange={(applications) => patch({ applications })} fields={[{ key: "name", placeholder: "Application" }, { key: "url", placeholder: "URL" }, { key: "description", placeholder: "Description" }]} />
          <RowList label="Subcontractors / fourth parties" rows={scope.subcontractors} onChange={(subcontractors) => patch({ subcontractors })} fields={[{ key: "name", placeholder: "Subcontractor" }, { key: "service", placeholder: "Service provided" }]} />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>Explicitly out of scope<textarea className={cn(input, "mt-1 min-h-[72px]")} value={scope.outOfScope ?? ""} onChange={(e) => patch({ outOfScope: e.target.value })} placeholder="Systems / data excluded from this assessment" /></label>
            <label className={labelCls}>Scope status
              <select className={cn(input, "mt-1")} value={scope.status} onChange={(e) => patch({ status: e.target.value as AssessmentScope["status"] })}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      {/* Decided history */}
      {requests.some((r) => r.status !== "pending") && (
        <section className="glass overflow-hidden rounded-2xl">
          <div className="border-b border-border px-5 py-3"><h3 className="text-sm font-semibold">Scope-change history</h3></div>
          <div className="divide-y divide-border/60">
            {requests.filter((r) => r.status !== "pending").map((r) => (
              <div key={r.id} className="px-5 py-2.5 text-xs">
                <span className={cn("font-semibold", r.status === "approved" ? "text-ok" : "text-danger")}>{r.status}</span>
                <span className="text-muted"> · {r.requestedBy} · {new Date(r.createdAt).toLocaleDateString("en-GB")}{r.decidedBy ? ` · by ${r.decidedBy}` : ""}</span>
                <p className="mt-0.5 text-fg">{r.justification}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <Toaster toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  );
}

// Repeatable list of objects with a small set of text fields.
function RowList<T extends Record<string, string | undefined>>({
  label, rows, onChange, fields,
}: {
  label: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  fields: { key: keyof T & string; placeholder: string }[];
}) {
  function set(i: number, key: string, value: string) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className={labelCls}>{label}</span>
        <button type="button" onClick={() => onChange([...rows, fields.reduce((o, f) => ({ ...o, [f.key]: "" }), {}) as T])} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted hover:text-fg"><Plus size={12} /> Add</button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted/70">None defined.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            {fields.map((f) => (
              <input key={f.key} className={input} value={r[f.key] ?? ""} onChange={(e) => set(i, f.key, e.target.value)} placeholder={f.placeholder} />
            ))}
            <button type="button" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="Remove" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border text-muted hover:text-danger"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
