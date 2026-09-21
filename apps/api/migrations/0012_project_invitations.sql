-- Invitations (T1). Access is by invitation only: a Game Director invites an e-mail address to a
-- project, and the first sign-in whose provider has verified that address turns every pending
-- invitation for it into a membership. Someone who has already signed in is added at once and
-- never has an invitation. Addresses are kept lower-cased; nothing else about them is altered.
CREATE TABLE project_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  email       text NOT NULL CHECK (email = lower(email)),
  roles       project_role[] NOT NULL CHECK (cardinality(roles) >= 1),
  can_accept  boolean NOT NULL DEFAULT false,
  invited_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, email)
);
CREATE INDEX project_invitations_email_idx ON project_invitations (email);
