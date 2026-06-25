"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  UploadCloud,
  FileSpreadsheet,
  Loader2,
  Trash2,
  Save,
  ListChecks,
  CalendarClock,
  Link2,
  Link2Off,
} from "lucide-react";
import { LogoLockup } from "@/components/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ErrorState, Toaster, errorMessage, useToasts } from "@/components/ui";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Types (mirror the /api/customq backend shapes)                     */
/* ------------------------------------------------------------------ */

interface CatalogControl {
  id: string;
  question: string;
  family: string;
  frameworks: string[];
}

interface TemplateItem {
  question: string;
  controlId: string | null;
  custom: boolean;
  frameworks: string[];
}

interface CustomTemplate {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  items: TemplateItem[];
}

interface Proposal {
  row: number;
  question: string;
  proposedControlId: string | null;
  controlLabel: string | null;
  family: string | null;
  frameworks: string[];
  confidence: number; // 0..1
  custom: boolean;
}

interface ParseResult {
  columns: string[];
  questionColumn: number;
  rowsParsed: number;
  mapped: number;
  custom: number;
  proposals: Proposal[];
}

/** A reviewable row in the mapping table — proposal + the assessor's current choice. */
interface ReviewRow {
  row: number;
  question: string;
  /** Selected control id, or "" for "— Custom control —". */
  selectedControlId: string;
  confidence: number;
}

const CUSTOM_VALUE = ""; // sentinel for the "— Custom control —" option

const inputCls =
  "w-full rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-60";

const FRAMEWORK_VAR: Record<string, string> = { MAS: "mas", RBI: "rbi", SEBI: "sebi" };

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtDate(date?: string): string {
  if (!date) return "—";
  const d = new Date(date);
  return isNaN(d.getTime()) ? date : d.toLocaleDateString();
}

function FrameworkChips({ frameworks }: { frameworks: string[] }) {
  if (!frameworks.length) return <span className="text-[10px] text-muted">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {frameworks.map((f) => (
        <span
          key={f}
          className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold"
          style={{
            color: `rgb(var(--${FRAMEWORK_VAR[f] ?? "muted"}))`,
            borderColor: `rgb(var(--${FRAMEWORK_VAR[f] ?? "border"}) / 0.4)`,
            background: `rgb(var(--${FRAMEWORK_VAR[f] ?? "surface-2"}) / 0.1)`,
          }}
        >
          {f}
        </span>
      ))}
    </span>
  );
}

/** Inline confidence bar + percent. */
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.8 ? "bg-ok" : value >= 0.6 ? "bg-warn" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className={cn("h-full rounded-full", tone)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-muted">{pct}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                              */
/* ------------------------------------------------------------------ */

export default function CustomQuestionnairePage() {
  const router = useRouter();
  const toast = useToasts();

  const [role, setRole] = useState("");
  const canManage = role === "assessor" || role === "root";

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // data
  const [catalog, setCatalog] = useState<CatalogControl[]>([]);
  const [templates, setTemplates] = useState<CustomTemplate[]>([]);

  // upload / parse
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [colOverride, setColOverride] = useState<number | null>(null);

  // review
  const [rows, setRows] = useState<ReviewRow[]>([]);

  // save
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const catalogById = useMemo(() => {
    const m = new Map<string, CatalogControl>();
    catalog.forEach((c) => m.set(c.id, c));
    return m;
  }, [catalog]);

  /* ---- gate + initial load (catalog + saved templates) ---- */
  const loadBase = useCallback(async () => {
    const r = await fetch("/api/customq");
    if (!r.ok) throw new Error(await errorMessage(r, "Could not load the questionnaire workspace."));
    const d = await r.json();
    setCatalog(d.catalog ?? []);
    setTemplates(d.templates ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError("");
      try {
        const meRes = await fetch("/api/me");
        if (!meRes.ok) throw new Error(await errorMessage(meRes, "Could not verify your session."));
        const me = await meRes.json();
        const r = me.session?.role;
        if (r !== "assessor" && r !== "root") {
          router.push("/login");
          return;
        }
        if (cancelled) return;
        setRole(r);
        await loadBase();
        if (cancelled) return;
        setLoaded(true);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load the questionnaire workspace.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, reloadKey, loadBase]);

  /* ---- build review rows from a parse result ---- */
  const buildRows = useCallback((p: ParseResult): ReviewRow[] => {
    return p.proposals.map((pr) => ({
      row: pr.row,
      question: pr.question,
      selectedControlId: pr.custom ? CUSTOM_VALUE : pr.proposedControlId ?? CUSTOM_VALUE,
      confidence: pr.confidence,
    }));
  }, []);

  /* ---- upload + parse (optionally with a column override) ---- */
  const runParse = useCallback(
    async (f: File, col: number | null) => {
      setParsing(true);
      try {
        const fd = new FormData();
        fd.append("file", f);
        if (col !== null) fd.append("col", String(col));
        const res = await fetch("/api/customq", { method: "POST", body: fd });
        if (!res.ok) throw new Error(await errorMessage(res, "Could not parse the file."));
        const p: ParseResult = await res.json();
        setParse(p);
        setColOverride(p.questionColumn);
        setRows(buildRows(p));
        if (!name.trim()) setName(f.name.replace(/\.(xlsx|xls|csv)$/i, ""));
        toast.success(`Parsed ${p.rowsParsed} rows · ${p.mapped} auto-mapped · ${p.custom} custom.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not parse the file.");
      } finally {
        setParsing(false);
      }
    },
    [buildRows, name, toast]
  );

  function onPickFile(f: File | null) {
    setFile(f);
    if (f) runParse(f, null);
  }

  function onChangeColumn(col: number) {
    setColOverride(col);
    if (file) runParse(file, col);
  }

  /* ---- per-row mapping change ---- */
  function setRowControl(rowIdx: number, controlId: string) {
    setRows((rs) => rs.map((r) => (r.row === rowIdx ? { ...r, selectedControlId: controlId } : r)));
  }

  const mappedCount = rows.filter((r) => r.selectedControlId !== CUSTOM_VALUE).length;
  const customCount = rows.length - mappedCount;

  /* ---- save ---- */
  async function save() {
    if (!name.trim()) {
      toast.error("Give the questionnaire a name.");
      return;
    }
    if (!rows.length) {
      toast.error("Upload and review a questionnaire first.");
      return;
    }
    setSaving(true);
    try {
      const items: TemplateItem[] = rows.map((r) => {
        const control = r.selectedControlId ? catalogById.get(r.selectedControlId) : undefined;
        const controlId = control ? control.id : null;
        return {
          question: r.question,
          controlId,
          custom: !controlId,
          frameworks: control ? control.frameworks : [],
        };
      });
      const res = await fetch("/api/customq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), items }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not save the questionnaire."));
      await loadBase();
      // reset the upload workspace
      setParse(null);
      setRows([]);
      setFile(null);
      setColOverride(null);
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Questionnaire saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the questionnaire.");
    } finally {
      setSaving(false);
    }
  }

  /* ---- delete a saved template ---- */
  async function removeTemplate(t: CustomTemplate) {
    try {
      const res = await fetch(`/api/customq?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not delete the questionnaire."));
      await loadBase();
      toast.success("Questionnaire deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the questionnaire.");
    }
  }

  async function logout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  if (loadError && !loaded) return <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!loaded)
    return (
      <main className="grid min-h-screen place-items-center text-muted">
        <Loader2 className="animate-spin" />
      </main>
    );

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-20 -mx-5 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg/70 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/console"
            className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-fg"
            aria-label="Back to console"
          >
            <ArrowLeft size={16} />
          </Link>
          <LogoLockup markWidth={38} />
          <span className="hidden text-sm text-muted sm:inline">· Custom questionnaire</span>
        </div>
        <div className="flex items-center gap-3">
          {!canManage && (
            <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">
              read-only
            </span>
          )}
          <ThemeToggle />
          <button
            onClick={logout}
            className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted hover:text-fg"
            aria-label="Sign out"
          >
            <ArrowLeft size={16} className="rotate-180" />
          </button>
        </div>
      </header>

      {/* ---- Upload ---- */}
      <section className="glass mb-5 rounded-2xl p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <UploadCloud size={16} /> Upload a custom questionnaire
        </h2>
        <p className="mb-3 text-xs text-muted">
          Excel/CSV only. We auto-detect the question column; you can change it below.
        </p>

        <label
          htmlFor="cq-file"
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface-2/40 px-4 py-8 text-center transition hover:border-brand/50",
            parsing && "pointer-events-none opacity-60"
          )}
        >
          {parsing ? (
            <Loader2 size={26} className="animate-spin text-brand" />
          ) : (
            <FileSpreadsheet size={26} className="text-brand" />
          )}
          <span className="text-sm font-medium">
            {parsing ? "Parsing…" : file ? file.name : "Drop a file here or click to browse"}
          </span>
          <span className="text-[11px] text-muted">.xlsx · .xls · .csv</span>
          <input
            id="cq-file"
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            disabled={parsing}
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {/* parse summary + column override */}
        {parse && (
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-4">
            <span className="text-xs text-muted">
              Parsed <span className="font-semibold text-fg">{parse.rowsParsed}</span> rows ·{" "}
              <span className="font-semibold text-ok">{mappedCount}</span> auto-mapped ·{" "}
              <span className="font-semibold text-warn">{customCount}</span> custom
            </span>
            <label className="ml-auto flex items-center gap-2 text-xs">
              <span className="font-semibold uppercase tracking-wider text-muted">Question column</span>
              <select
                value={colOverride ?? parse.questionColumn}
                onChange={(e) => onChangeColumn(Number(e.target.value))}
                disabled={parsing}
                className="rounded-xl border border-border bg-surface/60 px-2.5 py-1.5 text-xs outline-none focus:border-brand disabled:opacity-60"
                aria-label="Question column"
              >
                {parse.columns.map((c, i) => (
                  <option key={i} value={i}>
                    [{i}] {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </section>

      {/* ---- Mapping review ---- */}
      {parse && rows.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="glass mb-5 rounded-2xl p-5"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ListChecks size={16} /> Review mappings
            </h2>
            <span className="text-xs text-muted">
              <span className="font-semibold text-ok">{mappedCount}</span> mapped ·{" "}
              <span className="font-semibold text-warn">{customCount}</span> custom
            </span>
          </div>

          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-1.5 text-left text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted">
                  <th className="px-3 py-1 font-semibold">Question</th>
                  <th className="px-3 py-1 font-semibold">Mapped control</th>
                  <th className="px-3 py-1 font-semibold">Confidence</th>
                  <th className="px-3 py-1 font-semibold">Frameworks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const control = r.selectedControlId ? catalogById.get(r.selectedControlId) : undefined;
                  const isCustom = r.selectedControlId === CUSTOM_VALUE;
                  return (
                    <tr key={r.row} className="align-top">
                      <td className="max-w-[280px] rounded-l-xl border-y border-l border-border bg-surface-2/30 px-3 py-2">
                        <span className="line-clamp-2 break-words" title={r.question}>
                          {r.question}
                        </span>
                      </td>
                      <td className="border-y border-border bg-surface-2/30 px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <select
                            value={r.selectedControlId}
                            disabled={!canManage}
                            onChange={(e) => setRowControl(r.row, e.target.value)}
                            aria-label={`Mapped control for row ${r.row + 1}`}
                            className={cn(
                              inputCls,
                              "py-1.5 text-xs",
                              isCustom ? "border-warn/40" : "border-ok/40"
                            )}
                          >
                            <option value={CUSTOM_VALUE}>— Custom control —</option>
                            {catalog.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.question}
                              </option>
                            ))}
                          </select>
                          {control && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted">
                              <Link2 size={10} className="text-ok" /> {control.family}
                            </span>
                          )}
                          {isCustom && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-warn">
                              <Link2Off size={10} /> Not mapped to a control
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="border-y border-border bg-surface-2/30 px-3 py-2">
                        {isCustom ? <span className="text-xs text-muted">—</span> : <ConfidenceBar value={r.confidence} />}
                      </td>
                      <td className="rounded-r-xl border-y border-r border-border bg-surface-2/30 px-3 py-2">
                        <FrameworkChips frameworks={control ? control.frameworks : []} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Save */}
          {canManage && (
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
              <label className="flex-1 text-xs" htmlFor="cq-name">
                <span className="font-semibold uppercase tracking-wider text-muted">Questionnaire name</span>
                <input
                  id="cq-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={cn(inputCls, "mt-1")}
                  placeholder="Vendor security questionnaire 2026"
                />
              </label>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{" "}
                {saving ? "Saving…" : "Save questionnaire"}
              </button>
            </div>
          )}
        </motion.section>
      )}

      {/* ---- Saved templates ---- */}
      <section>
        <h2 className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Saved questionnaires
        </h2>
        {templates.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-sm text-muted">
            No custom questionnaires saved yet. Upload an Excel or CSV file to get started.
          </div>
        ) : (
          <div className="space-y-2.5">
            {templates.map((t) => {
              const mapped = t.items.filter((i) => !i.custom).length;
              const custom = t.items.length - mapped;
              return (
                <div key={t.id} className="glass flex flex-wrap items-start justify-between gap-3 rounded-2xl p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{t.name}</span>
                      <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-muted">
                        {t.items.length} items
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      <span className="inline-flex items-center gap-1 text-ok">
                        <Link2 size={11} /> {mapped} mapped
                      </span>
                      <span className="inline-flex items-center gap-1 text-warn">
                        <Link2Off size={11} /> {custom} custom
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock size={11} /> {fmtDate(t.createdAt)}
                      </span>
                      {t.createdBy && <span>· {t.createdBy}</span>}
                    </div>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => removeTemplate(t)}
                      aria-label={`Delete ${t.name}`}
                      title={`Delete ${t.name}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-border text-muted transition hover:border-danger/50 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Toaster toasts={toast.toasts} onDismiss={toast.dismiss} />
    </main>
  );
}
