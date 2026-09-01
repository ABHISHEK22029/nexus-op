/* ══════════════════════════════════════════════════════════
   Credit / Debit Note — the only lawful way to change an issued invoice.

   Section 31 forbids editing an invoice once it has gone out; a correction
   travels as a separate note that points back at the original. That pointer
   is the whole document: Section 34 read with Rule 53(1A) requires the
   original invoice's NUMBER and DATE on the face of the note, because the
   date is what ties it to a tax period in the GSTR-1 credit note table.

   The note carried the number but not the date. Both print now, and a
   missing reference is called out on screen rather than discovered by the
   customer's accounts team.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import {
  CompanyHeader, Party, SignatureBlock, DocFooter, ComplianceWarning, fmtDate,
} from '../components/DocumentKit';

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

  /* The reference to the original invoice is what makes this note lawful,
     so its absence is a compliance gap, not a cosmetic one. */
  const gaps = [
    !co.gstin && 'Your GSTIN (set it in Company Profile)',
    !party.gstin && `${n.party_type === 'vendor' ? 'Vendor' : 'Customer'} GSTIN`,
    !n.ref_number && 'Original invoice number — Section 34 requires this note to reference it',
    !n.ref_date && 'Original invoice date — needed to report this note in the right tax period',
    !n.reason && 'Reason for the note',
  ].filter(Boolean);
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

      <div className="no-print"><ComplianceWarning gaps={gaps} /></div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 32 }}>
        <CompanyHeader
          company={co}
          title={title}
          meta={[
            ['No.', n.note_number],
            ['Date', fmtDate(n.note_date)],
            n.status && ['Status', n.status],
          ]}
        />

        {/* The reference block. Without both the number AND the date this
            note cannot be reported against the right tax period. */}
        <div style={{ border: '1px solid var(--border-default)', borderRadius: 8, padding: '10px 13px', marginBottom: 16, background: 'rgba(0,0,0,0.015)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 5 }}>
            Issued against original document
          </div>
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <span>Number: <strong style={{ fontFamily: 'var(--font-mono)' }}>
              {n.ref_number || <em style={{ color: '#dc2626', fontFamily: 'inherit' }}>not referenced</em>}
            </strong></span>
            <span>Dated: <strong>
              {n.ref_date ? fmtDate(n.ref_date) : <em style={{ color: '#dc2626', fontWeight: 400 }}>not recorded</em>}
            </strong></span>
            {n.ref_type && <span style={{ color: 'var(--text-muted)' }}>({String(n.ref_type).replace(/_/g, ' ')})</span>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <Party
            title={n.party_type === 'vendor' ? 'Vendor' : 'Customer'}
            name={party.name}
            address={party.billing_address || party.address}
            state={party.state}
            gstin={party.gstin}
            required
          />
          <div style={{ fontSize: '0.85rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 4 }}>Reason</div>
            <div style={{ color: 'var(--text-secondary)' }}>
              {n.reason || <em style={{ color: '#dc2626' }}>No reason recorded — a note without a stated reason invites a query.</em>}
            </div>
          </div>
        </div>

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

        <div style={{ border: '1px dashed #9ca3af', borderRadius: 6, padding: '7px 11px', margin: '14px 0', fontSize: '0.75rem', color: '#4b5563', background: '#f9fafb' }}>
          {n.note_type === 'credit'
            ? <>Issued under Section 34(1). The tax liability on the original invoice is reduced to the extent shown, provided the recipient has reversed the corresponding input tax credit.</>
            : <>Issued under Section 34(3). This note increases the taxable value and tax charged on the original invoice referenced above.</>}
        </div>

        <SignatureBlock company={co} />
        <DocFooter company={co} right={n.note_number} />
      </div>
    </div>
  );
}
