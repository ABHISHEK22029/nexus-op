/* ══════════════════════════════════════════════════════════
   Configurator — the administrator's control panel.

   Three things an admin must be able to do without a developer:
     · PEOPLE   — who has an account, what role, active or not
     · ROLES    — what each role may actually do, as a grid you can tick
     · HISTORY  — who changed a permission, and when

   The permission grid is the heart of it. It is deliberately a grid rather
   than a list of checkboxes per role: permissions are only meaningful in
   comparison ("can Procurement do this when Finance can't?"), and a grid is
   the only layout where that comparison is one glance rather than four
   page-loads.

   Guards are surfaced in the UI, not just enforced on the server — a
   disabled control with a reason attached teaches; a 403 after clicking
   does not.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings, Users as UsersIcon, ShieldCheck, History, AlertTriangle,
  Check, X, Plus, Trash2, Save, Info, RotateCcw,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = async (path, opts = {}) => {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail ? `${body.error} — ${body.detail}` : (body.error || `Request failed (${res.status})`));
  return body;
};

const TABS = [
  { key: 'people', label: 'People', icon: UsersIcon },
  { key: 'roles', label: 'Roles & permissions', icon: ShieldCheck },
  { key: 'history', label: 'Change history', icon: History },
];

export default function Configurator() {
  const [tab, setTab] = useState('people');
  const { role } = usePermissions();

  if (role && role !== 'Administrator') {
    return (
      <Wrap>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <ShieldCheck size={28} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 6px' }}>Administrators only</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            You're signed in as <strong>{role}</strong>. The Configurator changes who can do what,
            so it's limited to administrators.
          </p>
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
          <Settings size={24} style={{ color: 'var(--brand-amber)' }} /> Configurator
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
          Accounts, roles and what each role is allowed to do.
        </p>
      </header>

      <HealthBanner />

      <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-subtle)', marginBottom: 18 }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 15px', fontSize: '0.86rem', fontWeight: 600, cursor: 'pointer',
                background: 'none', border: 'none',
                borderBottom: `2px solid ${active ? 'var(--brand-amber)' : 'transparent'}`,
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
              <t.icon size={15} /> {t.label}
            </button>
          );
        })}
      </nav>

      {tab === 'people' && <People />}
      {tab === 'roles' && <Roles />}
      {tab === 'history' && <ChangeHistory />}
    </Wrap>
  );
}

/* ── Health ──────────────────────────────────────────────── */
function HealthBanner() {
  const [h, setH] = useState(null);
  useEffect(() => { api('/admin/roles/health').then(setH).catch(() => {}); }, []);
  if (!h || h.healthy) return null;
  return (
    <div style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b45309', fontWeight: 700, fontSize: '0.88rem' }}>
        <AlertTriangle size={16} /> Needs attention
      </div>
      <ul style={{ margin: '6px 0 0 20px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
        {h.issues.map((i, n) => <li key={n}>{i}</li>)}
      </ul>
    </div>
  );
}

/* ── People ──────────────────────────────────────────────── */
function People() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([api('/admin/users'), api('/admin/roles')]);
      setUsers(u.users); setRoles(r.roles); setErr('');
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const changeRole = async (u, role) => {
    if (role === u.role) return;
    setBusy(u.id);
    try {
      await api(`/admin/users/${u.id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
      toast.success(`${u.name || u.email} is now ${role}`);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const toggleActive = async (u) => {
    setBusy(u.id);
    try {
      await api(`/admin/users/${u.id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive: !u.is_active }) });
      toast.success(u.is_active ? 'Account deactivated' : 'Account activated');
      load();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  if (err) return <Err msg={err} onRetry={load} />;

  return (
    <Card>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
          {['Person', 'Role', 'Status', ''].map(h =>
            <th key={h} style={th}>{h}</th>)}
        </tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{u.name || '—'} {u.isSelf && <Tag>you</Tag>}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{u.email}</div>
              </td>
              <td style={td}>
                <select
                  value={roles.some(r => r.role === u.role) ? u.role : ''}
                  disabled={u.isSelf || busy === u.id}
                  onChange={e => changeRole(u, e.target.value)}
                  title={u.isSelf ? 'You cannot change your own role — ask another administrator' : undefined}
                  style={{
                    padding: '5px 9px', fontSize: '0.83rem', borderRadius: 7,
                    border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
                    color: 'var(--text-primary)', cursor: u.isSelf ? 'not-allowed' : 'pointer',
                    opacity: u.isSelf ? 0.6 : 1,
                  }}>
                  {!roles.some(r => r.role === u.role) && (
                    <option value="">{u.role || 'none'} (legacy)</option>
                  )}
                  {roles.map(r => <option key={r.role} value={r.role}>{r.label}</option>)}
                </select>
                {/* A legacy role isn't a role anyone chose — it's a string
                    being mapped at request time. Worth showing what it
                    actually resolves to. */}
                {u.role_is_legacy && (
                  <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: 3 }}>
                    legacy “{u.role}” → treated as {u.effectiveRole}
                  </div>
                )}
              </td>
              <td style={td}>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                  background: 'var(--bg-elevated)', color: u.is_active ? '#10b981' : 'var(--text-muted)',
                }}>{u.is_active ? 'Active' : 'Inactive'}</span>
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <button onClick={() => toggleActive(u)} disabled={u.isSelf || busy === u.id}
                  className="btn-secondary"
                  title={u.isSelf ? 'You cannot deactivate your own account' : undefined}
                  style={{ fontSize: '0.76rem', padding: '4px 10px', opacity: u.isSelf ? 0.5 : 1, cursor: u.isSelf ? 'not-allowed' : 'pointer' }}>
                  {u.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ── Roles & permissions ─────────────────────────────────── */
function Roles() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [cat, setCat] = useState(null);
  const [draft, setDraft] = useState({});     // role -> { resource: [actions] }
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([api('/admin/roles'), api('/admin/catalogue')]);
      setData(r); setCat(c); setDraft({}); setErr('');
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <Err msg={err} onRetry={load} />;
  if (!data || !cat) return <Muted>Loading…</Muted>;

  const editable = data.roles.filter(r => r.editable);
  const dirty = Object.keys(draft);

  const current = (role, resource) =>
    draft[role]?.[resource] ?? data.roles.find(r => r.role === role)?.permissions?.[resource] ?? [];

  const toggle = (role, resource, action) => {
    const now = current(role, resource);
    const next = now.includes(action) ? now.filter(a => a !== action) : [...now, action];
    setDraft(d => ({
      ...d,
      [role]: {
        ...(d[role] || Object.fromEntries(
          Object.entries(data.roles.find(r => r.role === role)?.permissions || {}))),
        [resource]: next,
      },
    }));
  };

  const save = async (role) => {
    setSaving(true);
    try {
      await api(`/admin/roles/${encodeURIComponent(role)}`, {
        method: 'PATCH', body: JSON.stringify({ permissions: draft[role] }),
      });
      toast.success(`${role} updated`);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn-primary btn-sm" onClick={() => setCreating(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> New role
        </button>
        {dirty.length > 0 && (
          <span style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 600 }}>
            Unsaved changes to {dirty.join(', ')}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Permissions read from {data.source}
        </span>
      </div>

      {creating && <NewRole roles={data.roles} onDone={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />}

      {data.legacyRolesInUse.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '11px 14px', fontSize: '0.84rem' }}>
          <strong>Legacy roles still assigned.</strong> These aren't defined roles — they're old strings
          mapped at request time. Reassign these people on the People tab:
          <ul style={{ margin: '5px 0 0 20px' }}>
            {data.legacyRolesInUse.map(l => (
              <li key={l.role}>{l.users} user(s) with “{l.role}” → treated as <strong>{l.mapsTo}</strong></li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <Info size={14} />
          <span>
            <strong style={{ color: 'var(--text-secondary)' }}>Administrator isn't listed.</strong> It always
            has full access and can't be edited — if a permission change goes wrong, someone has to be able
            to sign in and undo it.
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                <th style={{ ...th, position: 'sticky', left: 0, background: 'var(--bg-elevated)', minWidth: 190 }}>Resource</th>
                {editable.map(r => (
                  <th key={r.role} style={{ ...th, textAlign: 'center', minWidth: 108 }}>
                    <div>{r.label}</div>
                    <div style={{ fontWeight: 400, fontSize: '0.66rem', textTransform: 'none', letterSpacing: 0 }}>
                      {r.userCount} user{r.userCount === 1 ? '' : 's'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(cat.groups).map(([group, resources]) => (
                <React.Fragment key={group}>
                  <tr>
                    <td colSpan={editable.length + 1}
                      style={{ padding: '9px 14px', background: 'var(--bg-elevated)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>
                      {group}
                    </td>
                  </tr>
                  {resources.map(resource => (
                    <tr key={resource} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={{ ...td, position: 'sticky', left: 0, background: 'var(--bg-surface)' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{cat.resources[resource] || resource}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{resource}</div>
                      </td>
                      {editable.map(r => (
                        <td key={r.role} style={{ ...td, textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: 3 }}>
                            {cat.actions.map(a => {
                              const on = current(r.role, resource).includes(a);
                              return (
                                <button key={a} onClick={() => toggle(r.role, resource, a)}
                                  title={`${r.label} can ${a} ${resource}`}
                                  aria-pressed={on}
                                  style={{
                                    width: 22, height: 22, borderRadius: 6, cursor: 'pointer',
                                    fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase',
                                    border: `1px solid ${on ? 'var(--brand-amber)' : 'var(--border-default)'}`,
                                    background: on ? 'rgba(245,158,11,0.16)' : 'transparent',
                                    color: on ? '#b45309' : 'var(--text-muted)',
                                  }}>
                                  {a[0]}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <strong>R</strong> read · <strong>W</strong> write · <strong>D</strong> delete.
            Everyone signed in can always read {cat.alwaysReadable.join(', ')}.
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {dirty.length > 0 && (
              <button onClick={() => setDraft({})} className="btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                <RotateCcw size={13} /> Discard
              </button>
            )}
            {dirty.map(role => (
              <button key={role} onClick={() => save(role)} disabled={saving} className="btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Save size={13} /> Save {role}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: 8 }}>Roles</div>
          {data.roles.map(r => (
            <div key={r.role} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '9px 0', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ minWidth: 130 }}>
                <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{r.label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {r.isSystem ? 'built-in' : 'custom'} · {r.userCount} user{r.userCount === 1 ? '' : 's'}
                </div>
              </div>
              <div style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{r.description}</div>
              <DeleteRole role={r} onDone={load} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function DeleteRole({ role, onDone }) {
  const toast = useToast();
  if (role.isSystem) {
    return <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>built-in</span>;
  }
  const blocked = role.userCount > 0;
  return (
    <button
      disabled={blocked}
      title={blocked ? `${role.userCount} user(s) still assigned — move them first` : 'Delete this role'}
      onClick={async () => {
        if (!window.confirm(`Delete the role “${role.label}”?`)) return;
        try { await api(`/admin/roles/${encodeURIComponent(role.role)}`, { method: 'DELETE' }); toast.success('Role deleted'); onDone(); }
        catch (e) { toast.error(e.message); }
      }}
      style={{
        background: 'none', border: 'none', cursor: blocked ? 'not-allowed' : 'pointer',
        color: blocked ? 'var(--text-muted)' : '#dc2626', opacity: blocked ? 0.4 : 1, padding: 4,
      }}>
      <Trash2 size={15} />
    </button>
  );
}

function NewRole({ roles, onDone, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState({ role: '', label: '', description: '', copyFrom: 'Viewer' });
  const [busy, setBusy] = useState(false);
  const f = { padding: '8px 10px', fontSize: '0.85rem', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', width: '100%' };

  return (
    <Card>
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>New role</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 0 }}>
          Start from an existing role and adjust — a blank role can do nothing at all, and
          “like Sales, but also…” is usually what's meant.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 10 }}>
          <label style={lbl}>Name<input style={f} value={form.role} placeholder="Store Keeper"
            onChange={e => setForm({ ...form, role: e.target.value, label: e.target.value })} /></label>
          <label style={lbl}>Start from<select style={f} value={form.copyFrom}
            onChange={e => setForm({ ...form, copyFrom: e.target.value })}>
            {roles.map(r => <option key={r.role} value={r.role}>{r.label}</option>)}
          </select></label>
          <label style={{ ...lbl, gridColumn: '1 / -1' }}>What this role is for
            <input style={f} value={form.description} placeholder="Receives material and keeps the store"
              onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn-primary btn-sm" disabled={!form.role.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try { await api('/admin/roles', { method: 'POST', body: JSON.stringify(form) }); toast.success(`Role “${form.role}” created`); onDone(); }
              catch (e) { toast.error(e.message); }
              finally { setBusy(false); }
            }}>Create</button>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </Card>
  );
}

/* ── History ─────────────────────────────────────────────── */
function ChangeHistory() {
  const [entries, setEntries] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/admin/roles/audit').then(d => setEntries(d.entries)).catch(e => setErr(e.message)); }, []);
  if (err) return <Err msg={err} />;
  if (!entries) return <Muted>Loading…</Muted>;
  if (!entries.length) return <Card><div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No changes recorded yet.</div></Card>;
  return (
    <Card>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
          {['When', 'Who', 'Role', 'Change'].map(h => <th key={h} style={th}>{h}</th>)}
        </tr></thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <td style={{ ...td, whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {new Date(e.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td style={td}>{e.actor_email || '—'}</td>
              <td style={td}><strong>{e.role || '—'}</strong></td>
              <td style={td}>
                {e.action}
                {e.detail?.email && <span style={{ color: 'var(--text-muted)' }}> · {e.detail.email}{e.detail.from ? ` (${e.detail.from} → ${e.detail.to})` : ''}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ── shared bits ─────────────────────────────────────────── */
const Wrap = ({ children }) => <div style={{ maxWidth: 1180, margin: '0 auto' }}>{children}</div>;
const Card = ({ children }) => (
  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden' }}>{children}</div>
);
const Muted = ({ children }) => <div style={{ padding: 30, color: 'var(--text-muted)' }}>{children}</div>;
const Tag = ({ children }) => (
  <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'var(--bg-elevated)', color: 'var(--text-muted)', marginLeft: 5 }}>{children}</span>
);
const Err = ({ msg, onRetry }) => (
  <Card><div style={{ padding: 30, textAlign: 'center' }}>
    <div style={{ color: '#dc2626', fontWeight: 600 }}>{msg}</div>
    {onRetry && <button onClick={onRetry} className="btn-secondary" style={{ marginTop: 10 }}>Try again</button>}
  </div></Card>
);
const th = { padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' };
const td = { padding: '11px 14px', fontSize: '0.86rem', color: 'var(--text-primary)', verticalAlign: 'top' };
const lbl = { display: 'grid', gap: 4, fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' };
