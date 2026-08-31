/* ══════════════════════════════════════════════════════════
   Company Profile — the single source of truth printed on every
   document (invoices, quotations, challans, POs).

   Why this page exists: bank details, MSME/Udyam number and the
   supplier state had nowhere to live, so invoices could not tell a
   customer where to pay and could be rejected as non-compliant.

   The completeness panel is the point of the screen — it tells the
   user what is missing BEFORE a customer's accounts team finds it.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Landmark, ReceiptIndianRupee, Save, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* Fields a GST tax invoice legally needs from OUR side, plus the bank
   details without which the customer cannot actually pay. */
const REQUIRED = [
  ['name', 'Registered business name'],
  ['address', 'Registered address'],
  ['gstin', 'GSTIN'],
  ['stateCode', 'State code (drives CGST/SGST vs IGST)'],
  ['bank_name', 'Bank name'],
  ['bank_account_no', 'Bank account number'],
  ['bank_ifsc', 'IFSC code'],
];
const RECOMMENDED = [
  ['pan', 'PAN (needed when customers deduct TDS)'],
  ['udyam_msme_no', 'Udyam / MSME number (entitles you to 45-day payment protection)'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['invoice_terms', 'Default invoice terms'],
];

export default function CompanyProfile() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetch(`${API}/company-profile`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not load company profile'))))
      .then(setForm)
      .catch(e => setLoadError(e.message));
  }, []);

  const set = (k) => (e) => {
    const value = e.target.value;
    setForm(f => {
      const next = { ...f, [k]: value };
      // The first two digits of a GSTIN ARE the state code — derive it so the
      // tax split can never silently disagree with the GSTIN.
      if (k === 'gstin' && /^\d{2}/.test(value)) next.stateCode = value.substring(0, 2);
      return next;
    });
  };

  const missing = useMemo(() => {
    if (!form) return { required: [], recommended: [] };
    const blank = (k) => !String(form[k] ?? '').trim();
    return {
      required: REQUIRED.filter(([k]) => blank(k)),
      recommended: RECOMMENDED.filter(([k]) => blank(k)),
    };
  }, [form]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/company-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      setForm(data);
      toast?.success?.('Company profile saved — it will appear on new documents');
    } catch (e) {
      toast?.error?.(e.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <Shell><Banner tone="bad" icon={<AlertTriangle size={16} />} title="Could not load company profile" body={loadError} /></Shell>;
  if (!form) return <Shell><p style={{ color: 'var(--text-muted)' }}>Loading…</p></Shell>;

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>Company Profile</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: 4, maxWidth: '60ch' }}>
            These details are printed on every invoice, quotation, challan and purchase order you generate.
          </p>
        </div>
        <button onClick={save} disabled={saving} className="btn btn-amber"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          <Save size={16} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {/* The whole reason this screen exists: surface what's missing before a
          customer's accounts team rejects the invoice. */}
      {missing.required.length > 0 ? (
        <Banner tone="bad" icon={<AlertTriangle size={16} />}
          title={`${missing.required.length} required field${missing.required.length > 1 ? 's' : ''} missing — invoices may be rejected`}
          body={<ul style={{ margin: '6px 0 0 18px' }}>{missing.required.map(([k, l]) => <li key={k}>{l}</li>)}</ul>} />
      ) : (
        <Banner tone="good" icon={<CheckCircle2 size={16} />}
          title="Ready for compliant invoicing"
          body="Your business identity, GSTIN and bank details are all set." />
      )}

      {missing.recommended.length > 0 && (
        <Banner tone="info" icon={<Info size={16} />} title="Recommended, not blocking"
          body={<ul style={{ margin: '6px 0 0 18px' }}>{missing.recommended.map(([k, l]) => <li key={k}>{l}</li>)}</ul>} />
      )}

      <Section icon={<Building2 size={16} />} title="Business identity" hint="Appears in the header of every document.">
        <Field label="Registered business name" required value={form.name} onChange={set('name')} />
        <Field label="Trade name" value={form.tradeName} onChange={set('tradeName')} hint="Shown if different from the registered name" />
        <Field label="Registered address" required value={form.address} onChange={set('address')} textarea />
        <Field label="Phone" value={form.phone} onChange={set('phone')} />
        <Field label="Email" value={form.email} onChange={set('email')} />
        <Field label="Website" value={form.website} onChange={set('website')} />
        <Field label="Logo URL" value={form.logo_url} onChange={set('logo_url')} hint="Public image link, printed on documents" />
      </Section>

      <Section icon={<ReceiptIndianRupee size={16} />} title="Tax & registration" hint="GSTIN determines your state, which decides CGST+SGST vs IGST.">
        <Field label="GSTIN" required value={form.gstin} onChange={set('gstin')} hint="15 characters — the first two digits set your state code" />
        <Field label="State code" required value={form.stateCode} onChange={set('stateCode')} hint="Auto-filled from your GSTIN" />
        <Field label="PAN" value={form.pan} onChange={set('pan')} />
        <Field label="Udyam / MSME number" value={form.udyam_msme_no} onChange={set('udyam_msme_no')}
          hint="Printing this entitles you to the MSMED Act 45-day payment rule" />
        <Field label="CIN" value={form.cin} onChange={set('cin')} hint="Companies only" />
        <Field label="Trade licence number" value={form.trade_license_no} onChange={set('trade_license_no')} />
      </Section>

      <Section icon={<Landmark size={16} />} title="Bank details" hint="Printed on invoices so customers know exactly where to pay. Without these, expect payment delays.">
        <Field label="Account holder name" value={form.bank_account_name} onChange={set('bank_account_name')} />
        <Field label="Bank name" required value={form.bank_name} onChange={set('bank_name')} />
        <Field label="Account number" required value={form.bank_account_no} onChange={set('bank_account_no')} />
        <Field label="IFSC code" required value={form.bank_ifsc} onChange={set('bank_ifsc')} />
        <Field label="Branch" value={form.bank_branch} onChange={set('bank_branch')} />
        <Field label="UPI ID" value={form.upi_id} onChange={set('upi_id')} hint="Optional — useful for smaller payments" />
      </Section>

      <Section icon={<ReceiptIndianRupee size={16} />} title="Invoice defaults" hint="Applied to new invoices; you can still override them per invoice.">
        <Field label="Default payment terms (days)" type="number" value={form.default_payment_terms_days} onChange={set('default_payment_terms_days')}
          hint="Used to calculate the due date automatically" />
        <Field label="Financial year starts" value={form.fyStart} onChange={set('fyStart')} hint="Used for invoice numbering series" />
        <Field label="Default invoice terms" value={form.invoice_terms} onChange={set('invoice_terms')} textarea
          hint="e.g. payment terms, interest on delay, jurisdiction" />
        <Field label="Invoice footer note" value={form.invoice_footer_note} onChange={set('invoice_footer_note')} textarea />
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button onClick={save} disabled={saving} className="btn btn-amber"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          <Save size={16} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Shell>
  );
}

/* ── small presentational helpers ─────────────────────────── */
const Shell = ({ children }) => <div style={{ maxWidth: 900 }}>{children}</div>;

function Banner({ tone, icon, title, body }) {
  const tones = {
    good: { bg: 'rgba(34,197,94,0.10)', bd: 'rgba(34,197,94,0.35)', fg: '#16a34a' },
    bad: { bg: 'rgba(239,68,68,0.10)', bd: 'rgba(239,68,68,0.35)', fg: '#dc2626' },
    info: { bg: 'rgba(59,130,246,0.10)', bd: 'rgba(59,130,246,0.30)', fg: '#2563eb' },
  }[tone] || {};
  return (
    <div style={{ background: tones.bg, border: `1px solid ${tones.bd}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tones.fg, fontWeight: 600, fontSize: '0.9rem' }}>
        {icon} {title}
      </div>
      {body && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>{body}</div>}
    </div>
  );
}

function Section({ icon, title, hint, children }) {
  return (
    <div className="card" style={{ padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span style={{ color: 'var(--brand-amber)' }}>{icon}</span>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{title}</h2>
      </div>
      {hint && <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 14px' }}>{hint}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, hint, required, textarea, type = 'text' }) {
  const style = {
    width: '100%', padding: '9px 11px', borderRadius: 8,
    border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
    color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit',
  };
  const blank = required && !String(value ?? '').trim();
  return (
    <label style={{ display: 'block', gridColumn: textarea ? '1 / -1' : 'auto' }}>
      <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: 5, color: 'var(--text-secondary)' }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </span>
      {textarea
        ? <textarea rows={2} value={value ?? ''} onChange={onChange} style={{ ...style, resize: 'vertical', borderColor: blank ? 'rgba(239,68,68,0.5)' : style.border }} />
        : <input type={type} value={value ?? ''} onChange={onChange} style={{ ...style, borderColor: blank ? 'rgba(239,68,68,0.5)' : style.border }} />}
      {hint && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{hint}</span>}
    </label>
  );
}
