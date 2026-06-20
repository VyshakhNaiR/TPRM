import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CONTROLS } from "@/data/seed";
import type { Adjudication } from "@/data/types";
import { getSubmission } from "@/lib/store";

export const runtime = "nodejs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const SYSTEM = `You are a senior Third-Party Risk Management (TPRM) InfoSec assessor for a bank.
You adjudicate a vendor's response and evidence against a control's RFI (Request For Information).

Core rule: the FINDING lives in the GAP between what the vendor SAYS and what the evidence SHOWS.
- Decompose the RFI into atomic evidence items.
- For each item decide: was it PROVIDED, and does it SUBSTANTIATE the vendor's claim?
- Be conservative: absence of evidence = not substantiated. Never mark Compliant without cited evidence for each required item.
- Respect applicability: if out of scope for the engagement, verdict is "Not Applicable".
Return ONLY valid JSON (no prose) matching the requested schema.`;

interface EffAnswer {
  response: string;
  evidence: string;
  applicable: boolean;
}

function buildPrompt(c: (typeof CONTROLS)[number], a: EffAnswer) {
  return `CONTROL ${c.id} — Family: ${c.family}
QUESTION: ${c.question}
RFI (evidence requested): ${c.rfi}
ENGAGEMENT APPLICABILITY HINT: ${c.applicability}
VENDOR MARKED APPLICABLE: ${a.applicable ? "yes" : "no"}
VENDOR RESPONSE: ${a.response || "(blank)"}
VENDOR EVIDENCE PROVIDED: ${a.evidence || "(none attached)"}

Return JSON:
{
 "verdict": "Compliant" | "Non-Compliant" | "Not Applicable",
 "risk": "High Risk" | "Medium Risk" | "Low Risk" | "None",
 "confidence": 0.0-1.0,
 "riskStatement": "one concise sentence of residual risk",
 "recommendations": ["actionable, evidence-demanding bullet", "..."],
 "evidenceChecks": [{"requirement":"...", "provided":bool, "substantiates":bool, "note":"..."}],
 "citations": ["file or artifact referenced, or 'no evidence provided'"]
}`;
}

// Offline / no-input fallback.
function fallback(c: (typeof CONTROLS)[number], a: EffAnswer | null, fromDemo: boolean): Adjudication {
  // No response submitted at all.
  if (!a || (!a.response && !a.evidence && a.applicable)) {
    return {
      verdict: "Non-Compliant",
      risk: (c.risk as Adjudication["risk"]) || "Medium Risk",
      confidence: 0.4,
      riskStatement: "No vendor response or evidence submitted for this control yet.",
      recommendations: [`Request the vendor to answer and provide: ${c.rfi}`],
      evidenceChecks: [{ requirement: c.rfi.slice(0, 90), provided: false, substantiates: false, note: "Awaiting vendor response — nothing submitted to assess." }],
      citations: ["no response provided"],
      source: "fallback",
    };
  }
  if (!a.applicable) {
    return {
      verdict: "Not Applicable", risk: "None", confidence: 0.7,
      riskStatement: "Vendor marked this control out of scope for the engagement.",
      recommendations: [], evidenceChecks: [{ requirement: c.rfi.slice(0, 90), provided: false, substantiates: false, note: "Marked Not Applicable by vendor." }],
      citations: ["n/a"], source: "fallback",
    };
  }
  // Demo controls carry the real assessor ground-truth.
  if (fromDemo && c.demo) {
    const gt = c.demo;
    const provided = !!gt.vendorEvidence || /attached|screenshot|policy|report|qradar|cortex|\.pdf|\.png/i.test(gt.vendorResponse);
    return {
      verdict: (gt.verdict as Adjudication["verdict"]) || "Non-Compliant",
      risk: (gt.risk as Adjudication["risk"]) || "None",
      confidence: 0.82,
      riskStatement: gt.riskStatement || "—",
      recommendations: gt.recommendations.length ? gt.recommendations : ["Provide approved policy and dated supporting evidence."],
      evidenceChecks: [{ requirement: c.rfi.slice(0, 90), provided, substantiates: gt.verdict === "Compliant", note: gt.verdict === "Compliant" ? "Evidence reviewed and accepted." : "Claim asserted but required evidence not provided / insufficient." }],
      citations: gt.vendorEvidence ? [gt.vendorEvidence] : ["no evidence provided"],
      source: "fallback",
    };
  }
  // Real vendor answer but no AI key — heuristic placeholder (cannot truly substantiate offline).
  const hasEv = !!a.evidence;
  return {
    verdict: "Non-Compliant", risk: "Medium Risk", confidence: 0.5,
    riskStatement: hasEv ? "Response and evidence submitted; enable the AI service for a full claim-vs-evidence adjudication." : "Vendor asserted a response but provided no supporting evidence.",
    recommendations: hasEv ? ["Enable AI adjudication to verify the evidence substantiates the claim."] : [`Provide the requested evidence: ${c.rfi}`],
    evidenceChecks: [{ requirement: c.rfi.slice(0, 90), provided: hasEv, substantiates: false, note: hasEv ? "Evidence attached — pending AI substantiation check." : "No evidence attached." }],
    citations: a.evidence ? [a.evidence] : ["no evidence provided"],
    source: "fallback",
  };
}

export async function POST(req: NextRequest) {
  const { controlId, vendorId = "apex" } = await req.json();
  const c = CONTROLS.find((x) => x.id === controlId);
  if (!c) return NextResponse.json({ error: "unknown control" }, { status: 404 });

  // Prefer a submitted vendor answer; otherwise the demo answer.
  const stored = getSubmission(vendorId).answers[controlId];
  let eff: EffAnswer | null = null;
  let fromDemo = false;
  if (stored && (stored.response || (stored.evidence?.length ?? 0) > 0 || stored.applicable === false)) {
    eff = { response: stored.response, evidence: (stored.evidence ?? []).map((e) => e.filename).join(", "), applicable: stored.applicable };
  } else if (c.demo) {
    eff = { response: c.demo.vendorResponse, evidence: c.demo.vendorEvidence, applicable: true };
    fromDemo = true;
  }

  // Cost guard: never spend a token without a submitted response or an API key.
  if (!eff || !eff.response || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(fallback(c, eff, fromDemo));
  }

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(c, eff) }],
    });
    const text = msg.content.find((b) => b.type === "text")?.text ?? "{}";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return NextResponse.json({ ...json, source: "ai" } as Adjudication);
  } catch {
    return NextResponse.json(fallback(c, eff, fromDemo));
  }
}
