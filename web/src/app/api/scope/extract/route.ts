import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { currentSession, can } from "@/lib/auth";
import { extractFile } from "@/lib/extract";
import { sanitizeScope } from "@/lib/scope-sanitize";
import { getSettings } from "@/lib/settings";
import { callLLM, resolveLlm } from "@/lib/adjudicator";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;
const SHEET_EXT = new Set(["xlsx", "xls", "xlsm", "csv"]);
const DOC_EXT = new Set(["pdf", "docx", "txt", "md"]);
const MAX_TEXT = 24_000; // keep the prompt bounded

// Read a spreadsheet into plain CSV-ish text (all sheets) for the model/heuristic.
function sheetToText(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.SheetNames.map((n) => `# ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join("\n\n").slice(0, MAX_TEXT);
}

const SCHEMA_PROMPT = `You extract vendor-onboarding details from a document (an assessment-scope sheet
or a contract / MSA) and return STRICT JSON only. Return a single JSON object with two keys:
"profile" and "scope". Include ONLY fields you can confidently infer; omit the rest. Never invent values.

"profile": {
  company (string — vendor legal/trading name), website (string), country (string),
  address (string), spocPhone (string), spocEmail (string — vendor contact email),
  serviceDescription (string — what the vendor provides),
  engagementType ("due_diligence" for a new vendor | "existing" for a re-assessment of a current vendor),
  directContract (boolean — true if the bank contracts the vendor directly)
}
"scope": {
  name (string), type ("Onboarding"|"Annual"|"Re-assessment"|"Ad-hoc"),
  periodStart ("YYYY-MM-DD"), periodEnd ("YYYY-MM-DD"),
  services [{name, description}], applications [{name, url, description}],
  subcontractors [{name, service}],
  hostingModel ("on_prem"|"cloud"|"hybrid"), cloudProvider (string),
  regions [string], dataTypes [string],
  dataClassification ("public"|"internal"|"confidential"|"regulated"),
  accessLevel ("none"|"read"|"privileged"),
  businessCriticality ("low"|"medium"|"high"),
  dataVolume ("low"|"medium"|"high"),
  connectivity ("none"|"api"|"vpn"|"dedicated"),
  crossBorderTransfer (boolean),
  frameworks (subset of ["RBI","MAS","SEBI","None"]),
  outOfScope (string)
}
Output ONLY the JSON object, no prose, no markdown fences.`;

function parseJsonLoose(s: string): any {
  if (!s) return null;
  let t = s.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return null; }
}

// Best-effort, no-AI fallback: map "key: value" / "key,value" lines whose key
// matches a known label onto scope fields. Coarse but useful when AI is off.
function heuristic(text: string): any {
  const out: any = {};
  const p: any = {};
  const want: Record<string, (v: string) => void> = {
    "company": (v) => (p.company = v),
    "company name": (v) => (p.company = v),
    "vendor": (v) => (p.company = v),
    "vendor name": (v) => (p.company = v),
    "website": (v) => (p.website = v),
    "country": (v) => (p.country = v),
    "address": (v) => (p.address = v),
    "phone": (v) => (p.spocPhone = v),
    "spoc phone": (v) => (p.spocPhone = v),
    "contact phone": (v) => (p.spocPhone = v),
    "email": (v) => (p.spocEmail = v),
    "spoc email": (v) => (p.spocEmail = v),
    "contact email": (v) => (p.spocEmail = v),
    "service description": (v) => (p.serviceDescription = v),
    "services provided": (v) => (p.serviceDescription = v),
    "engagement type": (v) => (p.engagementType = /exist|re-?assess/i.test(v) ? "existing" : "due_diligence"),
    "assessment name": (v) => (out.name = v),
    "assessment type": (v) => (out.type = v),
    "hosting": (v) => (out.hostingModel = /hybrid/i.test(v) ? "hybrid" : /cloud/i.test(v) ? "cloud" : /prem/i.test(v) ? "on_prem" : undefined),
    "cloud provider": (v) => (out.cloudProvider = v),
    "data classification": (v) => (out.dataClassification = /regulat|pii/i.test(v) ? "regulated" : /confiden/i.test(v) ? "confidential" : /internal/i.test(v) ? "internal" : /public/i.test(v) ? "public" : undefined),
    "access level": (v) => (out.accessLevel = /privileg/i.test(v) ? "privileged" : /read/i.test(v) ? "read" : /none|no access/i.test(v) ? "none" : undefined),
    "access": (v) => (out.accessLevel = /privileg/i.test(v) ? "privileged" : /read/i.test(v) ? "read" : /none/i.test(v) ? "none" : undefined),
    "business criticality": (v) => (out.businessCriticality = /high/i.test(v) ? "high" : /med/i.test(v) ? "medium" : /low/i.test(v) ? "low" : undefined),
    "criticality": (v) => (out.businessCriticality = /high/i.test(v) ? "high" : /med/i.test(v) ? "medium" : /low/i.test(v) ? "low" : undefined),
    "data volume": (v) => (out.dataVolume = /high/i.test(v) ? "high" : /med/i.test(v) ? "medium" : /low/i.test(v) ? "low" : undefined),
    "connectivity": (v) => (out.connectivity = /dedicat/i.test(v) ? "dedicated" : /vpn/i.test(v) ? "vpn" : /api/i.test(v) ? "api" : /none/i.test(v) ? "none" : undefined),
    "cross-border": (v) => (out.crossBorderTransfer = /yes|true|y\b/i.test(v)),
    "cross border": (v) => (out.crossBorderTransfer = /yes|true|y\b/i.test(v)),
    "regions": (v) => (out.regions = v.split(/[;,/]/).map((x) => x.trim()).filter(Boolean)),
    "data residency": (v) => (out.regions = v.split(/[;,/]/).map((x) => x.trim()).filter(Boolean)),
    "data types": (v) => (out.dataTypes = v.split(/[;,/]/).map((x) => x.trim()).filter(Boolean)),
    "frameworks": (v) => (out.frameworks = ["RBI", "MAS", "SEBI"].filter((f) => new RegExp(f, "i").test(v))),
    "regulators": (v) => (out.frameworks = ["RBI", "MAS", "SEBI"].filter((f) => new RegExp(f, "i").test(v))),
    "out of scope": (v) => (out.outOfScope = v),
  };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*"?([A-Za-z][A-Za-z /\-]+?)"?\s*[:,]\s*"?(.+?)"?\s*$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (want[key] && val) want[key](val);
  }
  return { scope: out, profile: p };
}

// Coerce the AI/heuristic "profile" object into the onboarding fields we accept.
function sanitizeProfile(raw: any): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const s = (v: unknown, n = 300) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const out: Record<string, unknown> = {};
  for (const [k, n] of [["company", 200], ["website", 300], ["country", 100], ["address", 300], ["spocPhone", 60], ["spocEmail", 200], ["serviceDescription", 1000]] as const) {
    const v = s(raw[k], n); if (v) out[k] = v;
  }
  if (raw.engagementType === "existing" || raw.engagementType === "due_diligence") out.engagementType = raw.engagementType;
  if (typeof raw.directContract === "boolean") out.directContract = raw.directContract;
  return out;
}

async function aiExtract(text: string): Promise<any | null> {
  const settings = getSettings();
  if (settings.category === "static") return null;
  const category = (settings.category === "hybrid" ? settings.hybrid.escalateCategory : settings.category) as "local" | "integrated";
  try {
    const { kind, cfg } = resolveLlm(category, settings);
    const prompt = `${SCHEMA_PROMPT}\n\nDOCUMENT:\n${text}`;
    let reply: string;
    if (kind === "claude") {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: cfg.apiKey || process.env.ANTHROPIC_API_KEY });
      const res = await client.messages.create({
        model: cfg.model || "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        temperature: 0,
        system: SCHEMA_PROMPT,
        messages: [{ role: "user", content: `DOCUMENT:\n${text}` }],
      });
      reply = (res.content.find((b) => b.type === "text") as any)?.text ?? "";
    } else {
      reply = await callLLM(kind, cfg, prompt);
    }
    return parseJsonLoose(reply);
  } catch {
    return null;
  }
}

// POST — assessor uploads a scope document (Excel/PDF/Word); we extract its text,
// have AI structure it into a scope, and return it for review (not persisted).
export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "verdict:override")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "invalid form data" }, { status: 400 }); }
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: "empty file" }, { status: 400 });
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "file too large (max 25MB)" }, { status: 413 });

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  let text = "";
  if (SHEET_EXT.has(ext)) {
    try { text = sheetToText(bytes); } catch { return NextResponse.json({ error: "Could not read that spreadsheet." }, { status: 422 }); }
  } else if (DOC_EXT.has(ext)) {
    const ex = await extractFile(file.name, bytes, {});
    if (ex.status === "encrypted") return NextResponse.json({ error: "That document is password-protected." }, { status: 422 });
    text = ex.text;
  } else {
    return NextResponse.json({ error: "Unsupported file. Upload an Excel, CSV, PDF, or Word document." }, { status: 415 });
  }
  if (!text.trim()) return NextResponse.json({ error: "No readable text found in that file." }, { status: 422 });

  const ai = await aiExtract(text);
  const raw = ai ?? heuristic(text);
  // Accept both the nested {scope, profile} shape and a flat scope (back-compat).
  const scope = sanitizeScope(raw?.scope ?? raw);
  const profile = sanitizeProfile(raw?.profile);
  return NextResponse.json({ scope, profile, method: ai ? "ai" : "heuristic" });
}
