import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Workflow, ShieldCheck, Bell, Save, Repeat, Plus, Trash2, Play, Pause, X, ReceiptIndianRupee, Wallet, AlarmClock, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { today } from '../lib/dates';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
const fmtDay = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
/* A body that is not JSON (a proxy's error page) must not throw past the
   toast that should explain it. */
const jsonOf = (res) => res.json().catch(() => ({}));

export default function Automation() {
  const toast = useToast();
  /* Buttons this person may use. The server refuses the rest anyway; a
     Viewer was offered every button and got a raw "Not permitted" — or, on
     pause, nothing at all. */
  const { can } = usePermissions();
  const canSettings = can('automation-settings', 'write');
  const canWrite = can('recurring', 'write');
  const canDelete = can('recurring', 'delete');
  const canRaise = { expense: can('expenses', 'write'), sales_invoice: can('sales-invoices', 'write') };

  const [threshold, setThreshold] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [savingThreshold, setSavingThreshold] = useState(false);

  const [profiles, setProfiles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState({ id: null, rows: [] });
  /* Overdue reminders can be switched off (they were shown as always ON). */
  const [reminders, setReminders] = useState(true);
  const [savingReminders, setSavingReminders] = useState(false);
  /* The first run defaults to today, like every other date in the product —
     an empty box was refused on submit. */
  const emptyForm = { docType: canRaise.expense || !canRaise.sales_invoice ? 'expense' : 'sales_invoice', title: '', customerId: '', amount: '', frequency: 'monthly', nextRun: today(), category: '', paidTo: '', gstRate: '18', termsDays: '30' };
  const [form, setForm] = useState(emptyForm);

  const loadProfiles = () => fetch(`${API}/recurring`).then(r => r.ok ? r.json() : []).then(setProfiles).catch(() => {});
  const loadHistory = (id) => fetch(`${API}/recurring/${id}/runs`).then(r => r.ok ? r.json() : []).then(rows => setHistory({ id, rows })).catch(() => setHistory({ id, rows: [] }));

  useEffect(() => {
    fetch(`${API}/automation-settings`).then(r => r.ok ? r.json() : {}).then(d => {
      setThreshold(d.po_approval_threshold ? String(d.po_approval_threshold) : '');
      setReminders(d.reminders_enabled !== false);
    }).catch(() => {}).finally(() => setLoaded(true));
    loadProfiles();
    fetch(`${API}/customers`).then(r => r.ok ? r.json() : []).then(d => setCustomers(Array.isArray(d) ? d : d.items || [])).catch(() => {});
  }, []);

  const saveThreshold = async () => {
    const value = threshold === '' ? 0 : Number(threshold);
    if (!Number.isFinite(value) || value < 0) { toast.error('The threshold must be a number, 0 or more.'); return; }
    setSavingThreshold(true);
    try {
      const res = await fetch(`${API}/automation-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ po_approval_threshold: value }) });
      const d = await jsonOf(res);
      if (!res.ok) throw new Error(d.detail || d.error || 'Could not save the threshold');
      const saved = Number(d.po_approval_threshold) || 0;
      setThreshold(saved ? String(saved) : '');
      toast.success(saved ? `Saved — POs over ${rupee(saved)} now need sign-off` : 'Saved — POs need no sign-off');
    } catch (e) { toast.error(e.message); }
    finally { setSavingThreshold(false); }
  };

  const toggleReminders = async () => {
    const next = !reminders;
    setSavingReminders(true);
    try {
      const res = await fetch(`${API}/automation-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reminders_enabled: next }) });
      const d = await jsonOf(res);
      if (!res.ok) throw new Error(d.detail || d.error || 'Could not change reminders');
      setReminders(d.reminders_enabled !== false);
      toast.success(next ? 'Reminders switched on' : 'Reminders switched off — overdue invoices will not be chased');
    } catch (e) { toast.error(e.message); }
    finally { setSavingReminders(false); }
  };

  const createProfile = async (e) => {
    e.preventDefault();
    if (saving) return;
    const payload = form.docType === 'sales_invoice'
      ? { gstRate: Number(form.gstRate) || 0, termsDays: Number(form.termsDays) || 0 }
      : { category: form.category, paidTo: form.paidTo };
    const body = { docType: form.docType, title: form.title, customerId: form.docType === 'sales_invoice' ? form.customerId : null, amount: form.amount, frequency: form.frequency, nextRun: form.nextRun, payload };
    setSaving(true);
    try {
      const res = await fetch(`${API}/recurring`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await jsonOf(res);
      if (!res.ok) throw new Error(d.detail || d.error || 'Could not create the schedule');
      toast.success(`Schedule “${d.title}” created — first ${d.doc_type === 'sales_invoice' ? 'invoice' : 'expense'} on ${fmtDay(d.next_run)}`);
      setShowForm(false); setForm(emptyForm); loadProfiles();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (p) => {
    try {
      const res = await fetch(`${API}/recurring/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !p.active }) });
      const d = await jsonOf(res);
      if (!res.ok) throw new Error(d.detail || d.error || 'Could not change the schedule');
      toast.success(d.active ? `Resumed — next on ${fmtDay(d.next_run)}` : `Paused — “${p.title}” makes nothing until you resume it`);
    } catch (e) { toast.error(e.message); }
    loadProfiles();
  };
  const removeProfile = async (p) => {
    if (!window.confirm(`Delete recurring schedule “${p.title}”? What it has already made is kept.`)) return;
    try {
      const res = await fetch(`${API}/recurring/${p.id}`, { method: 'DELETE' });
      const d = await jsonOf(res);
      if (!res.ok) throw new Error(d.detail || d.error || 'Could not delete the schedule');
      const n = Number(p.generated_count) || 0;
      toast.success(n ? `Deleted “${p.title}” — the ${n === 1 ? 'document' : `${n} documents`} it made ${n === 1 ? 'is' : 'are'} kept` : `Deleted “${p.title}”`);
      if (history.id === p.id) setHistory({ id: null, rows: [] });
    } catch (e) { toast.error(e.message); }
    loadProfiles();
  };
  const toggleHistory = (p) => (history.id === p.id ? setHistory({ id: null, rows: [] }) : loadHistory(p.id));

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await fetch(`${API}/recurring/run-now`, { method: 'POST' });
      const d = await jsonOf(res);
      if (!res.ok) throw new Error(d.detail || d.error || 'Run now failed');
      /* It used to say "Done — 1 expense(s)" whatever happened, which read
         as if Maks Ops invented a cost. Now it names each schedule, how many
         it made and for which days — or, with nothing due, what comes next. */
      const by = {};
      for (const it of d.items || []) {
        const k = it.profile;
        by[k] = by[k] || { n: 0, kind: it.type === 'sales_invoice' ? 'invoice' : 'expense', dates: [] };
        by[k].n++; if (it.date) by[k].dates.push(it.date);
      }
      const made = Object.entries(by).map(([title, v]) => {
        const span = v.dates.length > 1 ? ` (${fmtDay(v.dates[0])} – ${fmtDay(v.dates[v.dates.length - 1])})` : v.dates[0] ? ` (${fmtDay(v.dates[0])})` : '';
        return `${v.n} ${v.kind}${v.n > 1 ? 's' : ''} for “${title}”${span}`;
      });
      if (d.reminders) made.push(`${d.reminders} overdue reminder${d.reminders > 1 ? 's' : ''}`);
      /* A schedule stopped by the catch-up cap, or one that failed, used to
         read as "Nothing was due today". */
      const behind = (d.behind || []).map(b => `“${b.profile}” is still behind (next ${fmtDay(b.next_run)}) — press Run now again to continue`);
      if (made.length) toast.success(`Created ${made.join('; ')}${behind.length ? `. ${behind.join('; ')}` : ''}`, { duration: 6000 });
      else if (!(d.failed || []).length) toast.info(d.next ? `Nothing was due today. Next: “${d.next.title}” on ${fmtDay(d.next.next_run)}.` : 'Nothing was due today.');
      for (const f of d.failed || []) toast.error(`“${f.profile}” could not run: ${f.error}`);
      loadProfiles();
      if (history.id) loadHistory(history.id);
    } catch (e) { toast.error(e.message); }
    finally { setRunning(false); }
  };

  const todayStr = today();
  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 22 };
  const input = { padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', width: '100%', minWidth: 0, boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 };
  const hint = { marginTop: 5, fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.45 };

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <Workflow size={24} style={{ color: 'var(--brand-amber)' }} /> Automation
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Rules that run themselves — approvals, recurring bills, and reminders. No scripting.</p>
      </div>

      {/* ── PO approval ── */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          <ShieldCheck size={18} style={{ color: 'var(--brand-amber)' }} /> Purchase Order approval
        </div>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
          Any PO whose value (before GST) is <b>above this limit</b> is held for sign-off before it can be approved — and the people who may sign it off get a notification. Set to <b>0</b> to require no approval.
        </p>
        <label htmlFor="po-threshold" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>PO approval threshold (₹)</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input id="po-threshold" style={{ ...input, width: 220, maxWidth: '100%', fontWeight: 700 }} type="number" min="0" placeholder="e.g. 50000" value={threshold} onChange={e => setThreshold(e.target.value)} disabled={!loaded || !canSettings} />
          {canSettings && <button onClick={saveThreshold} disabled={!loaded || savingThreshold} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Save size={15} /> {savingThreshold ? 'Saving…' : 'Save'}</button>}
        </div>
        {Number(threshold) > 0 && <div style={{ marginTop: 10, fontSize: '0.82rem', color: 'var(--text-muted)' }}>POs over <b>{rupee(threshold)}</b> will need sign-off.</div>}
      </div>

      {/* ── Recurring transactions ── */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--text-primary)' }}>
            <Repeat size={18} style={{ color: 'var(--brand-amber)' }} /> Recurring transactions
          </div>
          {canWrite && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={runNow} disabled={running} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                <Play size={14} /> {running ? 'Running…' : 'Run now'}
              </button>
              {(canRaise.expense || canRaise.sales_invoice) && (
                <button onClick={() => { setShowForm(!showForm); setForm(emptyForm); }} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {showForm ? <X size={15} /> : <Plus size={15} />} {showForm ? 'Close' : 'New schedule'}
                </button>
              )}
            </div>
          )}
        </div>
        <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
          Auto-create the bills you raise or pay on a cadence — monthly retainers/AMC invoices, rent, subscriptions. Maks Ops generates them on the schedule and notifies you; one that has fallen behind catches up with a document for each missed date, dated that day. Use <b>Run now</b> to process anything due today immediately.
          {!canWrite && <> Your role can see these schedules but not change them.</>}
        </p>

        {showForm && (
          <form onSubmit={createProfile} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              {[{ v: 'expense', l: 'Expense we pay', i: Wallet }, { v: 'sales_invoice', l: 'Invoice we bill', i: ReceiptIndianRupee }].filter(t => canRaise[t.v]).map(t => (
                <button type="button" key={t.v} onClick={() => setForm({ ...form, docType: t.v })}
                  style={{ flex: '1 1 140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px', borderRadius: 9, cursor: 'pointer', fontSize: '0.83rem', fontWeight: 700,
                    border: '1px solid ' + (form.docType === t.v ? 'var(--brand-amber)' : 'var(--border-default)'),
                    background: form.docType === t.v ? 'hsl(28,100%,54%,0.1)' : 'var(--bg-surface)',
                    color: form.docType === t.v ? 'var(--brand-amber)' : 'var(--text-muted)' }}>
                  <t.i size={15} /> {t.l}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Title / Description *</label>
                <input style={input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={form.docType === 'expense' ? 'e.g. Office Rent' : 'e.g. AMC — monthly retainer'} />
              </div>
              {form.docType === 'sales_invoice' && (
                <div><label style={lbl}>Customer *</label>
                  <select style={input} value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })}>
                    <option value="">— Select —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {!customers.length && <div style={hint}>No customers yet — <Link to="/customers">add one</Link> first.</div>}
                </div>
              )}
              <div><label style={lbl}>{form.docType === 'sales_invoice' ? 'Amount (before GST) ₹ *' : 'Amount ₹ *'}</label>
                <input style={input} type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="25000" />
              </div>
              <div><label style={lbl}>Frequency</label>
                <select style={input} value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                  <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>
                  <option value="weekly">Weekly</option><option value="daily">Daily</option>
                </select>
                {['monthly', 'quarterly', 'yearly'].includes(form.frequency) && form.nextRun && (() => {
                  const [y, m, d] = String(form.nextRun).split('-').map(Number);
                  /* The same rule as the server: a month-end start stays on the month end. */
                  if (d === new Date(Date.UTC(y, m, 0)).getUTCDate()) return <div style={hint}>Runs on the last day of every month it falls in.</div>;
                  if (d > 28) return <div style={hint}>In a shorter month it falls on the month's last day, then goes back to the {d}th.</div>;
                  return null;
                })()}
              </div>
              <div><label style={lbl}>First run date *</label>
                <input style={input} type="date" value={form.nextRun} onChange={e => setForm({ ...form, nextRun: e.target.value })} />
                {form.nextRun && form.nextRun < todayStr && (
                  <div style={{ ...hint, color: 'var(--brand-amber)' }}>
                    {form.docType === 'sales_invoice'
                      ? 'This is in the past: the next run raises one invoice for each period missed since. They are dated today, so invoice numbers stay in date order, and each names the period it bills.'
                      : 'This is in the past: the next run records one expense for every date missed since, each dated that day.'}
                  </div>
                )}
              </div>
              {form.docType === 'expense' ? (
                <>
                  <div><label style={lbl}>Category</label><input style={input} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Rent / Utilities" /></div>
                  <div><label style={lbl}>Paid to</label><input style={input} value={form.paidTo} onChange={e => setForm({ ...form, paidTo: e.target.value })} placeholder="Landlord / vendor" /></div>
                </>
              ) : (
                <>
                  <div><label style={lbl}>GST rate %</label><input style={input} type="number" min="0" max="100" value={form.gstRate} onChange={e => setForm({ ...form, gstRate: e.target.value })} /></div>
                  <div><label style={lbl}>Payment terms (days)</label><input style={input} type="number" min="0" max="365" value={form.termsDays} onChange={e => setForm({ ...form, termsDays: e.target.value })} placeholder="30" /></div>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="submit" disabled={saving} className="btn-primary btn-sm">{saving ? 'Creating…' : 'Create schedule'}</button>
              <button type="button" onClick={() => { setShowForm(false); setForm(emptyForm); }} className="btn-secondary">Cancel</button>
            </div>
          </form>
        )}

        {profiles.length === 0 && !showForm && (
          <div style={{ padding: '14px 16px', border: '1px dashed var(--border-default)', borderRadius: 10, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            No schedules yet.{canWrite && (canRaise.expense || canRaise.sales_invoice) ? <> Press <b>New schedule</b> to add rent, a retainer or a subscription.</> : ''}
          </div>
        )}

        {profiles.length > 0 && (
          /* Scrolls inside the card on a phone. It was overflow: hidden, which
             cut the pause and delete buttons off at 360px. */
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                  {['Schedule', 'Type', 'Amount', 'Every', 'Next run', 'Made', ''].map((h, i) => <th key={i} style={{ padding: '9px 12px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {profiles.map(p => (
                  <React.Fragment key={p.id}>
                  <tr style={{ borderTop: '1px solid var(--border-subtle)', opacity: p.active ? 1 : 0.5 }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                      {p.title}{p.customer_name ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {p.customer_name}</span> : ''}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {p.doc_type === 'sales_invoice' ? 'Invoice' : 'Expense'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{rupee(p.amount)}</td>
                    <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{FREQ_LABEL[p.frequency] || p.frequency}</td>
                    <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {p.active ? <>{fmtDay(p.next_run)}{String(p.next_run).slice(0, 10) <= todayStr && <span style={{ color: 'var(--brand-amber)', fontWeight: 700 }}> · due</span>}</> : <span style={{ color: 'var(--text-muted)' }}>paused</span>}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {p.generated_count > 0 ? (
                        <button type="button" onClick={() => toggleHistory(p)} aria-expanded={history.id === p.id} title="What it made"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 }}>
                          {p.generated_count}× {history.id === p.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      ) : '0×'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canWrite && <button onClick={() => toggleActive(p)} title={p.active ? 'Pause' : 'Resume'} aria-label={p.active ? `Pause ${p.title}` : `Resume ${p.title}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginRight: 2 }}>{p.active ? <Pause size={15} /> : <Play size={15} />}</button>}
                      {canDelete && <button onClick={() => removeProfile(p)} title="Delete" aria-label={`Delete ${p.title}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>}
                    </td>
                  </tr>
                  {history.id === p.id && (
                    <tr style={{ background: 'var(--bg-elevated)' }}>
                      <td colSpan={7} style={{ padding: '8px 12px 12px' }}>
                        {history.rows.length === 0 ? <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nothing recorded yet.</span> : (
                          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                            {history.rows.map(r => (
                              <li key={r.id} style={{ display: 'flex', gap: 12, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                <span style={{ minWidth: 92 }}>{fmtDay(r.doc_date || r.run_date)}</span>
                                {!r.doc_exists ? <span style={{ color: 'var(--text-muted)' }}>{r.result_ref} — deleted since</span>
                                  : r.result_type === 'sales_invoice' ? <Link to={`/sales-invoices/${r.result_id}`}>{r.result_ref}</Link>
                                  : <Link to="/expenses">{r.result_ref}</Link>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Reminders ── */}
      <div style={{ ...card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          <AlarmClock size={18} style={{ color: 'var(--brand-amber)' }} /> Reminders
          <button type="button" role="switch" aria-checked={reminders} aria-label="Overdue invoice reminders" onClick={toggleReminders} disabled={savingReminders || !loaded || !canSettings}
            style={{
              marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, border: 0, background: 'none', cursor: canSettings ? 'pointer' : 'default',
              fontSize: '0.78rem', fontWeight: 700, color: reminders ? 'var(--accent-emerald)' : 'var(--text-muted)', padding: 0,
            }}>
            {reminders ? 'On' : 'Off'}
            <span aria-hidden="true" style={{
              width: 38, height: 22, borderRadius: 999, position: 'relative', flex: 'none', transition: 'background 160ms ease',
              background: reminders ? 'var(--accent-emerald)' : 'var(--border-emphasis)',
            }}>
              <span style={{
                position: 'absolute', top: 3, left: reminders ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff',
                transition: 'left 160ms ease', boxShadow: '0 1px 3px rgba(0,0,0,.25)',
              }} />
            </span>
          </button>
        </div>
        <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {reminders
            ? 'Maks Ops watches your money and nudges you automatically:'
            : 'Reminders are off — overdue invoices will not be chased. Switch them on to be told again:'}
        </p>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.9 }}>
          <li><b>Overdue invoices</b> — when a customer invoice passes its due date and isn't fully paid, the company's owner gets a notification with the outstanding amount and days overdue, once per invoice.</li>
          <li>Payments, POs and GRNs already notify in real time via the <Bell size={13} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> bell.</li>
        </ul>
      </div>
    </div>
  );
}
