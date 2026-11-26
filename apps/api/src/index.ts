import "./env.ts";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { ensureSchema } from "./db/migrate.ts";
import { seedIfEmpty } from "./db/seed.ts";
import { describeMailTransport } from "./lib/mail.ts";
import { adminRoutes } from "./routes/admin.ts";
import { publicRoutes } from "./routes/public.ts";

delete process.env.DEBUG;
delete process.env.NODE_DEBUG;

const app = new Hono();
const webOrigins = (process.env.WEB_ORIGIN || "http://localhost:4321")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsOrigin(origin: string | undefined) {
  if (!origin) return webOrigins[0];
  if (webOrigins.includes(origin)) return origin;
  // Allow www ↔ apex when only one side is configured.
  try {
    const url = new URL(origin);
    const host = url.hostname.replace(/^www\./, "");
    const match = webOrigins.find((o) => {
      try {
        const configured = new URL(o);
        return configured.hostname.replace(/^www\./, "") === host && configured.protocol === url.protocol;
      } catch {
        return false;
      }
    });
    return match ? origin : webOrigins[0];
  } catch {
    return webOrigins[0];
  }
}

app.use("*", async (c, next) => {
  let path = c.req.path;
  try {
    path = decodeURIComponent(path);
  } catch {
    return c.text("Not found", 404);
  }
  if (path.split("/").some((part) => part.startsWith("."))) return c.text("Not found", 404);
  await next();
  c.res.headers.delete("X-Powered-By");
  c.res.headers.delete("x-powered-by");
  c.res.headers.delete("Server");
  c.res.headers.delete("server");
});
app.use("*", secureHeaders());
app.use(
  "/public/*",
  cors({
    origin: (origin) => corsOrigin(origin),
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.get("/health", (c) => c.json({ ok: true }));
app.use("/fonts/*", serveStatic({ root: "./public" }));
app.route("/public", publicRoutes);
app.route("/admin", adminRoutes);

const port = Number(process.env.PORT || 8787);

await ensureSchema();
await seedIfEmpty();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`UPSCALE API http://localhost:${info.port}`);
  console.log(`Desk        http://localhost:${info.port}/admin`);
  console.log(`Mail        ${describeMailTransport()}`);
});
