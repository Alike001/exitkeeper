import { NextResponse } from "next/server";
import { executeReviewedWithdrawalJob } from "@/lib/server/withdrawal-jobs";

export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/withdrawals/[jobId]/execute">,
) {
  try {
    const { jobId } = await params;
    return NextResponse.json(await executeReviewedWithdrawalJob(jobId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to execute withdrawal",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
