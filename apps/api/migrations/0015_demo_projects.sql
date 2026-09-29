-- An instance can hold the demo, which anyone may enter as a persona, beside teams' own projects.
-- The two never mix: demo projects have only personas as members, team projects never have one,
-- and a demo reset replaces the demo projects and the personas alone.
ALTER TABLE projects ADD COLUMN demo boolean NOT NULL DEFAULT false;

-- Projects that so far have only personas as members are the demo's.
UPDATE projects p SET demo = true
 WHERE NOT EXISTS (
   SELECT 1 FROM project_memberships m
    WHERE m.project_id = p.id
      AND NOT EXISTS (SELECT 1 FROM identities i WHERE i.user_id = m.user_id AND i.provider = 'mock')
 );

-- Anyone may be a persona, so no persona is an admin; the initial admin can then become one.
UPDATE users SET is_admin = false
 WHERE id IN (SELECT user_id FROM identities WHERE provider = 'mock');
