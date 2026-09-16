import { NextResponse } from "next/server";
import { recoverKeeperHubExecutions } from "@/lib/server/withdrawal-jobs";

export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/withdrawals/[jobId]/recover">,
) {
  try {
    const { jobId } = await params;
    return NextResponse.json(await recoverKeeperHubExecutions(jobId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to recover execution",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
