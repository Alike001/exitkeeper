import { describe, expect, it } from "vitest";
import { selectObservedRequest } from "@/lib/wayfinder-observation";

const owner = "0x7b67e63d6346f64c453315cfffe827da4eaffdb5";
const createdAt = new Date("2026-09-16T12:00:00.000Z");

function status(overrides: Record<string, unknown> = {}) {
  return {
    request_id: "42",
    amount_of_steth: "10000000000000000",
    amount_of_shares: "9999999999999999",
    owner,
    timestamp: "1789560000",
    is_finalized: false,
    is_claimed: false,
    ...overrides,
  };
}

describe("Wayfinder withdrawal observation", () => {
  it("selects a new exact stETH request without converting uint256 values", () => {
    expect(
      selectObservedRequest({
        asset: "stETH",
        amountWei: "10000000000000000",
        ownerAddress: owner,
        createdAt,
        baselineRequestIds: ["41"],
        statuses: [status()],
      })?.request_id,
    ).toBe("42");
  });

  it("does not rediscover a request present before execution", () => {
    expect(
      selectObservedRequest({
        asset: "stETH",
        amountWei: "10000000000000000",
        ownerAddress: owner,
        createdAt,
        baselineRequestIds: ["42"],
        statuses: [status()],
      }),
    ).toBeNull();
  });

  it("requires operator review when correlation is ambiguous", () => {
    expect(() =>
      selectObservedRequest({
        asset: "wstETH",
        amountWei: "10000000000000000",
        ownerAddress: owner,
        createdAt,
        baselineRequestIds: [],
        statuses: [status(), status({ request_id: "43" })],
      }),
    ).toThrow("multiple possible Lido requests");
  });
});
