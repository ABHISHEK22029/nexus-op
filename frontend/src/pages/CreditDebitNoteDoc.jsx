import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (d) => (d ? String(d).slice(0, 10) : '—');

export default function CreditDebitNoteDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [n, setN] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => { fetch(`${API}/credit-debit-notes/${id}`).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setN).catch(() => setErr(true)); }, [id]);

  if (err) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Note not found. <button onClick={() => navigate('/credit-debit-notes')} className="btn-secondary" style={{ marginLeft: 8 }}>Back</button></div>;
  if (!n) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div>;

  const co = n.company || {}; const party = n.party || {};
  const title = n.note_type === 'credit' ? 'CREDIT NOTE' : 'DEBIT NOTE';
  const th = { padding: '9px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)' };
  const td = { padding: '9px 10px', fontSize: '0.85rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' };
  const totRow = (l, v, bold) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: bold ? '1rem' : '0.85rem', fontWeight: bold ? 800 : 500, color: bold ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
      <span>{l}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{v}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => navigate('/credit-debit-notes')} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={15} /> All Notes</button>
        <button onClick={() => window.print()} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Printer size={15} /> Print</button>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, borderBottom: '2px solid var(--brand-amber)', paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{co.name || 'Your Company'}</div>
            {co.gstin && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>GSTIN: {co.gstin}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-amber)' }}>{title}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700 }}>{n.note_number}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Date: {fmt(n.note_date)}</div>
            {n.ref_number && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Against: {n.ref_number}</div>}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 4 }}>{n.party_type === 'vendor' ? 'Vendor' : 'Customer'}</div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{party.name || '—'}</div>
          {party.gstin && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>GSTIN: {party.gstin}</div>}
        </div>
        {n.reason && <div style={{ marginBottom: 14, fontSize: '0.85rem', color: 'var(--text-secondary)' }}><b>Reason:</b> {n.reason}</div>}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>Description</th>
              <th style={{ ...th, textAlign: 'left' }}>HSN</th>
              <th style={{ ...th, textAlign: 'right' }}>Qty</th>
              <th style={{ ...th, textAlign: 'right' }}>Rate</th>
              <th style={{ ...th, textAlign: 'right' }}>Amount</th>
            </tr></thead>
            <tbody>
              {(n.items || []).map((it, i) => (
                <tr key={it.id}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{it.description}</td>
                  <td style={{ ...td, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{it.hsn || '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{it.quantity} {it.uom}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{rupee(it.rate)}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{rupee(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <div style={{ width: 300 }}>
            {totRow('Sub-total', rupee(n.sub_total))}
            {n.interstate ? totRow(`IGST (${n.gst_rate}%)`, rupee(n.igst)) : (<>{totRow(`CGST (${n.gst_rate / 2}%)`, rupee(n.cgst))}{totRow(`SGST (${n.gst_rate / 2}%)`, rupee(n.sgst))}</>)}
            <div style={{ borderTop: '1px solid var(--border-default)', marginTop: 6, paddingTop: 6 }}>{totRow('Total', rupee(n.total), true)}</div>
          </div>
        </div>
        {n.amount_in_words && <div style={{ marginTop: 14, fontSize: '0.82rem', color: 'var(--text-secondary)' }}><b>In words:</b> {n.amount_in_words}</div>}
        <div style={{ marginTop: 30, textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-muted)' }}>For {co.name || 'Your Company'}</div>
      </div>
    </div>
  );
}
