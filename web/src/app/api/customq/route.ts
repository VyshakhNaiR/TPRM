import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { currentSession, can } from "@/lib/auth";
import { mapQuestions, saveTemplate, listTemplates, deleteTemplate, type CustomItem } from "@/lib/customq";
import { CONTROLS } from "@/data/seed";
import { readJson } from "@/lib/http";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["xlsx", "xls", "csv"]);

// Lightweight control catalog so the confirm UI can re-map a question.
const CATALOG = CONTROLS.map((c) => ({
  id: c.id,
  question: c.question,
  family: c.family,
  frameworks: Array.from(new Set(c.mappings.map((m) => m.framework))),
}));

export async function GET() {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ templates: listTemplates(), catalog: CATALOG });
}

// Upload + parse an Excel/CSV questionnaire, then auto-map each question to a
// control. The assessor confirms before saving (separate POST below).
export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ct = req.headers.get("content-type") || "";

  // --- Save a confirmed template (JSON) ---
  if (ct.includes("application/json")) {
    const parsed = await readJson<{ name?: string; items?: CustomItem[] }>(req);
    if ("error" in parsed) return parsed.error;
    const { name, items } = parsed.data;
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "no items to save" }, { status: 400 });
    const clean: CustomItem[] = items.slice(0, 1000).map((it) => ({
      question: String(it.question || "").slice(0, 1000),
      controlId: it.controlId || null,
      custom: !it.controlId,
      frameworks: Array.isArray(it.frameworks) ? it.frameworks : [],
    })).filter((it) => it.question.trim());
    const t = await saveTemplate(name || "Custom questionnaire", clean, s!.username);
    audit(s!.username, "saved custom questionnaire", `${t.name} · ${clean.length} items`);
    return NextResponse.json({ template: t });
  }

  // --- Parse an uploaded Excel/CSV (multipart) ---
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "invalid form data" }, { status: 400 }); }
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED.has(ext)) return NextResponse.json({ error: "Only Excel (.xlsx/.xls) or CSV files are accepted." }, { status: 415 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) return NextResponse.json({ error: "file empty or too large (max 10MB)" }, { status: 413 });

  let rows: any[][];
  try {
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: "" });
  } catch {
    return NextResponse.json({ error: "Could not parse the spreadsheet." }, { status: 400 });
  }
  if (!rows.length) return NextResponse.json({ error: "The spreadsheet is empty." }, { status: 400 });

  const header = (rows[0] || []).map((c) => String(c ?? "").trim());
  const dataRows = rows.slice(1).filter((r) => r.some((c) => String(c ?? "").trim()));

  // Choose the question column: explicit `col` field (only if provided — note
  // Number(null) is 0, so we must check presence), else a header match, else the
  // column with the longest average text in the first rows.
  const colRaw = form.get("col");
  let qcol = colRaw != null && String(colRaw).trim() !== "" ? Number(colRaw) : -1;
  if (!Number.isInteger(qcol) || qcol < 0 || qcol >= header.length) {
    qcol = header.findIndex((h) => /quest|require|control|descrip|ask|criteria/i.test(h));
    if (qcol < 0) {
      let bestLen = -1;
      for (let i = 0; i < (header.length || (dataRows[0]?.length ?? 0)); i++) {
        const avg = dataRows.slice(0, 15).reduce((sum, r) => sum + String(r[i] ?? "").length, 0);
        if (avg > bestLen) { bestLen = avg; qcol = i; }
      }
      if (qcol < 0) qcol = 0;
    }
  }

  const questions = dataRows.map((r) => String(r[qcol] ?? "").trim()).filter(Boolean);
  if (!questions.length) return NextResponse.json({ error: "No questions found in the chosen column." }, { status: 400 });
  const proposals = mapQuestions(questions);
  const mapped = proposals.filter((p) => !p.custom).length;
  return NextResponse.json({
    columns: header,
    questionColumn: qcol,
    rowsParsed: questions.length,
    mapped,
    custom: proposals.length - mapped,
    proposals,
  });
}

export async function DELETE(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 400 });
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = await deleteTemplate(id);
  return NextResponse.json({ ok });
}
