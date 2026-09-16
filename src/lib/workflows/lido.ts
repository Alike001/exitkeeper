const ETHEREUM_HOODI = "560048";
const MIN_WITHDRAWAL_WEI = BigInt("100");
const MAX_WITHDRAWAL_WEI = BigInt("1000000000000000000000");

export const lidoContracts = {
  stETH: "0x3508A952176b3c15387C97BE809eaffB1982176a",
  wstETH: "0x7E99eE3C66636DE415D2d7C880938F2f40f94De4",
  withdrawalQueue: "0xfe56573178f1bcdf53F01A6E9977670dcBBD9186",
} as const;

const approveAbi = JSON.stringify([
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "approved", type: "bool" }],
  },
]);

const requestAbi = JSON.stringify([
  {
    type: "function",
    name: "requestWithdrawals",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_amounts", type: "uint256[]" },
      { name: "_owner", type: "address" },
    ],
    outputs: [{ name: "requestIds", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "requestWithdrawalsWstETH",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_amounts", type: "uint256[]" },
      { name: "_owner", type: "address" },
    ],
    outputs: [{ name: "requestIds", type: "uint256[]" }],
  },
]);

const claimAbi = JSON.stringify([
  {
    type: "function",
    name: "claimWithdrawals",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_requestIds", type: "uint256[]" },
      { name: "_hints", type: "uint256[]" },
    ],
    outputs: [],
  },
]);

type Asset = keyof Pick<typeof lidoContracts, "stETH" | "wstETH">;

type WorkflowNode = {
  id: string;
  type: "trigger" | "action";
  data: {
    label: string;
    config: Record<string, unknown>;
  };
};

export type KeeperHubWorkflowDraft = {
  name: string;
  description: string;
  enabled: false;
  nodes: WorkflowNode[];
  edges: Array<{ id: string; source: string; target: string }>;
};

export type RequestDecision = {
  jobReference: string;
  asset: Asset;
  amountWei: string;
  chunksWei: string[];
  ownerAddress: string;
};

export type ApprovalDecision = Pick<
  RequestDecision,
  "jobReference" | "asset" | "amountWei" | "ownerAddress"
>;

export type ClaimDecision = {
  jobReference: string;
  requestIds: string[];
  checkpointHints: string[];
  ownerAddress: string;
};

function manualTrigger(): WorkflowNode {
  return {
    id: "trigger",
    type: "trigger",
    data: { label: "Manual", config: { triggerType: "Manual" } },
  };
}

function writeContractNode(
  id: string,
  label: string,
  contractAddress: string,
  abi: string,
  abiFunction: string,
  functionArgs: unknown[],
): WorkflowNode {
  return {
    id,
    type: "action",
    data: {
      label,
      config: {
        actionType: "web3/write-contract",
        network: ETHEREUM_HOODI,
        contractAddress,
        abi,
        abiFunction,
        functionArgs: JSON.stringify(functionArgs),
      },
    },
  };
}

function assertPositiveInteger(value: string, label: string): void {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${label} must be a positive integer string`);
  }
}

function assertAddress(value: string): void {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error("ownerAddress must be a 20-byte EVM address");
  }
}

export function buildRequestWorkflow(
  decision: RequestDecision,
): KeeperHubWorkflowDraft {
  assertAddress(decision.ownerAddress);
  assertPositiveInteger(decision.amountWei, "amountWei");
  if (decision.chunksWei.length === 0) {
    throw new Error("chunksWei cannot be empty");
  }
  decision.chunksWei.forEach((chunk) => {
    assertPositiveInteger(chunk, "withdrawal chunk");
  });
  if (
    decision.chunksWei.some((chunk) => {
      const amount = BigInt(chunk);
      return amount < MIN_WITHDRAWAL_WEI || amount > MAX_WITHDRAWAL_WEI;
    })
  ) {
    throw new Error(
      "each withdrawal chunk must be between 100 wei and 1000 ETH",
    );
  }
  const total = decision.chunksWei.reduce(
    (sum, chunk) => sum + BigInt(chunk),
    BigInt(0),
  );
  if (total !== BigInt(decision.amountWei)) {
    throw new Error("withdrawal chunks must sum to amountWei");
  }

  const requestFunction =
    decision.asset === "stETH"
      ? "requestWithdrawals"
      : "requestWithdrawalsWstETH";

  return {
    name: `ExitKeeper ${decision.jobReference} request`,
    description: `Request one reviewed ${decision.asset} withdrawal for ${decision.ownerAddress}.`,
    enabled: false,
    nodes: [
      manualTrigger(),
      writeContractNode(
        "request-withdrawal",
        `Request ${decision.asset} withdrawal`,
        lidoContracts.withdrawalQueue,
        requestAbi,
        requestFunction,
        [decision.chunksWei, decision.ownerAddress],
      ),
    ],
    edges: [
      {
        id: "trigger-to-request",
        source: "trigger",
        target: "request-withdrawal",
      },
    ],
  };
}

export function buildApprovalWorkflow(
  decision: ApprovalDecision,
): KeeperHubWorkflowDraft {
  assertAddress(decision.ownerAddress);
  assertPositiveInteger(decision.amountWei, "amountWei");

  return {
    name: `ExitKeeper ${decision.jobReference} approval`,
    description: `Approve exactly ${decision.amountWei} wei of ${decision.asset} for Lido's queue from ${decision.ownerAddress}.`,
    enabled: false,
    nodes: [
      manualTrigger(),
      writeContractNode(
        "approve-token",
        `Approve exact ${decision.asset} amount`,
        lidoContracts[decision.asset],
        approveAbi,
        "approve",
        [lidoContracts.withdrawalQueue, decision.amountWei],
      ),
    ],
    edges: [
      { id: "trigger-to-approve", source: "trigger", target: "approve-token" },
    ],
  };
}

export function buildClaimWorkflow(
  decision: ClaimDecision,
): KeeperHubWorkflowDraft {
  assertAddress(decision.ownerAddress);
  if (decision.requestIds.length === 0) {
    throw new Error("requestIds cannot be empty");
  }
  if (decision.requestIds.length !== decision.checkpointHints.length) {
    throw new Error("requestIds and checkpointHints must have equal lengths");
  }
  decision.requestIds.forEach((id) => {
    assertPositiveInteger(id, "request ID");
  });
  decision.checkpointHints.forEach((hint) => {
    assertPositiveInteger(hint, "checkpoint hint");
  });

  return {
    name: `ExitKeeper ${decision.jobReference} claim`,
    description: `Claim reviewed Lido requests to their owner ${decision.ownerAddress}.`,
    enabled: false,
    nodes: [
      manualTrigger(),
      writeContractNode(
        "claim-withdrawals",
        "Claim finalized Lido withdrawals",
        lidoContracts.withdrawalQueue,
        claimAbi,
        "claimWithdrawals",
        [decision.requestIds, decision.checkpointHints],
      ),
    ],
    edges: [
      {
        id: "trigger-to-claim",
        source: "trigger",
        target: "claim-withdrawals",
      },
    ],
  };
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function fingerprintWorkflow(
  workflow: KeeperHubWorkflowDraft,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(workflow));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}
