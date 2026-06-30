"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cpu, Users, LogOut, Save, Check, Loader2, KeyRound, Server, Cloud, GitMerge, ScrollText, UserPlus, UserCog, X } from "lucide-react";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ErrorState, Toaster, errorMessage, useToasts } from "@/components/ui";
import { cn } from "@/lib/utils";

const ROLE_TONE: Record<string, string> = {
  root: "text-mas border-mas/40 bg-mas/10",
  assessor: "text-brand border-brand/40 bg-brand/10",
  vendor: "text-ok border-ok/40 bg-ok/10",
  customer: "text-muted border-border bg-surface-2",
};
const CAT_ICON: Record<string, any> = { static: Cpu, local: Server, integrated: Cloud, hybrid: GitMerge };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs">{label}<div className="mt-1">{children}</div></label>;
}
const inputCls = "w-full rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-60";

export default function Admin() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [meta, setMeta] = useState<any>(null);
  const [masked, setMasked] = useState<any>(null);
  const [canManage, setCanManage] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [tab, setTab] = useState<"processing" | "users" | "audit">("processing");
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [evalData, setEvalData] = useState<any>(null);
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [invite, setInvite] = useState({ company: "", email: "" });
  const [inviteLink, setInviteLink] = useState("");
  // Add additional user to existing vendor
  const [addUserFor, setAddUserFor] = useState<{ vendorId: string; name: string } | null>(null);
  const [addUserForm, setAddUserForm] = useState({ email: "", password: "", displayName: "" });
  const [addUserSaving, setAddUserSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const toast = useToasts();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError("");
      try {
        const meRes = await fetch("/api/me");
        if (!meRes.ok) throw new Error(await errorMessage(meRes, "Could not verify your session."));
        const me = await meRes.json();
        if (!me.session || me.session.role !== "root") { router.push("/login"); return; }
        if (cancelled) return;
        setRole(me.session.role);
        const sRes = await fetch("/api/settings");
        if (!sRes.ok) throw new Error(await errorMessage(sRes, "Could not load platform settings."));
        const s = await sRes.json();
        if (cancelled) return;
        setMeta(s); setMasked(s.settings); setCanManage(s.canManage);
        const m = s.settings;
        setDraft({
          category: m.category,
          static: { ...m.static },
          local: { provider: m.local.provider, ollama: { ...m.local.ollama }, claudecode: { ...m.local.claudecode } },
          integrated: { provider: m.integrated.provider, claude: { model: m.integrated.claude.model }, openai: { model: m.integrated.openai.model, baseUrl: m.integrated.openai.baseUrl }, grok: { model: m.integrated.grok.model, baseUrl: m.integrated.grok.baseUrl }, gemini: { model: m.integrated.gemini.model } },
          hybrid: { ...m.hybrid },
        });
        const usersRes = await fetch("/api/users");
        if (usersRes.ok && !cancelled) setUsers((await usersRes.json()).users);
        try { const e = await fetch("/api/eval"); if (e.ok && !cancelled) setEvalData(await e.json()); } catch {}
        try { const a = await fetch("/api/audit"); if (a.ok && !cancelled) setAuditEntries((await a.json()).entries); } catch {}
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load the admin console.");
      }
    })();
    return () => { cancelled = true; };
  }, [router, reloadKey]);

  async function createInvite() {
    if (!invite.company || !invite.email) { toast.error("Enter a company and SPOC email first."); return; }
    try {
      const res = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(invite) });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not create the invite."));
      const d = await res.json();
      setInviteLink(`${window.location.origin}${d.link}`);
      setInvite({ company: "", email: "" });
      toast.success("Invite link generated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the invite.");
    }
  }

  async function createAdditionalUser() {
    if (!addUserFor || !addUserForm.email || !addUserForm.password) { toast.error("Email and password are required."); return; }
    setAddUserSaving(true);
    try {
      const res = await fetch("/api/vendor-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: addUserFor.vendorId, email: addUserForm.email, password: addUserForm.password, name: addUserForm.displayName || undefined }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not create user."));
      setAddUserFor(null);
      setAddUserForm({ email: "", password: "", displayName: "" });
      toast.success("Additional user account created.");
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create user.");
    } finally {
      setAddUserSaving(false);
    }
  }

  function patch(p: any) { setDraft((d: any) => ({ ...d, ...p })); }
  function patchIntegrated(prov: string, field: string, val: string) {
    setDraft((d: any) => ({ ...d, integrated: { ...d.integrated, [prov]: { ...d.integrated[prov], [field]: val } } }));
  }
  function patchLocal(prov: string, field: string, val: string) {
    setDraft((d: any) => ({ ...d, local: { ...d.local, [prov]: { ...d.local[prov], [field]: val } } }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not save the configuration."));
      setMasked((await res.json()).settings); setSaved(true); setTimeout(() => setSaved(false), 1800);
      toast.success("Configuration saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the configuration.");
    } finally {
      setSaving(false);
    }
  }
  async function logout() {
    try { await fetch("/api/logout", { method: "POST" }); } finally { router.push("/login"); }
  }

  if (loadError && !draft) return <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!draft || !meta) return <main className="grid min-h-screen place-items-center text-muted"><Loader2 className="animate-spin" /></main>;

  const intProv = meta.integratedProviders.find((p: any) => p.id === draft.integrated.provider);
  const intMaskKey = masked.integrated[draft.integrated.provider];

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 pb-20">
      <header className="sticky top-0 z-20 -mx-5 mb-6 flex items-center justify-between border-b border-border bg-bg/70 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3"><LogoLockup markWidth={38} /><span className="hidden text-sm text-muted sm:inline">· Root Console</span></div>
        <div className="flex items-center gap-3">
          <Link href="/cost" className="hidden rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted hover:text-fg sm:block">Cost</Link>
          <Link href="/changelog" className="hidden rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted hover:text-fg sm:block">Changelog</Link>
          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", ROLE_TONE[role])}>{role}{!canManage && " · read-only"}</span>
          <ThemeToggle />
          <button onClick={logout} className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted hover:text-fg" aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </header>

      {/* Platform health strip */}
      {users.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { value: users.filter((u) => u.role === "vendor").length, label: "Total vendors", tone: "" },
            { value: users.filter((u) => u.role === "vendor" && u.status === "submitted").length, label: "Assessments submitted", tone: "text-ok" },
            { value: users.filter((u) => u.role === "assessor").length, label: "Active assessors", tone: "text-brand" },
            { value: auditEntries.length > 0 ? new Date(auditEntries[0].ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—", label: "Last activity", tone: "text-muted" },
          ].map((s, i) => (
            <div key={i} className="glass rounded-2xl p-4">
              <div className={cn("text-2xl font-bold tabular-nums", s.tone || "text-fg")}>{s.value}</div>
              <div className="mt-0.5 text-[11px] text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button onClick={() => setTab("processing")} className={cn("inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium", tab === "processing" ? "border-brand/50 bg-brand/10 text-fg" : "border-border text-muted")}><Cpu size={15} /> Processing engine</button>
        <button onClick={() => setTab("users")} className={cn("inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium", tab === "users" ? "border-brand/50 bg-brand/10 text-fg" : "border-border text-muted")}><Users size={15} /> Users & roles</button>
        <button onClick={() => setTab("audit")} className={cn("inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium", tab === "audit" ? "border-brand/50 bg-brand/10 text-fg" : "border-border text-muted")}><ScrollText size={15} /> Audit log</button>
      </div>

      {tab === "processing" && (
        <section className="space-y-5">
          {/* static-pipeline accuracy eval (measured vs the sample's human verdicts) */}
          {evalData && (
            <div className="glass flex flex-wrap items-center gap-4 rounded-2xl p-4">
              <div className="text-center">
                <div className={cn("text-3xl font-bold tabular-nums", evalData.agreementPct >= 80 ? "text-ok" : evalData.agreementPct >= 60 ? "text-warn" : "text-danger")}>{evalData.agreementPct}%</div>
                <div className="text-[10px] uppercase tracking-wider text-muted">static accuracy</div>
              </div>
              <div className="text-xs text-muted">
                <p>Static Pipeline vs human assessor verdicts — <span className="text-fg">{evalData.agree}/{evalData.total}</span> agree on the labelled sample controls.</p>
                <p className={cn("mt-0.5", evalData.falseCompliant > 0 ? "text-danger" : "text-ok")}>False-Compliant (the dangerous error): {evalData.falseCompliant}</p>
                <p className="mt-1 text-xs">Measured on the curated sample (small set); full questionnaire eval grows the sample. Numbers are real, not claimed.</p>
              </div>
            </div>
          )}
          {/* category cards */}
          <div className="grid gap-2 sm:grid-cols-2">
            {meta.categories.map((cat: any) => {
              const Icon = CAT_ICON[cat.id]; const active = draft.category === cat.id;
              return (
                <button key={cat.id} disabled={!canManage} onClick={() => patch({ category: cat.id })}
                  className={cn("rounded-2xl border p-4 text-left transition disabled:opacity-70", active ? "border-brand/60 bg-brand/10 shadow-glow-sm" : "border-border bg-surface/40 hover:bg-surface-2 hover:border-brand/30 hover:shadow-glow-sm")}>
                  <div className="flex items-center justify-between"><span className="inline-flex items-center gap-2 font-semibold"><Icon size={16} className="text-brand" />{cat.label}</span>{active && <Check size={16} className="text-brand" />}</div>
                  <p className="mt-1 text-xs text-muted">{cat.desc}</p>
                  <span className="mt-1 inline-block text-[11px] font-medium text-muted">{cat.cost}</span>
                </button>
              );
            })}
          </div>

          {/* per-category config */}
          <div className="glass rounded-2xl p-5">
            {draft.category === "static" && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Static Pipeline configuration</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={`Coverage threshold (${draft.static.coverageThreshold})`}>
                    <input type="range" min={0} max={1} step={0.05} disabled={!canManage} value={draft.static.coverageThreshold} onChange={(e) => patch({ static: { ...draft.static, coverageThreshold: Number(e.target.value) } })} className="w-full" />
                  </Field>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={!canManage} checked={draft.static.requireRecentDate} onChange={(e) => patch({ static: { ...draft.static, requireRecentDate: e.target.checked } })} /> Require recent date (≤12 mo)</label>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={!canManage} checked={draft.static.ocrEnabled} onChange={(e) => patch({ static: { ...draft.static, ocrEnabled: e.target.checked } })} /> OCR images on upload</label>
                </div>
                <p className="text-xs text-muted">Pure rules + content extraction. No tokens, no external calls.</p>
              </div>
            )}

            {draft.category === "local" && (
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Server size={15} /> Local AI Model</h3>
                <Field label="Provider">
                  <select disabled={!canManage} value={draft.local.provider} onChange={(e) => patch({ local: { ...draft.local, provider: e.target.value } })} className={inputCls}>
                    {meta.localProviders.map((p: any) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  {draft.local.provider === "ollama" && <>
                    <Field label="Base URL"><input disabled={!canManage} value={draft.local.ollama.baseUrl} onChange={(e) => patchLocal("ollama", "baseUrl", e.target.value)} className={inputCls} /></Field>
                    <Field label="Model"><input disabled={!canManage} value={draft.local.ollama.model} onChange={(e) => patchLocal("ollama", "model", e.target.value)} className={inputCls} /></Field>
                  </>}
                  {draft.local.provider === "claudecode" && <Field label="Model"><input disabled={!canManage} value={draft.local.claudecode.model} onChange={(e) => patchLocal("claudecode", "model", e.target.value)} className={inputCls} /></Field>}
                </div>
                <p className="text-xs text-muted">Runs on your own infrastructure — no API bill; evidence never leaves your environment. Claude Code (Personal) uses your local subscription.</p>
              </div>
            )}

            {draft.category === "integrated" && (
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Cloud size={15} /> AI Integrated (cloud API)</h3>
                <Field label="Provider">
                  <select disabled={!canManage} value={draft.integrated.provider} onChange={(e) => patch({ integrated: { ...draft.integrated, provider: e.target.value } })} className={inputCls}>
                    {meta.integratedProviders.map((p: any) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  {intProv?.fields.includes("apiKey") && (
                    <Field label="API token"><input type="password" disabled={!canManage} placeholder={intMaskKey?.keySet ? `saved ${intMaskKey.keyHint}` : "not set"} onChange={(e) => patchIntegrated(draft.integrated.provider, "apiKey", e.target.value)} className={inputCls} /></Field>
                  )}
                  {intProv?.fields.includes("model") && <Field label="Model"><input disabled={!canManage} value={draft.integrated[draft.integrated.provider].model || ""} onChange={(e) => patchIntegrated(draft.integrated.provider, "model", e.target.value)} className={inputCls} /></Field>}
                  {intProv?.fields.includes("baseUrl") && <Field label="Base URL"><input disabled={!canManage} value={draft.integrated[draft.integrated.provider].baseUrl || ""} onChange={(e) => patchIntegrated(draft.integrated.provider, "baseUrl", e.target.value)} className={inputCls} /></Field>}
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted"><KeyRound size={12} /> Tokens are stored server-side, shown only as ••••last4, and never returned in full. Blank = keep existing.</p>
              </div>
            )}

            {draft.category === "hybrid" && (
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><GitMerge size={15} /> Hybrid (Static → AI)</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Escalate to">
                    <select disabled={!canManage} value={draft.hybrid.escalateCategory} onChange={(e) => patch({ hybrid: { ...draft.hybrid, escalateCategory: e.target.value } })} className={inputCls}>
                      <option value="local">Local AI Model</option>
                      <option value="integrated">AI Integrated</option>
                    </select>
                  </Field>
                  <Field label={`Confidence threshold (${draft.hybrid.threshold})`}>
                    <input type="range" min={0.4} max={0.95} step={0.05} disabled={!canManage} value={draft.hybrid.threshold} onChange={(e) => patch({ hybrid: { ...draft.hybrid, threshold: Number(e.target.value) } })} className="w-full" />
                  </Field>
                </div>
                <p className="text-xs text-muted">Static engine runs first ($0). Only controls scoring below the threshold escalate to the chosen engine — configure that engine in its own tab. Most controls resolve free.</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">Active engine: <span className="font-semibold text-fg">{masked.category}</span></span>
            {canManage && (
              <button onClick={save} disabled={saving} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60">
                {saved ? <Check size={16} /> : saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{saved ? "Saved" : saving ? "Saving…" : "Save configuration"}
              </button>
            )}
          </div>
        </section>
      )}

      {tab === "users" && canManage && (
        <section className="glass mb-4 rounded-2xl p-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><UserPlus size={15} /> Invite a vendor</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">Company<input value={invite.company} onChange={(e) => setInvite((s) => ({ ...s, company: e.target.value }))} className="mt-1 block rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand" placeholder="Acme Corp" /></label>
            <label className="text-xs">SPOC email<input value={invite.email} onChange={(e) => setInvite((s) => ({ ...s, email: e.target.value }))} className="mt-1 block rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand" placeholder="spoc@acme.com" /></label>
            <button onClick={createInvite} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-glow-sm hover:brightness-110">Generate invite</button>
          </div>
          {inviteLink && (
            <div className="mt-3 rounded-xl border border-ok/40 bg-ok/10 p-2 text-xs">
              <p className="mb-1 font-semibold text-ok">Invite link (send to the vendor):</p>
              <code className="break-all text-fg">{inviteLink}</code>
              <p className="mt-1 text-[10px] text-muted">In production this is emailed automatically; shown here for the demo.</p>
            </div>
          )}
        </section>
      )}
      {tab === "users" && (
        <>
        <section className="glass overflow-hidden rounded-2xl mb-4">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Scope / Activity</th>{canManage && <th className="px-4 py-3"></th>}</tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.username} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3"><div className="font-medium">{u.name}</div><div className="font-mono text-[11px] text-muted">{u.username}</div></td>
                  <td className="px-4 py-3"><span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", ROLE_TONE[u.role])}>{u.role}</span></td>
                  <td className="px-4 py-3 text-muted">{u.role === "vendor" ? <span>{u.answered}/{u.total} answered · <span className={u.status === "submitted" ? "text-ok" : "text-warn"}>{u.status}</span></span> : u.role === "assessor" ? "Reviews all vendor submissions" : u.role === "root" ? "Full platform control" : "Read-only oversight"}</td>
                  {canManage && (
                    <td className="px-4 py-3">
                      {u.role === "vendor" && u.vendorId && (
                        <button
                          onClick={() => { setAddUserFor({ vendorId: u.vendorId, name: u.name }); setAddUserForm({ email: "", password: "", displayName: "" }); }}
                          title="Add another login for this vendor"
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted hover:border-brand/50 hover:text-fg"
                        >
                          <UserCog size={12} /> Add user
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Add-user-to-vendor modal */}
        {addUserFor && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <div className="absolute inset-0 bg-bg/70 backdrop-blur-sm" onClick={() => setAddUserFor(null)} />
            <div className="glass relative z-10 w-full max-w-md rounded-2xl p-5 shadow-glow">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2"><UserCog size={16} /> Add login for {addUserFor.name}</h3>
                <button onClick={() => setAddUserFor(null)} className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted hover:text-fg"><X size={14} /></button>
              </div>
              <p className="mb-4 text-xs text-muted">The new account shares the same vendor workspace and submission data.</p>
              <div className="space-y-3">
                <label className="block text-xs">Display name (optional)<input value={addUserForm.displayName} onChange={(e) => setAddUserForm((f) => ({ ...f, displayName: e.target.value }))} placeholder={addUserFor.name} className={inputCls + " mt-1"} /></label>
                <label className="block text-xs">Email <span className="text-danger">*</span><input type="email" value={addUserForm.email} onChange={(e) => setAddUserForm((f) => ({ ...f, email: e.target.value }))} placeholder="newuser@vendor.com" className={inputCls + " mt-1"} /></label>
                <label className="block text-xs">Password <span className="text-danger">*</span><input type="password" value={addUserForm.password} onChange={(e) => setAddUserForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min. 6 characters" className={inputCls + " mt-1"} /></label>
              </div>
              <div className="mt-4 flex gap-3">
                <button onClick={createAdditionalUser} disabled={addUserSaving} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60">
                  {addUserSaving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}{addUserSaving ? "Creating…" : "Create account"}
                </button>
                <button onClick={() => setAddUserFor(null)} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted hover:text-fg">Cancel</button>
              </div>
            </div>
          </div>
        )}
        </>
      )}

      {tab === "audit" && (
        <section className="glass overflow-hidden rounded-2xl">
          <div className="max-h-[28rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-border bg-surface/90 text-left text-[10px] uppercase tracking-wider text-muted backdrop-blur"><tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Actor</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Target</th></tr></thead>
              <tbody>
                {auditEntries.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">No activity recorded yet.</td></tr>}
                {auditEntries.map((e, i) => {
                  const act: string = e.action ?? "";
                  const actionTone =
                    act.includes("remediation") ? "text-warn" :
                    act.includes("override") ? "text-mas" :
                    act.includes("adjudicated") || act.includes("review") ? "text-brand" :
                    act.includes("login") || act.includes("logout") ? "text-muted" :
                    act.includes("submitted") ? "text-ok" : "text-fg";
                  return (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-4 py-2 text-[11px] text-muted">{new Date(e.ts).toLocaleString()}</td>
                      <td className="px-4 py-2 font-mono text-xs">{e.actor}</td>
                      <td className={cn("px-4 py-2 text-xs font-medium", actionTone)}>{act}</td>
                      <td className="px-4 py-2 text-xs text-muted">{e.target || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Toaster toasts={toast.toasts} onDismiss={toast.dismiss} />
    </main>
  );
}
