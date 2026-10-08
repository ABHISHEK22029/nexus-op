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
import LogoUploader from '../components/LogoUploader';
import { Building2, Landmark, ReceiptIndianRupee, Save, CheckCircle2, AlertTriangle, Info, Undo2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { formProblems, fixMessage } from '../lib/validators';

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
/* Checked as typed, and again by the server (shared/validators). */
const CHECKS = {
  phone: 'phone', email: 'email', gstin: 'gstin', pan: 'pan',
  bank_account_name: 'accountHolder', bank_account_no: 'accountNumber', bank_ifsc: 'ifsc',
};
const LABELS = {
  phone: 'Phone', email: 'Email', gstin: 'GSTIN', pan: 'PAN',
  bank_account_name: 'Account holder name', bank_account_no: 'Account number', bank_ifsc: 'IFSC code',
};
/* Every field this page edits — what "unsaved changes" is measured over. */
const EDITED = [
  'name', 'tradeName', 'address', 'phone', 'email', 'website', 'logo_url',
  'gstin', 'stateCode', 'pan', 'udyam_msme_no', 'cin', 'trade_license_no',
  'bank_account_name', 'bank_name', 'bank_account_no', 'bank_ifsc', 'bank_branch', 'upi_id',
  'default_payment_terms_days', 'fyStart', 'invoice_terms', 'invoice_footer_note',
];
const UPPER = new Set(['gstin', 'pan', 'bank_ifsc']);
const LEAVE = 'You have unsaved changes to the company profile. Leave without saving them?';

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
  /* The profile as last loaded or saved — what "unsaved" is measured against,
     and what Discard goes back to. */
  const [stored, setStored] = useState(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [touched, setTouched] = useState({});
  const [tried, setTried] = useState(false);
  const [serverErr, setServerErr] = useState({});

  useEffect(() => {
    fetch(`${API}/company-profile`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not load company profile'))))
      .then(d => { setForm(d); setStored(d); })
      .catch(e => setLoadError(e.message));
  }, []);

  const dirty = !!form && !!stored && EDITED.some(k => String(form[k] ?? '') !== String(stored[k] ?? ''));
  /* A value the profile already held and that has not been touched is not
     re-checked, so an older odd value never blocks saving something else. */
  const problems = form
    ? { ...formProblems(form, CHECKS, { original: stored, pair: ['gstin', 'pan'] }), ...Object.fromEntries(Object.entries(serverErr).filter(([, v]) => v)) }
    : {};
  const errorFor = (k) => ((touched[k] || tried) ? problems[k] : null);
  const touch = (k) => () => setTouched(t => (t[k] ? t : { ...t, [k]: true }));

  /* Leaving with changes not saved: the browser asks on a reload or a closed
     tab, and moving to another screen inside the app asks first too. The
     app runs on a plain BrowserRouter, which has no navigation blocker, so
     the one door every in-app move goes through — history.pushState, used
     by links and by the sidebar's buttons alike — asks while this page has
     something unsaved, and is put back the moment it has not. */
  useEffect(() => {
    if (!dirty) return undefined;
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    const push = window.history.pushState;
    window.history.pushState = function guarded(state, title, url) {
      const to = url == null ? null : new URL(String(url), window.location.href);
      if (to && to.pathname !== window.location.pathname && !window.confirm(LEAVE)) return undefined;
      return push.call(this, state, title, url);
    };
    window.addEventListener('beforeunload', onUnload);
    return () => { window.history.pushState = push; window.removeEventListener('beforeunload', onUnload); };
  }, [dirty]);

  /* On a phone the bar sits above the Ask AI button rather than under it. */
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 720px)').matches);
  useEffect(() => {
    const m = window.matchMedia?.('(max-width: 720px)');
    if (!m) return undefined;
    const on = (e) => setNarrow(e.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    if (!justSaved) return undefined;
    const t = setTimeout(() => setJustSaved(false), 4000);
    return () => clearTimeout(t);
  }, [justSaved]);

  const set = (k) => (e) => {
    const value = UPPER.has(k) ? e.target.value.toUpperCase() : e.target.value;
    setServerErr(x => (x[k] ? { ...x, [k]: null } : x));
    setJustSaved(false);
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
    /* A wrong field is marked and focused, and the bar says which — the
       button never just sits there doing nothing. */
    if (Object.keys(problems).length) {
      setTried(true);
      const first = Object.keys(problems)[0];
      document.querySelector(`[data-field="${first}"]`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/company-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.field && LABELS[data.field]) {
          setServerErr(x => ({ ...x, [data.field]: String(data.error || '').replace(/^[^:]+:\s*/, '') }));
          setTried(true);
        }
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      setForm(data);
      setStored(data);
      setTouched({}); setTried(false);
      setJustSaved(true);
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
        {/* "btn btn-amber" was a class nothing defined, so this rendered as a
            plain grey box. Primary when there is something to save; otherwise
            it says the profile is saved. */}
        {dirty ? (
          <button onClick={save} disabled={saving} className="btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            <Save size={16} /> {saving ? 'Saving…' : 'Save changes'}
          </button>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', fontWeight: 600, color: justSaved ? '#16a34a' : 'var(--text-muted)', padding: '8px 4px' }}>
            <CheckCircle2 size={15} /> {justSaved ? 'Saved' : 'All changes saved'}
          </span>
        )}
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
        <Field label="Phone" k="phone" value={form.phone} onChange={set('phone')} onBlur={touch('phone')} error={errorFor('phone')} type="tel" />
        <Field label="Email" k="email" value={form.email} onChange={set('email')} onBlur={touch('email')} error={errorFor('email')} type="email" />
        <Field label="Website" value={form.website} onChange={set('website')} />
        {/* The file upload leads; the URL field stays underneath for anyone
            already using one, and as the fallback when nothing is uploaded. */}
        <LogoUploader />
        <Field label="Logo URL" value={form.logo_url} onChange={set('logo_url')}
          hint="Optional fallback — used only when no logo file has been uploaded" />
      </Section>

      <Section icon={<ReceiptIndianRupee size={16} />} title="Tax & registration" hint="GSTIN determines your state, which decides CGST+SGST vs IGST.">
        <Field label="GSTIN" k="gstin" required value={form.gstin} onChange={set('gstin')} onBlur={touch('gstin')} error={errorFor('gstin')} maxLength={15} hint="15 characters — the first two digits set your state code" />
        <Field label="State code" required value={form.stateCode} onChange={set('stateCode')} hint="Auto-filled from your GSTIN" />
        <Field label="PAN" k="pan" value={form.pan} onChange={set('pan')} onBlur={touch('pan')} error={errorFor('pan')} maxLength={10} />
        <Field label="Udyam / MSME number" value={form.udyam_msme_no} onChange={set('udyam_msme_no')}
          hint="Printing this entitles you to the MSMED Act 45-day payment rule" />
        <Field label="CIN" value={form.cin} onChange={set('cin')} hint="Companies only" />
        <Field label="Trade licence number" value={form.trade_license_no} onChange={set('trade_license_no')} />
      </Section>

      <Section icon={<Landmark size={16} />} title="Bank details" hint="Printed on invoices so customers know exactly where to pay. Without these, expect payment delays.">
        <Field label="Account holder name" k="bank_account_name" value={form.bank_account_name} onChange={set('bank_account_name')} onBlur={touch('bank_account_name')} error={errorFor('bank_account_name')} />
        <Field label="Bank name" required value={form.bank_name} onChange={set('bank_name')} />
        <Field label="Account number" k="bank_account_no" required value={form.bank_account_no} onChange={set('bank_account_no')} onBlur={touch('bank_account_no')} error={errorFor('bank_account_no')} inputMode="numeric" maxLength={18} />
        <Field label="IFSC code" k="bank_ifsc" required value={form.bank_ifsc} onChange={set('bank_ifsc')} onBlur={touch('bank_ifsc')} error={errorFor('bank_ifsc')} maxLength={11} />
        <Field label="Branch" value={form.bank_branch} onChange={set('bank_branch')} />
        <Field label="UPI ID" value={form.upi_id} onChange={set('upi_id')} hint="Optional — useful for smaller payments" />
      </Section>

      <Section icon={<ReceiptIndianRupee size={16} />} title="Invoice defaults" hint="Applied to new invoices; you can still override them per invoice.">
        <Field label="Default payment terms (days)" type="number" min="0" inputMode="numeric" value={form.default_payment_terms_days} onChange={set('default_payment_terms_days')}
          hint="Used to calculate the due date automatically" />
        <Field label="Financial year starts" value={form.fyStart} onChange={set('fyStart')} hint="Used for invoice numbering series" />
        <Field label="Default invoice terms" value={form.invoice_terms} onChange={set('invoice_terms')} textarea
          hint="e.g. payment terms, interest on delay, jurisdiction" />
        <Field label="Invoice footer note" value={form.invoice_footer_note} onChange={set('invoice_footer_note')} textarea />
      </Section>

      {/* Unsaved changes stay in view at the foot of the screen wherever you
          have scrolled to, with the way to save them or throw them away. The
          save button used to sit at the very bottom of a long form, styled
          by a class that did not exist, and was easy to miss entirely. */}
      {(dirty || justSaved) && (
        <div role="region" aria-label="Unsaved changes" data-save-bar
          style={{
            position: 'sticky', bottom: narrow ? 84 : 12, zIndex: 30, marginTop: 20,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '12px 16px', borderRadius: 12,
            background: 'var(--bg-surface)',
            border: `1px solid ${dirty ? 'var(--brand-amber)' : 'rgba(34,197,94,0.45)'}`,
            boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
          }}>
          {dirty ? (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 99, background: 'var(--brand-amber)', flexShrink: 0 }} /> Unsaved changes
              </span>
              {tried && Object.keys(problems).length > 0 && (
                <span role="alert" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#dc2626', flexBasis: '100%', order: 3 }}>
                  {fixMessage(problems, LABELS)}
                </span>
              )}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn-secondary" disabled={saving}
                  onClick={() => { setForm(stored); setTouched({}); setTried(false); setServerErr({}); }}>
                  <Undo2 size={14} /> Discard
                </button>
                <button type="button" onClick={save} disabled={saving} className="btn-primary btn-sm"
                  style={{ cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  <Save size={15} /> {saving ? 'Saving…' : 'Save changes'}
                </button>
              </span>
            </>
          ) : (
            <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#16a34a' }}>
              <CheckCircle2 size={16} /> Saved — new documents will use these details
            </span>
          )}
        </div>
      )}
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

function Field({ label, value, onChange, onBlur, hint, error, required, textarea, type = 'text', k, ...rest }) {
  const style = {
    width: '100%', padding: '9px 11px', borderRadius: 8,
    border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
    color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit',
  };
  const blank = required && !String(value ?? '').trim();
  const edge = error ? '#dc2626' : blank ? 'rgba(239,68,68,0.5)' : style.border;
  return (
    <label style={{ display: 'block', gridColumn: textarea ? '1 / -1' : 'auto' }}>
      <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: 5, color: 'var(--text-secondary)' }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </span>
      {textarea
        ? <textarea rows={2} value={value ?? ''} onChange={onChange} style={{ ...style, resize: 'vertical', borderColor: blank ? 'rgba(239,68,68,0.5)' : style.border }} />
        : <input type={type} value={value ?? ''} onChange={onChange} onBlur={onBlur} data-field={k} aria-invalid={error ? true : undefined}
            autoComplete={k ? 'off' : undefined} {...rest} style={{ ...style, borderColor: edge, boxShadow: error ? 'inset 0 0 0 1px #dc2626' : undefined }} />}
      {error
        ? <span role="alert" style={{ display: 'block', fontSize: '0.75rem', color: '#dc2626', marginTop: 4 }}>{error}</span>
        : hint && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{hint}</span>}
    </label>
  );
}
