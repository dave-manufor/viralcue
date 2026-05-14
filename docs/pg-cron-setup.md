# pg_cron Setup for ViralCue

## Overview

ViralCue uses pg_cron to automatically clean up expired streaming sessions and their associated drafts. The retention period is configurable per subscription plan.

## Retention Periods by Subscription Plan

Retention is configured in the `subscription_plans` table:

| Plan Name | `draft_retention_hours` | Notes                                  |
| --------- | ----------------------- | -------------------------------------- |
| free      | 24                      | Default for users without subscription |
| starter   | 48                      | Entry paid tier                        |
| pro       | 72                      | Professional tier                      |
| agency    | 168 (7 days)            | Enterprise tier                        |

Users without a subscription plan default to 24 hours retention.

## Cleanup Query

The cleanup uses a LEFT JOIN to handle users without subscriptions:

```sql
-- Delete drafts for expired sessions
DELETE FROM drafts
WHERE session_id IN (
  SELECT ss.id
  FROM streaming_sessions ss
  JOIN users u ON ss.user_id = u.id
  LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
  WHERE ss.ended_at IS NOT NULL
  AND ss.ended_at < NOW() - (COALESCE(sp.draft_retention_hours, 24) || ' hours')::INTERVAL
);

-- Delete expired sessions
DELETE FROM streaming_sessions ss
USING users u
LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
WHERE ss.user_id = u.id
AND ss.ended_at IS NOT NULL
AND ss.ended_at < NOW() - (COALESCE(sp.draft_retention_hours, 24) || ' hours')::INTERVAL;
```

## Production Setup

### Google Cloud SQL

1. Go to Cloud SQL instance → **Configuration** → **Database Flags**
2. Add flag: `cloudsql.enable_pg_cron` = `on`
3. Restart instance
4. Connect and run:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO viralcue_user;
```

### AWS RDS

1. Modify parameter group:
   - Add `pg_cron` to `shared_preload_libraries`
   - Set `cron.database_name` to your database name
2. Reboot instance
3. Create extension as above

### Self-Hosted PostgreSQL

Add to `postgresql.conf`:

```conf
shared_preload_libraries = 'pg_cron'
cron.database_name = 'viralcue'
```

Restart PostgreSQL, then create extension.

## Schedule the Cleanup Job

```sql
SELECT cron.schedule(
  'cleanup-expired-sessions',
  '0 * * * *',  -- Every hour at minute 0
  $$
    DELETE FROM drafts
    WHERE session_id IN (
      SELECT ss.id FROM streaming_sessions ss
      JOIN users u ON ss.user_id = u.id
      LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
      WHERE ss.ended_at IS NOT NULL
      AND ss.ended_at < NOW() - (COALESCE(sp.draft_retention_hours, 24) || ' hours')::INTERVAL
    );
    DELETE FROM streaming_sessions ss
    USING users u
    LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
    WHERE ss.user_id = u.id
    AND ss.ended_at IS NOT NULL
    AND ss.ended_at < NOW() - (COALESCE(sp.draft_retention_hours, 24) || ' hours')::INTERVAL;
  $$
);
```

## Monitor Jobs

```sql
-- View scheduled jobs
SELECT * FROM cron.job;

-- View recent runs
SELECT * FROM cron.job_run_details
ORDER BY start_time DESC LIMIT 10;

-- Check for failures
SELECT * FROM cron.job_run_details
WHERE status = 'failed'
ORDER BY start_time DESC;
```

## Batched Deletion (Large Datasets)

For tables with 100k+ rows, use batched deletion:

```sql
DO $$
DECLARE
  batch_size INT := 500;
  deleted_count INT;
BEGIN
  LOOP
    DELETE FROM drafts WHERE id IN (
      SELECT d.id FROM drafts d
      JOIN streaming_sessions ss ON d.session_id = ss.id
      JOIN users u ON ss.user_id = u.id
      LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
      WHERE ss.ended_at IS NOT NULL
      AND ss.ended_at < NOW() - (COALESCE(sp.draft_retention_hours, 24) || ' hours')::INTERVAL
      LIMIT batch_size
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    EXIT WHEN deleted_count = 0;
    COMMIT;
    PERFORM pg_sleep(0.1);
  END LOOP;
END;
$$;
```

## Troubleshooting

| Issue             | Solution                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| Job not running   | Check extension: `SELECT * FROM pg_extension WHERE extname = 'pg_cron';` |
| Permission denied | Grant usage: `GRANT USAGE ON SCHEMA cron TO your_user;`                  |
| Wrong database    | Verify `cron.database_name` matches your DB                              |
