\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
	job_id uuid;
	decision_id uuid;
	event_id uuid;
	decision_update_blocked boolean := false;
	event_delete_blocked boolean := false;
BEGIN
	INSERT INTO withdrawal_jobs (
		reference,
		asset,
		amount_wei,
		owner_address
	)
	VALUES (
		'EK-INVARIANT-TEST',
		'stETH',
		'100000000000000000',
		'0x0000000000000000000000000000000000000001'
	)
	RETURNING id INTO job_id;

	INSERT INTO decision_snapshots (
		job_id,
		action,
		observed_block,
		observed_at,
		workflow_fingerprint,
		decision
	)
	VALUES (
		job_id,
		'REQUEST_STETH',
		1,
		now(),
		'sha256:test',
		'{}'::jsonb
	)
	RETURNING id INTO decision_id;

	INSERT INTO lifecycle_events (
		job_id,
		to_status,
		source,
		summary,
		evidence
	)
	VALUES (
		job_id,
		'review-required',
		'system',
		'Invariant test',
		'{}'::jsonb
	)
	RETURNING id INTO event_id;

	BEGIN
		UPDATE decision_snapshots
		SET workflow_fingerprint = 'sha256:changed'
		WHERE id = decision_id;
	EXCEPTION
		WHEN raise_exception THEN
			decision_update_blocked := true;
	END;

	BEGIN
		DELETE FROM lifecycle_events WHERE id = event_id;
	EXCEPTION
		WHEN raise_exception THEN
			event_delete_blocked := true;
	END;

	IF NOT decision_update_blocked THEN
		RAISE EXCEPTION 'decision_snapshots accepted an update';
	END IF;

	IF NOT event_delete_blocked THEN
		RAISE EXCEPTION 'lifecycle_events accepted a delete';
	END IF;
END;
$$;

ROLLBACK;
