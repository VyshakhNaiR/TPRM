import { NextRequest, NextResponse } from "next/server";
import { CONTROLS } from "@/data/seed";
import type { Adjudication } from "@/data/types";
import { getSubmission } from "@/lib/store";
import { getSettings } from "@/lib/settings";
import { adjudicate, staticAdjudicate, type EffAnswer } from "@/lib/adjudicator";
import { getExtractionByHash } from "@/lib/extract";
import { currentSession, can } from "@/lib/auth";
import { audit } from "@/lib/audit";

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
  const { controlId, vendorId = "apex" } = await req.json();
  const c = CONTROLS.find((x) => x.id === controlId);
  if (!c) return NextResponse.json({ error: "unknown control" }, { status: 404 });

  audit(session!.username, "adjudicated control", `${controlId} · ${vendorId}`);
  const stored = getSubmission(vendorId).answers[controlId];
  const hasRealSubmission = !!stored && (!!stored.response || (stored.evidence?.length ?? 0) > 0 || stored.applicable === false);

  // Live vendor submission -> run the Root-configured processing backend.
  if (hasRealSubmission) {
    const evidenceText = (stored.evidence ?? [])
      .map((e) => getExtractionByHash(e.hash)?.text || "")
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 12000);
    const eff: EffAnswer = {
      response: stored.response,
      evidence: (stored.evidence ?? []).map((e) => e.filename).join(", "),
      evidenceText,
      evidenceCount: stored.evidence?.length ?? 0,
      applicable: stored.applicable,
    };
    return NextResponse.json(await adjudicate(c, eff, getSettings()));
  }
  // No submission: curated demo verdict if available, else "awaiting".
  if (c.demo) return NextResponse.json(demoResult(c));
  return NextResponse.json(staticAdjudicate(c, null));
}
