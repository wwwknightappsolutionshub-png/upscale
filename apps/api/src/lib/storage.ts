import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { nid } from "./ids.ts";

const allowed = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"],
]);

export function uploadRoot() {
  return resolve(process.env.UPLOAD_DIR || "./uploads");
}

export async function saveEvidenceFile(file: File, studentId: string) {
  const mime = file.type || "application/octet-stream";
  const ext = allowed.get(mime);
  if (!ext) {
    throw new Error("File type not allowed. Use JPG, PNG, WebP, or PDF.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("File is larger than 5 MB.");
  }
  const id = nid("evf");
  const dir = resolve(uploadRoot(), studentId);
  await mkdir(dir, { recursive: true });
  const name = `${id}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(resolve(dir, name), buf);
  return { fileKey: `${studentId}/${name}`, mime, size: file.size };
}

export function safeJoinUpload(fileKey: string) {
  const root = uploadRoot();
  const resolved = resolve(root, fileKey);
  if (!resolved.startsWith(root) || basename(fileKey).includes("..")) {
    throw new Error("Invalid file key");
  }
  if (!extname(resolved)) throw new Error("Invalid file key");
  return resolved;
}
