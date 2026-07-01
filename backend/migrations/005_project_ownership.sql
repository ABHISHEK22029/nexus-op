-- 005_project_ownership.sql — per-user workspaces
-- Each project belongs to the user who created it. Admins see everything;
-- normal users see only their own. Idempotent.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);

-- Everything built before multi-user existed belongs to the admin.
UPDATE projects
   SET owner_id = (SELECT id FROM users WHERE role = 'Admin' ORDER BY id LIMIT 1)
 WHERE owner_id IS NULL;

CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects (owner_id);
