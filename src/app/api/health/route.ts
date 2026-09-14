import { getConnectionHealth } from "@/lib/server/health";

export async function GET() {
  const report = await getConnectionHealth();

  return Response.json(report, {
    status: report.status === "ready" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
