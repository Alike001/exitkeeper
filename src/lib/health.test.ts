import { afterEach, describe, expect, it, vi } from "vitest";
import { type ConnectionCheck, summarizeHealth } from "@/lib/health";

vi.mock("server-only", () => ({}));

function check(state: ConnectionCheck["state"]): ConnectionCheck {
  return { id: "database", state, detail: "test", latencyMs: null };
}

describe("summarizeHealth", () => {
  it("reports unconfigured when no integration is configured", () => {
    expect(summarizeHealth([check("unconfigured")])).toBe("unconfigured");
  });

  it("reports ready only when every integration is healthy", () => {
    expect(summarizeHealth([check("healthy"), check("healthy")])).toBe("ready");
  });

  it("reports degraded for unhealthy or partially configured integrations", () => {
    expect(summarizeHealth([check("healthy"), check("unhealthy")])).toBe(
      "degraded",
    );
    expect(summarizeHealth([check("healthy"), check("unconfigured")])).toBe(
      "degraded",
    );
  });
});

describe("getConnectionHealth", () => {
  const originalEnvironment = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.resetModules();
  });

  it("does not call external services when configuration is absent", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.ETHEREUM_RPC_URL;
    delete process.env.WAYFINDER_SERVICE_URL;
    delete process.env.KEEPERHUB_BASE_URL;
    delete process.env.KEEPERHUB_API_KEY;
    const fetcher = vi.fn<typeof fetch>();
    const databaseProbe = vi.fn<() => Promise<void>>();
    const { getConnectionHealth } = await import("@/lib/server/health");

    const report = await getConnectionHealth({
      fetch: fetcher,
      databaseProbe,
      now: () => new Date("2026-09-13T00:00:00.000Z"),
    });

    expect(report.status).toBe("unconfigured");
    expect(report.checkedAt).toBe("2026-09-13T00:00:00.000Z");
    expect(report.checks).toHaveLength(4);
    expect(fetcher).not.toHaveBeenCalled();
    expect(databaseProbe).not.toHaveBeenCalled();
  });

  it("verifies every configured boundary without exposing credentials", async () => {
    process.env.DATABASE_URL = "postgres://secret";
    process.env.ETHEREUM_RPC_URL = "https://rpc.example/secret";
    process.env.WAYFINDER_SERVICE_URL = "https://wayfinder.example";
    process.env.KEEPERHUB_BASE_URL = "https://keeperhub.example/api";
    process.env.KEEPERHUB_API_KEY = "hidden-api-key";
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = input.toString();
      if (url.includes("rpc.example")) {
        const request = JSON.parse(String(init?.body));
        expect(request).toHaveLength(2);
        return Response.json([
          { jsonrpc: "2.0", id: 1, result: "0x88bb0" },
          { jsonrpc: "2.0", id: 2, result: "0x6000" },
        ]);
      }
      return Response.json({ status: "ok" });
    });
    const { getConnectionHealth } = await import("@/lib/server/health");

    const report = await getConnectionHealth({
      fetch: fetcher,
      databaseProbe: vi.fn().mockResolvedValue(undefined),
    });

    expect(report.status).toBe("ready");
    expect(report.checks.every((item) => item.state === "healthy")).toBe(true);
    expect(JSON.stringify(report)).not.toContain("secret");
    expect(JSON.stringify(report)).not.toContain("hidden-api-key");
    expect(fetcher).toHaveBeenCalledWith(
      "https://keeperhub.example/api/health",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://keeperhub.example/api/keys",
      expect.objectContaining({
        headers: { Authorization: "Bearer hidden-api-key" },
      }),
    );
  });

  it("returns bounded errors instead of leaking provider details", async () => {
    process.env.DATABASE_URL = "postgres://user:password@database.example/db";
    delete process.env.ETHEREUM_RPC_URL;
    delete process.env.WAYFINDER_SERVICE_URL;
    delete process.env.KEEPERHUB_BASE_URL;
    delete process.env.KEEPERHUB_API_KEY;
    const { getConnectionHealth } = await import("@/lib/server/health");

    const report = await getConnectionHealth({
      databaseProbe: vi
        .fn<() => Promise<void>>()
        .mockRejectedValue(new Error("password at database.example")),
    });

    expect(report.status).toBe("degraded");
    expect(report.checks[0]?.detail).toBe("PostgreSQL query failed");
    expect(JSON.stringify(report)).not.toContain("password");
    expect(JSON.stringify(report)).not.toContain("database.example");
  });
});
