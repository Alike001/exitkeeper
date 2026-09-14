import { describe, expect, it } from "vitest";
import {
  parseEthAmountToWei,
  validateNewWithdrawalInput,
} from "@/lib/withdrawals";

describe("withdrawal input", () => {
  it("converts a decimal ETH amount exactly", () => {
    expect(parseEthAmountToWei("0.125")).toBe("125000000000000000");
  });

  it("rejects an unsafe amount", () => {
    expect(() => parseEthAmountToWei("0")).toThrow(
      "between 100 wei and 1000 ETH",
    );
  });

  it("only permits Lido assets", () => {
    expect(() =>
      validateNewWithdrawalInput({ asset: "ETH", amount: "1" }),
    ).toThrow("Asset must be stETH or wstETH");
  });
});
