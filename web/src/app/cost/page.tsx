"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Wallet } from "lucide-react";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Stat } from "@/components/ui";
import { cn } from "@/lib/utils";

// Verified Anthropic pricing (mid-2026, $/MTok). Per adjudication: 8k shared +
// 2k variable input, 400 output.
const NAIVE_PER = 10000 / 1e6 * 5 + 400 / 1e6 * 25; // Opus, no cache/batch
const SONNET_OPT = 8000 / 1e6 * 0.15 + 8000 / 1e6 * (1.875 - 0.15) / 115 + 2000 / 1e6 * 1.5 + 400 / 1e6 * 7.5; // cache+batch

const ENGINES = [
  { id: "static", label: "Static Pipeline", per: 0, note: "rules + extraction, no tokens" },
  { id: "local", label: "Local AI (Ollama / Claude Code)", per: 0, note: "self-hosted / subscription" },
  { id: "hybrid", label: "Hybrid (static → AI on ~25%)", per: SONNET_OPT * 0.25, note: "most controls resolve free" },
  { id: "integrated", label: "AI Integrated (Sonnet + cache + batch)", per: SONNET_OPT, note: "metered, cost-optimized" },
  { id: "naive", label: "Naive (Opus, no cache/batch)", per: NAIVE_PER, note: "what NOT to do", bad: true },
];

export default function CostDashboard() {
  const router = useRouter();
  const [vendors, setVendors] = useState(130);
  const [controls] = useState(54);

  useEffect(() => {
    (async () => {
      try {
        const me = await (await fetch("/api/me")).json();
        if (me.session?.role !== "root") router.push("/login"); // Cost is a Root-only platform view
      } catch {
        router.push("/login");
      }
    })();
  }, [router]);

  const adjudications = vendors * controls;
  const fmt = (n: number) => (n < 0.01 ? "$0" : "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 }));
  const naiveTotal = adjudications * NAIVE_PER;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 pb-20">
      <header className="mb-6 flex items-center justify-between border-b border-border py-3">
        <div className="flex items-center gap-3">
          <Link href="/console" className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-fg"><ArrowLeft size={16} /></Link>
          <LogoLockup markWidth={38} /><span className="hidden text-sm text-muted sm:inline">· Cost</span>
        </div>
        <ThemeToggle />
      </header>

      <div className="mb-5 flex items-center gap-2"><Wallet size={18} className="text-brand" /><h1 className="text-lg font-bold">AI processing cost</h1></div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label htmlFor="cost-vendors" className="rounded-2xl border border-border bg-surface/60 p-4 text-xs">Vendors
          <input id="cost-vendors" type="number" value={vendors} onChange={(e) => setVendors(Math.max(1, Number(e.target.value) || 0))} className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand" />
        </label>
        <Stat value={controls} label="controls each" />
        <Stat value={adjudications.toLocaleString()} label="adjudications / round" />
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted"><tr><th className="px-4 py-3">Engine</th><th className="px-4 py-3">Per vendor</th><th className="px-4 py-3">Full round</th><th className="px-4 py-3">vs naive</th></tr></thead>
          <tbody>
            {ENGINES.map((e) => {
              const round = adjudications * e.per;
              const perVendor = controls * e.per;
              const saving = naiveTotal > 0 ? Math.round((1 - round / naiveTotal) * 100) : 0;
              return (
                <tr key={e.id} className={cn("border-b border-border/60 last:border-0", e.bad && "opacity-70")}>
                  <td className="px-4 py-3"><div className="font-medium">{e.label}</div><div className="text-[11px] text-muted">{e.note}</div></td>
                  <td className="px-4 py-3 tabular-nums">{fmt(perVendor)}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{fmt(round)}</td>
                  <td className={cn("px-4 py-3 text-xs font-semibold", e.bad ? "text-danger" : "text-ok")}>{e.bad ? "baseline" : `−${saving}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-2xl border border-ok/30 bg-ok/5 p-4 text-sm">
        <p className="font-semibold text-ok">A full assessment of all {vendors} vendors costs about {fmt(adjudications * SONNET_OPT)} on cost-optimized AI — and {fmt(0)} on the static or local engines.</p>
        <p className="mt-1 text-xs text-muted">Re-assessments cost even less: a content-hash result cache skips unchanged controls (~$0.10/vendor for a 10%-changed reassessment). With a hard monthly spend cap, there is no scenario that creates a financial hole.</p>
      </div>
      <p className="mt-3 text-center text-xs text-muted">Based on verified Anthropic pricing (Opus $5/$25, Sonnet $3/$15 per MTok; cache read 0.1×; batch 50% off). Token shape: 8k shared + 2k variable in, 400 out per control.</p>
    </main>
  );
}
