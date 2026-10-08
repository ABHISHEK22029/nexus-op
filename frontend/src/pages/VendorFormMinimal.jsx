/* ══════════════════════════════════════════════════════════
   New vendor — the six things you actually need, then the rest if you want it.

   The form this replaces asked 47 questions across 5 tabs, of which 2 were
   required. Measured against 22 real vendors on this database — excluding
   the ones the seeder made, which would have flattered the result — 22 of
   36 columns had never been filled ONCE:

     address · contactName · contactPhone · contactEmail · vendor_code
     display_name · website · city · state · pincode · payment_terms
     credit_limit · lead_time_days · bank_name · account_holder
     account_number · ifsc_code · branch_name · msme_number
     labour_license · iso_cert · notes

   Roughly thirty of the forty-seven fields have never been answered in real
   use. That is not "thorough", it is a wall in front of somebody who wanted
   to record a supplier's phone number.

   What the product genuinely consumes, traced through the code rather than
   guessed:

     · the purchase order document prints  name, address, GSTIN, state
     · the shortfall→PO engine needs       name, and a price from vendor_items
     · a human needs                       a phone number and what they sell

   GSTIN's first two digits ARE the state code, so state comes free. That
   leaves six fields on the first screen. Everything else still exists as a
   column — no data is lost, and nothing that was recorded is thrown away —
   it simply stops being asked up front. Fill it in on the vendor's own page,
   at the moment it matters: bank details when you first pay them, MSME
   number when the 45-day clock matters.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Building2, ChevronDown, ChevronRight, Check, X, Phone, Landmark, FileText,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import CategoryPicker from '../components/CategoryPicker';
import { getToken } from '../lib/apiAuth';
import { formProblems, fixMessage } from '../lib/validators';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* GST state codes — the first two digits of a GSTIN. Recorded here so the
   form can tell somebody what state they just implied, and so `state` never
   has to be typed separately and then disagree with the GSTIN. */
const GST_STATES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  10: 'Bihar', 11: 'Sikkim', 12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur',
  15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya', 18: 'Assam', 19: 'West Bengal',
  20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat',
  27: 'Maharashtra', 29: 'Karnataka', 30: 'Goa', 31: 'Lakshadweep', 32: 'Kerala',
  33: 'Tamil Nadu', 34: 'Puducherry', 35: 'Andaman & Nicobar', 36: 'Telangana',
  37: 'Andhra Pradesh', 38: 'Ladakh',
};
const stateFromGstin = (g) => GST_STATES[String(g || '').slice(0, 2)] || null;

/* What each checked field must look like (lib/validators), and what to call
   it when it is wrong. The server checks the same and names the same field. */
const CHECKS = { phone: 'phone', email: 'email', gstin: 'gstin', pan: 'pan', pincode: 'pincode', accountHolder: 'accountHolder', accountNumber: 'accountNumber', ifsc: 'ifsc' };
const LABELS = { phone: 'Phone', email: 'Email', gstin: 'GSTIN', pan: 'PAN', pincode: 'Pincode', accountHolder: 'Account holder', accountNumber: 'Account number', ifsc: 'IFSC' };
/* The server's column for each, so a 400 lands on the right field. */
const FROM_SERVER = { contactPhone: 'phone', contactEmail: 'email', gstin: 'gstin', pan: 'pan', pincode: 'pincode', account_holder: 'accountHolder', account_number: 'accountNumber', ifsc_code: 'ifsc' };
const IN_MORE = ['pan', 'email', 'pincode'];
const IN_BANK = ['accountHolder', 'accountNumber', 'ifsc'];

/* Defined at module scope, NOT inside the component.
 *
   It used to live in the component body, which meant every render produced
   a brand new function — a different component TYPE as far as React is
   concerned. React cannot reconcile a new type with the old one, so on each
   keystroke it unmounted this whole subtree and mounted a fresh one,
   throwing away the DOM input and the caret with it.
 *
   The symptom: type one character into PAN or the bank fields, and the
   cursor is gone. Type another and it lands nowhere. Only the fields inside
   a Section were affected — name, phone and GSTIN sit outside one and were
   always fine, which is what made it look like a glitch on those fields
   specifically. */
const CARD = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };

const Section = ({ open, onToggle, icon: Icon, title, blurb, filled = 0, children }) => (
    <div style={{ ...CARD, marginTop: 12, overflow: 'hidden' }}>
      <button type="button" onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}>
        {open ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />}
        <Icon size={16} style={{ color: 'var(--brand-amber)' }} />
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{title}</span>
        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{blurb}</span>
        {filled > 0 && !open && (
          <span style={{
            fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
            background: 'hsl(28,100%,54%,0.14)', color: 'var(--brand-amber)', whiteSpace: 'nowrap',
          }}>{filled} recorded</span>
        )}
      </button>
      {open && <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>{children}</div>}
    </div>
  );


export default function VendorFormMinimal() {
  const navigate = useNavigate();
  const toast = useToast();
  const { id } = useParams();

  const [f, setF] = useState({
    name: '', supplyCategory: '', supplies: '', phone: '', gstin: '', address: '',
    // behind "More details"
    pan: '', contactName: '', email: '', city: '', pincode: '', paymentTerms: '',
    isMsme: false, msmeNumber: '', notes: '',
    // behind "Bank details"
    bankName: '', accountHolder: '', accountNumber: '', ifsc: '', branch: '',
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const [openMore, setOpenMore] = useState(false);
  const [openBank, setOpenBank] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  /* A field says it is wrong once you have left it, or once you have tried
     to save — not while you are still typing your first character. */
  const [touched, setTouched] = useState({});
  const [tried, setTried] = useState(false);
  const [original, setOriginal] = useState(null);
  const touch = (k) => setTouched(t => (t[k] ? t : { ...t, [k]: true }));
  const change = (k, v) => { set(k, v); setErrors(x => (x[k] ? { ...x, [k]: null } : x)); };

  const derivedState = stateFromGstin(f.gstin);

  /* Editing used to open a different, much longer form — 12 fields on its
     first tab and more behind three others. So "add a vendor" asked for six
     things and "open that vendor" asked for forty, which reads as two
     different products. One form for both, and the extra columns stay where
     they were put: behind More details and Bank details.

     Loading has to fill the same keys the save maps back, or a PATCH would
     write nulls over columns the person never saw. */
  const [loading, setLoading] = useState(!!id);
  useEffect(() => {
    if (!id) return;
    const token = getToken();
    fetch(`${API}/vendors/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => (r.ok ? r.json() : null))
      .then(v => {
        if (!v) return;
        const d = v.vendor || v;
        const loaded = {
          name: d.name || '',
          supplyCategory: d.supply_category || d.type || '',
          supplies: d.supplies || '',
          phone: d.contactPhone || d.phone || '',
          gstin: d.gstin || '',
          address: d.address || '',
          pan: d.pan || '',
          contactName: d.contactName || d.contact_name || '',
          email: d.contactEmail || d.email || '',
          city: d.city || '',
          pincode: d.pincode || '',
          paymentTerms: d.payment_terms || '',
          isMsme: !!d.is_msme,
          msmeNumber: d.msme_number || '',
          notes: d.notes || '',
          bankName: d.bank_name || '',
          accountHolder: d.account_holder || '',
          accountNumber: d.account_number || '',
          ifsc: d.ifsc_code || '',
          branch: d.branch_name || '',
        };
        setF(loaded);
        /* An odd value an older record already holds is not re-checked
           unless it is changed, so its other fields can still be saved. */
        setOriginal(loaded);
        /* Deliberately NOT auto-expanded. Opening every section that holds
           something put 13 fields back on screen the moment you edited an
           existing vendor, which is the wall this form exists to remove.
           The section headings say how much is inside instead, so nothing
           is hidden by surprise and the default view stays at six. */
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const problems = { ...formProblems(f, CHECKS, { original, pair: ['gstin', 'pan'] }), ...Object.fromEntries(Object.entries(errors).filter(([, v]) => v)) };
  const shown = (k) => ((touched[k] || tried) ? problems[k] : null);
  const blocking = { ...problems };
  if (!f.name.trim()) blocking.name = 'A vendor needs a name';

  const save = async (e) => {
    e.preventDefault();
    /* Never a button that does nothing: open whichever section holds the
       problem, mark it, and say so beside the button. */
    if (Object.keys(blocking).length) {
      setTried(true);
      if (blocking.name) setErrors(x => ({ ...x, name: blocking.name }));
      if (IN_MORE.some(k => blocking[k])) setOpenMore(true);
      if (IN_BANK.some(k => blocking[k])) setOpenBank(true);
      const first = Object.keys(blocking)[0];
      setTimeout(() => document.querySelector(`[data-field="${first}"]`)?.focus(), 0);
      return;
    }

    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/vendors${id ? `/${id}` : ''}`, {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          name: f.name.trim(),
          /* `type` is NOT NULL on the table and the API requires it. The
             organisation's own category is the honest answer; the old fixed
             list (Civil / Bituminous / IT Hardware) classified nothing for a
             business that is not a road contractor. */
          type: f.supplyCategory || 'Supplier',
          supply_category: f.supplyCategory || null,
          supplies: f.supplies || null,
          capability_tags: f.supplies || null,
          contactPhone: f.phone || null,
          gstin: f.gstin ? f.gstin.toUpperCase() : null,
          state: derivedState,                     // never typed, never disagrees
          address: f.address || null,
          status: 'Active',

          pan: f.pan ? f.pan.toUpperCase() : null,
          contactName: f.contactName || null,
          contactEmail: f.email || null,
          city: f.city || null,
          pincode: f.pincode || null,
          payment_terms: f.paymentTerms || null,
          is_msme: !!f.isMsme,
          msme_number: f.msmeNumber || null,
          notes: f.notes || null,

          bank_name: f.bankName || null,
          account_holder: f.accountHolder || null,
          account_number: f.accountNumber || null,
          ifsc_code: f.ifsc ? f.ifsc.toUpperCase() : null,
          branch_name: f.branch || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        /* The server names the field it refused; show it there too. */
        const k = FROM_SERVER[d.field];
        if (k) {
          setErrors(x => ({ ...x, [k]: String(d.error || '').replace(/^[^:]+:s*/, '') }));
          setTried(true);
          if (IN_MORE.includes(k)) setOpenMore(true);
          if (IN_BANK.includes(k)) setOpenBank(true);
        }
        throw new Error(d.error || 'Could not save this vendor');
      }
      toast.success(`${f.name.trim()} ${id ? 'saved' : 'added'}`);
      navigate('/vendors');
    } catch (err) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  const input = (bad) => ({
    width: '100%', boxSizing: 'border-box', padding: '10px 12px',
    background: 'var(--bg-elevated)',
    border: `1px solid ${bad ? 'var(--accent-red, #dc2626)' : 'var(--border-default)'}`,
    /* the light theme forces email/text borders; a ring still shows red */
    boxShadow: bad ? 'inset 0 0 0 1px #dc2626' : undefined,
    borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none',
  });
  const lbl = { display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 };
  const hint = { fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 5 };
  const card = CARD;

  /* How many of a section's fields already hold something. A collapsed
     heading that says "3 recorded" is the difference between "there is
     nothing in here" and "there is something in here you cannot see". */
  const countFilled = (keys) => keys.filter(k => {
    const v = f[k];
    return typeof v === 'boolean' ? v : String(v ?? '').trim() !== '';
  }).length;


  /* Without this the edit form paints empty for a moment and then fills in,
     which reads as "this vendor has no details" — and anyone who started
     typing in that moment would have had it overwritten by the load. */
  if (loading) {
    return (
      <div style={{ maxWidth: 780, margin: '0 auto', padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading vendor…
      </div>
    );
  }

  return (
    <form onSubmit={save} style={{ maxWidth: 780, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            <Building2 size={23} style={{ color: 'var(--brand-amber)' }} /> {id ? 'Edit vendor' : 'New vendor'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
            Six things get you started. The rest can wait until it matters.
          </p>
        </div>
        <button type="button" onClick={() => navigate('/vendors')} className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <X size={15} /> Cancel
        </button>
      </div>

      {/* ── the six ── */}
      <div style={{ ...card, padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Vendor name <span style={{ color: 'var(--accent-red, #dc2626)' }}>*</span></label>
          <input style={input(errors.name)} value={f.name} onChange={e => { set('name', e.target.value); setErrors(x => ({ ...x, name: null })); }}
            placeholder="Kalinga Particle Board Co" autoFocus data-field="name" />
          {errors.name && <p style={{ ...hint, color: 'var(--accent-red, #dc2626)' }}>{errors.name}</p>}
        </div>

        <div>
          <label style={lbl}>What they supply</label>
          <CategoryPicker kind="vendor" value={f.supplyCategory} onChange={v => set('supplyCategory', v)}
            placeholder="e.g. Board, Hardware" />
          <p style={hint}>Your own category — type a new one to add it.</p>
        </div>

        <div>
          <label style={lbl}>Phone</label>
          <input style={input(shown('phone'))} value={f.phone} onChange={e => change('phone', e.target.value)} onBlur={() => touch('phone')}
            placeholder="98850 00000" type="tel" inputMode="tel" autoComplete="off" data-field="phone" aria-invalid={!!shown('phone')} />
          {shown('phone')
            ? <p role="alert" style={{ ...hint, color: 'var(--accent-red, #dc2626)' }}>{shown('phone')}</p>
            : <p style={hint}>How you actually reach them.</p>}
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>What exactly do they supply?</label>
          <input style={input()} value={f.supplies} onChange={e => set('supplies', e.target.value)}
            placeholder="18mm particle board, MDF, edge banding — cut to size" />
          <p style={hint}>In your words. This is what makes the vendor list searchable by what you need.</p>
        </div>

        <div>
          <label style={lbl}>GSTIN</label>
          <input style={input(shown('gstin'))} value={f.gstin}
            onChange={e => change('gstin', e.target.value.toUpperCase())} onBlur={() => touch('gstin')}
            placeholder="33AABCN1234M1Z7" maxLength={15} autoComplete="off" data-field="gstin" aria-invalid={!!shown('gstin')} />
          {shown('gstin')
            ? <p role="alert" style={{ ...hint, color: 'var(--accent-red, #dc2626)' }}>{shown('gstin')}</p>
            : <p style={hint}>{derivedState ? `State: ${derivedState} — taken from the GSTIN` : 'Needed to claim input tax credit.'}</p>}
        </div>

        <div>
          <label style={lbl}>Address</label>
          <input style={input()} value={f.address} onChange={e => set('address', e.target.value)}
            placeholder="Plot 44, Industrial Estate, Hosur" />
          <p style={hint}>Printed on the purchase order.</p>
        </div>
      </div>

      {/* ── everything else, folded away ── */}
      <Section open={openMore} onToggle={() => setOpenMore(o => !o)} icon={FileText}
        title="More details" blurb="PAN, contact person, terms, MSME"
        filled={countFilled(['pan','contactName','email','city','pincode','paymentTerms','isMsme','msmeNumber','notes'])}>
        <div>
          <label style={lbl}>PAN</label>
          <input style={input(shown('pan'))} value={f.pan} onChange={e => change('pan', e.target.value.toUpperCase())} onBlur={() => touch('pan')}
            placeholder="AABCN1234M" maxLength={10} autoComplete="off" data-field="pan" aria-invalid={!!shown('pan')} />
          {shown('pan') && <p role="alert" style={{ ...hint, color: 'var(--accent-red, #dc2626)' }}>{shown('pan')}</p>}
        </div>
        <div>
          <label style={lbl}>Contact person</label>
          <input style={input()} value={f.contactName} onChange={e => set('contactName', e.target.value)} placeholder="Ravi Kumar" />
        </div>
        <div>
          <label style={lbl}>Email</label>
          <input style={input(shown('email'))} type="email" value={f.email} onChange={e => change('email', e.target.value)} onBlur={() => touch('email')}
            placeholder="sales@vendor.com" autoComplete="off" data-field="email" aria-invalid={!!shown('email')} />
          {shown('email') && <p role="alert" style={{ ...hint, color: 'var(--accent-red, #dc2626)' }}>{shown('email')}</p>}
        </div>
        <div>
          <label style={lbl}>City</label>
          <input style={input()} value={f.city} onChange={e => set('city', e.target.value)} placeholder="Hosur" />
        </div>
        <div>
          <label style={lbl}>Pincode</label>
          <input style={input(shown('pincode'))} value={f.pincode} onChange={e => change('pincode', e.target.value)} onBlur={() => touch('pincode')}
            placeholder="635109" maxLength={6} inputMode="numeric" autoComplete="off" data-field="pincode" aria-invalid={!!shown('pincode')} />
          {shown('pincode') && <p role="alert" style={{ ...hint, color: 'var(--accent-red, #dc2626)' }}>{shown('pincode')}</p>}
        </div>
        <div>
          <label style={lbl}>Payment terms</label>
          <input style={input()} value={f.paymentTerms} onChange={e => set('paymentTerms', e.target.value)} placeholder="30 days" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          {/* This is not paperwork. Under the MSMED Act a registered micro or
              small supplier must be paid within 45 days or interest accrues,
              so whether a vendor is MSME changes what you owe. It defaulted
              to TRUE for every vendor, which is the wrong way round to be
              wrong. */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.isMsme} onChange={e => set('isMsme', e.target.checked)} />
            <span style={{ fontSize: '0.86rem', color: 'var(--text-primary)', fontWeight: 600 }}>Registered MSME</span>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>— must be paid within 45 days (MSMED Act)</span>
          </label>
          {f.isMsme && (
            <input style={{ ...input(), marginTop: 9 }} value={f.msmeNumber}
              onChange={e => set('msmeNumber', e.target.value)} placeholder="Udyam registration number" />
          )}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Notes</label>
          <input style={input()} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything worth remembering about this supplier" />
        </div>
      </Section>

      <Section open={openBank} onToggle={() => setOpenBank(o => !o)} icon={Landmark}
        title="Bank details" blurb="Needed the first time you pay them"
        filled={countFilled(['bankName','accountHolder','accountNumber','ifsc','branch'])}>
        <div>
          <label style={lbl}>Bank name</label>
          <input style={input()} value={f.bankName} onChange={e => set('bankName', e.target.value)} placeholder="HDFC Bank" />
        </div>
        <div>
          <label style={lbl}>Account holder</label>
          <input style={input(shown('accountHolder'))} value={f.accountHolder} onChange={e => change('accountHolder', e.target.value)} onBlur={() => touch('accountHolder')}
            placeholder="As printed on the cheque" autoComplete="off" data-field="accountHolder" aria-invalid={!!shown('accountHolder')} />
          {shown('accountHolder') && <p role="alert" style={{ ...hint, color: 'var(--accent-red, #dc2626)' }}>{shown('accountHolder')}</p>}
        </div>
        <div>
          <label style={lbl}>Account number</label>
          <input style={input(shown('accountNumber'))} value={f.accountNumber} onChange={e => change('accountNumber', e.target.value)} onBlur={() => touch('accountNumber')}
            inputMode="numeric" maxLength={18} autoComplete="off" data-field="accountNumber" aria-invalid={!!shown('accountNumber')} />
          {shown('accountNumber') && <p role="alert" style={{ ...hint, color: 'var(--accent-red, #dc2626)' }}>{shown('accountNumber')}</p>}
        </div>
        <div>
          <label style={lbl}>IFSC</label>
          <input style={input(shown('ifsc'))} value={f.ifsc} onChange={e => change('ifsc', e.target.value.toUpperCase())} onBlur={() => touch('ifsc')}
            placeholder="HDFC0001234" maxLength={11} autoComplete="off" data-field="ifsc" aria-invalid={!!shown('ifsc')} />
          {shown('ifsc') && <p role="alert" style={{ ...hint, color: 'var(--accent-red, #dc2626)' }}>{shown('ifsc')}</p>}
        </div>
        <div>
          <label style={lbl}>Branch</label>
          <input style={input()} value={f.branch} onChange={e => set('branch', e.target.value)} placeholder="Hosur Industrial Estate" />
        </div>
      </Section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="submit" disabled={saving} className="btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, opacity: saving ? 0.6 : 1 }}>
          <Check size={16} /> {saving ? 'Saving…' : id ? 'Save vendor' : 'Add vendor'}
        </button>
        <button type="button" onClick={() => navigate('/vendors')} className="btn-secondary">Cancel</button>
        {/* What is stopping the save, said beside the button that was pressed. */}
        {tried && Object.keys(blocking).length > 0 ? (
          <span role="alert" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-red, #dc2626)', marginLeft: 'auto' }}>
            {fixMessage(blocking, { ...LABELS, name: 'Vendor name' })}
          </span>
        ) : (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            <Phone size={12} style={{ verticalAlign: -2 }} /> Only the name is required — add the rest whenever you have it.
          </span>
        )}
      </div>
    </form>
  );
}
