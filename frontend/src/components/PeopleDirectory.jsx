/* ══════════════════════════════════════════════════════════
   PeopleDirectory — everyone with a login, and how much they can reach.

   The old list showed name, email, role, active. That administers
   permissions but does not let anyone recognise a person: which Ravi, what
   he actually does, which works number payroll knows him by, and — the
   question actually being asked — how much of the business can he change.

   So each row carries the works number, the job they do (which is NOT their
   role: a Quality Inspector may be on the Production role), the role itself,
   and an access reading computed from what that role can write. Sorting by
   access puts the widest accounts at the top, which is where an
   over-privileged login should surface without anybody hunting for it.

   Role changes happen inline. Making somebody go to a detail screen to
   change one dropdown is how a list of nine people becomes a chore.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useMemo } from 'react';
import { Search, X, Pencil, Check, BadgeCheck, ShieldCheck } from 'lucide-react';

const LEVEL_TONE = {
  full:        { bg: 'rgba(239,68,68,0.12)',  fg: '#dc2626', label: 'Full access' },
  broad:       { bg: 'rgba(245,158,11,0.14)', fg: '#b45309', label: 'Broad' },
  limited:     { bg: 'rgba(59,130,246,0.12)', fg: '#2563eb', label: 'Limited' },
  'read only': { bg: 'rgba(100,116,139,0.14)',fg: '#475569', label: 'Read only' },
};

export default function PeopleDirectory({
  users, roles, busy, onChangeRole, onToggleActive, onEditPerson, onResetPassword,
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('id');
  const [showInactive, setShowInactive] = useState(true);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = users.filter(u => showInactive || u.is_active);
    if (q) {
      list = list.filter(u => [
        u.name, u.email, u.employee_code, u.job_title, u.department,
        u.effectiveRole, u.role_label, u.reports_to_name,
      ].some(v => String(v || '').toLowerCase().includes(q)));
    }
    const by = {
      id: (a, b) => a.id - b.id,
      name: (a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)),
      role: (a, b) => String(a.effectiveRole).localeCompare(String(b.effectiveRole)),
      /* Widest first: an account with more reach than it needs is the thing
         this screen exists to surface. */
      access: (a, b) => (b.access?.writable ?? 0) - (a.access?.writable ?? 0),
    };
    return [...list].sort(by[sort] || by.id);
  }, [users, search, sort, showInactive]);

  const th = {
    padding: '9px 12px', fontSize: '0.7rem', fontWeight: 800,
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em',
    textAlign: 'left', whiteSpace: 'nowrap',
  };
  const td = { padding: '11px 12px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.85rem', verticalAlign: 'middle' };

  const inactiveCount = users.filter(u => !u.is_active).length;

  return (
    <div>
      {/* ── toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, works number, job, role…"
            aria-label="Search people"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '9px 30px 9px 33px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search"
              style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 0 }}>
              <X size={14} />
            </button>
          )}
        </div>

        <select
          value={sort} onChange={e => setSort(e.target.value)}
          aria-label="Sort by"
          style={{
            padding: '9px 11px', background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)', borderRadius: 8,
            color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="id">Order added</option>
          <option value="name">Name</option>
          <option value="role">Role</option>
          <option value="access">Most access first</option>
        </select>

        {inactiveCount > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Show deactivated ({inactiveCount})
          </label>
        )}

        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {shown.length} of {users.length}
        </span>
      </div>

      {/* ── the list ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)' }}>
              <th style={th}>Works no.</th>
              <th style={th}>Person</th>
              <th style={th}>What they do</th>
              <th style={th}>Role</th>
              <th style={th}>Access</th>
              <th style={th}>Last seen</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(u => {
              const tone = LEVEL_TONE[u.access?.level] || LEVEL_TONE['read only'];
              const dim = u.is_active ? 1 : 0.5;
              return (
                <tr key={u.id} style={{ opacity: dim }}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {u.employee_code || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>

                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))',
                        color: '#fff', fontSize: '0.78rem', fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{String(u.name || u.email || 'U').charAt(0).toUpperCase()}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                          {u.name || '—'}
                          {u.isSelf && <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--brand-amber)' }}>YOU</span>}
                          {!u.is_active && <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)' }}>DEACTIVATED</span>}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>

                  <td style={td}>
                    {u.job_title || u.department ? (
                      <div>
                        <div style={{ color: 'var(--text-primary)' }}>{u.job_title || '—'}</div>
                        {u.department && <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{u.department}</div>}
                        {u.reports_to_name && <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>reports to {u.reports_to_name}</div>}
                      </div>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>not recorded</span>}
                  </td>

                  <td style={td}>
                    <select
                      value={u.effectiveRole}
                      disabled={busy === u.id || u.isSelf}
                      title={u.isSelf ? 'You cannot change your own role' : 'Change role'}
                      onChange={e => onChangeRole(u, e.target.value)}
                      style={{
                        padding: '6px 9px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600,
                        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                        color: 'var(--text-primary)', outline: 'none',
                        cursor: u.isSelf ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {roles.map(r => <option key={r.role} value={r.role}>{r.label || r.role}</option>)}
                    </select>
                    {u.role_is_legacy && (
                      <div style={{ fontSize: '0.7rem', color: '#b45309', marginTop: 3 }}>
                        stored as “{u.role}”
                      </div>
                    )}
                  </td>

                  <td style={td}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 999,
                      background: tone.bg, color: tone.fg,
                      fontSize: '0.72rem', fontWeight: 800,
                    }}>{tone.label}</span>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
                      can change {u.access?.writable ?? 0} of {u.access?.totalResources ?? 0}
                    </div>
                  </td>

                  <td style={{ ...td, fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {u.last_login
                      ? new Date(u.last_login).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
                      : 'never'}
                  </td>

                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => onEditPerson(u)} title="Edit details" className="btn-secondary"
                      style={{ fontSize: '0.74rem', padding: '4px 9px', marginRight: 5 }}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => onResetPassword(u)} title="Reset password" className="btn-secondary"
                      style={{ fontSize: '0.74rem', padding: '4px 9px', marginRight: 5 }}>
                      <ShieldCheck size={12} />
                    </button>
                    <button
                      onClick={() => onToggleActive(u)}
                      disabled={busy === u.id || u.isSelf}
                      title={u.isSelf ? 'You cannot deactivate yourself' : (u.is_active ? 'Deactivate' : 'Reactivate')}
                      className="btn-secondary"
                      style={{ fontSize: '0.74rem', padding: '4px 9px', opacity: u.isSelf ? 0.4 : 1 }}
                    >
                      {u.is_active ? <X size={12} /> : <Check size={12} />}
                    </button>
                  </td>
                </tr>
              );
            })}

            {!shown.length && (
              <tr>
                <td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>
                  {search ? `Nobody matches “${search}”.` : 'No people yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <BadgeCheck size={13} />
        “What they do” is their job in the business. “Role” is what the software lets them do — the two are not the same, and a Quality Inspector may well be on the Production role.
      </p>
    </div>
  );
}
