import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.ts";

const raw = process.env.DATABASE_URL || "file:./data/upscale.db";
const relative = raw.startsWith("file:") ? raw.slice(5) : raw;
const abs = resolve(relative);
mkdirSync(dirname(abs), { recursive: true });

export const client = createClient({ url: `file:${abs.replaceAll("\\", "/")}` });
export const db = drizzle(client, { schema });
export type Db = typeof db;
