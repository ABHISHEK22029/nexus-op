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
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Truck, AlertTriangle, Mail } from 'lucide-react';
import EmailDocumentModal from '../components/EmailDocumentModal';
import Attachments from '../components/Attachments';
import InlineEdit from '../components/InlineEdit';
import {
  CompanyHeader, Party, SignatureBlock, DocFooter, NotATaxInvoice, rup, fmtDate, CopyPicker, COPIES, ItemText, StatusPill,
} from '../components/DocumentKit';
import { stateCode } from '../lib/gstStates';
import { docFileName, printAs } from '../lib/documentPdf';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const EWAY_THRESHOLD = 50000;
/* Rule 138 counts the consignment's value WITH tax. A challan carries no tax
   rate, so 18% is assumed: the warning comes slightly early for goods taxed
   lower, never late. It used to compare the value before tax. */
const EWAY_TAX = 0.18;

export default function DeliveryChallanDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
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

  useEffect(() => {
    fetch(`${API}/delivery-challans/${id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setDc).catch(() => setErr(true));
  }, [id]);

  if (err) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Challan not found. <button onClick={() => navigate('/delivery-challans')} className="btn-secondary" style={{ marginLeft: 8 }}>Back</button></div>;
  if (!dc) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div>;

  const co = dc.company || {};
  const cust = dc.customer || {};
  const value = Number(dc.total_value || 0);

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <CopyPicker kind="challan" value={copy} onChange={setCopy} />
          {/* The challan travels with the goods; the customer usually wants
              it ahead of the lorry. */}
          <button onClick={() => setEmailing(true)} className="btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mail size={15} /> Email</button>
          <button onClick={() => printAs(docFileName('Delivery Challan', dc.challan_number, shipName))} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Printer size={15} /> Print</button>
        </div>
      </div>

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
      {ewayMissing && (
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
      <div className="doc-sheet" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 32 }}>
        <CompanyHeader
          company={co}
          title="DELIVERY CHALLAN"
          subtitle={copy}
          meta={[
            ['No.', dc.challan_number],
            ['Date', fmtDate(dc.challan_date)],
            dc.order && ['Order', dc.order.order_number],
            dc.order?.customer_po_ref && ['Your PO', dc.order.customer_po_ref],
          ].filter(Boolean)}
        />

        <div className="doc-parties" style={{ marginTop: 16 }}>
          {/* Ship-to first: on this document it is the operative address. */}
          <Party
            title="Ship To"
            note="— where the goods go"
            name={shipName}
            address={shipAddr}
            state={shipState}
            /* Rule 55: the consignee's GSTIN. The ship-to is the buyer's own
               site unless a different one was recorded. */
            gstin={dc.ship_to_gstin ?? cust.gstin ?? ''}
            required
          />
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
          <Meta label="Dispatch through" value={dc.dispatch_through || dc.transporter_name} />
          <Meta label="Vehicle No." value={dc.vehicle_no} />
          <Meta label="LR / Docket" value={dc.lr_no} />
          <Meta label="Place of supply" value={posName ? `${posName}${posCode ? ` (${posCode})` : ''}` : null} />
          <Meta label="E-way Bill No." warn={ewayMissing}
            value={<>
              <span className="print:hidden"><InlineEdit value={dc.eway_bill_no} field="eway_bill_no" canEdit onSave={saveEway}
                placeholder={ewayMissing ? 'required — add' : 'add'} /></span>
              <span className="print-only">{dc.eway_bill_no || '—'}</span>
            </>} />
          {dc.eway_bill_date && <Meta label="E-way Bill Date" value={fmtDate(dc.eway_bill_date)} />}
          {dc.driver_name && <Meta label="Driver" value={`${dc.driver_name}${dc.driver_phone ? ' · ' + dc.driver_phone : ''}`} />}
          {dc.transporter_gstin && <Meta label="Transporter GSTIN" value={dc.transporter_gstin} />}
        </div>

        <div>
          <table className="doc-items" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>Description</th>
              <th style={{ ...th, textAlign: 'left' }}>HSN/SAC</th>
              <th style={{ ...th, textAlign: 'center' }}>UOM</th>
              <th style={{ ...th, textAlign: 'right', whiteSpace: 'nowrap' }}>Qty</th>
              <th style={{ ...th, textAlign: 'right', whiteSpace: 'nowrap' }}>Value</th>
            </tr></thead>
            <tbody>
              {(dc.items || []).map((it, i) => (
                <tr key={it.id}>
                  <td style={td}>{i + 1}</td>
                  <td className="doc-wrap" style={td}><ItemText text={it.description} /></td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{it.hsn || '—'}</td>
                  <td style={{ ...td, textAlign: 'center', color: 'var(--text-secondary)' }}>{it.uom || '—'}</td>
                  <td style={{ ...td, ...fig }}>{Number(it.quantity)}</td>
                  <td style={{ ...td, ...fig, fontWeight: 600 }}>₹{rup(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total to footer: kept whole, and never on a sheet by itself
            (print.css, .doc-closing). */}
        <div className="doc-closing">
        {/* The total in a ruled box, like the totals on the other documents. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <div style={{ minWidth: 300 }}>
            <div data-challan-total style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, border: '1px solid #000', padding: '8px 12px', fontWeight: 800, fontSize: '0.95rem' }}>
              <span style={{ fontSize: '0.74rem', letterSpacing: '.04em', textTransform: 'uppercase' }}>Total value of goods</span>
              <span style={fig}>₹{rup(value)}</span>
            </div>
            {needsEway && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: 4 }}>Above ₹50,000 with GST — an e-way bill applies.</div>}
          </div>
        </div>

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
