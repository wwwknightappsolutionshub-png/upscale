import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { nid } from "./ids.ts";

const allowed = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"],
]);

const imageOnly = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

function imageExtFor(file: File) {
  return imageOnly.get(file.type) || { ".jpg": ".jpg", ".jpeg": ".jpg", ".png": ".png", ".webp": ".webp" }[extname(file.name).toLowerCase()];
}

export function uploadRoot() {
  return resolve(process.env.UPLOAD_DIR || "./uploads");
}

export function instructorPhotoPublicUrl(photoKey: string | null | undefined) {
  if (!photoKey) return null;
  return `/media/instructors/${basename(photoKey)}`;
}

export function mimeFromUploadKey(fileKey: string) {
  const ext = extname(fileKey).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".pdf") return "application/pdf";
  return "application/octet-stream";
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

export async function saveInstructorPhoto(file: File, instructorId: string) {
  const ext = imageExtFor(file);
  if (!ext) {
    throw new Error("Photo must be JPG, PNG, or WebP.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Photo is larger than 5 MB.");
  }
  const dir = resolve(uploadRoot(), "instructors");
  await mkdir(dir, { recursive: true });
  const name = `${instructorId}-${nid("ph")}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(resolve(dir, name), buf);
  const fileKey = `instructors/${name}`;
  await copyInstructorPhotoToSite(fileKey);
  return { fileKey, mime: file.type || mimeFromUploadKey(fileKey), size: file.size };
}

function sitePublicInstructorsDir() {
  const root = process.env.SITE_ROOT || resolve(process.cwd(), "../..");
  return resolve(root, "apps/web/public/media/instructors");
}

export async function copyInstructorPhotoToSite(fileKey: string) {
  const destDir = sitePublicInstructorsDir();
  await mkdir(destDir, { recursive: true });
  await copyFile(safeJoinUpload(fileKey), resolve(destDir, basename(fileKey)));
}

export async function publishInstructorPhotos() {
  const srcDir = resolve(uploadRoot(), "instructors");
  const destDir = sitePublicInstructorsDir();
  await mkdir(destDir, { recursive: true });
  if (!existsSync(srcDir)) return;
  for (const file of await readdir(srcDir)) {
    if (!file || file.startsWith(".")) continue;
    await copyFile(resolve(srcDir, file), resolve(destDir, file));
  }
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
