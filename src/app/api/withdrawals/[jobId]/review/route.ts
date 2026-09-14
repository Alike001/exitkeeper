import { NextResponse } from "next/server";
import { reviewWithdrawalJob } from "@/lib/server/withdrawal-jobs";

export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/withdrawals/[jobId]/review">,
) {
  try {
    const { jobId } = await params;
    return NextResponse.json(await reviewWithdrawalJob(jobId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to review withdrawal",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
