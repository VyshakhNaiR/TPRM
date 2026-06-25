"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldAlert, Layers, Network, LogOut, Loader2, Printer, Inbox } from "lucide-react";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { RiskDial, Stat, ErrorState, errorMessage } from "@/components/ui";
import { cn } from "@/lib/utils";

const RATING_TONE: Record<string, string> = {
  Good: "text-ok", Satisfactory: "text-ok", "Needs Improvement": "text-warn", Unsatisfactory: "text-danger", Unrated: "text-muted",
};
const FW_VAR: Record<string, string> = { MAS: "mas", RBI: "rbi", SEBI: "sebi" };

export default function Portfolio() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError("");
      try {
        const meRes = await fetch("/api/me");
        if (!meRes.ok) throw new Error(await errorMessage(meRes, "Could not verify your session."));
        const me = await meRes.json();
        const role = me.session?.role;
        if (role !== "assessor" && role !== "root" && role !== "customer") { router.push("/login"); return; }
        const res = await fetch("/api/portfolio");
        if (!res.ok) throw new Error(await errorMessage(res, "Could not load the portfolio."));
        if (!cancelled) setData(await res.json());
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load the portfolio.");
      }
    })();
    return () => { cancelled = true; };
  }, [router, reloadKey]);

  async function logout() {
    try { await fetch("/api/logout", { method: "POST" }); } finally { router.push("/login"); }
  }

  if (loadError && !data) return <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!data) return <main className="grid min-h-screen place-items-center text-muted"><Loader2 className="animate-spin" /></main>;
  const { vendorRows, threats, domains, frameworks, concentration, totals } = data;
  const maxThreat = Math.max(1, ...threats.map((t: any) => t.exposedVendors));
  const hasVendors = (totals?.vendors ?? 0) > 0 && (vendorRows?.length ?? 0) > 0;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 pb-20">
      <header className="sticky top-0 z-20 -mx-5 mb-6 flex items-center justify-between border-b border-border bg-bg/70 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/console" className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-fg"><ArrowLeft size={16} /></Link>
          <LogoLockup markWidth={38} /><span className="hidden text-sm text-muted sm:inline">· Portfolio</span>
        </div>
        <div className="no-print flex items-center gap-3">
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted hover:text-fg"><Printer size={14} /> Export PDF</button>
          <ThemeToggle /><button onClick={logout} className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted hover:text-fg"><LogOut size={16} /></button>
        </div>
      </header>

      {!hasVendors && (
        <div className="glass mt-6 flex flex-col items-center rounded-2xl p-12 text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-full border border-border bg-surface-2/60 text-muted">
            <Inbox size={22} />
          </div>
          <h2 className="text-base font-semibold">No vendors in scope yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Once vendors onboard and complete their assessments, portfolio analytics — threat exposure, domain weakness and concentration risk — will appear here.
          </p>
          <Link href="/console" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110">
            Go to the assessor console
          </Link>
        </div>
      )}

      {hasVendors && (
      <>
      {/* top stats */}
      <section className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={totals.vendors} label="Vendors in scope" />
          <Stat value={totals.critical} label="Critical tier" tone="warn" />
          <Stat value={totals.unsatisfactory} label="Unsatisfactory" tone="danger" />
          <Stat value={`${totals.avgPosture}%`} label="Avg posture" tone="ok" />
        </div>
        <div className="glass flex items-center gap-4 rounded-2xl p-4">
          <RiskDial score={totals.avgPosture} label="portfolio" />
          <div className="space-y-1.5 pr-2">
            {frameworks.map((f: any) => (
              <div key={f.id} className="w-40">
                <div className="mb-0.5 flex justify-between text-[11px]"><span className="font-semibold">{f.name}</span><span className="text-muted">{f.pct}%</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${f.pct}%`, background: `rgb(var(--${FW_VAR[f.id]}))` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* THREAT EXPOSURE MAP (centerpiece) */}
        <section className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2"><ShieldAlert size={16} className="text-danger" /><h2 className="text-sm font-semibold">Threat exposure</h2><span className="text-xs text-muted">— control gaps mapped to threats</span></div>
          <div className="space-y-3">
            {threats.map((t: any, i: number) => (
              <motion.div key={t.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{t.label}</span>
                  <span className="text-xs text-muted">{t.exposedVendors}/{totals.vendors} vendors</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <motion.div className={cn("h-full rounded-full", t.severity > 0.6 ? "bg-danger" : t.severity > 0.3 ? "bg-warn" : "bg-ok")}
                    initial={{ width: 0 }} animate={{ width: `${(t.exposedVendors / maxThreat) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.05 }} />
                </div>
                <div className="mt-0.5 flex justify-between text-[10px] text-muted"><span>{t.description}</span><span className="shrink-0 pl-2 font-mono">{t.attack}</span></div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* DOMAIN HEATMAP */}
        <section className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2"><Layers size={16} className="text-brand" /><h2 className="text-sm font-semibold">Control-domain weakness</h2><span className="text-xs text-muted">— weakest first</span></div>
          <div className="space-y-2">
            {domains.slice(0, 10).map((d: any) => (
              <div key={d.family} className="flex items-center gap-2">
                <span className="w-44 shrink-0 truncate text-xs">{d.family}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className={cn("h-full rounded-full", d.pct >= 75 ? "bg-ok" : d.pct >= 50 ? "bg-warn" : "bg-danger")} style={{ width: `${d.pct}%` }} />
                </div>
                <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted">{d.pct}%</span>
              </div>
            ))}
          </div>
        </section>

        {/* CONCENTRATION */}
        <section className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2"><Network size={16} className="text-sebi" /><h2 className="text-sm font-semibold">Concentration / 4th-party risk</h2></div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-muted">Cloud provider</div>
              {concentration.cloud.map((c: any) => (
                <div key={c.key} className="flex items-center justify-between py-0.5">
                  <span>{c.key}</span>
                  <span className={cn("text-xs", c.count >= 4 ? "font-semibold text-danger" : "text-muted")}>{c.count} vendors{c.count >= 4 ? " · systemic" : ""}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-muted">Region</div>
              {concentration.region.map((c: any) => (
                <div key={c.key} className="flex items-center justify-between py-0.5"><span>{c.key}</span><span className="text-xs text-muted">{c.count}</span></div>
              ))}
            </div>
          </div>
        </section>

        {/* VENDOR TABLE */}
        <section className="glass overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 p-5 pb-2"><h2 className="text-sm font-semibold">Vendors</h2></div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface/90 text-left text-[10px] uppercase tracking-wider text-muted backdrop-blur"><tr><th className="px-4 py-2">Vendor</th><th className="px-2 py-2">Tier</th><th className="px-2 py-2">Posture</th><th className="px-4 py-2">Rating</th></tr></thead>
              <tbody>
                {vendorRows.map((v: any) => (
                  <tr key={v.id} className="border-t border-border/50">
                    <td className="px-4 py-2"><div className="font-medium">{v.name}</div><div className="text-[10px] text-muted">{v.cloud} · {v.region}</div></td>
                    <td className="px-2 py-2 text-xs text-muted">{v.tier}</td>
                    <td className="px-2 py-2 tabular-nums">{v.posture}%</td>
                    <td className={cn("px-4 py-2 text-xs font-semibold", RATING_TONE[v.rating])}>{v.rating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <p className="mt-4 text-center text-xs text-muted">Portfolio shown on a demo book of vendors with representative distributions; onboarded vendors fold in as they complete assessments. Threat mapping is deterministic (control gaps → threats), not live threat intel.</p>
      </>
      )}
    </main>
  );
}
