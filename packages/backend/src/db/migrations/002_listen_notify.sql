-- Migration 002: Add triggers for pub/sub (Event-Driven Architecture)

-- Function to notify when jobs change
CREATE OR REPLACE FUNCTION notify_jobs_change()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('jobs_changed', '');
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for jobs table
DROP TRIGGER IF EXISTS notify_jobs_change_trigger ON jobs;
CREATE TRIGGER notify_jobs_change_trigger
  AFTER INSERT OR UPDATE ON jobs
  FOR EACH STATEMENT
  EXECUTE FUNCTION notify_jobs_change();

-- Function to notify when workers change
CREATE OR REPLACE FUNCTION notify_workers_change()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('workers_changed', '');
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for workers table
DROP TRIGGER IF EXISTS notify_workers_change_trigger ON workers;
CREATE TRIGGER notify_workers_change_trigger
  AFTER INSERT OR UPDATE ON workers
  FOR EACH STATEMENT
  EXECUTE FUNCTION notify_workers_change();
