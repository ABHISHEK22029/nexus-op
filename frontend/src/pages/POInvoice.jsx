import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Download, Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import axios from 'axios';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { usePermissions } from '../context/PermissionContext';
import { amountInWords } from '../lib/amountInWords';
import EmailDocumentModal from '../components/EmailDocumentModal';
import Attachments from '../components/Attachments';
import UnitSelect from '../components/UnitSelect';
import { ItemText, FillRows } from '../components/DocumentKit';
import { useDocEdit, EditBar, Field, Spot, onSheetClick, confirmDiscard } from '../components/DocEdit';
import { useDocHistory, HistoryButton, HistoryPanel, VersionBar } from '../components/DocHistory';
import { GST_RATES } from '../lib/docTotals';
import { lineProblems } from '../lib/lineChecks';
import { docFileName, printAs } from '../lib/documentPdf';
import { stateCode } from '../lib/gstStates';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const fmtMoney = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* Editing on the page (components/DocEdit). Before sign-off ("Pending"):
   the lines, the GST rate, the vendor's quote reference and the terms.
   After: the quote reference and the terms only — words, not money; the
   amounts are what was signed off (PATCH /po/:id, POST /po/:id/items). */
const TERM_KEYS = ['quoteRef', 'paymentTerms', 'priceBasis', 'pnfInsurance', 'loadingScope', 'warranty'];
const TERM_LABELS = { priceBasis: 'Price', pnfInsurance: 'P&F, Insurance', loadingScope: 'Loading & Unloading', warranty: 'Warranty / Terms' };
const str = (v) => (v == null ? '' : String(v));
const numStr = (v) => (v == null || v === '' ? '' : String(Number(v)));
const blankLine = () => ({ description: '', uom: 'nos', hsn: '', quantity: '', unitPrice: '', rawMaterialId: null, skuId: null });

function poValues(po, items) {
  return {
    ...Object.fromEntries(TERM_KEYS.map(k => [k, str(po[k])])),
    gstRate: numStr(po.gst_rate ?? 18),
    /* the material or product a line is, carried back when it is saved */
    items: items.map(it => ({ description: str(it.description), uom: str(it.uom || 'nos'), hsn: str(it.hsn), quantity: numStr(it.quantity), unitPrice: numStr(it.unitPrice), rawMaterialId: it.raw_material_id ?? null, skuId: it.sku_id ?? null })),
  };
}

const POInvoice = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeProject } = useProject();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { can } = usePermissions();
  const ed = useDocEdit();

  const [po, setPo] = useState(null);
  const [items, setItems] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const invoiceRef = useRef(null);
  const [emailing, setEmailing] = useState(false);

  const fetchInvoiceData = async () => {
    try {
      const [poRes, itemsRes] = await Promise.all([
        axios.get(`${API}/po/${id}`),
        axios.get(`${API}/po/${id}/items`),
      ]);
      const p = poRes.data;
      setPo(p);
      /* A PO raised from a material shortfall or a customer order has its
         item on the order itself and no separate lines — and printed an
         empty table with a total of 0.00. Show the order's own line. */
      setItems(itemsRes.data?.length ? itemsRes.data : (p.itemName ? [{
        sno: 1, description: p.itemName, uom: p.uom || "No's", hsn: p.hsn || '',
        quantity: Number(p.quantity) || 0, unitPrice: Number(p.unitPrice) || 0,
      }] : []));
      /* The letterhead comes with the PO now; /company-profile is only a
         fallback, and one that Sales and Procurement may not read. */
      let comp = p.company;
      if (!comp) comp = await axios.get(`${API}/company-profile`).then(r => r.data).catch(() => ({}));
      setCompany(comp || {});
    } catch (err) {
      console.error("Failed to load invoice", err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchInvoiceData(); /* eslint-disable-next-line */ }, [id]);

  const canWrite = can('po', 'write');
  /* Every change kept; an earlier version shown here, as it was. */
  const hist = useDocHistory({
    path: 'po', id, reload: () => fetchInvoiceData(),
    apply: ({ items: lines, vendor, ...row }) => { setPo(cur => ({ ...cur, ...row })); if (Array.isArray(lines) && lines.length) setItems(lines); },
  });
  const begin = (field) => { if (po && canWrite && !hist.viewing) ed.start(poValues(po, items), field); };

  if (loading) {
    return <div className="flex justify-center items-center h-64 text-gray-500">Loading document...</div>;
  }

  if (!po || !company) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-gray-400 mb-4">Purchase Order not found.</p>
        <button onClick={() => navigate('/purchase-orders')} className="btn-primary">Back to List</button>
      </div>
    );
  }

  /* ── Editing on the page ── */
  const pending = po.status === 'Pending';
  const d = ed.editing ? ed.draft : null;
  const editAll = !!d && pending;
  const editable = (k) => !!d && (pending || TERM_KEYS.includes(k));
  const spotOn = (k) => !ed.editing && !hist.viewing && canWrite && (pending || TERM_KEYS.includes(k));
  const shownItems = editAll ? d.items : items;
  const lp = editAll ? lineProblems(d.items.map(it => ({ ...it, rate: it.unitPrice }))) : null;
  const zeroQty = editAll ? new Set(d.items.map((it, i) => (String(it.description).trim() && !(Number(it.quantity) > 0) ? i : -1)).filter(i => i >= 0)) : new Set();

  /* Each line in paise, and the subtotal from those: 1,234.567 printed with
     three decimals, and the lines didn't add up to the subtotal. */
  const lineAmount = (item) => round2(Number(item.quantity) * Number(item.unitPrice));
  const subtotal = round2(shownItems.reduce((acc, item) => acc + lineAmount(item), 0));

  // GST rate comes from the PO (whatever the user entered) — never hardcoded.
  const gstRate = editAll ? (Number(d.gstRate) || 0) : Number(po.gst_rate ?? po.gstRate ?? 18);

  // Intra vs inter-state: derived from vendor GSTIN vs company state — the SAME
  // rule the GRN bill uses, so the two documents classify GST identically.
  const companyState = String(company.stateCode || (company.gstin || '').substring(0, 2) || '');
  /* The vendor's state from their GSTIN, else from their address record.
     With neither, the same state is assumed (most suppliers are local) and
     the screen says so — it used to fall to IGST. */
  const vendorState = String(po.vendorGstin || '').substring(0, 2) || stateCode(po.vendorState) || '';
  const isIntraState = !vendorState || !companyState || vendorState === companyState;
  const stateGuessed = !vendorState || !companyState;

  const gstTotal = round2(subtotal * gstRate / 100);
  const sgst = isIntraState ? round2(gstTotal / 2) : 0;
  const cgst = isIntraState ? round2(gstTotal - sgst) : 0;   // keep cgst+sgst == gstTotal exactly
  const igst = isIntraState ? 0 : gstTotal;
  const tax = round2(sgst + cgst + igst);
  const total = round2(subtotal + tax);
  const halfRate = round2(gstRate / 2);

  const gstBad = editAll && (d.gstRate === '' || !(Number(d.gstRate) >= 0 && Number(d.gstRate) <= 100));
  const problems = !d ? [] : [
    ...(lp ? lp.list : []),
    editAll && lp.kept.length === 0 && 'Add at least one line item.',
    editAll && zeroQty.size > 0 && `Every line needs a quantity above zero (line ${[...zeroQty].map(i => i + 1).join(', ')}).`,
    editAll && d.items.some(it => String(it.description).trim() && Number(it.unitPrice) < 0) && 'A unit price cannot be negative.',
    gstBad && 'Set a GST rate between 0 and 100.',
  ].filter(Boolean);
  const shout = (bad) => ed.tried && !!bad;

  /* Lines first (the step more likely to be refused), then the PO's own
     particulars; then the page reloads what the server holds. */
  const save = async () => {
    if (!d || ed.saving) return;
    if (problems.length) { ed.setTried(true); return; }
    const head = {};
    for (const k of ed.changed(pending ? [...TERM_KEYS, 'gstRate'] : TERM_KEYS)) head[k] = k === 'gstRate' ? (Number(d[k]) || 0) : (String(d[k] ?? '').trim() || null);
    const linesChanged = pending && ed.changed(['items']).length > 0;
    if (!linesChanged && !Object.keys(head).length) { ed.stop(); toast.info('Nothing was changed'); return; }
    ed.setSaving(true);
    try {
      let gate = null;
      if (linesChanged) {
        const lines = d.items.filter(it => String(it.description).trim() || Number(it.quantity) || Number(it.unitPrice))
          .map((it, i) => ({ sno: i + 1, description: it.description.trim(), uom: it.uom || 'nos', hsn: String(it.hsn || '').trim() || null, quantity: Number(it.quantity) || 0, unitPrice: Number(it.unitPrice) || 0, rawMaterialId: it.rawMaterialId, skuId: it.skuId }));
        const r = await axios.post(`${API}/po/${id}/items`, lines);
        gate = r.data;
      }
      if (Object.keys(head).length) await axios.patch(`${API}/po/${id}`, head);
      await fetchInvoiceData();
      ed.stop();
      toast.success(`${po.poNumber || `PO-${po.id}`} saved — the print shows the change`);
      if (gate?.approvalStatus === 'Pending Approval') toast.warning('Its value is over your sign-off limit, so it waits for approval again.');
    } catch (e) {
      ed.setError(e.response?.data?.error || `Could not save: ${e.message}`);
      ed.setSaving(false);
    }
  };
  const cancelEdit = async () => { if (await confirmDiscard(ed, confirm)) ed.stop(); };
  const scope = pending
    ? 'Before sign-off: the lines, GST rate, the vendor’s quote reference and the terms can all change. Totals update as you type.'
    : `${po.status}: the quote reference and the terms can still change. The amounts are what was signed off — raise a new PO to order more.`;

  /* Print-to-PDF, named for what it is: "Purchase Order PO-0012 - Vendor". */
  const fileName = docFileName('Purchase Order', po.poNumber || `PO-${po.id}`, po.vendorName);
  const handleDownloadPdf = () => { printAs(fileName); };

  const handlePrint = () => {
    printAs(fileName);
  };

  const poDate = new Date(po.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  /* Only the terms someone set; the whole grid goes when there are none.
     While editing, all four, to be filled in. */
  const termCells = Object.keys(TERM_LABELS).map(k => [k, TERM_LABELS[k], po[k]])
    .filter(([k, , v]) => editable(k) || String(v || '').trim());
  const vendorLines = [po.vendorAddress, [po.vendorCity, po.vendorState].filter(Boolean).join(', ')].filter(Boolean);

  return (
    /* The padding the app's own pages have (16px on a phone, 28px wider):
       this screen is outside that frame, and .doc-scroll reaches into that
       padding with negative margins — without it the page scrolled sideways. */
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto pb-16"
      style={{ padding: '0 clamp(16px, 4vw, 28px) 64px' }}>
      {/* Action Bar */}
      <div className="flex flex-wrap gap-3 justify-between items-center mb-6 print:hidden">
        <button onClick={() => navigate('/purchase-orders')} className="inv-act-btn">
          <ArrowLeft size={16} /> Back to POs
        </button>
        {!ed.editing && !hist.viewing && (
        <div className="flex flex-wrap items-center gap-3">
          <HistoryButton hist={hist} className="inv-act-btn" />
          <span className="doc-status-pill" data-doc-status>{po.status}</span>
          {canWrite && (
            <button onClick={() => begin()} data-doc-edit className="inv-act-btn" title={pending ? 'Change the lines, GST and terms, right here on the PO' : 'Change the quote reference or the terms'}>
              <Pencil size={16} /> Edit PO
            </button>
          )}
          {/* This button had no onClick at all — it rendered, it looked
              like the others, and clicking it did nothing. */}
          <button onClick={() => setEmailing(true)} className="inv-act-btn">
            <Mail size={16} /> Email Vendor
          </button>
          <button onClick={handleDownloadPdf} className="inv-act-btn">
            <Download size={16} /> PDF
          </button>
          <button onClick={handlePrint} className="inv-act-btn primary">
            <Printer size={16} /> Print
          </button>
        </div>
        )}
      </div>

      <HistoryPanel hist={hist} what={`Purchase order ${po.poNumber || `PO-${po.id}`}`} />
      <VersionBar hist={hist} onPrint={handlePrint} />
      {ed.editing && <EditBar ed={ed} what={po.poNumber || `PO-${po.id}`} scope={scope} problems={problems} onSave={save} onCancel={cancelEdit} />}

      {/* Screen only: what the tax on this PO rests on, when it is a guess. */}
      {(stateGuessed || !po.vendorGstin) && (
        <div className="print:hidden" data-po-tax-note style={{ fontSize: '0.8rem', color: '#b45309', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          {!po.vendorGstin && <>This vendor has no GSTIN on file. If they are unregistered they cannot charge GST: the order would be worth {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} without it. </>}
          {stateGuessed && <>The vendor's state isn't known, so CGST + SGST is assumed. Add their GSTIN or state to the vendor record to be sure.</>}
        </div>
      )}

      {/* Invoice Document Wrapper */}
      <div className="doc-scroll">
      <div ref={invoiceRef} className="invoice-mock print:m-0 print:rounded-none print:shadow-none" data-editing={ed.editing ? 'true' : undefined} onClick={onSheetClick(ed, begin)}>

        {/* Header */}
        <div className="inv-header">
          <div>
            <div className="inv-company-name">{company.name}</div>
            <div className="inv-company-detail">
              {company.address}{company.address && <br/>}
              {/* Only what is on file: "GSTIN: | PAN:" and "Ph:" printed empty. */}
              {company.gstin && <>GSTIN: <strong>{company.gstin}</strong></>}
              {company.stateCode && <>{company.gstin ? ' · ' : ''}State Code: <strong>{company.stateCode}</strong></>}
              {company.pan && <>{company.gstin || company.stateCode ? ' · ' : ''}PAN: {company.pan}</>}
              {(company.gstin || company.stateCode || company.pan) && <br/>}
              {company.cin && <>CIN: <strong>{company.cin}</strong><br/></>}
              {company.phone && <>Ph: {company.phone}</>}{company.email && <>{company.phone ? ' · ' : ''}{company.email}</>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="inv-po-title">Purchase Order</div>
            <div className="inv-meta-row">P.O. #: <strong>{po.poNumber || `PO-${po.id}`}</strong></div>
            <div className="inv-meta-row">Date: <strong>{poDate}</strong></div>
            {editable('quoteRef')
              ? <div className="inv-meta-row">Quote Ref: <Field name="quoteRef" label="Vendor quote reference" value={d.quoteRef} onChange={v => ed.set('quoteRef', v)} maxLength={120} style={{ width: 150, fontWeight: 700 }} /></div>
              : po.quoteRef
                ? <div className="inv-meta-row"><Spot field="quoteRef" on={spotOn('quoteRef')}>Quote Ref: <strong>{po.quoteRef}</strong></Spot></div>
                : spotOn('quoteRef') && <div className="inv-meta-row print:hidden"><Spot field="quoteRef" on>Quote Ref: <span style={{ color: '#6b7280' }}>add</span></Spot></div>}
          </div>
        </div>

        {/* Three-Party Block */}
        <div className="inv-parties">
          <div className="inv-party">
            <div className="inv-party-title">Vendor</div>
            <div className="inv-party-name">{po.vendorName}</div>
            <div className="inv-party-detail">
              {vendorLines.length ? vendorLines.map((l, i) => <React.Fragment key={i}>{l}<br/></React.Fragment>)
                : <><em className="print:hidden" style={{ color: '#dc2626' }}>Address not on file</em><br className="print:hidden"/></>}
              {(po.contactName || po.contactPhone) && <>Contact: {po.contactName}{po.contactPhone ? ` (${po.contactPhone})` : ''}<br/></>}
              GSTIN: <strong>{po.vendorGstin || 'Unregistered'}</strong>
            </div>
          </div>
          <div className="inv-party">
            {/* Where the goods go. It printed "Site Address / Store (As per
                Project Specs)" — placeholder words, not an address. A PO for a
                project goes to that project; anything else to our own works. */}
            <div className="inv-party-title">{po.projectName ? 'Ship To (Project)' : 'Ship To'}</div>
            <div className="inv-party-name">{po.projectName || company.name}</div>
            <div className="inv-party-detail">
              {po.projectName
                ? <>{po.clientName && <>Client: <strong>{po.clientName}</strong><br/></>}Deliver to the project site, as instructed</>
                : <>{company.address}{company.gstin && <><br/>GSTIN: <strong>{company.gstin}</strong></>}</>}
            </div>
          </div>
          <div className="inv-party">
            <div className="inv-party-title">Bill To (Corporate)</div>
            <div className="inv-party-name">{company.name}</div>
            <div className="inv-party-detail">
              {company.address}<br/>
              {company.gstin && <>GSTIN: <strong>{company.gstin}</strong></>}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="inv-items-table">
          <table className="doc-items">
            <thead>
              <tr>
                <th style={{width: '5%'}}>#</th>
                <th style={{width: '40%'}}>DESCRIPTION</th>
                <th style={{width: '10%'}}>UOM</th>
                <th style={{width: '10%'}}>HSN/SAC</th>
                <th style={{width: '10%', textAlign: 'right'}}>QTY</th>
                <th style={{width: '12%', textAlign: 'right', whiteSpace: 'nowrap'}}>UNIT PRICE</th>
                <th style={{width: '13%', textAlign: 'right'}}>TOTAL</th>
              </tr>
            </thead>
            {editAll ? (
              <tbody>
                {d.items.map((it, i) => (
                  <tr key={i} className={shout(lp.rows.has(i) || zeroQty.has(i)) ? 'de-row-bad' : undefined}>
                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                    <td><Field as="textarea" name={`line-${i}-description`} label={`Line ${i + 1} description`} placeholder="What is being bought" value={it.description} onChange={v => ed.setItem(i, { description: v })} invalid={shout(lp.rows.has(i))} style={{ fontWeight: 600 }} /></td>
                    <td><UnitSelect className="de-in" value={it.uom} onChange={v => ed.setItem(i, { uom: v })} ariaLabel={`Line ${i + 1} unit`} style={{ width: 80 }} /></td>
                    <td><Field name={`line-${i}-hsn`} label={`Line ${i + 1} HSN`} inputMode="numeric" maxLength={8} value={it.hsn} onChange={v => ed.setItem(i, { hsn: v.replace(/[^\d]/g, '') })} style={{ width: 72 }} /></td>
                    <td style={num}><Field type="number" min="0" step="any" inputMode="decimal" name={`line-${i}-quantity`} label={`Line ${i + 1} quantity`} align="right" value={it.quantity} onChange={v => ed.setItem(i, { quantity: v })} invalid={shout(zeroQty.has(i))} style={{ width: 70 }} /></td>
                    <td style={num}><Field type="number" min="0" step="any" inputMode="decimal" name={`line-${i}-rate`} label={`Line ${i + 1} unit price`} align="right" value={it.unitPrice} onChange={v => ed.setItem(i, { unitPrice: v })} style={{ width: 92 }} /></td>
                    <td style={{ ...num, fontWeight: 600 }}>
                      {fmtMoney(lineAmount(it))}
                      <button type="button" className="de-remove" onClick={() => ed.removeItem(i)} aria-label={`Remove line ${i + 1}`} title="Remove this line"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.id || idx} {...(spotOn('items') ? { 'data-de-field': `line-${idx}-description`, className: 'de-spot', title: 'Click to edit' } : {})}>
                    <td style={{textAlign: 'center'}}>{item.sno}</td>
                    <td className="doc-wrap"><ItemText text={item.description} /></td>
                    <td>{item.uom}</td>
                    <td>{item.hsn || '-'}</td>
                    <td style={num}>{Number(item.quantity)}</td>
                    <td style={num}>{fmtMoney(item.unitPrice)}</td>
                    <td style={{ ...num, fontWeight: 600 }}>{fmtMoney(lineAmount(item))}</td>
                  </tr>
                ))}
              </tbody>
            )}
            <FillRows cols={7} />
          </table>
          {editAll && <div style={{ padding: '0 22px' }}><button type="button" className="de-add-line" onClick={() => ed.addItem(blankLine())} data-de-add-line><Plus size={14} /> Add line</button></div>}
        </div>

        {/* Totals to footer: kept whole, and never on a sheet by itself
            (print.css, .doc-closing). */}
        <div className="doc-closing">
        {/* Totals Section */}
        <div className="inv-totals-section">
          <div className="inv-notes" style={editable('paymentTerms') ? { width: '48%' } : undefined}>
            <strong>Other Comments or Special Instructions</strong>
            {/* Only when set: "Net 30 Days" printed for every PO without terms. */}
            {editable('paymentTerms')
              ? <div style={{ margin: '2px 0 8px' }}>Payment Terms:<Field name="paymentTerms" label="Payment terms" placeholder="e.g. 30 days from delivery" value={d.paymentTerms} onChange={v => ed.set('paymentTerms', v)} maxLength={200} /></div>
              : po.paymentTerms
                ? <Spot field="paymentTerms" on={spotOn('paymentTerms')} block>Payment Terms:<br/>{po.paymentTerms}<br/><br/></Spot>
                : spotOn('paymentTerms') && <Spot field="paymentTerms" on block><span className="print:hidden" style={{ color: '#6b7280' }}>+ Add payment terms<br/><br/></span></Spot>}
            Note: This is the <span style={{ fontWeight: 700 }}>ordered value</span>. The final payable is confirmed on the GRN bill after material is received (actual quantity + freight/charges).
          </div>

          <table className="inv-totals-table" data-de-totals={editAll ? true : undefined}>
            <tbody>
              <tr>
                <td className="tl">SUBTOTAL</td>
                <td className="tv">{subtotal.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
              </tr>
              {editAll && (
                <tr className="print:hidden"><td className="tl">GST RATE %</td><td className="tv">
                  <Field type="number" min="0" max="100" step="any" inputMode="decimal" name="gstRate" label="GST rate" list="de-po-gst" align="right" value={d.gstRate} onChange={v => ed.set('gstRate', v)} invalid={shout(gstBad)} style={{ width: 70 }} />
                  <datalist id="de-po-gst">{GST_RATES.map(r => <option key={r} value={r} />)}</datalist></td></tr>
              )}
              {isIntraState ? (
                <>
                  <tr>
                    <td className="tl">CGST - {halfRate}%</td>
                    <td className="tv">{cgst.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                  </tr>
                  <tr>
                    <td className="tl">SGST - {halfRate}%</td>
                    <td className="tv">{sgst.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td className="tl">IGST - {gstRate}%</td>
                  <td className="tv">{igst.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                </tr>
              )}
              <tr>
                <td className="tl">TAX</td>
                <td className="tv">{tax.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
              </tr>
              <tr className="tf">
                <td className="tl" style={{color: '#000'}}>PO VALUE (ORDERED)</td>
                <td className="tv" style={{color: '#000'}} data-de-total={editAll ? true : undefined}>{total.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Amount in Words */}
        <div className="inv-amount-words">
          {/* From the total on this page, always. The stored text was only
              ever written by one screen, and went stale when lines changed. */}
          Amount in Words: {amountInWords(total)}
        </div>

        {/* Terms Grid — only the terms that were set (all four while editing) */}
        {termCells.length > 0 && (
          <div className="inv-terms-grid" style={{ gridTemplateColumns: `repeat(${termCells.length}, 1fr)` }}>
            {termCells.map(([k, h, v]) => (
              <div className="inv-term-cell" key={k}>
                <div className="inv-term-header">{h}</div>
                <div className="inv-term-value">
                  {editable(k)
                    ? <Field name={k} label={h} value={d[k]} onChange={x => ed.set(k, x)} maxLength={200} />
                    : <Spot field={k} on={spotOn(k)}>{v}</Spot>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Signature */}
        <div className="inv-sig">
          <div>
            <div className="inv-sig-line"></div>
            <div className="inv-sig-label">Authorized by<br/>Date</div>
            <div className="inv-sig-company mt-2">{company.name}</div>
          </div>
        </div>

        {/* Footer */}
        {/* The business's own document, sent to its own vendor: its own
            footer line (Company Profile), if it wrote one — not ours. */}
        {company.invoice_footer_note && (
          <div className="inv-footer">
            <div className="inv-footer-left">{company.invoice_footer_note}</div>
            <div className="inv-footer-right">
              {po.poNumber || `PO-${po.id}`} &nbsp;|&nbsp; {poDate}
            </div>
          </div>
        )}
        </div>

      </div>
      </div>

      {/* The customer orders it was bought for — yours to know, not the
          vendor's, so on screen only. */}
      {po.forOrders?.length > 0 && (
        <div data-po-for className="print:hidden no-print" style={{ marginTop: 16, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
          Bought for{' '}
          {po.forOrders.map((o, i) => (
            <React.Fragment key={o.id}>{i > 0 && ', '}<Link to={`/customer-orders?open=${o.id}`} style={{ fontWeight: 700, color: 'var(--brand-amber)' }}>{o.orderNumber}</Link></React.Fragment>
          ))}
        </div>
      )}

      {/* Files that belong with this document — the vendor's quotation behind it, their acknowledgement. Never printed. */}
      <div className="print:hidden no-print" style={{ marginTop: 16 }}>
        <Attachments entityType="purchase_order" entityId={id} label="Documents" compact />
      </div>

      {emailing && (
        <EmailDocumentModal
          kind="po"
          number={po.poNumber || `PO-${po.id}`}
          to={po.contactEmail}
          partyName={po.contactName || po.vendorName}
          company={company}
          amount={po.netAmount ?? po.grandTotal}
          extra={[
            ['Item', po.itemName],
            ['Quantity', po.quantity],
            ['Payment terms', po.paymentTerms],
          ]}
          closing="Please confirm acceptance and the expected delivery date."
          onDownloadPdf={handleDownloadPdf}
          onClose={() => setEmailing(false)}
        />
      )}
    </div>
  );
};

export default POInvoice;
