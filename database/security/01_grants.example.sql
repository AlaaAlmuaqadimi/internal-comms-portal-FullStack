-- ============================================================================
-- Least-privilege MySQL accounts - TEMPLATE
-- Run as an administrator OUTSIDE Flyway. Replace CHANGE_ME at deploy time.
-- Never commit real passwords. Prefer a secret manager + ALTER USER at deploy.
-- ============================================================================

-- Application runtime account: DML only, no DDL, TLS required.
CREATE USER IF NOT EXISTS 'app_rw'@'%'
  IDENTIFIED WITH caching_sha2_password BY 'CHANGE_ME';
ALTER USER 'app_rw'@'%' REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE ON internal_comms.* TO 'app_rw'@'%';

-- Migration account: schema changes only. Used by Flyway. Not by the app.
CREATE USER IF NOT EXISTS 'app_migrator'@'%'
  IDENTIFIED WITH caching_sha2_password BY 'CHANGE_ME';
ALTER USER 'app_migrator'@'%' REQUIRE SSL;
GRANT ALTER, CREATE, DROP, INDEX, REFERENCES,
      SELECT, INSERT, UPDATE, DELETE
  ON internal_comms.* TO 'app_migrator'@'%';

-- Read-only reporting/audit account (optional).
CREATE USER IF NOT EXISTS 'app_report'@'%'
  IDENTIFIED WITH caching_sha2_password BY 'CHANGE_ME';
ALTER USER 'app_report'@'%' REQUIRE SSL;
GRANT SELECT ON internal_comms.* TO 'app_report'@'%';

FLUSH PRIVILEGES;

-- Explicitly NOT granted: SUPER, FILE, PROCESS, CREATE USER, REPLICATION,
-- SHUTDOWN, and any global privileges. Keep the DB on a private network with
-- no public port; connect only over TLS from the API host.
