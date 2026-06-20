import fs from "fs";
import path from "path";

// Append-only audit log (file-backed for the demo; gitignored). PRODUCTION: ship
// to an immutable/WORM store with retention. Best-effort — never throws into callers.
const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "audit.json");
const CAP = 1000;

export interface AuditEntry { ts: string; actor: string; action: string; target?: string; }

export function audit(actor: string, action: string, target?: string) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    let log: AuditEntry[] = [];
    try { log = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
    log.push({ ts: new Date().toISOString(), actor: actor || "anonymous", action, target });
    if (log.length > CAP) log = log.slice(-CAP);
    fs.writeFileSync(FILE, JSON.stringify(log));
  } catch {}
}

export function getAudit(limit = 200): AuditEntry[] {
  try {
    const log: AuditEntry[] = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return log.slice(-limit).reverse();
  } catch {
    return [];
  }
}
