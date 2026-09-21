-- API tokens: a member's own keys for scripts and assistants. A token acts as the member who made
-- it, under the same permissions; it can only read, or read and write. Only a hash of it is kept,
-- as for sessions: the member sees the token once, when it is made. Revoking deletes the row.
CREATE TABLE api_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  token_hash    text NOT NULL UNIQUE,
  access        text NOT NULL CHECK (access IN ('read', 'write')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  UNIQUE (user_id, name)
);

-- A change made through a token keeps the member as its actor and says which token it came
-- through, by the name the token had then: the history outlives the token.
ALTER TABLE activity ADD COLUMN via_token text;
ALTER TABLE notifications ADD COLUMN via_token text;
