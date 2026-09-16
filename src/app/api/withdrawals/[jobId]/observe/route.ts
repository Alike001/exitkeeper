import { NextResponse } from "next/server";
import { observeWithdrawalJob } from "@/lib/server/withdrawal-jobs";

export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/withdrawals/[jobId]/observe">,
) {
  try {
    const { jobId } = await params;
    return NextResponse.json(await observeWithdrawalJob(jobId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to observe withdrawal",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
