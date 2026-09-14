import { describe, expect, it } from "vitest";
import {
  buildApprovalWorkflow,
  buildClaimWorkflow,
  buildRequestWorkflow,
  fingerprintWorkflow,
  lidoContracts,
} from "@/lib/workflows/lido";

const owner = "0x60042Ce11258A07E1BC6Bd63983C6Ee63E80c2DC";

describe("Lido KeeperHub workflow builder", () => {
  it("builds a disabled request workflow with concrete inputs and no templates", () => {
    const workflow = buildRequestWorkflow({
      jobReference: "EXIT-001",
      asset: "stETH",
      amountWei: "1000000000000000000100",
      chunksWei: ["1000000000000000000000", "100"],
      ownerAddress: owner,
    });

    expect(workflow.enabled).toBe(false);
    expect(workflow.nodes).toHaveLength(2);
    expect(workflow.edges).toEqual([
      {
        id: "trigger-to-request",
        source: "trigger",
        target: "request-withdrawal",
      },
    ]);
    expect(JSON.stringify(workflow)).toContain(lidoContracts.withdrawalQueue);
    expect(JSON.stringify(workflow)).not.toContain("{{");
  });

  it("builds exact approval as a separately preflightable KeeperHub workflow", () => {
    const workflow = buildApprovalWorkflow({
      jobReference: "EXIT-001",
      asset: "stETH",
      amountWei: "1000000000000000000",
      ownerAddress: owner,
    });

    expect(workflow.enabled).toBe(false);
    expect(workflow.nodes).toHaveLength(2);
    expect(JSON.stringify(workflow)).toContain('\\"approve\\"');
    expect(JSON.stringify(workflow)).toContain(lidoContracts.withdrawalQueue);
  });

  it("selects the wstETH request function for wrapped withdrawals", () => {
    const workflow = buildRequestWorkflow({
      jobReference: "EXIT-002",
      asset: "wstETH",
      amountWei: "100",
      chunksWei: ["100"],
      ownerAddress: owner,
    });
    const approval = buildApprovalWorkflow({
      jobReference: "EXIT-002",
      asset: "wstETH",
      amountWei: "100",
      ownerAddress: owner,
    });

    expect(JSON.stringify(workflow)).toContain("requestWithdrawalsWstETH");
    expect(JSON.stringify(approval)).toContain(lidoContracts.wstETH);
  });

  it("refuses malformed or widened request decisions", () => {
    expect(() =>
      buildRequestWorkflow({
        jobReference: "EXIT-003",
        asset: "stETH",
        amountWei: "101",
        chunksWei: ["100"],
        ownerAddress: owner,
      }),
    ).toThrow("sum to amountWei");
    expect(() =>
      buildRequestWorkflow({
        jobReference: "EXIT-003",
        asset: "stETH",
        amountWei: "100",
        chunksWei: ["100"],
        ownerAddress: "attacker-selected-recipient",
      }),
    ).toThrow("20-byte EVM address");
  });

  it("builds only an owner-directed claim", () => {
    const workflow = buildClaimWorkflow({
      jobReference: "EXIT-004",
      requestIds: ["135184"],
      checkpointHints: ["1216"],
      ownerAddress: owner,
    });

    const serialized = JSON.stringify(workflow);
    expect(serialized).toContain("claimWithdrawals");
    expect(serialized).not.toContain("claimWithdrawalsTo");
    expect(serialized).toContain(lidoContracts.withdrawalQueue);
  });

  it("refuses unmatched request IDs and checkpoint hints", () => {
    expect(() =>
      buildClaimWorkflow({
        jobReference: "EXIT-005",
        requestIds: ["135184", "135185"],
        checkpointHints: ["1216"],
        ownerAddress: owner,
      }),
    ).toThrow("equal lengths");
  });

  it("produces a stable fingerprint and detects workflow drift", async () => {
    const workflow = buildClaimWorkflow({
      jobReference: "EXIT-006",
      requestIds: ["135184"],
      checkpointHints: ["1216"],
      ownerAddress: owner,
    });
    const first = await fingerprintWorkflow(workflow);
    const second = await fingerprintWorkflow(structuredClone(workflow));
    const changed = structuredClone(workflow);
    const claimNode = changed.nodes[1];
    expect(claimNode).toBeDefined();
    if (!claimNode) {
      throw new Error("Claim workflow action is missing");
    }
    claimNode.data.config.functionArgs = '[["135184"],["1217"]]';

    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await fingerprintWorkflow(changed)).not.toBe(first);
  });
});
