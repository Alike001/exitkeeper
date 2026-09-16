import { NextResponse } from "next/server";
import { reviewClaimWorkflow } from "@/lib/server/withdrawal-jobs";

export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/withdrawals/[jobId]/claim/review">,
) {
  try {
    const { jobId } = await params;
    return NextResponse.json(await reviewClaimWorkflow(jobId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to review claim",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
