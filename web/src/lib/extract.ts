import fs from "fs";
import path from "path";
import crypto from "crypto";

// Deterministic, no-AI evidence text extraction (PDF / DOCX / text / image-OCR),
// cached by SHA-256 content hash so each file is parsed exactly once. The cache is
// shared by BOTH the static pipeline (keyword/date/standard rules) and the AI path
// (snippet/RAG), so building it once upgrades both engines. All extractors are
// best-effort: any failure yields empty text and never breaks adjudication.
const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const CACHE = path.join(DIR, "extracted");
const MAX_CHARS = 120_000;

export interface Extraction {
  hash: string;
  type: string;
  chars: number;
  text: string;
  method: "pdf" | "docx" | "text" | "ocr" | "none";
}

export function hashBytes(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function cachePath(hash: string) {
  return path.join(CACHE, `${hash}.json`);
}
export function getExtractionByHash(hash?: string): Extraction | null {
  if (!hash) return null;
  try {
    return JSON.parse(fs.readFileSync(cachePath(hash), "utf8"));
  } catch {
    return null;
  }
}

async function fromPdf(buf: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const r: any = await parser.getText();
  await parser.destroy?.();
  return r?.text ?? (Array.isArray(r?.pages) ? r.pages.map((p: any) => p.text || "").join("\n") : "");
}
async function fromDocx(buf: Buffer): Promise<string> {
  const mammoth: any = await import("mammoth");
  const r = await (mammoth.default ?? mammoth).extractRawText({ buffer: buf });
  return r?.value ?? "";
}
async function fromImage(buf: Buffer): Promise<string> {
  // OCR is heavy (downloads language data on first run); strictly best-effort.
  const T: any = await import("tesseract.js");
  const r = await (T.default ?? T).recognize(buf, "eng");
  return r?.data?.text ?? "";
}

const TEXT_EXT = new Set(["txt", "csv", "md", "json", "log", "yaml", "yml", "html", "htm"]);
const IMG_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"]);

export async function extractFile(filename: string, buf: Buffer, opts?: { ocr?: boolean }): Promise<Extraction> {
  const hash = hashBytes(buf);
  const cached = getExtractionByHash(hash);
  if (cached) return cached;

  const ext = (filename.split(".").pop() || "").toLowerCase();
  let text = "";
  let method: Extraction["method"] = "none";
  try {
    if (ext === "pdf") { text = await fromPdf(buf); method = "pdf"; }
    else if (ext === "docx") { text = await fromDocx(buf); method = "docx"; }
    else if (TEXT_EXT.has(ext)) { text = buf.toString("utf8"); method = "text"; }
    else if (IMG_EXT.has(ext) && opts?.ocr !== false) { text = await fromImage(buf); method = "ocr"; }
  } catch {
    text = ""; // extractor unavailable/failed — degrade gracefully
  }
  text = (text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  const result: Extraction = { hash, type: ext, chars: text.length, text, method };

  try {
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(cachePath(hash), JSON.stringify(result));
  } catch { /* cache write best-effort */ }
  return result;
}

// ---- Deterministic content signals used by the static pipeline ----
const STANDARD_PATTERNS: [string, RegExp][] = [
  ["ISO 27001", /iso\/?\s?(\/?iec)?\s?27001/i],
  ["SOC 2", /soc\s?2|soc\s?ii|ssae\s?18|isae\s?3402/i],
  ["PCI DSS", /pci[\s-]?dss/i],
  ["TLS 1.2+", /tls\s?1\.[23]/i],
  ["AES-256", /aes[\s-]?(128|256)/i],
  ["MFA", /\bmfa\b|multi[\s-]?factor/i],
  ["DLP", /\bdlp\b|data\s?loss\s?prevention/i],
  ["VAPT", /vapt|penetration\s?test|pen[\s-]?test/i],
  ["SBOM", /\bsbom\b|software\s?bill\s?of\s?materials/i],
];

export function detectStandards(text: string): string[] {
  return STANDARD_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

// True if the text mentions a recent year (current or last calendar year), used as
// a coarse currency/"within ~12 months" signal. `nowYear` is passed in (no Date in
// shared logic) — the caller supplies the current year.
export function hasRecentDate(text: string, nowYear: number): boolean {
  const years = (text.match(/\b(20\d{2})\b/g) || []).map(Number);
  return years.some((y) => y >= nowYear - 1 && y <= nowYear + 1);
}
