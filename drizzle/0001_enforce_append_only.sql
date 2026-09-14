CREATE FUNCTION reject_exitkeeper_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER decision_snapshots_append_only
BEFORE UPDATE OR DELETE ON decision_snapshots
FOR EACH ROW
EXECUTE FUNCTION reject_exitkeeper_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER lifecycle_events_append_only
BEFORE UPDATE OR DELETE ON lifecycle_events
FOR EACH ROW
EXECUTE FUNCTION reject_exitkeeper_append_only_mutation();
