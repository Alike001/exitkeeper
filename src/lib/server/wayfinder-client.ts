import "server-only";

type Fetcher = typeof fetch;

export type WayfinderRequestStatus = {
  request_id: string;
  amount_of_steth: string;
  amount_of_shares: string;
  owner: string;
  timestamp: string;
  is_finalized: boolean;
  is_claimed: boolean;
};

export type WayfinderAccountState = {
  protocol: "lido";
  chain_id: 560048;
  account: string;
  observed_block: string;
  steth: { address: string; balance_raw: string; shares_raw: string };
  wsteth: {
    address: string;
    balance_raw: string;
    steth_equivalent_raw: string;
    steth_per_token: string;
  };
  withdrawals?: {
    withdrawal_queue: string;
    request_ids: string[];
    statuses?: WayfinderRequestStatus[];
    checkpoint_hints?: string[];
    claimable_ether_by_id?: Record<string, string>;
  };
};

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Wayfinder returned an invalid response shape");
  }
  return value as Record<string, unknown>;
}

export class WayfinderClient {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #fetch: Fetcher;

  constructor(options: { baseUrl: string; token: string; fetch?: Fetcher }) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#token = options.token;
    this.#fetch = options.fetch ?? fetch;
  }

  async #post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.#token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(
        `Wayfinder service request failed with HTTP ${response.status}`,
      );
    }
    const payload = objectValue(await response.json());
    if (payload.ok !== true) {
      throw new Error("Wayfinder service rejected the read request");
    }
    return payload.result;
  }

  async getAccountState(account: string): Promise<WayfinderAccountState> {
    const result = objectValue(
      await this.#post("/v1/lido/account-state", { account, chainId: 560048 }),
    );
    if (
      result.protocol !== "lido" ||
      result.chain_id !== 560048 ||
      typeof result.account !== "string" ||
      typeof result.observed_block !== "string"
    ) {
      throw new Error("Wayfinder returned an invalid Lido account state");
    }
    return result as unknown as WayfinderAccountState;
  }

  async getRequestStatus(requestIds: string[]): Promise<{
    observedBlock: string;
    statuses: WayfinderRequestStatus[];
    checkpointHints: string[];
  }> {
    if (requestIds.length === 0) {
      throw new Error("requestIds cannot be empty");
    }
    const result = objectValue(
      await this.#post("/v1/lido/request-status", {
        requestIds,
        chainId: 560048,
      }),
    );
    if (
      !Array.isArray(result.statuses) ||
      !Array.isArray(result.checkpoint_hints) ||
      typeof result.observed_block !== "string"
    ) {
      throw new Error("Wayfinder returned an invalid Lido request status");
    }
    return {
      observedBlock: result.observed_block,
      statuses: result.statuses as WayfinderRequestStatus[],
      checkpointHints: result.checkpoint_hints as string[],
    };
  }
}

export function wayfinderClientFromEnvironment(): WayfinderClient {
  const baseUrl = process.env.WAYFINDER_SERVICE_URL;
  const token = process.env.WAYFINDER_SERVICE_TOKEN;
  if (!baseUrl || !token) {
    throw new Error("Wayfinder service is not configured");
  }
  return new WayfinderClient({ baseUrl, token });
}
