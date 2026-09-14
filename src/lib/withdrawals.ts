export const HOODI_CHAIN_ID = 560048;
const WEI_PER_ETH = BigInt("1000000000000000000");
const MIN_WITHDRAWAL_WEI = BigInt("100");
const MAX_WITHDRAWAL_WEI = BigInt("1000") * WEI_PER_ETH;

export type WithdrawalAsset = "stETH" | "wstETH";

export type NewWithdrawalInput = {
  asset: WithdrawalAsset;
  amount: string;
};

export function parseEthAmountToWei(amount: string): string {
  const normalized = amount.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(normalized)) {
    throw new Error(
      "Amount must be a positive number with at most 18 decimals",
    );
  }

  const [whole, fraction = ""] = normalized.split(".");
  const wei = BigInt(whole) * WEI_PER_ETH + BigInt(fraction.padEnd(18, "0"));
  if (wei < MIN_WITHDRAWAL_WEI || wei > MAX_WITHDRAWAL_WEI) {
    throw new Error(
      "Each Lido withdrawal must be between 100 wei and 1000 ETH",
    );
  }
  return wei.toString();
}

export function validateNewWithdrawalInput(value: unknown): NewWithdrawalInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be an object");
  }
  const input = value as Record<string, unknown>;
  if (input.asset !== "stETH" && input.asset !== "wstETH") {
    throw new Error("Asset must be stETH or wstETH");
  }
  if (typeof input.amount !== "string") {
    throw new Error("Amount is required");
  }
  parseEthAmountToWei(input.amount);
  return { asset: input.asset, amount: input.amount.trim() };
}

export function formatWeiAsEth(wei: string): string {
  const value = BigInt(wei);
  const whole = value / WEI_PER_ETH;
  const fraction = (value % WEI_PER_ETH).toString().padStart(18, "0");
  return `${whole}.${fraction.slice(0, 6).replace(/0+$/, "") || "0"}`;
}
