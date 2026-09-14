import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeeperHubWorkflowDraft } from "@/lib/workflows/lido";

vi.mock("server-only", () => ({}));

const workflow: KeeperHubWorkflowDraft = {
  name: "ExitKeeper test",
  description: "A fixed test workflow",
  enabled: false,
  nodes: [],
  edges: [],
};

describe("KeeperHubClient", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("normalizes the API base and authenticates credential checks", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    const { KeeperHubClient } = await import("@/lib/server/keeperhub-client");
    const client = new KeeperHubClient({
      baseUrl: "https://app.keeperhub.com/api/",
      apiKey: "kh_secret",
      fetch: fetcher,
    });

    await client.verifyCredentials();

    expect(fetcher).toHaveBeenCalledWith(
      "https://app.keeperhub.com/api/keys",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer kh_secret",
        }),
      }),
    );
  });

  it("creates disabled workflows through the documented endpoint", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "workflow-1" }));
    const { KeeperHubClient } = await import("@/lib/server/keeperhub-client");
    const client = new KeeperHubClient({
      baseUrl: "https://app.keeperhub.com",
      apiKey: "kh_secret",
      fetch: fetcher,
    });

    await client.createWorkflow(workflow);

    expect(fetcher).toHaveBeenCalledWith(
      "https://app.keeperhub.com/api/workflows/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(workflow),
      }),
    );
  });

  it("simulates before execution and sends a stable idempotency key", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          result: { simulatedNodeCount: 1, skippedNodeCount: 0 },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ executionId: "execution-1", status: "running" }),
      );
    const { KeeperHubClient } = await import("@/lib/server/keeperhub-client");
    const client = new KeeperHubClient({
      baseUrl: "https://app.keeperhub.com",
      apiKey: "kh_secret",
      fetch: fetcher,
    });

    const simulation = await client.simulateWorkflow("workflow-1");
    const execution = await client.executeWorkflow(
      "workflow-1",
      "exitkeeper:job-1:request",
    );

    expect(simulation.result.skippedNodeCount).toBe(0);
    expect(execution.executionId).toBe("execution-1");
    expect(fetcher.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        body: "{}",
        headers: expect.objectContaining({
          "Idempotency-Key": "exitkeeper:job-1:request",
        }),
      }),
    );
  });

  it("bounds wait windows to KeeperHub's documented maximum", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        executionId: "execution-1",
        status: "running",
        completed: false,
        transactionHashes: [],
        output: null,
        error: null,
        gasUsedWei: null,
        completedAt: null,
      }),
    );
    const { KeeperHubClient } = await import("@/lib/server/keeperhub-client");
    const client = new KeeperHubClient({
      baseUrl: "https://app.keeperhub.com",
      apiKey: "kh_secret",
      fetch: fetcher,
    });

    await client.waitForExecution("execution-1", 90_000);

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://app.keeperhub.com/api/workflows/executions/execution-1/wait?timeoutMs=60000",
    );
  });

  it("returns bounded HTTP errors without response bodies or credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"message":"kh_secret rejected"}', {
        status: 401,
        headers: { "retry-after": "10" },
      }),
    );
    const { KeeperHubApiError, KeeperHubClient } = await import(
      "@/lib/server/keeperhub-client"
    );
    const client = new KeeperHubClient({
      baseUrl: "https://app.keeperhub.com",
      apiKey: "kh_secret",
      fetch: fetcher,
    });

    await expect(client.verifyCredentials()).rejects.toMatchObject({
      name: "KeeperHubApiError",
      status: 401,
      retryAfter: "10",
    });
    await expect(client.verifyCredentials()).rejects.not.toThrow("kh_secret");
    expect(KeeperHubApiError).toBeDefined();
  });
});
