import "server-only";

import { sql } from "drizzle-orm";
import type { ConnectionCheck, ConnectionId, HealthReport } from "@/lib/health";
import { summarizeHealth } from "@/lib/health";

const LIDO_WITHDRAWAL_QUEUE = "0xfe56573178f1bcdf53F01A6E9977670dcBBD9186";
const EXPECTED_CHAIN_ID = "0x88bb0";
const CHECK_TIMEOUT_MS = 4_000;

type HealthDependencies = {
  fetch: typeof fetch;
  databaseProbe: () => Promise<void>;
  now: () => Date;
};

const defaultDependencies: HealthDependencies = {
  fetch,
  databaseProbe: async () => {
    const { db } = await import("@/lib/db/client");
    await db.execute(sql`select 1`);
  },
  now: () => new Date(),
};

function unconfigured(id: ConnectionId, detail: string): ConnectionCheck {
  return { id, state: "unconfigured", detail, latencyMs: null };
}

async function timedCheck(
  id: ConnectionId,
  failureDetail: string,
  check: () => Promise<string>,
): Promise<ConnectionCheck> {
  const startedAt = performance.now();

  try {
    const detail = await check();
    return {
      id,
      state: "healthy",
      detail,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch {
    return {
      id,
      state: "unhealthy",
      detail: failureDetail,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}

async function fetchJson(
  fetcher: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetcher(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function checkEthereum(fetcher: typeof fetch): Promise<string> {
  const rpcUrl = process.env.ETHEREUM_RPC_URL;
  if (!rpcUrl) {
    throw new Error("ETHEREUM_RPC_URL is not configured");
  }

  const body = [
    { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "eth_getCode",
      params: [LIDO_WITHDRAWAL_QUEUE, "latest"],
    },
  ];
  const result = await fetchJson(fetcher, rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!Array.isArray(result)) {
    throw new Error("Ethereum RPC returned an invalid batch response");
  }

  const chain = result.find((entry) => entry?.id === 1);
  const code = result.find((entry) => entry?.id === 2);
  if (chain?.result !== EXPECTED_CHAIN_ID) {
    throw new Error("Ethereum RPC is not connected to Hoodi");
  }
  if (typeof code?.result !== "string" || code.result === "0x") {
    throw new Error("Lido Withdrawal Queue contract was not found");
  }

  return "Ethereum Hoodi and active Lido queue verified";
}

function normalizedKeeperHubHealthUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "").replace(/\/api$/, "")}/api/health`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function getConnectionHealth(
  overrides: Partial<HealthDependencies> = {},
): Promise<HealthReport> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const checks = await Promise.all([
    process.env.DATABASE_URL
      ? timedCheck("database", "PostgreSQL query failed", async () => {
          await dependencies.databaseProbe();
          return "PostgreSQL accepted a query";
        })
      : unconfigured("database", "DATABASE_URL is not configured"),
    process.env.ETHEREUM_RPC_URL
      ? timedCheck("ethereum", "Ethereum or Lido verification failed", () =>
          checkEthereum(dependencies.fetch),
        )
      : unconfigured("ethereum", "ETHEREUM_RPC_URL is not configured"),
    process.env.WAYFINDER_SERVICE_URL
      ? timedCheck("wayfinder", "Wayfinder health check failed", async () => {
          await fetchJson(
            dependencies.fetch,
            new URL("/health", process.env.WAYFINDER_SERVICE_URL).toString(),
          );
          return "Wayfinder service is reachable";
        })
      : unconfigured("wayfinder", "WAYFINDER_SERVICE_URL is not configured"),
    process.env.KEEPERHUB_BASE_URL && process.env.KEEPERHUB_API_KEY
      ? timedCheck("keeperhub", "KeeperHub authentication failed", async () => {
          await fetchJson(
            dependencies.fetch,
            normalizedKeeperHubHealthUrl(process.env.KEEPERHUB_BASE_URL ?? ""),
          );
          const healthUrl = normalizedKeeperHubHealthUrl(
            process.env.KEEPERHUB_BASE_URL ?? "",
          );
          await fetchJson(
            dependencies.fetch,
            healthUrl.replace(/health$/, "keys"),
            {
              headers: {
                Authorization: `Bearer ${process.env.KEEPERHUB_API_KEY}`,
              },
            },
          );
          return "KeeperHub service and organization key verified";
        })
      : unconfigured(
          "keeperhub",
          "KEEPERHUB_BASE_URL and KEEPERHUB_API_KEY are required",
        ),
  ]);

  return {
    status: summarizeHealth(checks),
    checkedAt: dependencies.now().toISOString(),
    checks,
  };
}
