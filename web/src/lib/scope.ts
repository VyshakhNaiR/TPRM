import { CONTROLS } from "@/data/seed";
import { BASELINE_CONTROLS } from "@/data/baseline";
import type { Control } from "@/data/types";
import { getVendorProfile } from "./users";

// Per-vendor questionnaire scope. When a vendor has NO applicable regulator
// (regulators = None), they get the Basic Security Hygiene baseline; otherwise the
// standard regulatory questionnaire. Two fixed, well-formed sets — every surface
// (vendor fill, console, completion gate, rollup) resolves the right one here.
export type QMode = "standard" | "hygiene";

export function modeForRegulators(regs?: string[]): QMode {
  if (!regs || regs.length === 0) return "standard"; // unset (e.g. demo vendors) → standard
  return regs.filter((r) => r && r !== "None").length === 0 ? "hygiene" : "standard";
}

export function controlsForMode(mode: QMode): Control[] {
  return mode === "hygiene" ? BASELINE_CONTROLS : CONTROLS;
}

export function modeForVendorId(vendorId: string): QMode {
  return modeForRegulators(getVendorProfile(vendorId)?.regulators);
}

export function controlsForVendorId(vendorId: string): Control[] {
  return controlsForMode(modeForVendorId(vendorId));
}

// Look up a control by id across BOTH sets (routes accept either).
export function findControl(id: string): Control | undefined {
  return CONTROLS.find((c) => c.id === id) || BASELINE_CONTROLS.find((c) => c.id === id);
}
