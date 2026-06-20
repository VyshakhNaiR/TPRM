import { NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { CONTROLS } from "@/data/seed";
import { staticAdjudicate, type EffAnswer } from "@/lib/adjudicator";

export const runtime = "nodejs";

// Measure the Static Pipeline against the sample's human assessor verdicts (the
// demo controls carry the real ground-truth). Gives a REAL accuracy number rather
// than a claim. Small sample (the curated demo controls) — labelled as such.
export async function GET() {
  const s = await currentSession();
  if (!can(s?.role, "settings:read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows: { id: string; human: string; predicted: string; agree: boolean }[] = [];
  let falseCompliant = 0;
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
    const agree = predicted === human;
    if (predicted === "Compliant" && human !== "Compliant") falseCompliant++;
    rows.push({ id: c.id, human, predicted, agree });
  }
  const total = rows.length;
  const agree = rows.filter((r) => r.agree).length;
  return NextResponse.json({
    total,
    agree,
    agreementPct: total ? Math.round((agree / total) * 100) : 0,
    falseCompliant,
    rows,
  });
}
