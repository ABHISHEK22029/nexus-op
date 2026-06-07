import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Download, Mail } from 'lucide-react';
import axios from 'axios';
import { useProject } from '../context/ProjectContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const POInvoice = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeProject } = useProject();
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a real app we'd fetch a single PO by ID.
    // Our Node mock doesn't have GET /po/:id, so we fetch all and filter.
    if (!activeProject) return;
    
    axios.get(`${API}/po?projectId=${activeProject.id}`)
      .then(res => {
        const found = res.data.find(p => p.id === parseInt(id));
        setPo(found);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [id, activeProject]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500">
        Loading document...
      </div>
    );
  }

  if (!po) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-gray-400 mb-4">Purchase Order not found.</p>
        <button onClick={() => navigate('/purchase-orders')} className="btn-primary">
          Back to List
        </button>
      </div>
    );
  }

  // Generate rich sample items to make the invoice look professional
  const items = [];
  if (po.itemName === 'Earthwork Material') {
    items.push({ desc: 'Earthwork in excavation for roadway (Hard Soil)', qty: po.quantity, rate: 85 });
    items.push({ desc: 'Transportation & Disposal of excavated earth (Lead 5km)', qty: po.quantity, rate: 45 });
  } else if (po.itemName === 'Bitumen VG-30') {
    items.push({ desc: 'Bitumen VG-30 Bulk (Refinery grade)', qty: 1500, rate: 42000 });
    items.push({ desc: 'Bitumen Emulsion RS-1 (Tack Coat)', qty: 500, rate: 35000 });
  } else if (po.itemName === 'Dell PowerEdge R740') {
    items.push({ desc: 'Dell PowerEdge R740 Server Base (Dual Intel Xeon)', qty: 10, rate: 250000 });
    items.push({ desc: '64GB RDIMM, 3200MT/s Memory Modules', qty: 40, rate: 12000 });
    items.push({ desc: 'ProSupport Plus & Mission Critical 3 Yrs', qty: 10, rate: 45000 });
  } else {
    items.push({ desc: po.itemName, qty: po.quantity, rate: po.unitPrice || 5000 });
  }

  const subtotal = items.reduce((acc, item) => acc + (item.qty * item.rate), 0);
  const cgst = subtotal * 0.09;
  const sgst = subtotal * 0.09;
  const total = subtotal + cgst + sgst;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto pb-16">
      {/* Top Action Bar (Hidden on Print) */}
      <div className="flex justify-between items-center mb-6 print:hidden">
        <button 
          onClick={() => navigate('/purchase-orders')}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Back to POs
        </button>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1A1A1E] border border-white/10 text-gray-300 hover:bg-white/5 text-sm font-medium transition-colors">
            <Mail size={16} /> Email Vendor
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1A1A1E] border border-white/10 text-gray-300 hover:bg-white/5 text-sm font-medium transition-colors">
            <Download size={16} /> PDF
          </button>
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 text-sm font-medium transition-colors"
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {/* Invoice Document Wrapper */}
      <div className="bg-white text-[#1a1a1a] rounded-xl overflow-hidden shadow-2xl font-[var(--font-body)] print:shadow-none print:m-0 print:rounded-none">
        
        {/* Header */}
        <div className="flex justify-between items-start px-8 py-8 border-b-2" style={{ borderColor: 'hsl(22, 70%, 35%)' }}>
          <div>
            <div className="text-[17px] font-bold font-[var(--font-display)] mb-1" style={{ color: 'hsl(22, 70%, 35%)' }}>
              Kirashi Business Synergies Pvt. Ltd.
            </div>
            <div className="text-[12px] text-gray-600 leading-relaxed">
              A-12, Jubilee Hills, Hyderabad, Telangana 500033<br/>
              GSTIN: 36ABCDE1234F1Z5 | PAN: ABCDE1234F
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold uppercase tracking-wider mb-2 font-[var(--font-display)]" style={{ color: 'hsl(22, 70%, 35%)' }}>
              Purchase Order
            </div>
            <div className="text-[12px] text-gray-800 mb-1">
              PO Number: <strong style={{ color: 'hsl(22, 70%, 35%)' }}>NX-PO-{po.id.toString().padStart(4, '0')}</strong>
            </div>
            <div className="text-[12px] text-gray-800 mb-1">
              Date: <strong style={{ color: 'hsl(22, 70%, 35%)' }}>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
            </div>
            <div className="text-[12px] text-gray-800">
              Status: <strong style={{ color: 'hsl(22, 70%, 35%)' }}>{po.status}</strong>
            </div>
          </div>
        </div>

        {/* Parties Grid */}
        <div className="grid grid-cols-3 border border-gray-200 m-8 rounded-sm">
          <div className="p-4 border-r border-gray-200">
            <div className="text-[10px] text-gray-500 font-bold uppercase mb-1.5">Vendor</div>
            <div className="text-[13px] font-bold mb-1">{po.vendorName}</div>
            <div className="text-[11.5px] text-gray-600 leading-relaxed">
              Sector 3, Cyberabad<br/>
              Hyderabad, Telangana<br/>
              GSTIN: 36ZZZZA9999Z1Z9
            </div>
          </div>
          <div className="p-4 border-r border-gray-200">
            <div className="text-[10px] text-gray-500 font-bold uppercase mb-1.5">Ship To</div>
            <div className="text-[13px] font-bold mb-1">{activeProject?.name || 'Project Site'}</div>
            <div className="text-[11.5px] text-gray-600 leading-relaxed">
              Site Store #2<br/>
              Attn: Site Engineer<br/>
              {activeProject?.clientName || 'Internal Client'}
            </div>
          </div>
          <div className="p-4">
            <div className="text-[10px] text-gray-500 font-bold uppercase mb-1.5">Terms</div>
            <div className="text-[11.5px] text-gray-600 leading-relaxed">
              Payment: <strong>Net 30 Days</strong><br/>
              Delivery: <strong>Immediate</strong><br/>
              Freight: <strong>Included</strong>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full text-left border-collapse text-[12px] mt-4">
          <thead>
            <tr className="bg-gray-50 border-y border-gray-200">
              <th className="py-3 px-6 text-gray-600 font-semibold w-[5%]">#</th>
              <th className="py-3 px-6 text-gray-600 font-semibold w-[45%]">Item Description</th>
              <th className="py-3 px-6 text-gray-600 font-semibold text-right">Qty</th>
              <th className="py-3 px-6 text-gray-600 font-semibold text-right">Rate (₹)</th>
              <th className="py-3 px-6 text-gray-600 font-semibold text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-100">
                <td className="py-3.5 px-6">{idx + 1}</td>
                <td className="py-3.5 px-6 font-medium text-gray-800">{item.desc}</td>
                <td className="py-3.5 px-6 text-right text-gray-700">{item.qty.toLocaleString()}</td>
                <td className="py-3.5 px-6 text-right text-gray-700">{item.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="py-3.5 px-6 text-right font-medium text-gray-800">{(item.qty * item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals Calculation */}
        <div className="flex justify-end px-8 py-6">
          <div className="w-[300px]">
            <div className="flex justify-between text-[12px] text-gray-600 mb-2">
              <span>Subtotal</span>
              <span>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-[12px] text-gray-600 mb-2">
              <span>CGST (9%)</span>
              <span>₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-[12px] text-gray-600 mb-3">
              <span>SGST (9%)</span>
              <span>₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-[15px] font-bold pt-3 border-t border-gray-200 mt-2" style={{ color: 'hsl(22, 70%, 35%)' }}>
              <span>Total Amount</span>
              <span>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Footer Terms */}
        <div className="bg-gray-50 px-8 py-6 border-t border-gray-100 mt-4">
          <div className="text-[10px] text-gray-500 font-bold uppercase mb-2">Terms & Conditions</div>
          <ol className="text-[11px] text-gray-600 list-decimal pl-4 leading-relaxed m-0">
            <li>All materials subject to physical verification and testing at site.</li>
            <li>Invoice must reference this PO Number to process payment.</li>
            <li>Standard deduction of 5% applies towards retention/quality assurance.</li>
            <li>Delivery delays beyond 15 days will incur a penalty of 1% per week.</li>
          </ol>
        </div>

      </div>
    </div>
  );
};

export default POInvoice;
