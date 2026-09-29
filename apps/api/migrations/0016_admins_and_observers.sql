-- Observers read a project and change nothing; they hold that role alone.
ALTER TYPE project_role ADD VALUE IF NOT EXISTS 'observer';

-- Admins invite the people who may start projects of their own (the instance's Game Directors)
-- and other admins, before those people have an account.
ALTER TABLE users ADD COLUMN can_create_projects boolean NOT NULL DEFAULT false;

CREATE TABLE instance_invitations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                text NOT NULL UNIQUE CHECK (email = lower(email)),
  is_admin             boolean NOT NULL DEFAULT false,
  can_create_projects  boolean NOT NULL DEFAULT false,
  invited_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (is_admin OR can_create_projects)
);
