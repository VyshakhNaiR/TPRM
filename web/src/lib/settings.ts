import fs from "fs";
import path from "path";

// Platform processing settings, organised into 4 categories the Root user controls.
// File-backed for the demo (gitignored). PRODUCTION: DB + secrets manager; encrypt tokens.
const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "settings.json");

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

const DEFAULTS: Settings = {
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

export function getSettings(): Settings {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, "utf8"));
    // shallow+nested merge over defaults so new fields always exist
    return {
      ...DEFAULTS, ...s,
      static: { ...DEFAULTS.static, ...s.static },
      local: { ...DEFAULTS.local, ...s.local, ollama: { ...DEFAULTS.local.ollama, ...s.local?.ollama }, claudecode: { ...DEFAULTS.local.claudecode, ...s.local?.claudecode } },
      integrated: {
        ...DEFAULTS.integrated, ...s.integrated,
        claude: { ...DEFAULTS.integrated.claude, ...s.integrated?.claude },
        openai: { ...DEFAULTS.integrated.openai, ...s.integrated?.openai },
        grok: { ...DEFAULTS.integrated.grok, ...s.integrated?.grok },
        gemini: { ...DEFAULTS.integrated.gemini, ...s.integrated?.gemini },
      },
      hybrid: { ...DEFAULTS.hybrid, ...s.hybrid },
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(patch: any): Settings {
  fs.mkdirSync(DIR, { recursive: true });
  const cur = getSettings();
  const next: Settings = { ...cur, updatedAt: new Date().toISOString() };
  if (patch.category) next.category = patch.category;
  if (patch.static) next.static = { ...cur.static, ...patch.static };
  if (patch.hybrid) next.hybrid = { ...cur.hybrid, ...patch.hybrid };
  if (patch.local) {
    next.local = { ...cur.local, provider: patch.local.provider ?? cur.local.provider };
    if (patch.local.ollama) next.local.ollama = { ...cur.local.ollama, ...patch.local.ollama };
    if (patch.local.claudecode) next.local.claudecode = { ...cur.local.claudecode, ...patch.local.claudecode };
  }
  if (patch.integrated) {
    next.integrated = { ...cur.integrated, provider: patch.integrated.provider ?? cur.integrated.provider };
    for (const p of ["claude", "openai", "grok", "gemini"] as const) {
      if (patch.integrated[p]) {
        const incoming = { ...patch.integrated[p] };
        if (incoming.apiKey === "") delete incoming.apiKey; // never wipe a saved key with a blank
        next.integrated[p] = { ...cur.integrated[p], ...incoming };
      }
    }
  }
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return next;
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
