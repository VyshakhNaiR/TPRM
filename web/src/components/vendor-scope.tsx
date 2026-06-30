"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Target, ChevronDown, Loader2, Send, Clock, CheckCircle2, XCircle } from "lucide-react";
import { errorMessage, useToasts, Toaster } from "@/components/ui";
import type { AssessmentScope, ScopeChangeRequest } from "@/lib/users";
import { cn } from "@/lib/utils";

const HOSTING_LABEL: Record<string, string> = { on_prem: "On-premise", cloud: "Cloud", hybrid: "Hybrid" };
const CLASSIFICATION_LABEL: Record<string, string> = { public: "Public", internal: "Internal", confidential: "Confidential", regulated: "Regulated / PII" };
const ACCESS_LABEL: Record<string, string> = { none: "No access", read: "Read-only", privileged: "Privileged" };
const CONNECTIVITY_LABEL: Record<string, string> = { none: "None", api: "API", vpn: "VPN", dedicated: "Dedicated link" };
const cap = (s?: string) => (s ? s[0].toUpperCase() + s.slice(1) : "");

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 text-sm">
      <span className="min-w-[140px] shrink-0 font-medium text-muted">{label}</span>
      <span className="text-fg">{children}</span>
    </div>
  );
}

// Read-only scope card shown to the vendor, with a "Request scope change" flow.
export function VendorScope() {
  const toast = useToasts();
  const [scope, setScope] = useState<AssessmentScope | null>(null);
  const [requests, setRequests] = useState<ScopeChangeRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);
  // Portal target guard — the modal must render at <body>, not inside this
  // .glass section (its backdrop-filter would otherwise clip a position:fixed child).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  async function load() {
    try {
      const r = await fetch("/api/scope");
      if (r.ok) { const d = await r.json(); setScope(d.scope); setRequests(d.requests ?? []); }
    } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, []);

  async function submitRequest() {
    if (justification.trim().length < 10) { toast.error("Please describe the change (min. 10 characters)."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/scope/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ justification: justification.trim() }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not submit your request."));
      toast.success("Scope-change request sent to your assessor.");
      setModalOpen(false);
      setJustification("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit your request.");
    } finally { setSaving(false); }
  }

  if (!scope) return null;
  const isEmpty = !scope.name && scope.services.length === 0 && scope.applications.length === 0 && !scope.dataClassification;
  const pending = requests.find((r) => r.status === "pending");
  const lastDecided = requests.find((r) => r.status !== "pending");

  return (
    <section className="glass mb-6 overflow-hidden rounded-2xl">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left">
        <div className="flex items-center gap-2.5">
          <Target size={18} className="shrink-0 text-brand" />
          <div>
            <h2 className="text-sm font-semibold">Assessment scope{scope.name ? ` — ${scope.name}` : ""}</h2>
            <p className="text-xs text-muted">Defined by your assessor · v{scope.version} · {scope.frameworks.join(", ")}{pending && <span className="font-medium text-warn"> · change request pending</span>}</p>
          </div>
        </div>
        <ChevronDown size={18} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border px-5 py-4">
          {isEmpty ? (
            <p className="text-sm text-muted">Your assessor has not published a detailed scope yet. The questionnaire reflects your assigned frameworks ({scope.frameworks.join(", ")}).</p>
          ) : (
            <div className="grid gap-x-8 gap-y-1 lg:grid-cols-2">
              {scope.type && <Field label="Type">{scope.type}</Field>}
              {(scope.periodStart || scope.periodEnd) && <Field label="Period">{scope.periodStart || "—"} → {scope.periodEnd || "—"}</Field>}
              <Field label="Frameworks">{scope.frameworks.join(", ")}</Field>
              {scope.hostingModel && <Field label="Hosting">{HOSTING_LABEL[scope.hostingModel]}{scope.cloudProvider ? ` · ${scope.cloudProvider}` : ""}</Field>}
              {scope.dataClassification && <Field label="Data classification">{CLASSIFICATION_LABEL[scope.dataClassification]}</Field>}
              {scope.accessLevel && <Field label="Access level">{ACCESS_LABEL[scope.accessLevel]}</Field>}
              {scope.businessCriticality && <Field label="Business criticality">{cap(scope.businessCriticality)}</Field>}
              {scope.dataVolume && <Field label="Data volume">{cap(scope.dataVolume)}</Field>}
              {scope.connectivity && <Field label="Connectivity">{CONNECTIVITY_LABEL[scope.connectivity]}</Field>}
              {scope.crossBorderTransfer && <Field label="Cross-border">Data transferred across borders</Field>}
              {scope.regions.length > 0 && <Field label="Data residency">{scope.regions.join(", ")}</Field>}
              {scope.dataTypes.length > 0 && <Field label="Data types">{scope.dataTypes.join(", ")}</Field>}
              {scope.services.length > 0 && <Field label="Services">{scope.services.map((x) => x.name).join(", ")}</Field>}
              {scope.applications.length > 0 && <Field label="Applications">{scope.applications.map((x) => x.name).join(", ")}</Field>}
              {scope.subcontractors.length > 0 && <Field label="Subcontractors">{scope.subcontractors.map((x) => x.name).join(", ")}</Field>}
              {scope.outOfScope && <Field label="Out of scope">{scope.outOfScope}</Field>}
            </div>
          )}

          {/* Request status / action */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div className="text-xs">
              {pending ? (
                <span className="inline-flex items-center gap-1.5 text-warn"><Clock size={13} /> Change request pending assessor review</span>
              ) : lastDecided ? (
                <span className={cn("inline-flex items-center gap-1.5", lastDecided.status === "approved" ? "text-ok" : "text-muted")}>
                  {lastDecided.status === "approved" ? <CheckCircle2 size={13} /> : <XCircle size={13} />} Last request {lastDecided.status}
                </span>
              ) : (
                <span className="text-muted">Scope looks wrong? Ask your assessor to adjust it.</span>
              )}
            </div>
            <button onClick={() => setModalOpen(true)} disabled={!!pending} className="inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-semibold transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50">
              Request scope change
            </button>
          </div>
        </div>
      )}

      {/* Request modal — portalled to <body> so the section's backdrop-filter
          can't clip it (that was the "not in frame / corrupted" bug). */}
      {mounted && modalOpen && createPortal(
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setModalOpen(false)} role="presentation">
          <div onClick={(e) => e.stopPropagation()} className="glass w-full max-w-lg rounded-2xl border border-border p-5 shadow-glow">
            <h3 className="text-base font-semibold">Request a scope change</h3>
            <p className="mt-1 text-sm text-muted">Describe what should change and why. Your assessor reviews every request; approved changes are versioned and audited.</p>
            <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={5} placeholder="e.g. The 'Billing API' application was decommissioned in Q1 and should be removed from scope." className="mt-3 w-full rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted hover:text-fg">Cancel</button>
              <button onClick={submitRequest} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}{saving ? "Sending…" : "Send request"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <Toaster toasts={toast.toasts} onDismiss={toast.dismiss} />
    </section>
  );
}
