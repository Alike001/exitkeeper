import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const assetEnum = pgEnum("withdrawal_asset", ["stETH", "wstETH"]);

export const jobStatusEnum = pgEnum("withdrawal_job_status", [
  "draft",
  "review-required",
  "request-submitted",
  "request-confirmed",
  "waiting-finalization",
  "claimable",
  "claim-submitted",
  "claimed",
  "failed",
  "attention-required",
]);

export const decisionActionEnum = pgEnum("decision_action", [
  "REQUEST_STETH",
  "REQUEST_WSTETH",
  "CLAIM_OWNER",
  "NO_ACTION",
]);

export const executionStageEnum = pgEnum("execution_stage", [
  "approval",
  "request",
  "claim",
]);

export const executionStatusEnum = pgEnum("execution_status", [
  "prepared",
  "accepted",
  "running",
  "succeeded",
  "failed",
  "uncertain",
]);

export const evidenceOriginEnum = pgEnum("evidence_origin", [
  "testnet",
  "mainnet",
  "fork",
  "fixture",
]);

export const eventSourceEnum = pgEnum("lifecycle_event_source", [
  "operator",
  "wayfinder",
  "keeperhub",
  "ethereum",
  "system",
]);

export const withdrawalJobs = pgTable(
  "withdrawal_jobs",
  {
    id: uuid().defaultRandom().primaryKey(),
    reference: varchar({ length: 32 }).notNull(),
    asset: assetEnum().notNull(),
    amountWei: numeric("amount_wei", { precision: 78, scale: 0 }).notNull(),
    ownerAddress: varchar("owner_address", { length: 42 }).notNull(),
    chainId: integer("chain_id").default(560048).notNull(),
    status: jobStatusEnum().default("draft").notNull(),
    evidenceOrigin: evidenceOriginEnum("evidence_origin")
      .default("testnet")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("withdrawal_jobs_reference_unique").on(table.reference),
    index("withdrawal_jobs_status_updated_idx").on(
      table.status,
      table.updatedAt,
    ),
    index("withdrawal_jobs_owner_created_idx").on(
      table.ownerAddress,
      table.createdAt,
    ),
  ],
);

export const decisionSnapshots = pgTable(
  "decision_snapshots",
  {
    id: uuid().defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => withdrawalJobs.id, { onDelete: "cascade" }),
    action: decisionActionEnum().notNull(),
    observedBlock: bigint("observed_block", { mode: "bigint" }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    workflowFingerprint: text("workflow_fingerprint").notNull(),
    decision: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("decision_snapshots_job_created_idx").on(
      table.jobId,
      table.createdAt,
    ),
  ],
);

export const keeperhubExecutions = pgTable(
  "keeperhub_executions",
  {
    id: uuid().defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => withdrawalJobs.id, { onDelete: "cascade" }),
    stage: executionStageEnum().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    workflowId: text("workflow_id").notNull(),
    workflowFingerprint: text("workflow_fingerprint").notNull(),
    keeperhubExecutionId: text("keeperhub_execution_id"),
    status: executionStatusEnum().default("prepared").notNull(),
    inputSnapshot: jsonb("input_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    responseSnapshot: jsonb("response_snapshot").$type<Record<
      string,
      unknown
    > | null>(),
    transactionHashes: jsonb("transaction_hashes")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("keeperhub_executions_idempotency_unique").on(
      table.idempotencyKey,
    ),
    uniqueIndex("keeperhub_executions_remote_id_unique")
      .on(table.keeperhubExecutionId)
      .where(sql`${table.keeperhubExecutionId} is not null`),
    index("keeperhub_executions_job_created_idx").on(
      table.jobId,
      table.createdAt,
    ),
  ],
);

export const lidoRequests = pgTable(
  "lido_requests",
  {
    requestId: bigint("request_id", { mode: "bigint" }).primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => withdrawalJobs.id, { onDelete: "cascade" }),
    amountOfStEth: numeric("amount_of_steth", { precision: 78, scale: 0 }),
    amountOfShares: numeric("amount_of_shares", { precision: 78, scale: 0 }),
    ownerAddress: varchar("owner_address", { length: 42 }).notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    isFinalized: boolean("is_finalized").default(false).notNull(),
    isClaimed: boolean("is_claimed").default(false).notNull(),
    checkpointHint: bigint("checkpoint_hint", { mode: "bigint" }),
    claimableWei: numeric("claimable_wei", { precision: 78, scale: 0 }),
    lastObservedBlock: bigint("last_observed_block", { mode: "bigint" }),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("lido_requests_job_idx").on(table.jobId),
    index("lido_requests_owner_finalized_idx").on(
      table.ownerAddress,
      table.isFinalized,
      table.isClaimed,
    ),
  ],
);

export const lifecycleEvents = pgTable(
  "lifecycle_events",
  {
    id: uuid().defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => withdrawalJobs.id, { onDelete: "cascade" }),
    fromStatus: jobStatusEnum("from_status"),
    toStatus: jobStatusEnum("to_status").notNull(),
    source: eventSourceEnum().notNull(),
    summary: text().notNull(),
    evidence: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("lifecycle_events_job_created_idx").on(table.jobId, table.createdAt),
  ],
);
