import { NextResponse } from "next/server";
import { executeReviewedClaim } from "@/lib/server/withdrawal-jobs";

export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/withdrawals/[jobId]/claim/execute">,
) {
  try {
    const { jobId } = await params;
    return NextResponse.json(await executeReviewedClaim(jobId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to execute claim",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
