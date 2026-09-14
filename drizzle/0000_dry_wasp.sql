CREATE TYPE "public"."withdrawal_asset" AS ENUM('stETH', 'wstETH');--> statement-breakpoint
CREATE TYPE "public"."decision_action" AS ENUM('REQUEST_STETH', 'REQUEST_WSTETH', 'CLAIM_OWNER', 'NO_ACTION');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_event_source" AS ENUM('operator', 'wayfinder', 'keeperhub', 'ethereum', 'system');--> statement-breakpoint
CREATE TYPE "public"."evidence_origin" AS ENUM('mainnet', 'fork', 'fixture');--> statement-breakpoint
CREATE TYPE "public"."execution_stage" AS ENUM('request', 'claim');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('prepared', 'accepted', 'running', 'succeeded', 'failed', 'uncertain');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_job_status" AS ENUM('draft', 'review-required', 'request-submitted', 'request-confirmed', 'waiting-finalization', 'claimable', 'claim-submitted', 'claimed', 'failed', 'attention-required');--> statement-breakpoint
CREATE TABLE "decision_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"action" "decision_action" NOT NULL,
	"observed_block" bigint NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"workflow_fingerprint" text NOT NULL,
	"decision" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keeperhub_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"stage" "execution_stage" NOT NULL,
	"idempotency_key" text NOT NULL,
	"workflow_id" text NOT NULL,
	"workflow_fingerprint" text NOT NULL,
	"keeperhub_execution_id" text,
	"status" "execution_status" DEFAULT 'prepared' NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"response_snapshot" jsonb,
	"transaction_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accepted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lido_requests" (
	"request_id" bigint PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"amount_of_steth" numeric(78, 0),
	"amount_of_shares" numeric(78, 0),
	"owner_address" varchar(42) NOT NULL,
	"requested_at" timestamp with time zone,
	"is_finalized" boolean DEFAULT false NOT NULL,
	"is_claimed" boolean DEFAULT false NOT NULL,
	"checkpoint_hint" bigint,
	"claimable_wei" numeric(78, 0),
	"last_observed_block" bigint,
	"last_observed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lifecycle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"from_status" "withdrawal_job_status",
	"to_status" "withdrawal_job_status" NOT NULL,
	"source" "lifecycle_event_source" NOT NULL,
	"summary" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawal_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(32) NOT NULL,
	"asset" "withdrawal_asset" NOT NULL,
	"amount_wei" numeric(78, 0) NOT NULL,
	"owner_address" varchar(42) NOT NULL,
	"chain_id" integer DEFAULT 1 NOT NULL,
	"status" "withdrawal_job_status" DEFAULT 'draft' NOT NULL,
	"evidence_origin" "evidence_origin" DEFAULT 'mainnet' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decision_snapshots" ADD CONSTRAINT "decision_snapshots_job_id_withdrawal_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."withdrawal_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keeperhub_executions" ADD CONSTRAINT "keeperhub_executions_job_id_withdrawal_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."withdrawal_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lido_requests" ADD CONSTRAINT "lido_requests_job_id_withdrawal_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."withdrawal_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_job_id_withdrawal_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."withdrawal_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decision_snapshots_job_created_idx" ON "decision_snapshots" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "keeperhub_executions_idempotency_unique" ON "keeperhub_executions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "keeperhub_executions_remote_id_unique" ON "keeperhub_executions" USING btree ("keeperhub_execution_id") WHERE "keeperhub_executions"."keeperhub_execution_id" is not null;--> statement-breakpoint
CREATE INDEX "keeperhub_executions_job_created_idx" ON "keeperhub_executions" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "lido_requests_job_idx" ON "lido_requests" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "lido_requests_owner_finalized_idx" ON "lido_requests" USING btree ("owner_address","is_finalized","is_claimed");--> statement-breakpoint
CREATE INDEX "lifecycle_events_job_created_idx" ON "lifecycle_events" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawal_jobs_reference_unique" ON "withdrawal_jobs" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "withdrawal_jobs_status_updated_idx" ON "withdrawal_jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "withdrawal_jobs_owner_created_idx" ON "withdrawal_jobs" USING btree ("owner_address","created_at");