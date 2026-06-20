"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Building2, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { AnimatedLogo } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { computeTier } from "@/lib/risk";
import { cn } from "@/lib/utils";

const inputCls = "w-full rounded-xl border border-border bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-brand";
const TIER_TONE: Record<string, string> = { Critical: "text-danger", High: "text-warn", Medium: "text-brand", Low: "text-ok" };

export default function Onboard() {
  const router = useRouter();
  const [f, setF] = useState({ company: "", address: "", website: "", email: "", spocPhone: "", serviceDescription: "", country: "", directContract: false, password: "", dataSensitivity: "confidential", access: "limited", criticality: "medium", frameworks: [] as string[], volume: "medium", invite: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));

  // Pre-fill from an assessor invite link (?invite=token).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("invite");
    if (!t) return;
    setF((s) => ({ ...s, invite: t }));
    fetch(`/api/invite?token=${t}`).then((r) => r.json()).then((d) => {
      if (d.invite) setF((s) => ({ ...s, company: d.invite.company, email: d.invite.email, invite: t }));
    }).catch(() => {});
  }, []);
  const toggleFw = (fw: string) => set("frameworks", f.frameworks.includes(fw) ? f.frameworks.filter((x) => x !== fw) : [...f.frameworks, fw]);
  const { tier } = computeTier({ dataSensitivity: f.dataSensitivity as any, access: f.access as any, criticality: f.criticality as any, frameworks: f.frameworks, volume: f.volume as any });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await fetch("/api/onboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error || "Onboarding failed."); return; }
    router.push("/vendor");
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-8">
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <Link href="/login" className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-fg"><ArrowLeft size={15} /> Back to sign in</Link>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="glass rounded-3xl p-8">
        <div className="mb-2 flex items-center gap-3">
          <AnimatedLogo width={120} variant="mark" />
          <div>
            <h1 className="text-xl font-bold">Vendor onboarding</h1>
            <p className="text-sm text-muted">Create your account and company profile to begin the security assessment.</p>
          </div>
        </div>

        {f.invite && <div className="mt-3 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand">✓ You were invited by your client — company and email are pre-filled.</div>}
        <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-xs sm:col-span-2">Company / vendor name *
            <input required value={f.company} onChange={(e) => set("company", e.target.value)} className={inputCls + " mt-1"} placeholder="Acme Cloud Services Pvt. Ltd." />
          </label>
          <label className="text-xs">SPOC email (your login) *
            <input required type="email" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="username" className={inputCls + " mt-1"} placeholder="spoc@acme.com" />
          </label>
          <label className="text-xs">Password *
            <input required type="password" value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" className={inputCls + " mt-1"} placeholder="min 6 characters" />
          </label>
          <label className="text-xs">SPOC contact number
            <input value={f.spocPhone} onChange={(e) => set("spocPhone", e.target.value)} className={inputCls + " mt-1"} />
          </label>
          <label className="text-xs">Country
            <input value={f.country} onChange={(e) => set("country", e.target.value)} className={inputCls + " mt-1"} placeholder="Singapore / India" />
          </label>
          <label className="text-xs sm:col-span-2">Head office address
            <input value={f.address} onChange={(e) => set("address", e.target.value)} className={inputCls + " mt-1"} />
          </label>
          <label className="text-xs sm:col-span-2">Company website
            <input value={f.website} onChange={(e) => set("website", e.target.value)} className={inputCls + " mt-1"} placeholder="https://" />
          </label>
          <label className="text-xs sm:col-span-2">Service provided to the client
            <textarea value={f.serviceDescription} onChange={(e) => set("serviceDescription", e.target.value)} rows={2} className={inputCls + " mt-1 resize-y"} placeholder="Describe the service / product offered." />
          </label>
          <label className="flex items-center gap-2 text-xs sm:col-span-2">
            <input type="checkbox" checked={f.directContract} onChange={(e) => set("directContract", e.target.checked)} />
            We have a direct contract with the client
          </label>

          {/* inherent-risk tiering */}
          <div className="rounded-xl border border-border bg-surface-2/40 p-3 sm:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Risk profile (auto-tiers your assessment)</span>
              <span className={cn("rounded-full border border-border px-2.5 py-0.5 text-xs font-bold", TIER_TONE[tier])}>{tier} tier</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px]">Data sensitivity
                <select value={f.dataSensitivity} onChange={(e) => set("dataSensitivity", e.target.value)} className={inputCls + " mt-1"}>
                  <option value="none">None</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="regulated">Regulated / PII / payment</option>
                </select>
              </label>
              <label className="text-[11px]">System / network access
                <select value={f.access} onChange={(e) => set("access", e.target.value)} className={inputCls + " mt-1"}>
                  <option value="none">None</option><option value="limited">Limited</option><option value="privileged">Privileged</option>
                </select>
              </label>
              <label className="text-[11px]">Business criticality
                <select value={f.criticality} onChange={(e) => set("criticality", e.target.value)} className={inputCls + " mt-1"}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
              </label>
              <label className="text-[11px]">Data volume
                <select value={f.volume} onChange={(e) => set("volume", e.target.value)} className={inputCls + " mt-1"}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-muted">Regulatory scope:</span>
              {["MAS", "RBI", "SEBI"].map((fw) => (
                <button type="button" key={fw} onClick={() => toggleFw(fw)} className={cn("rounded-lg border px-2 py-0.5", f.frameworks.includes(fw) ? "border-brand/50 bg-brand/10 text-fg" : "border-border text-muted")}>{fw}</button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
          <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 disabled:opacity-60 sm:col-span-2">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
            {busy ? "Creating account…" : "Create account & start questionnaire"}
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>
      </motion.div>
    </main>
  );
}
