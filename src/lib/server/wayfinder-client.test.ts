import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("WayfinderClient", () => {
  it("uses the internal read-only boundary with a service token", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ok: true,
        result: {
          protocol: "lido",
          chain_id: 560048,
          account: "0x60042Ce11258A07E1BC6Bd63983C6Ee63E80c2DC",
        },
      }),
    );
    const { WayfinderClient } = await import("@/lib/server/wayfinder-client");
    const client = new WayfinderClient({
      baseUrl: "http://wayfinder:8090/",
      token: "worker-secret",
      fetch: fetcher,
    });

    await client.getAccountState("0x60042Ce11258A07E1BC6Bd63983C6Ee63E80c2DC");

    expect(fetcher).toHaveBeenCalledWith(
      "http://wayfinder:8090/v1/lido/account-state",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer worker-secret",
        }),
        body: JSON.stringify({
          account: "0x60042Ce11258A07E1BC6Bd63983C6Ee63E80c2DC",
          chainId: 560048,
        }),
      }),
    );
  });

  it("does not accept an empty request status read", async () => {
    const { WayfinderClient } = await import("@/lib/server/wayfinder-client");
    const client = new WayfinderClient({
      baseUrl: "http://wayfinder:8090",
      token: "worker-secret",
      fetch: vi.fn<typeof fetch>(),
    });

    await expect(client.getRequestStatus([])).rejects.toThrow(
      "requestIds cannot be empty",
    );
  });
});
