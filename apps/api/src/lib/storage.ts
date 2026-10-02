import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
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

export async function saveBrandAsset(file: File, slot: BrandSlot) {
  const ext = imageExtFor(file);
  if (!ext) {
    throw new Error("Brand image must be JPG, PNG, or WebP.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Brand image is larger than 5 MB.");
  }
  const dir = resolve(uploadRoot(), "brand");
  await mkdir(dir, { recursive: true });
  const name = `${slot}-${nid("br")}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(resolve(dir, name), buf);
  const fileKey = `brand/${name}`;
  await copyBrandAssetToSite(fileKey);
  return {
    fileKey,
    publicUrl: brandAssetPublicUrl(fileKey)!,
    mime: file.type || mimeFromUploadKey(fileKey),
    size: file.size,
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
  if (!resolved.startsWith(root) || basename(fileKey).includes("..")) {
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
