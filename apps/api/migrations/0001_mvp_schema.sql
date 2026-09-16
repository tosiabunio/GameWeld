-- GameWeld MVP schema. Specification v0.2 Section 5; implementation plan Section 4.1.
-- Every invariant that a database constraint can express is expressed here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Identity and sessions -------------------------------------------------------

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  text NOT NULL,
  email         text,
  is_admin      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1
);

-- An identity is (provider, subject). The mock provider and future OIDC providers share this table (T1).
CREATE TABLE identities (
  provider    text NOT NULL,
  subject     text NOT NULL,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user_idx ON identities (user_id);

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Projects and membership -------------------------------------------------------

CREATE TABLE projects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text NOT NULL DEFAULT '',
  done_restricted  boolean NOT NULL DEFAULT false,
  scope_limit      integer NOT NULL DEFAULT 5 CHECK (scope_limit >= 1),
  archived_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  version          integer NOT NULL DEFAULT 1
);

CREATE TYPE project_role AS ENUM ('director', 'developer', 'tester');

-- D10: no Team entity in the MVP; access is per-project membership with one or more roles.
CREATE TABLE project_memberships (
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  roles       project_role[] NOT NULL CHECK (cardinality(roles) >= 1),
  can_accept  boolean NOT NULL DEFAULT false,   -- D5: explicit acceptance permission
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_memberships_user_idx ON project_memberships (user_id);

-- Backlog -----------------------------------------------------------------------

CREATE TYPE moscow_category AS ENUM ('must', 'should', 'could', 'wont');
CREATE TYPE item_state AS ENUM ('open', 'ready_for_review', 'done');

CREATE TABLE backlog_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  category     moscow_category NOT NULL,          -- stored separately from state (Section 6)
  rank         text NOT NULL,                     -- fractional index within category
  state        item_state NOT NULL DEFAULT 'open',
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      integer NOT NULL DEFAULT 1
);
CREATE INDEX backlog_items_project_category_rank_idx ON backlog_items (project_id, category, rank);

-- D4: acceptance history. The current acceptance is the row with invalidated_at IS NULL.
CREATE TABLE acceptances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid NOT NULL REFERENCES backlog_items (id) ON DELETE CASCADE,
  accepted_by     uuid NOT NULL REFERENCES users (id),
  accepted_at     timestamptz NOT NULL DEFAULT now(),
  note            text NOT NULL DEFAULT '',
  invalidated_at  timestamptz,
  invalidated_reason text
);
CREATE UNIQUE INDEX acceptances_one_current ON acceptances (item_id) WHERE invalidated_at IS NULL;

-- D9: informational item-to-item links only.
CREATE TABLE item_dependencies (
  item_id             uuid NOT NULL REFERENCES backlog_items (id) ON DELETE CASCADE,
  depends_on_item_id  uuid NOT NULL REFERENCES backlog_items (id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, depends_on_item_id),
  CHECK (item_id <> depends_on_item_id)
);

-- Tasks -------------------------------------------------------------------------

CREATE TYPE task_category AS ENUM ('code', 'assets', 'content');

CREATE TABLE tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES backlog_items (id),   -- invariant 1: exactly one parent, never null
  category      task_category NOT NULL,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  assignee_id   uuid REFERENCES users (id),
  -- R1: completion is an explicit task state, set on entering Done and cleared on leaving it.
  completed     boolean NOT NULL DEFAULT false,
  completed_at  timestamptz,
  completed_by  uuid REFERENCES users (id),
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1,
  CHECK ((completed AND completed_at IS NOT NULL) OR (NOT completed AND completed_at IS NULL))
);
CREATE INDEX tasks_item_idx ON tasks (item_id);
CREATE INDEX tasks_project_idx ON tasks (project_id);

-- Workboards --------------------------------------------------------------------

CREATE TYPE board_state AS ENUM ('active', 'archived');

CREATE TABLE workboards (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  state        board_state NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz,
  version      integer NOT NULL DEFAULT 1
);
-- D1: one active Workboard per project in the MVP. The model allows several once this index is dropped.
CREATE UNIQUE INDEX workboards_one_active_per_project ON workboards (project_id) WHERE state = 'active';

CREATE TYPE column_kind AS ENUM ('todo_code', 'todo_assets', 'todo_content', 'intermediate', 'done');

CREATE TABLE board_columns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    uuid NOT NULL REFERENCES workboards (id) ON DELETE CASCADE,
  name        text NOT NULL,
  kind        column_kind NOT NULL DEFAULT 'intermediate',
  rank        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  version     integer NOT NULL DEFAULT 1
);
-- Exactly one column of each system kind per board (Section 8 structure; invariant 10).
CREATE UNIQUE INDEX board_columns_one_per_system_kind ON board_columns (board_id, kind) WHERE kind <> 'intermediate';
CREATE INDEX board_columns_board_rank_idx ON board_columns (board_id, rank);

-- Scope membership is independent of task placement (Section 5).
CREATE TABLE workboard_scope (
  board_id  uuid NOT NULL REFERENCES workboards (id) ON DELETE CASCADE,
  item_id   uuid NOT NULL REFERENCES backlog_items (id) ON DELETE CASCADE,
  added_at  timestamptz NOT NULL DEFAULT now(),
  added_by  uuid REFERENCES users (id),
  PRIMARY KEY (board_id, item_id)
);

CREATE TABLE task_placements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  board_id        uuid NOT NULL REFERENCES workboards (id) ON DELETE CASCADE,
  column_id       uuid NOT NULL REFERENCES board_columns (id),
  rank            text NOT NULL,
  is_current      boolean NOT NULL DEFAULT true,
  entered_as_exception boolean NOT NULL DEFAULT false,  -- Section 9: how the task originally entered
  placed_at       timestamptz NOT NULL DEFAULT now(),
  placed_by       uuid REFERENCES users (id),
  removed_at      timestamptz,
  removed_reason  text,
  last_column_id  uuid REFERENCES board_columns (id),   -- R5: column at removal, for history
  CHECK ((is_current AND removed_at IS NULL) OR (NOT is_current AND removed_at IS NOT NULL))
);
-- Invariant 2: at most one current placement per task.
CREATE UNIQUE INDEX task_placements_one_current ON task_placements (task_id) WHERE is_current;
CREATE INDEX task_placements_board_column_idx ON task_placements (board_id, column_id, rank) WHERE is_current;

-- Out-of-scope work requests (Section 9, D2) --------------------------------------

CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

CREATE TABLE work_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  board_id       uuid NOT NULL REFERENCES workboards (id) ON DELETE CASCADE,
  requester_id   uuid NOT NULL REFERENCES users (id),
  reason         text NOT NULL DEFAULT '',
  status         request_status NOT NULL DEFAULT 'pending',
  decided_by     uuid REFERENCES users (id),
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX work_requests_one_pending ON work_requests (task_id, board_id) WHERE status = 'pending';
CREATE INDEX work_requests_board_status_idx ON work_requests (board_id, status);

-- Collaboration -----------------------------------------------------------------

CREATE TABLE comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  task_id     uuid REFERENCES tasks (id) ON DELETE CASCADE,
  item_id     uuid REFERENCES backlog_items (id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES users (id),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(task_id, item_id) = 1)
);
CREATE INDEX comments_task_idx ON comments (task_id);
CREATE INDEX comments_item_idx ON comments (item_id);

CREATE TABLE attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  task_id       uuid REFERENCES tasks (id) ON DELETE CASCADE,
  item_id       uuid REFERENCES backlog_items (id) ON DELETE CASCADE,
  uploaded_by   uuid NOT NULL REFERENCES users (id),
  file_name     text NOT NULL,
  content_type  text NOT NULL,
  size_bytes    bigint NOT NULL CHECK (size_bytes >= 0),
  storage_key   text NOT NULL UNIQUE,   -- T2: key into the storage interface
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(task_id, item_id) = 1)
);
CREATE INDEX attachments_task_idx ON attachments (task_id);
CREATE INDEX attachments_item_idx ON attachments (item_id);

ALTER TABLE backlog_items
  ADD COLUMN cover_attachment_id uuid REFERENCES attachments (id) ON DELETE SET NULL;

CREATE TABLE links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  task_id     uuid REFERENCES tasks (id) ON DELETE CASCADE,
  item_id     uuid REFERENCES backlog_items (id) ON DELETE CASCADE,
  url         text NOT NULL,
  label       text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES users (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(task_id, item_id) = 1)
);

-- Activity history (Section 14) -------------------------------------------------

CREATE TABLE activity (
  id           bigserial PRIMARY KEY,
  project_id   uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES users (id),
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  previous     jsonb,
  next         jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_project_created_idx ON activity (project_id, created_at DESC);
CREATE INDEX activity_entity_idx ON activity (entity_type, entity_id, created_at DESC);
