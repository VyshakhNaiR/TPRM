"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ClipboardCheck,
  Gauge,
  Layers,
  FileSignature,
  ListChecks,
  ScanSearch,
  ShieldAlert,
  MessageSquareWarning,
  Award,
  BellRing,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { SlideTracer } from "@/components/slide-tracer";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Content model                                                       */
/* ------------------------------------------------------------------ */

type Actor = "Vendor" | "Assessor·DBS" | "Root" | "System" | "Root/Approver" | "Assessor ↔ Vendor";
type Reg = "MAS" | "RBI" | "SEBI";

interface Shot {
  src: string;
  alt: string;
}

interface Stage {
  n: number;
  icon: LucideIcon;
  name: string;
  /** one-line stage definition shown under the title */
  purpose: string;
  /** short intro paragraph: what this stage IS */
  intro: string;
  /** "What happens" — concrete platform behaviour */
  points: string[];
  /** "Why it matters" / regulatory driver */
  why: string;
  actor: Actor;
  regs?: Reg[];
  shot: Shot;
}

const ACTOR_STYLE: Record<Actor, string> = {
  Vendor: "text-mas border-mas/40 bg-mas/10",
  "Assessor·DBS": "text-brand border-brand/40 bg-brand/10",
  Root: "text-sebi border-sebi/40 bg-sebi/10",
  System: "text-ok border-ok/40 bg-ok/10",
  "Root/Approver": "text-sebi border-sebi/40 bg-sebi/10",
  "Assessor ↔ Vendor": "text-warn border-warn/40 bg-warn/10",
};

const REG_VAR: Record<Reg, string> = { MAS: "mas", RBI: "rbi", SEBI: "sebi" };

const STAGES: Stage[] = [
  {
    n: 1,
    icon: Building2,
    name: "Customer (FI) onboarding",
    purpose: "A financial institution joins the platform as an isolated tenant.",
    intro:
      "Before a single vendor is touched, the bank itself is stood up as a tenant. Root configures the institution, its people and its rulebook so everything downstream inherits the right context.",
    points: [
      "Root provisions a new FI tenant with isolated, region-pinned data residency.",
      "Assessor (DBS) accounts are created and scoped strictly to that tenant.",
      "Branding, regulatory frameworks (MAS / RBI / SEBI) and approval authorities are wired in up front.",
      "Per-tenant separation means one bank can never see another bank's vendors or evidence.",
    ],
    why: "Tenant isolation and residency controls satisfy MAS / RBI / SEBI expectations on data localisation and segregation for outsourcing platforms.",
    actor: "Root",
    regs: ["MAS", "RBI", "SEBI"],
    shot: { src: "/shots/admin.png", alt: "Root admin console provisioning a financial-institution tenant" },
  },
  {
    n: 2,
    icon: ClipboardCheck,
    name: "Vendor intake & Due Diligence",
    purpose: "Bring a vendor in — first-time onboarding or a periodic refresh.",
    intro:
      "A vendor enters the lifecycle either for the first time or as a scheduled re-assessment. The platform routes each path to the right depth of due diligence and hands the vendor the keys to its own record.",
    points: [
      "First-time vendor → full due diligence; existing vendor → periodic re-DD on a tier-driven cadence.",
      "A per-vendor login is issued so the vendor owns and submits its own record.",
      "Core profile, ownership, sub-processors and prior assessments are captured at intake.",
      "The vendor's self-declared posture is recorded but treated as advisory, never authoritative.",
    ],
    why: "MAS expects material outsourcing arrangements to be re-assessed at least every 24 months; the intake path enforces that periodic-review obligation.",
    actor: "Assessor·DBS",
    regs: ["MAS"],
    shot: { src: "/shots/onboard.png", alt: "Vendor intake and due-diligence onboarding screen" },
  },
  {
    n: 3,
    icon: Gauge,
    name: "Risk Profiling",
    purpose: "Assessor/DBS-led inherent-risk scoring sets the vendor's tier.",
    intro:
      "The bank — not the vendor — scores the inherent risk of the relationship. That score becomes the tier that drives how hard every later stage works.",
    points: [
      "Scored on data sensitivity, system access, business criticality, residency, 4th-party exposure and volume.",
      "Output is a single tier: Critical / High / Medium / Low.",
      "Vendor self-declaration is advisory only — the bank's assessor-set score is authoritative.",
      "The tier is the pivot for scoping, cadence and the approval authority required later.",
    ],
    why: "Risk-tiering of third parties is a shared expectation across MAS, RBI and SEBI; proportionate oversight starts from a defensible inherent-risk rating.",
    actor: "Assessor·DBS",
    regs: ["MAS", "RBI", "SEBI"],
    shot: { src: "/shots/console.png", alt: "Assessor console showing inherent-risk tiering" },
  },
  {
    n: 4,
    icon: Layers,
    name: "Scoping",
    purpose: "The tier selects how deep the questionnaire goes.",
    intro:
      "Scoping turns the risk tier into a right-sized questionnaire. Low-risk vendors are not buried in controls they don't warrant; critical vendors get the full battery.",
    points: [
      "Tier maps to questionnaire depth: Lite / Core / Full template.",
      "Lower-tier vendors answer a lighter control set; critical vendors get every domain.",
      "Templates are reusable across vendors, so scoping stays consistent and auditable.",
      "Effort is proportionate — assurance scales with the risk the vendor actually carries.",
    ],
    why: "Proportionality is an explicit supervisory principle (MAS / RBI / SEBI): assurance effort should scale to the materiality of the arrangement.",
    actor: "System",
    shot: { src: "/shots/vendor.png", alt: "Scoped questionnaire template assigned to a vendor" },
  },
  {
    n: 5,
    icon: FileSignature,
    name: "Contract / MSA",
    purpose: "Verify the contract carries the clauses regulators require.",
    intro:
      "The master services agreement is checked against a mandatory-clause checklist. Anything the regulators require to be contractual must be present and is converted into trackable obligations.",
    points: [
      "Upload the MSA; run it against a mandatory-clause checklist.",
      "Audit rights, breach notification, data residency, exit/termination and sub-contracting clauses are each mapped to MAS / RBI / SEBI.",
      "Missing or weak clauses surface as gaps before the relationship proceeds.",
      "Captured commitments build an obligation register that continuous monitoring later tracks.",
    ],
    why: "MAS, RBI and SEBI all mandate specific outsourcing clauses (audit access, breach notice, exit, sub-contracting); the checklist proves they exist in the signed contract.",
    actor: "Assessor·DBS",
    regs: ["MAS", "RBI", "SEBI"],
    shot: { src: "/shots/compliance.png", alt: "Contract clause checklist mapped to MAS, RBI and SEBI" },
  },
  {
    n: 6,
    icon: ListChecks,
    name: "Questionnaire & Evidence",
    purpose: "The vendor answers controls and attaches the proof.",
    intro:
      "This is where claims meet proof. The vendor works through a categorized, collapsible questionnaire and attaches evidence per control — and an assessor can step in to do it with them.",
    points: [
      "Categorized, collapsible control families; the vendor attaches evidence per item.",
      'Any "Not Applicable" answer requires a written N/A reasoning statement — no silent skips.',
      "Assessors can act ON BEHALF of the vendor (onsite or remote) and upload responses for them.",
      "Every entry is attributed — the record always shows who entered it and how.",
    ],
    why: "Evidence-backed answers with mandatory N/A justification create the auditable trail MAS / RBI / SEBI examiners expect for outsourcing assurance.",
    actor: "Vendor",
    shot: { src: "/shots/vendor.png", alt: "Categorized collapsible questionnaire with evidence upload" },
  },
  {
    n: 7,
    icon: ScanSearch,
    name: "Adjudication",
    purpose: "The engine judges what's claimed against what's proven.",
    intro:
      "An adjudication engine reads each answer alongside its evidence and forms a verdict. The finding lives in the gap between what the vendor said and what the evidence actually shows.",
    points: [
      "Reads the attached evidence and weighs the claim against the proof for each control.",
      "Static-rule engine corroborates answers against evidence for transparent, repeatable accuracy.",
      "Runs as Static / Cloud-AI / Hybrid depending on the tenant's configuration.",
      "Produces a per-control verdict with the reasoning attached, not just a pass/fail flag.",
    ],
    why: "Independent, corroborated adjudication of vendor claims supports the substantive (not box-ticking) assurance MAS / RBI / SEBI expect.",
    actor: "System",
    shot: { src: "/shots/console.png", alt: "Adjudication engine weighing claim against evidence" },
  },
  {
    n: 8,
    icon: ShieldAlert,
    name: "Assessor override",
    purpose: "The human assessor is the final authority.",
    intro:
      "The engine advises; the human decides. Any machine verdict can be overruled by an assessor — but never silently. Every override carries a reason and an audit trail.",
    points: [
      "An assessor can override any engine verdict on any control.",
      "Override requires a mandatory written rationale before it can be saved.",
      "The human decision becomes authoritative and supersedes the engine result.",
      "Both the original verdict and the override are fully audit-logged with attribution.",
    ],
    why: "Keeping a human accountable for the final risk decision aligns with MAS / RBI / SEBI expectations that the bank — not a tool — owns its outsourcing risk judgments.",
    actor: "Assessor·DBS",
    shot: { src: "/shots/console.png", alt: "Assessor overriding an engine verdict with mandatory rationale" },
  },
  {
    n: 9,
    icon: MessageSquareWarning,
    name: "Findings, remediation & feedback",
    purpose: "Findings go back to the vendor and the loop closes.",
    intro:
      "Gaps don't sit in a report — they become work. Findings flow back to the vendor, the affected control re-opens, and a threaded conversation keeps everyone aligned until it's resolved.",
    points: [
      "Findings are returned to the vendor for remediation with the assessor's notes.",
      "The affected control re-opens and auto-resubmits for re-adjudication once addressed.",
      "Threaded clarifications keep assessor, vendor and customer in one conversation.",
      "Status is visible end-to-end, so nothing closes without an evidence-backed fix.",
    ],
    why: "A closed remediation loop with documented follow-through evidences the ongoing oversight MAS / RBI / SEBI require for the life of the arrangement.",
    actor: "Assessor ↔ Vendor",
    shot: { src: "/shots/console.png", alt: "Findings and remediation thread between assessor and vendor" },
  },
  {
    n: 10,
    icon: Award,
    name: "Consolidated rating & approval",
    purpose: "A single rating routes the vendor to the right approver.",
    intro:
      "All the per-control verdicts roll up into one consolidated rating, and that rating decides who has to sign off. Higher residual risk climbs to more senior authority.",
    points: [
      "Findings and verdicts roll up into one rating: Good → Unsatisfactory.",
      "The rating maps automatically to the required approval authority.",
      "Higher residual risk escalates to a more senior, accountable sign-off.",
      "The approval — and who gave it — is recorded against the vendor's record.",
    ],
    why: "Tiered, authority-mapped approval ensures material-outsourcing decisions reach the right level of accountability, as MAS / RBI / SEBI expect.",
    actor: "Root/Approver",
    regs: ["MAS"],
    shot: { src: "/shots/portfolio.png", alt: "Consolidated portfolio rating and approval view" },
  },
  {
    n: 11,
    icon: BellRing,
    name: "Continuous monitoring & auto-reminders",
    purpose: "Renewals, obligations and deadlines chase themselves.",
    intro:
      "Approval isn't the finish line. The platform keeps watching — contract renewals, the obligation register, certificate expiry and reassessment cadence all generate reminders without anyone having to remember.",
    points: [
      "Tracks contract renewals and the obligation register captured from the MSA.",
      "Compliances and certificate expiry are tracked, including a custom compliance list per vendor.",
      "Auto-reminders fire for contract renewals, obligations and cert/compliance expiry.",
      "Evidence currency ≤ 12 months and reassessment cadence is set by the vendor's tier.",
    ],
    why: "Continuous, automated monitoring of obligations and expiries delivers the ongoing — not point-in-time — oversight MAS / RBI / SEBI require throughout the relationship.",
    actor: "System",
    regs: ["MAS", "RBI", "SEBI"],
    shot: { src: "/shots/compliance.png", alt: "Continuous monitoring with auto-reminders for renewals and cert expiry" },
  },
];

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function ActorTag({ actor }: { actor: Actor }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", ACTOR_STYLE[actor])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {actor}
    </span>
  );
}

function RegChip({ reg }: { reg: Reg }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
      style={{ borderColor: `rgb(var(--${REG_VAR[reg]}) / 0.4)`, color: `rgb(var(--${REG_VAR[reg]}))` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `rgb(var(--${REG_VAR[reg]}))` }} />
      {reg}
    </span>
  );
}

const EASE = [0.16, 1, 0.3, 1] as const;

// Slide enter/exit: subtle horizontal slide + fade. `dir` is +1 (next) / -1 (prev).
const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 48 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -48 }),
};

/**
 * BrowserFrame — a faux browser "window" around a screenshot. Degrades
 * gracefully: if the image fails to load it shows a labelled placeholder so
 * the slide still looks complete.
 */
function BrowserFrame({ shot }: { shot: Shot }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-glow-sm">
      {/* faux title bar */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-ok/70" />
        <span className="ml-2 truncate rounded-md bg-bg/60 px-2 py-0.5 text-[10px] text-muted">
          networkintelligence.app
        </span>
      </div>
      <div className="relative aspect-[16/10] w-full bg-surface-2">
        {failed ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <Sparkles size={22} className="mx-auto mb-2 text-brand" />
              <p className="text-sm font-medium text-fg">Platform preview</p>
              <p className="mt-1 text-xs text-muted">{shot.alt}</p>
            </div>
          </div>
        ) : (
          <Image
            src={shot.src}
            alt={shot.alt}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover object-top"
            onError={() => setFailed(true)}
            priority={false}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Slides                                                              */
/* ------------------------------------------------------------------ */

function CoverSlide() {
  return (
    <div className="relative overflow-hidden rounded-2xl p-2 sm:p-6">
      <SlideTracer radius={16} duration={9} />
      <div className="relative z-10 flex flex-col items-center px-4 py-8 text-center sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted"
        >
          <Sparkles size={13} className="text-brand" />
          End-to-end TPRM lifecycle · MAS / RBI / SEBI
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.6, ease: EASE }}
          className="max-w-3xl text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl"
        >
          How the platform
          <span className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text text-transparent"> runs a vendor</span>
          <br className="hidden sm:block" /> end to end.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.6, ease: EASE }}
          className="mt-5 max-w-xl text-pretty text-base text-muted sm:text-lg"
        >
          A flow-by-flow walkthrough of the third-party risk lifecycle — from onboarding a
          financial institution to continuous, self-chasing monitoring. Each stage is shown with
          the real screen and the regulatory driver behind it. Use the arrows or your keyboard.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.6, ease: EASE }}
          className="mt-8 flex flex-wrap items-center justify-center gap-2"
        >
          {(["MAS", "RBI", "SEBI"] as Reg[]).map((r) => (
            <RegChip key={r} reg={r} />
          ))}
          <span className="text-xs text-muted">· 11 lifecycle stages</span>
        </motion.div>
      </div>
    </div>
  );
}

function StageSlide({ stage }: { stage: Stage }) {
  const Icon = stage.icon;
  return (
    <div className="glass relative mx-auto w-full max-w-5xl overflow-hidden rounded-2xl p-5 shadow-glow-sm sm:p-8">
      <SlideTracer radius={16} duration={8} />

      {/* Header */}
      <div className="relative z-10 flex items-start gap-4 sm:gap-5">
        <div className="relative shrink-0">
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-brand/40 bg-brand/10 text-brand sm:h-14 sm:w-14">
            <Icon size={24} />
          </span>
          <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-border bg-bg text-xs font-bold tabular-nums text-brand">
            {stage.n}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight sm:text-2xl">{stage.name}</h2>
          <p className="mt-1 text-sm text-muted sm:text-base">{stage.purpose}</p>
        </div>
      </div>

      {/* Two-column body: text + screenshot */}
      <div className="relative z-10 mt-6 grid gap-6 lg:grid-cols-2 lg:gap-8">
        {/* TEXT column */}
        <div className="order-1">
          <p className="text-sm leading-relaxed text-fg/90">{stage.intro}</p>

          <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted">What happens</h3>
          <ul className="mt-2 space-y-2">
            {stage.points.map((p, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.08 + i * 0.05, duration: 0.4, ease: EASE }}
                className="flex items-start gap-2.5 rounded-xl border border-border bg-surface/50 p-2.5 text-sm leading-relaxed text-fg"
              >
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-brand" />
                <span>{p}</span>
              </motion.li>
            ))}
          </ul>

          <div className="mt-5 rounded-xl border border-brand/30 bg-brand/5 p-3.5">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand">
              <ShieldCheck size={13} /> Why it matters
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-fg/90">{stage.why}</p>
          </div>
        </div>

        {/* SCREENSHOT column */}
        <div className="order-2 flex flex-col gap-3">
          <BrowserFrame shot={stage.shot} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Who acts</span>
            <ActorTag actor={stage.actor} />
            {stage.regs && stage.regs.length > 0 && (
              <>
                <span className="ml-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Driver</span>
                {stage.regs.map((r) => (
                  <RegChip key={r} reg={r} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Supporting slide that surfaces the platform "extras" (cost + SBOM). */
function ExtrasSlide() {
  const extras: { shot: Shot; title: string; body: string }[] = [
    {
      shot: { src: "/shots/cost.png", alt: "AI cost efficiency dashboard" },
      title: "Cost-efficient AI",
      body: "Caching, model routing and batching keep adjudication economical without dropping rigour.",
    },
    {
      shot: { src: "/shots/sbom.png", alt: "Software bill-of-materials view" },
      title: "SBOM & supply-chain view",
      body: "Software bill-of-materials surfaces 4th-party and component risk behind each vendor.",
    },
  ];
  return (
    <div className="glass relative mx-auto w-full max-w-5xl overflow-hidden rounded-2xl p-5 shadow-glow-sm sm:p-8">
      <SlideTracer radius={16} duration={8} />
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Sparkles size={13} className="text-brand" /> Platform extras
        </div>
        <h2 className="mt-2 text-xl font-bold leading-tight sm:text-2xl">Beyond the core lifecycle</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted sm:text-base">
          The same record powers cost-aware AI and supply-chain visibility — so oversight stays
          affordable and reaches past the direct vendor.
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {extras.map((e) => (
            <div key={e.title}>
              <BrowserFrame shot={e.shot} />
              <h3 className="mt-3 text-sm font-semibold text-fg">{e.title}</h3>
              <p className="mt-1 text-sm text-muted">{e.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ClosingSlide() {
  return (
    <div className="relative overflow-hidden rounded-2xl p-2 sm:p-6">
      <SlideTracer radius={16} duration={9} />
      <div className="relative z-10 flex flex-col items-center px-4 py-8 text-center sm:py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-ok/40 bg-ok/10 text-ok"
        >
          <CheckCircle2 size={30} />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.6, ease: EASE }}
          className="max-w-3xl text-balance text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl"
        >
          A closed-loop, bank-owned,
          <span className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text text-transparent"> continuously-monitored</span> TPRM lifecycle.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.6, ease: EASE }}
          className="mt-5 max-w-lg text-pretty text-base text-muted sm:text-lg"
        >
          Every verdict is human-final, every action attributed, every obligation tracked — and
          the regulatory coverage redraws itself in real time.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.6, ease: EASE }}
          className="mt-8"
        >
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
          >
            Back to app
            <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Deck                                                                */
/* ------------------------------------------------------------------ */

// Slide 0 = cover, 1..N = stages, N+1 = extras, last = closing.
const TOTAL = STAGES.length + 3;
const EXTRAS_INDEX = STAGES.length + 1;
const CLOSING_INDEX = TOTAL - 1;

export default function WorkflowDeck() {
  const [[index, dir], setSlide] = useState<[number, number]>([0, 0]);

  const go = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(TOTAL - 1, next));
    setSlide(([cur]) => [clamped, clamped > cur ? 1 : clamped < cur ? -1 : 0]);
  }, []);

  const prev = useCallback(() => setSlide(([cur]) => [Math.max(0, cur - 1), -1]), []);
  const next = useCallback(() => setSlide(([cur]) => [Math.min(TOTAL - 1, cur + 1), 1]), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const isCover = index === 0;
  const isClosing = index === CLOSING_INDEX;
  const isExtras = index === EXTRAS_INDEX;
  const stage = !isCover && !isClosing && !isExtras ? STAGES[index - 1] : null;

  const title = isCover
    ? "Overview"
    : isClosing
    ? "Wrap-up"
    : isExtras
    ? "Platform extras"
    : stage!.name;

  return (
    <main className="flex min-h-screen flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg/70 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <LogoLockup markWidth={38} />
          <span className="hidden text-sm text-muted sm:inline">· Workflow</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm text-muted transition hover:text-fg"
          >
            <ArrowLeft size={15} />
            <span className="hidden sm:inline">Back to app</span>
          </Link>
        </div>
      </header>

      {/* Step indicator */}
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-6">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Step {index + 1} / {TOTAL}
        </span>
        <span className="truncate pl-3 text-right text-sm font-semibold text-fg">{title}</span>
      </div>

      {/* Slide stage */}
      <section className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-8 sm:px-5">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={index}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.32, ease: EASE }}
            className="w-full"
          >
            {isCover ? (
              <CoverSlide />
            ) : isClosing ? (
              <ClosingSlide />
            ) : isExtras ? (
              <ExtrasSlide />
            ) : (
              <StageSlide stage={stage!} />
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Controls + progress dots */}
      <footer className="sticky bottom-0 z-20 border-t border-border bg-bg/70 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
          <button
            onClick={prev}
            disabled={index === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface/60 px-4 py-2.5 text-sm font-semibold text-fg transition hover:shadow-glow-sm disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous slide"
          >
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Prev</span>
          </button>

          {/* Progress dots */}
          <div className="flex flex-1 flex-wrap items-center justify-center gap-1.5">
            {Array.from({ length: TOTAL }).map((_, i) => {
              const active = i === index;
              return (
                <button
                  key={i}
                  onClick={() => go(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    active ? "w-6 bg-brand" : "w-2 bg-border hover:bg-muted"
                  )}
                />
              );
            })}
          </div>

          <button
            onClick={next}
            disabled={index === TOTAL - 1}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next slide"
          >
            <span className="hidden sm:inline">Next</span> <ArrowRight size={16} />
          </button>
        </div>
      </footer>
    </main>
  );
}
