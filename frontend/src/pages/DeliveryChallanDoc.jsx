/* ══════════════════════════════════════════════════════════
   Delivery Challan — the document that travels WITH the goods.

   Two things were wrong here and both matter once real material moves:

   1. It printed the customer's BILLING address under "Deliver To". For any
      customer whose site differs from their registered office — which is
      most project customers — that is the wrong address on the paper the
      driver is holding.

   2. There was nowhere to put an e-way bill number. Under Rule 138 a
      consignment over ₹50,000 cannot legally move without one, and it has
      to travel with the goods. A challan that can't carry it is a challan
      the driver gets stopped over.

   Edited on its own page (components/DocEdit): a draft, all of it; once
   dispatched, the goods have left stock under these lines, so only the
   transport details, the e-way bill and the notes.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, AlertTriangle, Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import EmailDocumentModal from '../components/EmailDocumentModal';
import Attachments from '../components/Attachments';
import InlineEdit from '../components/InlineEdit';
import UnitSelect from '../components/UnitSelect';
import {
  CompanyHeader, Party, SignatureBlock, DocFooter, NotATaxInvoice, rup, fmtDate, CopyPicker, COPIES, ItemText, StatusPill,
} from '../components/DocumentKit';
import { useDocEdit, EditBar, Field, Spot, onSheetClick, confirmDiscard } from '../components/DocEdit';
import { lineProblems } from '../lib/lineChecks';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { usePermissions } from '../context/PermissionContext';
import { stateCode, GST_STATES } from '../lib/gstStates';
import { docFileName, printAs } from '../lib/documentPdf';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const EWAY_THRESHOLD = 50000;
/* Rule 138 counts the consignment's value WITH tax. A challan carries no tax
   rate, so 18% is assumed: the warning comes slightly early for goods taxed
   lower, never late. It used to compare the value before tax. */
const EWAY_TAX = 0.18;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* What a dispatched challan still lets you change — the server's DC_TRANSPORT. */
const TRANSPORT_KEYS = ['dispatch_through', 'transporter_name', 'transporter_gstin', 'vehicle_no', 'lr_no', 'driver_name', 'driver_phone', 'eway_bill_no', 'eway_bill_date', 'notes'];
const str = (v) => (v == null ? '' : String(v));
const numStr = (v) => (v == null || v === '' ? '' : String(Number(v)));
const blankLine = () => ({ description: '', hsn: '', uom: 'nos', quantity: '', rate: '', skuId: null });

function challanValues(dc) {
  const cust = dc.customer || {};
  return {
    challan_number: str(dc.challan_number), challan_date: str(dc.challan_date).slice(0, 10),
    dispatch_through: str(dc.dispatch_through), transporter_name: str(dc.transporter_name), transporter_gstin: str(dc.transporter_gstin),
    vehicle_no: str(dc.vehicle_no), lr_no: str(dc.lr_no), driver_name: str(dc.driver_name), driver_phone: str(dc.driver_phone),
    eway_bill_no: str(dc.eway_bill_no), eway_bill_date: str(dc.eway_bill_date).slice(0, 10), notes: str(dc.notes),
    place_of_supply: str(dc.place_of_supply || dc.ship_to_state || cust.shipping_state || cust.state),
    ship_to_name: str(dc.ship_to_name || cust.name), ship_to_address: str(dc.ship_to_address || cust.shipping_address || cust.billing_address),
    ship_to_state: str(dc.ship_to_state || cust.shipping_state || cust.state),
    items: (dc.items || []).map(it => ({ description: str(it.description), hsn: str(it.hsn), uom: str(it.uom || 'nos'), quantity: numStr(it.quantity), rate: numStr(it.rate), skuId: it.sku_id ?? null })),
  };
}

export default function DeliveryChallanDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { can } = usePermissions();
  const ed = useDocEdit();
  const [dc, setDc] = useState(null);
  const [emailing, setEmailing] = useState(false);
  const [err, setErr] = useState(false);
  /* Rule 55: in triplicate — consignee, transporter, consignor. */
  const [copy, setCopy] = useState(COPIES.challan[0]);

  /* The e-way bill number, recorded on the challan itself — the warning
     above always asked for it, and there was nowhere to put it. */
  const saveEway = async (field, value) => {
    const res = await fetch(`${API}/delivery-challans/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: d.error || 'Could not save' };
    setDc(prev => ({ ...prev, eway_bill_no: d.eway_bill_no }));
    return { ok: true };
  };

  const load = () => fetch(`${API}/delivery-challans/${id}`)
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(setDc).catch(() => setErr(true));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const canWrite = can('delivery-challans', 'write');
  const begin = (field) => { if (dc && canWrite) ed.start(challanValues(dc), field); };

  if (err) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Challan not found. <button onClick={() => navigate('/delivery-challans')} className="btn-secondary" style={{ marginLeft: 8 }}>Back</button></div>;
  if (!dc) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div>;

  const co = dc.company || {};
  const cust = dc.customer || {};

  /* ── Editing on the page ── */
  const isDraft = dc.status === 'Draft' && !dc.stock_applied;
  const d = ed.editing ? ed.draft : null;
  const editAll = !!d && isDraft;
  const editable = (k) => !!d && (isDraft || TRANSPORT_KEYS.includes(k));
  const spotOn = (k) => !ed.editing && canWrite && (isDraft || TRANSPORT_KEYS.includes(k));
  const amounts = editAll ? d.items.map(it => r2((Number(it.quantity) || 0) * (Number(it.rate) || 0))) : null;
  const value = editAll ? r2(amounts.reduce((s, a) => s + a, 0)) : Number(dc.total_value || 0);
  const lp = editAll ? lineProblems(d.items) : null;
  const zeroQty = editAll ? new Set(d.items.map((it, i) => (lp.kept.includes(it) && !(Number(it.quantity) > 0) ? i : -1)).filter(i => i >= 0)) : new Set();
  const ewayBad = !!d && d.eway_bill_no.replace(/\s+/g, '') !== '' && !/^\d{12}$/.test(d.eway_bill_no.replace(/\s+/g, ''));
  const gstinBad = !!d && d.transporter_gstin.trim() !== '' && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(d.transporter_gstin.trim().toUpperCase());
  const problems = !d ? [] : [
    editAll && !d.challan_number.trim() && 'The challan number cannot be blank.',
    editAll && !d.challan_date && 'The challan date cannot be blank — it travels with the goods (Rule 55).',
    ...(lp ? lp.list : []),
    editAll && lp.kept.length === 0 && 'Add at least one item.',
    editAll && zeroQty.size > 0 && `Every line needs a quantity above zero (line ${[...zeroQty].map(i => i + 1).join(', ')}).`,
    ewayBad && 'An e-way bill number is 12 digits.',
    gstinBad && 'The transporter GSTIN is not a valid GSTIN.',
  ].filter(Boolean);
  const shout = (bad) => ed.tried && !!bad;

  const save = async () => {
    if (!d || ed.saving) return;
    if (problems.length) { ed.setTried(true); return; }
    const body = {};
    for (const k of ed.changed(isDraft ? undefined : TRANSPORT_KEYS)) if (k !== 'items') body[k] = String(d[k] ?? '').trim() || null;
    if (isDraft && ed.changed(['items']).length) {
      body.items = lp.kept.map(it => ({ description: it.description.trim(), hsn: String(it.hsn || '').trim() || null, uom: it.uom || 'nos', quantity: Number(it.quantity) || 0, rate: Number(it.rate) || 0, skuId: it.skuId ?? null }));
    }
    if (!Object.keys(body).length) { ed.stop(); toast.info('Nothing was changed'); return; }
    ed.setSaving(true);
    try {
      const res = await fetch(`${API}/delivery-challans/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) { ed.setError(r.error || 'Could not save the challan'); ed.setSaving(false); return; }
      await load();
      ed.stop();
      toast.success(`${r.challan_number || dc.challan_number} saved — the print shows the change`);
    } catch (e) { ed.setError(`Could not save: ${e.message}`); ed.setSaving(false); }
  };
  const cancelEdit = async () => { if (await confirmDiscard(ed, confirm)) ed.stop(); };
  const scope = isDraft
    ? 'A draft: the number, date, where it goes, the transport, the lines and the notes can all change.'
    : `${dc.status}: the goods have left stock under these lines, so only the transport details, the e-way bill and the notes can change. To change the lines, set it back to Draft first.`;

  /* Ship-to is snapshotted on the challan. Fall back to the customer record
     only for challans raised before that column existed. */
  const shipName = dc.ship_to_name || cust.name;
  const shipAddr = dc.ship_to_address || cust.shipping_address || cust.billing_address;
  const shipState = dc.ship_to_state || cust.shipping_state || cust.state;

  const needsEway = value * (1 + EWAY_TAX) > EWAY_THRESHOLD;
  const posName = dc.place_of_supply || shipState;
  const posCode = stateCode(posName);
  const ewayMissing = needsEway && !dc.eway_bill_no;

  const th = { padding: '9px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)' };
  const td = { padding: '9px 10px', fontSize: '0.85rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'top' };
  const fig = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  /* A transport particular: a field while editing, else what was recorded. */
  const fact = (k, label, shown, opts = {}) => (
    editable(k)
      ? <div><div className="doc-fact-l">{label}</div><Field name={k} label={label} value={d[k]} onChange={v => ed.set(k, opts.upper ? v.toUpperCase() : v)} invalid={shout(opts.bad)} type={opts.type || 'text'} maxLength={opts.max || 120} placeholder={opts.placeholder} /></div>
      : (shown || opts.always) ? <Meta label={label} value={<Spot field={k} on={spotOn(k)}>{shown || '—'}</Spot>} warn={opts.warn} /> : null
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* The toolbar carries what is for the person on screen — where the
          challan has got to, and which of its three copies to print — so
          none of it sits on the paper. */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/delivery-challans')} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={15} /> All Challans</button>
          <StatusPill status={dc.status} />
        </div>
        {!ed.editing && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {canWrite && (
            <button onClick={() => begin()} data-doc-edit className="btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title={isDraft ? 'Change anything on this draft challan, right here' : 'Change the transport details, e-way bill or notes'}>
              <Pencil size={15} /> Edit challan
            </button>
          )}
          <CopyPicker kind="challan" value={copy} onChange={setCopy} />
          {/* The challan travels with the goods; the customer usually wants
              it ahead of the lorry. */}
          <button onClick={() => setEmailing(true)} className="btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mail size={15} /> Email</button>
          <button onClick={() => printAs(docFileName('Delivery Challan', dc.challan_number, shipName))} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Printer size={15} /> Print</button>
        </div>
        )}
      </div>

      {ed.editing && <EditBar ed={ed} what={dc.challan_number} scope={scope} problems={problems} onSave={save} onCancel={cancelEdit} />}

      {/* On screen only: where this challan came from and what billed it. */}
      {(dc.order || (dc.invoices || []).length > 0) && (
        <div className="doc-context no-print" data-challan-links>
          {dc.order && <span>Order <Link to={`/customer-orders?open=${dc.order.id}`}>{dc.order.order_number}</Link></span>}
          {(dc.invoices || []).length > 0 && (
            <span>Invoiced on {dc.invoices.map((i, k) => (
              <React.Fragment key={i.id}>{k > 0 && ', '}<Link to={`/sales-invoices/${i.id}`}>{i.invoice_number}</Link>{i.status === 'Cancelled' ? ' (cancelled)' : ''}</React.Fragment>
            ))}</span>
          )}
        </div>
      )}

      {/* Screen-only. The driver finds out at the checkpost otherwise. */}
      {ewayMissing && !ed.editing && (
        <div className="no-print" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700, fontSize: '0.88rem' }}>
            <AlertTriangle size={16} /> E-way bill required — and not recorded
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
            This consignment is {rup(value)} before tax (about {rup(value * (1 + EWAY_TAX))} with GST), above the {rup(EWAY_THRESHOLD)} threshold in Rule 138.
            Generate the e-way bill on the government portal and record the number here before the vehicle leaves.
          </div>
        </div>
      )}

      <div className="doc-scroll">
      <div className="doc-sheet" data-editing={ed.editing ? 'true' : undefined} onClick={onSheetClick(ed, begin)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 32 }}>
        <CompanyHeader
          company={co}
          title="DELIVERY CHALLAN"
          subtitle={copy}
          meta={[
            ['No.', editable('challan_number')
              ? <Field key="n" name="challan_number" label="Challan number" value={d.challan_number} onChange={v => ed.set('challan_number', v)} invalid={shout(!d.challan_number.trim())} maxLength={40} style={{ width: 140, fontWeight: 700 }} />
              : <Spot key="n" field="challan_number" on={spotOn('challan_number')}>{dc.challan_number}</Spot>],
            ['Date', editable('challan_date')
              ? <Field key="d" type="date" name="challan_date" label="Challan date" value={d.challan_date} onChange={v => ed.set('challan_date', v)} invalid={shout(!d.challan_date)} style={{ fontWeight: 700 }} />
              : <Spot key="d" field="challan_date" on={spotOn('challan_date')}>{fmtDate(dc.challan_date)}</Spot>],
            dc.order && ['Order', dc.order.order_number],
            dc.order?.customer_po_ref && ['Your PO', dc.order.customer_po_ref],
          ].filter(Boolean)}
        />

        <div className="doc-parties" style={{ marginTop: 16 }}>
          {/* Ship-to first: on this document it is the operative address. */}
          {editable('ship_to_name') ? (
            <div className="inv-party">
              <div className="inv-party-title">Ship To <span style={{ fontWeight: 400, textTransform: 'none' }}>— where the goods go</span></div>
              <div className="de-stack">
                <Field name="ship_to_name" label="Ship To name" placeholder="Name" value={d.ship_to_name} onChange={v => ed.set('ship_to_name', v)} style={{ fontWeight: 700 }} />
                <Field as="textarea" name="ship_to_address" label="Ship To address" placeholder="Where the goods go" minRows={2} value={d.ship_to_address} onChange={v => ed.set('ship_to_address', v)} />
                <Field name="ship_to_state" label="Ship To state" placeholder="State" value={d.ship_to_state} onChange={v => ed.set('ship_to_state', v)} />
              </div>
            </div>
          ) : (
            <div className="inv-party">
              <div className="inv-party-title">Ship To <span style={{ fontWeight: 400, textTransform: 'none' }}>— where the goods go</span></div>
              <Spot field="ship_to_name" on={spotOn('ship_to_name')} block>
                <div className="inv-party-name">{shipName || '—'}</div>
                <div className="inv-party-detail doc-wrap">
                  {shipAddr || <em className="print:hidden" style={{ color: '#dc2626' }}>Address missing</em>}{shipAddr && <br />}
                  {shipState && <>{shipState}<br /></>}
                  {/* Rule 55: the consignee's GSTIN. The ship-to is the buyer's
                      own site unless a different one was recorded. */}
                  GSTIN: <strong>{dc.ship_to_gstin ?? cust.gstin ?? 'Unregistered'}</strong>
                </div>
              </Spot>
            </div>
          )}
          <Party
            title="Bill To"
            name={cust.name}
            address={cust.billing_address}
            state={cust.state}
            gstin={cust.gstin}
          />
        </div>

        {/* The transport particulars, in one ruled strip. */}
        <div className="doc-facts" data-challan-facts>
          {fact('dispatch_through', 'Dispatch through', dc.dispatch_through || dc.transporter_name, { always: true, placeholder: 'Own vehicle / transporter' })}
          {editable('transporter_name') && fact('transporter_name', 'Transporter', dc.transporter_name)}
          {fact('vehicle_no', 'Vehicle No.', dc.vehicle_no, { always: true, upper: true, max: 20 })}
          {fact('lr_no', 'LR / Docket', dc.lr_no, { always: true })}
          {editable('place_of_supply') ? (
            <div><div className="doc-fact-l">Place of supply</div>
              <Field as="select" name="place_of_supply" label="Place of supply" value={stateCode(d.place_of_supply) || ''} onChange={v => ed.set('place_of_supply', GST_STATES.find(([c]) => c === v)?.[1] || '')}>
                <option value="">— not set —</option>
                {GST_STATES.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}
              </Field></div>
          ) : (
            <Meta label="Place of supply" value={<Spot field="place_of_supply" on={spotOn('place_of_supply')}>{posName ? `${posName}${posCode ? ` (${posCode})` : ''}` : '—'}</Spot>} />
          )}
          {editable('eway_bill_no')
            ? fact('eway_bill_no', 'E-way Bill No.', dc.eway_bill_no, { bad: ewayBad, max: 14, placeholder: '12 digits' })
            : <Meta label="E-way Bill No." warn={ewayMissing}
                value={<>
                  <span className="print:hidden"><InlineEdit value={dc.eway_bill_no} field="eway_bill_no" canEdit={canWrite} onSave={saveEway}
                    placeholder={ewayMissing ? 'required — add' : 'add'} /></span>
                  <span className="print-only">{dc.eway_bill_no || '—'}</span>
                </>} />}
          {editable('eway_bill_date') ? fact('eway_bill_date', 'E-way Bill Date', null, { type: 'date' }) : dc.eway_bill_date && <Meta label="E-way Bill Date" value={<Spot field="eway_bill_date" on={spotOn('eway_bill_date')}>{fmtDate(dc.eway_bill_date)}</Spot>} />}
          {editable('driver_name') ? <>{fact('driver_name', 'Driver', null)}{fact('driver_phone', 'Driver phone', null, { max: 20 })}</>
            : dc.driver_name && <Meta label="Driver" value={<Spot field="driver_name" on={spotOn('driver_name')}>{`${dc.driver_name}${dc.driver_phone ? ' · ' + dc.driver_phone : ''}`}</Spot>} />}
          {editable('transporter_gstin') ? fact('transporter_gstin', 'Transporter GSTIN', null, { upper: true, max: 15, bad: gstinBad })
            : dc.transporter_gstin && <Meta label="Transporter GSTIN" value={<Spot field="transporter_gstin" on={spotOn('transporter_gstin')}>{dc.transporter_gstin}</Spot>} />}
        </div>

        <div>
          <table className="doc-items" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>Description</th>
              <th style={{ ...th, textAlign: 'left' }}>HSN/SAC</th>
              <th style={{ ...th, textAlign: 'center' }}>UOM</th>
              <th style={{ ...th, textAlign: 'right', whiteSpace: 'nowrap' }}>Qty</th>
              {editAll && <th style={{ ...th, textAlign: 'right', whiteSpace: 'nowrap' }}>Rate</th>}
              <th style={{ ...th, textAlign: 'right', whiteSpace: 'nowrap' }}>Value</th>
            </tr></thead>
            {editAll ? (
              <tbody>
                {d.items.map((it, i) => (
                  <tr key={i} className={shout(lp.rows.has(i) || zeroQty.has(i)) ? 'de-row-bad' : undefined}>
                    <td style={td}>{i + 1}</td>
                    <td style={td}><Field as="textarea" name={`line-${i}-description`} label={`Line ${i + 1} description`} placeholder="What is being sent" value={it.description} onChange={v => ed.setItem(i, { description: v })} invalid={shout(lp.rows.has(i))} /></td>
                    <td style={td}><Field name={`line-${i}-hsn`} label={`Line ${i + 1} HSN`} inputMode="numeric" maxLength={8} value={it.hsn} onChange={v => ed.setItem(i, { hsn: v.replace(/[^\d]/g, '') })} style={{ width: 72 }} /></td>
                    <td style={td}><UnitSelect className="de-in" value={it.uom} onChange={v => ed.setItem(i, { uom: v })} ariaLabel={`Line ${i + 1} unit`} style={{ width: 80 }} /></td>
                    <td style={{ ...td, ...fig }}><Field type="number" min="0" step="any" inputMode="decimal" name={`line-${i}-quantity`} label={`Line ${i + 1} quantity`} align="right" value={it.quantity} onChange={v => ed.setItem(i, { quantity: v })} invalid={shout(zeroQty.has(i))} style={{ width: 70 }} /></td>
                    <td style={{ ...td, ...fig }}><Field type="number" min="0" step="any" inputMode="decimal" name={`line-${i}-rate`} label={`Line ${i + 1} rate`} align="right" value={it.rate} onChange={v => ed.setItem(i, { rate: v })} style={{ width: 92 }} /></td>
                    <td style={{ ...td, ...fig, fontWeight: 600 }}>
                      ₹{rup(amounts[i])}
                      <button type="button" className="de-remove" onClick={() => ed.removeItem(i)} aria-label={`Remove line ${i + 1}`} title="Remove this line"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody>
                {(dc.items || []).map((it, i) => (
                  <tr key={it.id} {...(spotOn('items') ? { 'data-de-field': `line-${i}-description`, className: 'de-spot', title: 'Click to edit' } : {})}>
                    <td style={td}>{i + 1}</td>
                    <td className="doc-wrap" style={td}><ItemText text={it.description} /></td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{it.hsn || '—'}</td>
                    <td style={{ ...td, textAlign: 'center', color: 'var(--text-secondary)' }}>{it.uom || '—'}</td>
                    <td style={{ ...td, ...fig }}>{Number(it.quantity)}</td>
                    <td style={{ ...td, ...fig, fontWeight: 600 }}>₹{rup(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
          {editAll && <button type="button" className="de-add-line" onClick={() => ed.addItem(blankLine())} data-de-add-line><Plus size={14} /> Add line</button>}
        </div>

        {/* Total to footer: kept whole, and never on a sheet by itself
            (print.css, .doc-closing). */}
        <div className="doc-closing">
        {/* The total in a ruled box, like the totals on the other documents. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <div style={{ minWidth: 300 }}>
            <div data-challan-total style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, border: '1px solid #000', padding: '8px 12px', fontWeight: 800, fontSize: '0.95rem' }}>
              <span style={{ fontSize: '0.74rem', letterSpacing: '.04em', textTransform: 'uppercase' }}>Total value of goods</span>
              <span style={fig} data-de-total={editAll ? true : undefined}>₹{rup(value)}</span>
            </div>
            {needsEway && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: 4 }}>Above ₹50,000 with GST — an e-way bill applies.</div>}
          </div>
        </div>

        {/* Notes: stored on the challan, printed when there are any. */}
        {editable('notes') ? (
          <div style={{ marginTop: 12, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <b>Notes:</b>
            <Field as="textarea" name="notes" label="Notes" minRows={2} placeholder="Printed on the challan" value={d.notes} onChange={v => ed.set('notes', v)} />
          </div>
        ) : dc.notes ? (
          <Spot field="notes" on={spotOn('notes')} block>
            <div className="doc-wrap" data-challan-notes style={{ marginTop: 12, fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}><b>Notes:</b> {dc.notes}</div>
          </Spot>
        ) : spotOn('notes') && (
          <Spot field="notes" on block><span className="print:hidden" style={{ display: 'inline-block', marginTop: 12, fontSize: '0.78rem', color: 'var(--text-muted)' }}>+ Add notes</span></Spot>
        )}

        <NotATaxInvoice>
          <strong>This is not a tax invoice.</strong> It accompanies the goods for transport and delivery
          under Rule 55. The tax invoice for this consignment is raised separately and is the document
          that carries input tax credit.
        </NotATaxInvoice>

        <SignatureBlock company={co} receiver="Received the goods in good condition (name, sign & date)" />
        <DocFooter company={co} right={dc.challan_number} note="Goods once dispatched are transported at the consignee's risk unless otherwise agreed." />
        </div>
      </div>
      </div>
      {/* Files that belong with this document — the signed delivery receipt, the e-way bill. Never printed. */}
      <div className="print:hidden no-print" style={{ marginTop: 16 }}>
        <Attachments entityType="delivery_challan" entityId={id} label="Documents" compact />
      </div>

      {emailing && (
        <EmailDocumentModal
          kind="challan"
          number={dc.challan_number}
          to={cust.email}
          partyName={cust.contact_name || cust.name}
          company={dc.company || {}}
          amount={dc.total_value}
          extra={[['Dispatched by', dc.dispatch_through], ['Vehicle', dc.vehicle_no], ['LR number', dc.lr_no]]}
          closing="Please confirm receipt when the goods arrive."
          onClose={() => setEmailing(false)}
        />
      )}
    </div>
  );
}

/* `warn` is a note to the person preparing the challan, not to the
   customer: on screen the box goes red and says "required"; on paper it is
   an ordinary empty field, because a red "required" printed on a document
   that has already left the yard helps nobody. */
const Meta = ({ label, value, warn }) => (
  <div className={warn ? 'doc-warn' : undefined}>
    <div className="doc-fact-l">{label}</div>
    <div className="doc-fact-v">
      {value || (warn ? <><span className="print:hidden">required</span><span className="print-only">—</span></> : '—')}
    </div>
  </div>
);
