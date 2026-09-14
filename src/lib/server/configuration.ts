import "server-only";

export type SetupItem = {
  id: "keeperhub" | "wayfinder" | "ethereum" | "database";
  label: string;
  configured: boolean;
  detail: string;
};

export function getSetupChecklist(): SetupItem[] {
  return [
    {
      id: "keeperhub",
      label: "KeeperHub execution",
      configured: Boolean(
        process.env.KEEPERHUB_BASE_URL && process.env.KEEPERHUB_API_KEY,
      ),
      detail: "API endpoint and organization credential",
    },
    {
      id: "wayfinder",
      label: "Wayfinder observer",
      configured: Boolean(
        process.env.WAYFINDER_SERVICE_URL &&
          process.env.WAYFINDER_SERVICE_TOKEN,
      ),
      detail: "Official Paths SDK service boundary",
    },
    {
      id: "ethereum",
      label: "Ethereum verification",
      configured: Boolean(process.env.ETHEREUM_RPC_URL),
      detail: "Independent receipt and Lido state reads",
    },
    {
      id: "database",
      label: "Durable job state",
      configured: Boolean(process.env.DATABASE_URL),
      detail: "PostgreSQL connection",
    },
  ];
}
