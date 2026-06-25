"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldCheck, Workflow, ScanSearch, ArrowRight, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoLockup } from "@/components/animated-logo";
import { FRAMEWORKS } from "@/data/seed";
import { FRAMEWORK_VAR } from "@/lib/utils";

const fade = (d = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: d, duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
});

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6">
      {/* Nav */}
      <header className="flex items-center justify-between py-6">
        <LogoLockup markWidth={44} />
        <div className="flex items-center gap-3">
          <Link href="/workflow" className="hidden text-sm text-muted hover:text-fg sm:block">
            Workflow
          </Link>
          <Link href="/about" className="hidden text-sm text-muted hover:text-fg sm:block">
            Team
          </Link>
          <Link href="/login" className="hidden text-sm text-muted hover:text-fg sm:block">
            Sign in
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center py-12 text-center">
        <motion.div
          {...fade(0)}
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted"
        >
          <Sparkles size={13} className="text-brand" />
          AI evidence adjudication · live regulatory auto-mapping
        </motion.div>

        <motion.h1 {...fade(0.08)} className="max-w-3xl text-balance text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          Third-party risk,
          <span className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text text-transparent"> assessed at scale.</span>
        </motion.h1>

        <motion.p {...fade(0.16)} className="mt-5 max-w-xl text-pretty text-base text-muted sm:text-lg">
          Vendors answer once. The platform reads their evidence, judges claim against proof,
          and lights up coverage across <span className="text-fg">MAS</span>,{" "}
          <span className="text-fg">RBI</span> and <span className="text-fg">SEBI CSCRF</span> in real time.
        </motion.p>

        <motion.div {...fade(0.24)} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
          >
            Launch the live demo
            <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
          </Link>
          <span className="text-xs text-muted">~130 vendors · 13 domains · 3 frameworks</span>
        </motion.div>

        {/* framework chips */}
        <motion.div {...fade(0.32)} className="mt-12 flex flex-wrap items-center justify-center gap-3">
          {FRAMEWORKS.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs"
              style={{ borderColor: `rgb(var(--${FRAMEWORK_VAR[f.id]}) / 0.4)` }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: `rgb(var(--${FRAMEWORK_VAR[f.id]}))` }} />
              <span className="font-semibold">{f.name}</span>
              <span className="text-muted">{f.clauses.length} clauses</span>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Feature triad */}
      <section className="grid gap-4 pb-16 sm:grid-cols-3">
        {[
          { icon: ScanSearch, title: "Evidence adjudication", body: "Decomposes each RFI into atomic checks; judges what the vendor said against what they actually proved — with citations." },
          { icon: Workflow, title: "Live auto-mapping", body: "Every verdict propagates through a typed control crosswalk to MAS / RBI / SEBI clauses — covered or gap, instantly." },
          { icon: ShieldCheck, title: "Examiner-defensible", body: "Conservative by default, confidence-scored, human-in-the-loop. Benchmarked against real assessor verdicts." },
        ].map((f, i) => (
          <motion.div
            key={f.title}
            {...fade(0.1 * i)}
            className="glass rounded-2xl p-5 transition hover:shadow-glow-sm"
          >
            <f.icon className="mb-3 text-brand" size={22} />
            <h3 className="mb-1 font-semibold">{f.title}</h3>
            <p className="text-sm text-muted">{f.body}</p>
          </motion.div>
        ))}
      </section>
    </main>
  );
}
