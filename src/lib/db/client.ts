import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

const UNCONFIGURED_DATABASE_URL =
  "postgres://unconfigured:unconfigured@127.0.0.1:1/unconfigured";

const globalDatabase = globalThis as typeof globalThis & {
  exitkeeperSql?: ReturnType<typeof postgres>;
};

const sql =
  globalDatabase.exitkeeperSql ??
  postgres(process.env.DATABASE_URL ?? UNCONFIGURED_DATABASE_URL, {
    connect_timeout: 3,
    max: 1,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalDatabase.exitkeeperSql = sql;
}

export const db = drizzle(sql, { schema });
