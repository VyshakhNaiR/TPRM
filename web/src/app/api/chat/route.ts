import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { findControl } from "@/lib/scope";
import { getSettings } from "@/lib/settings";
import { readJson } from "@/lib/http";
import { callLLM, resolveLlm } from "@/lib/adjudicator";

export const runtime = "nodejs";

const VERA_SYSTEM = `You are Vera (Virtual Evidence & Risk Assistant), a friendly compliance guidance assistant embedded in a TPRM (Third-Party Risk Management) vendor portal.
Your role is to help vendors understand what evidence they need to satisfy specific security controls.
Be concise, practical, and clear. Focus on:
- What specific documents, screenshots, or reports constitute acceptable evidence
- What key elements must be present in each piece of evidence
- Common pitfalls that lead to Non-Compliant findings
- Examples of strong vs. weak evidence

Format your response in plain text with short bullet points where helpful. Do not exceed 300 words.
Never make compliance determinations — only guide on evidence collection.`;

function staticGuidance(controlQuestion: string, rfi: string): string {
  return `Here is what you typically need for this control:\n\n${rfi}\n\nKey tips:\n• Provide current documents (dated within the last 12 months)\n• Include policy names and version numbers where applicable\n• Screenshots should show system/tool settings, not just descriptions\n• For process controls, a short written procedure or policy excerpt works well\n\nIf you are unsure, attach your best available evidence and explain your approach in the response box.`;
}

export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!s || s.role !== "vendor") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await readJson<{ controlId?: string; message?: string; history?: { role: string; content: string }[] }>(req);
  if ("error" in parsed) return parsed.error;
  const { controlId, message, history = [] } = parsed.data;

  if (!controlId || !message?.trim()) {
    return NextResponse.json({ error: "controlId and message required" }, { status: 400 });
  }
  const control = findControl(controlId);
  if (!control) return NextResponse.json({ error: "unknown control" }, { status: 404 });

  const settings = getSettings();

  // Build context prompt with control details
  const contextPrompt = `CONTROL: ${control.id} — ${control.family}
REQUIREMENT: ${control.question}
EVIDENCE REQUESTED (RFI): ${control.rfi}
APPLICABILITY: ${control.applicability}

VENDOR QUESTION: ${message.trim()}`;

  // Try AI if configured
  if (settings.category !== "static") {
    const category = (settings.category === "hybrid" ? settings.hybrid.escalateCategory : settings.category) as "local" | "integrated";
    try {
      const { kind, cfg } = resolveLlm(category, settings);
      let reply: string;
      if (kind === "claude") {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey: cfg.apiKey || process.env.ANTHROPIC_API_KEY });
        const msgs: any[] = [
          ...history.slice(-6).map((h: any) => ({ role: h.role, content: h.content })),
          { role: "user", content: contextPrompt },
        ];
        const res = await client.messages.create({
          model: cfg.model || "claude-haiku-4-5-20251001",
          max_tokens: 512,
          temperature: 0.3,
          system: VERA_SYSTEM,
          messages: msgs,
        });
        reply = (res.content.find((b) => b.type === "text") as any)?.text ?? "";
      } else {
        reply = await callLLM(kind, cfg, `${VERA_SYSTEM}\n\n${contextPrompt}`);
      }
      if (reply.trim()) return NextResponse.json({ reply: reply.trim() });
    } catch {
      // fall through to static
    }
  }

  // Static fallback
  return NextResponse.json({ reply: staticGuidance(control.question, control.rfi) });
}
