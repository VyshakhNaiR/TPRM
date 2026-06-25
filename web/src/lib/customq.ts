import fs from "fs";
import path from "path";
import crypto from "crypto";
import { CONTROLS } from "@/data/seed";
import { STOP } from "./keywords";
import { withLock } from "./lock";

// Custom questionnaire ingest + auto-map (Phase D). The assessor uploads an
// Excel/CSV questionnaire; we parse the question column, auto-map each question to
// an existing control (so it inherits the MAS/RBI/SEBI crosswalk), and let the
// assessor confirm. Unmapped questions become assessable "custom controls".
// Mapping is deterministic (token overlap) so it works with no API key; an LLM
// pass can refine later. File-backed store, same pattern as the rest.
const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "customq.json");

function tokens(s: string): string[] {
  return Array.from(
    new Set(
      (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w))
    )
  );
}

// Pre-tokenize the control library once.
const CONTROL_TOKENS = CONTROLS.map((c) => ({
  id: c.id,
  family: c.family,
  question: c.question,
  frameworks: Array.from(new Set(c.mappings.map((m) => m.framework))),
  toks: new Set(tokens(`${c.question} ${c.rfi} ${c.family}`)),
}));

export interface MappingProposal {
  row: number;
  question: string;
  proposedControlId: string | null;
  controlLabel: string | null;
  family: string | null;
  frameworks: string[];
  confidence: number; // 0..1
  custom: boolean; // true when no good match -> assessable custom control
}

// Auto-map one question to the best-matching control by token overlap.
export function mapQuestion(question: string, row: number): MappingProposal {
  const qt = tokens(question);
  let best: { id: string; family: string; question: string; frameworks: string[]; score: number } | null = null;
  for (const c of CONTROL_TOKENS) {
    let hits = 0;
    for (const t of qt) if (c.toks.has(t)) hits++;
    const score = qt.length ? hits / qt.length : 0;
    if (!best || score > best.score) best = { id: c.id, family: c.family, question: c.question, frameworks: c.frameworks, score };
  }
  // Require a meaningful overlap to claim a mapping. Below this, fall to a custom
  // control — the assessor can map it up (better than a spurious low-confidence map).
  const matched = !!best && best.score >= 0.3 && qt.length >= 2;
  return {
    row,
    question: question.trim(),
    proposedControlId: matched ? best!.id : null,
    controlLabel: matched ? best!.question : null,
    family: matched ? best!.family : null,
    frameworks: matched ? best!.frameworks : [],
    confidence: matched ? Math.min(0.95, Math.round(best!.score * 100) / 100) : 0,
    custom: !matched,
  };
}

export function mapQuestions(questions: string[]): MappingProposal[] {
  return questions.filter((q) => q && q.trim()).map((q, i) => mapQuestion(q, i + 1));
}

// ---- Stored templates ----
export interface CustomItem {
  question: string;
  controlId: string | null; // mapped existing control, or null for custom
  custom: boolean;
  frameworks: string[];
}
export interface CustomTemplate {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  items: CustomItem[];
}

function readAll(): Record<string, CustomTemplate> {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
export function listTemplates(): CustomTemplate[] {
  return Object.values(readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function saveTemplate(name: string, items: CustomItem[], createdBy: string): Promise<CustomTemplate> {
  return withLock("customq", () => {
    fs.mkdirSync(DIR, { recursive: true });
    const all = readAll();
    const t: CustomTemplate = { id: crypto.randomUUID(), name: name.trim() || "Custom questionnaire", createdBy, createdAt: new Date().toISOString(), items };
    all[t.id] = t;
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
    return t;
  });
}
export function deleteTemplate(id: string): Promise<boolean> {
  return withLock("customq", () => {
    const all = readAll();
    if (!all[id]) return false;
    delete all[id];
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
    return true;
  });
}
