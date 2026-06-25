"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { AnimatedLogo } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { BackgroundMarquee } from "@/components/background-marquee";

// Team in hierarchy/chronology order — top to bottom. Names only (no titles).
const TIERS: { members: string[]; size: "xl" | "lg" | "md" }[] = [
  { members: ["KK"], size: "xl" },
  { members: ["Vishal", "Udit"], size: "lg" },
  { members: ["Sudhanshu", "Rajat"], size: "lg" },
  { members: ["Anupriya", "Ishvi", "Pratiksha", "Rohit", "Sakshi", "Saumya", "Yashraj"], size: "md" },
];
const DIM: Record<string, number> = { xl: 172, lg: 132, md: 104 };

function Member({ name, size, index }: { name: string; size: "xl" | "lg" | "md"; index: number }) {
  const px = DIM[size];
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.4) }}
      className="flex flex-col items-center gap-3"
    >
      <div
        className="group relative overflow-hidden rounded-full border border-border bg-surface shadow-glow-sm"
        style={{ width: px, height: px }}
      >
        <Image
          src={`/team/${name}.jpeg`}
          alt={name}
          width={px}
          height={px}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-brand/25" />
      </div>
      <div className={"font-semibold " + (size === "xl" ? "text-lg" : "text-sm")}>{name}</div>
    </motion.div>
  );
}

export default function About() {
  let i = 0;
  return (
    <main className="relative min-h-screen overflow-hidden">
      <BackgroundMarquee />
      <div className="relative z-10 mx-auto max-w-5xl px-5 pb-24">
        {/* Top bar */}
        <header className="flex items-center justify-between py-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
            <ArrowLeft size={16} /> Home
          </Link>
          <ThemeToggle />
        </header>

        {/* Hero title — NI logo + GRC Frontier */}
        <div className="mt-6 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-4"
          >
            <AnimatedLogo width={68} variant="mark" />
            <div className="text-left">
              <div className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">Network Intelligence</div>
              <h1 className="text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">
                GRC <span className="text-brand">Frontier</span>
              </h1>
            </div>
          </motion.div>
          <p className="mt-5 max-w-xl text-sm text-muted">
            The team behind the platform — bringing third-party risk and compliance assurance to banks and regulated entities.
          </p>
        </div>

        {/* Team — hierarchy order, names only */}
        <div className="mt-16 space-y-14">
          {TIERS.map((tier, t) => (
            <div key={t} className="flex flex-wrap items-start justify-center gap-x-10 gap-y-10">
              {tier.members.map((name) => (
                <Member key={name} name={name} size={tier.size} index={i++} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
