import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database access");
  }
  return databaseUrl;
}

const globalDatabase = globalThis as typeof globalThis & {
  exitkeeperSql?: ReturnType<typeof postgres>;
};

const sql =
  globalDatabase.exitkeeperSql ??
  postgres(getDatabaseUrl(), {
    max: process.env.NODE_ENV === "production" ? 10 : 1,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalDatabase.exitkeeperSql = sql;
}

export const db = drizzle(sql, { schema });
