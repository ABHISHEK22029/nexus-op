import React, { useState, useEffect, useRef } from 'react';
import CompanyLogo from '../components/CompanyLogo';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Download, Plus, IndianRupee, AlertTriangle, Mail, Pencil, Undo2, Ban, FileMinus, Trash2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { usePermissions } from '../context/PermissionContext';
import EmailDocumentModal from '../components/EmailDocumentModal';
import Attachments from '../components/Attachments';
import UnitSelect from '../components/UnitSelect';
import { amountInWords } from '../lib/amountInWords';
import { docFileName, downloadDocumentPdf, printAs } from '../lib/documentPdf';
import { PAYMENT_MODES, DEFAULT_PAYMENT_MODE } from '../lib/paymentModes';
import { CopyPicker, COPIES, DECLARATION, Declaration, ItemText, FillRows } from '../components/DocumentKit';
import { useDocEdit, EditBar, Field, Spot, onSheetClick, confirmDiscard } from '../components/DocEdit';
import { useDocHistory, HistoryButton, HistoryPanel, VersionBar } from '../components/DocHistory';
import { docTotals, GST_RATES, invoiceNumberProblem } from '../lib/docTotals';
import { lineProblems, adjustmentProblems } from '../lib/lineChecks';
import { GST_STATES, stateCode, stateName } from '../lib/gstStates';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rup = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* An amount on the document: right-aligned, on one line, figures of equal
   width — ₹14,25,41,68,500.00 wrapped onto two lines reads as two numbers. */
const num = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

/* Bill-to and ship-to: the snapshots taken when the invoice was raised,
   falling back to the live customer record for invoices made before those
   were captured. One definition, for the sheet and for the editor. */
function partiesOf(inv) {
  const billTo = {
    name: inv.bill_to_name || inv.customer?.name,
    address: inv.bill_to_address || inv.customer?.billing_address,
    gstin: inv.bill_to_gstin || inv.customer?.gstin,
    state: inv.bill_to_state || inv.customer?.state,
  };
  const shipTo = {
    name: inv.ship_to_name || billTo.name,
    address: inv.ship_to_address || inv.customer?.shipping_address || billTo.address,
    gstin: inv.ship_to_gstin || billTo.gstin,
    state: inv.ship_to_state || inv.customer?.shipping_state || billTo.state,
  };
  return { billTo, shipTo };
}

/* Editing on the page (components/DocEdit). What an issued invoice still
   lets you change — the server's INVOICE_ISSUED_FIELDS; a draft, all of it. */
const ISSUED_KEYS = ['due_date', 'eway_bill_no', 'notes', 'terms'];
/* A change to any of these works the totals out again. */
const RECOMPUTE = ['discount', 'gst_rate', 'round_off', 'place_of_supply_code', 'reverse_charge', 'customer_id'];
const str = (v) => (v == null ? '' : String(v));
const numStr = (v) => (v == null || v === '' ? '' : String(Number(v)));
const blankLine = () => ({ description: '', hsn: '', uom: 'nos', quantity: '', rate: '', customerOrderItemId: null });

/** The invoice as the editor starts it: what the sheet shows, as text. */
function invoiceValues(inv) {
  const { billTo, shipTo } = partiesOf(inv);
  return {
    invoice_number: str(inv.invoice_number),
    invoice_date: str(inv.invoice_date).slice(0, 10),
    due_date: str(inv.due_date).slice(0, 10),
    eway_bill_no: str(inv.eway_bill_no),
    notes: str(inv.notes),
    terms: str(inv.terms || inv.company?.invoice_terms),
    customer_id: inv.customer_id ?? null,
    bill_to_name: str(billTo.name), bill_to_address: str(billTo.address), bill_to_gstin: str(billTo.gstin), bill_to_state: str(billTo.state),
    ship_to_name: str(shipTo.name), ship_to_address: str(shipTo.address), ship_to_gstin: str(shipTo.gstin), ship_to_state: str(shipTo.state),
    place_of_supply_code: str(inv.place_of_supply_code || stateCode(inv.place_of_supply)),
    reverse_charge: !!inv.reverse_charge,
    gst_rate: numStr(inv.gst_rate ?? 18),
    discount: Number(inv.discount) ? numStr(inv.discount) : '',
    round_off: Number(inv.round_off) ? numStr(inv.round_off) : '',
    /* customerOrderItemId ties a line to its order line: it is what "billed
       against ordered" counts, so a saved edit must carry it back. */
    items: (inv.items || []).map(it => ({
      description: str(it.description), hsn: str(it.hsn), uom: str(it.uom || 'nos'),
      quantity: numStr(it.quantity), rate: numStr(it.rate), customerOrderItemId: it.customer_order_item_id ?? null,
    })),
  };
}

/** A value as the server takes it. */
function outValue(k, v) {
  if (['discount', 'round_off', 'gst_rate'].includes(k)) return Number(v) || 0;
  if (k === 'reverse_charge') return !!v;
  if (k === 'customer_id') return v ? Number(v) : null;
  const s = String(v ?? '').trim();
  if (['bill_to_gstin', 'ship_to_gstin'].includes(k)) return s ? s.toUpperCase() : null;
  return s === '' ? null : s;
}

export default function SalesInvoiceDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { confirm, prompt } = useConfirm();
  const ed = useDocEdit();
  /* The customers a draft can be moved to — fetched when a draft is opened
     for editing, not before. */
  const [customers, setCustomers] = useState(null);
  /* "Reopen as draft": once the reload shows it as a draft, edit it here. */
  const [editWhenDraft, setEditWhenDraft] = useState(false);
  const [inv, setInv] = useState(null);
  const [pay, setPay] = useState({ amount: '', mode: DEFAULT_PAYMENT_MODE, reference: '', paidDate: '' });
  const ref = useRef(null);
  const [emailing, setEmailing] = useState(false);
  const [making, setMaking] = useState(false);
  const [paying, setPaying] = useState(false);
  /* Which of the three copies is being printed (Rule 46: triplicate). */
  const [copy, setCopy] = useState(COPIES.invoice[0]);
  /* A wrong or deleted id, or one this role can't open, showed "Loading
     invoice…" for good, with no way back. */
  const [missing, setMissing] = useState('');

  const load = () => fetch(`${API}/sales-invoices/${id}`)
    .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) { setMissing(r.status === 403 ? 'Your role can\'t open invoices.' : (d.error || 'This invoice was not found. It may have been deleted.')); return null; } setMissing(''); return d; })
    .then(d => { if (d) setInv(d); });
  useEffect(() => { load(); }, [id]);
  /* Every change kept; an earlier version shown here, as it was. */
  const hist = useDocHistory({ path: 'sales-invoices', id, reload: load, apply: (c) => setInv(cur => ({ ...cur, ...c })) });

  /* Open the sheet for editing — at the piece that was clicked, if one was.
     A cancelled invoice, or a role that may not change invoices, has
     nothing to open. */
  const canWrite = can('sales-invoices', 'write');
  const begin = (field) => {
    if (!inv || inv.status === 'Cancelled' || !canWrite || hist.viewing) return;
    if (inv.status === 'Draft' && customers == null && !inv.customer_order_id) {
      fetch(`${API}/customers`).then(r => (r.ok ? r.json() : [])).then(d => {
        const list = Array.isArray(d) ? d : (d.items || d.rows || []);
        setCustomers([...list].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      }).catch(() => setCustomers([]));
    }
    ed.start(invoiceValues(inv), field);
  };
  useEffect(() => {
    if (editWhenDraft && inv?.status === 'Draft') { setEditWhenDraft(false); begin(); }
  }, [editWhenDraft, inv]);

  /* The server decides what may be set; a refusal is said, not swallowed —
     the menu used to look as if it had worked and then snap back. */
  const setStatus = async (status) => {
    if (status === 'Cancelled' && !(await confirm({ title: `Cancel ${inv.invoice_number}?`, message: 'It keeps its number, is marked Cancelled, and is no longer owed. This cannot be undone.', confirmLabel: 'Cancel invoice', cancelLabel: 'Keep it', tone: 'danger' }))) return;
    const before = inv.status;
    const res = await fetch(`${API}/sales-invoices/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Could not change the status'); }
    else if (status === 'Cancelled') toast.success(`${inv.invoice_number} cancelled`);
    /* Draft and Sent go back and forth, so that change gets Undo rather
       than a question. Cancelling is final, and keeps its question above. */
    else if (before !== status && ['Draft', 'Sent'].includes(before)) {
      const no = inv.invoice_number;
      toast.undo(`${no} marked ${status}`, async () => {
        const u = await fetch(`${API}/sales-invoices/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: before }) });
        if (!u.ok) { const d = await u.json().catch(() => ({})); toast.error(d.error || 'Could not put it back'); }
        else toast.success(`${no} is back to ${before}`);
        load();
      });
    }
    load();
  };

  /* Take back a payment recorded in error, or a cheque that bounced. The
     reason goes on the invoice's record, so it is asked for. */
  const reversePayment = async (p) => {
    const reason = await prompt({ title: `Reverse the payment of ₹${rup(p.amount)}?`, message: `${p.paid_date ? `Received on ${p.paid_date}. ` : ''}The invoice goes back to owing it, and the reason goes on its record.`, label: 'Why is it being reversed?', placeholder: 'e.g. cheque bounced', required: true, requiredMessage: 'Say why the payment is being reversed.', confirmLabel: 'Reverse payment' });
    if (reason == null) return;
    if (!reason.trim()) { toast.error('Say why the payment is being reversed'); return; }
    const res = await fetch(`${API}/sales-invoices/${id}/payments/${p.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d.error || 'Could not reverse the payment'); return; }
    toast.success(`Payment reversed — invoice ${d.status}`);
    load();
  };

  const isDraft = inv?.status === 'Draft';
  /* An issued invoice with nothing received against it can still be taken
     back to draft and corrected — the status menu always allowed it, but
     nothing said so, and the padlock on the number read as "this cannot be
     done at all". Once money has come in, the correction is a credit or
     debit note, and the button says that instead. */
  const isCancelled = inv?.status === 'Cancelled';
  const hasPayments = !!inv && ((inv.payments || []).length > 0 || Number(inv.amount_paid) > 0);
  const canReopen = inv && !isDraft && !isCancelled && !hasPayments;
  /* What may be picked by hand. Paid and Partially Paid follow the
     payments, so once money is in the status is shown, not offered; a
     cancelled invoice stays cancelled. */
  const statusChoices = !inv || isCancelled || hasPayments ? [] : ['Draft', 'Sent', 'Cancelled'];
  /* Reopened, it is edited right here on its own page, like any draft. */
  const reopen = async () => {
    if (!(await confirm({ title: `Reopen ${inv.invoice_number} as a draft?`, message: 'If it has already gone to the customer, send them the corrected copy once you have changed it.', confirmLabel: 'Reopen' }))) return;
    const r = await fetch(`${API}/sales-invoices/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Draft' }) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(d.error || 'Could not reopen it'); return; }
    await load();
    setEditWhenDraft(true);
  };

  /* One click, one payment: Add had no busy state, so a double click
     recorded the money twice. The server also asks when the same amount
     arrives twice within two minutes. */
  const recordPayment = async (confirmDuplicate = false) => {
    if (!pay.amount || +pay.amount <= 0) { toast.error('Enter a payment amount'); return; }
    if (paying) return;
    setPaying(true);
    try {
      const res = await fetch(`${API}/sales-invoices/${id}/payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pay, confirmDuplicate }) });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.duplicate) {
        setPaying(false);
        if (await confirm({ title: 'Record a second payment?', message: d.error, confirmLabel: 'Yes, record it', cancelLabel: 'No, it was a double click' })) return recordPayment(true);
        return;
      }
      if (!res.ok) { toast.error(d.error || 'Could not record the payment'); return; }
      toast.success(`Payment recorded — ${d.status}`);
      setPay({ amount: '', mode: DEFAULT_PAYMENT_MODE, reference: '', paidDate: '' });
      load();
    } finally { setPaying(false); }
  };

  if (missing) return (
    <div style={{ padding: 40, color: 'var(--text-muted)' }}>
      <p>{missing}</p>
      <button onClick={() => navigate('/sales-invoices')} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={15} /> All invoices</button>
    </div>
  );
  if (!inv) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading invoice…</div>;
  const co = inv.company || {};
  const date = inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  /* To the paisa: the difference of two amounts in floating point can
     come out as …543.9999999 and print a paisa short. */
  const paid = Number(inv.amount_paid) || 0;
  /* Credit notes against it come off what is owed, as on the list, the
     dashboard and the server's payment check. */
  const credited = Number(inv.credited) || 0;
  /* A cancelled invoice is owed nothing, whatever its total. */
  const due = isCancelled ? 0 : Math.max(0, Math.round(((Number(inv.net_amount) || 0) - credited - paid) * 100) / 100);
  const input = { padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
  const dueDate = fmt(inv.due_date);
  const overdue = inv.due_date && due > 0 && new Date(inv.due_date) < new Date();

  const { billTo, shipTo } = partiesOf(inv);
  const differentShipTo = (shipTo.address || '') !== (billTo.address || '');
  const hasBank = co.bank_name && co.bank_account_no && co.bank_ifsc;
  const fileName = docFileName('Tax Invoice', inv.invoice_number, billTo.name);
  const terms = inv.terms || co.invoice_terms;

  /* ── Editing on the page ─────────────────────────────────────────── */
  const d = ed.editing ? ed.draft : null;
  const editAll = !!d && isDraft;
  /* Which pieces are fields now, and which light up to be clicked. */
  const editable = (k) => !!d && (isDraft || ISSUED_KEYS.includes(k));
  const spotOn = (k) => !ed.editing && !hist.viewing && canWrite && !isCancelled && (isDraft || ISSUED_KEYS.includes(k));
  /* IGST or CGST+SGST follows the place of supply against our own state;
     when either is unknown, the invoice keeps the split it has. */
  const supplierCode = co.stateCode || stateCode(co.gstin);
  const liveInter = editAll
    ? (supplierCode && d.place_of_supply_code ? supplierCode !== d.place_of_supply_code : !!inv.interstate)
    : !!inv.interstate;
  const lt = editAll ? docTotals(d.items, { discount: d.discount, gstRate: d.gst_rate, interstate: liveInter, roundOff: d.round_off, reverseCharge: d.reverse_charge }) : null;
  const lp = editAll ? lineProblems(d.items) : null;
  const adj = editAll ? adjustmentProblems({ discount: d.discount, mode: 'amt', roundOff: d.round_off, sub: lt.subTotal }) : [];
  const zeroQty = editAll ? new Set(d.items.map((it, i) => (lp.kept.includes(it) && !(Number(it.quantity) > 0) ? i : -1)).filter(i => i >= 0)) : new Set();
  const gstBad = editAll && (d.gst_rate === '' || !(Number(d.gst_rate) >= 0 && Number(d.gst_rate) <= 100));
  const dateFor = d ? (editAll ? d.invoice_date : str(inv.invoice_date).slice(0, 10)) : '';
  const dueBad = !!d && !!d.due_date && !!dateFor && d.due_date < dateFor;
  /* What would stop the save, in the order the sheet reads. */
  const problems = !d ? [] : [
    editAll && invoiceNumberProblem(d.invoice_number),
    editAll && !d.invoice_date && 'The invoice date cannot be blank.',
    dueBad && 'The due date is before the invoice date.',
    editAll && !d.bill_to_name.trim() && 'The bill-to name cannot be blank.',
    ...(lp ? lp.list : []),
    editAll && lp.kept.length === 0 && 'Add at least one line item.',
    editAll && zeroQty.size > 0 && `Every line needs a quantity above zero (line ${[...zeroQty].map(i => i + 1).join(', ')}).`,
    editAll && lp.kept.some(it => Number(it.rate) < 0) && 'A rate cannot be negative.',
    ...adj,
    gstBad && 'Set a GST rate between 0 and 100.',
  ].filter(Boolean);
  const shout = (bad) => ed.tried && !!bad;

  const save = async (confirmAbove = false) => {
    if (!d || ed.saving) return;
    if (problems.length) { ed.setTried(true); return; }
    const body = {};
    for (const k of ed.changed(isDraft ? undefined : ISSUED_KEYS)) if (k !== 'items') body[k] = outValue(k, d[k]);
    if ('place_of_supply_code' in body) body.place_of_supply = body.place_of_supply_code ? stateName(body.place_of_supply_code) : null;
    const itemsChanged = isDraft && ed.changed(['items']).length > 0;
    if (itemsChanged) {
      body.items = lp.kept.map(it => ({
        description: it.description.trim(), hsn: String(it.hsn || '').trim() || null, uom: it.uom || 'nos',
        quantity: Number(it.quantity) || 0, rate: Number(it.rate) || 0, customerOrderItemId: it.customerOrderItemId ?? null,
      }));
    }
    /* The IGST / CGST choice stands when the states can't decide it. */
    if (isDraft && (itemsChanged || RECOMPUTE.some(k => k in body))) body.interstate = liveInter;
    if (!Object.keys(body).length) { ed.stop(); toast.info('Nothing was changed'); return; }
    if (confirmAbove) body.confirmAboveOrder = true;
    ed.setSaving(true);
    try {
      const res = await fetch(`${API}/sales-invoices/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const r = await res.json().catch(() => ({}));
      /* Billing past the order's value (freight, an extra) is asked, not refused. */
      if (res.status === 409 && r.needsConfirm) {
        ed.setSaving(false);
        if (await confirm({ title: r.error, message: 'Bill it anyway?', confirmLabel: 'Bill it anyway' })) return save(true);
        return;
      }
      if (!res.ok) { ed.setError(r.error || 'Could not save the invoice'); ed.setSaving(false); return; }
      /* The page shows what the server stored — and so do the print and the PDF. */
      await load();
      ed.stop();
      toast.success(`${r.invoice_number || inv.invoice_number} saved — the print and PDF show the change`);
    } catch (e) {
      ed.setError(`Could not save: ${e.message}`);
      ed.setSaving(false);
    }
  };
  const cancelEdit = async () => { if (await confirmDiscard(ed, confirm)) ed.stop(); };

  /* A draft moved to another customer takes that customer's addresses,
     GSTIN and place of supply, as the invoice form does. */
  const pickCustomer = (cid) => {
    const c = (customers || []).find(x => String(x.id) === String(cid));
    if (!c) return;
    ed.merge({
      customer_id: c.id,
      bill_to_name: str(c.name), bill_to_address: str(c.billing_address), bill_to_gstin: str(c.gstin), bill_to_state: str(c.state),
      ship_to_name: str(c.name), ship_to_address: str(c.shipping_address || c.billing_address), ship_to_gstin: str(c.gstin), ship_to_state: str(c.shipping_state || c.state),
      place_of_supply_code: stateCode(c.shipping_state) || stateCode(c.state) || stateCode(c.gstin) || d.place_of_supply_code,
    });
  };
  const scope = isDraft
    ? 'A draft: change anything on it — the number, dates, customer, addresses, place of supply, lines, discount, GST and notes. Totals update as you type.'
    : 'Issued: the due date, e-way bill, notes and terms can still change. To change lines, amounts or the customer, '
      + (canReopen ? 'reopen it as a draft first (nothing has been received yet).' : 'raise a credit or debit note — that is how GST corrects an issued invoice.');

  /* Spelled from the total on the page, not the text stored when the
     invoice was raised: invoices raised before the 8 Oct fix still carry
     "Rupees undefined Hundred…" in that column. While a draft is being
     edited, from the total as it now stands. */
  const words = amountInWords(lt ? lt.net : inv.net_amount);

  /* The totals block, once, for the page and the PDF. Amount received and
     balance due appear once money has come in; an unpaid invoice reads
     exactly as before. */
  const half = Number(inv.gst_rate) / 2;
  /* Rule 46: the taxable value — after any discount — is a particular of
     the invoice. With no discount it is the sub-total, so it is labelled so. */
  const taxable = Math.round((Number(inv.sub_total || 0) - Number(inv.discount || 0)) * 100) / 100;
  const gstTotal = Math.round((Number(inv.cgst || 0) + Number(inv.sgst || 0) + Number(inv.igst || 0)) * 100) / 100;
  /* Reverse charge: the GST is shown, but the recipient pays it to the
     government, so it comes off what they pay us. (Invoices raised before
     this was fixed keep the total they were issued with.) */
  const rcm = !!inv.reverse_charge && Math.abs(Number(inv.net_amount) - (taxable + Number(inv.round_off || 0))) < 0.01;
  const totalRows = [
    Number(inv.discount) ? { label: 'SUB-TOTAL', value: rup(inv.sub_total) } : null,
    Number(inv.discount) ? { label: 'DISCOUNT', value: `-${rup(inv.discount)}` } : null,
    { label: 'TAXABLE VALUE', value: rup(taxable) },
    /* Rule 46(i): the RATE of tax is a particular of the invoice, not just
       the amount. */
    ...(inv.interstate
      ? [{ label: `IGST @ ${inv.gst_rate}%`, value: rup(inv.igst) }]
      : [{ label: `CGST @ ${half}%`, value: rup(inv.cgst) }, { label: `SGST @ ${half}%`, value: rup(inv.sgst) }]),
    rcm ? { label: 'LESS: GST ON REVERSE CHARGE', value: `-${rup(gstTotal)}` } : null,
    Number(inv.round_off) ? { label: 'ROUND OFF', value: rup(inv.round_off) } : null,
    { label: 'INVOICE TOTAL', value: rup(inv.net_amount), strong: true },
    ...(paid > 0 || credited > 0 ? [
      credited > 0 ? { label: 'LESS: CREDIT NOTES', value: `-${rup(credited)}` } : null,
      paid > 0 ? { label: 'AMOUNT RECEIVED', value: `-${rup(paid)}` } : null,
      { label: 'BALANCE DUE', value: rup(due), strong: true },
    ] : []),
  ].filter(Boolean);
  const bankRows = hasBank ? [
    co.bank_account_name && ['Account Name', co.bank_account_name],
    ['Bank', co.bank_name], ['Account No.', co.bank_account_no], ['IFSC', co.bank_ifsc],
    co.bank_branch && ['Branch', co.bank_branch], co.upi_id && ['UPI', co.upi_id],
  ].filter(Boolean) : [];

  /* Rule 46 requires these. A missing field can invalidate the buyer's Input
     Tax Credit claim, which means the invoice comes back unpaid. Warn here,
     on screen, rather than letting the customer's accounts team find it. */
  const gaps = [
    !co.gstin && 'Your GSTIN (set it in Company Profile)',
    !inv.place_of_supply && 'Place of supply',
    !billTo.address && "Customer's billing address",
    !hasBank && 'Your bank details (Company Profile) — the customer cannot pay without them',
    (() => { const n = inv.items.map((it, i) => (String(it.hsn || '').trim() ? null : i + 1)).filter(Boolean); return n.length ? `HSN/SAC code on line${n.length > 1 ? 's' : ''} ${n.join(', ')}` : null; })(),
  ].filter(Boolean);

  /* A draft is not a tax invoice yet, and says so on paper: printed as a
     real one, it could be sent before it was issued. An issued invoice
     carries which of its three copies this is. Status is the seller's
     business and stays on screen. */
  const docTitle = isDraft ? 'Draft Invoice' : 'Tax Invoice';
  const subtitle = isDraft ? 'DRAFT — NOT A VALID TAX INVOICE UNTIL ISSUED' : isCancelled ? 'CANCELLED' : copy;
  const subtitleTone = isDraft || isCancelled ? 'warn' : undefined;

  /* What the PDF says — the same values as the page above it. */
  const pdfModel = () => ({
    fileName, title: docTitle.toUpperCase(), subtitle, subtitleTone, number: inv.invoice_number, framed: true, company: co,
    meta: [['Invoice #', inv.invoice_number], ['Date', date], dueDate && ['Due', dueDate]],
    parties: [
      { title: 'Bill To', name: billTo.name, lines: [billTo.address, billTo.state], gstin: billTo.gstin || '' },
      { title: 'Ship To', note: differentShipTo ? '' : '(same as billing)', name: shipTo.name, lines: [shipTo.address, shipTo.state], gstin: shipTo.gstin || undefined },
    ],
    facts: [
      ['Place of Supply', `${inv.place_of_supply || '—'}${inv.place_of_supply_code ? ` (${inv.place_of_supply_code})` : ''}`],
      ['Reverse Charge', inv.reverse_charge ? 'Yes' : 'No'],
      inv.eway_bill_no && ['E-Way Bill', inv.eway_bill_no],
      inv.customer_order_id && ['Order Ref', inv.order?.order_number || `#${inv.customer_order_id}`],
      inv.order?.customer_po_ref && ['Your PO', inv.order.customer_po_ref],
    ],
    columns: [
      { key: 'index', label: '#' }, { key: 'description', label: 'Description' }, { key: 'hsn', label: 'HSN/SAC' },
      { key: 'uom', label: 'UOM', align: 'center' }, { key: 'quantity', label: 'Qty', align: 'right' },
      { key: 'rate', label: 'Rate', align: 'right' }, { key: 'amount', label: 'Amount', align: 'right', strong: true },
    ],
    boldDescription: true,
    rows: inv.items.map((it, i) => [String(i + 1), it.description, it.hsn || '-', it.uom || '', String(it.quantity ?? ''), rup(it.rate), rup(it.amount)]),
    notes: inv.notes, totals: totalRows, words: `Amount in Words: ${words}`,
    bank: bankRows.length ? { title: 'Bank Details for Payment', rows: bankRows } : null,
    terms: terms ? { text: terms } : null, irn: inv.irn, declaration: isDraft ? null : DECLARATION,
    footerLeft: co.invoice_footer_note || '',
    footerRight: `${inv.invoice_number}  |  ${date}`,
  });
  /* A real file, saved in one click — lib/documentPdf.js says why it is
     laid out there rather than printed. */
  const pdf = async () => {
    setMaking(true);
    try { await downloadDocumentPdf(pdfModel()); }
    catch (e) { toast.error(`Could not make the PDF: ${e?.message || e}`); throw e; }
    finally { setMaking(false); }
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 40 }}>
      {/* Toolbar */}
      <div className="print:hidden" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => navigate('/sales-invoices')} className="inv-act-btn"><ArrowLeft size={15} /> All Invoices</button>
        {/* While the sheet is being edited, its bar below has Save and
            Cancel, and printing waits: what prints is what was saved. */}
        {!ed.editing && !hist.viewing && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', whiteSpace: 'nowrap' }}>
          <HistoryButton hist={hist} className="inv-act-btn" />
          {/* Edit, here on the invoice itself. A draft: all of it. Issued:
              its notes, terms, due date and e-way bill. */}
          {!isCancelled && canWrite && (
            <button onClick={() => begin()} data-doc-edit className={`inv-act-btn${isDraft ? ' primary' : ''}`}
              title={isDraft ? 'Change anything on this draft, right here on the invoice' : 'Change the due date, e-way bill, notes or terms'}>
              <Pencil size={15} /> Edit invoice
            </button>
          )}
          {canReopen && (
            <button onClick={reopen} className="inv-act-btn" title="Take it back to draft to change the number, date, lines or anything else">
              <Pencil size={15} /> Reopen as draft
            </button>
          )}
          {statusChoices.length ? (
            <select value={inv.status} onChange={e => setStatus(e.target.value)} aria-label="Invoice status" style={{ width: 'auto', flex: 'none', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.8rem' }}>
              {/* An older invoice marked Paid by hand with nothing received
                  still shows what it says until it is put right. */}
              {!statusChoices.includes(inv.status) && <option value={inv.status} disabled>{inv.status}</option>}
              {statusChoices.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <span aria-label="Invoice status" title={isCancelled ? 'Cancelled — kept for its number, no longer owed' : 'Set by the payments recorded against it'}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: isCancelled ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: 700, fontSize: '0.8rem' }}>
              {inv.status}
            </span>
          )}
          {/* Which of the three copies prints — chosen here, off the paper. */}
          {!isDraft && !isCancelled && <CopyPicker kind="invoice" value={copy} onChange={setCopy} />}
          <button onClick={() => pdf().catch(() => {})} disabled={making} className="inv-act-btn" title={`Saves ${fileName}.pdf`}><Download size={15} /> {making ? 'Making PDF…' : 'Download PDF'}</button>
          {/* Sending it was the missing step: an invoice could be produced
              and printed, and there was no way to get it to the customer
              without leaving the product. */}
          <button onClick={() => setEmailing(true)} className="inv-act-btn"><Mail size={15} /> Email</button>
          {/* The invoice says to correct it with a credit note; this is the
              way there, with the invoice, customer, lines and rate carried. */}
          {!isDraft && !isCancelled && can('credit-debit-notes', 'write') && (
            <button onClick={() => navigate(`/credit-debit-notes?invoice=${inv.id}`)} data-raise-credit-note className="inv-act-btn"><FileMinus size={15} /> Credit note</button>
          )}
          <button onClick={() => printAs(fileName)} className="inv-act-btn primary"><Printer size={15} /> Print</button>
        </div>
        )}
      </div>

      <HistoryPanel hist={hist} what={`Invoice ${inv.invoice_number}`} />
      <VersionBar hist={hist} onPrint={() => printAs(fileName)}>
        <button onClick={() => pdf().catch(() => {})} disabled={making} className="btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={15} /> {making ? 'Making PDF…' : 'PDF of this version'}</button>
      </VersionBar>
      {ed.editing && (
        <EditBar ed={ed} what={inv.invoice_number} scope={scope} problems={problems} onSave={() => save()} onCancel={cancelEdit} />
      )}

      {/* The order behind this invoice is billed more than it was ordered —
          invoices raised twice before the check existed. */}
      {inv.overBilled && (
        <div className="print:hidden" role="alert" data-over-billed style={{ display: 'flex', gap: 10, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.35)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
          <AlertTriangle size={17} style={{ flex: 'none', color: '#dc2626', marginTop: 1 }} />
          <div>
            <b>Order {inv.overBilled.orderNumber} is invoiced more than it was ordered</b>, on {inv.overBilled.invoices.join(', ')}:
            {' '}₹{Math.round(inv.overBilled.billedValue).toLocaleString('en-IN')} invoiced against ₹{Math.round(inv.overBilled.orderedValue).toLocaleString('en-IN')} ordered (before tax).
            {inv.overBilled.lines.length > 0 && ' '}{inv.overBilled.lines.slice(0, 3).map(l => `“${l.description}”: ordered ${Number(l.ordered).toLocaleString('en-IN')}, invoiced ${Number(l.billed).toLocaleString('en-IN')}`).join('; ')}
            {inv.overBilled.lines.length > 3 ? ` and ${inv.overBilled.lines.length - 3} more` : ''}{inv.overBilled.lines.length > 0 ? '.' : ''}
            {' '}Keep the right invoice and cancel or delete the others.
          </div>
        </div>
      )}

      {isCancelled && (
        <div className="print:hidden" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
          <Ban size={16} style={{ flex: 'none' }} /> This invoice is cancelled. It keeps its number, and it is not owed.
        </div>
      )}

      {/* Payment status banner */}
      <div className="print:hidden" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: '1 1 200px', minWidth: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Invoice Total</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>₹{rup(inv.net_amount)}</div>
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Received</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>₹{rup(paid)}</div>
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Balance Due</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: due > 0 ? '#ef4444' : '#10b981', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>₹{rup(due)}</div>
        </div>
      </div>

      {/* Record payment — not while the invoice itself is being edited. */}
      {due > 0 && !ed.editing && !hist.viewing && (
        <div className="print:hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 14, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', flexBasis: '100%' }}><IndianRupee size={16} style={{ color: 'var(--brand-amber)' }} /> Record payment</div>
          {/* Explicit widths: the global form styles make a bare select or
              date input fill the row, which stacked this line into four. */}
          <input style={{ ...input, width: 120, flex: 'none' }} type="number" placeholder="Amount" aria-label="Payment amount" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} />
          <select style={{ ...input, width: 145, flex: 'none' }} aria-label="Payment mode" value={pay.mode} onChange={e => setPay({ ...pay, mode: e.target.value })}>{PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}</select>
          <input style={{ ...input, width: 'auto', flex: '1 1 140px', minWidth: 120 }} placeholder="Reference / UTR" aria-label="Payment reference" value={pay.reference} onChange={e => setPay({ ...pay, reference: e.target.value })} />
          <span style={{ display: 'flex', gap: 10, flex: 'none' }}>
            <input style={{ ...input, width: 150, flex: 'none' }} type="date" aria-label="Payment date" value={pay.paidDate} onChange={e => setPay({ ...pay, paidDate: e.target.value })} />
            <button onClick={() => recordPayment()} disabled={paying} data-add-payment className="btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }}><Plus size={14} /> {paying ? 'Saving…' : 'Add'}</button>
          </span>
        </div>
      )}

      {/* What has been received, one line each, and the way back for a
          receipt typed against the wrong invoice or a cheque that bounced. */}
      {(inv.payments || []).length > 0 && (
        <div className="print:hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: 6 }}>Payments received</div>
          {inv.payments.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border-subtle)', fontSize: '0.84rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>₹{rup(p.amount)}</span>
              <span style={{ color: 'var(--text-muted)', minWidth: 0, overflowWrap: 'anywhere', flex: '1 1 160px' }}>
                {fmt(p.paid_date || p.created_at)} · {p.mode || 'Bank'}{p.reference ? ` · ${p.reference}` : ''}
              </span>
              {can('sales-invoices', 'delete') && (
                <button onClick={() => reversePayment(p)} className="inv-act-btn" title="Remove this payment and put the balance back on the invoice"
                  style={{ padding: '5px 10px', fontSize: '0.78rem' }}>
                  <Undo2 size={13} /> Reverse
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Compliance warning — screen only, never printed */}
      {gaps.length > 0 && (
        <div className="print:hidden" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700, fontSize: '0.88rem' }}>
            <AlertTriangle size={16} /> {gaps.length} field{gaps.length > 1 ? 's' : ''} missing — this invoice may be rejected
          </div>
          <ul style={{ margin: '6px 0 0 20px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {gaps.map(g => <li key={g}>{g}</li>)}
          </ul>
        </div>
      )}

      {/* Document. On a phone it scrolls sideways in its own box (print.css). */}
      <div className="doc-scroll">
      <div ref={ref} className="invoice-mock" data-editing={ed.editing ? 'true' : undefined} onClick={onSheetClick(ed, begin)}>
        <div className="inv-header">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <CompanyLogo fallbackUrl={co.logo_url || null} height={44} />
            <div>
              <div className="inv-company-name">{co.name || '—'}</div>
              <div className="inv-company-detail">
                {co.address}{co.address && <br />}
                {co.gstin && <>GSTIN: <strong>{co.gstin}</strong>{co.stateCode || co.pan ? ' · ' : <br />}</>}
                {co.stateCode && <>State Code: <strong>{co.stateCode}</strong>{co.pan ? ' · ' : <br />}</>}
                {co.pan && <>PAN: <strong>{co.pan}</strong><br /></>}
                {co.cin && <>CIN: <strong>{co.cin}</strong><br /></>}
                {co.udyam_msme_no && <>Udyam/MSME: <strong>{co.udyam_msme_no}</strong><br /></>}
                {co.phone && <>Ph: {co.phone}</>}{co.email && <> · {co.email}</>}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="inv-po-title">{docTitle}</div>
            <div className="doc-copy-label" data-doc-subtitle style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', color: subtitleTone ? '#b91c1c' : '#4b5563', margin: '1px 0 4px' }}>{subtitle}</div>
            {/* The number and date change while the invoice is a draft; once
                issued they are particulars of a tax document (Rule 46). The
                due date can move after issue — payment terms get agreed
                late — so it stays editable short of cancelled. */}
            <div className="inv-meta-row">Invoice #: {editable('invoice_number')
              ? <Field name="invoice_number" label="Invoice number" value={d.invoice_number} onChange={v => ed.set('invoice_number', v)}
                  invalid={shout(invoiceNumberProblem(d.invoice_number))} maxLength={24} style={{ width: 150, fontWeight: 700 }} />
              : <Spot field="invoice_number" on={spotOn('invoice_number')}><strong>{inv.invoice_number}</strong></Spot>}</div>
            <div className="inv-meta-row">Date: {editable('invoice_date')
              ? <Field type="date" name="invoice_date" label="Invoice date" value={d.invoice_date} onChange={v => ed.set('invoice_date', v)}
                  invalid={shout(!d.invoice_date)} style={{ fontWeight: 700 }} />
              : <Spot field="invoice_date" on={spotOn('invoice_date')}><strong>{date}</strong></Spot>}</div>
            <div className={`inv-meta-row${inv.due_date || ed.editing ? '' : ' print:hidden'}`}>Due: {editable('due_date')
              ? <Field type="date" name="due_date" label="Due date" value={d.due_date} onChange={v => ed.set('due_date', v)}
                  invalid={shout(dueBad)} style={{ fontWeight: 700 }} />
              : <Spot field="due_date" on={spotOn('due_date')}><strong style={{ color: overdue ? '#dc2626' : undefined }}>
                  {dueDate ? `${dueDate}${overdue ? ' (overdue)' : ''}` : <span className="print:hidden" style={{ color: '#6b7280', fontWeight: 400 }}>not set</span>}
                </strong></Spot>}</div>
          </div>
        </div>

        {/* Bill To / Ship To — separate parties. Under GST the tax split follows
            the place of supply (where goods go), not the billing address. */}
        <div className="inv-parties" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="inv-party">
            <div className="inv-party-title">Bill To</div>
            {editable('bill_to_name') ? (
              <div className="de-stack">
                {/* Another of this company's customers; an invoice raised from
                    an order stays with that order's customer. */}
                {customers && customers.length > 0 && !inv.customer_order_id && (
                  <Field as="select" name="customer_id" label="Customer" value={d.customer_id ?? ''} onChange={pickCustomer} className="de-screen">
                    {!customers.some(c => String(c.id) === String(d.customer_id)) && <option value={d.customer_id ?? ''}>{d.bill_to_name || 'This customer'}</option>}
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Field>
                )}
                <Field name="bill_to_name" label="Bill To name" placeholder="Name" value={d.bill_to_name} onChange={v => ed.set('bill_to_name', v)}
                  invalid={shout(!d.bill_to_name.trim())} style={{ fontWeight: 700 }} />
                <Field as="textarea" name="bill_to_address" label="Bill To address" placeholder="Billing address" minRows={2} value={d.bill_to_address} onChange={v => ed.set('bill_to_address', v)} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <Field name="bill_to_state" label="Bill To state" placeholder="State" value={d.bill_to_state} onChange={v => ed.set('bill_to_state', v)} />
                  <Field name="bill_to_gstin" label="Bill To GSTIN" placeholder="GSTIN (blank: unregistered)" mono maxLength={15}
                    value={d.bill_to_gstin} onChange={v => ed.set('bill_to_gstin', v.toUpperCase())} />
                </div>
              </div>
            ) : (
              <Spot field="bill_to_name" on={spotOn('bill_to_name')} block>
                <div className="inv-party-name">{billTo.name || '—'}</div>
                <div className="inv-party-detail doc-wrap">
                  {/* The line break comes either way: without it the warning ran into the
                      state ("Address missingTelangana"). */}
                  {billTo.address || <em className="print:hidden" style={{ color: '#dc2626' }}>Address missing</em>}{billTo.address && <br />}
                  {billTo.state && <>{billTo.state}<br /></>}
                  GSTIN: <strong>{billTo.gstin || 'Unregistered'}</strong>
                </div>
              </Spot>
            )}
          </div>
          <div className="inv-party">
            <div className="inv-party-title">Ship To {!d && !differentShipTo && <span style={{ fontWeight: 400, textTransform: 'none' }}>(same as billing)</span>}</div>
            {editable('ship_to_name') ? (
              <div className="de-stack">
                <Field name="ship_to_name" label="Ship To name" placeholder="Name" value={d.ship_to_name} onChange={v => ed.set('ship_to_name', v)} style={{ fontWeight: 700 }} />
                <Field as="textarea" name="ship_to_address" label="Ship To address" placeholder="Where the goods go" minRows={2} value={d.ship_to_address} onChange={v => ed.set('ship_to_address', v)} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <Field name="ship_to_state" label="Ship To state" placeholder="State" value={d.ship_to_state} onChange={v => ed.set('ship_to_state', v)} />
                  <Field name="ship_to_gstin" label="Ship To GSTIN" placeholder="GSTIN" mono maxLength={15}
                    value={d.ship_to_gstin} onChange={v => ed.set('ship_to_gstin', v.toUpperCase())} />
                </div>
              </div>
            ) : (
              <Spot field="ship_to_name" on={spotOn('ship_to_name')} block>
                <div className="inv-party-name">{shipTo.name || '—'}</div>
                <div className="inv-party-detail doc-wrap">
                  {shipTo.address && <>{shipTo.address}<br /></>}
                  {!shipTo.address && !shipTo.state && '—'}
                  {shipTo.state && <>{shipTo.state}<br /></>}
                  {shipTo.gstin && <>GSTIN: <strong>{shipTo.gstin}</strong></>}
                </div>
              </Spot>
            )}
          </div>
        </div>

        {/* Rule 46 fields that must appear on the face of the invoice */}
        <div className="inv-facts" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: '8px 22px', fontSize: '0.78rem', borderBottom: '1px solid #e5e7eb' }}>
          {editable('place_of_supply_code') ? (
            <span className="de-inline">Place of Supply:
              <Field as="select" name="place_of_supply_code" label="Place of supply" value={d.place_of_supply_code} onChange={v => ed.set('place_of_supply_code', v)} style={{ width: 'auto', fontWeight: 700 }}>
                <option value="">— not set —</option>
                {GST_STATES.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}
              </Field>
              <span className="de-hint">{liveInter ? 'IGST' : 'CGST + SGST'}</span>
            </span>
          ) : (
            <Spot field="place_of_supply_code" on={spotOn('place_of_supply_code')}>
              Place of Supply: <strong>{inv.place_of_supply || <em className="print:hidden" style={{ color: '#dc2626' }}>not set</em>}</strong>{inv.place_of_supply_code ? ` (${inv.place_of_supply_code})` : ''}
            </Spot>
          )}
          {editable('reverse_charge') ? (
            <span className="de-inline">Reverse Charge:
              <Field as="select" name="reverse_charge" label="Reverse charge" value={d.reverse_charge ? 'yes' : 'no'} onChange={v => ed.set('reverse_charge', v === 'yes')} style={{ width: 'auto', fontWeight: 700 }}>
                <option value="no">No</option><option value="yes">Yes</option>
              </Field>
            </span>
          ) : (
            <Spot field="reverse_charge" on={spotOn('reverse_charge')}>Reverse Charge: <strong>{inv.reverse_charge ? 'Yes' : 'No'}</strong></Spot>
          )}
          {editable('eway_bill_no') ? (
            <span className="de-inline">E-Way Bill:
              <Field name="eway_bill_no" label="E-way bill number" placeholder="12-digit number" mono maxLength={20} value={d.eway_bill_no}
                onChange={v => ed.set('eway_bill_no', v)} style={{ width: 150, fontWeight: 700 }} />
            </span>
          ) : (
            <span className={inv.eway_bill_no ? undefined : 'print:hidden'}>
              <Spot field="eway_bill_no" on={spotOn('eway_bill_no')}>E-Way Bill: <strong>{inv.eway_bill_no || <span style={{ color: '#6b7280', fontWeight: 400 }}>{spotOn('eway_bill_no') ? 'add' : '—'}</span>}</strong></Spot>
            </span>
          )}
          {inv.customer_order_id && <span>Order Ref: <strong><Link to={`/customer-orders?open=${inv.customer_order_id}`} data-invoice-order-link style={{ color: 'inherit' }}>{inv.order?.order_number || `#${inv.customer_order_id}`}</Link></strong></span>}
          {inv.order?.customer_po_ref && <span>Your PO: <strong>{inv.order.customer_po_ref}</strong></span>}
        </div>

        <div className="inv-items-table">
          <table className="doc-items">
            <thead><tr><th style={{ width: '6%' }}>#</th><th style={{ width: '42%' }}>DESCRIPTION</th><th>HSN/SAC</th><th>UOM</th><th style={num}>QTY</th><th style={num}>RATE</th><th style={num}>AMOUNT</th></tr></thead>
            {editAll ? (
              <tbody>
                {d.items.map((it, i) => {
                  const bad = lp.rows.has(i) || zeroQty.has(i);
                  return (
                    <tr key={i} className={shout(bad) ? 'de-row-bad' : undefined}>
                      <td style={{ textAlign: 'center' }}>{i + 1}</td>
                      <td><Field as="textarea" name={`line-${i}-description`} label={`Line ${i + 1} description`} placeholder="Item or service"
                        value={it.description} onChange={v => ed.setItem(i, { description: v })} invalid={shout(lp.rows.has(i))} style={{ fontWeight: 600 }} /></td>
                      <td><Field name={`line-${i}-hsn`} label={`Line ${i + 1} HSN`} inputMode="numeric" maxLength={8} mono
                        value={it.hsn} onChange={v => ed.setItem(i, { hsn: v.replace(/[^\d]/g, '') })} style={{ width: 76 }} /></td>
                      <td><UnitSelect className="de-in" value={it.uom} onChange={v => ed.setItem(i, { uom: v })} ariaLabel={`Line ${i + 1} unit`} style={{ width: 82 }} /></td>
                      <td style={num}><Field type="number" min="0" step="any" inputMode="decimal" name={`line-${i}-quantity`} label={`Line ${i + 1} quantity`}
                        value={it.quantity} onChange={v => ed.setItem(i, { quantity: v })} invalid={shout(zeroQty.has(i))} align="right" style={{ width: 70 }} /></td>
                      <td style={num}><Field type="number" min="0" step="any" inputMode="decimal" name={`line-${i}-rate`} label={`Line ${i + 1} rate`}
                        value={it.rate} onChange={v => ed.setItem(i, { rate: v })} align="right" mono style={{ width: 96 }} /></td>
                      <td style={{ ...num, fontWeight: 600 }}>
                        {rup(lt.amounts[i])}
                        <button type="button" className="de-remove" onClick={() => ed.removeItem(i)} aria-label={`Remove line ${i + 1}`} title="Remove this line"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ) : (
              <tbody>
                {inv.items.map((it, i) => (
                  /* A click on a line opens the editor at that line. */
                  <tr key={it.id} {...(spotOn('items') ? { 'data-de-field': `line-${i}-description`, className: 'de-spot', title: 'Click to edit' } : {})}>
                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                    <td className="doc-wrap"><ItemText text={it.description} /></td>
                    <td>{it.hsn || '-'}</td><td>{it.uom}</td><td style={num}>{it.quantity}</td>
                    <td style={num}>{rup(it.rate)}</td>
                    <td style={{ ...num, fontWeight: 600 }}>{rup(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            )}
            <FillRows cols={7} />
          </table>
          {editAll && (
            <div style={{ padding: '0 22px' }}>
              <button type="button" className="de-add-line" onClick={() => ed.addItem(blankLine())} data-de-add-line><Plus size={14} /> Add line</button>
            </div>
          )}
        </div>

        {/* Totals to footer: one block, never split across sheets and never
            starting one alone (print.css, .doc-closing). */}
        <div className="doc-closing">
        <div className="inv-totals-section">
          {editable('notes') ? (
            <div className="inv-notes" style={{ width: '48%' }}>
              <strong>Notes</strong>
              <Field as="textarea" name="notes" label="Notes" minRows={3} placeholder="Printed on the invoice, under the lines"
                value={d.notes} onChange={v => ed.set('notes', v)} />
            </div>
          ) : (
            <div className="inv-notes doc-wrap">
              <Spot field="notes" on={spotOn('notes')} block>
                {inv.notes ? <><strong>Notes</strong>{inv.notes}</> : (spotOn('notes') && <span className="print:hidden" style={{ color: '#6b7280' }}>+ Add notes</span>)}
              </Spot>
            </div>
          )}
          {editAll ? (
            /* The figures as they will be once saved: every row a draft can
               change is a field, and the rest follow as you type. */
            <table className="inv-totals-table" data-de-totals>
              <tbody>
                <tr><td className="tl">SUB-TOTAL</td><td className="tv">{rup(lt.subTotal)}</td></tr>
                <tr><td className="tl">DISCOUNT</td><td className="tv">
                  <Field type="number" min="0" step="any" inputMode="decimal" name="discount" label="Discount" placeholder="0.00" align="right"
                    value={d.discount} onChange={v => ed.set('discount', v)} invalid={shout(adj.discount)} style={{ width: 104 }} /></td></tr>
                <tr><td className="tl">TAXABLE VALUE</td><td className="tv">{rup(lt.taxable)}</td></tr>
                <tr className="print:hidden"><td className="tl">GST RATE %</td><td className="tv">
                  <Field type="number" min="0" max="100" step="any" inputMode="decimal" name="gst_rate" label="GST rate" list="de-gst-rates" align="right"
                    value={d.gst_rate} onChange={v => ed.set('gst_rate', v)} invalid={shout(gstBad)} style={{ width: 70 }} />
                  <datalist id="de-gst-rates">{GST_RATES.map(r => <option key={r} value={r} />)}</datalist></td></tr>
                {liveInter
                  ? <tr><td className="tl">IGST @ {Number(d.gst_rate) || 0}%</td><td className="tv">{rup(lt.igst)}</td></tr>
                  : <>
                      <tr><td className="tl">CGST @ {(Number(d.gst_rate) || 0) / 2}%</td><td className="tv">{rup(lt.cgst)}</td></tr>
                      <tr><td className="tl">SGST @ {(Number(d.gst_rate) || 0) / 2}%</td><td className="tv">{rup(lt.sgst)}</td></tr>
                    </>}
                {d.reverse_charge && <tr><td className="tl">LESS: GST ON REVERSE CHARGE</td><td className="tv">-{rup(lt.gstTotal)}</td></tr>}
                <tr><td className="tl">ROUND OFF</td><td className="tv">
                  <Field type="number" min="-1" max="1" step="0.01" inputMode="decimal" name="round_off" label="Round off" placeholder="0.00" align="right"
                    value={d.round_off} onChange={v => ed.set('round_off', v)} invalid={shout(adj.roundOff)} style={{ width: 80 }} /></td></tr>
                <tr className="tf"><td className="tl" style={{ color: '#000' }}>INVOICE TOTAL</td><td className="tv" style={{ color: '#000' }} data-de-total>{rup(lt.net)}</td></tr>
                {paid > 0 && <>
                  <tr><td className="tl">AMOUNT RECEIVED</td><td className="tv">-{rup(paid)}</td></tr>
                  <tr className="tf"><td className="tl" style={{ color: '#000' }}>BALANCE DUE</td><td className="tv" style={{ color: '#000' }}>{rup(Math.max(0, lt.net - paid))}</td></tr>
                </>}
              </tbody>
            </table>
          ) : (
            <Spot field="discount" on={spotOn('discount')} block>
              <table className="inv-totals-table">
                <tbody>
                  {totalRows.map(r => (
                    <tr key={r.label} className={r.strong ? 'tf' : undefined}>
                      <td className="tl" style={r.strong ? { color: '#000' } : undefined}>{r.label}</td>
                      <td className="tv" style={r.strong ? { color: '#000' } : undefined}>{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Spot>
          )}
        </div>

        <div className="inv-amount-words">Amount in Words: {words}</div>

        {/* Bank details — without these the customer literally cannot pay.
            minmax(0, …): a long word in the terms widened its column until
            the bank box was squeezed to a sliver. */}
        <div className="inv-bank-terms" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 16, margin: '14px 22px 0' }}>
          <div className={hasBank ? undefined : 'print:hidden'} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>Bank Details for Payment</div>
            {hasBank ? (
              <table style={{ fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                <tbody>
                  {co.bank_account_name && <tr><td style={{ paddingRight: 10, color: '#6b7280' }}>Account Name</td><td><strong>{co.bank_account_name}</strong></td></tr>}
                  <tr><td style={{ paddingRight: 10, color: '#6b7280' }}>Bank</td><td><strong>{co.bank_name}</strong></td></tr>
                  <tr><td style={{ paddingRight: 10, color: '#6b7280' }}>Account No.</td><td><strong>{co.bank_account_no}</strong></td></tr>
                  <tr><td style={{ paddingRight: 10, color: '#6b7280' }}>IFSC</td><td><strong>{co.bank_ifsc}</strong></td></tr>
                  {co.bank_branch && <tr><td style={{ paddingRight: 10, color: '#6b7280' }}>Branch</td><td>{co.bank_branch}</td></tr>}
                  {co.upi_id && <tr><td style={{ paddingRight: 10, color: '#6b7280' }}>UPI</td><td>{co.upi_id}</td></tr>}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: '0.78rem', color: '#dc2626' }}>Not configured — add them in Company Profile.</div>
            )}
          </div>

          <div>
            {/* Reserved for the e-invoice QR. The IRN and signed QR come back
                from the government IRP; we never mint them ourselves. */}
            {inv.irn && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px', marginBottom: 10 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280' }}>IRN</div>
                <div style={{ fontSize: '0.62rem', wordBreak: 'break-all' }}>{inv.irn}</div>
              </div>
            )}
            {editable('terms') ? (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 }}>Terms &amp; Conditions</div>
                <Field as="textarea" name="terms" label="Terms" minRows={3} value={d.terms} onChange={v => ed.set('terms', v)}
                  placeholder={co.invoice_terms ? 'Left empty, your standard terms from Company Profile print' : 'Payment terms, delivery, warranty…'} style={{ fontSize: '0.72rem' }} />
              </div>
            ) : terms ? (
              <Spot field="terms" on={spotOn('terms')} block>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 }}>Terms &amp; Conditions</div>
                  <div className="doc-wrap" style={{ fontSize: '0.72rem', color: '#374151', whiteSpace: 'pre-wrap' }}>{terms}</div>
                </div>
              </Spot>
            ) : spotOn('terms') && (
              <Spot field="terms" on block><span className="print:hidden" style={{ fontSize: '0.78rem', color: '#6b7280' }}>+ Add terms &amp; conditions</span></Spot>
            )}
          </div>
        </div>

        {!isDraft && <Declaration />}
        <div className="inv-sig">
          <div>
            <div className="inv-sig-line"></div>
            <div className="inv-sig-label">Authorized Signatory</div>
            <div className="inv-sig-company mt-2">For {co.name || '—'}</div>
          </div>
        </div>
        {/* Only the company's own footer note (Company Profile), if it wrote one. */}
        {co.invoice_footer_note && (
          <div className="inv-footer">
            <div className="inv-footer-left">{co.invoice_footer_note}</div>
            <div className="inv-footer-right">{inv.invoice_number} &nbsp;|&nbsp; {date}</div>
          </div>
        )}
        </div>
      </div>
      </div>

      {/* Anything that belongs with this invoice — the customer's PO, a
          signed copy, proof of delivery. Never printed. */}
      <div className="print:hidden" style={{ marginTop: 16 }}>
        <Attachments entityType="sales_invoice" entityId={id} label="Documents for this invoice" compact />
      </div>

      {emailing && (
        <EmailDocumentModal
          kind="invoice"
          number={inv.invoice_number}
          to={inv.customer?.email}
          partyName={inv.customer?.contact_name || inv.customer?.name}
          company={co}
          amount={inv.net_amount}
          extra={[
            ['Already paid', paid > 0 ? `₹${rup(paid)}` : null],
            ['Balance due', paid > 0 ? `₹${rup(due)}` : null],
            ['Payable by', inv.due_date],
          ]}
          onClose={() => setEmailing(false)}
          /* The same PDF the toolbar produces, so what is attached is
             exactly what was on screen. */
          onDownloadPdf={pdf}
          fileName={`${fileName}.pdf`}
        />
      )}
    </div>
  );
}
