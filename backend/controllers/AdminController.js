/* ══════════════════════════════════════════════════════════
   AdminController — the Configurator.

   Everything an administrator should be able to change without a developer:
   who has an account, what role they hold, and what that role may do.

   The guards below are the substance of this file. A permissions editor
   with no guards is a way to lock a company out of its own installation,
   and the recovery path from that is a database console — which most SMEs
   do not have. So every destructive edit is checked against the question
   "could this leave nobody able to undo it?"

     · Administrator's grants cannot be edited, and can() short-circuits it
       in code rather than reading the table. It is the recovery path.
     · You cannot change your own role or deactivate yourself. The classic
       way to lock yourself out is one careless click on your own row.
     · The last active Administrator cannot be demoted or deactivated.
     · System roles cannot be deleted; code and documentation name them.
     · A role with users assigned cannot be deleted until they are moved.

   Every change is written to role_change_log. "Who widened this, and when"
   is the first question asked after someone sees something they shouldn't.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const R = require('../shared/roles');

const SYSTEM_IMMUTABLE = 'Administrator';

/* Reload the in-memory overlay after any write, so the next request is
   judged by the new rules rather than the ones the process booted with. */
async function refresh() { await R.loadRoles(db); }

async function log(req, role, action, detail) {
  try {
    await db.query(
      `INSERT INTO role_change_log (actor_id, actor_email, role, action, detail)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.user?.id || null, req.user?.email || null, role, action, detail ? JSON.stringify(detail) : null]
    );
  } catch { /* logging must never block the operation it records */ }
}

/* ── Catalogue: what CAN be granted ──────────────────────────
   Comes from code, not the database. A role may only be granted a resource
   the product actually routes — an admin cannot invent a permission for
   something that does not exist. */
exports.catalogue = async (req, res) => {
  const groups = {
    Sales: ['customers', 'customer-orders', 'sales-quotations', 'sales-invoices', 'delivery-challans'],
    Procurement: ['vendors', 'vendor-items', 'po', 'po-approval', 'indent', 'quotations', 'raw-materials'],
    Inventory: ['inventory', 'skus', 'material-requirements'],
    Production: ['production', 'work-orders', 'projects', 'milestones', 'boq', 'mb'],
    Finance: ['bills', 'grn-bills', 'payables', 'credit-debit-notes', 'recurring'],
    Administration: ['users', 'company-profile', 'automation-settings'],
  };
  res.json({
    actions: R.ALL,
    resources: R.RESOURCES,
    groups,
    alwaysReadable: R.COMMON_READ,
    immutableRole: SYSTEM_IMMUTABLE,
  });
};

/* ── Roles ───────────────────────────────────────────────── */
exports.listRoles = async (req, res) => {
  try {
    const defs = await db.query(
      `SELECT rd.role, rd.label, rd.description, rd.is_system, rd.cross_tenant, rd.sort_order,
              (SELECT COUNT(*)::int FROM users u WHERE u.role = rd.role) AS user_count
       FROM role_definitions rd ORDER BY rd.sort_order, rd.role`
    );
    const perms = await db.query('SELECT role, resource, actions FROM role_permissions');
    const byRole = {};
    for (const p of perms.rows) (byRole[p.role] ||= {})[p.resource] = p.actions || [];

    /* Legacy role strings still sitting on user rows. Surfacing the count
       matters: those users are being judged by the LEGACY mapping, not by a
       role anyone chose for them, and an admin should be able to see that
       and fix it rather than discover it through a support ticket. */
    const legacy = await db.query(
      `SELECT role, COUNT(*)::int n FROM users
       WHERE role IS NOT NULL AND role NOT IN (SELECT role FROM role_definitions)
       GROUP BY role`
    );

    res.json({
      roles: defs.rows.map(r => ({
        role: r.role,
        label: r.label,
        description: r.description,
        isSystem: r.is_system,
        crossTenant: r.cross_tenant,
        userCount: r.user_count,
        editable: r.role !== SYSTEM_IMMUTABLE,
        deletable: !r.is_system && r.user_count === 0,
        permissions: byRole[r.role] || {},
      })),
      legacyRolesInUse: legacy.rows.map(l => ({
        role: l.role, users: l.n, mapsTo: R.normaliseRole(l.role),
      })),
      source: R.overlayLoaded() ? 'database' : 'code defaults',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.updateRole = async (req, res) => {
  const role = req.params.role;
  const { permissions, label, description } = req.body || {};
  try {
    const def = (await db.query('SELECT * FROM role_definitions WHERE role = $1', [role])).rows[0];
    if (!def) return res.status(404).json({ error: 'Role not found' });

    if (role === SYSTEM_IMMUTABLE) {
      return res.status(400).json({
        error: 'Administrator cannot be edited',
        detail: 'It is the recovery path — if a permission change goes wrong, someone must still be able to sign in and undo it.',
      });
    }

    /* Editing the role you currently hold is how an admin removes their own
       access mid-session and cannot get it back. */
    if (R.normaliseRole(req.user?.role) === role) {
      return res.status(400).json({
        error: 'You cannot edit the role you are currently signed in with',
        detail: 'Ask another administrator, or switch your own account to a different role first.',
      });
    }

    const before = (await db.query('SELECT resource, actions FROM role_permissions WHERE role = $1', [role])).rows;

    if (permissions && typeof permissions === 'object') {
      const validResources = new Set(Object.keys(R.RESOURCES));
      const validActions = new Set(R.ALL);
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM role_permissions WHERE role = $1', [role]);
        for (const [resource, actions] of Object.entries(permissions)) {
          // Silently ignoring an unknown resource would let a typo look like
          // a saved permission, so reject instead.
          if (!validResources.has(resource)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Unknown resource: ${resource}` });
          }
          const clean = (Array.isArray(actions) ? actions : []).filter(a => validActions.has(a));
          if (!clean.length) continue;
          await client.query(
            'INSERT INTO role_permissions (role, resource, actions) VALUES ($1,$2,$3)',
            [role, resource, clean]
          );
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    }

    if (label || description !== undefined) {
      await db.query(
        `UPDATE role_definitions SET label = COALESCE($1,label),
           description = COALESCE($2,description), updated_at = NOW() WHERE role = $3`,
        [label || null, description ?? null, role]
      );
    }

    await refresh();
    await log(req, role, 'updated', { before, after: permissions });
    res.json({ success: true, role, source: R.overlayLoaded() ? 'database' : 'code defaults' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.createRole = async (req, res) => {
  const { role, label, description, permissions, copyFrom } = req.body || {};
  if (!role || !/^[A-Za-z][A-Za-z0-9 _-]{1,38}$/.test(role)) {
    return res.status(400).json({ error: 'Role name must be 2–39 characters, starting with a letter' });
  }
  try {
    const exists = (await db.query('SELECT 1 FROM role_definitions WHERE role = $1', [role])).rowCount;
    if (exists) return res.status(409).json({ error: `Role "${role}" already exists` });

    await db.query(
      `INSERT INTO role_definitions (role, label, description, is_system, cross_tenant, sort_order)
       VALUES ($1,$2,$3,FALSE,FALSE,$4)`,
      [role, label || role, description || null, 200]
    );

    /* Starting from an existing role beats starting from nothing: a blank
       role can do literally nothing, and the person creating it usually
       means "like Sales, but also X". */
    let grants = permissions;
    if (!grants && copyFrom) {
      const src = (await db.query('SELECT resource, actions FROM role_permissions WHERE role = $1', [copyFrom])).rows;
      grants = Object.fromEntries(src.map(r => [r.resource, r.actions]));
    }
    const validResources = new Set(Object.keys(R.RESOURCES));
    const validActions = new Set(R.ALL);
    for (const [resource, actions] of Object.entries(grants || {})) {
      if (!validResources.has(resource)) continue;
      const clean = (Array.isArray(actions) ? actions : []).filter(a => validActions.has(a));
      if (!clean.length) continue;
      await db.query('INSERT INTO role_permissions (role, resource, actions) VALUES ($1,$2,$3)', [role, resource, clean]);
    }

    await refresh();
    await log(req, role, 'created', { copyFrom: copyFrom || null });
    res.json({ success: true, role });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.deleteRole = async (req, res) => {
  const role = req.params.role;
  try {
    const def = (await db.query('SELECT * FROM role_definitions WHERE role = $1', [role])).rows[0];
    if (!def) return res.status(404).json({ error: 'Role not found' });
    if (def.is_system) {
      return res.status(400).json({
        error: `"${role}" is a built-in role and cannot be deleted`,
        detail: 'Built-in roles are referenced by name in code and documentation. Edit its permissions instead.',
      });
    }
    const users = (await db.query('SELECT COUNT(*)::int n FROM users WHERE role = $1', [role])).rows[0].n;
    if (users > 0) {
      return res.status(400).json({
        error: `${users} user${users === 1 ? ' is' : 's are'} still assigned to "${role}"`,
        detail: 'Move them to another role first — deleting would silently drop them to the fallback role.',
        userCount: users,
      });
    }
    await db.query('DELETE FROM role_definitions WHERE role = $1', [role]);   // cascades to permissions
    await refresh();
    await log(req, role, 'deleted', null);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── Users ───────────────────────────────────────────────── */
exports.listUsers = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.last_login,
              rd.label AS role_label, rd.role IS NULL AS role_is_legacy
       FROM users u LEFT JOIN role_definitions rd ON rd.role = u.role
       ORDER BY u.id`
    );
    res.json({
      users: rows.map(u => ({
        ...u,
        // What their stored role actually resolves to at request time.
        effectiveRole: R.normaliseRole(u.role),
        isSelf: u.id === req.user?.id,
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.setUserRole = async (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body || {};
  try {
    const user = (await db.query('SELECT id, email, role, is_active FROM users WHERE id = $1', [id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (id === req.user?.id) {
      return res.status(400).json({
        error: 'You cannot change your own role',
        detail: 'Ask another administrator. This guard exists because changing your own role is the quickest way to lose access with no way back.',
      });
    }

    const def = (await db.query('SELECT role FROM role_definitions WHERE role = $1', [role])).rows[0];
    if (!def) return res.status(400).json({ error: `Unknown role: ${role}` });

    // Never leave the installation without an administrator.
    if (R.normaliseRole(user.role) === 'Administrator' && role !== 'Administrator') {
      const others = (await db.query(
        `SELECT COUNT(*)::int n FROM users WHERE role = 'Administrator' AND is_active = TRUE AND id <> $1`, [id]
      )).rows[0].n;
      if (others === 0) {
        return res.status(400).json({
          error: 'This is the last active administrator',
          detail: 'Promote someone else first, or nobody will be able to administer this installation.',
        });
      }
    }

    await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    await log(req, role, 'assigned', { userId: id, email: user.email, from: user.role, to: role });
    res.json({ success: true, id, role });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.setUserActive = async (req, res) => {
  const id = Number(req.params.id);
  const active = req.body?.isActive !== false;
  try {
    const user = (await db.query('SELECT id, email, role, is_active FROM users WHERE id = $1', [id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (id === req.user?.id) {
      return res.status(400).json({
        error: 'You cannot deactivate your own account',
        detail: 'You would be signed out with no way to sign back in.',
      });
    }
    if (!active && R.normaliseRole(user.role) === 'Administrator') {
      const others = (await db.query(
        `SELECT COUNT(*)::int n FROM users WHERE role = 'Administrator' AND is_active = TRUE AND id <> $1`, [id]
      )).rows[0].n;
      if (others === 0) {
        return res.status(400).json({ error: 'This is the last active administrator' });
      }
    }

    await db.query('UPDATE users SET is_active = $1 WHERE id = $2', [active, id]);
    await log(req, user.role, active ? 'activated' : 'deactivated', { userId: id, email: user.email });
    res.json({ success: true, id, isActive: active });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── Audit ───────────────────────────────────────────────── */
exports.auditLog = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, actor_email, role, action, detail, created_at
       FROM role_change_log ORDER BY id DESC LIMIT 100`
    );
    res.json({ entries: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── Health: does the UI agree with the server? ───────────── */
exports.rolesHealth = async (req, res) => {
  try {
    const issues = [];
    const admins = (await db.query(
      `SELECT COUNT(*)::int n FROM users WHERE role = 'Administrator' AND is_active = TRUE`
    )).rows[0].n;
    if (admins === 0) issues.push('No active Administrator — nobody can administer this installation.');

    const legacy = (await db.query(
      `SELECT role, COUNT(*)::int n FROM users
       WHERE role IS NOT NULL AND role NOT IN (SELECT role FROM role_definitions) GROUP BY role`
    )).rows;
    for (const l of legacy) {
      issues.push(`${l.n} user(s) still hold the legacy role "${l.role}" — treated as "${R.normaliseRole(l.role)}".`);
    }

    const orphan = (await db.query(
      `SELECT DISTINCT resource FROM role_permissions WHERE resource <> ALL($1)`,
      [Object.keys(R.RESOURCES)]
    )).rows;
    for (const o of orphan) {
      issues.push(`Permission row references unknown resource "${o.resource}" — it grants nothing.`);
    }

    res.json({
      source: R.overlayLoaded() ? 'database' : 'code defaults',
      activeAdministrators: admins,
      issues,
      healthy: issues.length === 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
