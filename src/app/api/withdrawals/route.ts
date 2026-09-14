import { NextResponse } from "next/server";
import { createWithdrawalJob } from "@/lib/server/withdrawal-jobs";
import { validateNewWithdrawalInput } from "@/lib/withdrawals";

export async function POST(request: Request) {
  try {
    const input = validateNewWithdrawalInput(await request.json());
    const result = await createWithdrawalJob(input);
    return NextResponse.json(
      {
        job: {
          id: result.job.id,
          reference: result.job.reference,
          status: result.job.status,
          ownerAddress: result.job.ownerAddress,
          chainId: result.job.chainId,
        },
        fingerprints: {
          approval: result.approvalFingerprint,
          request: result.requestFingerprint,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare withdrawal",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
