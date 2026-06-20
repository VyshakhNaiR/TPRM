"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, UploadCloud, Loader2, Package } from "lucide-react";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export default function SbomAnalyzer() {
  const router = useRouter();
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const me = await (await fetch("/api/me")).json();
      const role = me.session?.role;
      if (role !== "assessor" && role !== "root" && role !== "viewer") router.push("/login");
    })();
  }, [router]);

  async function upload(file: File) {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/sbom", { method: "POST", body: fd });
    setReport(await res.json());
    setBusy(false);
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 pb-20">
      <header className="mb-6 flex items-center justify-between border-b border-border py-3">
        <div className="flex items-center gap-3">
          <Link href="/console" className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-fg"><ArrowLeft size={16} /></Link>
          <LogoLockup markWidth={38} /><span className="hidden text-sm text-muted sm:inline">· SBOM analyzer (SEBI CSCRF)</span>
        </div>
        <ThemeToggle />
      </header>

      <div className="glass rounded-2xl p-6 text-center">
        <Package className="mx-auto mb-2 text-brand" size={28} />
        <h1 className="text-lg font-bold">Software Bill of Materials analyzer</h1>
        <p className="mb-4 text-sm text-muted">Upload a vendor SBOM (CycloneDX or SPDX JSON) — we parse components and check SEBI CSCRF field coverage.</p>
        <input ref={fileRef} type="file" accept=".json,.cdx,.spdx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow-sm hover:brightness-110 disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} {busy ? "Parsing…" : "Upload SBOM"}
        </button>
      </div>

      {report?.error && <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{report.error}</p>}

      {report && !report.error && (
        <div className="mt-5 space-y-5">
          <div className="glass flex flex-wrap items-center gap-6 rounded-2xl p-5">
            <div><div className="text-2xl font-bold">{report.componentCount}</div><div className="text-xs text-muted">components</div></div>
            <div><div className="text-2xl font-bold">{report.format}</div><div className="text-xs text-muted">format</div></div>
          </div>

          <div className="glass rounded-2xl p-5">
            <h2 className="mb-3 text-sm font-semibold">SEBI field coverage</h2>
            <div className="space-y-2">
              {report.coverage.map((c: any) => (
                <div key={c.field} className="flex items-center gap-2">
                  <span className="w-44 shrink-0 text-xs">{c.field}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className={cn("h-full rounded-full", c.pct >= 90 ? "bg-ok" : c.pct >= 50 ? "bg-warn" : "bg-danger")} style={{ width: `${c.pct}%` }} /></div>
                  <span className="w-28 shrink-0 text-right text-[11px] text-muted">{c.note ? c.note : `${c.pct}%`}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass overflow-hidden rounded-2xl">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface/90 text-left uppercase tracking-wider text-muted backdrop-blur"><tr><th className="px-3 py-2">Component</th><th className="px-3 py-2">Version</th><th className="px-3 py-2">Supplier</th><th className="px-3 py-2">License</th><th className="px-3 py-2">Hash</th></tr></thead>
                <tbody>
                  {report.components.map((c: any, i: number) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="px-3 py-1.5 font-medium">{c.name || "—"}</td><td className="px-3 py-1.5">{c.version || "—"}</td><td className="px-3 py-1.5 text-muted">{c.supplier || "—"}</td><td className="px-3 py-1.5 text-muted">{c.license || "—"}</td><td className="px-3 py-1.5 text-muted">{c.hash || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
