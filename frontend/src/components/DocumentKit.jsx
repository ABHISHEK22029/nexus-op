/* ══════════════════════════════════════════════════════════
   DocumentKit — shared building blocks for every printed document.

   Built after rebuilding the tax invoice by hand: the same header, party
   blocks, bank box and signature were about to be copy-pasted into six more
   files, which is how they drift apart. One kit means fixing a compliance
   detail once instead of finding all seven places later.

   Each document still chooses WHICH blocks it needs — a quotation must not
   look like a tax invoice, and a delivery challan must say plainly that it
   isn't one.
   ══════════════════════════════════════════════════════════ */
import React from 'react';
import { AlertTriangle } from 'lucide-react';

export const rup = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

/* ── Company header: who we are, and the registrations a buyer needs ── */
export function CompanyHeader({ company = {}, title, meta = [] }) {
  const co = company;
  return (
    <div className="inv-header">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {co.logo_url && (
          <img src={co.logo_url} alt="" style={{ height: 44, width: 'auto', objectFit: 'contain' }}
            onError={e => { e.target.style.display = 'none'; }} />
        )}
        <div>
          <div className="inv-company-name">{co.name || '—'}</div>
          <div className="inv-company-detail">
            {co.address}{co.address && <br />}
            {co.gstin && <>GSTIN: <strong>{co.gstin}</strong>{co.pan ? ' · ' : <br />}</>}
            {co.pan && <>PAN: <strong>{co.pan}</strong><br /></>}
            {/* Udyam is worth printing: it entitles the supplier to the
                MSMED Act 45-day payment rule. */}
            {co.udyam_msme_no && <>Udyam/MSME: <strong>{co.udyam_msme_no}</strong><br /></>}
            {co.phone && <>Ph: {co.phone}</>}{co.email && <> · {co.email}</>}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="inv-po-title">{title}</div>
        {meta.filter(Boolean).map(([label, value, tone]) => (
          <div className="inv-meta-row" key={label}>
            {label}: <strong style={tone ? { color: tone } : undefined}>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── A party block (Bill To / Ship To / Vendor) ── */
export function Party({ title, name, address, gstin, state, note, required }) {
  return (
    <div className="inv-party">
      <div className="inv-party-title">
        {title}{note && <span style={{ fontWeight: 400, textTransform: 'none' }}> {note}</span>}
      </div>
      <div className="inv-party-name">{name || '—'}</div>
      <div className="inv-party-detail">
        {address || (required ? <em style={{ color: '#dc2626' }}>Address missing</em> : '—')}
        {address && <br />}
        {state && <>{state}<br /></>}
        {gstin !== undefined && <>GSTIN: <strong>{gstin || 'Unregistered'}</strong></>}
      </div>
    </div>
  );
}

/* ── The Rule 46 strip that must appear on the face of a tax document ── */
export function TaxMetaStrip({ placeOfSupply, placeOfSupplyCode, reverseCharge, extras = [] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: '8px 2px 12px', fontSize: '0.78rem', borderBottom: '1px solid #e5e7eb', marginBottom: 12 }}>
      <span>Place of Supply: <strong>{placeOfSupply || <em style={{ color: '#dc2626' }}>not set</em>}</strong>{placeOfSupplyCode ? ` (${placeOfSupplyCode})` : ''}</span>
      <span>Reverse Charge: <strong>{reverseCharge ? 'Yes' : 'No'}</strong></span>
      {extras.filter(Boolean).map(([l, v]) => <span key={l}>{l}: <strong>{v}</strong></span>)}
    </div>
  );
}

/* ── Bank details: without these the customer cannot pay ── */
export function BankBox({ company = {}, title = 'Bank Details for Payment' }) {
  const has = company.bank_name && company.bank_account_no && company.bank_ifsc;
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>{title}</div>
      {has ? (
        <table style={{ fontSize: '0.78rem', borderCollapse: 'collapse' }}>
          <tbody>
            {company.bank_account_name && <tr><td style={bl}>Account Name</td><td><strong>{company.bank_account_name}</strong></td></tr>}
            <tr><td style={bl}>Bank</td><td><strong>{company.bank_name}</strong></td></tr>
            <tr><td style={bl}>Account No.</td><td><strong>{company.bank_account_no}</strong></td></tr>
            <tr><td style={bl}>IFSC</td><td><strong>{company.bank_ifsc}</strong></td></tr>
            {company.bank_branch && <tr><td style={bl}>Branch</td><td>{company.bank_branch}</td></tr>}
            {company.upi_id && <tr><td style={bl}>UPI</td><td>{company.upi_id}</td></tr>}
          </tbody>
        </table>
      ) : (
        <div style={{ fontSize: '0.78rem', color: '#dc2626' }}>Not configured — add them in Company Profile.</div>
      )}
    </div>
  );
}
const bl = { paddingRight: 10, color: '#6b7280' };

/* ── Terms box ── */
export function TermsBox({ terms, title = 'Terms & Conditions' }) {
  if (!terms) return null;
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: '0.72rem', color: '#374151', whiteSpace: 'pre-wrap' }}>{terms}</div>
    </div>
  );
}

/* ── Signature block ── */
export function SignatureBlock({ company = {}, label = 'Authorized Signatory', receiver }) {
  return (
    <div className="inv-sig">
      {receiver && (
        <div>
          <div className="inv-sig-line"></div>
          <div className="inv-sig-label">{receiver}</div>
        </div>
      )}
      <div>
        <div className="inv-sig-line"></div>
        <div className="inv-sig-label">{label}</div>
        <div className="inv-sig-company mt-2">For {company.name || '—'}</div>
      </div>
    </div>
  );
}

/* ── Footer ── */
export function DocFooter({ company = {}, right, note }) {
  return (
    <div className="inv-footer">
      <div className="inv-footer-left">{note || company.invoice_footer_note || 'This is a computer-generated document.'}</div>
      <div className="inv-footer-right">{right}</div>
    </div>
  );
}

/* ── Pre-issue compliance warning. Screen only — never printed.
      Catching a missing field here is the difference between fixing it and
      having the customer's accounts team reject the document. ── */
export function ComplianceWarning({ gaps = [] }) {
  if (!gaps.length) return null;
  return (
    <div className="print:hidden" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700, fontSize: '0.88rem' }}>
        <AlertTriangle size={16} /> {gaps.length} field{gaps.length > 1 ? 's' : ''} missing — this document may be rejected
      </div>
      <ul style={{ margin: '6px 0 0 20px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        {gaps.map(g => <li key={g}>{g}</li>)}
      </ul>
    </div>
  );
}

/* ── "This is not a tax invoice" notice, for quotations and challans.
      A proforma that looks like a tax invoice implies input tax credit that
      does not exist — worth stating plainly rather than relying on the title. ── */
export function NotATaxInvoice({ children }) {
  return (
    <div style={{ border: '1px dashed #9ca3af', borderRadius: 6, padding: '7px 11px', margin: '10px 0', fontSize: '0.75rem', color: '#4b5563', background: '#f9fafb' }}>
      {children}
    </div>
  );
}

/* Shared gap-checker so every document asks the same questions. */
export function complianceGaps({ company = {}, party = {}, placeOfSupply, needsBank = true, needsPlaceOfSupply = true }) {
  return [
    !company.gstin && 'Your GSTIN (set it in Company Profile)',
    needsPlaceOfSupply && !placeOfSupply && 'Place of supply',
    !party.address && `${party.label || 'Party'} address`,
    needsBank && !(company.bank_name && company.bank_account_no && company.bank_ifsc)
      && 'Your bank details (Company Profile) — the other party cannot pay without them',
  ].filter(Boolean);
}
