import { NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { CONTROLS } from "@/data/seed";
import { staticAdjudicate, type EffAnswer } from "@/lib/adjudicator";

export const runtime = "nodejs";

// Measure the Static Pipeline against the sample's human assessor verdicts (the
// demo controls carry the real ground-truth). Reports a confusion matrix plus
// precision/recall for the SAFETY-CRITICAL class (Compliant) rather than a single
// accuracy number — false-Compliant is the dangerous error in TPRM.
//
// METHODOLOGY / LIMITS (returned to the UI so the number is never overstated):
//   - Small labelled set: only the curated demo controls carry ground truth.
//   - Structural signal only: demo evidence files aren't text-extracted here, so
//     this measures the engine WITHOUT the content-reading path (a lower bound).
//   - Single rater: ground-truth is the sample's human verdicts.
export async function GET() {
  const s = await currentSession();
  if (!can(s?.role, "settings:read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows: { id: string; human: string; predicted: string; agree: boolean }[] = [];
  // Confusion matrix for the Compliant class.
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const c of CONTROLS) {
    if (!c.demo) continue;
    const eff: EffAnswer = {
      response: c.demo.vendorResponse,
      evidence: c.demo.vendorEvidence,
      evidenceText: "", // demo files aren't extracted; structural signal only
      evidenceCount: c.demo.vendorEvidence ? 1 : 0,
      applicable: true,
    };
    const predicted = staticAdjudicate(c, eff).verdict;
    const human = c.demo.verdict;
    const predC = predicted === "Compliant";
    const humanC = human === "Compliant";
    if (predC && humanC) tp++;
    else if (predC && !humanC) fp++; // FALSE COMPLIANT — the dangerous class
    else if (!predC && !humanC) tn++;
    else fn++;
    rows.push({ id: c.id, human, predicted, agree: predicted === human });
  }

  const total = rows.length;
  const agree = rows.filter((r) => r.agree).length;
  const precision = tp + fp ? tp / (tp + fp) : null; // of those we called Compliant, how many really were
  const recall = tp + fn ? tp / (tp + fn) : null; // of the truly Compliant, how many we caught
  const f1 = precision != null && recall != null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
  const pct = (n: number | null) => (n == null ? null : Math.round(n * 100));

  return NextResponse.json({
    total,
    agree,
    agreementPct: total ? Math.round((agree / total) * 100) : 0,
    falseCompliant: fp,
    confusion: { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn },
    precisionPct: pct(precision),
    recallPct: pct(recall),
    f1Pct: pct(f1),
    methodology: {
      sample: "curated demo controls (single-rater ground truth)",
      note: "Structural signal only — excludes the content-extraction path, so this is a conservative lower bound. Not a production-readiness claim.",
    },
    rows,
  });
}
