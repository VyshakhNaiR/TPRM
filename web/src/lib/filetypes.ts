// Evidence upload allow-list + magic-byte sniffing. Only file types the
// extractor understands are accepted, and the declared extension must match the
// actual content signature (defends against disguised payloads and parser
// abuse). Returns null if OK, else a reason string.

export const ALLOWED_EXT = new Set([
  "pdf", "docx", "txt", "csv", "md", "json", "log", "yaml", "yml", "html", "htm",
  "png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff",
]);

// Plain-text family: no reliable magic number, accepted by extension only.
const TEXTY = new Set(["txt", "csv", "md", "json", "log", "yaml", "yml", "html", "htm"]);

function startsWith(buf: Buffer, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  return sig.every((b, i) => buf[offset + i] === b);
}

function magicMatches(ext: string, buf: Buffer): boolean {
  switch (ext) {
    case "pdf":
      return buf.slice(0, 5).toString("ascii") === "%PDF-";
    case "docx": // ZIP container (PK\x03\x04)
      return startsWith(buf, [0x50, 0x4b, 0x03, 0x04]);
    case "png":
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47]);
    case "jpg":
    case "jpeg":
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    case "gif":
      return startsWith(buf, [0x47, 0x49, 0x46, 0x38]);
    case "bmp":
      return startsWith(buf, [0x42, 0x4d]);
    case "webp":
      return startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && buf.slice(8, 12).toString("ascii") === "WEBP";
    case "tiff":
      return startsWith(buf, [0x49, 0x49, 0x2a, 0x00]) || startsWith(buf, [0x4d, 0x4d, 0x00, 0x2a]);
    default:
      return false;
  }
}

export function validateUpload(filename: string, buf: Buffer): string | null {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return `File type ".${ext}" is not allowed. Accepted: PDF, DOCX, images, and text formats.`;
  }
  if (TEXTY.has(ext)) return null; // text formats validated by extraction, not magic bytes
  if (!magicMatches(ext, buf)) {
    return `File content does not match its ".${ext}" extension.`;
  }
  return null;
}
