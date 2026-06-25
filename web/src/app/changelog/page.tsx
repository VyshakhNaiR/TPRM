"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck, Sparkles, Wrench, Plus, Wand2, Server, LogOut, Loader2 } from "lucide-react";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ErrorState } from "@/components/ui";
import { CHANGELOG, CHANGE_LABEL, type ChangeType } from "@/data/changelog";
import { cn } from "@/lib/utils";

// Visual treatment per change type (uses the shared theme tokens).
const TYPE_STYLE: Record<ChangeType, { cls: string; Icon: any }> = {
  security: { cls: "text-danger border-danger/40 bg-danger/10", Icon: ShieldCheck },
  ai: { cls: "text-brand border-brand/40 bg-brand/10", Icon: Wand2 },
  feature: { cls: "text-ok border-ok/40 bg-ok/10", Icon: Plus },
  fix: { cls: "text-warn border-warn/40 bg-warn/10", Icon: Wrench },
  ux: { cls: "text-mas border-mas/40 bg-mas/10", Icon: Sparkles },
  infra: { cls: "text-muted border-border bg-surface-2", Icon: Server },
};

function TypeChip({ type }: { type: ChangeType }) {
  const { cls, Icon } = TYPE_STYLE[type];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", cls)}>
      <Icon size={11} /> {CHANGE_LABEL[type]}
    </span>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function Changelog() {
  const router = useRouter();
  const [role, setRole] = useState<string>("");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError("");
      try {
        const res = await fetch("/api/me");
        if (!res.ok) throw new Error("Could not verify your session.");
        const me = await res.json();
        const r = me.session?.role;
        // Changelog is for the bank's own staff: Root and Assessor.
        if (r !== "root" && r !== "assessor") {
          router.push("/login");
          return;
        }
        if (!cancelled) setRole(r);
      } catch {
        if (!cancelled) setLoadError("Failed to load. Please retry.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, reloadKey]);

  const backHref = role === "root" ? "/admin" : "/console";

  if (loadError) return <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!role)
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="animate-spin text-muted" />
      </main>
    );

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 pb-20">
      {/* Top bar */}
      <header className="sticky top-0 z-20 -mx-5 mb-6 flex items-center justify-between border-b border-border bg-bg/70 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href={backHref} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-fg" aria-label="Back">
            <ArrowLeft size={16} />
          </Link>
          <LogoLockup markWidth={38} />
          <span className="hidden text-sm text-muted sm:inline">· Changelog</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={async () => { await fetch("/api/logout", { method: "POST" }); window.location.href = "/login"; }}
            className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted hover:text-fg"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="mb-8">
        <h1 className="text-2xl font-bold">What&apos;s new</h1>
        <p className="mt-1 text-sm text-muted">Release notes for the TPRM platform. Newest first.</p>
      </div>

      <p className="mb-6 inline-flex items-center gap-2 rounded-lg border border-border bg-surface/50 px-3 py-1.5 text-xs text-muted">
        Showing changes relevant to <span className="font-semibold text-fg capitalize">{role}</span>
        {role === "assessor" ? " (workflow & functional)" : " (developer & platform)"}
      </p>

      {/* Releases — items are filtered to the viewer's role */}
      <ol className="relative space-y-10 border-l border-border pl-6">
        {CHANGELOG.map((rel) => {
          const items = rel.items.filter((it) => !it.audience || it.audience === "all" || it.audience === role);
          if (items.length === 0) return null;
          return (
          <li key={rel.version} className="relative">
            <span className="absolute -left-[31px] top-1 grid h-4 w-4 place-items-center rounded-full border border-brand/50 bg-bg">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-lg font-semibold">
                <span className="font-mono text-brand">v{rel.version}</span> · {rel.title}
              </h2>
              <span className="text-xs text-muted">{fmtDate(rel.date)}</span>
            </div>
            {rel.summary && <p className="mt-2 max-w-2xl text-sm text-muted">{rel.summary}</p>}
            <ul className="mt-4 space-y-2.5">
              {items.map((it, i) => (
                <li key={i} className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface/50 p-3 sm:flex-row sm:items-start sm:gap-3">
                  <TypeChip type={it.type} />
                  <span className="text-sm leading-relaxed text-fg">{it.text}</span>
                </li>
              ))}
            </ul>
          </li>
          );
        })}
      </ol>

      <p className="mt-10 text-xs text-muted">
        Role-filtered: Assessors see workflow/functional changes, Root sees developer/platform changes.
      </p>
    </main>
  );
}
