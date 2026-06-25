import { NextRequest, NextResponse } from "next/server";
import { CONTROLS } from "@/data/seed";
import type { Adjudication } from "@/data/types";
import { findControl } from "@/lib/scope";
import { getSubmission } from "@/lib/store";
import { getSettings } from "@/lib/settings";
import { adjudicate, staticAdjudicate, type EffAnswer } from "@/lib/adjudicator";
import { getExtractionByHash, relevantExcerpt } from "@/lib/extract";
import { keywords } from "@/lib/keywords";
import { currentSession, can } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";

// Curated demo verdict (the real assessor ground-truth from the sample), used for
// demo controls that have no live vendor submission yet.
function demoResult(c: (typeof CONTROLS)[number]): Adjudication {
  const gt = c.demo!;
  const provided = !!gt.vendorEvidence || /attached|screenshot|policy|report|qradar|cortex|\.pdf|\.png/i.test(gt.vendorResponse);
  return {
    verdict: gt.verdict as Adjudication["verdict"],
    risk: gt.risk as Adjudication["risk"],
    confidence: 0.82,
    riskStatement: gt.riskStatement || "—",
    recommendations: gt.recommendations.length ? gt.recommendations : ["Provide approved policy and dated supporting evidence."],
    evidenceChecks: [{ requirement: c.rfi.slice(0, 90), provided, substantiates: gt.verdict === "Compliant", note: gt.verdict === "Compliant" ? "Evidence reviewed and accepted." : "Claim asserted but required evidence not provided / insufficient." }],
    citations: gt.vendorEvidence ? [gt.vendorEvidence] : ["no evidence provided"],
    source: "fallback",
  };
}

export async function POST(req: NextRequest) {
  const session = await currentSession();
  if (!can(session?.role, "adjudicate:run")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = await readJson<{ controlId?: string; vendorId?: string }>(req);
  if ("error" in parsed) return parsed.error;
  const { controlId, vendorId = "apex" } = parsed.data;
  const c = findControl(controlId || "");
  if (!c) return NextResponse.json({ error: "unknown control" }, { status: 404 });

  audit(session!.username, "adjudicated control", `${c.id} · ${vendorId}`);
  const submission = getSubmission(vendorId);

  // Assessor override is authoritative — the human is the final authority, so it
  // takes precedence over any AI/static result (and skips re-running the engine).
  const ov = submission.overrides?.[c.id];
  if (ov) {
    return NextResponse.json({
      verdict: ov.verdict as Adjudication["verdict"],
      risk: ov.risk as Adjudication["risk"],
      confidence: 1,
      riskStatement: ov.rationale,
      recommendations: [],
      evidenceChecks: [{ requirement: c.rfi.slice(0, 90), provided: true, substantiates: ov.verdict === "Compliant", note: `Assessor override by ${ov.by}.` }],
      citations: [`assessor override · ${ov.by}`],
      source: "override",
    } satisfies Adjudication);
  }

  const stored = submission.answers[c.id];
  const hasRealSubmission = !!stored && (!!stored.response || (stored.evidence?.length ?? 0) > 0 || stored.applicable === false);

  // Live vendor submission -> run the Root-configured processing backend.
  if (hasRealSubmission) {
    // Pull the windows most relevant to this control's RFI rather than just the
    // head of each document (so the substantiating section deep in a long report
    // isn't truncated away). Lightweight retrieval; see lib/extract.relevantExcerpt.
    const kw = keywords(c.rfi);
    const fullText = (stored.evidence ?? [])
      .map((e: { hash?: string }) => getExtractionByHash(e.hash)?.text || "")
      .filter(Boolean)
      .join("\n\n");
    const evidenceText = relevantExcerpt(fullText, kw, 12000);
    const eff: EffAnswer = {
      response: stored.response,
      evidence: (stored.evidence ?? []).map((e: { filename: string }) => e.filename).join(", "),
      evidenceText,
      evidenceCount: stored.evidence?.length ?? 0,
      applicable: stored.applicable,
      coverage: stored.coverage,
      certType: stored.certType,
      certMappingNote: stored.certMappingNote,
      certAvailable: !!stored.certType && (submission.certs ?? []).some((cert) => cert.certType === stored.certType),
    };
    return NextResponse.json(await adjudicate(c, eff, getSettings()));
  }
  // No submission: curated demo verdict if available, else "awaiting".
  if (c.demo) return NextResponse.json(demoResult(c));
  return NextResponse.json(staticAdjudicate(c, null));
}
