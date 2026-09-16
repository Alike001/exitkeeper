export type ExecutionReadinessInput = {
  tokenBalanceWei: string;
  requiredTokenWei: string;
  nativeBalanceWei: string;
  simulations: Array<{
    simulatedNodeCount: number;
    skippedNodeCount: number;
  }>;
};

export function executionReadinessBlockers({
  tokenBalanceWei,
  requiredTokenWei,
  nativeBalanceWei,
  simulations,
}: ExecutionReadinessInput): string[] {
  const blockers: string[] = [];
  if (BigInt(tokenBalanceWei) < BigInt(requiredTokenWei)) {
    blockers.push(
      "The KeeperHub wallet does not hold enough of the selected Lido token",
    );
  }
  if (BigInt(nativeBalanceWei) === BigInt(0)) {
    blockers.push("The KeeperHub wallet has no Hoodi ETH for gas");
  }
  if (
    simulations.length === 0 ||
    simulations.some(
      (simulation) =>
        simulation.simulatedNodeCount === 0 || simulation.skippedNodeCount > 0,
    )
  ) {
    blockers.push("KeeperHub did not simulate every Hoodi transaction node");
  }
  return blockers;
}
