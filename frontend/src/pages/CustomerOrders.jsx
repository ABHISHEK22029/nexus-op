/* ══════════════════════════════════════════════════════════
   Customer Orders — searchable, filterable, paginated.

   The tiles read `q.summary`, aggregated server-side over the whole
   filtered set. `empty_orders` earns its own tile: an order taken with no
   lines on it cannot be quoted, made or invoiced, and nothing else on this
   screen would ever tell you it exists.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ShoppingBag, Plus, Trash2, X, ChevronDown, ChevronRight, Files, Factory, Lock } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useProject } from '../context/ProjectContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState, QuickViews, BulkBar, SelectAllCell, SelectCell } from '../components/ListToolbar';
import { useBulkAction } from '../components/useBulkAction';
import OrderReadiness from '../components/OrderReadiness';
import { today } from '../lib/dates';
import UnitSelect from '../components/UnitSelect';
import FitNumber from '../components/FitNumber';
import StatusSelect from '../components/StatusSelect';
import { PartySelect } from '../components/QuickAddParty';
import OrderPanel from '../components/OrderPanel';
import { useConfirm } from '../context/ConfirmContext';
import SaveAsProduct from '../components/SaveAsProduct';
import UrgencyBadge, { orderUrgency } from '../components/UrgencyBadge';
import { fmtCompactINR, fmtINR } from '../lib/format';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
/* 'Partially Delivered' is set automatically by a dispatch that ships some
   of the order, so it must be a value this dropdown can display — otherwise
   the select falls back to blank and looks like the status was lost. */
const STATUSES = ['Open', 'In Procurement', 'In Production', 'Partially Delivered', 'Delivered', 'Closed'];
const STATUS_COLOR = { Open: '#2563eb', 'In Procurement': '#d97706', 'In Production': '#0891b2', 'Partially Delivered': '#8b5cf6', Delivered: '#10b981', Closed: '#64748b' };

export default function CustomerOrders() {
  const toast = useToast();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { activeProject } = useProject();
  const { can } = usePermissions();
  const [saving, setSaving] = useState(false);
  /* ?open=ID — an order opened from elsewhere (a quotation, an invoice, a
     job). It may not be on the first page of the list, so it is shown on
     its own above it. */
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get('open')) || null;
  const [focus, setFocus] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [skus, setSkus] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState({});
  const [head, setHead] = useState({ customerId: '', customerPoRef: '', orderDate: today() });
  const [lines, setLines] = useState([{ skuId: '', description: '', quantity: '', unit: 'nos', targetPrice: '' }]);

  // The orders list is the hook's job now — searched and paged server-side.
  const q = useListQuery('customer-orders', { pageSize: 25 });
  const orders = q.rows;
  const bulk = useBulkAction(q, 'customer-orders');

  /* Only the form's pick-lists load whole here; they are pickers, not lists,
     and a form control that paginates is a form control nobody can use. */
  const loadPickLists = async () => {
    const [c, s] = await Promise.all([
      fetch(`${API}/customers`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/skus`).then(r => r.ok ? r.json() : []),
    ]);
    setCustomers(Array.isArray(c) ? c : (c.items || []));
    setSkus(Array.isArray(s) ? s : (s.items || []));
  };
  const loadFocus = async (id) => {
    if (!id) { setFocus(null); return; }
    const r = await fetch(`${API}/customer-orders/${id}`);
    const d = await r.json().catch(() => ({}));
    setFocus(r.ok ? d : { error: d.error || 'Order not found' });
  };
  /* The open order's panel, read again after something changed in it. */
  const refreshDetail = async (id) => {
    const d = await fetch(`${API}/customer-orders/${id}`).then(r => r.json()).catch(() => null);
    if (d) setDetail(prev => ({ ...prev, [id]: d }));
    if (openId === id) loadFocus(id);
  };
  const load = () => { loadPickLists(); q.reload(); Object.keys(detail).forEach(id => refreshDetail(Number(id))); };
  useEffect(() => { loadPickLists(); }, []);
  useEffect(() => { loadFocus(openId); /* eslint-disable-next-line */ }, [openId]);

  const setLine = (i, patch) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  /* Quantity times rate. Both arrive from number inputs as strings, and an
     empty box is '' — Number('') is 0, so a half-filled line contributes
     nothing rather than NaN, which would spread through the order total and
     show "₹NaN" next to every other line. */
  const lineTotal = (l) => (Number(l.quantity) || 0) * (Number(l.targetPrice) || 0);
  const orderTotal = () => lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const pickSku = (i, skuId) => {
    const sku = skus.find(s => String(s.id) === String(skuId));
    setLine(i, sku ? { skuId, description: sku.name, unit: sku.unit || 'nos', targetPrice: sku.price || '', hsn: sku.hsn || '' } : { skuId: '' });
  };

  const create = async (e) => {
    e.preventDefault();
    if (!head.customerId) { toast.error('Pick a customer'); return; }
    /* The price goes as `rate`, the name the order's arithmetic reads. Sent
       only as targetPrice, every order typed here was saved at ₹0. */
    const items = lines.filter(l => l.description.trim()).map(l => ({ ...l, rate: l.targetPrice }));
    if (!items.length) { toast.error('Add at least one line item'); return; }
    if (saving) return;            // a double click made two orders
    setSaving(true);
    try {
      const res = await fetch(`${API}/customer-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...head, items }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`Customer order ${d.orderNumber} created`);
      setShowForm(false); setHead({ customerId: '', customerPoRef: '', orderDate: today() });
      setLines([{ skuId: '', description: '', quantity: '', unit: 'nos', targetPrice: '' }]);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const toggle = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!detail[id]) {
      const d = await fetch(`${API}/customer-orders/${id}`).then(r => r.json());
      setDetail(prev => ({ ...prev, [id]: d }));
    }
  };
  /* Refusals are shown: both used to ignore the answer, so a delete the
     server refused looked like a click that did nothing. */
  /* A status is changed at once, with Undo on the toast for seven seconds,
     rather than an "are you sure" first: it can always be put back. */
  const setStatus = async (id, status, undoing = false) => {
    const before = orders.find(o => o.id === id);
    const r = await fetch(`${API}/customer-orders/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(d.error || 'Could not change the status'); }
    else if (undoing) toast.success(`${before?.order_number || 'The order'} is back to ${status}`);
    else if (before && before.status !== status) {
      toast.undo(`${before.order_number} marked ${status}`, () => setStatus(id, before.status, true));
    }
    load();
  };
  const del = async (o) => {
    if (!(await confirm({ title: `Delete ${o.order_number}?`, message: "The order and its lines are removed for good. Orders with challans, invoices or jobs can't be deleted — close those instead.", confirmLabel: 'Delete order', tone: 'danger' }))) return;
    const r = await fetch(`${API}/customer-orders/${o.id}`, { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || 'Could not delete the order'); return; }
    toast.success(`${o.order_number} deleted`);
    if (openId === o.id) setParams({});
    load();
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const input = { width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.83rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  const s = q.summary || {};
  const canWrite = can('customer-orders', 'write');
  const canDelete = can('customer-orders', 'delete');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            <ShoppingBag size={24} style={{ color: 'var(--brand-amber)' }} /> Customer Orders
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Log the PO your customer places with you, and drive procurement from it.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> New Order</button>
      </div>

      {/* All five figures come from the server's aggregate over the whole
          filtered set — summing q.rows would only ever total page 1. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginBottom: 18 }}>
        <Kpi card={card} label={q.isFiltered ? 'Orders (filtered)' : 'Orders'} value={s.count ?? q.total} />
        <Kpi card={card} label="Order value" value={fmtCompactINR(s.value)} exact={fmtINR(s.value)} />
        <Kpi card={card} label="Open" value={s.open ?? 0} tone="#2563eb" />
        <Kpi card={card} label="In procurement" value={s.in_procurement ?? 0} tone="var(--brand-amber)" />
        {/* No lines on it — it cannot be quoted, made or invoiced. */}
        <Kpi card={card} label="No line items" value={s.empty_orders ?? 0} tone={Number(s.empty_orders) > 0 ? '#ef4444' : 'var(--text-muted)'} />
      </div>

      {showForm && (
        <form onSubmit={create} style={{ ...card, padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>Customer *</label>
              <PartySelect style={input} parties={customers} setParties={setCustomers} value={head.customerId}
                onChange={id => setHead(h => ({ ...h, customerId: id }))} />
            </div>
            <div><label style={lbl}>Customer PO Ref</label><input style={input} placeholder="TST/PO/889" value={head.customerPoRef} onChange={e => setHead({ ...head, customerPoRef: e.target.value })} /></div>
            <div><label style={lbl}>Order Date</label><input style={input} type="date" value={head.orderDate} onChange={e => setHead({ ...head, orderDate: e.target.value })} /></div>
          </div>

          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Line items (parts / SKUs)</div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
              <div style={{ flex: 1.2, minWidth: 150 }}><label style={lbl}>Product</label>
                {skus.length ? (
                  <select style={input} value={l.skuId} onChange={e => pickSku(i, e.target.value)} aria-label={`Line ${i + 1} product`}>
                    <option value="">Not a saved product: type it →</option>
                    {skus.map(sk => <option key={sk.id} value={sk.id}>{sk.name}{sk.sku_code ? ` · ${sk.sku_code}` : ''}</option>)}
                  </select>
                ) : (
                  /* It was a list holding only "— free text —", which read as
                     something to pick from and offered nothing. With no saved
                     products, say so and say where they are added. */
                  <div style={{ ...input, background: 'transparent', fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.3, padding: '6px 8px' }}>
                    No saved products. Type the item, or <Link to="/skus" style={{ color: 'var(--brand-amber)', fontWeight: 600 }}>add products</Link>.
                  </div>
                )}
              </div>
              <div style={{ flex: 2, minWidth: 160 }}><label style={lbl}>Description *</label><input style={input} value={l.description} onChange={e => setLine(i, { description: e.target.value })} placeholder="Part / product" aria-label={`Line ${i + 1} description`} autoComplete="off" />
                {!l.skuId && <SaveAsProduct description={l.description} unit={l.unit} price={l.targetPrice} hsn={l.hsn}
                  onSaved={p => { setSkus(list => [...list, p]); setLine(i, { skuId: String(p.id) }); }} />}
              </div>
              {/* Unit, quantity, rate, total — in that order, matching the
                  purchase order screen, which already read this way. A person
                  entering "10539.4 Kgs at ₹62" reaches for the unit while
                  they are still thinking about what they are counting, and
                  the two numbers that multiply together sit side by side. */}
              {/* A choice from the standard list (lib/units), as on the
                  quotation and invoice. It was a text box pre-filled with
                  "nos" that looked like a hint, got a spell-check squiggle,
                  and took any text at all. */}
              <div style={{ flex: 0.8, minWidth: 110 }}><label style={lbl}>Unit</label><UnitSelect style={input} value={l.unit} onChange={v => setLine(i, { unit: v })} ariaLabel={`Line ${i + 1} unit`} /></div>
              <div style={{ flex: 0.8, minWidth: 80 }}><label style={lbl}>Qty</label><input style={input} type="number" min="0" step="any" inputMode="decimal" autoComplete="off" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} aria-label={`Line ${i + 1} quantity`} /></div>
              {/* Was "Target ₹", which reads as an aspiration rather than a
                  price. It is the rate for one unit and every other screen
                  calls it that. */}
              <div style={{ flex: 0.9, minWidth: 90 }}><label style={lbl}>Unit rate ₹</label><input style={input} type="number" min="0" step="any" inputMode="decimal" autoComplete="off" value={l.targetPrice} onChange={e => setLine(i, { targetPrice: e.target.value })} aria-label={`Line ${i + 1} unit rate`} /></div>
              {/* The line's own value. There was no total anywhere on this
                  form: you could enter ten thousand kilos at a rate and the
                  screen would never tell you what the order came to, so the
                  only way to check a decimal was in your head. Read-only —
                  it is quantity times rate, not a third thing to key in. */}
              <div style={{ flex: 0.9, minWidth: 100 }}>
                <label style={lbl}>Total ₹</label>
                <div style={{
                  ...input, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden',
                }} title={lineTotal(l) ? fmtINR(lineTotal(l)) : undefined}>
                  {lineTotal(l) ? lineTotal(l).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                </div>
              </div>
              <button type="button" onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', paddingBottom: 9 }}><X size={16} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setLines([...lines, { skuId: '', description: '', quantity: '', unit: 'nos', targetPrice: '' }])} className="btn-secondary" style={{ fontSize: '0.78rem' }}><Plus size={14} /> Add line</button>
            {/* What the order comes to, before it is saved. The ORDER VALUE
                card above only counts saved orders, so until now there was
                no way to check the figure against the customer's PO while
                you still had it on screen. */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Order total
              </span>
              <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                ₹{orderTotal().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Create Order'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {openId && focus && (
        <div data-focus-order={openId} style={{ ...card, padding: '12px 16px', marginBottom: 16, borderColor: 'var(--brand-amber)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <b style={{ fontFamily: 'var(--font-mono)' }}>{focus.order_number || `Order #${openId}`}</b>
            <span style={{ color: 'var(--text-secondary)' }}>{focus.customer?.name}</span>
            {focus.status && <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99, color: STATUS_COLOR[focus.status], background: `${STATUS_COLOR[focus.status] || '#64748b'}1f` }}>{focus.status}</span>}
            <button onClick={() => setParams({})} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
          </div>
          {focus.error ? <p style={{ color: 'var(--text-muted)' }}>{focus.error}</p>
            : <OrderPanel order={focus} canWrite={canWrite} projectId={activeProject?.id} onChanged={() => { loadFocus(openId); q.reload(); }} />}
        </div>
      )}

      <QuickViews q={q} views={[
          { key: 'due_week', label: 'Due this week', hint: 'Ships within 7 days, not delivered yet', tone: 'soon' },
          { key: 'late', label: 'Ship date passed', hint: 'Past the date it was to ship by, not delivered yet', tone: 'late' },
          { key: 'to_bill', label: 'To bill', hint: 'Sent on a challan but not fully invoiced yet', tone: 'soon' },
        ]} />
      <ListToolbar
        q={q}
        placeholder="Search order no., customer, PO ref…"
        filters={[{
          key: 'status',
          label: 'Status',
          options: STATUSES.map(st => ({ value: st, label: st })),
        }]}
      />

      <div style={{ ...card, overflow: 'hidden' }}>
        {orders.length === 0 ? (
          /* "None yet" and "none matched" are different situations — showing
             the first when the second is true is how people conclude their
             records have vanished. */
          <EmptyState q={q} icon={ShoppingBag} noun="customer orders"
            hint="Log the PO your customer placed with you, then drive procurement from it." />
        ) : (
          /* On a phone the table scrolls inside its card; the page does not. */
          <div style={{ overflowX: 'auto' }}>
          {canWrite && q.selection.count > 0 && <div style={{ padding: '10px 10px 0' }}><BulkBar q={q} noun="orders" actions={[{
            label: 'Close', icon: <Lock size={13} />,
            onClick: (ids) => bulk(ids, {
              action: 'close', verb: 'closed', noun: ['order', 'orders'],
              title: (n) => `Close ${n} order${n === 1 ? '' : 's'}?`,
              message: 'A closed order is finished: it leaves the work-to-do views. Its status can be changed back.',
              confirmLabel: (n) => `Close ${n}`,
            }),
          }]} /></div>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                {canWrite && <SelectAllCell q={q} />}
                {['', 'Order', 'Customer', 'PO Ref', 'Items', 'Status', ''].map((h, i) => <th key={i} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <React.Fragment key={o.id}>
                  <tr style={{ borderTop: '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => toggle(o.id)}>
                    {canWrite && <SelectCell q={q} id={o.id} />}
                    <td style={{ padding: '11px 14px', color: 'var(--text-muted)' }}>{expanded === o.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {o.order_number}
                      {/* How late it is, beside the number and apart from its status. */}
                      {orderUrgency(o) && <div style={{ marginTop: 3 }}><UrgencyBadge u={orderUrgency(o)} /></div>}
                      {/* The delivery the quotation promised, as the date this
                          order must ship by (set when a quotation converts). */}
                      {o.expected_shipment_date && (
                        <div data-ship-by style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap' }}>
                          Ship by {new Date(`${String(o.expected_shipment_date).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.customer_name || '—'}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{o.customer_po_ref || '—'}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-secondary)' }}>{o.item_count}</td>
                    <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                      {/* Editable only where the API would accept the change;
                          read-only otherwise rather than hidden, because the
                          status is information as well as a control. */}
                      {canWrite ? (
                        <StatusSelect value={o.status} onChange={v => setStatus(o.id, v)} label={`Status of ${o.order_number}`}
                          color={STATUS_COLOR[o.status]} options={STATUSES} />
                      ) : (
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99, whiteSpace: 'nowrap', color: STATUS_COLOR[o.status] || 'var(--text-secondary)', background: `${STATUS_COLOR[o.status] || '#64748b'}1f` }}>{o.status}</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      {/* Hidden when the API would refuse it anyway. */}
                      {canDelete && (
                        <button onClick={() => del(o)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Trash2 size={15} /></button>
                      )}
                    </td>
                  </tr>
                  {expanded === o.id && detail[o.id] && (
                    <tr><td colSpan={canWrite ? 8 : 7} style={{ padding: '0 14px 14px', background: 'var(--bg-elevated)' }}>
                      <OrderPanel order={detail[o.id]} canWrite={canWrite} projectId={activeProject?.id} onChanged={() => { refreshDetail(o.id); q.reload(); }} />
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Pagination q={q} />
    </div>
  );
}

/* Compact in the tile (₹16.03 L), exact in the tooltip; FitNumber keeps
   whatever is left inside the tile on a narrow screen. */
const Kpi = ({ card, label, value, tone, exact }) => (
  <div style={{ ...card, padding: 18, minWidth: 0 }}>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    <FitNumber exact={exact} style={{ fontSize: '1.6rem', fontWeight: 800, color: tone || 'var(--text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</FitNumber>
  </div>
);
