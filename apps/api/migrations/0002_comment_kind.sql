-- Phase 5: acceptance rejections are ordinary comments flagged by kind (Section 11: no extra state).
ALTER TABLE comments ADD COLUMN kind text NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment', 'rejection'));
