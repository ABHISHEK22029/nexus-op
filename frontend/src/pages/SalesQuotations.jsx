/* ══════════════════════════════════════════════════════════
   Quotations — searchable, filterable, paginated.

   The totals come from `q.summary`, not from summing the rows on screen.
   Summing rows was only ever correct while every row was on screen; with
   pagination "Quoted" would quietly mean "quoted on page 1" — a number that
   looks authoritative and changes when you click Next.

   `expired` is the one worth a card of its own: a quote past its validity
   date that nobody has closed is either a sale going cold or a price you no
   longer honour, and both need someone to look.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FileText, Plus, Trash2, X, ArrowRightLeft, Eye, MessageSquareQuote, Share2, Copy, Check, MessageCircle, Mail } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';

import { getToken } from '../lib/apiAuth';
import { today, daysFromToday } from '../lib/dates';
import UnitSelect from '../components/UnitSelect';
import { lineProblems, discountAmount, adjustmentProblems, money } from '../lib/lineChecks';
import { suggestDeliveryDays } from '../lib/leadTime';
import FitNumber from '../components/FitNumber';
import { fmtCompactINR, fmtINR } from '../lib/format';
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Converted'];
const STATUS_COLOR = { Draft: '#64748b', Sent: '#2563eb', Accepted: '#10b981', Rejected: '#ef4444', Converted: '#8b5cf6' };
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
/* "8 Oct 2026" — for a date column ("2026-10-08") or a timestamp. */
const onDate = (v) => {
  if (!v) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(`${v}T00:00:00`) : new Date(v);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const BLANK_HEAD = () => ({ customerId: '', quoteDate: today(), validUntil: daysFromToday(15), gstRate: '18', discount: '', discountMode: 'amt', terms: '', deliveryDays: '', deliveryNote: '' });
const BLANK_LINE = () => ({ skuId: '', description: '', hsn: '', quantity: '', uom: 'nos', rate: '', moq: null, leadTime: '' });

/* What Enquiries left for us, when we arrived from Convert to quotation. */
function readEnquiryPrefill(search) {
  if (new URLSearchParams(search).get('from') !== 'enquiry') return null;
  try { return JSON.parse(sessionStorage.getItem('quotation_prefill') || 'null'); } catch { return null; }
}

export default function SalesQuotations() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const q = useListQuery('sales-quotations', { pageSize: 25 });
  const [customers, setCustomers] = useState([]);
  const [skus, setSkus] = useState([]);
  /* "Convert to quotation" on an enquiry leaves what was asked for in
     sessionStorage and comes here. That hand-off used to be written and
     never read, so the form opened empty and the request was retyped —
     the one thing converting is meant to save. It is read once, as the
     form's starting state, and then cleared so a refresh does not re-open
     a quotation already started. */
  const location = useLocation();
  const [prefill] = useState(() => readEnquiryPrefill(location.search));
  useEffect(() => {
    if (prefill) { try { sessionStorage.removeItem('quotation_prefill'); } catch { /* storage blocked */ } }
  }, [prefill]);
  const [showForm, setShowForm] = useState(() => !!prefill);
  const [head, setHead] = useState(() => ({ ...BLANK_HEAD(), customerId: prefill?.customerId ? String(prefill.customerId) : '' }));
  /* The product's minimum order and lead time travel with each line: the
     first to warn when a quantity is under it, the second to suggest the
     delivery promise. Neither is sent as part of the line. */
  const [lines, setLines] = useState(() => (prefill?.items?.length
    ? prefill.items.map(i => ({
        skuId: i.skuId ? String(i.skuId) : '', description: i.description || '', hsn: i.hsn || '',
        quantity: i.quantity ?? '', uom: i.uom || 'nos', rate: i.rate ?? '',
        moq: Number(i.moq) > 0 ? Number(i.moq) : null, leadTime: i.leadTime || '',
      }))
    : [BLANK_LINE()]));
  /* Delivery follows the suggestion until somebody types their own. */
  const [deliveryTouched, setDeliveryTouched] = useState(false);
  const [sharing, setSharing] = useState(null);
  /* The enquiry being priced, shown above the form. */
  const [fromEnquiry, setFromEnquiry] = useState(() => (prefill
    ? { id: prefill.enquiryId || null, ref: prefill.enquiryRef || null, message: prefill.message || null, customer: prefill.customerName || null }
    : null));

  // Only the pick-lists for the form load here; the list itself is q's job.
  useEffect(() => {
    (async () => {
      const [c, s] = await Promise.all([
        fetch(`${API}/customers`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/skus`).then(r => r.ok ? r.json() : []),
      ]);
      setCustomers(Array.isArray(c) ? c : []); setSkus(Array.isArray(s) ? s : []);
    })();
  }, []);

  const setLine = (i, patch) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  /* Quantity times rate. Number('') is 0, so a half-filled line adds
     nothing instead of spreading NaN across every other total. */
  const lineTotal = (l) => (Number(l.quantity) || 0) * (Number(l.rate) || 0);
  const pickSku = (i, skuId) => {
    const sku = skus.find(s => String(s.id) === String(skuId));
    setLine(i, sku
      ? { skuId, description: sku.name, uom: sku.unit || 'nos', rate: sku.price || '', hsn: sku.hsn || '',
          moq: Number(sku.moq) > 0 ? Number(sku.moq) : null, leadTime: sku.lead_time_note || '' }
      : { skuId: '', moq: null, leadTime: '' });
  };

  /* "Delivery: within N days of order", suggested from the lines' lead
     times — the longest, since the order ships when its slowest line is
     ready. A suggestion, said to be one, and replaced the moment somebody
     types their own number. */
  const suggestion = suggestDeliveryDays(lines.filter(l => l.leadTime).map(l => ({ note: l.leadTime, label: l.description })));
  const deliveryValue = deliveryTouched ? head.deliveryDays : (suggestion ? String(suggestion.days) : head.deliveryDays);
  const deliveryProblem = deliveryValue !== '' && !(Number.isInteger(Number(deliveryValue)) && Number(deliveryValue) >= 0 && Number(deliveryValue) <= 730)
    ? 'Delivery is a whole number of days, from 0 to 730.' : null;

  // live preview of the total
  const sub = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  const disc = discountAmount(head.discount, head.discountMode, sub);
  const taxable = sub - disc;
  const gst = taxable * (Number(head.gstRate) || 0) / 100;
  const net = taxable + gst;
  /* what would stop this quotation saving, shown where it is wrong */
  const rowProblems = lineProblems(lines);
  const adjProblems = adjustmentProblems({ discount: head.discount, mode: head.discountMode, sub });

  const create = async (e) => {
    e.preventDefault();
    if (!head.customerId) { toast.error('Pick a customer'); return; }
    /* The spare blank line is left out; a line with figures but no
       description is no longer dropped without a word. */
    if (rowProblems.list.length) { toast.error(rowProblems.list[0]); return; }
    const items = rowProblems.kept.map((l) => {
      const line = { ...l };
      delete line.moq; delete line.leadTime;   // the builder's, not the line's
      return line;
    });
    if (!items.length) { toast.error('Add at least one line item'); return; }
    if (adjProblems.length) { toast.error(adjProblems[0]); return; }
    if (deliveryProblem) { toast.error(deliveryProblem); return; }
    const token = getToken();
    const res = await fetch(`${API}/sales-quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        ...head, discount: disc, items, enquiryId: fromEnquiry?.id || undefined,
        deliveryDays: deliveryValue === '' ? null : Number(deliveryValue),
        deliveryNote: head.deliveryNote.trim() || null,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(d.detail || d.error || 'Could not create the quotation');
    const under = d.belowMoq?.length || 0;
    toast.success(`Quotation ${d.quoteNumber} created${under ? ` · ${under} line${under === 1 ? '' : 's'} below the minimum order, as you set` : ''}`);
    setFromEnquiry(null);
    setShowForm(false); setHead(BLANK_HEAD()); setDeliveryTouched(false);
    setLines([BLANK_LINE()]);
    q.reload();
  };

  /* Share for approval: makes (or finds) the quotation's private link and
     opens the ways to send it. A Draft becomes Sent here — the customer now
     holds the offer. */
  const share = async (qt) => {
    const token = getToken();
    const res = await fetch(`${API}/sales-quotations/${qt.id}/share-link`, {
      method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(d.detail || d.error || 'Could not make the link');
    setSharing({ ...d, wasDraft: qt.status === 'Draft' });
    q.reload();
  };

  const convert = async (qt) => {
    if (!window.confirm(`Convert ${qt.quote_number} into a customer order?`)) return;
    const token = getToken();
    const res = await fetch(`${API}/sales-quotations/${qt.id}/convert`, {
      method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(d.detail || d.error || 'Could not convert this quotation');
    toast.success(`Won! Created order ${d.orderNumber}`);
    navigate('/customer-orders');
  };

  const setStatus = async (id, status) => {
    const token = getToken();
    const res = await fetch(`${API}/sales-quotations/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return toast.error(b.detail || b.error || 'Could not update the status');
    }
    q.reload();
  };

  const del = async (qt) => {
    if (!window.confirm(`Delete ${qt.quote_number}?`)) return;
    const token = getToken();
    const res = await fetch(`${API}/sales-quotations/${qt.id}`, {
      method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return toast.error(b.detail || b.error || 'Could not delete');
    }
    toast.success('Deleted');
    q.reload();
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const input = { width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.83rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  const s = q.summary || {};
  const canDelete = can('sales-quotations', 'delete');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            <FileText size={24} style={{ color: 'var(--brand-amber)' }} /> Quotations
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Quote your customers up front — then convert a won quote straight into an order.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> New Quotation</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginBottom: 18 }}>
        <Kpi card={card} label={q.isFiltered ? 'Quotations (filtered)' : 'Quotations'} value={s.count ?? q.total} />
        <Kpi card={card} label="Quoted value" value={fmtCompactINR(s.quoted)} exact={fmtINR(s.quoted)} />
        <Kpi card={card} label="Open value" value={fmtCompactINR(s.open_value)} exact={fmtINR(s.open_value)} tone="#2563eb" />
        <Kpi card={card} label="Won" value={s.won ?? 0} tone="#10b981" />
        {/* Past its validity date and still not closed — a price we may no
            longer honour, sitting in front of a customer. */}
        <Kpi card={card} label="Expired" value={s.expired ?? 0} tone={Number(s.expired) > 0 ? '#ef4444' : 'var(--text-muted)'} />
      </div>

      {showForm && (
        <form onSubmit={create} style={{ ...card, padding: 18, marginBottom: 18 }}>
          {fromEnquiry && (
            /* What the customer asked for, beside the form that prices it. */
            <div data-from-enquiry style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', marginBottom: 14, borderRadius: 10, background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.25)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <MessageSquareQuote size={16} style={{ color: '#2563eb', flex: 'none', marginTop: 1 }} />
              <div>
                <b style={{ color: 'var(--text-primary)' }}>From enquiry{fromEnquiry.ref ? ` ${fromEnquiry.ref}` : ''}{fromEnquiry.customer ? ` · ${fromEnquiry.customer}` : ''}</b>
                {' '}— their lines are below; price them.
                {fromEnquiry.message && <div style={{ marginTop: 4, fontStyle: 'italic' }}>“{fromEnquiry.message}”</div>}
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>Customer *</label>
              <select style={input} value={head.customerId} onChange={e => setHead({ ...head, customerId: e.target.value })} aria-label="Customer">
                <option value="">— Select —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Quote Date</label><input style={input} type="date" value={head.quoteDate} onChange={e => setHead({ ...head, quoteDate: e.target.value })} /></div>
            <div><label style={lbl}>Valid Until</label><input style={input} type="date" value={head.validUntil} onChange={e => setHead({ ...head, validUntil: e.target.value })} /></div>
            <div><label style={lbl}>GST %</label><input style={input} type="number" min="0" max="28" step="0.01" inputMode="decimal" autoComplete="off" value={head.gstRate} onChange={e => setHead({ ...head, gstRate: e.target.value })} /></div>
          </div>

          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Line items</div>
          {lines.map((l, i) => {
            /* Under the product's minimum order: said, not stopped. The
               seller may have agreed a smaller first order. */
            const underMoq = l.moq && Number(l.quantity) > 0 && Number(l.quantity) < l.moq;
            return (
            <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1.2 }}><label style={lbl}>Product</label>
                {skus.length ? (
                  <select style={input} value={l.skuId} onChange={e => pickSku(i, e.target.value)} aria-label={`Line ${i + 1} product`}>
                    <option value="">Not a saved product: type it →</option>
                    {skus.map(sk => <option key={sk.id} value={sk.id}>{sk.name}{sk.sku_code ? ` · ${sk.sku_code}` : ''}</option>)}
                  </select>
                ) : (
                  /* It used to be a list holding only "— free text —", which
                     read as a box you could type in and was not. */
                  <div style={{ ...input, background: 'transparent', fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.3, padding: '6px 8px' }}>
                    No saved products. Type the item, or <a href="/skus" style={{ color: 'var(--brand-amber)', fontWeight: 600 }}>add products</a>.
                  </div>
                )}
              </div>
              <div style={{ flex: 2 }}><label style={lbl}>Description *</label>
                <input style={{ ...input, borderColor: rowProblems.rows.has(i) ? '#dc2626' : undefined }} value={l.description} onChange={e => setLine(i, { description: e.target.value })}
                  aria-label={`Line ${i + 1} description`} aria-invalid={rowProblems.rows.has(i)} autoComplete="off" placeholder="Item or service" />
              </div>
              {/* Unit, quantity, rate, total — the order a purchase order
                  is written in, and the order the printed quotation, the
                  invoice and the vendor bill already used. */}
              <div style={{ flex: 0.8 }}><label style={lbl}>Unit</label><UnitSelect style={input} value={l.uom} onChange={v => setLine(i, { uom: v })} ariaLabel={`Line ${i + 1} unit`} /></div>
              <div style={{ flex: 0.7 }}><label style={lbl}>Qty</label><input style={{ ...input, borderColor: underMoq ? '#d97706' : undefined }} type="number" min="0" step="any" inputMode="decimal" autoComplete="off" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} aria-label={`Line ${i + 1} quantity`} /></div>
              <div style={{ flex: 0.9 }}><label style={lbl}>Rate ₹</label><input style={input} type="number" min="0" step="any" inputMode="decimal" autoComplete="off" value={l.rate} onChange={e => setLine(i, { rate: e.target.value })} aria-label={`Line ${i + 1} rate`} /></div>
              <div style={{ flex: 0.9 }}>
                <label style={lbl}>Total ₹</label>
                <div style={{ ...input, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  background: 'var(--bg-elevated)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {lineTotal(l) ? lineTotal(l).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                </div>
              </div>
              <button type="button" onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', paddingBottom: 9 }}><X size={16} /></button>
            </div>
            {underMoq && (
              <div role="status" data-moq-warning style={{ fontSize: '0.74rem', color: '#b45309', marginTop: 4, fontWeight: 600 }}>
                Below the minimum order of {l.moq} {l.uom || 'nos'} for this product. You can still save it — for an agreed smaller first order, say.
              </div>
            )}
            </div>
            );
          })}
          <button type="button" onClick={() => setLines([...lines, BLANK_LINE()])} className="btn-secondary" style={{ fontSize: '0.78rem', marginTop: 4 }}><Plus size={14} /> Add line</button>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={lbl}>Discount</label>
              <div style={{ display: 'flex', gap: 6, width: 230 }}>
                <input style={{ ...input, borderColor: adjProblems.discount ? '#dc2626' : undefined }} type="number" min="0" step="any" inputMode="decimal" autoComplete="off"
                  value={head.discount} onChange={e => setHead({ ...head, discount: e.target.value })} placeholder="0" aria-label="Discount" />
                <select style={{ ...input, width: 64, flex: 'none' }} value={head.discountMode} onChange={e => setHead({ ...head, discountMode: e.target.value })} aria-label="Discount in">
                  <option value="amt">₹</option><option value="pct">%</option>
                </select>
              </div>
              {adjProblems.discount && <div role="alert" style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 4 }}>{adjProblems.discount}</div>}
              {rowProblems.list[0] && <div role="alert" style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 4 }}>{rowProblems.list[0]}</div>}
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <div>Sub-total: <b style={{ color: 'var(--text-primary)' }}>{money(sub)}</b></div>
              {disc > 0 && <div>Discount: <b style={{ color: 'var(--text-primary)' }}>{money(-disc)}</b></div>}
              <div>GST ({head.gstRate || 0}%): <b style={{ color: 'var(--text-primary)' }}>{money(gst)}</b></div>
              <div style={{ fontSize: '1.05rem', marginTop: 2 }}>Net: <b style={{ color: 'var(--brand-amber)' }}>{money(net)}</b></div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}><label style={lbl}>Terms / notes</label><input style={input} value={head.terms} onChange={e => setHead({ ...head, terms: e.target.value })} placeholder="Payment terms, validity…" /></div>

          {/* The delivery promise. Days after the order rather than a date,
              because nobody knows yet on what day the customer will say yes;
              converting to an order turns it into the date to ship by. */}
          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <label style={lbl} htmlFor="sq-delivery-days">
                Delivery
                {!deliveryTouched && suggestion && (
                  <span style={{ marginLeft: 6, fontSize: '0.64rem', fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'rgba(37, 99, 235, 0.12)', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.04em' }}>Suggested</span>
                )}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                within
                <input id="sq-delivery-days" style={{ ...input, width: 80, borderColor: deliveryProblem ? '#dc2626' : undefined }} type="number" min="0" max="730" step="1" inputMode="numeric" autoComplete="off"
                  value={deliveryValue} placeholder="—" aria-label="Delivery within how many days of the order"
                  onChange={e => { setDeliveryTouched(true); setHead({ ...head, deliveryDays: e.target.value }); }} />
                days of order
              </div>
              {deliveryProblem && <div role="alert" style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 4 }}>{deliveryProblem}</div>}
              {suggestion && !deliveryTouched && (
                <div data-delivery-suggestion style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, maxWidth: 340 }}>
                  From the longest lead time{suggestion.from ? ` — ${suggestion.from}` : ''}: “{suggestion.note}”. Change it if you need to.
                </div>
              )}
              {suggestion && deliveryTouched && String(suggestion.days) !== String(head.deliveryDays) && (
                <button type="button" onClick={() => { setDeliveryTouched(false); setHead({ ...head, deliveryDays: '' }); }}
                  style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, cursor: 'pointer', fontSize: '0.72rem', color: 'var(--brand-amber)', fontWeight: 600 }}>
                  Use the suggestion: {suggestion.days} days
                </button>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={lbl} htmlFor="sq-delivery-note">Delivery note <span style={{ fontWeight: 400 }}>(optional)</span></label>
              <input id="sq-delivery-note" style={input} value={head.deliveryNote} maxLength={500} onChange={e => setHead({ ...head, deliveryNote: e.target.value })}
                placeholder="Ex-works, or delivered to site; part shipments…" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn-primary btn-sm" disabled={rowProblems.list.length > 0 || adjProblems.length > 0 || !!deliveryProblem}>Create Quotation</button>
            <button type="button" onClick={() => { setShowForm(false); setFromEnquiry(null); }} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <ListToolbar
        q={q}
        placeholder="Search quote no., customer, status…"
        filters={[{
          key: 'status',
          label: 'Status',
          options: STATUSES.map(st => ({ value: st, label: st })),
        }]}
      />

      <div style={{ ...card, overflow: 'hidden' }}>
        {q.rows.length === 0 ? (
          <EmptyState q={q} icon={FileText} noun="quotations"
            hint="Create one to quote a customer, then convert it to an order when you win." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                  {['Quote', 'Customer', 'Valid until', 'Amount', 'Status', ''].map((h, i) => <th key={i} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {q.rows.map(qt => (
                  <tr key={qt.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => navigate(`/sales-quotations/${qt.id}`)}>{qt.quote_number}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{qt.customer_name || '—'}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{qt.valid_until ? new Date(`${String(qt.valid_until).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{rupee(qt.net_amount)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      {qt.status === 'Converted'
                        ? <span style={{ fontSize: '0.72rem', fontWeight: 700, color: STATUS_COLOR.Converted, background: STATUS_COLOR.Converted + '1f', padding: '3px 9px', borderRadius: 999 }}>Converted</span>
                        : <select value={qt.status} onChange={e => setStatus(qt.id, e.target.value)} aria-label={`Status of ${qt.quote_number}`} style={{ ...input, width: 'auto', padding: '4px 8px', fontSize: '0.75rem', fontWeight: 700, color: STATUS_COLOR[qt.status] }}>
                            {STATUSES.filter(st => st !== 'Converted').map(st => <option key={st} value={st}>{st}</option>)}
                          </select>}
                      <OnlineAnswer qt={qt} />
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => navigate(`/sales-quotations/${qt.id}`)} title="View" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginRight: 4 }}><Eye size={15} /></button>
                      {/* Open offers only: an answered or converted quotation
                          has nothing left to ask the customer. */}
                      {['Draft', 'Sent'].includes(qt.status) && (
                        <button onClick={() => share(qt)} title="Share for approval — the customer accepts or declines online" className="btn-secondary" style={{ fontSize: '0.74rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 6 }}>
                          <Share2 size={13} /> Share for approval
                        </button>
                      )}
                      {qt.status !== 'Converted' && (
                        <button onClick={() => convert(qt)} title="Convert to order" className="btn-secondary" style={{ fontSize: '0.74rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 6, color: 'var(--brand-amber)' }}>
                          <ArrowRightLeft size={13} /> Convert
                        </button>
                      )}
                      {qt.status === 'Converted' && qt.converted_order_id && (
                        <button onClick={() => navigate('/customer-orders')} className="btn-secondary" style={{ fontSize: '0.74rem', padding: '4px 10px', marginRight: 6 }}>View order →</button>
                      )}
                      {/* Hidden when the API would refuse it anyway. */}
                      {canDelete && (
                        <button onClick={() => del(qt)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination q={q} />

      {sharing && <ShareDialog share={sharing} card={card} input={input} toast={toast} onClose={() => setSharing(null)} />}
    </div>
  );
}

/* Crores fit the tile: compact figure, exact value in the tooltip (as on Sales Invoices). */
const Kpi = ({ card, label, value, tone, exact }) => (
  <div style={{ ...card, padding: 18, minWidth: 0 }}>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    <FitNumber exact={exact} style={{ fontSize: '1.6rem', fontWeight: 800, color: tone || 'var(--text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</FitNumber>
  </div>
);

/* What the customer said through the link, under the status — "Accepted
   online by Ramesh · 8 Oct 2026" and their note — or that it is out with
   them and unanswered. The status alone could not tell a customer's yes
   from somebody here changing a dropdown. */
function OnlineAnswer({ qt }) {
  if (qt.responded_at) {
    const declined = qt.status === 'Rejected';
    return (
      <div data-online-answer style={{ marginTop: 5, fontSize: '0.74rem', lineHeight: 1.4, maxWidth: 280 }}>
        <span style={{ fontWeight: 700, color: declined ? STATUS_COLOR.Rejected : STATUS_COLOR.Accepted }}>
          {declined ? 'Declined' : 'Accepted'} online by {qt.response_name} · {onDate(qt.responded_at)}
        </span>
        {qt.response_note && (
          <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{qt.response_note}”</div>
        )}
      </div>
    );
  }
  if (qt.link_sent_at && ['Draft', 'Sent'].includes(qt.status)) {
    return (
      <div style={{ marginTop: 5, fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        Shared {onDate(qt.link_sent_at)} · no answer yet
      </div>
    );
  }
  return null;
}

/* Indian mobile numbers are stored as typed — "98866 44456", "+91-98866…",
   "098866…". wa.me wants the country code and digits only. */
function waNumber(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith('0')) return `91${d.slice(1)}`;
  return d.length >= 11 ? d : '';
}

/* The link, and the three ways it actually travels: copied into whatever
   chat is open, WhatsApp, or an email from your own mailbox. Email is a
   mailto: draft rather than the document email dialog, which is built
   around attaching the PDF and has no place for a link. */
function ShareDialog({ share, card, input, toast, onClose }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${share.path}`;
  const customer = share.customer || {};
  const company = share.company?.name || '';
  const message = [
    `Dear ${customer.name || 'Sir/Madam'},`,
    '',
    `Please find our quotation ${share.quoteNumber} for ${rupee(share.net)}${share.validUntil ? `, valid until ${onDate(share.validUntil)}` : ''}.`,
    'You can read it, and accept or decline it, here:',
    url,
    '',
    'Thank you,',
    company,
  ].join('\n').trim();
  const wa = `https://wa.me/${waNumber(customer.phone)}?text=${encodeURIComponent(message)}`;
  const mail = `mailto:${encodeURIComponent(customer.email || '')}?subject=${encodeURIComponent(`Quotation ${share.quoteNumber}${company ? ` from ${company}` : ''}`)}&body=${encodeURIComponent(message)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 1900);
    } catch { toast.error('Could not copy — select the link and copy it instead.'); }
  };
  const btn = { fontSize: '0.8rem', padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' };
  return (
    <div role="dialog" aria-label="Share for approval" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60,
    }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: 'min(520px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <h2 style={{ flex: 1, fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            Share {share.quoteNumber} for approval
          </h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 12px' }}>
          {customer.name || 'Your customer'} opens this link without logging in, reads the quotation, and accepts or declines it.
          Their answer appears here, and you are notified.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input readOnly value={url} aria-label="Quotation link" onFocus={e => e.target.select()}
            style={{ ...input, fontFamily: 'var(--font-mono)', fontSize: '0.74rem', minWidth: 0 }} />
          <button type="button" onClick={copy} className="btn-primary btn-sm" style={{ ...btn, whiteSpace: 'nowrap' }}>
            {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy link</>}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={wa} target="_blank" rel="noreferrer" className="btn-secondary" style={btn}>
            <MessageCircle size={14} style={{ color: '#25D366' }} /> WhatsApp{waNumber(customer.phone) ? ` ${customer.phone}` : ''}
          </a>
          <a href={mail} className="btn-secondary" style={btn}>
            <Mail size={14} /> Email{customer.email ? ` ${customer.email}` : ''}
          </a>
        </div>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: '12px 0 0' }}>
          {!waNumber(customer.phone) && 'No mobile number on file, so WhatsApp asks which chat. '}
          {!customer.email && 'No email on file — type the address in the draft. '}
          The link stays the same if you share it again.
          {share.wasDraft && ' The quotation is now marked Sent, so its lines and rates are fixed; set it back to Draft to change them.'}
        </p>
      </div>
    </div>
  );
}
