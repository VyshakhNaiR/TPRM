import fs from "fs";
import path from "path";
import { encryptSecret, decryptSecret } from "./cryptobox";
import { ALLOW_PRIVATE_LLM_URL } from "./config";

// Platform processing settings, organised into 4 categories the Root user controls.
// File-backed for the demo (gitignored). Provider API keys are encrypted at rest
// (AES-256-GCM, see cryptobox). PRODUCTION: move to DB + secrets manager.
const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "settings.json");

const VALID_CATEGORIES = new Set(["static", "local", "integrated", "hybrid"]);
const VALID_LOCAL = new Set(["ollama", "claudecode"]);
const VALID_INTEGRATED = new Set(["claude", "openai", "grok", "gemini"]);

// SSRF guard: a cloud-provider base URL must be public HTTP(S) in production.
// (Ollama is a local provider — intentionally exempt, it lives on a private/
// loopback address by design.)
function assertSafeBaseUrl(raw: string): void {
  if (!raw) return;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("invalid_base_url");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("invalid_base_url");
  if (ALLOW_PRIVATE_LLM_URL) return;
  const h = u.hostname.toLowerCase();
  const isPrivate =
    h === "localhost" || h === "::1" || h.endsWith(".local") ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  if (isPrivate) throw new Error("private_base_url");
}

export type Category = "static" | "local" | "integrated" | "hybrid";
export type LocalProvider = "ollama" | "claudecode";
export type IntegratedProvider = "claude" | "openai" | "grok" | "gemini";

export interface Settings {
  category: Category;
  static: { coverageThreshold: number; requireRecentDate: boolean; ocrEnabled: boolean };
  local: {
    provider: LocalProvider;
    ollama: { baseUrl: string; model: string };
    claudecode: { model: string };
  };
  integrated: {
    provider: IntegratedProvider;
    claude: { apiKey: string; model: string };
    openai: { apiKey: string; model: string; baseUrl: string };
    grok: { apiKey: string; model: string; baseUrl: string };
    gemini: { apiKey: string; model: string };
  };
  hybrid: { escalateCategory: "local" | "integrated"; threshold: number };
  updatedAt: string;
}

// UI metadata
export const CATEGORIES: { id: Category; label: string; desc: string; cost: string }[] = [
  { id: "static", label: "Static Pipeline", desc: "Rules + deterministic content extraction. No AI.", cost: "$0 · fastest" },
  { id: "local", label: "Local AI Model", desc: "AI runs on your own infrastructure. No API bill; evidence never leaves your environment.", cost: "$0 · self-hosted" },
  { id: "integrated", label: "AI Integrated", desc: "External cloud LLM APIs for highest reasoning quality.", cost: "metered" },
  { id: "hybrid", label: "Hybrid (Static → AI)", desc: "Static engine first; escalate only low-confidence cases to AI.", cost: "~$0 + small AI tail" },
];
export const LOCAL_PROVIDERS: { id: LocalProvider; label: string; fields: ("baseUrl" | "model")[] }[] = [
  { id: "ollama", label: "Ollama", fields: ["baseUrl", "model"] },
  { id: "claudecode", label: "Claude Code (Personal · subscription, $0)", fields: ["model"] },
];
export const INTEGRATED_PROVIDERS: { id: IntegratedProvider; label: string; fields: ("apiKey" | "model" | "baseUrl")[] }[] = [
  { id: "claude", label: "Claude API", fields: ["apiKey", "model"] },
  { id: "openai", label: "OpenAI GPT", fields: ["apiKey", "model", "baseUrl"] },
  { id: "grok", label: "xAI Grok", fields: ["apiKey", "model", "baseUrl"] },
  { id: "gemini", label: "Google Gemini", fields: ["apiKey", "model"] },
];

// Fresh defaults each call so `updatedAt` is current and nested objects are not
// shared/mutated across callers.
function defaults(): Settings {
  return {
    category: "static",
    static: { coverageThreshold: 0.3, requireRecentDate: false, ocrEnabled: true },
    local: {
      provider: "ollama",
      ollama: { baseUrl: "http://localhost:11434", model: "llama3.1" },
      claudecode: { model: "sonnet" },
    },
    integrated: {
      provider: "claude",
      claude: { apiKey: process.env.ANTHROPIC_API_KEY || "", model: "claude-sonnet-4-6" },
      openai: { apiKey: "", model: "gpt-5.4-mini", baseUrl: "https://api.openai.com/v1" },
      grok: { apiKey: "", model: "grok-4", baseUrl: "https://api.x.ai/v1" },
      gemini: { apiKey: "", model: "gemini-2.5-flash" },
    },
    hybrid: { escalateCategory: "integrated", threshold: 0.75 },
    updatedAt: new Date().toISOString(),
  };
}

export function getSettings(): Settings {
  const D = defaults();
  let s: any = {};
  try {
    s = JSON.parse(fs.readFileSync(FILE, "utf8")) || {};
  } catch {
    return D; // no/corrupt file -> safe defaults (env-provided Claude key included)
  }
  // Defensive null-guards so a hand-edited file with null sections can't blow up
  // the spread or silently wipe keys.
  const si = s.integrated && typeof s.integrated === "object" ? s.integrated : {};
  const sl = s.local && typeof s.local === "object" ? s.local : {};
  const merged: Settings = {
    ...D, ...s,
    static: { ...D.static, ...(s.static || {}) },
    local: { ...D.local, ...sl, ollama: { ...D.local.ollama, ...(sl.ollama || {}) }, claudecode: { ...D.local.claudecode, ...(sl.claudecode || {}) } },
    integrated: {
      ...D.integrated, ...si,
      claude: { ...D.integrated.claude, ...(si.claude || {}) },
      openai: { ...D.integrated.openai, ...(si.openai || {}) },
      grok: { ...D.integrated.grok, ...(si.grok || {}) },
      gemini: { ...D.integrated.gemini, ...(si.gemini || {}) },
    },
    hybrid: { ...D.hybrid, ...(s.hybrid || {}) },
  };
  // Decrypt API keys for use by the adjudicator (they're stored encrypted).
  for (const p of ["claude", "openai", "grok", "gemini"] as const) {
    merged.integrated[p].apiKey = decryptSecret(merged.integrated[p].apiKey);
  }
  return merged;
}

export function saveSettings(patch: any): Settings {
  fs.mkdirSync(DIR, { recursive: true });
  // cur has DECRYPTED keys (from getSettings); re-encrypt before writing.
  const cur = getSettings();
  const next: Settings = { ...cur, updatedAt: new Date().toISOString() };

  if (patch.category) {
    if (!VALID_CATEGORIES.has(patch.category)) throw new Error("invalid_category");
    next.category = patch.category;
  }
  if (patch.static) {
    const st = { ...cur.static, ...patch.static };
    st.coverageThreshold = Math.min(1, Math.max(0, Number(st.coverageThreshold) || 0));
    st.requireRecentDate = !!st.requireRecentDate;
    st.ocrEnabled = !!st.ocrEnabled;
    next.static = st;
  }
  if (patch.hybrid) {
    const hy = { ...cur.hybrid, ...patch.hybrid };
    if (hy.escalateCategory !== "local" && hy.escalateCategory !== "integrated") hy.escalateCategory = cur.hybrid.escalateCategory;
    hy.threshold = Math.min(1, Math.max(0, Number(hy.threshold) || 0));
    next.hybrid = hy;
  }
  if (patch.local) {
    const provider = patch.local.provider ?? cur.local.provider;
    if (!VALID_LOCAL.has(provider)) throw new Error("invalid_provider");
    next.local = { ...cur.local, provider };
    if (patch.local.ollama) {
      const o = { ...cur.local.ollama, ...patch.local.ollama };
      if (o.baseUrl) assertSafeBaseUrl(o.baseUrl);
      next.local.ollama = o;
    }
    if (patch.local.claudecode) next.local.claudecode = { ...cur.local.claudecode, ...patch.local.claudecode };
  }
  if (patch.integrated) {
    const provider = patch.integrated.provider ?? cur.integrated.provider;
    if (!VALID_INTEGRATED.has(provider)) throw new Error("invalid_provider");
    next.integrated = { ...cur.integrated, provider };
    for (const p of ["claude", "openai", "grok", "gemini"] as const) {
      if (patch.integrated[p]) {
        const incoming = { ...patch.integrated[p] };
        if (incoming.apiKey === "" || incoming.apiKey == null) delete incoming.apiKey; // never wipe a saved key with a blank
        if (incoming.baseUrl) assertSafeBaseUrl(incoming.baseUrl); // SSRF guard
        next.integrated[p] = { ...cur.integrated[p], ...incoming };
      }
    }
  }

  // Encrypt API keys at rest. (cur keys are plaintext from getSettings; any new
  // key in the patch is plaintext too — encrypt all four on the way out.)
  const toWrite: Settings = JSON.parse(JSON.stringify(next));
  for (const p of ["claude", "openai", "grok", "gemini"] as const) {
    toWrite.integrated[p].apiKey = encryptSecret(next.integrated[p].apiKey);
  }
  fs.writeFileSync(FILE, JSON.stringify(toWrite, null, 2));
  return next; // return decrypted view to the caller (it masks before sending)
}

// Never expose raw tokens to the client.
export function maskSettings(s: Settings) {
  const mask = (k?: string) => ({ keySet: !!k, keyHint: k ? `••••${k.slice(-4)}` : undefined });
  return {
    category: s.category,
    static: s.static,
    local: s.local,
    hybrid: s.hybrid,
    integrated: {
      provider: s.integrated.provider,
      claude: { model: s.integrated.claude.model, ...mask(s.integrated.claude.apiKey) },
      openai: { model: s.integrated.openai.model, baseUrl: s.integrated.openai.baseUrl, ...mask(s.integrated.openai.apiKey) },
      grok: { model: s.integrated.grok.model, baseUrl: s.integrated.grok.baseUrl, ...mask(s.integrated.grok.apiKey) },
      gemini: { model: s.integrated.gemini.model, ...mask(s.integrated.gemini.apiKey) },
    },
    updatedAt: s.updatedAt,
  };
}
