import fs from "fs";
import path from "path";
import crypto from "crypto";

// Local-filesystem evidence storage. PRODUCTION: swap for S3-compatible storage
// (env-selected), keeping saveUpload()'s signature. Region-pin the bucket for
// data-residency (India / Singapore) and encrypt at rest with managed keys.
const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const UP = path.join(DIR, "uploads");

export async function saveUpload(
  vendorId: string,
  filename: string,
  bytes: Buffer
): Promise<{ id: string; filename: string; size: number }> {
  const dir = path.join(UP, vendorId.replace(/[^\w.-]/g, "_"));
  fs.mkdirSync(dir, { recursive: true });
  const id = crypto.randomUUID();
  const safe = `${id}__${filename.replace(/[^\w.\-]/g, "_")}`;
  fs.writeFileSync(path.join(dir, safe), bytes);
  return { id, filename, size: bytes.length };
}
