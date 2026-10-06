/* ══════════════════════════════════════════════════════════
   The invoice builder — raise a tax invoice, or edit a draft one.

   Three ways in, one screen:
     /customer-orders/:coId/invoice   bill a customer order
     /sales-invoices/new              an invoice with no order behind it
     /sales-invoices/:id/edit         change a draft before it is issued

   What it used to be: a date, a GST rate and the lines. The number was
   whatever the counter said and could not be set; the due date, place of
   supply, bill-to and ship-to, e-way bill and terms were never sent, so
   every invoice raised from it had no due date (and was therefore never
   overdue), and the HSN of every line was blank. "Not that much editable"
   was an understatement.

   Now every particular Rule 46 puts on the face of a tax invoice is on this
   screen and editable before it is raised, starting with the number —
   prefilled with the next in the business's own series, and free to type
   over.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ReceiptIndianRupee, Hash, AlertTriangle, Settings2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { today } from '../lib/dates';
import { GST_STATES, stateCode, stateName } from '../lib/gstStates';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const rup = n => `₹${Number(r2(n)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const blankParty = { name: '', address: '', gstin: '', state: '' };
const blankLine = () => ({ description: '', hsn: '', uom: 'nos', quantity: '', rate: '' });

const S = {
  card: { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 18 },
  input: { width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.84rem', outline: 'none', fontFamily: 'inherit' },
  lbl: { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 },
  th: { padding: '8px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', textAlign: 'left' },
  h: { fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, fontSize: '0.92rem' },
};

/* Module level, not inside the page: a component declared inside another
   is a new type on every render, so its input loses focus on each key. */
function Field({ label, children, hint, span }) {
  return (
    <div style={span ? { gridColumn: `span ${span}` } : undefined}>
      <label style={S.lbl}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function PartyFields({ title, value, onChange, disabled }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div style={{ display: 'grid', gap: 8, opacity: disabled ? 0.55 : 1 }}>
      <div style={{ ...S.lbl, marginBottom: 0, textTransform: 'uppercase', letterSpacing: '.04em' }}>{title}</div>
      <input style={S.input} placeholder="Name" value={value.name || ''} onChange={set('name')} disabled={disabled} aria-label={`${title} name`} />
      <textarea style={{ ...S.input, minHeight: 58, resize: 'vertical' }} placeholder="Address" value={value.address || ''} onChange={set('address')} disabled={disabled} aria-label={`${title} address`} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input style={{ ...S.input, fontFamily: 'var(--font-mono)' }} placeholder="GSTIN (blank if unregistered)" value={value.gstin || ''}
          onChange={e => onChange({ ...value, gstin: e.target.value.toUpperCase() })} disabled={disabled} aria-label={`${title} GSTIN`} />
        <input style={S.input} placeholder="State" value={value.state || ''} onChange={set('state')} disabled={disabled} aria-label={`${title} state`} />
      </div>
    </div>
  );
}

function mapInvoiceToForm(inv) {
  const bill = { name: inv.bill_to_name || inv.customer?.name || '', address: inv.bill_to_address || '', gstin: inv.bill_to_gstin || '', state: inv.bill_to_state || '' };
  const ship = { name: inv.ship_to_name || '', address: inv.ship_to_address || '', gstin: inv.ship_to_gstin || '', state: inv.ship_to_state || '' };
  const same = !ship.address || (ship.address === bill.address && ship.name === bill.name);
  return {
    invoiceNumber: inv.invoice_number || '',
    invoiceDate: inv.invoice_date ? String(inv.invoice_date).slice(0, 10) : today(),
    dueDate: inv.due_date ? String(inv.due_date).slice(0, 10) : '',
    posCode: inv.place_of_supply_code || stateCode(inv.place_of_supply) || '',
    interstate: !!inv.interstate,
    gstRate: inv.gst_rate ?? 18,
    reverseCharge: !!inv.reverse_charge,
    ewayBillNo: inv.eway_bill_no || '',
    billTo: bill, shipSame: same, shipTo: same ? { ...bill } : ship,
    discount: Number(inv.discount) || '', roundOff: Number(inv.round_off) || '',
    notes: inv.notes || '', terms: inv.terms || '',
  };
}

function mapPrefillToForm(d) {
  const bill = { ...blankParty, ...(d.billTo || {}) };
  const ship = { ...blankParty, ...(d.shipTo || {}) };
  const same = !ship.address || (ship.address === bill.address && ship.name === bill.name);
  return {
    invoiceNumber: d.nextNumber || '',
    invoiceDate: today(),
    dueDate: d.dueDate || '',
    posCode: d.placeOfSupplyCode || stateCode(d.placeOfSupply) || '',
    interstate: !!d.interstate,
    gstRate: d.gstRate ?? 18,
    reverseCharge: !!d.reverseCharge,
    ewayBillNo: '',
    billTo: bill, shipSame: same, shipTo: same ? { ...bill } : ship,
    discount: d.discount || '', roundOff: d.roundOff || '',
    notes: d.notes || '', terms: d.terms || '',
  };
}

/* GST: at most 16 characters, letters, digits, "-" and "/" (Rule 46(b)). */
function numberProblem(n) {
  const s = String(n || '').trim();
  if (!s) return 'The invoice number cannot be blank.';
  if (s.length > 16) return `${s.length} characters — GST allows at most 16.`;
  if (!/^[A-Za-z0-9/-]+$/.test(s)) return 'Only letters, digits, “-” and “/” are allowed in a GST invoice number.';
  return null;
}

export default function SalesInvoiceBuilder() {
  const { coId, id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const mode = id ? 'edit' : coId ? 'order' : 'new';

  const [ctx, setCtx] = useState(null);           // the order / customer / invoice it starts from
  const [f, setF] = useState(null);
  const [items, setItems] = useState([]);
  const [suggested, setSuggested] = useState('');  // the series' next number, for "use the next number"
  const [supplier, setSupplier] = useState(null);  // our own state code
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState(null);
  const [saving, setSaving] = useState(false);

  const fromPrefill = (d) => {
    setCtx(d);
    setCustomerId(d.customerId || d.customer?.id || null);
    setSupplier(d.supplierStateCode || null);
    setSuggested(d.nextNumber || '');
    setF(mapPrefillToForm(d));
    setItems((d.items || []).length ? d.items.map(it => ({ ...blankLine(), ...it, quantity: it.quantity ?? '', rate: it.rate ?? '', hsn: it.hsn || '' })) : [blankLine()]);
  };

  useEffect(() => {
    if (mode === 'order') {
      fetch(`${API}/sales-invoices/prefill/${coId}`).then(r => (r.ok ? r.json() : null)).then(d => {
        if (!d) { toast.error('Could not load the order'); return; }
        fromPrefill(d);
      });
    } else if (mode === 'edit') {
      fetch(`${API}/sales-invoices/${id}`).then(r => (r.ok ? r.json() : null)).then(inv => {
        if (!inv) { toast.error('Could not load the invoice'); return; }
        if (inv.status !== 'Draft') {
          toast.error('Only a draft invoice can be edited. Reopen it as a draft first.');
          navigate(`/sales-invoices/${id}`, { replace: true });
          return;
        }
        setCtx({ invoice: inv, customer: inv.customer, customerOrder: inv.order });
        setCustomerId(inv.customer_id);
        setSupplier(stateCode(inv.company?.stateCode || inv.company?.gstin));
        setF(mapInvoiceToForm(inv));
        setItems(inv.items.map(it => ({ description: it.description || '', hsn: it.hsn || '', uom: it.uom || 'nos', quantity: it.quantity ?? '', rate: it.rate ?? '' })));
      });
    } else {
      fetch(`${API}/customers?limit=500`).then(r => (r.ok ? r.json() : [])).then(d => {
        const list = Array.isArray(d) ? d : (d.items || d.rows || []);
        setCustomers(list);
        const pre = new URLSearchParams(location.search).get('customer');
        if (pre) pickCustomer(pre);
      });
      setCtx({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coId, id]);

  const pickCustomer = async (cid) => {
    setCustomerId(cid ? Number(cid) : null);
    if (!cid) { setF(null); return; }
    const r = await fetch(`${API}/sales-invoices/prefill-customer/${cid}`);
    if (!r.ok) { toast.error('Could not load that customer'); return; }
    fromPrefill(await r.json());
  };

  const set = (k) => (e) => setF(p => ({ ...p, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const setItem = (i, patch) => setItems(list => list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  /* The tax split follows the place of supply against our own state. Only
     when one of them is unknown does the choice fall to the person. */
  const derivedInter = supplier && f?.posCode ? supplier !== f.posCode : null;
  const interstate = derivedInter ?? !!f?.interstate;

  const t = useMemo(() => {
    const lines = items.map(it => r2((Number(it.quantity) || 0) * (Number(it.rate) || 0)));
    const sub = r2(lines.reduce((s, a) => s + a, 0));
    const taxable = r2(sub - (Number(f?.discount) || 0));
    const gst = r2(taxable * (Number(f?.gstRate) || 0) / 100);
    const cgst = interstate ? 0 : r2(gst / 2);
    const sgst = interstate ? 0 : r2(gst - cgst);
    const before = r2(taxable + gst);
    const net = r2(before + (Number(f?.roundOff) || 0));
    return { lines, sub, taxable, gst, cgst, sgst, before, net };
  }, [items, f?.discount, f?.gstRate, f?.roundOff, interstate]);

  const numberError = f ? numberProblem(f.invoiceNumber) : null;

  const save = async () => {
    const valid = items.filter(it => String(it.description || '').trim());
    if (!customerId) { toast.error('Pick a customer'); return; }
    if (!valid.length) { toast.error('Add at least one line item'); return; }
    if (valid.some(it => !(Number(it.quantity) > 0))) { toast.error('Every line needs a quantity above zero'); return; }
    if (numberError) { toast.error(numberError); return; }
    if (f.dueDate && f.invoiceDate && f.dueDate < f.invoiceDate) { toast.error('The due date is before the invoice date'); return; }
    const shipTo = f.shipSame ? f.billTo : f.shipTo;
    setSaving(true);
    try {
      let res;
      if (mode === 'edit') {
        res = await fetch(`${API}/sales-invoices/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoice_number: f.invoiceNumber.trim(), invoice_date: f.invoiceDate || null, due_date: f.dueDate || null,
            discount: Number(f.discount) || 0, gst_rate: Number(f.gstRate) || 0, round_off: Number(f.roundOff) || 0,
            notes: f.notes || null, terms: f.terms || null,
            place_of_supply: f.posCode ? stateName(f.posCode) : null, place_of_supply_code: f.posCode || null,
            reverse_charge: !!f.reverseCharge, eway_bill_no: f.ewayBillNo || null,
            bill_to_name: f.billTo.name || null, bill_to_address: f.billTo.address || null, bill_to_gstin: f.billTo.gstin || null, bill_to_state: f.billTo.state || null,
            ship_to_name: shipTo.name || null, ship_to_address: shipTo.address || null, ship_to_gstin: shipTo.gstin || null, ship_to_state: shipTo.state || null,
            items: valid,
          }),
        });
      } else {
        res = await fetch(`${API}/sales-invoices`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId, customerOrderId: mode === 'order' ? Number(coId) : null,
            /* Sent only when it was typed over: the server's own allocation
               is the safer source of the next number if two people raise
               invoices at the same moment. */
            invoiceNumber: f.invoiceNumber.trim() !== suggested ? f.invoiceNumber.trim() : undefined,
            invoiceDate: f.invoiceDate || null, dueDate: f.dueDate || null,
            items: valid, discount: Number(f.discount) || 0, gstRate: Number(f.gstRate) || 0,
            interstate, roundOff: Number(f.roundOff) || 0, notes: f.notes || null, terms: f.terms || null,
            placeOfSupply: f.posCode || null, reverseCharge: !!f.reverseCharge, ewayBillNo: f.ewayBillNo || null,
            billTo: f.billTo, shipTo,
          }),
        });
      }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save the invoice');
      toast.success(mode === 'edit' ? `Invoice ${d.invoice_number} saved` : `Invoice ${d.invoiceNumber} created`);
      navigate(`/sales-invoices/${mode === 'edit' ? id : d.id}`);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const back = mode === 'order' ? '/customer-orders' : mode === 'edit' ? `/sales-invoices/${id}` : '/sales-invoices';
  const title = mode === 'edit' ? 'Edit invoice' : 'New tax invoice';
  const ref = mode === 'order'
    ? <>Order <b>{ctx?.customerOrder?.order_number}</b> · Customer <b>{ctx?.customer?.name || '—'}</b></>
    : mode === 'edit' ? <>Draft · Customer <b>{ctx?.customer?.name || '—'}</b></>
      : <>An invoice with no order behind it — a one-off job, a service, scrap sold.</>;

  if (!ctx) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', paddingBottom: 40 }}>
      <button onClick={() => navigate(back)} className="inv-act-btn" style={{ marginBottom: 16 }}><ArrowLeft size={15} /> Back</button>

      <div style={{ ...S.card, marginBottom: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <ReceiptIndianRupee size={22} style={{ color: 'var(--brand-amber)' }} /> {title}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: 4 }}>{ref}</p>
        {mode === 'new' && (
          <div style={{ marginTop: 12, maxWidth: 420 }}>
            <Field label="Customer">
              <select style={S.input} value={customerId || ''} onChange={e => pickCustomer(e.target.value)} aria-label="Customer">
                <option value="">Choose a customer…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
        )}
      </div>

      {f && (
        <>
          {/* ── number and dates ── */}
          <div style={{ ...S.card, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <Field label="Invoice number"
              hint={mode !== 'edit' && suggested && f.invoiceNumber.trim() !== suggested
                ? <>Typed over. <button type="button" onClick={() => setF(p => ({ ...p, invoiceNumber: suggested }))}
                    style={{ border: 0, background: 'none', padding: 0, color: 'var(--brand-amber)', cursor: 'pointer', fontSize: 'inherit', fontWeight: 600 }}>Use {suggested}</button></>
                : mode !== 'edit' ? 'Next in your series — type over it to use any number' : null}>
              <div style={{ position: 'relative' }}>
                <Hash size={13} style={{ position: 'absolute', left: 9, top: 11, color: 'var(--text-muted)' }} />
                <input style={{ ...S.input, paddingLeft: 26, fontFamily: 'var(--font-mono)', fontWeight: 700, borderColor: numberError ? '#dc2626' : undefined }}
                  value={f.invoiceNumber} onChange={set('invoiceNumber')} maxLength={24} aria-label="Invoice number" aria-invalid={!!numberError} />
              </div>
              {numberError && <div role="alert" style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: 3 }}>{numberError}</div>}
            </Field>
            <Field label="Invoice date"><input style={S.input} type="date" value={f.invoiceDate} onChange={set('invoiceDate')} /></Field>
            <Field label="Due date"><input style={S.input} type="date" value={f.dueDate} onChange={set('dueDate')} /></Field>
            <Field label="Numbering" hint="Prefix, digits and next number">
              <button type="button" className="btn-secondary btn-sm" onClick={() => window.open('/document-numbering', '_blank', 'noopener')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}>
                <Settings2 size={14} /> Set up your series
              </button>
            </Field>
          </div>

          {/* ── parties and tax ── */}
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }}>
              <PartyFields title="Bill to" value={f.billTo} onChange={v => setF(p => ({ ...p, billTo: v, shipTo: p.shipSame ? { ...v } : p.shipTo }))} />
              <div>
                <PartyFields title="Ship to" value={f.shipSame ? f.billTo : f.shipTo} disabled={f.shipSame}
                  onChange={v => setF(p => ({ ...p, shipTo: v }))} />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={f.shipSame} onChange={e => setF(p => ({ ...p, shipSame: e.target.checked, shipTo: e.target.checked ? { ...p.billTo } : p.shipTo }))} />
                  Same as billing
                </label>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
              <Field label="Place of supply" hint="Where the goods go — decides CGST + SGST or IGST">
                <select style={S.input} value={f.posCode} onChange={set('posCode')} aria-label="Place of supply">
                  <option value="">Not set</option>
                  {GST_STATES.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}
                </select>
              </Field>
              <Field label="GST type">
                {derivedInter == null ? (
                  <select style={S.input} value={f.interstate ? 'igst' : 'cgstsgst'} onChange={e => setF(p => ({ ...p, interstate: e.target.value === 'igst' }))}>
                    <option value="cgstsgst">Intra-state (CGST + SGST)</option>
                    <option value="igst">Inter-state (IGST)</option>
                  </select>
                ) : (
                  <div style={{ ...S.input, background: 'transparent', fontWeight: 600 }}>{interstate ? 'Inter-state · IGST' : 'Intra-state · CGST + SGST'}</div>
                )}
              </Field>
              <Field label="GST rate %"><input style={S.input} type="number" min="0" step="0.01" value={f.gstRate} onChange={set('gstRate')} /></Field>
              <Field label="E-way bill no.">
                <input style={{ ...S.input, fontFamily: 'var(--font-mono)' }} value={f.ewayBillNo} onChange={set('ewayBillNo')} placeholder="If the goods need one" />
              </Field>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={f.reverseCharge} onChange={set('reverseCharge')} /> Tax payable on reverse charge
            </label>
            {derivedInter == null && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.76rem', color: '#b45309', marginTop: 8 }}>
                <AlertTriangle size={13} />
                {supplier ? 'Pick the place of supply and the GST type will follow from it.' : 'Your own state is not set (Company profile → GSTIN), so the GST type is chosen by hand.'}
              </div>
            )}
          </div>

          {/* ── lines ── */}
          <div style={{ ...S.card, marginBottom: 16, overflowX: 'auto' }}>
            <div style={S.h}>Line items</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead><tr>
                <th style={{ ...S.th, width: '38%' }}>Description</th><th style={S.th}>HSN / SAC</th><th style={S.th}>UOM</th>
                <th style={S.th}>Qty</th><th style={S.th}>Rate</th><th style={{ ...S.th, textAlign: 'right' }}>Amount</th><th style={S.th}></th>
              </tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '5px 4px' }}><input style={S.input} value={it.description} onChange={e => setItem(i, { description: e.target.value })} placeholder="Item or service" aria-label={`Line ${i + 1} description`} /></td>
                    <td style={{ padding: '5px 4px', width: 96 }}><input style={{ ...S.input, fontFamily: 'var(--font-mono)' }} value={it.hsn || ''} onChange={e => setItem(i, { hsn: e.target.value.replace(/[^\d]/g, '') })} aria-label={`Line ${i + 1} HSN`} /></td>
                    <td style={{ padding: '5px 4px', width: 76 }}><input style={S.input} value={it.uom || ''} onChange={e => setItem(i, { uom: e.target.value })} aria-label={`Line ${i + 1} unit`} /></td>
                    <td style={{ padding: '5px 4px', width: 88 }}><input style={S.input} type="number" min="0" step="any" value={it.quantity} onChange={e => setItem(i, { quantity: e.target.value })} aria-label={`Line ${i + 1} quantity`} /></td>
                    <td style={{ padding: '5px 4px', width: 104 }}><input style={S.input} type="number" min="0" step="any" value={it.rate} onChange={e => setItem(i, { rate: e.target.value })} aria-label={`Line ${i + 1} rate`} /></td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{rup(t.lines[i])}</td>
                    <td style={{ padding: '5px 4px' }}>
                      <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} aria-label={`Remove line ${i + 1}`}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setItems([...items, blankLine()])} className="btn-secondary" style={{ fontSize: '0.78rem', marginTop: 10 }}><Plus size={14} /> Add line</button>
          </div>

          {/* ── adjustments and totals ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
            <div style={S.card}>
              <div style={S.h}>Adjustments and notes</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Discount ₹ (−)"><input style={S.input} type="number" min="0" step="any" value={f.discount} onChange={set('discount')} /></Field>
                <Field label="Round off ₹" hint={<button type="button" onClick={() => setF(p => ({ ...p, roundOff: r2(Math.round(t.before) - t.before) }))}
                  style={{ border: 0, background: 'none', padding: 0, color: 'var(--brand-amber)', cursor: 'pointer', fontSize: 'inherit', fontWeight: 600 }}>Round to the nearest rupee</button>}>
                  <input style={S.input} type="number" step="0.01" value={f.roundOff} onChange={set('roundOff')} />
                </Field>
              </div>
              <div style={{ marginTop: 12 }}><Field label="Notes (printed on the invoice)"><input style={S.input} value={f.notes} onChange={set('notes')} placeholder="e.g. Against your PO 4471" /></Field></div>
              <div style={{ marginTop: 12 }}><Field label="Terms and conditions"><textarea style={{ ...S.input, minHeight: 70, resize: 'vertical' }} value={f.terms} onChange={set('terms')} placeholder="From your company profile if left blank" /></Field></div>
            </div>
            <div style={S.card}>
              <div style={S.h}>Invoice summary</div>
              {[
                ['Sub-total', t.sub], ['− Discount', -(Number(f.discount) || 0)], ['Taxable value', t.taxable],
                ...(interstate ? [[`IGST @ ${Number(f.gstRate) || 0}%`, t.gst]]
                  : [[`CGST @ ${r2((Number(f.gstRate) || 0) / 2)}%`, t.cgst], [`SGST @ ${r2((Number(f.gstRate) || 0) / 2)}%`, t.sgst]]),
                ['Round off', Number(f.roundOff) || 0],
              ].map(([k, v], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.84rem', color: k === 'Taxable value' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: k === 'Taxable value' ? 700 : 500, borderTop: k === 'Taxable value' ? '1px solid var(--border-subtle)' : 'none' }}>
                  <span>{k}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{rup(v)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', marginTop: 6, borderTop: '2px solid var(--border-default)', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                <span>Invoice total</span><span style={{ fontFamily: 'var(--font-mono)' }}>{rup(t.net)}</span>
              </div>
              <button onClick={save} disabled={saving} className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
                {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : `Create invoice ${f.invoiceNumber.trim() || ''}`}
              </button>
              {mode !== 'edit' && (
                <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
                  It is saved as a draft — everything stays editable until you mark it sent.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
