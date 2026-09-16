import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  decisionSnapshots,
  keeperhubExecutions,
  lifecycleEvents,
  withdrawalJobs,
} from "@/lib/db/schema";
import { keeperHubClientFromEnvironment } from "@/lib/server/keeperhub-client";
import {
  HOODI_CHAIN_ID,
  parseEthAmountToWei,
  type WithdrawalAsset,
} from "@/lib/withdrawals";
import {
  buildApprovalWorkflow,
  buildRequestWorkflow,
  fingerprintWorkflow,
} from "@/lib/workflows/lido";

type CreateJobInput = { asset: WithdrawalAsset; amount: string };

function createReference(): string {
  return `EK-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

function assertAddress(address: string): string {
  if (!/^0x[0-9a-f]{40}$/i.test(address)) {
    throw new Error(
      "KeeperHub returned an invalid organization wallet address",
    );
  }
  return address.toLowerCase();
}

export async function createWithdrawalJob(input: CreateJobInput) {
  const amountWei = parseEthAmountToWei(input.amount);
  const keeperHub = keeperHubClientFromEnvironment();
  const ownerAddress = assertAddress(await keeperHub.getWalletAddress());
  const reference = createReference();
  const requestWorkflow = buildRequestWorkflow({
    jobReference: reference,
    asset: input.asset,
    amountWei,
    chunksWei: [amountWei],
    ownerAddress,
  });
  const approvalWorkflow = buildApprovalWorkflow({
    jobReference: reference,
    asset: input.asset,
    amountWei,
    ownerAddress,
  });
  const [requestFingerprint, approvalFingerprint] = await Promise.all([
    fingerprintWorkflow(requestWorkflow),
    fingerprintWorkflow(approvalWorkflow),
  ]);

  const [job] = await db
    .insert(withdrawalJobs)
    .values({
      reference,
      asset: input.asset,
      amountWei,
      ownerAddress,
      chainId: HOODI_CHAIN_ID,
      status: "review-required",
      evidenceOrigin: "testnet",
    })
    .returning();

  await db.transaction(async (tx) => {
    await tx.insert(decisionSnapshots).values({
      jobId: job.id,
      action: input.asset === "stETH" ? "REQUEST_STETH" : "REQUEST_WSTETH",
      observedBlock: BigInt(0),
      observedAt: new Date(),
      workflowFingerprint: requestFingerprint,
      decision: {
        network: "Hoodi",
        chainId: HOODI_CHAIN_ID,
        ownerAddress,
        asset: input.asset,
        amountWei,
        approvalFingerprint,
        requestFingerprint,
        approvalWorkflow,
        requestWorkflow,
      },
    });
    await tx.insert(lifecycleEvents).values({
      jobId: job.id,
      fromStatus: "draft",
      toStatus: "review-required",
      source: "operator",
      summary:
        "Exact Lido approval and withdrawal workflows prepared for review.",
      evidence: { approvalFingerprint, requestFingerprint, network: "Hoodi" },
    });
  });

  return { job, approvalFingerprint, requestFingerprint };
}

export async function listWithdrawalJobs() {
  return db
    .select({
      id: withdrawalJobs.id,
      reference: withdrawalJobs.reference,
      asset: withdrawalJobs.asset,
      amountWei: withdrawalJobs.amountWei,
      ownerAddress: withdrawalJobs.ownerAddress,
      status: withdrawalJobs.status,
      createdAt: withdrawalJobs.createdAt,
    })
    .from(withdrawalJobs)
    .orderBy(desc(withdrawalJobs.createdAt))
    .limit(12);
}

export async function getWithdrawalJobEvidence(jobId: string) {
  const [job] = await db
    .select()
    .from(withdrawalJobs)
    .where(eq(withdrawalJobs.id, jobId));
  if (!job) {
    return null;
  }

  const [snapshots, events, executions] = await Promise.all([
    db
      .select()
      .from(decisionSnapshots)
      .where(eq(decisionSnapshots.jobId, jobId))
      .orderBy(desc(decisionSnapshots.createdAt)),
    db
      .select()
      .from(lifecycleEvents)
      .where(eq(lifecycleEvents.jobId, jobId))
      .orderBy(desc(lifecycleEvents.createdAt)),
    db
      .select()
      .from(keeperhubExecutions)
      .where(eq(keeperhubExecutions.jobId, jobId))
      .orderBy(desc(keeperhubExecutions.createdAt)),
  ]);

  return { job, snapshots, events, executions };
}

type WorkflowSnapshot = {
  approvalWorkflow: Parameters<typeof fingerprintWorkflow>[0];
  requestWorkflow: Parameters<typeof fingerprintWorkflow>[0];
  approvalFingerprint: string;
  requestFingerprint: string;
};

function readWorkflowSnapshot(value: unknown): WorkflowSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stored decision snapshot is invalid");
  }
  const snapshot = value as Record<string, unknown>;
  if (
    typeof snapshot.approvalFingerprint !== "string" ||
    typeof snapshot.requestFingerprint !== "string" ||
    !snapshot.approvalWorkflow ||
    !snapshot.requestWorkflow
  ) {
    throw new Error("Stored workflow snapshot is incomplete");
  }
  return snapshot as unknown as WorkflowSnapshot;
}

export async function reviewWithdrawalJob(jobId: string) {
  const [job] = await db
    .select()
    .from(withdrawalJobs)
    .where(eq(withdrawalJobs.id, jobId));
  if (!job) {
    throw new Error("Withdrawal job was not found");
  }
  if (job.status !== "review-required") {
    throw new Error("Only a prepared job can be reviewed");
  }

  const [snapshot] = await db
    .select()
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.jobId, jobId))
    .orderBy(desc(decisionSnapshots.createdAt))
    .limit(1);
  if (!snapshot) {
    throw new Error("Withdrawal job has no decision snapshot");
  }
  const workflows = readWorkflowSnapshot(snapshot.decision);
  const keeperHub = keeperHubClientFromEnvironment();
  const [approval, request] = await Promise.all([
    keeperHub.createWorkflow(workflows.approvalWorkflow),
    keeperHub.createWorkflow(workflows.requestWorkflow),
  ]);
  const approvalId = approval.id as string;
  const requestId = request.id as string;
  const [approvalSimulation, requestSimulation] = await Promise.all([
    keeperHub.simulateWorkflow(approvalId),
    keeperHub.simulateWorkflow(requestId),
  ]);

  await db.transaction(async (tx) => {
    await tx.insert(keeperhubExecutions).values([
      {
        jobId,
        stage: "approval",
        idempotencyKey: `${job.reference}:approval`,
        workflowId: approvalId,
        workflowFingerprint: workflows.approvalFingerprint,
        status: "prepared",
        inputSnapshot: { workflow: workflows.approvalWorkflow },
        responseSnapshot: {
          workflow: approval,
          simulation: approvalSimulation,
        },
      },
      {
        jobId,
        stage: "request",
        idempotencyKey: `${job.reference}:request`,
        workflowId: requestId,
        workflowFingerprint: workflows.requestFingerprint,
        status: "prepared",
        inputSnapshot: { workflow: workflows.requestWorkflow },
        responseSnapshot: { workflow: request, simulation: requestSimulation },
      },
    ]);
    await tx
      .update(withdrawalJobs)
      .set({ status: "request-submitted", updatedAt: new Date() })
      .where(
        and(
          eq(withdrawalJobs.id, jobId),
          eq(withdrawalJobs.status, "review-required"),
        ),
      );
    await tx.insert(lifecycleEvents).values({
      jobId,
      fromStatus: "review-required",
      toStatus: "request-submitted",
      source: "keeperhub",
      summary:
        "Approval and withdrawal workflows were created and dry-run by KeeperHub.",
      evidence: {
        approvalWorkflowId: approvalId,
        requestWorkflowId: requestId,
      },
    });
  });

  return { approval, request, approvalSimulation, requestSimulation };
}

export async function executeReviewedWithdrawalJob(jobId: string) {
  const [job] = await db
    .select()
    .from(withdrawalJobs)
    .where(eq(withdrawalJobs.id, jobId));
  if (!job || job.status !== "request-submitted") {
    throw new Error("Only a reviewed withdrawal can be executed");
  }

  const executions = await db
    .select()
    .from(keeperhubExecutions)
    .where(eq(keeperhubExecutions.jobId, jobId));
  const approval = executions.find((item) => item.stage === "approval");
  const request = executions.find((item) => item.stage === "request");
  if (!(approval && request)) {
    throw new Error("Reviewed KeeperHub workflows are incomplete");
  }

  const keeperHub = keeperHubClientFromEnvironment();
  async function executeStage(execution: NonNullable<typeof approval>) {
    if (execution.status !== "prepared") {
      throw new Error(`${execution.stage} workflow was already submitted`);
    }
    const accepted = await keeperHub.executeWorkflow(
      execution.workflowId,
      execution.idempotencyKey,
    );
    await db
      .update(keeperhubExecutions)
      .set({
        keeperhubExecutionId: accepted.executionId,
        status: "accepted",
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(keeperhubExecutions.id, execution.id));

    const receipt = await keeperHub.waitForExecution(accepted.executionId);
    const hashes = receipt.transactionHashes.map(
      (transaction) => transaction.hash,
    );
    const succeeded = receipt.completed && receipt.error == null;
    await db
      .update(keeperhubExecutions)
      .set({
        status: succeeded ? "succeeded" : "failed",
        responseSnapshot: { accepted, receipt },
        transactionHashes: hashes,
        completedAt: receipt.completed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(keeperhubExecutions.id, execution.id));
    if (!succeeded) {
      throw new Error(
        `${execution.stage} workflow did not complete successfully`,
      );
    }
    return receipt;
  }

  try {
    const approvalReceipt = await executeStage(approval);
    const requestReceipt = await executeStage(request);
    await db.transaction(async (tx) => {
      await tx
        .update(withdrawalJobs)
        .set({ status: "request-confirmed", updatedAt: new Date() })
        .where(eq(withdrawalJobs.id, jobId));
      await tx.insert(lifecycleEvents).values({
        jobId,
        fromStatus: "request-submitted",
        toStatus: "request-confirmed",
        source: "keeperhub",
        summary: "KeeperHub executed approval and Lido withdrawal in order.",
        evidence: {
          approvalExecutionId: approvalReceipt.executionId,
          requestExecutionId: requestReceipt.executionId,
          transactionHashes: [
            ...approvalReceipt.transactionHashes.map((item) => item.hash),
            ...requestReceipt.transactionHashes.map((item) => item.hash),
          ],
        },
      });
    });
    return { approvalReceipt, requestReceipt };
  } catch (error) {
    await db
      .update(withdrawalJobs)
      .set({ status: "attention-required", updatedAt: new Date() })
      .where(eq(withdrawalJobs.id, jobId));
    throw error;
  }
}
