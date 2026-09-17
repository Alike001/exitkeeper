import { defineConfig } from "drizzle-kit";

const localDatabaseUrl =
  "postgres://exitkeeper:exitkeeper@localhost:54329/exitkeeper";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      localDatabaseUrl,
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
  strict: true,
  verbose: true,
});
