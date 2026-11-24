/* ══════════════════════════════════════════════════════════
   One customer order, with everything made from it.

   The order is where a job starts and the place people come back to ask
   "where is it?". Its panel showed the readiness, the lines and the
   purchase orders — not the production jobs, challans, invoices or credit
   notes made from it, so an order that had been made, sent and billed
   looked untouched, and getting from it to its invoice meant searching.
   Each line now says how much has gone and how much is billed, every
   document is one click away, and the order itself can be corrected.
   ══════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Factory, Files, Truck, Pencil, Plus, X, Receipt, FileText } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import OrderReadiness from './OrderReadiness';
import UnitSelect from './UnitSelect';
import { fmtINR } from '../lib/format';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const n = (v) => Number(v) || 0;
const qty = (v) => Number(n(v).toFixed(4)).toLocaleString('en-IN', { maximumFractionDigits: 4 });

export default function OrderPanel({ order, canWrite, onChanged, projectId }) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const [making, setMaking] = useState(null);
  const [editing, setEditing] = useState(false);
  const docs = order.documents || {};
  const items = order.items || [];

  const leftToBill = items.some(it => n(it.quantity) - n(it.billed) > 0.0005);
  const leftToSend = items.some(it => n(it.quantity) - n(it.dispatched) > 0.0005);

  /* Make: a line that already has a job is said, and made again only when
     asked — every press used to open another job for the whole quantity. */
  const makeProduction = async (item, again = false) => {
    setMaking(item.id);
    try {
      const res = await fetch(`${API}/production/from-order-item/${item.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projectId ?? null, again }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.existing && d.remaining > 0 && !again) {
        setMaking(null);
        if (await confirm({ title: 'This line already has a job', message: d.error, confirmLabel: `Start a job for the other ${d.remaining}`, cancelLabel: 'Not now' })) return makeProduction(item, true);
        return;
      }
      if (!res.ok) throw new Error(d.error || 'Could not start production');
      toast.success(d.noProduct
        ? `${d.prodNumber} started. This line is typed in, not a product, so there's no material plan`
        : d.noBom
          ? `${d.prodNumber} started. ${item.description} has no bill of materials yet, so there's no material plan`
          : `${d.prodNumber} started with ${d.bomLines} material${d.bomLines === 1 ? '' : 's'} planned`);
      navigate(`/production/${d.id}`);
    } catch (err) { toast.error(err.message); }
    finally { setMaking(null); }
  };

  const raiseQuotation = async (item) => {
    try {
      const res = await fetch(`${API}/quotations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partDescription: item.description, quantity: item.quantity, unit: item.unit, customerOrderItemId: item.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast.success(`Vendor quotation request raised for “${item.description}”`);
      navigate('/quotations');
    } catch (err) { toast.error(err.message); }
  };

  const section = { fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '4px 0 6px', letterSpacing: '.03em' };
  const chip = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', textDecoration: 'none', fontSize: '0.8rem', color: 'var(--text-primary)' };
  const muted = { color: 'var(--text-muted)' };

  const groups = [
    { key: 'jobs', label: 'Production', icon: Factory, rows: docs.jobs || [], to: (r) => `/production/${r.id}`, num: (r) => r.prod_number, extra: (r) => r.status },
    { key: 'challans', label: 'Delivery challans', icon: Truck, rows: docs.challans || [], to: (r) => `/delivery-challans/${r.id}`, num: (r) => r.challan_number, extra: (r) => r.status },
    { key: 'invoices', label: 'Invoices', icon: Receipt, rows: docs.invoices || [], to: (r) => `/sales-invoices/${r.id}`, num: (r) => r.invoice_number,
      extra: (r) => `${r.status} · ${fmtINR(r.net_amount)}${n(r.amount_paid) > 0 && n(r.amount_paid) < n(r.net_amount) ? ` · ${fmtINR(r.amount_paid)} received` : ''}` },
    { key: 'notes', label: 'Credit notes', icon: FileText, rows: docs.notes || [], to: (r) => `/credit-debit-notes/${r.id}`, num: (r) => r.note_number, extra: (r) => fmtINR(r.total) },
    { key: 'pos', label: 'Purchase orders for this order', icon: Files, rows: order.purchaseOrders || [], to: (r) => `/po/${r.id}`, num: (r) => r.po_number,
      extra: (r) => `${r.vendor_name || ''} · ${r.status}${r.approval_status === 'Pending Approval' ? ' · needs sign-off' : ''}` },
  ].filter(g => g.rows.length);

  return (
    <div data-order-panel={order.id}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '10px 0 2px' }}>
        {docs.quotation && (
          <span>From quotation <Link to={`/sales-quotations/${docs.quotation.id}`} data-order-quote style={{ color: 'var(--brand-amber)', fontWeight: 700 }}>{docs.quotation.quote_number}</Link></span>
        )}
        <span>Customer PO: <b>{order.customer_po_ref || <span style={muted}>not given</span>}</b></span>
        {canWrite && order.status !== 'Closed' && (
          <button type="button" onClick={() => setEditing(e => !e)} data-edit-order className="btn-secondary"
            style={{ fontSize: '0.74rem', padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
            <Pencil size={12} /> {editing ? 'Close editing' : 'Edit order'}
          </button>
        )}
      </div>

      {editing ? (
        <EditOrder order={order} onDone={(saved) => { setEditing(false); if (saved) onChanged?.(); }} />
      ) : (
        <>
          <div style={{ paddingTop: 10 }}><OrderReadiness orderId={order.id} /></div>
          <div style={section}>Line items</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <tbody>
                {items.map(it => {
                  const sent = n(it.dispatched), billed = n(it.billed), ordered = n(it.quantity);
                  return (
                    <tr key={it.id} style={{ borderTop: '1px solid var(--border-subtle)' }} data-order-line={it.id}>
                      <td style={{ padding: '7px 4px', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.84rem' }}>
                        {it.description}
                        {!it.sku_id && <div style={{ fontSize: '0.7rem', fontWeight: 400, ...muted }}>typed in, not a saved product</div>}
                      </td>
                      <td style={{ padding: '7px 4px', color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{qty(ordered)} {it.unit}</td>
                      <td style={{ padding: '7px 4px', color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{it.rate || it.target_price ? `@ ${fmtINR(it.rate ?? it.target_price)}` : ''}</td>
                      <td style={{ padding: '7px 4px', fontSize: '0.78rem', whiteSpace: 'nowrap' }} data-line-progress>
                        <span style={{ color: sent >= ordered - 0.0005 && ordered > 0 ? 'var(--accent-emerald, #10b981)' : 'var(--text-secondary)' }}>Sent {qty(sent)}</span>
                        <span style={muted}> · </span>
                        <span style={{ color: billed >= ordered - 0.0005 && ordered > 0 ? 'var(--accent-emerald, #10b981)' : 'var(--text-secondary)' }}>Billed {qty(billed)}</span>
                      </td>
                      <td style={{ padding: '7px 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {canWrite && (
                          <>
                            <button onClick={() => makeProduction(it)} disabled={making === it.id} title="Make this line in-house" data-make-line={it.id}
                              className="btn-secondary" style={{ fontSize: '0.74rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 6, opacity: making === it.id ? 0.6 : 1 }}>
                              <Factory size={13} /> {making === it.id ? 'Starting…' : 'Make'}
                            </button>
                            <button onClick={() => raiseQuotation(it)} title="Ask vendors to quote for buying this in" className="btn-secondary"
                              style={{ fontSize: '0.74rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <Files size={13} /> Get vendor quotes
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {groups.map(g => (
            <div key={g.key} data-order-docs={g.key} style={{ marginTop: 10 }}>
              <div style={section}>{g.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {g.rows.map(r => (
                  <Link key={r.id} to={g.to(r)} style={chip}>
                    <g.icon size={13} style={muted} />
                    <b style={{ fontFamily: 'var(--font-mono)' }}>{g.num(r)}</b>
                    <span style={{ color: 'var(--text-secondary)' }}>{g.extra(r)}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
            {canWrite && leftToSend && (
              <button onClick={() => navigate(`/delivery-challans?order=${order.id}`)} className="btn-secondary btn-sm" data-order-challan
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Truck size={14} /> Create challan
              </button>
            )}
            {leftToBill ? (
              <button onClick={() => navigate(`/customer-orders/${order.id}/invoice`)} className="btn-primary btn-sm" data-order-invoice
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Receipt size={14} /> Create invoice
              </button>
            ) : items.length > 0 && (
              <span style={{ fontSize: '0.8rem', ...muted }}>Everything on this order is billed.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* Change an order after it was placed: the customer's PO number when it
   arrives, a date, a quantity. A line can't go below what has already been
   sent or billed — the server says so if it would. */
function EditOrder({ order, onDone }) {
  const toast = useToast();
  const [head, setHead] = useState({
    customerPoRef: order.customer_po_ref || '', orderDate: String(order.order_date || '').slice(0, 10),
    expectedShipmentDate: String(order.expected_shipment_date || '').slice(0, 10), notes: order.notes || '',
  });
  const [lines, setLines] = useState((order.items || []).map(it => ({
    id: it.id, skuId: it.sku_id || '', description: it.description, hsn: it.hsn || '', quantity: it.quantity ?? '',
    unit: it.unit || 'nos', rate: it.rate ?? it.target_price ?? '', floor: Math.max(n(it.dispatched), n(it.billed)),
  })));
  const [saving, setSaving] = useState(false);
  const setLine = (i, patch) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/customer-orders/${order.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...head, items: lines.map(({ floor, ...l }) => l) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save the order');
      toast.success(`${order.order_number} updated`);
      onDone(true);
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const input = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3 };
  return (
    <div data-edit-order-form style={{ padding: '10px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div><label style={lbl}>Customer PO number</label><input style={input} value={head.customerPoRef} onChange={e => setHead(h => ({ ...h, customerPoRef: e.target.value }))} data-edit-po-ref /></div>
        <div><label style={lbl}>Order date</label><input style={input} type="date" value={head.orderDate} onChange={e => setHead(h => ({ ...h, orderDate: e.target.value }))} /></div>
        <div><label style={lbl}>Ship by</label><input style={input} type="date" value={head.expectedShipmentDate} onChange={e => setHead(h => ({ ...h, expectedShipmentDate: e.target.value }))} /></div>
        <div><label style={lbl}>Notes</label><input style={input} value={head.notes} onChange={e => setHead(h => ({ ...h, notes: e.target.value }))} /></div>
      </div>
      {lines.map((l, i) => (
        <div key={l.id || `new-${i}`} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 6, flexWrap: 'wrap' }} data-edit-line={i}>
          <div style={{ flex: '2 1 180px' }}><label style={lbl}>Description</label><input style={input} value={l.description} disabled={!!l.skuId} onChange={e => setLine(i, { description: e.target.value })} /></div>
          <div style={{ flex: '0 0 90px' }}><label style={lbl}>Unit</label><UnitSelect style={input} value={l.unit} onChange={v => setLine(i, { unit: v })} /></div>
          <div style={{ flex: '0 0 90px' }}>
            <label style={lbl}>Qty{l.floor > 0 ? ` (min ${qty(l.floor)})` : ''}</label>
            <input style={input} type="number" min={l.floor || 0} step="any" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} aria-label={`Line ${i + 1} quantity`} />
          </div>
          <div style={{ flex: '0 0 100px' }}><label style={lbl}>Rate ₹</label><input style={input} type="number" min="0" step="any" value={l.rate} onChange={e => setLine(i, { rate: e.target.value })} /></div>
          {!(l.floor > 0) && (
            <button type="button" onClick={() => setLines(ls => ls.filter((_, k) => k !== i))} aria-label={`Remove line ${i + 1}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', paddingBottom: 6 }}><X size={15} /></button>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn-secondary" style={{ fontSize: '0.76rem' }}
          onClick={() => setLines(ls => [...ls, { id: null, skuId: '', description: '', hsn: '', quantity: '', unit: 'nos', rate: '', floor: 0 }])}>
          <Plus size={13} /> Add line
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn-secondary" onClick={() => onDone(false)}>Cancel</button>
        <button type="button" className="btn-primary btn-sm" onClick={save} disabled={saving} data-save-order>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}
