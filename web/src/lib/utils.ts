import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const RELATIONSHIP_LABEL: Record<string, string> = {
  equal: "Fully satisfies",
  subset: "Partially satisfies",
  superset: "Exceeds requirement",
  intersection: "Partial overlap",
};

export const FRAMEWORK_VAR: Record<string, string> = {
  MAS: "mas",
  RBI: "rbi",
  SEBI: "sebi",
};

export function verdictTone(v: string): "ok" | "danger" | "muted" {
  if (v === "Compliant") return "ok";
  if (v === "Non-Compliant") return "danger";
  return "muted";
}

export function riskTone(r: string): "ok" | "warn" | "danger" | "muted" {
  if (r.startsWith("High")) return "danger";
  if (r.startsWith("Medium")) return "warn";
  if (r.startsWith("Low")) return "ok";
  return "muted";
}
