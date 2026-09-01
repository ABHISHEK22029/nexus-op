/* ══════════════════════════════════════════════════════════
   Team — a searchable directory of who works here.

   This page used to edit roles too, from a hardcoded list:
       ['Admin', 'Manager', 'Staff', 'User', 'Viewer']
   None of which matched the roles the server actually enforces. "Staff" was
   never a role at all, and "Manager" was one no account has ever held. So
   the dropdown offered choices that either did nothing or silently mapped
   to something else.

   Role changes now live in one place — Configurator → People — where they
   are validated against real roles, guarded against locking yourself out,
   and written to an audit log. Two screens that both assign roles is two
   role vocabularies waiting to disagree, which is the exact problem the
   role rewrite existed to fix.

   What is left here is the thing this page is genuinely good for: finding a
   colleague, and seeing at a glance who is in which department.
   ══════════════════════════════════════════════════════════ */
import React from 'react';
import { Link } from 'react-router-dom';
import { Users as UsersIcon, Lock, Settings, ShieldCheck } from 'lucide-react';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';

export default function Users() {
  const { can, role } = usePermissions();
  const q = useListQuery('users', { pageSize: 25 });

  if (q.error && /not permitted/i.test(q.error)) return (
    <div style={{ maxWidth: 560, margin: '60px auto 0', textAlign: 'center', color: 'var(--text-muted)' }}>
      <Lock size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
      <h2 style={{ color: 'var(--text-primary)' }}>Not part of your role</h2>
      <p style={{ marginTop: 8 }}>You're signed in as {role}, which can't view the team directory.</p>
    </div>
  );

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const s = q.summary || {};
  const isAdmin = role === 'Administrator';

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <UsersIcon size={24} style={{ color: 'var(--brand-amber)' }} /> Team
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
          Who works here, and what each person's role lets them do.
          {isAdmin && <> Roles are assigned in <Link to="/configurator" style={{ color: 'var(--brand-amber)', fontWeight: 600 }}>Configurator → People</Link>.</>}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 18 }}>
        <Kpi card={card} label={q.isFiltered ? 'People (filtered)' : 'People'} value={s.count ?? q.total} />
        <Kpi card={card} label="Active" value={s.active ?? '—'} tone="#10b981" />
        <Kpi card={card} label="Inactive" value={s.inactive ?? 0} tone={Number(s.inactive) > 0 ? '#b45309' : undefined} />
        <Kpi card={card} label="Never signed in" value={s.never_logged_in ?? 0}
          sub={Number(s.never_logged_in) > 0 ? 'invited but not yet used' : undefined} />
      </div>

      <ListToolbar
        q={q}
        placeholder="Search name, email, role or department…"
        filters={[{
          key: 'is_active',
          label: 'Status',
          options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }],
        }]}
        right={isAdmin && (
          <Link to="/configurator" className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
            <Settings size={13} /> Manage roles
          </Link>
        )}
      />

      <div style={{ ...card, overflow: 'hidden' }}>
        {q.rows.length === 0 ? (
          <EmptyState q={q} icon={UsersIcon} noun="people" hint="Team members appear here once they have an account." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                {['Person', 'Role', 'Department', 'Status', 'Last signed in'].map(h =>
                  <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {q.rows.map(u => (
                  <tr key={u.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{u.name || '—'}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{u.email}</div>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: 'rgba(245,158,11,0.12)', color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <ShieldCheck size={11} /> {u.role || '—'}
                      </span>
                    </td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{u.department || '—'}</td>
                    <td style={td}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: 'var(--bg-elevated)', color: u.is_active ? '#10b981' : 'var(--text-muted)' }}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ ...td, fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {u.last_login
                        ? new Date(u.last_login).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : 'never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination q={q} />
    </div>
  );
}

const Kpi = ({ card, label, value, tone, sub }) => (
  <div style={{ ...card, padding: 16 }}>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: tone || 'var(--text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
  </div>
);

const th = { padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' };
const td = { padding: '11px 14px', fontSize: '0.86rem', color: 'var(--text-primary)', verticalAlign: 'top' };
