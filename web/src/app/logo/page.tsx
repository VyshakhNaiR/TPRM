"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AnimatedLogo, LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LogoPreview() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-fg">
            <ArrowLeft size={16} />
          </Link>
          <span className="font-semibold">Network Intelligence — animated logo</span>
        </div>
        <ThemeToggle />
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="glass grid place-items-center rounded-3xl p-12">
          <AnimatedLogo width={260} />
          <p className="mt-6 text-xs text-muted">Full lockup · continuous energy flow</p>
        </div>

        <div className="grid gap-6">
          <div className="glass grid place-items-center rounded-3xl p-10">
            <AnimatedLogo width={120} variant="mark" />
            <p className="mt-4 text-xs text-muted">Monogram (app header / favicon)</p>
          </div>
          <div className="glass flex items-center justify-center rounded-3xl p-8">
            <LogoLockup markWidth={56} />
          </div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-3 gap-4">
        {[64, 96, 140].map((w) => (
          <div key={w} className="glass grid place-items-center rounded-2xl p-6">
            <AnimatedLogo width={w} variant="mark" />
          </div>
        ))}
      </section>

      <p className="mt-8 text-center text-xs text-muted">
        Gold energy flows endlessly along the crimson→purple monogram (seamless loop, no reset);
        the dot breathes with a halo. Works in light &amp; dark. Swap in the official vector for pixel accuracy.
      </p>
    </main>
  );
}
