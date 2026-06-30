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
  // Distinguishes "couldn't read the file" from "file was empty/irrelevant" so
  // the assessor isn't misled by a blank result. Optional for legacy cache files.
  // "encrypted" = the file is password-protected and needs a password to read.
  status?: "ok" | "empty" | "failed" | "unsupported" | "encrypted";
  // Set only on the transient (uncached) "encrypted" result so the caller can
  // tell "needs a password" from "the supplied password was wrong".
  passwordError?: "required" | "incorrect";
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

async function fromPdf(buf: Buffer, password?: string): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  // pdf-parse/pdfjs decrypts when given the correct password, and throws a
  // PasswordException (name "PasswordException") otherwise.
  const parser = new PDFParse(password ? { data: new Uint8Array(buf), password } : { data: new Uint8Array(buf) });
  try {
    const r: any = await parser.getText();
    return r?.text ?? (Array.isArray(r?.pages) ? r.pages.map((p: any) => p.text || "").join("\n") : "");
  } finally {
    await parser.destroy?.();
  }
}

// pdfjs PasswordException: code 1 = needs a password, 2 = wrong password.
function passwordErrorFrom(e: any): "required" | "incorrect" | null {
  if (e && (e.name === "PasswordException" || /password/i.test(String(e?.message)))) {
    return e?.code === 2 ? "incorrect" : "required";
  }
  return null;
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

export async function extractFile(filename: string, buf: Buffer, opts?: { ocr?: boolean; password?: string }): Promise<Extraction> {
  const hash = hashBytes(buf);
  // When a password is supplied we must re-attempt decryption, so bypass the
  // (content-keyed) cache — otherwise a prior "encrypted" miss would shadow it.
  if (!opts?.password) {
    const cached = getExtractionByHash(hash);
    if (cached) return cached;
  }

  const ext = (filename.split(".").pop() || "").toLowerCase();
  let text = "";
  let method: Extraction["method"] = "none";
  let status: Extraction["status"] = "ok";
  let passwordError: Extraction["passwordError"];
  const supported = ext === "pdf" || ext === "docx" || TEXT_EXT.has(ext) || (IMG_EXT.has(ext) && opts?.ocr !== false);
  try {
    if (ext === "pdf") { text = await fromPdf(buf, opts?.password); method = "pdf"; }
    else if (ext === "docx") { text = await fromDocx(buf); method = "docx"; }
    else if (TEXT_EXT.has(ext)) { text = buf.toString("utf8"); method = "text"; }
    else if (IMG_EXT.has(ext) && opts?.ocr !== false) { text = await fromImage(buf); method = "ocr"; }
  } catch (e) {
    text = "";
    const pwErr = passwordErrorFrom(e);
    if (pwErr) {
      status = "encrypted"; method = "pdf";
      // If we already supplied a password and it's still locked, it was wrong —
      // regardless of which code pdfjs reports for this encryption scheme.
      passwordError = opts?.password ? "incorrect" : pwErr;
    } else status = "failed"; // extractor unavailable/threw — distinct from "empty"
  }

  // Don't persist an encrypted miss: the same bytes can be read later once the
  // vendor supplies the password. Return it transiently for the caller to prompt.
  if (status === "encrypted") {
    return { hash, type: ext, chars: 0, text: "", method, status, passwordError };
  }

  text = (text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  if (status !== "failed") status = !supported ? "unsupported" : text.length === 0 ? "empty" : "ok";
  const result: Extraction = { hash, type: ext, chars: text.length, text, method, status };

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

// Lightweight retrieval: instead of head-truncating a long document (which drops
// the substantiating control matrix at the back of a SOC 2 / ISO report), pick
// the windows of text most relevant to the RFI keywords and stitch them together
// within a character budget. Deterministic, no embeddings — a pragmatic stand-in
// until pgvector RAG is wired. Falls back to head text when nothing matches.
export function relevantExcerpt(text: string, keywords: string[], budget: number): string {
  if (!text) return "";
  if (text.length <= budget) return text;
  const kws = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  if (!kws.length) return text.slice(0, budget);

  const WIN = 1200; // chars per window
  const STEP = 600; // overlap so a hit near a boundary isn't split
  const lower = text.toLowerCase();
  const windows: { start: number; score: number }[] = [];
  for (let i = 0; i < text.length; i += STEP) {
    const seg = lower.slice(i, i + WIN);
    let score = 0;
    for (const k of kws) if (seg.includes(k)) score++;
    if (score > 0) windows.push({ start: i, score });
  }
  if (!windows.length) return text.slice(0, budget);

  // Highest-scoring windows first; then restore document order and merge.
  windows.sort((a, b) => b.score - a.score || a.start - b.start);
  const chosen: { start: number }[] = [];
  let used = 0;
  for (const w of windows) {
    if (used + WIN > budget) break;
    chosen.push({ start: w.start });
    used += WIN;
  }
  chosen.sort((a, b) => a.start - b.start);
  const parts: string[] = [];
  let lastEnd = -1;
  for (const w of chosen) {
    const start = Math.max(w.start, lastEnd);
    const end = Math.min(w.start + WIN, text.length);
    if (start >= end) continue;
    parts.push(text.slice(start, end));
    lastEnd = end;
  }
  const out = parts.join(" … ");
  return out.length ? out.slice(0, budget) : text.slice(0, budget);
}
