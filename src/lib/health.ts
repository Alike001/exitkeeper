export const connectionIds = [
  "database",
  "ethereum",
  "wayfinder",
  "keeperhub",
] as const;

export type ConnectionId = (typeof connectionIds)[number];
export type ConnectionState = "healthy" | "unhealthy" | "unconfigured";

export type ConnectionCheck = {
  id: ConnectionId;
  state: ConnectionState;
  detail: string;
  latencyMs: number | null;
};

export type HealthReport = {
  status: "ready" | "degraded" | "unconfigured";
  checkedAt: string;
  checks: ConnectionCheck[];
};

export function summarizeHealth(
  checks: ConnectionCheck[],
): HealthReport["status"] {
  if (checks.every((check) => check.state === "unconfigured")) {
    return "unconfigured";
  }

  return checks.every((check) => check.state === "healthy")
    ? "ready"
    : "degraded";
}
