import { fileURLToPath } from "node:url";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import { loadEnv } from "vite";

// astro.config runs before Vite loads .env, so read the repo root env here.
const envDir = fileURLToPath(new URL("../..", import.meta.url));
const env = loadEnv(process.env.NODE_ENV === "development" ? "development" : "production", envDir, "");
const site = process.env.PUBLIC_SITE_URL || env.PUBLIC_SITE_URL || "https://upscalecohort.com";

export default defineConfig({
  site,
  output: "static",
  compressHTML: true,
  devToolbar: { enabled: false },
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/payment") && !page.includes("/register") && !page.includes("/404"),
    }),
  ],
  build: {
    inlineStylesheets: "auto",
  },
  vite: {
    envDir: "../../",
  },
});
