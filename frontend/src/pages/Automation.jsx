import React, { useState, useEffect } from 'react';
import { Workflow, ShieldCheck, Bell, Save, Repeat, Plus, Trash2, Play, Pause, X, ReceiptIndianRupee, Wallet, AlarmClock } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

export default function Automation() {
  const toast = useToast();
  const [threshold, setThreshold] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [profiles, setProfiles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [running, setRunning] = useState(false);
  const emptyForm = { docType: 'expense', title: '', customerId: '', amount: '', frequency: 'monthly', nextRun: '', category: '', paidTo: '', gstRate: '18', termsDays: '30' };
  const [form, setForm] = useState(emptyForm);

  const loadProfiles = () => fetch(`${API}/recurring`).then(r => r.ok ? r.json() : []).then(setProfiles).catch(() => {});

  useEffect(() => {
    fetch(`${API}/automation-settings`).then(r => r.ok ? r.json() : {}).then(d => {
      setThreshold(d.po_approval_threshold ? String(d.po_approval_threshold) : '');
      setLoaded(true);
    });
    loadProfiles();
    fetch(`${API}/customers`).then(r => r.ok ? r.json() : []).then(setCustomers).catch(() => {});
  }, []);

  const saveThreshold = async () => {
    const res = await fetch(`${API}/automation-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ po_approval_threshold: Number(threshold) || 0 }) });
    if (!res.ok) { toast.error((await res.json()).error || 'Failed'); return; }
    toast.success('Automation settings saved');
  };

  const createProfile = async (e) => {
    e.preventDefault();
    const payload = form.docType === 'sales_invoice'
      ? { gstRate: Number(form.gstRate) || 0, termsDays: Number(form.termsDays) || 0 }
      : { category: form.category, paidTo: form.paidTo };
    const body = { docType: form.docType, title: form.title, customerId: form.docType === 'sales_invoice' ? form.customerId : null, amount: form.amount, frequency: form.frequency, nextRun: form.nextRun, payload };
    const res = await fetch(`${API}/recurring`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) { toast.error(d.error || 'Failed'); return; }
    toast.success('Recurring schedule created');
    setShowForm(false); setForm(emptyForm); loadProfiles();
  };

  const toggleActive = async (p) => {
    await fetch(`${API}/recurring/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !p.active }) });
    loadProfiles();
  };
  const removeProfile = async (p) => {
    if (!window.confirm(`Delete recurring schedule “${p.title}”?`)) return;
    await fetch(`${API}/recurring/${p.id}`, { method: 'DELETE' });
    toast.success('Deleted'); loadProfiles();
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await fetch(`${API}/recurring/run-now`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      const parts = [];
      if (d.invoices) parts.push(`${d.invoices} invoice(s)`);
      if (d.expenses) parts.push(`${d.expenses} expense(s)`);
      if (d.reminders) parts.push(`${d.reminders} reminder(s)`);
      toast.success(parts.length ? `Done — ${parts.join(', ')}` : 'Nothing was due right now');
      loadProfiles();
    } catch (e) { toast.error(e.message); }
    finally { setRunning(false); }
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 22 };
  const input = { padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', width: '100%' };
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 };

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
          Any PO whose value is <b>above this limit</b> is held for sign-off before it can be approved — and your admins get a notification. Set to <b>0</b> to require no approval.
        </p>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>PO approval threshold (₹)</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input style={{ ...input, width: 220, fontWeight: 700 }} type="number" min="0" placeholder="e.g. 50000" value={threshold} onChange={e => setThreshold(e.target.value)} disabled={!loaded} />
          <button onClick={saveThreshold} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Save size={15} /> Save</button>
        </div>
        {Number(threshold) > 0 && <div style={{ marginTop: 10, fontSize: '0.82rem', color: 'var(--text-muted)' }}>POs over <b>{rupee(threshold)}</b> will need sign-off.</div>}
      </div>

      {/* ── Recurring transactions ── */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--text-primary)' }}>
            <Repeat size={18} style={{ color: 'var(--brand-amber)' }} /> Recurring transactions
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={runNow} disabled={running} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
              <Play size={14} /> {running ? 'Running…' : 'Run now'}
            </button>
            <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {showForm ? <X size={15} /> : <Plus size={15} />} {showForm ? 'Close' : 'New schedule'}
            </button>
          </div>
        </div>
        <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: showForm || profiles.length ? 16 : 4 }}>
          Auto-create the bills you raise or pay on a cadence — monthly retainers/AMC invoices, rent, subscriptions. Nexus generates them on the schedule and notifies you. Use <b>Run now</b> to process anything due today immediately.
        </p>

        {showForm && (
          <form onSubmit={createProfile} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              {[{ v: 'expense', l: 'Expense we pay', i: Wallet }, { v: 'sales_invoice', l: 'Invoice we bill', i: ReceiptIndianRupee }].map(t => (
                <button type="button" key={t.v} onClick={() => setForm({ ...form, docType: t.v })}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px', borderRadius: 9, cursor: 'pointer', fontSize: '0.83rem', fontWeight: 700,
                    border: '1px solid ' + (form.docType === t.v ? 'var(--brand-amber)' : 'var(--border-default)'),
                    background: form.docType === t.v ? 'hsl(28,100%,54%,0.1)' : 'var(--bg-surface)',
                    color: form.docType === t.v ? 'var(--brand-amber)' : 'var(--text-muted)' }}>
                  <t.i size={15} /> {t.l}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Title / description *</label>
                <input style={input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={form.docType === 'expense' ? 'e.g. Office Rent' : 'e.g. AMC — monthly retainer'} />
              </div>
              {form.docType === 'sales_invoice' && (
                <div><label style={lbl}>Customer *</label>
                  <select style={input} value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })}>
                    <option value="">— Select —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div><label style={lbl}>{form.docType === 'sales_invoice' ? 'Amount (before GST) ₹ *' : 'Amount ₹ *'}</label>
                <input style={input} type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="25000" />
              </div>
              <div><label style={lbl}>Frequency</label>
                <select style={input} value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                  <option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="daily">Daily</option>
                </select>
              </div>
              <div><label style={lbl}>First run date *</label>
                <input style={input} type="date" value={form.nextRun} onChange={e => setForm({ ...form, nextRun: e.target.value })} />
              </div>
              {form.docType === 'expense' ? (
                <>
                  <div><label style={lbl}>Category</label><input style={input} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Rent / Utilities" /></div>
                  <div><label style={lbl}>Paid to</label><input style={input} value={form.paidTo} onChange={e => setForm({ ...form, paidTo: e.target.value })} placeholder="Landlord / vendor" /></div>
                </>
              ) : (
                <>
                  <div><label style={lbl}>GST rate %</label><input style={input} type="number" value={form.gstRate} onChange={e => setForm({ ...form, gstRate: e.target.value })} /></div>
                  <div><label style={lbl}>Payment terms (days)</label><input style={input} type="number" value={form.termsDays} onChange={e => setForm({ ...form, termsDays: e.target.value })} placeholder="30" /></div>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="submit" className="btn-primary btn-sm">Create schedule</button>
              <button type="button" onClick={() => { setShowForm(false); setForm(emptyForm); }} className="btn-secondary">Cancel</button>
            </div>
          </form>
        )}

        {profiles.length > 0 && (
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                  {['Schedule', 'Type', 'Amount', 'Every', 'Next run', 'Made', ''].map((h, i) => <th key={i} style={{ padding: '9px 12px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {profiles.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border-subtle)', opacity: p.active ? 1 : 0.5 }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                      {p.title}{p.customer_name ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {p.customer_name}</span> : ''}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {p.doc_type === 'sales_invoice' ? 'Invoice' : 'Expense'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{rupee(p.amount)}</td>
                    <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{FREQ_LABEL[p.frequency]}</td>
                    <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.active ? (p.next_run || '').slice(0, 10) : <span style={{ color: 'var(--text-muted)' }}>paused</span>}</td>
                    <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.generated_count || 0}×</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => toggleActive(p)} title={p.active ? 'Pause' : 'Resume'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginRight: 2 }}>{p.active ? <Pause size={15} /> : <Play size={15} />}</button>
                      <button onClick={() => removeProfile(p)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Reminders ── */}
      <div style={{ ...card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          <AlarmClock size={18} style={{ color: 'var(--brand-amber)' }} /> Reminders <span style={{ fontSize: '0.68rem', fontWeight: 700, background: 'hsl(152,60%,45%,0.15)', color: 'var(--accent-emerald)', padding: '2px 8px', borderRadius: 20 }}>ON</span>
        </div>
        <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Nexus watches your money and nudges you automatically:
        </p>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.9 }}>
          <li><b>Overdue invoices</b> — when a customer invoice passes its due date and isn't fully paid, your admins get a notification with the outstanding amount and days overdue.</li>
          <li>Payments, POs and GRNs already notify in real time via the <Bell size={12} style={{ verticalAlign: 'middle' }} /> bell.</li>
        </ul>
      </div>
    </div>
  );
}
