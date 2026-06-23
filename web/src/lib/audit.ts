import fs from "fs";
import path from "path";
import { withLock } from "./lock";
import { AUDIT_CAP } from "./config";

// Append-only audit log (file-backed for the demo; gitignored). Writes are
// serialized (lib/lock) so concurrent events don't clobber each other, and a
// corrupt file is preserved rather than silently overwritten. Best-effort —
// never throws into callers.
// PRODUCTION: forward events to an immutable/WORM store / SIEM with retention
// (MAS TRM / RBI IT require multi-year retention; the local cap is a demo guard).
const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "audit.json");

export interface AuditEntry { ts: string; actor: string; action: string; target?: string; }

export function audit(actor: string, action: string, target?: string) {
  // Fire-and-forget; serialized so entries are never lost to a write race.
  void withLock("audit", () => {
    try {
      fs.mkdirSync(DIR, { recursive: true });
      let log: AuditEntry[] = [];
      let raw: string | null = null;
      try { raw = fs.readFileSync(FILE, "utf8"); } catch { raw = null; }
      if (raw != null) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) log = parsed;
          else throw new Error("not an array");
        } catch {
          // Don't destroy a corrupt log — set it aside for forensics, then start fresh.
          try { fs.renameSync(FILE, `${FILE}.corrupt.${Date.now()}`); } catch {}
        }
      }
      log.push({ ts: new Date().toISOString(), actor: actor || "anonymous", action, target });
      if (log.length > AUDIT_CAP) log = log.slice(-AUDIT_CAP);
      fs.writeFileSync(FILE, JSON.stringify(log));
    } catch {
      /* best-effort */
    }
  });
}

export function getAudit(limit = 200): AuditEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const log: AuditEntry[] = Array.isArray(parsed) ? parsed : [];
    return log.slice(-limit).reverse();
  } catch {
    return [];
  }
}
