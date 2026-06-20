"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Building2, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { AnimatedLogo } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";

const inputCls = "w-full rounded-xl border border-border bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-brand";

export default function Onboard() {
  const router = useRouter();
  const [f, setF] = useState({ company: "", address: "", website: "", email: "", spocPhone: "", serviceDescription: "", country: "", directContract: false, password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));

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
