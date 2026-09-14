import "server-only";

import type { KeeperHubWorkflowDraft } from "@/lib/workflows/lido";

type Fetcher = typeof fetch;

export type KeeperHubTransaction = {
  hash: string;
  nodeId?: string;
  nodeName?: string;
  chainId?: number;
  network?: string;
  verified?: boolean;
  receiptStatus?: string;
};

export type KeeperHubSimulation = {
  ok: true;
  result: {
    simulatedNodeCount: number;
    skippedNodeCount: number;
    warnings?: unknown[];
  };
};

export type KeeperHubExecutionReceipt = {
  executionId: string;
  status: string;
  completed: boolean;
  transactionHashes: KeeperHubTransaction[];
  output: unknown;
  error: unknown;
  gasUsedWei: string | null;
  completedAt: string | null;
};

export class KeeperHubApiError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;

  constructor(status: number, retryAfter: string | null) {
    super(`KeeperHub request failed with HTTP ${status}`);
    this.name = "KeeperHubApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function apiBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/$/, "");
  url.pathname = path.endsWith("/api") ? path : `${path}/api`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("KeeperHub returned an invalid response shape");
  }
  return value as Record<string, unknown>;
}

export class KeeperHubClient {
  readonly #apiBase: string;
  readonly #apiKey: string;
  readonly #fetch: Fetcher;

  constructor(options: { baseUrl: string; apiKey: string; fetch?: Fetcher }) {
    this.#apiBase = apiBaseUrl(options.baseUrl);
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? fetch;
  }

  async #request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.#fetch(`${this.#apiBase}/${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.#apiKey}`,
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new KeeperHubApiError(
        response.status,
        response.headers.get("retry-after"),
      );
    }

    return response.json();
  }

  async verifyCredentials(): Promise<void> {
    await this.#request("keys");
  }

  async getWalletAddress(): Promise<string> {
    const result = objectValue(await this.#request("user/wallet"));
    if (typeof result.walletAddress !== "string") {
      throw new Error("KeeperHub wallet response is missing walletAddress");
    }
    return result.walletAddress;
  }

  async createWorkflow(
    draft: KeeperHubWorkflowDraft,
  ): Promise<Record<string, unknown>> {
    const result = objectValue(
      await this.#request("workflows/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      }),
    );
    if (typeof result.id !== "string") {
      throw new Error("KeeperHub workflow response is missing id");
    }
    return result;
  }

  async getWorkflow(workflowId: string): Promise<Record<string, unknown>> {
    return objectValue(await this.#request(`workflows/${workflowId}`));
  }

  async simulateWorkflow(workflowId: string): Promise<KeeperHubSimulation> {
    const response = objectValue(
      await this.#request(`workflows/${workflowId}/simulate`, {
        method: "POST",
      }),
    );
    const result = objectValue(response.result);
    if (
      response.ok !== true ||
      typeof result.simulatedNodeCount !== "number" ||
      typeof result.skippedNodeCount !== "number"
    ) {
      throw new Error("KeeperHub simulation response is invalid");
    }
    return response as KeeperHubSimulation;
  }

  async executeWorkflow(
    workflowId: string,
    idempotencyKey: string,
  ): Promise<{ executionId: string; status: string }> {
    const result = objectValue(
      await this.#request(`workflows/${workflowId}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({}),
      }),
    );
    if (
      typeof result.executionId !== "string" ||
      typeof result.status !== "string"
    ) {
      throw new Error("KeeperHub execution response is invalid");
    }
    return { executionId: result.executionId, status: result.status };
  }

  async waitForExecution(
    executionId: string,
    timeoutMs = 25_000,
  ): Promise<KeeperHubExecutionReceipt> {
    const boundedTimeout = Math.min(Math.max(Math.trunc(timeoutMs), 0), 60_000);
    const result = objectValue(
      await this.#request(
        `workflows/executions/${executionId}/wait?timeoutMs=${boundedTimeout}`,
      ),
    );
    if (
      result.executionId !== executionId ||
      typeof result.status !== "string" ||
      typeof result.completed !== "boolean" ||
      !Array.isArray(result.transactionHashes)
    ) {
      throw new Error("KeeperHub execution receipt is invalid");
    }
    return result as KeeperHubExecutionReceipt;
  }
}

export function keeperHubClientFromEnvironment(): KeeperHubClient {
  const baseUrl = process.env.KEEPERHUB_BASE_URL;
  const apiKey = process.env.KEEPERHUB_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("KeeperHub is not configured");
  }
  return new KeeperHubClient({ baseUrl, apiKey });
}
