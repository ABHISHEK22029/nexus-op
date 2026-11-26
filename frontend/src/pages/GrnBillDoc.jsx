import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Download, Undo2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { usePermissions } from '../context/PermissionContext';
import Attachments from '../components/Attachments';
import UnitSelect from '../components/UnitSelect';
import { ItemText } from '../components/DocumentKit';
import { useDocEdit, EditBar, Field, Spot, onSheetClick, confirmDiscard } from '../components/DocEdit';
import { GST_RATES } from '../lib/docTotals';
import { lineProblems } from '../lib/lineChecks';
import { docFileName, printAs } from '../lib/documentPdf';
import { amountInWords } from '../lib/amountInWords';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rup = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

/* Editing on the page (components/DocEdit). A draft bill: all of it. An
   approved one: only what does not change what is owed — the server's
   BILL_APPROVED_FIELDS (controllers/GrnBillController). */
const APPROVED_KEYS = ['vendor_bill_ref', 'due_date', 'notes'];
const str = (v) => (v == null ? '' : String(v));
const numStr = (v) => (v == null || v === '' ? '' : String(Number(v)));
const blankLine = () => ({ description: '', hsn: '', uom: 'nos', quantity: '', rate: '' });

function billValues(bill) {
  return {
    vendor_bill_ref: str(bill.vendor_bill_ref), bill_date: str(bill.bill_date).slice(0, 10), due_date: str(bill.due_date).slice(0, 10),
    notes: str(bill.notes),
    freight: Number(bill.freight) ? numStr(bill.freight) : '', other_charges: Number(bill.other_charges) ? numStr(bill.other_charges) : '',
    discount: Number(bill.discount) ? numStr(bill.discount) : '', round_off: Number(bill.round_off) ? numStr(bill.round_off) : '',
    gst_rate: numStr(bill.gst_rate ?? 18), interstate: !!bill.interstate,
    items: (bill.items || []).map(it => ({ description: str(it.description), hsn: str(it.hsn), uom: str(it.uom || 'nos'), quantity: numStr(it.quantity), rate: numStr(it.rate) })),
  };
}
function outValue(k, v) {
  if (['freight', 'other_charges', 'discount', 'round_off', 'gst_rate'].includes(k)) return Number(v) || 0;
  if (k === 'interstate') return !!v;
  const t = String(v ?? '').trim();
  return t === '' ? null : t;
}
/* The bill's arithmetic, as the server's compute(): freight and other
   charges are taxed with the goods, the discount comes off before tax. */
function billTotals(items, d) {
  const amounts = items.map(it => r2((Number(it.quantity) || 0) * (Number(it.rate) || 0)));
  const sub = r2(amounts.reduce((s, a) => s + a, 0));
  const taxable = r2(sub + (Number(d.freight) || 0) + (Number(d.other_charges) || 0) - (Number(d.discount) || 0));
  const gst = r2(taxable * (Number(d.gst_rate) || 0) / 100);
  const cgst = d.interstate ? 0 : r2(gst / 2);
  const sgst = d.interstate ? 0 : r2(gst - cgst);
  return { amounts, sub, taxable, gst, cgst, sgst, igst: d.interstate ? gst : 0, net: r2(taxable + gst + (Number(d.round_off) || 0)) };
}

export default function GrnBillDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { prompt, confirm } = useConfirm();
  const ed = useDocEdit();
  const [bill, setBill] = useState(null);
  /* A wrong id or a refused one showed "Loading bill…" for good. */
  const [missing, setMissing] = useState('');
  const ref = useRef(null);

  const load = () => fetch(`${API}/grn-bills/${id}`).then(async r => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMissing(r.status === 403 ? 'Your role can\'t open vendor bills.' : (d.error === 'Not found' || !d.error ? 'This bill was not found. It may have been deleted.' : d.error)); return; }
    setMissing(''); setBill(d);
  });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const canWrite = can('grn-bills', 'write');
  const begin = (field) => { if (bill && canWrite) ed.start(billValues(bill), field); };

  /* Reopen as draft: the whole document is editable again, and editing
     starts as soon as the reload shows it as a draft. */
  const [editWhenDraft, setEditWhenDraft] = useState(false);
  useEffect(() => {
    if (editWhenDraft && bill && bill.status === 'Draft') { setEditWhenDraft(false); begin(); }
  }, [editWhenDraft, bill]);
  const reopen = async () => {
    if (!(await confirm({ title: `Reopen ${bill.bill_number} as a draft?`, message: 'Its lines and amounts can be changed again. Payments already made stay recorded.', confirmLabel: 'Reopen' }))) return;
    const r = await fetch(`${API}/grn-bills/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Draft' }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); toast.error(e.error || 'Could not reopen it'); return; }
    await load();
    setEditWhenDraft(true);
  };

  /* Draft or Approved by hand; Paid follows the payments. The answer is
     read: the page used to show the new status whatever the server said. */
  const setStatus = async (status, undoing = false) => {
    const before = bill?.status;
    const r = await fetch(`${API}/grn-bills/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || d.detail || 'Could not change the status'); return; }
    setBill(b => ({ ...b, status }));
    const no = bill?.bill_number || 'The bill';
    if (undoing) toast.success(`${no} is back to ${status}`);
    else if (before && before !== status && before !== 'Paid') toast.undo(`${no} marked ${status}`, () => setStatus(before, true));
  };
  /* A payment made in error, taken back with a reason on the record. */
  const reversePayment = async (p) => {
    const reason = await prompt({ title: `Reverse the payment of ₹${rup(p.amount)}?`, message: 'The bill goes back to owing it, and the reason goes on its record.', label: 'Why is it being reversed?', placeholder: 'e.g. paid against the wrong bill', required: true, requiredMessage: 'Say why the payment is being reversed.', confirmLabel: 'Reverse payment' });
    if (reason == null) return;
    if (!reason.trim()) { toast.error('Say why the payment is being reversed'); return; }
    const r = await fetch(`${API}/grn-bills/${id}/payments/${p.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error || 'Could not reverse the payment'); return; }
    toast.success(`Payment reversed — bill ${d.paymentStatus}`);
    load();
  };
  /* Browser print-to-PDF rather than html2canvas: the output stays real
     text, the print stylesheet controls page breaks, and the item table
     repeats its header. The filename comes from document.title. */
  const pdf = () => printAs(docFileName('Purchase Bill', bill.bill_number, bill.vendor?.name));

  if (missing) return (
    <div style={{ padding: 40, color: 'var(--text-muted)' }}>
      <p>{missing}</p>
      <button onClick={() => navigate('/payables')} className="inv-act-btn"><ArrowLeft size={15} /> Payables</button>
    </div>
  );
  if (!bill) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading bill…</div>;
  const co = bill.company || {};
  /* What has been paid, on the bill itself: it showed on screen only. */
  const paid = Math.round((bill.payments || []).reduce((t, p) => t + Number(p.amount || 0), 0) * 100) / 100;
  const balance = Math.max(0, Math.round((Number(bill.net_amount || 0) - paid) * 100) / 100);
  const vend = bill.vendor || {};
  const vendLines = [vend.address, [vend.city, vend.state].filter(Boolean).join(', ')].filter(Boolean);
  const fmt = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null);
  const date = fmt(bill.bill_date) || '—';

  /* ── Editing on the page ── */
  const isDraft = bill.status === 'Draft';
  const d = ed.editing ? ed.draft : null;
  const editAll = !!d && isDraft;
  const editable = (k) => !!d && (isDraft || APPROVED_KEYS.includes(k));
  const spotOn = (k) => !ed.editing && canWrite && (isDraft || APPROVED_KEYS.includes(k));
  const lt = editAll ? billTotals(d.items, d) : null;
  const lp = editAll ? lineProblems(d.items) : null;
  const zeroQty = editAll ? new Set(d.items.map((it, i) => (lp.kept.includes(it) && !(Number(it.quantity) > 0) ? i : -1)).filter(i => i >= 0)) : new Set();
  const negative = (v) => String(v ?? '').trim() !== '' && !(Number(v) >= 0);
  const discBad = editAll && (negative(d.discount) || (Number(d.discount) || 0) > lt.sub + (Number(d.freight) || 0) + (Number(d.other_charges) || 0) + 0.005);
  const roundBad = editAll && Math.abs(Number(d.round_off) || 0) > 1;
  const gstBad = editAll && (d.gst_rate === '' || !(Number(d.gst_rate) >= 0 && Number(d.gst_rate) <= 100));
  const problems = !d ? [] : [
    editAll && !d.bill_date && 'The bill date cannot be blank.',
    d.due_date && (editAll ? d.bill_date : str(bill.bill_date).slice(0, 10)) && d.due_date < (editAll ? d.bill_date : str(bill.bill_date).slice(0, 10)) && 'The due date is before the bill date.',
    ...(lp ? lp.list : []),
    editAll && lp.kept.length === 0 && 'Add at least one line item.',
    editAll && zeroQty.size > 0 && `Every line needs a quantity above zero (line ${[...zeroQty].map(i => i + 1).join(', ')}).`,
    editAll && lp.kept.some(it => Number(it.rate) < 0) && 'A rate cannot be negative.',
    editAll && (negative(d.freight) || negative(d.other_charges)) && 'Freight and other charges must be 0 or more.',
    discBad && 'The discount is more than the bill it comes off.',
    roundBad && 'Round off is at most ₹1 either way.',
    gstBad && 'Set a GST rate between 0 and 100.',
    editAll && lt.net + 0.005 < paid && `₹${rup(paid)} has already been paid — the bill cannot come to less than that.`,
  ].filter(Boolean);
  const shout = (bad) => ed.tried && !!bad;

  const save = async () => {
    if (!d || ed.saving) return;
    if (problems.length) { ed.setTried(true); return; }
    const body = {};
    for (const k of ed.changed(isDraft ? undefined : APPROVED_KEYS)) if (k !== 'items') body[k] = outValue(k, d[k]);
    if (isDraft && ed.changed(['items']).length) {
      body.items = lp.kept.map(it => ({ description: it.description.trim(), hsn: String(it.hsn || '').trim() || null, uom: it.uom || 'nos', quantity: Number(it.quantity) || 0, rate: Number(it.rate) || 0 }));
    }
    if (!Object.keys(body).length) { ed.stop(); toast.info('Nothing was changed'); return; }
    ed.setSaving(true);
    try {
      const res = await fetch(`${API}/grn-bills/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) { ed.setError(r.error || 'Could not save the bill'); ed.setSaving(false); return; }
      await load();
      ed.stop();
      toast.success(`${bill.bill_number} saved — the print shows the change`);
    } catch (e) { ed.setError(`Could not save: ${e.message}`); ed.setSaving(false); }
  };
  const cancelEdit = async () => { if (await confirmDiscard(ed, confirm)) ed.stop(); };
  const scope = isDraft
    ? 'A draft: the vendor’s invoice number, dates, lines, freight, discount, GST and notes can all change. Totals update as you type.'
    : 'Approved: the vendor’s invoice number, the due date and the notes can still change. To change the amounts, set it back to Draft first.';
  const words = amountInWords(lt ? lt.net : bill.net_amount);
  const money = (k, label, bad) => (
    <tr><td className="tl">{label}</td><td className="tv">
      <Field type="number" min="0" step="any" inputMode="decimal" name={k} label={label.charAt(0) + label.slice(1).toLowerCase()} placeholder="0.00" align="right"
        value={d[k]} onChange={v => ed.set(k, v)} invalid={shout(bad)} style={{ width: 104 }} />
    </td></tr>
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 40 }}>
      {/* Toolbar */}
      <div className="print:hidden" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => navigate('/payables')} className="inv-act-btn"><ArrowLeft size={15} /> Payables</button>
        {!ed.editing && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {bill.payment_status && <span data-bill-payment-status style={{ fontSize: '0.8rem', fontWeight: 700, color: bill.payment_status === 'Paid' ? 'var(--accent-emerald, #10b981)' : 'var(--text-secondary)' }}>{bill.payment_status}</span>}
          {canWrite && (
            <button onClick={() => begin()} data-doc-edit className="inv-act-btn" title={isDraft ? 'Change anything on this draft bill, right here' : 'Change the vendor’s invoice number, due date or notes'}>
              <Pencil size={15} /> Edit bill
            </button>
          )}
{bill.status === 'Approved' && canWrite && (
            <button onClick={reopen} data-doc-reopen className="inv-act-btn" title="Back to draft, to change the lines, prices or anything else">
              <Undo2 size={15} /> Reopen as draft
            </button>
          )}
          {canWrite ? (
            <select value={bill.status === 'Paid' ? 'Approved' : bill.status} onChange={e => setStatus(e.target.value)} aria-label="Bill status" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.8rem' }}>
              {['Draft', 'Approved'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{bill.status}</span>}
          <button onClick={pdf} className="inv-act-btn"><Download size={15} /> PDF</button>
          <button onClick={pdf} className="inv-act-btn primary"><Printer size={15} /> Print</button>
        </div>
        )}
      </div>

      {ed.editing && <EditBar ed={ed} what={bill.bill_number} scope={scope} problems={problems} onSave={save} onCancel={cancelEdit} />}

      {(bill.payments || []).length > 0 && !ed.editing && (
        <div className="print:hidden" data-bill-payments style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: 6 }}>Payments made</div>
          {bill.payments.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border-subtle)', fontSize: '0.84rem' }}>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>₹{rup(p.amount)}</span>
              <span style={{ color: 'var(--text-muted)', flex: '1 1 160px' }}>
                {String(p.paid_date || p.created_at || '').slice(0, 10)} · {p.mode || 'Bank'}{p.reference ? ` · ${p.reference}` : ''}
              </span>
              {can('grn-bills', 'delete') && (
                <button onClick={() => reversePayment(p)} className="inv-act-btn" style={{ fontSize: '0.76rem', padding: '4px 10px' }}><Undo2 size={13} /> Reverse</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Attachments — challan / vendor bill (hidden on print) */}
      {!ed.editing && (
        <div className="print:hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Attachments entityType="grn_bill" entityId={id} label="Challan & Documents" compact />
        </div>
      )}

      {/* B&W document */}
      <div className="doc-scroll">
      <div ref={ref} className="invoice-mock" data-editing={ed.editing ? 'true' : undefined} onClick={onSheetClick(ed, begin)}>
        <div className="inv-header">
          <div>
            <div className="inv-company-name">{co.name || co.tradeName || '—'}</div>
            <div className="inv-company-detail">
              {co.address ? <>{co.address}<br /></> : <span className="print:hidden" style={{ color: '#dc2626', fontStyle: 'italic' }}>Add your address in Company profile<br /></span>}
              {co.gstin && <>GSTIN: <strong>{co.gstin}</strong></>}
              {co.stateCode && <>{co.gstin ? ' · ' : ''}State Code: <strong>{co.stateCode}</strong></>}
              {co.pan && <>{co.gstin || co.stateCode ? ' · ' : ''}PAN: <strong>{co.pan}</strong></>}
              {(co.gstin || co.stateCode || co.pan) && <br />}
              {co.cin && <>CIN: <strong>{co.cin}</strong><br /></>}
              {co.phone && <>Ph: {co.phone}</>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="inv-po-title">Purchase Bill</div>
            <div className="inv-meta-row">Bill #: <strong>{bill.bill_number}</strong></div>
            <div className="inv-meta-row">Date: {editable('bill_date')
              ? <Field type="date" name="bill_date" label="Bill date" value={d.bill_date} onChange={v => ed.set('bill_date', v)} invalid={shout(!d.bill_date)} style={{ fontWeight: 700 }} />
              : <Spot field="bill_date" on={spotOn('bill_date')}><strong>{date}</strong></Spot>}</div>
            <div className={`inv-meta-row${bill.due_date || ed.editing ? '' : ' print:hidden'}`}>Due: {editable('due_date')
              ? <Field type="date" name="due_date" label="Due date" value={d.due_date} onChange={v => ed.set('due_date', v)} style={{ fontWeight: 700 }} />
              : <Spot field="due_date" on={spotOn('due_date')}><strong>{fmt(bill.due_date) || <span className="print:hidden" style={{ fontWeight: 400, color: '#6b7280' }}>not set</span>}</strong></Spot>}</div>
            {/* The supplier's own invoice number is what input tax credit is
                claimed against (it must match their GSTR-1). */}
            {editable('vendor_bill_ref')
              ? <div className="inv-meta-row">Vendor's Invoice No.: <Field name="vendor_bill_ref" label="Vendor's invoice number" value={d.vendor_bill_ref} onChange={v => ed.set('vendor_bill_ref', v)} maxLength={60} style={{ width: 150, fontWeight: 700 }} /></div>
              : bill.vendor_bill_ref
                ? <div className="inv-meta-row"><Spot field="vendor_bill_ref" on={spotOn('vendor_bill_ref')}>Vendor's Invoice No.: <strong>{bill.vendor_bill_ref}</strong></Spot></div>
                : <div className="inv-meta-row print:hidden" data-bill-ref-missing style={{ color: '#dc2626' }}><Spot field="vendor_bill_ref" on={spotOn('vendor_bill_ref')}>Vendor's invoice no.: <em>not recorded — needed to claim the GST credit</em></Spot></div>}
          </div>
        </div>

        <div className="inv-parties" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="inv-party">
            <div className="inv-party-title">Vendor</div>
            <div className="inv-party-name">{bill.vendor?.name || '—'}</div>
            <div className="inv-party-detail">
              {vendLines.map((l, i) => <React.Fragment key={i}>{l}<br /></React.Fragment>)}
              GSTIN: <strong>{vend.gstin || 'Unregistered'}</strong>
            </div>
          </div>
          <div className="inv-party">
            <div className="inv-party-title">Against</div>
            <div className="inv-party-detail" data-bill-links>
              {bill.grn_number || (bill.grn_id ? `GRN-${String(bill.grn_id).padStart(5, '0')}` : '—')} · PO {bill.po_id
                ? <Link to={`/po/${bill.po_id}`} style={{ color: 'inherit', fontWeight: 700 }}>{bill.po_number || `#${bill.po_id}`}</Link>
                : '—'}
            </div>
          </div>
        </div>

        <div className="inv-items-table">
          <table className="doc-items">
            <thead><tr>
              <th style={{ width: '6%' }}>#</th><th style={{ width: '42%' }}>DESCRIPTION</th><th>HSN/SAC</th><th>UOM</th><th style={num}>QTY</th><th style={num}>RATE</th><th style={num}>AMOUNT</th>
            </tr></thead>
            {editAll ? (
              <tbody>
                {d.items.map((it, i) => (
                  <tr key={i} className={shout(lp.rows.has(i) || zeroQty.has(i)) ? 'de-row-bad' : undefined}>
                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                    <td><Field as="textarea" name={`line-${i}-description`} label={`Line ${i + 1} description`} placeholder="What was bought" value={it.description} onChange={v => ed.setItem(i, { description: v })} invalid={shout(lp.rows.has(i))} style={{ fontWeight: 600 }} /></td>
                    <td><Field name={`line-${i}-hsn`} label={`Line ${i + 1} HSN`} inputMode="numeric" maxLength={8} value={it.hsn} onChange={v => ed.setItem(i, { hsn: v.replace(/[^\d]/g, '') })} style={{ width: 72 }} /></td>
                    <td><UnitSelect className="de-in" value={it.uom} onChange={v => ed.setItem(i, { uom: v })} ariaLabel={`Line ${i + 1} unit`} style={{ width: 80 }} /></td>
                    <td style={num}><Field type="number" min="0" step="any" inputMode="decimal" name={`line-${i}-quantity`} label={`Line ${i + 1} quantity`} align="right" value={it.quantity} onChange={v => ed.setItem(i, { quantity: v })} invalid={shout(zeroQty.has(i))} style={{ width: 70 }} /></td>
                    <td style={num}><Field type="number" min="0" step="any" inputMode="decimal" name={`line-${i}-rate`} label={`Line ${i + 1} rate`} align="right" value={it.rate} onChange={v => ed.setItem(i, { rate: v })} style={{ width: 92 }} /></td>
                    <td style={{ ...num, fontWeight: 600 }}>
                      {rup(lt.amounts[i])}
                      <button type="button" className="de-remove" onClick={() => ed.removeItem(i)} aria-label={`Remove line ${i + 1}`} title="Remove this line"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody>
                {bill.items.map((it, i) => (
                  <tr key={it.id} {...(spotOn('items') ? { 'data-de-field': `line-${i}-description`, className: 'de-spot', title: 'Click to edit' } : {})}>
                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                    <td className="doc-wrap"><ItemText text={it.description} /></td>
                    <td>{it.hsn || '-'}</td>
                    <td>{it.uom}</td>
                    <td style={num}>{Number(it.quantity)}</td>
                    <td style={num}>{rup(it.rate)}</td>
                    <td style={{ ...num, fontWeight: 600 }}>{rup(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
          {editAll && <div style={{ padding: '0 22px' }}><button type="button" className="de-add-line" onClick={() => ed.addItem(blankLine())} data-de-add-line><Plus size={14} /> Add line</button></div>}
        </div>

        {/* Totals to footer: kept whole, and never on a sheet by itself
            (print.css, .doc-closing). */}
        <div className="doc-closing">
        <div className="inv-totals-section">
          {editable('notes') ? (
            <div className="inv-notes" style={{ width: '48%' }}>
              <strong>Notes</strong>
              <Field as="textarea" name="notes" label="Notes" minRows={3} value={d.notes} onChange={v => ed.set('notes', v)} placeholder="Printed on the bill" />
            </div>
          ) : (
            <div className="inv-notes doc-wrap">
              <Spot field="notes" on={spotOn('notes')} block>
                {bill.notes ? <><strong>Notes</strong>{bill.notes}</> : (spotOn('notes') && <span className="print:hidden" style={{ color: '#6b7280' }}>+ Add notes</span>)}
              </Spot>
            </div>
          )}
          {editAll ? (
            <table className="inv-totals-table" data-de-totals>
              <tbody>
                <tr><td className="tl">SUB-TOTAL</td><td className="tv">{rup(lt.sub)}</td></tr>
                {money('freight', 'FREIGHT', negative(d.freight))}
                {money('other_charges', 'OTHER CHARGES', negative(d.other_charges))}
                {money('discount', 'DISCOUNT', discBad)}
                <tr className="print:hidden"><td className="tl">GST</td><td className="tv">
                  <span className="de-inline" style={{ justifyContent: 'flex-end' }}>
                    <Field type="number" min="0" max="100" step="any" inputMode="decimal" name="gst_rate" label="GST rate" list="de-bill-gst" align="right" value={d.gst_rate} onChange={v => ed.set('gst_rate', v)} invalid={shout(gstBad)} style={{ width: 60 }} />%
                    <Field as="select" name="interstate" label="Tax split" value={d.interstate ? 'igst' : 'cgst'} onChange={v => ed.set('interstate', v === 'igst')} style={{ width: 'auto' }}>
                      <option value="cgst">CGST + SGST</option><option value="igst">IGST</option>
                    </Field>
                  </span>
                  <datalist id="de-bill-gst">{GST_RATES.map(r => <option key={r} value={r} />)}</datalist></td></tr>
                {d.interstate
                  ? <tr><td className="tl">IGST @ {Number(d.gst_rate) || 0}%</td><td className="tv">{rup(lt.igst)}</td></tr>
                  : <>
                      <tr><td className="tl">CGST @ {(Number(d.gst_rate) || 0) / 2}%</td><td className="tv">{rup(lt.cgst)}</td></tr>
                      <tr><td className="tl">SGST @ {(Number(d.gst_rate) || 0) / 2}%</td><td className="tv">{rup(lt.sgst)}</td></tr>
                    </>}
                <tr><td className="tl">ROUND OFF</td><td className="tv">
                  <Field type="number" min="-1" max="1" step="0.01" inputMode="decimal" name="round_off" label="Round off" placeholder="0.00" align="right" value={d.round_off} onChange={v => ed.set('round_off', v)} invalid={shout(roundBad)} style={{ width: 80 }} /></td></tr>
                <tr className="tf"><td className="tl" style={{ color: '#000' }}>NET PAYABLE</td><td className="tv" style={{ color: '#000' }} data-de-total>{rup(lt.net)}</td></tr>
                {paid > 0 && <>
                  <tr><td className="tl">AMOUNT PAID</td><td className="tv">-{rup(paid)}</td></tr>
                  <tr className="tf"><td className="tl" style={{ color: '#000' }}>BALANCE</td><td className="tv" style={{ color: '#000' }}>{rup(Math.max(0, lt.net - paid))}</td></tr>
                </>}
              </tbody>
            </table>
          ) : (
            <Spot field="freight" on={spotOn('freight')} block>
              <table className="inv-totals-table">
                <tbody>
                  <tr><td className="tl">SUB-TOTAL</td><td className="tv">{rup(bill.sub_total)}</td></tr>
                  {Number(bill.freight) ? <tr><td className="tl">FREIGHT</td><td className="tv">{rup(bill.freight)}</td></tr> : null}
                  {Number(bill.other_charges) ? <tr><td className="tl">OTHER CHARGES</td><td className="tv">{rup(bill.other_charges)}</td></tr> : null}
                  {Number(bill.discount) ? <tr><td className="tl">DISCOUNT</td><td className="tv">-{rup(bill.discount)}</td></tr> : null}
                  {bill.interstate
                    ? <tr><td className="tl">IGST @ {bill.gst_rate}%</td><td className="tv">{rup(bill.igst)}</td></tr>
                    : <>
                        <tr><td className="tl">CGST @ {Number(bill.gst_rate) / 2}%</td><td className="tv">{rup(bill.cgst)}</td></tr>
                        <tr><td className="tl">SGST @ {Number(bill.gst_rate) / 2}%</td><td className="tv">{rup(bill.sgst)}</td></tr>
                      </>}
                  {Number(bill.round_off) ? <tr><td className="tl">ROUND OFF</td><td className="tv">{rup(bill.round_off)}</td></tr> : null}
                  <tr className="tf"><td className="tl" style={{ color: '#000' }}>NET PAYABLE</td><td className="tv" style={{ color: '#000' }}>{rup(bill.net_amount)}</td></tr>
                  {paid > 0 && <>
                    <tr><td className="tl">AMOUNT PAID</td><td className="tv">-{rup(paid)}</td></tr>
                    <tr className="tf"><td className="tl" style={{ color: '#000' }}>BALANCE</td><td className="tv" style={{ color: '#000' }}>{rup(balance)}</td></tr>
                  </>}
                </tbody>
              </table>
            </Spot>
          )}
        </div>

        {/* Spelled from the total on the page; the stored text could be empty or stale. */}
        <div className="inv-amount-words">Amount in Words: {words}</div>

        <div className="inv-sig">
          <div>
            <div className="inv-sig-line"></div>
            <div className="inv-sig-label">Authorized Signatory</div>
            <div className="inv-sig-company mt-2">{co.name || co.tradeName || '—'}</div>
          </div>
        </div>
        <div className="inv-footer">
          <div className="inv-footer-left">{co.invoice_footer_note || 'This is a computer-generated document.'}</div>
          <div className="inv-footer-right">{bill.bill_number} &nbsp;|&nbsp; {date}</div>
        </div>
        </div>
      </div>
      </div>
    </div>
  );
}
