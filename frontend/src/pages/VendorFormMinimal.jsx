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
        setF({
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
        });
        /* Deliberately NOT auto-expanded. Opening every section that holds
           something put 13 fields back on screen the moment you edited an
           existing vendor, which is the wall this form exists to remove.
           The section headings say how much is inside instead, so nothing
           is hidden by surprise and the default view stays at six. */
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const save = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!f.name.trim()) errs.name = 'A vendor needs a name';
    if (f.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/.test(f.gstin.toUpperCase())) {
      errs.gstin = "That doesn't look like a GSTIN — 15 characters, e.g. 33AABCN1234M1Z7";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

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
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save this vendor');
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
    borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none',
  });
  const lbl = { display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 };
  const hint = { fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 5 };
  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };

  /* How many of a section's fields already hold something. A collapsed
     heading that says "3 recorded" is the difference between "there is
     nothing in here" and "there is something in here you cannot see". */
  const countFilled = (keys) => keys.filter(k => {
    const v = f[k];
    return typeof v === 'boolean' ? v : String(v ?? '').trim() !== '';
  }).length;

  const Section = ({ open, onToggle, icon: Icon, title, blurb, filled = 0, children }) => (
    <div style={{ ...card, marginTop: 12, overflow: 'hidden' }}>
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
            placeholder="Kalinga Particle Board Co" autoFocus />
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
          <input style={input()} value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="98850 00000" />
          <p style={hint}>How you actually reach them.</p>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>What exactly do they supply?</label>
          <input style={input()} value={f.supplies} onChange={e => set('supplies', e.target.value)}
            placeholder="18mm particle board, MDF, edge banding — cut to size" />
          <p style={hint}>In your words. This is what makes the vendor list searchable by what you need.</p>
        </div>

        <div>
          <label style={lbl}>GSTIN</label>
          <input style={input(errors.gstin)} value={f.gstin}
            onChange={e => { set('gstin', e.target.value.toUpperCase()); setErrors(x => ({ ...x, gstin: null })); }}
            placeholder="33AABCN1234M1Z7" maxLength={15} />
          {errors.gstin
            ? <p style={{ ...hint, color: 'var(--accent-red, #dc2626)' }}>{errors.gstin}</p>
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
          <input style={input()} value={f.pan} onChange={e => set('pan', e.target.value.toUpperCase())} placeholder="AABCN1234M" maxLength={10} />
        </div>
        <div>
          <label style={lbl}>Contact person</label>
          <input style={input()} value={f.contactName} onChange={e => set('contactName', e.target.value)} placeholder="Ravi Kumar" />
        </div>
        <div>
          <label style={lbl}>Email</label>
          <input style={input()} type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="sales@vendor.com" />
        </div>
        <div>
          <label style={lbl}>City</label>
          <input style={input()} value={f.city} onChange={e => set('city', e.target.value)} placeholder="Hosur" />
        </div>
        <div>
          <label style={lbl}>Pincode</label>
          <input style={input()} value={f.pincode} onChange={e => set('pincode', e.target.value)} placeholder="635109" maxLength={6} />
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
          <input style={input()} value={f.accountHolder} onChange={e => set('accountHolder', e.target.value)} placeholder="As printed on the cheque" />
        </div>
        <div>
          <label style={lbl}>Account number</label>
          <input style={input()} value={f.accountNumber} onChange={e => set('accountNumber', e.target.value)} />
        </div>
        <div>
          <label style={lbl}>IFSC</label>
          <input style={input()} value={f.ifsc} onChange={e => set('ifsc', e.target.value.toUpperCase())} placeholder="HDFC0001234" maxLength={11} />
        </div>
        <div>
          <label style={lbl}>Branch</label>
          <input style={input()} value={f.branch} onChange={e => set('branch', e.target.value)} placeholder="Hosur Industrial Estate" />
        </div>
      </Section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
        <button type="submit" disabled={saving} className="btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, opacity: saving ? 0.6 : 1 }}>
          <Check size={16} /> {saving ? 'Saving…' : 'Add vendor'}
        </button>
        <button type="button" onClick={() => navigate('/vendors')} className="btn-secondary">Cancel</button>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          <Phone size={12} style={{ verticalAlign: -2 }} /> Only the name is required — add the rest whenever you have it.
        </span>
      </div>
    </form>
  );
}
