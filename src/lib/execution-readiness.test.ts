import { describe, expect, it } from "vitest";
import { executionReadinessBlockers } from "@/lib/execution-readiness";

const ready = {
  tokenBalanceWei: "1000",
  requiredTokenWei: "100",
  nativeBalanceWei: "1",
  simulations: [
    { simulatedNodeCount: 1, skippedNodeCount: 0 },
    { simulatedNodeCount: 1, skippedNodeCount: 0 },
  ],
};

describe("withdrawal execution readiness", () => {
  it("accepts a funded wallet and complete simulations", () => {
    expect(executionReadinessBlockers(ready)).toEqual([]);
  });

  it("blocks an insufficient Lido token balance", () => {
    expect(
      executionReadinessBlockers({ ...ready, tokenBalanceWei: "99" }),
    ).toContain(
      "The KeeperHub wallet does not hold enough of the selected Lido token",
    );
  });

  it("blocks a wallet without gas", () => {
    expect(
      executionReadinessBlockers({ ...ready, nativeBalanceWei: "0" }),
    ).toContain("The KeeperHub wallet has no Hoodi ETH for gas");
  });

  it("blocks skipped KeeperHub simulation nodes", () => {
    expect(
      executionReadinessBlockers({
        ...ready,
        simulations: [{ simulatedNodeCount: 0, skippedNodeCount: 1 }],
      }),
    ).toContain("KeeperHub did not simulate every Hoodi transaction node");
  });
});
