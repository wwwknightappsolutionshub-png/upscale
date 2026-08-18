import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || "http://localhost:4321",
  output: "static",
  compressHTML: true,
  devToolbar: { enabled: false },
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/payment") && !page.includes("/register"),
    }),
  ],
  build: {
    inlineStylesheets: "auto",
  },
  vite: {
    envDir: "../../",
  },
});
