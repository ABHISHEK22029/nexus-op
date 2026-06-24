import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Download } from 'lucide-react';
import axios from 'axios';
import html2pdf from 'html2pdf.js';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function RABillInvoice() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bill, setBill] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [b, c] = await Promise.all([
          axios.get(`${API}/bills/${id}`),
          axios.get(`${API}/company-profile`),
        ]);
        setBill(b.data);
        setCompany(c.data);
      } catch (e) {
        console.error('Failed to load bill', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const downloadPdf = () => {
    html2pdf().set({
      margin: 0,
      filename: `${(bill.bill_number || `RA-${bill.id}`).replace(/\//g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(ref.current).save();
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#555' }}>Loading invoice…</div>;
  if (!bill || !company) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <p style={{ marginBottom: 16, color: '#555' }}>Bill not found.</p>
      <button onClick={() => navigate('/bills')} className="btn-primary">Back to Bills</button>
    </div>
  );

  const items = bill.lineItems || [];
  const intra = (bill.cgst || 0) > 0;
  const invoiceValue = (bill.sub_total || 0) + (bill.gst_total || 0);
  const totalDeductions = (bill.tds || 0) + (bill.gst_tds || 0) + (bill.labour_cess || 0)
    + (bill.retention || 0) + (bill.advance_recovery || 0) + (bill.other_deductions || 0);

  return (
    <div className="ra-screen">
      <style>{RA_CSS}</style>

      {/* toolbar (hidden on print/pdf) */}
      <div className="ra-toolbar no-print">
        <button onClick={() => navigate('/bills')}><ArrowLeft size={16} /> Back</button>
        <div className="ra-tb-right">
          <span className={`ra-badge st-${(bill.status || '').replace(/\s/g, '')}`}>{bill.status}</span>
          <button onClick={() => window.print()}><Printer size={16} /> Print</button>
          <button className="primary" onClick={downloadPdf}><Download size={16} /> Download PDF</button>
        </div>
      </div>

      {/* A4 document */}
      <div className="ra-page" ref={ref}>
        <div className="ra-doc">

          {/* Title bar */}
          <div className="ra-title">RUNNING ACCOUNT BILL&nbsp;·&nbsp;TAX INVOICE</div>

          {/* Header: supplier + meta */}
          <div className="ra-head">
            <div className="ra-head-l">
              <div className="ra-co">{company.name}</div>
              {company.tradeName && <div className="ra-co-sub">({company.tradeName})</div>}
              <div className="ra-addr">{company.address}</div>
              <div className="ra-addr">Ph: {company.phone} &nbsp;·&nbsp; {company.email}</div>
              <div className="ra-gst"><b>GSTIN:</b> {company.gstin} &nbsp; <b>PAN:</b> {company.pan} &nbsp; <b>State:</b> {company.stateCode}</div>
            </div>
            <table className="ra-meta">
              <tbody>
                <tr><td>Bill No.</td><td>{bill.bill_number || `RA-${bill.id}`}</td></tr>
                <tr><td>RA No.</td><td>{bill.ra_number || '—'}</td></tr>
                <tr><td>Bill Date</td><td>{fmtDate(bill.bill_date || bill.date)}</td></tr>
                <tr><td>Project</td><td>{bill.projectName || '—'}</td></tr>
                <tr><td>Work Order</td><td>{bill.workOrderName || '—'}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Bill-to (contractor / vendor) */}
          <div className="ra-party">
            <div className="ra-party-h">BILL TO — CONTRACTOR</div>
            <div className="ra-party-b">
              <div className="ra-party-name">{bill.vendorName || '—'}</div>
              {bill.vendorAddress && <div>{bill.vendorAddress}</div>}
              <div>
                {bill.vendorGstin && <span><b>GSTIN:</b> {bill.vendorGstin}&nbsp;&nbsp;</span>}
                {bill.vendorPan && <span><b>PAN:</b> {bill.vendorPan}</span>}
              </div>
              <div><b>Place of Supply:</b> {company.stateCode} ({intra ? 'Intra-State' : 'Inter-State'})</div>
            </div>
          </div>

          {/* Line items */}
          <table className="ra-items">
            <thead>
              <tr>
                <th className="c">Sr.</th>
                <th>Description of Work</th>
                <th className="c">HSN/SAC</th>
                <th className="c">Unit</th>
                <th className="r">Qty</th>
                <th className="r">Rate (₹)</th>
                <th className="r">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((li, i) => (
                <tr key={li.id || i}>
                  <td className="c">{i + 1}</td>
                  <td>{li.description}</td>
                  <td className="c">{li.hsn_code || '9954'}</td>
                  <td className="c">{li.unit}</td>
                  <td className="r">{inr(li.quantity).replace('.00', '')}</td>
                  <td className="r">{inr(li.rate)}</td>
                  <td className="r">{inr(li.amount)}</td>
                </tr>
              ))}
              {/* filler rows for a formal look */}
              {Array.from({ length: Math.max(0, 4 - items.length) }).map((_, i) => (
                <tr key={`f${i}`} className="filler"><td className="c">&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="ra-sub">
                <td colSpan={6} className="r">Taxable Value</td>
                <td className="r">{inr(bill.sub_total)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Tax + words + summary */}
          <div className="ra-foot">
            <div className="ra-foot-l">
              <div className="ra-words"><span>Amount Chargeable (in words):</span><b>{bill.amount_in_words}</b></div>
              <table className="ra-tax">
                <tbody>
                  {intra ? (
                    <>
                      <tr><td>CGST @ {(bill.gst_rate || 18) / 2}%</td><td className="r">{inr(bill.cgst)}</td></tr>
                      <tr><td>SGST @ {(bill.gst_rate || 18) / 2}%</td><td className="r">{inr(bill.sgst)}</td></tr>
                    </>
                  ) : (
                    <tr><td>IGST @ {bill.gst_rate || 18}%</td><td className="r">{inr(bill.igst)}</td></tr>
                  )}
                </tbody>
              </table>
              <div className="ra-decl">
                <b>Declaration:</b> We declare that this invoice shows the actual price of the work
                described and that all particulars are true and correct. Certified that the work has been
                measured and recorded in the Measurement Book.
              </div>
            </div>

            <table className="ra-summary">
              <tbody>
                <tr><td>Taxable Value</td><td className="r">{inr(bill.sub_total)}</td></tr>
                {intra ? (
                  <>
                    <tr><td>Add: CGST @ {(bill.gst_rate || 18) / 2}%</td><td className="r">{inr(bill.cgst)}</td></tr>
                    <tr><td>Add: SGST @ {(bill.gst_rate || 18) / 2}%</td><td className="r">{inr(bill.sgst)}</td></tr>
                  </>
                ) : (
                  <tr><td>Add: IGST @ {bill.gst_rate || 18}%</td><td className="r">{inr(bill.igst)}</td></tr>
                )}
                <tr className="ra-inv"><td>Invoice Value</td><td className="r">{inr(invoiceValue)}</td></tr>
                <tr className="ded-h"><td colSpan={2}>Less: Deductions</td></tr>
                <tr><td>TDS {bill.tds_section ? `(${bill.tds_section})` : ''} @ {bill.tds_rate || 0}%</td><td className="r">{inr(bill.tds)}</td></tr>
                {(bill.gst_tds || 0) > 0 && <tr><td>TDS under GST @ {bill.gst_tds_rate || 0}%</td><td className="r">{inr(bill.gst_tds)}</td></tr>}
                {(bill.labour_cess || 0) > 0 && <tr><td>Labour Cess @ {bill.labour_cess_rate || 0}%</td><td className="r">{inr(bill.labour_cess)}</td></tr>}
                <tr><td>Retention @ {bill.retention_pct || 0}%</td><td className="r">{inr(bill.retention)}</td></tr>
                {(bill.advance_recovery || 0) > 0 && <tr><td>Advance Recovery</td><td className="r">{inr(bill.advance_recovery)}</td></tr>}
                {(bill.other_deductions || 0) > 0 && <tr><td>Other{bill.deduction_reason ? ` (${bill.deduction_reason})` : ''}</td><td className="r">{inr(bill.other_deductions)}</td></tr>}
                <tr className="ded-t"><td>Total Deductions</td><td className="r">{inr(totalDeductions)}</td></tr>
                <tr className="ra-net"><td>NET PAYABLE</td><td className="r">₹ {inr(bill.netAmount)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* signatures */}
          <div className="ra-sign">
            <div className="ra-sign-c"><div className="ra-sign-line"></div>Prepared By</div>
            <div className="ra-sign-c"><div className="ra-sign-line"></div>Checked By</div>
            <div className="ra-sign-c">
              <div className="ra-sign-line"></div>
              For <b>{company.name}</b><br />Authorised Signatory
            </div>
          </div>

          <div className="ra-end">
            This is a computer-generated Running Account Bill &middot; {bill.bill_number || `RA-${bill.id}`} &middot;
            generated by Nexus-OP on {fmtDate(new Date().toISOString())}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── refined professional BLACK & WHITE invoice ───────────── */
const RA_CSS = `
.ra-screen{min-height:100vh;background:#e9e9ec;padding:24px 16px 60px;font-family:'Inter',system-ui,sans-serif;}
.ra-toolbar{max-width:210mm;margin:0 auto 16px;display:flex;justify-content:space-between;align-items:center;}
.ra-toolbar button{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #cfcfd6;border-radius:7px;padding:9px 16px;font-size:13px;font-weight:600;color:#1a1a1a;cursor:pointer;transition:.15s;}
.ra-toolbar button:hover{border-color:#4b5563;}
.ra-toolbar button.primary{background:#4b5563;color:#fff;border-color:#4b5563;}
.ra-tb-right{display:flex;gap:10px;align-items:center;}
.ra-badge{font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:5px 12px;border-radius:30px;border:1px solid #cfcfd6;color:#444;background:#fff;}
.st-Draft{color:#7a5b00;border-color:#e3c97a;background:#fdf6e3;}
.st-UnderReview{color:#1d4ed8;border-color:#9db8f5;background:#eef3ff;}
.st-Approved{color:#0f7a3d;border-color:#9bd6b3;background:#eafaf0;}
.st-Paid{color:#fff;background:#4b5563;border-color:#4b5563;}
.st-Rejected{color:#b42318;border-color:#f0b4ad;background:#fdecea;}

.ra-page{max-width:210mm;margin:0 auto;}
.ra-doc{background:#fff;color:#111;width:100%;min-height:297mm;padding:14mm 13mm;box-shadow:0 10px 40px rgba(0,0,0,.18);
  font-size:12px;line-height:1.45;border:1px solid #000;}
.ra-doc *{box-sizing:border-box;}

.ra-title{text-align:center;font-weight:800;letter-spacing:2px;font-size:14px;border:1.5px solid #000;
  padding:8px;margin-bottom:0;text-transform:uppercase;background:#4b5563;color:#fff;}

.ra-head{display:flex;border:1px solid #000;border-top:0;}
.ra-head-l{flex:1.5;padding:12px 14px;border-right:1px solid #000;}
.ra-co{font-size:17px;font-weight:800;letter-spacing:.2px;}
.ra-co-sub{font-size:11px;color:#333;margin-bottom:4px;}
.ra-addr{font-size:11px;color:#222;}
.ra-gst{font-size:11px;margin-top:6px;}
.ra-meta{flex:1;border-collapse:collapse;font-size:11.5px;}
.ra-meta td{border-bottom:1px solid #000;padding:6px 10px;}
.ra-meta tr:last-child td{border-bottom:0;}
.ra-meta td:first-child{font-weight:700;width:42%;border-right:1px solid #000;background:#f4f4f5;}

.ra-party{border:1px solid #000;border-top:0;}
.ra-party-h{font-size:10px;font-weight:800;letter-spacing:1px;background:#f4f4f5;padding:5px 14px;border-bottom:1px solid #000;}
.ra-party-b{padding:9px 14px;font-size:11.5px;}
.ra-party-name{font-weight:800;font-size:13px;}

.ra-items{width:100%;border-collapse:collapse;border:1px solid #000;border-top:0;}
.ra-items th{background:#4b5563;color:#fff;font-size:10.5px;letter-spacing:.4px;text-transform:uppercase;
  padding:8px 8px;text-align:left;border-right:1px solid #444;}
.ra-items th.r{text-align:right;}.ra-items th.c{text-align:center;}
.ra-items td{border-right:1px solid #000;border-top:1px solid #000;padding:7px 8px;vertical-align:top;font-size:11.5px;}
.ra-items td.r{text-align:right;font-variant-numeric:tabular-nums;}
.ra-items td.c{text-align:center;}
.ra-items td:last-child,.ra-items th:last-child{border-right:0;}
.ra-items tr.filler td{height:22px;color:transparent;}
.ra-items tfoot .ra-sub td{border-top:1.5px solid #000;font-weight:800;font-size:12.5px;background:#f4f4f5;}

.ra-foot{display:flex;border:1px solid #000;border-top:0;}
.ra-foot-l{flex:1.35;border-right:1px solid #000;padding:0;display:flex;flex-direction:column;}
.ra-words{padding:10px 12px;border-bottom:1px solid #000;font-size:11.5px;}
.ra-words span{display:block;color:#555;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;}
.ra-words b{font-weight:700;}
.ra-tax{width:100%;border-collapse:collapse;}
.ra-tax td{padding:6px 12px;border-bottom:1px solid #000;font-size:11.5px;}
.ra-tax td.r{text-align:right;font-variant-numeric:tabular-nums;}
.ra-decl{padding:10px 12px;font-size:10px;color:#333;line-height:1.5;}

.ra-summary{flex:1;border-collapse:collapse;align-self:flex-start;width:100%;}
.ra-summary td{padding:6px 12px;border-bottom:1px solid #000;font-size:11.5px;}
.ra-summary td.r{text-align:right;font-variant-numeric:tabular-nums;}
.ra-summary tr.ra-inv td{font-weight:800;background:#f4f4f5;}
.ra-summary tr.ded-h td{font-size:9.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#555;background:#fafafa;}
.ra-summary tr.ded-t td{font-weight:700;}
.ra-summary tr.ra-net td{background:#4b5563;color:#fff;font-weight:800;font-size:14px;border-bottom:0;}

.ra-sign{display:flex;border:1px solid #000;border-top:0;}
.ra-sign-c{flex:1;padding:30px 14px 10px;text-align:center;font-size:11px;border-right:1px solid #000;}
.ra-sign-c:last-child{border-right:0;}
.ra-sign-line{border-top:1px solid #000;margin:0 10px 6px;}

.ra-end{text-align:center;font-size:9.5px;color:#666;padding:8px;border:1px solid #000;border-top:0;letter-spacing:.3px;}

@media print{
  .no-print{display:none !important;}
  .ra-screen{background:#fff;padding:0;}
  .ra-doc{box-shadow:none;border:1px solid #000;}
  @page{size:A4;margin:8mm;}
}
`;
