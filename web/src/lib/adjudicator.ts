import Anthropic from "@anthropic-ai/sdk";
import { execFile } from "child_process";
import type { Control, Adjudication } from "@/data/types";
import type { Settings } from "./settings";
import { detectStandards, hasRecentDate } from "./extract";

interface StaticCfg { coverageThreshold?: number; requireRecentDate?: boolean }

export interface EffAnswer {
  response: string;
  evidence: string; // comma-joined filenames
  evidenceText: string; // extracted text content of attached files
  evidenceCount: number;
  applicable: boolean;
}

const SYSTEM = `You are a senior Third-Party Risk Management (TPRM) InfoSec assessor for a bank.
You adjudicate a vendor's response and evidence against a control's RFI (Request For Information).
Core rule: the FINDING lives in the GAP between what the vendor SAYS and what the evidence SHOWS.
Decompose the RFI into atomic evidence items; for each decide if it was PROVIDED and whether it SUBSTANTIATES the claim.
Be conservative: absence of evidence = not substantiated. Never mark Compliant without cited evidence.
If out of scope, verdict is "Not Applicable". Return ONLY valid JSON.`;

function buildPrompt(c: Control, a: EffAnswer) {
  return `CONTROL ${c.id} — Family: ${c.family}
QUESTION: ${c.question}
RFI (evidence requested): ${c.rfi}
APPLICABILITY HINT: ${c.applicability}
VENDOR MARKED APPLICABLE: ${a.applicable ? "yes" : "no"}
VENDOR RESPONSE: ${a.response || "(blank)"}
VENDOR EVIDENCE FILES: ${a.evidence || "(none attached)"}
EXTRACTED EVIDENCE CONTENT (from the attached files, may be truncated):
"""
${(a.evidenceText || "(no readable content extracted)").slice(0, 6000)}
"""

Return JSON:
{"verdict":"Compliant"|"Non-Compliant"|"Not Applicable","risk":"High Risk"|"Medium Risk"|"Low Risk"|"None","confidence":0.0-1.0,"riskStatement":"...","recommendations":["..."],"evidenceChecks":[{"requirement":"...","provided":bool,"substantiates":bool,"note":"..."}],"citations":["..."]}`;
}

function parseAdjudication(text: string, source: Adjudication["source"]): Adjudication {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no JSON in model output");
  const json = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1));
  // Validate + normalize. A missing verdict (e.g. empty/error model response) throws
  // so the caller falls back to the static engine instead of returning a broken result.
  if (!json || !json.verdict) throw new Error("model output missing verdict");
  return {
    verdict: json.verdict,
    risk: json.risk ?? "None",
    confidence: typeof json.confidence === "number" ? json.confidence : 0.7,
    riskStatement: json.riskStatement ?? "",
    recommendations: Array.isArray(json.recommendations) ? json.recommendations : [],
    evidenceChecks: Array.isArray(json.evidenceChecks) ? json.evidenceChecks : [],
    citations: Array.isArray(json.citations) ? json.citations : [],
    source,
  };
}

// ---------- Static pipeline (no AI) — the $0 default ----------
const STOP = new Set(["the", "and", "for", "with", "your", "that", "this", "have", "from", "provide", "evidence", "policy", "approved", "most", "recent", "copy", "level", "appropriate", "management", "their", "which", "into", "used", "data", "such", "where", "been", "will", "shall", "must", "please", "share", "list", "sample", "details", "document", "documented"]);

function keywords(rfi: string): string[] {
  return Array.from(new Set(rfi.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 4 && !STOP.has(w)))).slice(0, 8);
}

export function staticAdjudicate(c: Control, a: EffAnswer | null, cfg?: StaticCfg): Adjudication {
  const rfi90 = c.rfi.slice(0, 90);
  if (!a || (!a.response && a.evidenceCount === 0 && a.applicable)) {
    return { verdict: "Non-Compliant", risk: (c.risk as any) || "Medium Risk", confidence: 0.55, riskStatement: "No vendor response or evidence submitted for this control.", recommendations: [`Provide: ${c.rfi}`], evidenceChecks: [{ requirement: rfi90, provided: false, substantiates: false, note: "Awaiting vendor response." }], citations: ["no response provided"], source: "static" };
  }
  if (!a.applicable) {
    return { verdict: "Not Applicable", risk: "None", confidence: 0.9, riskStatement: "Marked out of scope for the engagement.", recommendations: [], evidenceChecks: [{ requirement: rfi90, provided: false, substantiates: false, note: "Marked Not Applicable by vendor." }], citations: ["n/a"], source: "static" };
  }
  // Search across the statement, filenames AND the extracted file CONTENT.
  const evText = a.evidenceText || "";
  const contentRead = evText.length > 0;
  const hay = `${a.response} ${a.evidence} ${evText}`.toLowerCase();
  const artifactRefd = /policy|screenshot|report|certificate|\biso\b|soc\s?2|attached|\.pdf|\.png|\.docx|qradar|cortex|defender|bitlocker|evidence/.test(hay);
  const hasEvidence = a.evidenceCount > 0 || artifactRefd;
  const kw = keywords(c.rfi);
  const hits = kw.filter((k) => hay.includes(k)).length;
  const coverage = kw.length ? hits / kw.length : 0;

  // Deterministic content signals from the extracted evidence text.
  const nowYear = new Date().getFullYear();
  const standards = detectStandards(`${a.response} ${evText}`);
  const current = contentRead ? hasRecentDate(evText, nowYear) : false;

  // Verdict: an evidence file must be attached AND its content (or the response)
  // must topically cover the request (>= Root-configured threshold); optionally a
  // recent date must be present. Reading content makes this far stronger than filenames.
  const threshold = cfg?.coverageThreshold ?? 0.3;
  const needDate = cfg?.requireRecentDate ?? false;
  const compliant = a.evidenceCount > 0 && coverage >= threshold && (!needDate || current);
  const verdict = compliant ? "Compliant" : "Non-Compliant";
  // Confidence rises when we actually read the file and found standards + a recent date.
  let confidence = compliant ? 0.66 + Math.min(0.18, coverage * 0.18) : a.evidenceCount === 0 ? 0.84 : 0.58;
  if (compliant && contentRead) confidence += 0.06;
  if (compliant && standards.length) confidence += 0.04;
  confidence = Math.min(0.95, Math.round(confidence * 100) / 100);

  const detail =
    a.evidenceCount === 0
      ? "Claim asserted but no evidence file attached."
      : !contentRead
      ? `Evidence file attached but no readable text could be extracted; filename/topical match ${Math.round(coverage * 100)}%.`
      : `Read ${evText.length} chars of evidence — topical match ${Math.round(coverage * 100)}%${standards.length ? `; standards found: ${standards.join(", ")}` : ""}${current ? "; recent date present" : "; no recent date found"}.`;

  return {
    verdict,
    risk: compliant ? "None" : ((c.risk as any) || "Medium Risk"),
    confidence,
    riskStatement: compliant
      ? `Evidence content reviewed and topically aligned to the request${standards.length ? ` (${standards.join(", ")})` : ""}.`
      : a.evidenceCount === 0
      ? "Response asserted but the required supporting evidence was not attached."
      : "Attached evidence content does not clearly cover the requested items.",
    recommendations: compliant
      ? current ? [] : ["Confirm the evidence is dated within the last 12 months."]
      : [`Provide the requested artifacts: ${c.rfi}`, "Ensure evidence is current (dated within 12 months) and addresses each item in the RFI."],
    evidenceChecks: [{ requirement: rfi90, provided: hasEvidence, substantiates: compliant, note: detail }],
    citations: a.evidence ? a.evidence.split(", ") : ["no evidence provided"],
    source: "static",
  };
}

// ---------- AI backends ----------
async function callClaude(cfg: { apiKey?: string; model?: string }, prompt: string) {
  const client = new Anthropic({ apiKey: cfg.apiKey || process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({ model: cfg.model || "claude-sonnet-4-6", max_tokens: 1024, system: SYSTEM, messages: [{ role: "user", content: prompt }] });
  return msg.content.find((b) => b.type === "text")?.text ?? "{}";
}
async function callOpenAICompatible(cfg: { apiKey?: string; model?: string; baseUrl?: string }, prompt: string) {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }], temperature: 0 }),
  });
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? "{}";
}
async function callGemini(cfg: { apiKey?: string; model?: string }, prompt: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ parts: [{ text: prompt }] }] }),
  });
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}
async function callOllama(cfg: { baseUrl?: string; model?: string }, prompt: string) {
  const res = await fetch(`${cfg.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.model, stream: false, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }] }),
  });
  const j = await res.json();
  return j.message?.content ?? "{}";
}
function callClaudeCode(cfg: { model?: string }, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("claude", ["-p", `${SYSTEM}\n\n${prompt}`, "--model", cfg.model || "sonnet"], { timeout: 60000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout || "{}");
    });
  });
}

// ---------- Dispatch by category ----------
async function callLLM(kind: string, cfg: any, prompt: string): Promise<string> {
  switch (kind) {
    case "claude": return callClaude(cfg, prompt);
    case "openai":
    case "grok": return callOpenAICompatible(cfg, prompt);
    case "gemini": return callGemini(cfg, prompt);
    case "ollama": return callOllama(cfg, prompt);
    case "claudecode": return callClaudeCode(cfg, prompt);
    default: throw new Error(`unknown engine ${kind}`);
  }
}

// Resolve the selected provider + its config for a Local or AI-Integrated category.
function resolveLlm(category: "local" | "integrated", s: Settings): { kind: string; cfg: any } {
  if (category === "local") {
    const p = s.local.provider;
    return { kind: p, cfg: p === "ollama" ? s.local.ollama : s.local.claudecode };
  }
  const p = s.integrated.provider;
  return { kind: p, cfg: (s.integrated as any)[p] };
}

export async function adjudicate(c: Control, a: EffAnswer | null, s: Settings): Promise<Adjudication> {
  const sc = s.static;
  // Static category, or nothing to judge -> free rules engine (cost guard).
  if (s.category === "static" || !a || !a.response) {
    return staticAdjudicate(c, a, sc);
  }

  // Hybrid: static first; escalate ONLY low-confidence cases that have content.
  if (s.category === "hybrid") {
    const stat = staticAdjudicate(c, a, sc);
    if (stat.confidence >= s.hybrid.threshold || a.evidenceCount === 0) {
      stat.riskStatement = `Static engine confident (${stat.confidence} ≥ ${s.hybrid.threshold}); no AI escalation. ${stat.riskStatement}`;
      return stat;
    }
    const { kind, cfg } = resolveLlm(s.hybrid.escalateCategory, s);
    try {
      const adj = parseAdjudication(await callLLM(kind, cfg, buildPrompt(c, a)), "ai");
      adj.riskStatement = `Static ${stat.confidence} (ambiguous) → escalated to ${kind}. ${adj.riskStatement || ""}`;
      return adj;
    } catch {
      return stat; // escalation failed -> keep the static verdict, never break
    }
  }

  // Local or AI-Integrated.
  const { kind, cfg } = resolveLlm(s.category as "local" | "integrated", s);
  try {
    return parseAdjudication(await callLLM(kind, cfg, buildPrompt(c, a)), "ai");
  } catch {
    return staticAdjudicate(c, a, sc);
  }
}
