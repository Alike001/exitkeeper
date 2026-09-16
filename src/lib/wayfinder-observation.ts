import type { WayfinderRequestStatus } from "@/lib/server/wayfinder-client";

type SelectRequestInput = {
  asset: "stETH" | "wstETH";
  amountWei: string;
  ownerAddress: string;
  createdAt: Date;
  baselineRequestIds: string[];
  statuses: WayfinderRequestStatus[];
};

function isRecentEnough(timestamp: string, createdAt: Date): boolean {
  const requestedAtMs = Number(timestamp) * 1000;
  return (
    Number.isSafeInteger(requestedAtMs) &&
    requestedAtMs >= createdAt.getTime() - 5 * 60 * 1000
  );
}

export function selectObservedRequest({
  asset,
  amountWei,
  ownerAddress,
  createdAt,
  baselineRequestIds,
  statuses,
}: SelectRequestInput): WayfinderRequestStatus | null {
  const baseline = new Set(baselineRequestIds);
  const candidates = statuses.filter(
    (status) =>
      !baseline.has(status.request_id) &&
      status.owner.toLowerCase() === ownerAddress.toLowerCase() &&
      isRecentEnough(status.timestamp, createdAt) &&
      (asset === "wstETH" || status.amount_of_steth === amountWei),
  );

  if (candidates.length > 1) {
    throw new Error(
      "Wayfinder found multiple possible Lido requests; operator review is required",
    );
  }
  return candidates[0] ?? null;
}
