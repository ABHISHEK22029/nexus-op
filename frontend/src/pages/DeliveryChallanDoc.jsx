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
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Truck, AlertTriangle } from 'lucide-react';
import {
  CompanyHeader, Party, SignatureBlock, DocFooter, NotATaxInvoice, rup, fmtDate,
} from '../components/DocumentKit';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const EWAY_THRESHOLD = 50000;

export default function DeliveryChallanDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dc, setDc] = useState(null);
  const [err, setErr] = useState(false);

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

  const needsEway = value > EWAY_THRESHOLD;
  const ewayMissing = needsEway && !dc.eway_bill_no;

  const th = { padding: '9px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)' };
  const td = { padding: '9px 10px', fontSize: '0.85rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' };
  const metaBox = { border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem' };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/delivery-challans')} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={15} /> All Challans</button>
        <button onClick={() => window.print()} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Printer size={15} /> Print</button>
      </div>

      {/* Screen-only. The driver finds out at the checkpost otherwise. */}
      {ewayMissing && (
        <div className="no-print" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700, fontSize: '0.88rem' }}>
            <AlertTriangle size={16} /> E-way bill required — and not recorded
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
            This consignment is {rup(value)}, above the {rup(EWAY_THRESHOLD)} threshold in Rule 138.
            Generate the e-way bill on the government portal and record the number here before the vehicle leaves.
          </div>
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 32 }}>
        <CompanyHeader
          company={co}
          title="DELIVERY CHALLAN"
          meta={[
            ['No.', dc.challan_number],
            ['Date', fmtDate(dc.challan_date)],
            dc.status && ['Status', dc.status],
          ]}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Ship-to first: on this document it is the operative address. */}
          <Party
            title="Ship To"
            note="— where the goods go"
            name={shipName}
            address={shipAddr}
            state={shipState}
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
          <Meta box={metaBox} label="Dispatch through" value={dc.dispatch_through || dc.transporter_name} />
          <Meta box={metaBox} label="Vehicle No." value={dc.vehicle_no} mono />
          <Meta box={metaBox} label="LR / Docket" value={dc.lr_no} />
          <Meta box={metaBox} label="Place of supply" value={dc.place_of_supply || shipState} />
          <Meta box={metaBox} label="E-way Bill No." value={dc.eway_bill_no} mono
            warn={ewayMissing} />
          {dc.eway_bill_date && <Meta box={metaBox} label="E-way Bill Date" value={fmtDate(dc.eway_bill_date)} />}
          {dc.driver_name && <Meta box={metaBox} label="Driver" value={`${dc.driver_name}${dc.driver_phone ? ' · ' + dc.driver_phone : ''}`} />}
          {dc.transporter_gstin && <Meta box={metaBox} label="Transporter GSTIN" value={dc.transporter_gstin} mono />}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>Description</th>
              <th style={{ ...th, textAlign: 'left' }}>HSN</th>
              <th style={{ ...th, textAlign: 'right' }}>Qty</th>
              <th style={{ ...th, textAlign: 'right' }}>Value</th>
            </tr></thead>
            <tbody>
              {(dc.items || []).map((it, i) => (
                <tr key={it.id}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{it.description}</td>
                  <td style={{ ...td, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{it.hsn || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{it.quantity} {it.uom}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₹{rup(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Total value of goods</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>₹{rup(value)}</div>
            {needsEway && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>above ₹50,000 — e-way bill applies</div>}
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
  );
}

const Meta = ({ box, label, value, mono, warn }) => (
  <div style={{ ...box, ...(warn ? { borderColor: '#dc2626' } : null) }}>
    <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>{label}</div>
    <div style={{ fontWeight: 600, fontFamily: mono ? 'var(--font-mono)' : undefined, color: warn ? '#dc2626' : undefined }}>
      {value || (warn ? 'required' : '—')}
    </div>
  </div>
);
