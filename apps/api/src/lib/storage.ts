import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import { existsSync } from "node:fs";

const MAX_UPLOAD = 5 * 1024 * 1024;

type Sniffed = { mime: string; ext: ".jpg" | ".png" | ".webp" | ".pdf" };

function sniff(buf: Buffer): Sniffed | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", ext: ".jpg" };
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mime: "image/png", ext: ".png" };
  }
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mime: "image/webp", ext: ".webp" };
  }
  if (buf.length >= 8 && buf.subarray(0, 5).toString("ascii") === "%PDF-" && buf[5]! >= 0x31 && buf[5]! <= 0x39) {
    return { mime: "application/pdf", ext: ".pdf" };
  }
  return null;
}

async function readChecked(file: File, allowPdf: boolean) {
  if (file.size <= 0 || file.size > MAX_UPLOAD) {
    throw new Error("File is larger than 5 MB.");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind || (!allowPdf && kind.ext === ".pdf")) {
    throw new Error(allowPdf ? "File content is not a JPG, PNG, WebP, or PDF." : "Photo must be a JPG, PNG, or WebP.");
  }
  return { buf, ...kind, name: `${randomBytes(16).toString("hex")}${kind.ext}` };
}

export function uploadRoot() {
  return resolve(process.env.UPLOAD_DIR || "./uploads");
}

export function instructorPhotoPublicUrl(photoKey: string | null | undefined) {
  if (!photoKey) return null;
  return `/media/instructors/${basename(photoKey)}`;
}

export type BrandSlot = "logo" | "hero-blue" | "hero-red";

export function brandAssetPublicUrl(fileKey: string | null | undefined) {
  if (!fileKey) return null;
  return `/media/brand/${basename(fileKey)}`;
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
  const saved = await readChecked(file, true);
  const dir = resolve(uploadRoot(), studentId);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, saved.name), saved.buf);
  return { fileKey: `${studentId}/${saved.name}`, mime: saved.mime, size: saved.buf.length };
}

export async function saveInstructorPhoto(file: File, _instructorId: string) {
  const saved = await readChecked(file, false);
  const dir = resolve(uploadRoot(), "instructors");
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, saved.name), saved.buf);
  const fileKey = `instructors/${saved.name}`;
  await copyInstructorPhotoToSite(fileKey);
  return { fileKey, mime: saved.mime, size: saved.buf.length };
}

export async function saveBrandAsset(file: File, _slot: BrandSlot) {
  const saved = await readChecked(file, false);
  const dir = resolve(uploadRoot(), "brand");
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, saved.name), saved.buf);
  const fileKey = `brand/${saved.name}`;
  await copyBrandAssetToSite(fileKey);
  return {
    fileKey,
    publicUrl: brandAssetPublicUrl(fileKey)!,
    mime: saved.mime,
    size: saved.buf.length,
  };
}

function sitePublicInstructorsDir() {
  const root = process.env.SITE_ROOT || resolve(process.cwd(), "../..");
  return resolve(root, "apps/web/public/media/instructors");
}

function sitePublicBrandDir() {
  const root = process.env.SITE_ROOT || resolve(process.cwd(), "../..");
  return resolve(root, "apps/web/public/media/brand");
}

export async function copyInstructorPhotoToSite(fileKey: string) {
  const destDir = sitePublicInstructorsDir();
  await mkdir(destDir, { recursive: true });
  await copyFile(safeJoinUpload(fileKey), resolve(destDir, basename(fileKey)));
}

export async function copyBrandAssetToSite(fileKey: string) {
  const destDir = sitePublicBrandDir();
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

export async function publishBrandAssets() {
  const srcDir = resolve(uploadRoot(), "brand");
  const destDir = sitePublicBrandDir();
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
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  if (resolved !== root && !resolved.startsWith(rootPrefix)) {
    throw new Error("Invalid file key");
  }
  if (basename(fileKey).startsWith(".") || basename(fileKey).includes("..")) {
    throw new Error("Invalid file key");
  }
  if (!extname(resolved)) throw new Error("Invalid file key");
  return resolved;
}

/** Remove a student's evidence upload folder (uploads/{studentId}/). */
export async function removeStudentUploadDir(studentId: string) {
  const id = String(studentId || "").trim();
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) return;
  const dir = resolve(uploadRoot(), id);
  const root = uploadRoot();
  if (!dir.startsWith(root) || dir === root) return;
  if (!existsSync(dir)) return;
  await rm(dir, { recursive: true, force: true });
}
