-- Sessions past their time are deleted on a schedule (auth.ts), which looks them up by when they
-- end. Until now they were only removed by signing out, so the table kept every session ever
-- started.
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
