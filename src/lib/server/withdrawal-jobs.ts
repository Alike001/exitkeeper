import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  decisionSnapshots,
  keeperhubExecutions,
  lidoRequests,
  lifecycleEvents,
  withdrawalJobs,
} from "@/lib/db/schema";
import {
  type KeeperHubExecutionReceipt,
  keeperHubClientFromEnvironment,
} from "@/lib/server/keeperhub-client";
import { wayfinderClientFromEnvironment } from "@/lib/server/wayfinder-client";
import { selectObservedRequest } from "@/lib/wayfinder-observation";
import {
  HOODI_CHAIN_ID,
  parseEthAmountToWei,
  type WithdrawalAsset,
} from "@/lib/withdrawals";
import {
  buildApprovalWorkflow,
  buildClaimWorkflow,
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
  let baselineRequestIds: string[] = [];
  try {
    const accountState =
      await wayfinderClientFromEnvironment().getAccountState(ownerAddress);
    baselineRequestIds = accountState.withdrawals?.request_ids ?? [];
  } catch {
    baselineRequestIds = [];
  }
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
        baselineRequestIds,
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

    let receipt: KeeperHubExecutionReceipt;
    try {
      receipt = await keeperHub.waitForExecution(accepted.executionId);
    } catch (error) {
      await db
        .update(keeperhubExecutions)
        .set({ status: "uncertain", updatedAt: new Date() })
        .where(eq(keeperhubExecutions.id, execution.id));
      throw error;
    }
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

function baselineIdsFromSnapshots(
  snapshots: { decision: Record<string, unknown> }[],
): string[] {
  for (const snapshot of snapshots) {
    const value = snapshot.decision.baselineRequestIds;
    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "string")
    ) {
      return value;
    }
  }
  return [];
}

export async function observeWithdrawalJob(jobId: string) {
  const [job] = await db
    .select()
    .from(withdrawalJobs)
    .where(eq(withdrawalJobs.id, jobId));
  if (!job) {
    throw new Error("Withdrawal job was not found");
  }
  if (
    job.status !== "request-confirmed" &&
    job.status !== "waiting-finalization" &&
    job.status !== "claimable" &&
    job.status !== "claim-submitted"
  ) {
    throw new Error("Only a confirmed Lido request can be observed");
  }

  const snapshots = await db
    .select({ decision: decisionSnapshots.decision })
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.jobId, jobId))
    .orderBy(desc(decisionSnapshots.createdAt));
  const wayfinder = wayfinderClientFromEnvironment();
  const accountState = await wayfinder.getAccountState(job.ownerAddress);
  const withdrawals = accountState.withdrawals;
  const observed = selectObservedRequest({
    asset: job.asset,
    amountWei: job.amountWei,
    ownerAddress: job.ownerAddress,
    createdAt: job.createdAt,
    baselineRequestIds: baselineIdsFromSnapshots(snapshots),
    statuses: withdrawals?.statuses ?? [],
  });

  const verifiedObservation = observed
    ? await wayfinder.getRequestStatus([observed.request_id])
    : null;
  const verified = verifiedObservation?.statuses[0] ?? observed;
  const checkpointHint = verifiedObservation?.checkpointHints[0];
  const claimableWei = observed
    ? withdrawals?.claimable_ether_by_id?.[observed.request_id]
    : undefined;
  const observedStatus = verified?.is_claimed
    ? "claimed"
    : verified?.is_finalized &&
        checkpointHint &&
        BigInt(claimableWei ?? "0") > 0
      ? "claimable"
      : "waiting-finalization";
  const nextStatus =
    job.status === "claim-submitted" && observedStatus !== "claimed"
      ? "claim-submitted"
      : observedStatus;

  await db.transaction(async (tx) => {
    if (verified) {
      await tx
        .insert(lidoRequests)
        .values({
          requestId: BigInt(verified.request_id),
          jobId,
          amountOfStEth: verified.amount_of_steth,
          amountOfShares: verified.amount_of_shares,
          ownerAddress: verified.owner.toLowerCase(),
          requestedAt: new Date(Number(verified.timestamp) * 1000),
          isFinalized: verified.is_finalized,
          isClaimed: verified.is_claimed,
          checkpointHint: checkpointHint ? BigInt(checkpointHint) : null,
          claimableWei: claimableWei ?? null,
          lastObservedBlock: BigInt(
            verifiedObservation?.observedBlock ?? accountState.observed_block,
          ),
          lastObservedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: lidoRequests.requestId,
          set: {
            isFinalized: verified.is_finalized,
            isClaimed: verified.is_claimed,
            checkpointHint: checkpointHint ? BigInt(checkpointHint) : null,
            claimableWei: claimableWei ?? null,
            lastObservedBlock: BigInt(
              verifiedObservation?.observedBlock ?? accountState.observed_block,
            ),
            lastObservedAt: new Date(),
            updatedAt: new Date(),
          },
        });
    }

    await tx
      .update(withdrawalJobs)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(withdrawalJobs.id, jobId));
    await tx.insert(decisionSnapshots).values({
      jobId,
      action: "NO_ACTION",
      observedBlock: BigInt(
        verifiedObservation?.observedBlock ?? accountState.observed_block,
      ),
      observedAt: new Date(),
      workflowFingerprint:
        snapshots[0]?.decision.requestFingerprint?.toString() ??
        "observation-only",
      decision: {
        source: "wayfinder",
        observedBlock:
          verifiedObservation?.observedBlock ?? accountState.observed_block,
        requestId: verified?.request_id ?? null,
        isFinalized: verified?.is_finalized ?? false,
        isClaimed: verified?.is_claimed ?? false,
        checkpointHint: checkpointHint ?? null,
        claimableWei: claimableWei ?? null,
      },
    });
    await tx.insert(lifecycleEvents).values({
      jobId,
      fromStatus: job.status,
      toStatus: nextStatus,
      source: "wayfinder",
      summary: verified
        ? `Wayfinder verified Lido request ${verified.request_id} as ${nextStatus.replaceAll("-", " ")}.`
        : "Wayfinder is monitoring for the new Lido request ID.",
      evidence: {
        requestId: verified?.request_id ?? null,
        checkpointHint: checkpointHint ?? null,
        claimableWei: claimableWei ?? null,
      },
    });
  });

  return {
    status: nextStatus,
    requestId: verified?.request_id ?? null,
    checkpointHint: checkpointHint ?? null,
    claimableWei: claimableWei ?? null,
  };
}

export async function reviewClaimWorkflow(jobId: string) {
  const [job] = await db
    .select()
    .from(withdrawalJobs)
    .where(eq(withdrawalJobs.id, jobId));
  if (!job || job.status !== "claimable") {
    throw new Error("Only a Wayfinder-verified claimable job can be reviewed");
  }

  const requests = await db
    .select()
    .from(lidoRequests)
    .where(eq(lidoRequests.jobId, jobId));
  const claimable = requests.filter(
    (request) =>
      request.isFinalized &&
      !request.isClaimed &&
      request.checkpointHint !== null &&
      BigInt(request.claimableWei ?? "0") > 0,
  );
  if (claimable.length === 0 || claimable.length !== requests.length) {
    throw new Error("Every Lido request must be finalized and claimable");
  }

  const workflow = buildClaimWorkflow({
    jobReference: job.reference,
    requestIds: claimable.map((request) => request.requestId.toString()),
    checkpointHints: claimable.map((request) =>
      request.checkpointHint?.toString(),
    ) as string[],
    ownerAddress: job.ownerAddress,
  });
  const fingerprint = await fingerprintWorkflow(workflow);
  const keeperHub = keeperHubClientFromEnvironment();
  const created = await keeperHub.createWorkflow(workflow);
  const workflowId = created.id as string;
  const simulation = await keeperHub.simulateWorkflow(workflowId);

  await db.transaction(async (tx) => {
    await tx.insert(decisionSnapshots).values({
      jobId,
      action: "CLAIM_OWNER",
      observedBlock: claimable.reduce(
        (highest, request) =>
          request.lastObservedBlock && request.lastObservedBlock > highest
            ? request.lastObservedBlock
            : highest,
        BigInt(0),
      ),
      observedAt: new Date(),
      workflowFingerprint: fingerprint,
      decision: {
        ownerAddress: job.ownerAddress,
        requestIds: claimable.map((request) => request.requestId.toString()),
        checkpointHints: claimable.map((request) =>
          request.checkpointHint?.toString(),
        ),
        workflow,
      },
    });
    await tx.insert(keeperhubExecutions).values({
      jobId,
      stage: "claim",
      idempotencyKey: `${job.reference}:claim`,
      workflowId,
      workflowFingerprint: fingerprint,
      status: "prepared",
      inputSnapshot: { workflow },
      responseSnapshot: { workflow: created, simulation },
    });
    await tx.insert(lifecycleEvents).values({
      jobId,
      fromStatus: "claimable",
      toStatus: "claimable",
      source: "keeperhub",
      summary:
        "The owner-only claim workflow was created and dry-run by KeeperHub.",
      evidence: { workflowId, workflowFingerprint: fingerprint },
    });
  });

  return { workflow: created, simulation, fingerprint };
}

export async function executeReviewedClaim(jobId: string) {
  const [job] = await db
    .select()
    .from(withdrawalJobs)
    .where(eq(withdrawalJobs.id, jobId));
  if (!job || job.status !== "claimable") {
    throw new Error("Only a claimable job can execute its reviewed claim");
  }
  const [execution] = await db
    .select()
    .from(keeperhubExecutions)
    .where(
      and(
        eq(keeperhubExecutions.jobId, jobId),
        eq(keeperhubExecutions.stage, "claim"),
      ),
    );
  if (!execution || execution.status !== "prepared") {
    throw new Error("A prepared KeeperHub claim workflow was not found");
  }

  const keeperHub = keeperHubClientFromEnvironment();
  let acceptedExecutionId: string | null = null;
  let terminalFailure = false;
  try {
    const accepted = await keeperHub.executeWorkflow(
      execution.workflowId,
      execution.idempotencyKey,
    );
    acceptedExecutionId = accepted.executionId;
    await db.transaction(async (tx) => {
      await tx
        .update(keeperhubExecutions)
        .set({
          keeperhubExecutionId: accepted.executionId,
          status: "accepted",
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(keeperhubExecutions.id, execution.id));
      await tx
        .update(withdrawalJobs)
        .set({ status: "claim-submitted", updatedAt: new Date() })
        .where(eq(withdrawalJobs.id, jobId));
    });

    const receipt = await keeperHub.waitForExecution(accepted.executionId);
    const succeeded = receipt.completed && receipt.error == null;
    await db.transaction(async (tx) => {
      await tx
        .update(keeperhubExecutions)
        .set({
          status: succeeded ? "succeeded" : "failed",
          responseSnapshot: { accepted, receipt },
          transactionHashes: receipt.transactionHashes.map((item) => item.hash),
          completedAt: receipt.completed ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(keeperhubExecutions.id, execution.id));
      await tx.insert(lifecycleEvents).values({
        jobId,
        fromStatus: "claimable",
        toStatus: succeeded ? "claim-submitted" : "attention-required",
        source: "keeperhub",
        summary: succeeded
          ? "KeeperHub executed the reviewed owner-only claim; Wayfinder verification is pending."
          : "KeeperHub did not complete the reviewed claim successfully.",
        evidence: {
          executionId: accepted.executionId,
          transactionHashes: receipt.transactionHashes.map((item) => item.hash),
        },
      });
      if (!succeeded) {
        await tx
          .update(withdrawalJobs)
          .set({ status: "attention-required", updatedAt: new Date() })
          .where(eq(withdrawalJobs.id, jobId));
      }
    });
    if (!succeeded) {
      terminalFailure = true;
      throw new Error("Claim workflow did not complete successfully");
    }
    return { receipt };
  } catch (error) {
    if (acceptedExecutionId && !terminalFailure) {
      await db
        .update(keeperhubExecutions)
        .set({ status: "uncertain", updatedAt: new Date() })
        .where(eq(keeperhubExecutions.id, execution.id));
    }
    await db
      .update(withdrawalJobs)
      .set({ status: "attention-required", updatedAt: new Date() })
      .where(eq(withdrawalJobs.id, jobId));
    throw error;
  }
}
