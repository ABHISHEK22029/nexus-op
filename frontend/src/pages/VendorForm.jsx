import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  User, FileText, MapPin, CreditCard, ShieldCheck,
  ChevronRight, ChevronLeft, Save, X, CheckCircle,
  Building2, Phone, Mail, Globe, AlertCircle, Loader2
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import CategoryPicker from '../components/CategoryPicker';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* ── Theme-aware style helpers ── */
const card = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '16px',
  boxShadow: 'var(--shadow-sm)',
};
const inputStyle = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '0.875rem',
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'border-color 150ms ease',
};

const TABS = [
  { id: 0, label: 'Primary Contact',  icon: User },
  { id: 1, label: 'Tax & Payment',    icon: FileText },
  { id: 2, label: 'Address',          icon: MapPin },
  { id: 3, label: 'Bank Details',     icon: CreditCard },
  { id: 4, label: 'Compliance',       icon: ShieldCheck },
];

const INITIAL = {
  name: '', displayName: '', vendorCode: '', type: '',
  supplyCategory: '', supplies: '',
  contactPerson: '', email: '', mobile: '', whatsapp: '', website: '',
  contractorClass: '', capabilityScope: '', safetyRating: '',
  gstin: '', pan: '', gstTreatment: '', tdsSection: '',
  currency: 'INR', retentionPct: '5', paymentTerms: 'Due on Receipt',
  creditLimit: '', isMsme: false, msmeNumber: '', msmeType: '',
  addrLine1: '', addrLine2: '', city: '', state: '', pincode: '',
  latitude: '', longitude: '',
  bankName: '', accountHolder: '', accountNumber: '', accountType: 'Current',
  ifscCode: '', micrCode: '', branchName: '', branchAddress: '',
  epfNumber: '', esiNumber: '', labourLicense: '', labourLicenseExp: '',
  isoCert: '', isoExpiry: '', pfRegistered: false,
  agreementDate: '', agreementExpiry: '', empanelledAt: '',
};

const VENDOR_TYPES = [
  'Civil Contractor','Material Supplier','Equipment Provider',
  'Labour Contractor','Electrical','Transporter','Consultant','IT Hardware','Other',
];
const CONTRACTOR_CLASSES = [
  { v: 'Special', l: 'Special Class — Above ₹500 Cr' },
  { v: 'A', l: 'Class A — Above ₹100 Cr' },
  { v: 'B', l: 'Class B — ₹25 Cr to ₹100 Cr' },
  { v: 'C', l: 'Class C — ₹5 Cr to ₹25 Cr' },
  { v: 'D', l: 'Class D — Below ₹5 Cr' },
];
const PAYMENT_TERMS = ['Due on Receipt','Net 15','Net 30','Net 45','Net 60','2/10 Net 30'];
const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa',
  'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
  'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
  'Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu & Kashmir','Ladakh',
];

/* ── Sub-components ── */
const SectionTitle = ({ children }) => (
  <p style={{
    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: 'var(--brand-amber)',
    marginBottom: '12px', marginTop: '20px',
  }}>{children}</p>
);

const Field = ({ label, required, hint, error, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
      {label} {required && <span style={{ color: 'var(--accent-red)' }}>*</span>}
    </label>
    {children}
    {hint && !error && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{hint}</p>}
    {error && (
      <p style={{ fontSize: '0.7rem', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <AlertCircle size={11}/>{error}
      </p>
    )}
  </div>
);

const ThemeInput = ({ icon: Icon, style: extra = {}, ...props }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      {Icon && (
        <Icon size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
      )}
      <input
        style={{
          ...inputStyle, ...(Icon ? { paddingLeft: 34 } : {}), ...extra,
          borderColor: focused ? 'var(--brand-amber)' : 'var(--border-default)',
          boxShadow: focused ? '0 0 0 3px var(--brand-amber-muted)' : 'none',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
    </div>
  );
};

const ThemeSelect = ({ children, style: extra = {}, ...props }) => {
  const [focused, setFocused] = useState(false);
  return (
    <select
      style={{
        ...inputStyle, cursor: 'pointer', ...extra,
        borderColor: focused ? 'var(--brand-amber)' : 'var(--border-default)',
        boxShadow: focused ? '0 0 0 3px var(--brand-amber-muted)' : 'none',
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...props}
    >
      {children}
    </select>
  );
};

const Toggle = ({ label, hint, checked, onChange }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)', borderRadius: 10,
  }}>
    <div>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>{label}</p>
      {hint && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{hint}</p>}
    </div>
    <button type="button" onClick={() => onChange(!checked)} style={{
      position: 'relative', width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
      background: checked ? 'var(--brand-amber)' : 'var(--border-default)',
      transition: 'background 200ms ease', flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16,
        borderRadius: '50%', background: 'white',
        transition: 'left 200ms ease', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        display: 'block',
      }} />
    </button>
  </div>
);

export default function VendorForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { activeProject } = useProject();
  const [activeTab, setActiveTab] = useState(0);
  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(id || null);
  const [tabSaved, setTabSaved] = useState({});
  const [toast, setToast] = useState(null);

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }));
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const validateTab = (tab) => {
    const errs = {};
    if (tab === 0) {
      if (!form.name.trim()) errs.name = 'Company name is required';
      if (!form.type) errs.type = 'Vendor type is required';
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email';
    }
    if (tab === 1) {
      if (form.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstin))
        errs.gstin = 'Invalid GSTIN format (e.g. 22AAAAA0000A1Z5)';
      if (form.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.pan))
        errs.pan = 'Invalid PAN (e.g. AAAAA0000A)';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveCurrentTab = async () => {
    if (!validateTab(activeTab)) return false;
    setSaving(true);
    try {
      const token = localStorage.getItem('nexus_token');
      const headers = { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) };
      
      /* Map the whole form onto the vendor record. This previously sent only
         name/type/pan/gstin, so every other field the user filled in across
         the five tabs — contact, address, bank, capability, compliance — was
         silently discarded on save. */
      const joinAddress = [form.addrLine1, form.addrLine2].filter(Boolean).join(', ');
      const payload = {
        projectId: activeProject?.id || 1,
        name: form.name,
        type: form.type,
        display_name: form.displayName || null,
        vendor_code: form.vendorCode || null,
        // Identity / tax
        pan: form.pan || null,
        gstin: form.gstin || null,
        class: form.contractorClass || null,
        // What they actually supply — the answer to "who sells us steel?"
        capability_tags: form.supplies || form.capabilityScope || null,
        supply_category: form.supplyCategory || null,
        supplies: form.supplies || null,
        // Contact
        contactName: form.contactPerson || null,
        contactPhone: form.mobile || null,
        contactEmail: form.email || null,
        website: form.website || null,
        // Address
        address: joinAddress || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        // Commercial terms
        payment_terms: form.paymentTerms || null,
        credit_limit: form.creditLimit === '' ? null : form.creditLimit,
        currency: form.currency || 'INR',
        // Bank — needed to pay them and reconcile vendor payments
        bank_name: form.bankName || null,
        account_holder: form.accountHolder || null,
        account_number: form.accountNumber || null,
        ifsc_code: form.ifscCode || null,
        branch_name: form.branchName || null,
        // Registration / compliance
        is_msme: !!form.isMsme,
        msme_number: form.msmeNumber || null,
        labour_license: form.labourLicense || null,
        iso_cert: form.isoCert || null,
        status: 'Active',
      };

      if (!savedId) {
        const res = await fetch(`${API}/vendors`, { method: 'POST', headers, body: JSON.stringify(payload) });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Could not save the vendor. Please try again.');
        }
        const data = await res.json();
        setSavedId(data.id);
      } else {
        const res = await fetch(`${API}/vendors/${savedId}`, { method: 'PATCH', headers, body: JSON.stringify(payload) });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Could not update the vendor. Please try again.');
        }
      }
      setTabSaved(t => ({ ...t, [activeTab]: true }));
      showToast(`${TABS[activeTab].label} saved`);
      return true;
    } catch (err) {
      console.error(err);
      showToast('Save failed — check connection', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const ok = await saveCurrentTab();
    if (ok && activeTab < 4) setActiveTab(t => t + 1);
  };

  const handleFinish = async () => {
    const ok = await saveCurrentTab();
    if (ok) { showToast('Vendor saved!'); setTimeout(() => navigate('/vendors'), 1000); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: '32px 24px' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 999,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 18px', borderRadius: 12,
          background: toast.type === 'error' ? 'var(--bg-surface)' : 'var(--bg-surface)',
          border: `1px solid ${toast.type === 'error' ? 'var(--accent-red)' : 'var(--brand-amber)'}`,
          boxShadow: 'var(--shadow-md)',
          color: toast.type === 'error' ? 'var(--accent-red)' : 'var(--brand-amber)',
          fontSize: '0.875rem', fontWeight: 500,
          animation: 'fade-in 200ms ease',
        }}>
          {toast.type === 'error' ? <AlertCircle size={16}/> : <CheckCircle size={16}/>}
          {toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
              <span style={{ cursor: 'pointer', color: 'var(--brand-amber)' }} onClick={() => navigate('/vendors')}>Vendors</span>
              <ChevronRight size={12}/>
              <span style={{ color: 'var(--text-secondary)' }}>{id ? 'Edit Vendor' : 'New Vendor'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'var(--brand-amber-muted)', border: '1px solid var(--brand-amber)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Building2 size={20} style={{ color: 'var(--brand-amber)' }}/>
              </div>
              <div>
                <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  {id ? 'Edit Vendor' : 'New Vendor'}
                </h1>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Add a supplier, contractor, or service provider to your registry
                </p>
              </div>
            </div>
          </div>
          <button onClick={() => navigate('/vendors')} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-default)',
            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
            fontSize: '0.8rem', transition: 'all 150ms ease',
          }}>
            <X size={14}/> Cancel
          </button>
        </div>

        {/* Tab Bar */}
        <div style={{ ...card, display: 'flex', marginBottom: 20, overflow: 'hidden', padding: 0 }}>
          {TABS.map((tab, i) => {
            const Icon = tab.icon;
            const isActive = activeTab === i;
            const isDone = tabSaved[i] && !isActive;
            return (
              <button key={i} onClick={() => setActiveTab(i)} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '14px 8px', border: 'none', cursor: 'pointer',
                borderRight: i < 4 ? '1px solid var(--border-subtle)' : 'none',
                background: isActive ? 'var(--brand-amber-muted)' : 'transparent',
                color: isActive ? 'var(--brand-amber)' : isDone ? 'var(--accent-emerald)' : 'var(--text-muted)',
                transition: 'all 150ms ease', position: 'relative',
              }}>
                {isDone ? <CheckCircle size={18}/> : <Icon size={18}/>}
                <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.01em' }}>{tab.label}</span>
                {isActive && (
                  <span style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: 2, background: 'var(--brand-amber)',
                  }}/>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content Panel */}
        <div style={{ ...card, padding: '28px', marginBottom: 20, minHeight: 420 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{TABS[activeTab].label}</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {activeTab === 0 && 'Core vendor identity and primary point of contact'}
                {activeTab === 1 && 'GST registration, PAN, payment and tax details'}
                {activeTab === 2 && 'Registered office and site address with geo-coordinates'}
                {activeTab === 3 && 'Bank account for payments — verified by Finance before first payment'}
                {activeTab === 4 && 'Labour registrations, certifications and empanelment records'}
              </p>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-disabled)' }}>Step {activeTab + 1} of 5</span>
          </div>

          {/* ── TAB 0: Primary Contact ── */}
          {activeTab === 0 && (
            <div>
              <SectionTitle>Basic Information</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Company / Legal Name" required error={errors.name}>
                  <ThemeInput value={form.name} onChange={e => set('name', e.target.value)} placeholder="Larsen & Toubro Ltd"/>
                </Field>
                <Field label="Display Name" hint="Short name shown in lists">
                  <ThemeInput value={form.displayName} onChange={e => set('displayName', e.target.value)} placeholder="L&T"/>
                </Field>
                <Field label="Vendor Type" required error={errors.type}>
                  <ThemeSelect value={form.type} onChange={e => set('type', e.target.value)}>
                    <option value="">Select vendor type...</option>
                    {VENDOR_TYPES.map(t => <option key={t}>{t}</option>)}
                  </ThemeSelect>
                </Field>
                {/* What they supply, in this organisation's own words.

                    "Vendor Type" above offers Civil Contractor, Bituminous,
                    IT Hardware — a road contractor's list, handed to every
                    business. A furniture maker buys Board and Laminate; a
                    fabricator buys Plate and Section. When nothing fits,
                    people pick the least wrong option, and the vendor list
                    stops being filterable by what vendors actually sell. */}
                <Field label="What They Supply" hint="Your own category — type a new one to add it">
                  <CategoryPicker
                    kind="vendor"
                    value={form.supplyCategory}
                    onChange={(v) => set('supplyCategory', v)}
                    placeholder="e.g. Board, Hardware, Laminate"
                  />
                </Field>
                <Field label="Vendor Code" hint="Auto-generated if left blank">
                  <ThemeInput value={form.vendorCode} onChange={e => set('vendorCode', e.target.value)} placeholder="VND-0042"/>
                </Field>
              </div>

              <SectionTitle>Primary Contact Person</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Contact Person Name">
                  <ThemeInput value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} placeholder="Rajesh Kumar"/>
                </Field>
                <Field label="Email" error={errors.email}>
                  <ThemeInput icon={Mail} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@company.com"/>
                </Field>
                <Field label="Mobile">
                  <ThemeInput icon={Phone} value={form.mobile} onChange={e => set('mobile', e.target.value)} placeholder="9876543210"/>
                </Field>
                <Field label="WhatsApp">
                  <ThemeInput value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="Same as mobile"/>
                </Field>
                <Field label="Website">
                  <ThemeInput icon={Globe} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://company.com"/>
                </Field>
              </div>

              <SectionTitle>Classification</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <Field label="Contractor Class">
                  <ThemeSelect value={form.contractorClass} onChange={e => set('contractorClass', e.target.value)}>
                    <option value="">Select class...</option>
                    {CONTRACTOR_CLASSES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                  </ThemeSelect>
                </Field>
                <Field label="Safety Rating">
                  <ThemeSelect value={form.safetyRating} onChange={e => set('safetyRating', e.target.value)}>
                    <option value="">Select...</option>
                    {['A','B','C','D'].map(r => <option key={r}>Rating {r}</option>)}
                  </ThemeSelect>
                </Field>
                {/* Renamed from "Capability Scope", which said nothing about
                    what it was for. The item-level truth lives in
                    vendor_items (material + price + MOQ); this is the
                    sentence a buyer reads when choosing who to ask. */}
                <Field label="What exactly do they supply?" hint="The detail behind the category">
                  <ThemeInput value={form.supplies} onChange={e => set('supplies', e.target.value)} placeholder="18mm particle board, MDF, edge banding — cut to size"/>
                </Field>
              </div>
            </div>
          )}

          {/* ── TAB 1: Tax & Payment ── */}
          {activeTab === 1 && (
            <div>
              <SectionTitle>GST & Tax Information</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="GSTIN" hint="15-character GST Identification Number" error={errors.gstin}>
                  <ThemeInput value={form.gstin} onChange={e => set('gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15}/>
                </Field>
                <Field label="PAN" hint="10-character Permanent Account Number" error={errors.pan}>
                  <ThemeInput value={form.pan} onChange={e => set('pan', e.target.value.toUpperCase())} placeholder="AAAAA0000A" maxLength={10}/>
                </Field>
                <Field label="GST Treatment">
                  <ThemeSelect value={form.gstTreatment} onChange={e => set('gstTreatment', e.target.value)}>
                    <option value="">Select GST treatment...</option>
                    <option>Registered Business - Regular</option>
                    <option>Registered Business - Composition</option>
                    <option>Unregistered Business</option>
                    <option>Consumer</option>
                    <option>Overseas</option>
                    <option>Special Economic Zone</option>
                  </ThemeSelect>
                </Field>
                <Field label="TDS Section">
                  <ThemeSelect value={form.tdsSection} onChange={e => set('tdsSection', e.target.value)}>
                    <option value="">Select TDS section...</option>
                    <option>194C — Works Contract (2%)</option>
                    <option>194I — Rent (10%)</option>
                    <option>194J — Professional (10%)</option>
                    <option>194Q — Goods Purchase (0.1%)</option>
                    <option>No TDS</option>
                  </ThemeSelect>
                </Field>
              </div>

              <SectionTitle>Payment Terms</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <Field label="Currency">
                  <ThemeSelect value={form.currency} onChange={e => set('currency', e.target.value)}>
                    <option value="INR">INR — Indian Rupee</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                  </ThemeSelect>
                </Field>
                <Field label="Payment Terms">
                  <ThemeSelect value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)}>
                    {PAYMENT_TERMS.map(t => <option key={t}>{t}</option>)}
                  </ThemeSelect>
                </Field>
                <Field label="Retention %">
                  <ThemeInput type="number" min="0" max="100" value={form.retentionPct} onChange={e => set('retentionPct', e.target.value)} placeholder="5"/>
                </Field>
                <Field label="Credit Limit (₹)">
                  <ThemeInput type="number" value={form.creditLimit} onChange={e => set('creditLimit', e.target.value)} placeholder="500000"/>
                </Field>
              </div>

              <SectionTitle>MSME Registration</SectionTitle>
              <Toggle label="MSME Registered" hint="Micro, Small & Medium Enterprise" checked={form.isMsme} onChange={v => set('isMsme', v)}/>
              {form.isMsme && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
                  <Field label="MSME Number">
                    <ThemeInput value={form.msmeNumber} onChange={e => set('msmeNumber', e.target.value)} placeholder="UDYAM-TG-01-0000000"/>
                  </Field>
                  <Field label="MSME Type">
                    <ThemeSelect value={form.msmeType} onChange={e => set('msmeType', e.target.value)}>
                      <option value="">Select...</option>
                      <option>Micro</option><option>Small</option><option>Medium</option>
                    </ThemeSelect>
                  </Field>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: Address ── */}
          {activeTab === 2 && (
            <div>
              <SectionTitle>Registered Office Address</SectionTitle>
              <div style={{ display: 'grid', gap: 16 }}>
                <Field label="Address Line 1">
                  <ThemeInput value={form.addrLine1} onChange={e => set('addrLine1', e.target.value)} placeholder="Plot No. 12, Industrial Area, Phase 2"/>
                </Field>
                <Field label="Address Line 2">
                  <ThemeInput value={form.addrLine2} onChange={e => set('addrLine2', e.target.value)} placeholder="Near National Highway 44"/>
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 16 }}>
                <Field label="City">
                  <ThemeInput value={form.city} onChange={e => set('city', e.target.value)} placeholder="Hyderabad"/>
                </Field>
                <Field label="State">
                  <ThemeSelect value={form.state} onChange={e => set('state', e.target.value)}>
                    <option value="">Select state...</option>
                    {STATES.map(s => <option key={s}>{s}</option>)}
                  </ThemeSelect>
                </Field>
                <Field label="Pincode">
                  <ThemeInput value={form.pincode} onChange={e => set('pincode', e.target.value)} maxLength={6} placeholder="500001"/>
                </Field>
              </div>

              <SectionTitle>Geo Location (Optional)</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Latitude" hint="For site map view">
                  <ThemeInput type="number" step="any" value={form.latitude} onChange={e => set('latitude', e.target.value)} placeholder="17.3850"/>
                </Field>
                <Field label="Longitude">
                  <ThemeInput type="number" step="any" value={form.longitude} onChange={e => set('longitude', e.target.value)} placeholder="78.4867"/>
                </Field>
              </div>
              {form.latitude && form.longitude && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--brand-amber-muted)', border: '1px solid var(--brand-amber)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--brand-amber)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MapPin size={14}/> Coordinates saved — vendor will appear on the site map
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: Bank Details ── */}
          {activeTab === 3 && (
            <div>
              <SectionTitle>Primary Bank Account</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Bank Name"><ThemeInput value={form.bankName} onChange={e => set('bankName', e.target.value)} placeholder="State Bank of India"/></Field>
                <Field label="Account Holder Name"><ThemeInput value={form.accountHolder} onChange={e => set('accountHolder', e.target.value)} placeholder="Larsen & Toubro Ltd"/></Field>
                <Field label="Account Number"><ThemeInput value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)} placeholder="XXXXXXXXXXXX"/></Field>
                <Field label="Account Type">
                  <ThemeSelect value={form.accountType} onChange={e => set('accountType', e.target.value)}>
                    {['Current','Savings','CC','OD'].map(t => <option key={t}>{t}</option>)}
                  </ThemeSelect>
                </Field>
                <Field label="IFSC Code" hint="11-character IFSC">
                  <ThemeInput value={form.ifscCode} onChange={e => set('ifscCode', e.target.value.toUpperCase())} placeholder="SBIN0001234" maxLength={11}/>
                </Field>
                <Field label="MICR Code"><ThemeInput value={form.micrCode} onChange={e => set('micrCode', e.target.value)} placeholder="500002001" maxLength={9}/></Field>
                <Field label="Branch Name"><ThemeInput value={form.branchName} onChange={e => set('branchName', e.target.value)} placeholder="Banjara Hills Branch"/></Field>
                <Field label="Branch Address"><ThemeInput value={form.branchAddress} onChange={e => set('branchAddress', e.target.value)} placeholder="Road No. 12, Banjara Hills, Hyderabad"/></Field>
              </div>
              <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 10, display: 'flex', gap: 10 }}>
                <AlertCircle size={16} style={{ color: 'var(--accent-yellow)', flexShrink: 0, marginTop: 2 }}/>
                <div>
                  <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Bank Verification Required</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>Finance team must verify bank details against cancelled cheque before first payment is processed.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 4: Compliance ── */}
          {activeTab === 4 && (
            <div>
              <SectionTitle>Labour & Employment Registrations</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="EPF Number" hint="Employees' Provident Fund"><ThemeInput value={form.epfNumber} onChange={e => set('epfNumber', e.target.value)} placeholder="TN/MAS/12345/123"/></Field>
                <Field label="ESI Number" hint="Employee State Insurance"><ThemeInput value={form.esiNumber} onChange={e => set('esiNumber', e.target.value)} placeholder="31-00-123456-000-0000"/></Field>
                <Field label="Labour License Number"><ThemeInput value={form.labourLicense} onChange={e => set('labourLicense', e.target.value)} placeholder="LL/2023/12345"/></Field>
                <Field label="Labour License Expiry"><ThemeInput type="date" value={form.labourLicenseExp} onChange={e => set('labourLicenseExp', e.target.value)}/></Field>
              </div>
              <div style={{ marginTop: 12 }}>
                <Toggle label="PF Registered" hint="Vendor is registered under Provident Fund" checked={form.pfRegistered} onChange={v => set('pfRegistered', v)}/>
              </div>

              <SectionTitle>ISO Certification</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="ISO Certificate" hint="e.g. ISO 9001:2015"><ThemeInput value={form.isoCert} onChange={e => set('isoCert', e.target.value)} placeholder="ISO 9001:2015"/></Field>
                <Field label="ISO Expiry"><ThemeInput type="date" value={form.isoExpiry} onChange={e => set('isoExpiry', e.target.value)}/></Field>
              </div>

              <SectionTitle>Empanelment</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <Field label="Agreement Date"><ThemeInput type="date" value={form.agreementDate} onChange={e => set('agreementDate', e.target.value)}/></Field>
                <Field label="Agreement Expiry"><ThemeInput type="date" value={form.agreementExpiry} onChange={e => set('agreementExpiry', e.target.value)}/></Field>
                <Field label="Empanelment Date"><ThemeInput type="date" value={form.empanelledAt} onChange={e => set('empanelledAt', e.target.value)}/></Field>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => setActiveTab(t => Math.max(0, t - 1))} disabled={activeTab === 0} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
            borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent',
            color: activeTab === 0 ? 'var(--text-disabled)' : 'var(--text-secondary)', cursor: activeTab === 0 ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
          }}>
            <ChevronLeft size={16}/> Previous
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={saveCurrentTab} disabled={saving} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
              borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent',
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem',
            }}>
              {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/> : <Save size={14}/>}
              Save Draft
            </button>

            {activeTab < 4 ? (
              <button onClick={handleNext} disabled={saving} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
                borderRadius: 8, border: 'none', background: 'var(--brand-amber)',
                color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
                boxShadow: '0 2px 8px var(--brand-amber-muted)',
              }}>
                {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/>}
                Save & Continue <ChevronRight size={16}/>
              </button>
            ) : (
              <button onClick={handleFinish} disabled={saving} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
                borderRadius: 8, border: 'none', background: 'var(--accent-emerald)',
                color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
              }}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/> : <CheckCircle size={16}/>}
                Save Vendor
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
