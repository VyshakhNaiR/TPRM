import { CONTROLS } from "@/data/seed";
import type { PriorFinding } from "./store";

// Best-effort extraction of prior-audit verdicts from a Last-TPRM-Audit-Report's
// text. Deterministic (no AI): for each control, if its ID or a distinctive title
// phrase appears in the report, capture the nearby verdict signal. Everything is
// marked `confirmed: false` — the assessor validates before it drives the focus
// list (Phase E). Returns only controls actually found in the report.
const NC = /(non[\s-]?compliant|not\s+compliant|gap|finding|fail|deficien|open\s+issue|partial)/i;
const COMPLIANT = /(compliant|satisfactor|adequate|met\b|pass)/i;

function titleKey(c: (typeof CONTROLS)[number]): string {
  // A distinctive lowercase phrase from the control question/family for matching.
  return (c.question || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 5).slice(0, 3).join(" ");
}

export function extractPriorFindings(text: string): Record<string, PriorFinding> {
  const out: Record<string, PriorFinding> = {};
  if (!text) return out;
  const lower = text.toLowerCase();
  for (const c of CONTROLS) {
    const idHit = lower.indexOf(c.id.toLowerCase());
    const key = titleKey(c);
    const keyHit = key.length > 8 ? lower.indexOf(key) : -1;
    const at = idHit >= 0 ? idHit : keyHit;
    if (at < 0) continue;
    const ctx = text.slice(Math.max(0, at - 40), at + 160);
    let verdict = "Non-Compliant";
    if (NC.test(ctx)) verdict = "Non-Compliant";
    else if (COMPLIANT.test(ctx)) verdict = "Compliant";
    else continue; // mentioned but no clear verdict signal — skip
    out[c.id] = { verdict, note: ctx.replace(/\s+/g, " ").trim().slice(0, 160), confirmed: false };
  }
  return out;
}
