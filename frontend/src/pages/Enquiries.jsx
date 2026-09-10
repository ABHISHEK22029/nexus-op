/* ══════════════════════════════════════════════════════════════════════
   Enquiries — what the public catalogue produces.

   An enquiry is a stranger who wants something. It is not a customer, and
   the customers table stays clear of it until somebody decides it is real:
   convert creates the customer row and prefills a quotation, and the chain
   that already exists takes over from there.

   Sorted oldest-unanswered first within status, because the cost of this
   screen is a lead that sat unread for three days, not one that is hard to
   find.
   ══════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Phone, Mail, Building2, ArrowRight, Check, X, Clock } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const STATUS_COLOR = {
  New: '#2563eb', Read: '#64748b', Quoted: '#8b5cf6', Won: '#10b981', Ignored: '#9ca3af',
};
const when = (t) => {
  if (!t) return '';
  const mins = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

export default function Enquiries() {
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const api = async (path, opts = {}) => {
    const token = getToken();
    const r = await fetch(`${API}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.detail || d.error || 'Something went wrong');
    return d;
  };

  const load = async () => {
    setLoading(true);
    try {
      const d = await api(`/enquiries${filter ? `?status=${filter}` : ''}`);
      setRows(d.items || []); setSummary(d.summary || {});
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  /* Opening one marks it read — the inbox's "new" count should mean
     "nobody has looked at this", not "nobody has pressed a button". */
  const openOne = async (row) => {
    try {
      const d = await api(`/enquiries/${row.id}`);
      setOpen(d);
      if (row.status === 'New') {
        await api(`/enquiries/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'Read' }) });
        load();
      }
    } catch (e) { toast.error(e.message); }
  };

  const setStatus = async (id, status) => {
    try {
      await api(`/enquiries/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast.success(`Marked ${status.toLowerCase()}`);
      setOpen(null); load();
    } catch (e) { toast.error(e.message); }
  };

  const convert = async (e) => {
    try {
      const d = await api(`/enquiries/${e.id}/convert`, { method: 'POST' });
      toast.success(`${d.customerName} added as a customer`);
      /* Hand the prefill to the quotation builder rather than creating the
         quotation here: what they asked for is not yet what you will
         charge, and somebody has to price it. */
      sessionStorage.setItem('quotation_prefill', JSON.stringify(d.prefill));
      navigate('/sales-quotations?from=enquiry');
    } catch (err) { toast.error(err.message); }
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <Inbox size={23} style={{ color: 'var(--brand-amber)' }} /> Enquiries
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
          People who found your catalogue and asked for something. Converting one adds them as a customer.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        {[['Total', summary.total, null], ['New', summary.new, '#2563eb'],
          ['Quoted', summary.quoted, '#8b5cf6'], ['Won', summary.won, '#10b981']].map(([l, v, c]) => (
          <div key={l} style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{l}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: c || 'var(--text-primary)', marginTop: 2 }}>{v ?? 0}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
        {['', 'New', 'Read', 'Quoted', 'Won', 'Ignored'].map(s => (
          <button key={s || 'all'} onClick={() => setFilter(s)} style={{
            padding: '6px 13px', borderRadius: 999, fontSize: '0.79rem', cursor: 'pointer',
            border: `1px solid ${filter === s ? 'var(--brand-amber)' : 'var(--border-default)'}`,
            background: filter === s ? 'hsl(28,100%,54%,0.12)' : 'transparent',
            color: filter === s ? 'var(--brand-amber)' : 'var(--text-secondary)', fontWeight: 600,
          }}>{s || 'All'}</button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', padding: 30, textAlign: 'center' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: 'center' }}>
          <Inbox size={28} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            No enquiries yet. Publish your catalogue in <strong>Configure → Catalogue</strong> and share the link.
          </p>
        </div>
      ) : (
        <div style={{ ...card, overflow: 'hidden' }}>
          {rows.map((e, i) => (
            <div key={e.id} onClick={() => openOne(e)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer',
              borderTop: i ? '1px solid var(--border-subtle)' : 'none',
              background: e.status === 'New' ? 'hsl(217,91%,60%,0.05)' : 'transparent',
            }}>
              <span style={{
                fontSize: '0.68rem', fontWeight: 800, padding: '3px 9px', borderRadius: 999,
                color: STATUS_COLOR[e.status], background: `${STATUS_COLOR[e.status]}1f`, whiteSpace: 'nowrap',
              }}>{e.status}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  {e.company || e.name}
                  {e.company && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {e.name}</span>}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.ref} · {e.item_count} item{e.item_count === 1 ? '' : 's'}{e.message ? ` · ${e.message}` : ''}
                </div>
              </div>
              <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <Clock size={11} /> {when(e.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div role="dialog" aria-label={`Enquiry ${open.ref}`} onClick={() => setOpen(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60,
        }}>
          <div onClick={ev => ev.stopPropagation()} style={{
            ...card, width: 'min(560px, 100%)', maxHeight: '85vh', overflowY: 'auto', padding: 22,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  {open.company || open.name}
                </h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  {open.ref} · {when(open.created_at)}
                </p>
              </div>
              <button onClick={() => setOpen(null)} aria-label="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: '0.83rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
              {open.name && <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Building2 size={13} /> {open.name}</span>}
              {open.phone && <a href={`tel:${open.phone}`} style={{ color: 'var(--brand-amber)', textDecoration: 'none', display: 'inline-flex', gap: 5, alignItems: 'center' }}><Phone size={13} /> {open.phone}</a>}
              {open.email && <a href={`mailto:${open.email}`} style={{ color: 'var(--brand-amber)', textDecoration: 'none', display: 'inline-flex', gap: 5, alignItems: 'center' }}><Mail size={13} /> {open.email}</a>}
            </div>

            {open.message && (
              <p style={{ background: 'var(--bg-elevated)', padding: 12, borderRadius: 9, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 14px' }}>
                {open.message}
              </p>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: 16 }}>
              <thead><tr>
                <th style={th}>What they want</th>
                <th style={{ ...th, textAlign: 'center' }}>Unit</th>
                <th style={{ ...th, textAlign: 'right' }}>Qty</th>
              </tr></thead>
              <tbody>
                {(open.items || []).map(i => (
                  <tr key={i.id}>
                    <td style={td}>{i.description}</td>
                    <td style={{ ...td, textAlign: 'center', color: 'var(--text-muted)' }}>{i.unit || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{i.quantity ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!open.customer_id && (
                <button onClick={() => convert(open)} className="btn-primary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ArrowRight size={14} /> Convert to quotation
                </button>
              )}
              {open.customer_id && (
                <span style={{ fontSize: '0.82rem', color: 'var(--accent-emerald)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Check size={14} /> Already a customer
                </span>
              )}
              <button onClick={() => setStatus(open.id, 'Won')} className="btn-secondary btn-sm">Mark won</button>
              <button onClick={() => setStatus(open.id, 'Ignored')} className="btn-secondary btn-sm">Ignore</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th = { textAlign: 'left', padding: '7px 8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border-subtle)' };
const td = { padding: '8px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' };
