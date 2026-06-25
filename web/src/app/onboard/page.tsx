"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Building2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  FileText,
} from "lucide-react";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster, ErrorState, errorMessage, useToasts } from "@/components/ui";
import { computeTier } from "@/lib/risk";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-xl border border-border bg-surface/60 px-3 py-2.5 text-sm outline-none transition focus:border-brand";
const TIER_TONE: Record<string, string> = {
  Critical: "text-danger",
  High: "text-warn",
  Medium: "text-brand",
  Low: "text-ok",
};

type EngagementType = "due_diligence" | "existing";
type InfraType = "on_prem" | "cloud" | "hybrid";
type Regulator = "RBI" | "MAS" | "SEBI" | "None";

interface FormState {
  company: string;
  email: string;
  password: string;
  address: string;
  website: string;
  spocPhone: string;
  serviceDescription: string;
  country: string;
  directContract: boolean;
  engagementType: EngagementType;
  infraType: InfraType;
  csp: string;
  dataSensitivity: "none" | "internal" | "confidential" | "regulated";
  access: "none" | "limited" | "privileged";
  criticality: "low" | "medium" | "high";
  volume: "low" | "medium" | "high";
}

interface OnboardResult {
  vendorId: string;
  tier: string;
  engagementType: string;
  priorFindings: number;
}

const INITIAL: FormState = {
  company: "",
  email: "",
  password: "",
  address: "",
  website: "",
  spocPhone: "",
  serviceDescription: "",
  country: "",
  directContract: false,
  engagementType: "due_diligence",
  infraType: "on_prem",
  csp: "",
  dataSensitivity: "confidential",
  access: "limited",
  criticality: "medium",
  volume: "medium",
};

const REGULATORS: Regulator[] = ["RBI", "MAS", "SEBI", "None"];

export default function Onboard() {
  const router = useRouter();
  const toast = useToasts();

  const [authorized, setAuthorized] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authKey, setAuthKey] = useState(0);

  const [f, setF] = useState<FormState>(INITIAL);
  const [regs, setRegs] = useState<Regulator[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OnboardResult | null>(null);

  const agreementRef = useRef<HTMLInputElement>(null);
  const lastAuditRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  // Auth gate — only assessors / root may onboard vendors.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAuthError("");
      try {
        const res = await fetch("/api/me");
        if (!res.ok) throw new Error(await errorMessage(res, "Could not verify your session."));
        const me = await res.json();
        const role = me.session?.role;
        if (role !== "assessor" && role !== "root") {
          router.push("/login");
          return;
        }
        if (!cancelled) setAuthorized(true);
      } catch (e) {
        if (!cancelled) setAuthError(e instanceof Error ? e.message : "Could not verify your session.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, authKey]);

  const toggleReg = (r: Regulator) => {
    setRegs((cur) => {
      if (r === "None") return cur.includes("None") ? [] : ["None"];
      const next = cur.includes(r) ? cur.filter((x) => x !== r) : [...cur.filter((x) => x !== "None"), r];
      return next;
    });
  };

  const frameworks = regs.filter((r) => r !== "None");
  const { tier } = computeTier({
    dataSensitivity: f.dataSensitivity,
    access: f.access,
    criticality: f.criticality,
    frameworks,
    volume: f.volume,
  });

  const showCsp = f.infraType === "cloud" || f.infraType === "hybrid";
  const isExisting = f.engagementType === "existing";

  function resetForm() {
    setF(INITIAL);
    setRegs([]);
    setResult(null);
    if (agreementRef.current) agreementRef.current.value = "";
    if (lastAuditRef.current) lastAuditRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    // Client-side validation of required fields.
    if (!f.company.trim() || !f.email.trim() || !f.password) {
      toast.error("Company, vendor login email and a temporary password are required.");
      return;
    }
    if (f.password.length < 12) {
      toast.error("Temporary password must be at least 12 characters.");
      return;
    }
    if (showCsp && !f.csp.trim()) {
      toast.error("Please name the cloud service provider for a cloud / hybrid vendor.");
      return;
    }

    const fd = new FormData();
    fd.append("company", f.company.trim());
    fd.append("email", f.email.trim());
    fd.append("password", f.password);
    fd.append("address", f.address.trim());
    fd.append("website", f.website.trim());
    fd.append("spocPhone", f.spocPhone.trim());
    fd.append("serviceDescription", f.serviceDescription.trim());
    fd.append("country", f.country.trim());
    fd.append("directContract", f.directContract ? "true" : "false");
    fd.append("engagementType", f.engagementType);
    fd.append("infraType", f.infraType);
    if (showCsp) fd.append("csp", f.csp.trim());
    fd.append("regulators", JSON.stringify(regs));
    fd.append("dataSensitivity", f.dataSensitivity);
    fd.append("access", f.access);
    fd.append("criticality", f.criticality);
    fd.append("volume", f.volume);

    if (isExisting) {
      const agreement = agreementRef.current?.files?.[0];
      const lastAudit = lastAuditRef.current?.files?.[0];
      if (agreement) fd.append("agreement", agreement);
      if (lastAudit) fd.append("lastAudit", lastAudit);
    }

    setBusy(true);
    try {
      // Do NOT set Content-Type — let the browser set the multipart boundary.
      const res = await fetch("/api/onboard", { method: "POST", body: fd });
      if (!res.ok) {
        toast.error(await errorMessage(res, "Onboarding failed."));
        return;
      }
      const data = await res.json();
      setResult({
        vendorId: data.vendorId,
        tier: data.tier,
        engagementType: data.engagementType,
        priorFindings: data.priorFindings ?? 0,
      });
      toast.success(`Vendor onboarded — ${data.tier} tier.`);
    } catch {
      toast.error("Network error — could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (authError && !authorized) {
    return <ErrorState message={authError} onRetry={() => setAuthKey((k) => k + 1)} />;
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 pb-20">
      {/* Top bar */}
      <header className="sticky top-0 z-20 -mx-5 mb-6 flex items-center justify-between border-b border-border bg-bg/70 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/console"
            className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-fg"
            aria-label="Back to console"
          >
            <ArrowLeft size={16} />
          </Link>
          <LogoLockup markWidth={38} />
          <span className="hidden text-sm text-muted sm:inline">· Onboard vendor</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/console"
            className="hidden rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted hover:text-fg sm:block"
          >
            Console
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {!authorized ? (
        <div className="grid min-h-[40vh] place-items-center text-sm text-muted">
          <span className="inline-flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Verifying access…
          </span>
        </div>
      ) : result ? (
        <SuccessPanel result={result} onAnother={resetForm} />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="glass rounded-3xl p-6 sm:p-8"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-2/60 text-brand">
              <Building2 size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold">Onboard a vendor</h1>
              <p className="text-sm text-muted">
                Assessor-led intake. Create the vendor record, set the engagement, and seed the risk tier.
              </p>
            </div>
          </div>

          <form ref={formRef} onSubmit={submit} className="space-y-6">
            {/* Company details */}
            <Section title="Company details">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Company / vendor name" required className="sm:col-span-2">
                  <input
                    required
                    value={f.company}
                    onChange={(e) => set("company", e.target.value)}
                    className={inputCls}
                    placeholder="Acme Cloud Services Pvt. Ltd."
                  />
                </Field>
                <Field label="Vendor login email" required>
                  <input
                    required
                    type="email"
                    value={f.email}
                    onChange={(e) => set("email", e.target.value)}
                    autoComplete="off"
                    className={inputCls}
                    placeholder="spoc@acme.com"
                  />
                </Field>
                <Field label="Temporary password" required help="Min 12 characters. The vendor changes this on first login.">
                  <input
                    required
                    type="password"
                    minLength={12}
                    value={f.password}
                    onChange={(e) => set("password", e.target.value)}
                    autoComplete="new-password"
                    className={inputCls}
                    placeholder="At least 12 characters"
                  />
                </Field>
                <Field label="SPOC contact number">
                  <input
                    value={f.spocPhone}
                    onChange={(e) => set("spocPhone", e.target.value)}
                    className={inputCls}
                    placeholder="+65 …"
                  />
                </Field>
                <Field label="Country">
                  <input
                    value={f.country}
                    onChange={(e) => set("country", e.target.value)}
                    className={inputCls}
                    placeholder="Singapore / India"
                  />
                </Field>
                <Field label="Head office address" className="sm:col-span-2">
                  <input value={f.address} onChange={(e) => set("address", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Company website" className="sm:col-span-2">
                  <input
                    value={f.website}
                    onChange={(e) => set("website", e.target.value)}
                    className={inputCls}
                    placeholder="https://"
                  />
                </Field>
                <Field label="Service provided to the client" className="sm:col-span-2">
                  <textarea
                    value={f.serviceDescription}
                    onChange={(e) => set("serviceDescription", e.target.value)}
                    rows={2}
                    className={inputCls + " resize-y"}
                    placeholder="Describe the service / product offered to the bank."
                  />
                </Field>
                <label className="flex items-center gap-2 text-xs text-muted sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={f.directContract}
                    onChange={(e) => set("directContract", e.target.checked)}
                    className="accent-brand"
                  />
                  The vendor holds a direct contract with the client.
                </label>
              </div>
            </Section>

            {/* Engagement & infrastructure */}
            <Section title="Engagement & infrastructure">
              <div className="space-y-4">
                <div>
                  <span className="mb-1.5 block text-xs font-semibold text-fg">Engagement type</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <RadioCard
                      name="engagementType"
                      checked={f.engagementType === "due_diligence"}
                      onChange={() => set("engagementType", "due_diligence")}
                      title="Due diligence"
                      desc="New vendor — full intake & assessment."
                    />
                    <RadioCard
                      name="engagementType"
                      checked={f.engagementType === "existing"}
                      onChange={() => set("engagementType", "existing")}
                      title="Existing vendor"
                      desc="Re-assessment — upload prior agreement & audit."
                    />
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block text-xs font-semibold text-fg">Infrastructure</span>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <RadioCard name="infraType" checked={f.infraType === "on_prem"} onChange={() => set("infraType", "on_prem")} title="On-prem" />
                    <RadioCard name="infraType" checked={f.infraType === "cloud"} onChange={() => set("infraType", "cloud")} title="Cloud" />
                    <RadioCard name="infraType" checked={f.infraType === "hybrid"} onChange={() => set("infraType", "hybrid")} title="Hybrid" />
                  </div>
                </div>

                {showCsp && (
                  <Field label="Cloud service provider" required>
                    <input
                      required
                      value={f.csp}
                      onChange={(e) => set("csp", e.target.value)}
                      className={inputCls}
                      placeholder="AWS / Azure / GCP"
                    />
                  </Field>
                )}
              </div>
            </Section>

            {/* Applicable regulators */}
            <Section title="Applicable regulators">
              <div className="flex flex-wrap gap-2">
                {REGULATORS.map((r) => {
                  const active = regs.includes(r);
                  return (
                    <button
                      type="button"
                      key={r}
                      onClick={() => toggleReg(r)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-xl border px-3.5 py-2 text-sm font-medium transition",
                        active ? "border-brand/50 bg-brand/10 text-fg shadow-glow-sm" : "border-border text-muted hover:text-fg"
                      )}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* Risk profiling */}
            <Section
              title="Risk profiling"
              aside={
                <span className={cn("rounded-full border border-border px-2.5 py-0.5 text-xs font-bold", TIER_TONE[tier])}>
                  {tier} tier
                </span>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Data sensitivity">
                  <select value={f.dataSensitivity} onChange={(e) => set("dataSensitivity", e.target.value as FormState["dataSensitivity"])} className={inputCls}>
                    <option value="none">None</option>
                    <option value="internal">Internal</option>
                    <option value="confidential">Confidential</option>
                    <option value="regulated">Regulated / PII / payment</option>
                  </select>
                </Field>
                <Field label="System / network access">
                  <select value={f.access} onChange={(e) => set("access", e.target.value as FormState["access"])} className={inputCls}>
                    <option value="none">None</option>
                    <option value="limited">Limited</option>
                    <option value="privileged">Privileged</option>
                  </select>
                </Field>
                <Field label="Business criticality">
                  <select value={f.criticality} onChange={(e) => set("criticality", e.target.value as FormState["criticality"])} className={inputCls}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </Field>
                <Field label="Data volume">
                  <select value={f.volume} onChange={(e) => set("volume", e.target.value as FormState["volume"])} className={inputCls}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </Field>
              </div>
            </Section>

            {/* Existing-vendor documents */}
            {isExisting && (
              <Section title="Existing-vendor documents">
                <p className="mb-3 rounded-xl border border-mas/40 bg-mas/10 px-3 py-2 text-xs text-mas">
                  The last audit report is parsed to pre-flag previously non-compliant requirements.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FileField label="Agreement / Contract / MSA" inputRef={agreementRef} />
                  <FileField label="Last TPRM audit report" inputRef={lastAuditRef} />
                </div>
              </Section>
            )}

            <button
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 disabled:opacity-60"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
              {busy ? "Onboarding vendor…" : "Onboard vendor"}
              {!busy && <ArrowRight size={16} />}
            </button>
          </form>
        </motion.div>
      )}

      <Toaster toasts={toast.toasts} onDismiss={toast.dismiss} />
    </main>
  );
}

function SuccessPanel({ result, onAnother }: { result: OnboardResult; onAnother: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass rounded-3xl p-8 text-center"
    >
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full border border-ok/40 bg-ok/10 text-ok">
        <CheckCircle2 size={26} />
      </div>
      <h1 className="text-xl font-bold">
        Vendor onboarded — <span className={TIER_TONE[result.tier] ?? "text-brand"}>{result.tier} tier</span>
      </h1>
      <p className="mt-1 text-sm text-muted">
        {result.engagementType === "existing" ? "Existing vendor re-assessment" : "New due-diligence engagement"} created.
      </p>
      {result.priorFindings > 0 && (
        <p className="mx-auto mt-3 inline-block rounded-xl border border-warn/40 bg-warn/10 px-3 py-1.5 text-sm font-medium text-warn">
          {result.priorFindings} prior finding{result.priorFindings === 1 ? "" : "s"} flagged for focus.
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onAnother}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-fg transition hover:bg-surface-2"
        >
          <RotateCcw size={15} /> Onboard another
        </button>
        <Link
          href="/console"
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110"
        >
          <ExternalLink size={15} /> Open in console
        </Link>
      </div>
    </motion.div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-border bg-surface-2/30 p-4 sm:p-5">
      <legend className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">
        {title}
        {aside}
      </legend>
      <div className="mt-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  required,
  help,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block text-xs", className)}>
      <span className="mb-1 block font-medium text-fg">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {help && <span className="mt-1 block text-[11px] text-muted">{help}</span>}
    </label>
  );
}

function RadioCard({
  name,
  checked,
  onChange,
  title,
  desc,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  desc?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-left transition",
        checked ? "border-brand/50 bg-brand/10 shadow-glow-sm" : "border-border bg-surface/40 hover:bg-surface-2"
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 accent-brand" />
      <span>
        <span className="block text-sm font-semibold text-fg">{title}</span>
        {desc && <span className="mt-0.5 block text-[11px] text-muted">{desc}</span>}
      </span>
    </label>
  );
}

function FileField({ label, inputRef }: { label: string; inputRef: React.RefObject<HTMLInputElement | null> }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 flex items-center gap-1.5 font-medium text-fg">
        <FileText size={13} /> {label}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,image/*"
        className="block w-full cursor-pointer rounded-xl border border-border bg-surface/60 px-3 py-2 text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand hover:file:brightness-110"
      />
    </label>
  );
}
