"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  LogOut,
  FileSignature,
  ListChecks,
  BadgeCheck,
  ListPlus,
  Plus,
  Trash2,
  Paperclip,
  CalendarClock,
  AlertTriangle,
  Loader2,
  Check,
  X,
  Minus,
  Bell,
} from "lucide-react";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ErrorState, Toaster, errorMessage, useToasts } from "@/components/ui";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Types (mirror the backend shapes — see src/lib/compliance.ts)      */
/* ------------------------------------------------------------------ */

interface VendorRow { vendorId: string; name: string; answered: number; total: number; status: string }
interface Reminder { kind: string; title: string; due?: string; days: number | null; severity: "overdue" | "soon" | "ok" }
interface ContractFile { id?: string; filename: string; size?: number }
interface ClauseCheck { key: string; present: boolean | null; note?: string }
interface ClauseTemplate { key: string; label: string; frameworks: string[] }
interface Contract {
  id: string;
  title: string;
  counterparty: string;
  startDate?: string;
  renewalDate?: string;
  expiryDate?: string;
  file?: ContractFile;
  clauses: ClauseCheck[];
  createdBy: string;
  createdAt: string;
}
type Recurrence = "none" | "monthly" | "quarterly" | "annual";
type ObligationStatus = "open" | "in_progress" | "done";
type ObligationSource = "contract" | "regulation" | "finding" | "manual";
interface Obligation {
  id: string;
  title: string;
  description?: string;
  owner?: string;
  dueDate?: string;
  recurrence: Recurrence;
  source: ObligationSource;
  status: ObligationStatus;
}
type ComplianceState = "valid" | "expiring" | "expired" | "in_progress" | "missing";
interface Compliance {
  id: string;
  framework: string;
  status: ComplianceState;
  issuedDate?: string;
  expiryDate?: string;
  file?: ContractFile;
  note?: string;
}
interface CatalogItem { id: string; name: string; description?: string; custom: boolean }

type Tab = "contracts" | "obligations" | "compliances" | "custom";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const inputCls =
  "w-full rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-60";

const FRAMEWORK_VAR: Record<string, string> = { MAS: "mas", RBI: "rbi", SEBI: "sebi" };

// days until a date string (negative => past). null when no date.
function daysUntil(date?: string): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function fmtDate(date?: string): string {
  if (!date) return "—";
  const d = new Date(date);
  return isNaN(d.getTime()) ? date : d.toLocaleDateString();
}

const COMPLIANCE_TONE: Record<ComplianceState, string> = {
  valid: "text-ok border-ok/40 bg-ok/10",
  expiring: "text-warn border-warn/40 bg-warn/10",
  expired: "text-danger border-danger/40 bg-danger/10",
  in_progress: "text-brand border-brand/40 bg-brand/10",
  missing: "text-muted border-border bg-surface-2",
};

/** Small due/overdue/soon badge for a date. */
function DueBadge({ date, label }: { date?: string; label: string }) {
  const d = daysUntil(date);
  if (d === null) return null;
  if (d < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">
        <AlertTriangle size={10} /> {label} overdue {Math.abs(d)}d
      </span>
    );
  }
  if (d <= 60) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[10px] font-semibold text-warn">
        <CalendarClock size={10} /> {label} in {d}d
      </span>
    );
  }
  return null;
}

function Field({ label, children, htmlFor }: { label: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs">
      <span className="font-semibold uppercase tracking-wider text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function FrameworkChips({ frameworks }: { frameworks: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {frameworks.map((f) => (
        <span
          key={f}
          className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold"
          style={{
            color: `rgb(var(--${FRAMEWORK_VAR[f] ?? "muted"}))`,
            borderColor: `rgb(var(--${FRAMEWORK_VAR[f] ?? "border"}) / 0.4)`,
            background: `rgb(var(--${FRAMEWORK_VAR[f] ?? "surface-2"}) / 0.1)`,
          }}
        >
          {f}
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                              */
/* ------------------------------------------------------------------ */

export default function CompliancePage() {
  const router = useRouter();
  const toast = useToasts();

  const [role, setRole] = useState("");
  const canManage = role === "assessor" || role === "root";

  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [vendorId, setVendorId] = useState("apex");
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const [tab, setTab] = useState<Tab>("contracts");
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // tab data
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [clauseTemplate, setClauseTemplate] = useState<ClauseTemplate[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [compliances, setCompliances] = useState<Compliance[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);

  /* ---- initial gate + vendor list ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError("");
      try {
        const meRes = await fetch("/api/me");
        if (!meRes.ok) throw new Error(await errorMessage(meRes, "Could not verify your session."));
        const me = await meRes.json();
        const r = me.session?.role;
        if (r !== "assessor" && r !== "root") { router.push("/login"); return; }
        if (cancelled) return;
        setRole(r);
        const vRes = await fetch("/api/vendors");
        if (!vRes.ok) throw new Error(await errorMessage(vRes, "Could not load the vendor list."));
        if (cancelled) return;
        const vs: VendorRow[] = (await vRes.json()).vendors ?? [];
        setVendors(vs);
        if (vs.length && !vs.some((v) => v.vendorId === "apex")) setVendorId(vs[0].vendorId);
        setLoaded(true);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load the compliance workspace.");
      }
    })();
    return () => { cancelled = true; };
  }, [router, reloadKey]);

  /* ---- reminders strip (per vendor) ---- */
  const loadReminders = useCallback(async () => {
    try {
      const r = await fetch(`/api/reminders?vendorId=${encodeURIComponent(vendorId)}`);
      if (r.ok) setReminders((await r.json()).reminders ?? []);
    } catch { /* non-critical */ }
  }, [vendorId]);

  /* ---- per-tab loaders ---- */
  const loadContracts = useCallback(async () => {
    const r = await fetch(`/api/contracts?vendorId=${encodeURIComponent(vendorId)}`);
    if (!r.ok) throw new Error(await errorMessage(r, "Could not load contracts."));
    const d = await r.json();
    setContracts(d.contracts ?? []);
    setClauseTemplate(d.clauseTemplate ?? []);
  }, [vendorId]);

  const loadObligations = useCallback(async () => {
    const r = await fetch(`/api/obligations?vendorId=${encodeURIComponent(vendorId)}`);
    if (!r.ok) throw new Error(await errorMessage(r, "Could not load obligations."));
    setObligations((await r.json()).obligations ?? []);
  }, [vendorId]);

  const loadCompliances = useCallback(async () => {
    const r = await fetch(`/api/compliances?vendorId=${encodeURIComponent(vendorId)}`);
    if (!r.ok) throw new Error(await errorMessage(r, "Could not load compliances."));
    const d = await r.json();
    setCompliances(d.compliances ?? []);
    setCatalog(d.catalog ?? []);
  }, [vendorId]);

  const loadCatalog = useCallback(async () => {
    const r = await fetch("/api/compliance-catalog");
    if (!r.ok) throw new Error(await errorMessage(r, "Could not load the compliance list."));
    setCatalog((await r.json()).catalog ?? []);
  }, []);

  // (re)load whatever the active tab needs whenever vendor/tab changes
  useEffect(() => {
    if (!loaded) return;
    loadReminders();
    (async () => {
      try {
        if (tab === "contracts") await loadContracts();
        else if (tab === "obligations") await loadObligations();
        else if (tab === "compliances") await loadCompliances();
        else if (tab === "custom") await loadCatalog();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load this view.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, tab, loaded]);

  async function logout() {
    try { await fetch("/api/logout", { method: "POST" }); } finally { router.push("/login"); }
  }

  if (loadError && !loaded) return <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!loaded) return <main className="grid min-h-screen place-items-center text-muted"><Loader2 className="animate-spin" /></main>;

  const TABS: { id: Tab; label: string; icon: typeof FileSignature }[] = [
    { id: "contracts", label: "Contracts", icon: FileSignature },
    { id: "obligations", label: "Obligations", icon: ListChecks },
    { id: "compliances", label: "Compliances", icon: BadgeCheck },
    { id: "custom", label: "Custom List", icon: ListPlus },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-20 -mx-5 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg/70 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/console" className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-fg" aria-label="Back to console">
            <ArrowLeft size={16} />
          </Link>
          <LogoLockup markWidth={38} />
          <span className="hidden text-sm text-muted sm:inline">· Compliance</span>
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
          {!canManage && <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">read-only</span>}
          <ThemeToggle />
          <button onClick={logout} className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted hover:text-fg" aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Reminders strip */}
      {reminders.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface/40 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted"><Bell size={13} /> Reminders</span>
          {reminders.map((rem, i) => {
            const tone = rem.severity === "overdue" ? "border-danger/40 bg-danger/10 text-danger" : "border-warn/40 bg-warn/10 text-warn";
            return (
              <span key={i} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium", tone)}>
                {rem.severity === "overdue" ? <AlertTriangle size={11} /> : <CalendarClock size={11} />}
                <span className="font-semibold">{rem.title}</span>
                <span className="opacity-80">
                  {rem.days === null ? "" : rem.days < 0 ? `· overdue ${Math.abs(rem.days)}d` : `· in ${rem.days}d`}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium",
                tab === t.id ? "border-brand/50 bg-brand/10 text-fg" : "border-border text-muted"
              )}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {tab === "contracts" && (
          <ContractsTab
            vendorId={vendorId}
            canManage={canManage}
            contracts={contracts}
            clauseTemplate={clauseTemplate}
            reload={loadContracts}
            reloadReminders={loadReminders}
            toast={toast}
          />
        )}
        {tab === "obligations" && (
          <ObligationsTab
            vendorId={vendorId}
            canManage={canManage}
            obligations={obligations}
            reload={loadObligations}
            reloadReminders={loadReminders}
            toast={toast}
          />
        )}
        {tab === "compliances" && (
          <CompliancesTab
            vendorId={vendorId}
            canManage={canManage}
            compliances={compliances}
            catalog={catalog}
            reload={loadCompliances}
            reloadReminders={loadReminders}
            toast={toast}
          />
        )}
        {tab === "custom" && (
          <CustomTab
            canManage={canManage}
            catalog={catalog}
            reload={loadCatalog}
            toast={toast}
          />
        )}
      </motion.div>

      <Toaster toasts={toast.toasts} onDismiss={toast.dismiss} />
    </main>
  );
}

/* ================================================================== */
/* Shared small bits                                                  */
/* ================================================================== */

type ToastApi = ReturnType<typeof useToasts>;

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof Plus; children: React.ReactNode }) {
  return (
    <div className="glass mb-5 rounded-2xl p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Icon size={15} /> {title}</h3>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="glass rounded-2xl p-8 text-center text-sm text-muted">{message}</div>
  );
}

function DeleteButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-border text-muted transition hover:border-danger/50 hover:text-danger"
    >
      <Trash2 size={14} />
    </button>
  );
}

/* ================================================================== */
/* Tab 1 — Contracts                                                  */
/* ================================================================== */

function ContractsTab({
  vendorId, canManage, contracts, clauseTemplate, reload, reloadReminders, toast,
}: {
  vendorId: string;
  canManage: boolean;
  contracts: Contract[];
  clauseTemplate: ClauseTemplate[];
  reload: () => Promise<void>;
  reloadReminders: () => Promise<void>;
  toast: ToastApi;
}) {
  const [form, setForm] = useState({ title: "", counterparty: "", startDate: "", renewalDate: "", expiryDate: "" });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  async function addContract() {
    if (!form.title.trim()) { toast.error("A contract title is required."); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("vendorId", vendorId);
      fd.append("title", form.title);
      fd.append("counterparty", form.counterparty);
      fd.append("startDate", form.startDate);
      fd.append("renewalDate", form.renewalDate);
      fd.append("expiryDate", form.expiryDate);
      if (file) fd.append("file", file);
      const res = await fetch("/api/contracts", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not add the contract."));
      setForm({ title: "", counterparty: "", startDate: "", renewalDate: "", expiryDate: "" });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await reload();
      await reloadReminders();
      toast.success("Contract added.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the contract.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleClause(contract: Contract, key: string, present: boolean | null) {
    const base = clauseTemplate.map((t) => {
      const existing = contract.clauses.find((c) => c.key === t.key);
      return { key: t.key, present: existing?.present ?? null, note: existing?.note };
    });
    const updated = base.map((c) => (c.key === key ? { ...c, present } : c));
    try {
      const res = await fetch("/api/contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, contractId: contract.id, clauses: updated }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not update the clause."));
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the clause.");
    }
  }

  async function removeContract(c: Contract) {
    try {
      const res = await fetch(`/api/contracts?vendorId=${encodeURIComponent(vendorId)}&contractId=${encodeURIComponent(c.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not delete the contract."));
      await reload();
      await reloadReminders();
      toast.success("Contract deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the contract.");
    }
  }

  return (
    <section>
      {canManage && (
        <SectionCard title="Add contract" icon={Plus}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title *" htmlFor="c-title">
              <input id="c-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="Master Services Agreement" />
            </Field>
            <Field label="Counterparty" htmlFor="c-cp">
              <input id="c-cp" value={form.counterparty} onChange={(e) => setForm((f) => ({ ...f, counterparty: e.target.value }))} className={inputCls} placeholder="Acme Corp" />
            </Field>
            <Field label="Start date" htmlFor="c-start">
              <input id="c-start" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Renewal date" htmlFor="c-renew">
              <input id="c-renew" type="date" value={form.renewalDate} onChange={(e) => setForm((f) => ({ ...f, renewalDate: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Expiry date" htmlFor="c-exp">
              <input id="c-exp" type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Contract / MSA file" htmlFor="c-file">
              <input id="c-file" ref={fileRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={cn(inputCls, "file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:text-fg")} />
            </Field>
          </div>
          <button onClick={addContract} disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {saving ? "Adding…" : "Add contract"}
          </button>
        </SectionCard>
      )}

      {contracts.length === 0 ? (
        <EmptyState message="No contracts recorded for this vendor yet." />
      ) : (
        <div className="space-y-4">
          {contracts.map((c) => {
            const present = c.clauses.filter((x) => x.present === true).length;
            const total = clauseTemplate.length || c.clauses.length;
            return (
              <div key={c.id} className="glass rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold">{c.title}</div>
                    {c.counterparty && <div className="text-xs text-muted">{c.counterparty}</div>}
                  </div>
                  {canManage && <DeleteButton onClick={() => removeContract(c)} label={`Delete contract ${c.title}`} />}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                  <span>Start: <span className="text-fg">{fmtDate(c.startDate)}</span></span>
                  <span className="inline-flex items-center gap-1.5">Renewal: <span className="text-fg">{fmtDate(c.renewalDate)}</span> <DueBadge date={c.renewalDate} label="renewal" /></span>
                  <span className="inline-flex items-center gap-1.5">Expiry: <span className="text-fg">{fmtDate(c.expiryDate)}</span> <DueBadge date={c.expiryDate} label="expiry" /></span>
                  {c.file && (
                    <span className="inline-flex items-center gap-1 text-brand"><Paperclip size={12} /> {c.file.filename}</span>
                  )}
                </div>

                {/* Mandatory-clause checklist */}
                <div className="mt-4 border-t border-border pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">Mandatory clauses</span>
                    <span className={cn("text-xs font-semibold", present === total ? "text-ok" : present === 0 ? "text-muted" : "text-warn")}>{present}/{total} clauses present</span>
                  </div>
                  <div className="space-y-1.5">
                    {clauseTemplate.map((t) => {
                      const cur = c.clauses.find((x) => x.key === t.key)?.present ?? null;
                      return (
                        <div key={t.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2/40 px-3 py-2">
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <span className="text-xs font-medium">{t.label}</span>
                            <FrameworkChips frameworks={t.frameworks} />
                          </div>
                          <ClauseTriState
                            value={cur}
                            disabled={!canManage}
                            onChange={(v) => toggleClause(c, t.key, v)}
                            label={t.label}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ClauseTriState({
  value, disabled, onChange, label,
}: {
  value: boolean | null;
  disabled: boolean;
  onChange: (v: boolean | null) => void;
  label: string;
}) {
  const opts: { v: boolean | null; node: React.ReactNode; title: string; on: string }[] = [
    { v: true, node: <Check size={13} />, title: "Present", on: "bg-ok/15 text-ok border-ok/40" },
    { v: false, node: <X size={13} />, title: "Absent", on: "bg-danger/15 text-danger border-danger/40" },
    { v: null, node: <Minus size={13} />, title: "Not assessed", on: "bg-surface-2 text-fg border-border" },
  ];
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border" role="group" aria-label={`${label} status`}>
      {opts.map((o, i) => {
        const active = value === o.v;
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            title={`${o.title}${disabled ? " (read-only)" : ""}`}
            onClick={() => onChange(o.v)}
            className={cn(
              "grid h-7 w-8 place-items-center border-l first:border-l-0 text-muted transition disabled:opacity-60",
              active ? o.on : "hover:text-fg"
            )}
          >
            {o.node}
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/* Tab 2 — Obligations                                                */
/* ================================================================== */

function ObligationsTab({
  vendorId, canManage, obligations, reload, reloadReminders, toast,
}: {
  vendorId: string;
  canManage: boolean;
  obligations: Obligation[];
  reload: () => Promise<void>;
  reloadReminders: () => Promise<void>;
  toast: ToastApi;
}) {
  const [form, setForm] = useState<{ title: string; description: string; owner: string; dueDate: string; recurrence: Recurrence; source: ObligationSource }>(
    { title: "", description: "", owner: "", dueDate: "", recurrence: "none", source: "manual" }
  );
  const [saving, setSaving] = useState(false);

  async function addObligation() {
    if (!form.title.trim()) { toast.error("An obligation title is required."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/obligations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, ...form }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not add the obligation."));
      setForm({ title: "", description: "", owner: "", dueDate: "", recurrence: "none", source: "manual" });
      await reload();
      await reloadReminders();
      toast.success("Obligation added.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the obligation.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(o: Obligation, status: ObligationStatus) {
    try {
      const res = await fetch("/api/obligations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, obligationId: o.id, status }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not update the status."));
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the status.");
    }
  }

  async function removeObligation(o: Obligation) {
    try {
      const res = await fetch(`/api/obligations?vendorId=${encodeURIComponent(vendorId)}&obligationId=${encodeURIComponent(o.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not delete the obligation."));
      await reload();
      await reloadReminders();
      toast.success("Obligation deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the obligation.");
    }
  }

  const STATUS_TONE: Record<ObligationStatus, string> = {
    open: "text-warn border-warn/40 bg-warn/10",
    in_progress: "text-brand border-brand/40 bg-brand/10",
    done: "text-ok border-ok/40 bg-ok/10",
  };

  return (
    <section>
      {canManage && (
        <SectionCard title="Add obligation" icon={Plus}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title *" htmlFor="o-title">
              <input id="o-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="Quarterly SOC 2 review" />
            </Field>
            <Field label="Owner" htmlFor="o-owner">
              <input id="o-owner" value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} className={inputCls} placeholder="Risk team" />
            </Field>
            <Field label="Description" htmlFor="o-desc">
              <textarea id="o-desc" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} placeholder="Optional detail…" />
            </Field>
            <Field label="Due date" htmlFor="o-due">
              <input id="o-due" type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Recurrence" htmlFor="o-recur">
              <select id="o-recur" value={form.recurrence} onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as Recurrence }))} className={inputCls}>
                <option value="none">none</option>
                <option value="monthly">monthly</option>
                <option value="quarterly">quarterly</option>
                <option value="annual">annual</option>
              </select>
            </Field>
            <Field label="Source" htmlFor="o-source">
              <select id="o-source" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as ObligationSource }))} className={inputCls}>
                <option value="contract">contract</option>
                <option value="regulation">regulation</option>
                <option value="finding">finding</option>
                <option value="manual">manual</option>
              </select>
            </Field>
          </div>
          <button onClick={addObligation} disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {saving ? "Adding…" : "Add obligation"}
          </button>
        </SectionCard>
      )}

      {obligations.length === 0 ? (
        <EmptyState message="No obligations tracked for this vendor yet." />
      ) : (
        <div className="space-y-2.5">
          {obligations.map((o) => (
            <div key={o.id} className="glass flex flex-wrap items-start justify-between gap-3 rounded-2xl p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{o.title}</span>
                  {o.owner && <span className="text-xs text-muted">· {o.owner}</span>}
                </div>
                {o.description && <p className="mt-0.5 text-xs text-muted">{o.description}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1.5">Due: <span className="text-fg">{fmtDate(o.dueDate)}</span> <DueBadge date={o.dueDate} label="due" /></span>
                  <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5">{o.recurrence}</span>
                  <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5">{o.source}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={o.status}
                  disabled={!canManage}
                  onChange={(e) => setStatus(o, e.target.value as ObligationStatus)}
                  aria-label={`Status for ${o.title}`}
                  className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold outline-none disabled:opacity-70", STATUS_TONE[o.status])}
                >
                  <option value="open">open</option>
                  <option value="in_progress">in_progress</option>
                  <option value="done">done</option>
                </select>
                {canManage && <DeleteButton onClick={() => removeObligation(o)} label={`Delete obligation ${o.title}`} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ================================================================== */
/* Tab 3 — Compliances                                                */
/* ================================================================== */

function CompliancesTab({
  vendorId, canManage, compliances, catalog, reload, reloadReminders, toast,
}: {
  vendorId: string;
  canManage: boolean;
  compliances: Compliance[];
  catalog: CatalogItem[];
  reload: () => Promise<void>;
  reloadReminders: () => Promise<void>;
  toast: ToastApi;
}) {
  const [form, setForm] = useState<{ framework: string; status: ComplianceState; issuedDate: string; expiryDate: string; note: string }>(
    { framework: "", status: "valid", issuedDate: "", expiryDate: "", note: "" }
  );
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const frameworkOptions = useMemo(() => catalog.map((c) => c.name), [catalog]);

  async function addCompliance() {
    const framework = form.framework || frameworkOptions[0] || "";
    if (!framework.trim()) { toast.error("Select a compliance framework."); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("vendorId", vendorId);
      fd.append("framework", framework);
      fd.append("status", form.status);
      fd.append("issuedDate", form.issuedDate);
      fd.append("expiryDate", form.expiryDate);
      fd.append("note", form.note);
      if (file) fd.append("file", file);
      const res = await fetch("/api/compliances", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not add the compliance."));
      setForm({ framework: "", status: "valid", issuedDate: "", expiryDate: "", note: "" });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await reload();
      await reloadReminders();
      toast.success("Compliance added.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the compliance.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCompliance(c: Compliance) {
    try {
      const res = await fetch(`/api/compliances?vendorId=${encodeURIComponent(vendorId)}&complianceId=${encodeURIComponent(c.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not delete the compliance."));
      await reload();
      await reloadReminders();
      toast.success("Compliance deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the compliance.");
    }
  }

  return (
    <section>
      {canManage && (
        <SectionCard title="Add compliance" icon={Plus}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Framework *" htmlFor="f-fw">
              <select id="f-fw" value={form.framework} onChange={(e) => setForm((f) => ({ ...f, framework: e.target.value }))} className={inputCls}>
                <option value="">Select framework…</option>
                {frameworkOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </Field>
            <Field label="Status" htmlFor="f-status">
              <select id="f-status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ComplianceState }))} className={inputCls}>
                <option value="valid">valid</option>
                <option value="expiring">expiring</option>
                <option value="expired">expired</option>
                <option value="in_progress">in_progress</option>
                <option value="missing">missing</option>
              </select>
            </Field>
            <Field label="Issued date" htmlFor="f-issued">
              <input id="f-issued" type="date" value={form.issuedDate} onChange={(e) => setForm((f) => ({ ...f, issuedDate: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Expiry date" htmlFor="f-exp">
              <input id="f-exp" type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Note" htmlFor="f-note">
              <textarea id="f-note" rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className={inputCls} placeholder="Optional note…" />
            </Field>
            <Field label="Certificate file" htmlFor="f-file">
              <input id="f-file" ref={fileRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={cn(inputCls, "file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:text-fg")} />
            </Field>
          </div>
          <button onClick={addCompliance} disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {saving ? "Adding…" : "Add compliance"}
          </button>
        </SectionCard>
      )}

      {compliances.length === 0 ? (
        <EmptyState message="No compliance certifications recorded for this vendor yet." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {compliances.map((c) => (
            <div key={c.id} className="glass rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{c.framework}</span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", COMPLIANCE_TONE[c.status])}>{c.status}</span>
                </div>
                {canManage && <DeleteButton onClick={() => removeCompliance(c)} label={`Delete ${c.framework} compliance`} />}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
                <span>Issued: <span className="text-fg">{fmtDate(c.issuedDate)}</span></span>
                <span className="inline-flex items-center gap-1.5">Expires: <span className="text-fg">{fmtDate(c.expiryDate)}</span> <DueBadge date={c.expiryDate} label="cert" /></span>
              </div>
              {c.file && <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand"><Paperclip size={12} /> {c.file.filename}</div>}
              {c.note && <p className="mt-1.5 text-xs text-muted">{c.note}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ================================================================== */
/* Tab 4 — Custom List                                                */
/* ================================================================== */

function CustomTab({
  canManage, catalog, reload, toast,
}: {
  canManage: boolean;
  catalog: CatalogItem[];
  reload: () => Promise<void>;
  toast: ToastApi;
}) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  const builtins = catalog.filter((c) => !c.custom);
  const customs = catalog.filter((c) => c.custom);

  async function addCustom() {
    if (!form.name.trim()) { toast.error("A name is required."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/compliance-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not add the compliance."));
      setForm({ name: "", description: "" });
      await reload();
      toast.success("Custom compliance added.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the compliance.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCustom(item: CatalogItem) {
    try {
      const res = await fetch(`/api/compliance-catalog?itemId=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not delete the compliance."));
      await reload();
      toast.success("Custom compliance removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the compliance.");
    }
  }

  function Row({ item }: { item: CatalogItem }) {
    return (
      <div className="glass flex items-start justify-between gap-3 rounded-2xl p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{item.name}</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", item.custom ? "border-brand/40 bg-brand/10 text-brand" : "border-border bg-surface-2 text-muted")}>
              {item.custom ? "custom" : "built-in"}
            </span>
          </div>
          {item.description && <p className="mt-0.5 text-xs text-muted">{item.description}</p>}
        </div>
        {canManage && item.custom && <DeleteButton onClick={() => removeCustom(item)} label={`Delete ${item.name}`} />}
      </div>
    );
  }

  return (
    <section>
      {canManage && (
        <SectionCard title="Add custom compliance" icon={ListPlus}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *" htmlFor="cc-name">
              <input id="cc-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="HIPAA" />
            </Field>
            <Field label="Description" htmlFor="cc-desc">
              <input id="cc-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} placeholder="Optional description…" />
            </Field>
          </div>
          <button onClick={addCustom} disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {saving ? "Adding…" : "Add custom compliance"}
          </button>
        </SectionCard>
      )}

      <div className="space-y-5">
        <div>
          <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Built-in frameworks</div>
          {builtins.length === 0 ? <EmptyState message="No built-in frameworks." /> : (
            <div className="grid gap-2.5 sm:grid-cols-2">{builtins.map((i) => <Row key={i.id} item={i} />)}</div>
          )}
        </div>
        <div>
          <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Custom compliances</div>
          {customs.length === 0 ? <EmptyState message="No custom compliances added yet." /> : (
            <div className="grid gap-2.5 sm:grid-cols-2">{customs.map((i) => <Row key={i.id} item={i} />)}</div>
          )}
        </div>
      </div>
    </section>
  );
}
