// Shared RFI keyword extraction — used by both the static adjudicator and the
// evidence viewer so the two stay in lockstep (previously duplicated).

export const STOP = new Set([
  "the", "and", "for", "with", "your", "that", "this", "have", "from", "provide",
  "evidence", "policy", "approved", "most", "recent", "copy", "level", "appropriate",
  "management", "their", "which", "into", "used", "data", "such", "where", "been",
  "will", "shall", "must", "please", "share", "list", "sample", "details", "document",
  "documented",
]);

export function keywords(rfi: string): string[] {
  return Array.from(
    new Set(
      rfi
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 4 && !STOP.has(w))
    )
  ).slice(0, 8);
}
