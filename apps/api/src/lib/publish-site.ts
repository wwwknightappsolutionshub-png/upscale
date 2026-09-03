import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { publishInstructorPhotos } from "./storage.ts";

export type PublishResult = { ok: boolean; message: string };

function siteRoot() {
  return process.env.SITE_ROOT || resolve(process.cwd(), "../..");
}

/** Rebuild the Astro public site so desk edits appear on the live frontend. */
export function publishSite(): Promise<PublishResult> {
  if (process.env.PUBLISH_ON_SAVE === "0") {
    return Promise.resolve({
      ok: true,
      message: "Saved in the desk. Public rebuild skipped (PUBLISH_ON_SAVE=0).",
    });
  }

  const root = siteRoot();
  const pkg = resolve(root, "package.json");
  if (!existsSync(pkg)) {
    return Promise.resolve({
      ok: false,
      message: `Cannot find site root at ${root}. Set SITE_ROOT in .env.`,
    });
  }

  const port = process.env.PORT || "8787";
  const env = {
    ...process.env,
    // Prefer local API during build so catalog is always fresh and auth is reliable.
    PUBLIC_API_URL: `http://127.0.0.1:${port}`,
    PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || process.env.WEB_ORIGIN || "http://localhost:4321",
    BUILD_TOKEN: process.env.BUILD_TOKEN || "dev-build-token",
  };

  return publishInstructorPhotos()
    .catch(() => undefined)
    .then(
      () =>
        new Promise<PublishResult>((done) => {
          const child = spawn("npm", ["run", "build"], {
            cwd: root,
            env,
            shell: true,
            windowsHide: true,
          });
          let log = "";
          child.stdout?.on("data", (chunk) => {
            log += String(chunk);
          });
          child.stderr?.on("data", (chunk) => {
            log += String(chunk);
          });
          child.on("error", (err) => {
            done({ ok: false, message: `Publish failed to start: ${err.message}` });
          });
          child.on("close", (code) => {
            if (code === 0) {
              done({ ok: true, message: "Saved and published to the public site." });
              return;
            }
            const tail = log.trim().split(/\r?\n/).slice(-8).join(" ");
            done({
              ok: false,
              message: `Saved in the desk, but the public rebuild failed.${tail ? ` ${tail}` : ""}`,
            });
          });
        }),
    );
}
