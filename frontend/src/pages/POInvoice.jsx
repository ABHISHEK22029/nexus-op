import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Download, Mail } from 'lucide-react';
import axios from 'axios';
import { useProject } from '../context/ProjectContext';
import html2pdf from 'html2pdf.js';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const POInvoice = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeProject } = useProject();
  
  const [po, setPo] = useState(null);
  const [items, setItems] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const invoiceRef = useRef(null);

  useEffect(() => {
    const fetchInvoiceData = async () => {
      try {
        const [poRes, itemsRes, compRes] = await Promise.all([
          axios.get(`${API}/po/${id}`),
          axios.get(`${API}/po/${id}/items`),
          axios.get(`${API}/company-profile`)
        ]);
        
        setPo(poRes.data);
        setItems(itemsRes.data);
        setCompany(compRes.data);
      } catch (err) {
        console.error("Failed to load invoice", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInvoiceData();
  }, [id]);

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

  const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  
  // Determine GST Split
  const isIntraState = po.vendorGstin && po.vendorGstin.substring(0, 2) === company.stateCode;
  const sgst = isIntraState ? subtotal * 0.09 : 0;
  const cgst = isIntraState ? subtotal * 0.09 : 0;
  const igst = !isIntraState ? subtotal * 0.18 : 0;
  const tax = sgst + cgst + igst;
  const total = subtotal + tax;

  const handleDownloadPdf = () => {
    const element = invoiceRef.current;
    const opt = {
      margin:       0,
      filename:     `${(po.poNumber || `PO-${po.id}`).replace(/\//g, '_')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  const handlePrint = () => {
    window.print();
  };

  const poDate = new Date(po.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto pb-16">
      {/* Action Bar */}
      <div className="flex justify-between items-center mb-6 print:hidden">
        <button onClick={() => navigate('/purchase-orders')} className="inv-act-btn">
          <ArrowLeft size={16} /> Back to POs
        </button>
        <div className="flex items-center gap-3">
          <button className="inv-act-btn">
            <Mail size={16} /> Email Vendor
          </button>
          <button onClick={handleDownloadPdf} className="inv-act-btn">
            <Download size={16} /> PDF
          </button>
          <button onClick={handlePrint} className="inv-act-btn primary">
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {/* Invoice Document Wrapper */}
      <div ref={invoiceRef} className="invoice-mock print:m-0 print:rounded-none print:shadow-none">
        
        {/* Header */}
        <div className="inv-header">
          <div>
            <div className="inv-company-name">{company.name}</div>
            <div className="inv-company-detail">
              {company.address}<br/>
              GSTIN: <strong>{company.gstin}</strong> | PAN: {company.pan}<br/>
              Ph: {company.phone}
            </div>
            <div className="mt-3 text-xs">
              <span className="text-gray-500 uppercase tracking-wider font-bold text-[10px]">Project Scope</span><br/>
              <strong style={{ color: '#111', fontSize: '13px' }}>{po.projectName}</strong><br/>
              <span className="text-gray-600">Client: {po.clientName}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="inv-po-title">Purchase Order</div>
            <div className="inv-meta-row">P.O. #: <strong>{po.poNumber || `Kirashi-PO-${po.id}`}</strong></div>
            <div className="inv-meta-row">Date: <strong>{poDate}</strong></div>
            {po.quoteRef && <div className="inv-meta-row">Quote Ref: <strong>{po.quoteRef}</strong></div>}
            <div className="inv-meta-row">Status: <strong>{po.status}</strong></div>
          </div>
        </div>

        {/* Three-Party Block */}
        <div className="inv-parties">
          <div className="inv-party">
            <div className="inv-party-title">Vendor</div>
            <div className="inv-party-name">{po.vendorName}</div>
            <div className="inv-party-detail">
              {po.vendorAddress || 'Address not provided'}<br/>
              Contact: {po.contactName} {po.contactPhone ? `(${po.contactPhone})` : ''}<br/>
              GST: <strong>{po.vendorGstin || 'Unregistered'}</strong>
            </div>
          </div>
          <div className="inv-party">
            <div className="inv-party-title">Ship To (Project Site)</div>
            <div className="inv-party-name">{po.projectName}</div>
            <div className="inv-party-detail">
              Client: <strong>{po.clientName}</strong><br/>
              Site Address / Store<br/>
              (As per Project Specs)
            </div>
          </div>
          <div className="inv-party">
            <div className="inv-party-title">Bill To (Corporate)</div>
            <div className="inv-party-name">{company.name}</div>
            <div className="inv-party-detail">
              {company.address}<br/>
              GST: <strong>{company.gstin}</strong>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="inv-items-table">
          <table>
            <thead>
              <tr>
                <th style={{width: '5%'}}>#</th>
                <th style={{width: '40%'}}>DESCRIPTION</th>
                <th style={{width: '10%'}}>UOM</th>
                <th style={{width: '10%'}}>HSN/SAC</th>
                <th style={{width: '10%'}}>QTY</th>
                <th style={{width: '12%'}}>UNIT PRICE</th>
                <th style={{width: '13%'}}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id || idx}>
                  <td style={{textAlign: 'center'}}>{item.sno}</td>
                  <td style={{fontWeight: 600}}>{item.description}</td>
                  <td>{item.uom}</td>
                  <td>{item.hsn || '-'}</td>
                  <td>{item.quantity}</td>
                  <td style={{fontFamily: 'var(--font-mono)'}}>{Number(item.unitPrice).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                  <td style={{fontFamily: 'var(--font-mono)', fontWeight: 600}}>
                    {(item.quantity * item.unitPrice).toLocaleString('en-IN', {minimumFractionDigits:2})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="inv-totals-section">
          <div className="inv-notes">
            <strong>Other Comments or Special Instructions</strong>
            Payment Terms:<br/>{po.paymentTerms || 'Net 30 Days'}<br/><br/>
            Note: Standard deduction of 5% applies towards retention/quality assurance unless overridden.
          </div>
          
          <table className="inv-totals-table">
            <tbody>
              <tr>
                <td className="tl">SUBTOTAL</td>
                <td className="tv">{subtotal.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
              </tr>
              {isIntraState ? (
                <>
                  <tr>
                    <td className="tl">SGST - 9%</td>
                    <td className="tv">{sgst.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                  </tr>
                  <tr>
                    <td className="tl">CGST - 9%</td>
                    <td className="tv">{cgst.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td className="tl">IGST - 18%</td>
                  <td className="tv">{igst.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                </tr>
              )}
              <tr>
                <td className="tl">TAX</td>
                <td className="tv">{tax.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
              </tr>
              <tr className="tf">
                <td className="tl" style={{color: '#000'}}>PO VALUE</td>
                <td className="tv" style={{color: '#000'}}>{total.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Amount in Words */}
        <div className="inv-amount-words">
          Amount in Words: {po.amountInWords || 'Not calculated'}
        </div>

        {/* Terms Grid */}
        <div className="inv-terms-grid">
          <div className="inv-term-cell">
            <div className="inv-term-header">Price</div>
            <div className="inv-term-value">{po.priceBasis}</div>
          </div>
          <div className="inv-term-cell">
            <div className="inv-term-header">P&F, Insurance</div>
            <div className="inv-term-value">{po.pnfInsurance}</div>
          </div>
          <div className="inv-term-cell">
            <div className="inv-term-header">Loading & Unloading</div>
            <div className="inv-term-value">{po.loadingScope}</div>
          </div>
          <div className="inv-term-cell">
            <div className="inv-term-header">Warranty / Terms</div>
            <div className="inv-term-value">{po.warranty}</div>
          </div>
        </div>

        {/* Signature */}
        <div className="inv-sig">
          <div>
            <div className="inv-sig-line"></div>
            <div className="inv-sig-label">Authorized by<br/>Date</div>
            <div className="inv-sig-company mt-2">{company.name}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="inv-footer">
          <div className="inv-footer-left">
            Generated by Nexus-OP Platform
          </div>
          <div className="inv-footer-right">
            {po.poNumber || `Kirashi-PO-${po.id}`} &nbsp;|&nbsp; {poDate}
          </div>
        </div>

      </div>
    </div>
  );
};

export default POInvoice;
