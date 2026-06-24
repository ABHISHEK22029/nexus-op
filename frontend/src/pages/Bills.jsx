import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Receipt, Plus, ChevronDown, ChevronUp, CheckCircle, Clock, Banknote, Shield, FileText, Trash2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';

const Bills = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { activeProject, workOrders } = useProject();
  const [bills, setBills] = useState([]);
  const [newWOId, setNewWOId] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [showOpts, setShowOpts] = useState(false);
  const [opts, setOpts] = useState({
    gstRate: 18, tdsSection: '194C', tdsRate: 2, retentionPct: 5,
    gstTdsRate: 0, labourCessRate: 0, advanceRecovery: 0, otherDeductions: 0, deductionReason: '',
  });
  const setOpt = (k, v) => setOpts(o => ({ ...o, [k]: v }));

  const fetchData = async () => {
    if (!activeProject) return;
    try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/bills?projectId=${activeProject.id}`);
        setBills(res.data);
    } catch(err) {
        console.error(err);
    }
  };

  useEffect(() => { fetchData() }, [activeProject]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!activeProject || !newWOId) return;
    try {
        await axios.post(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/bills/generate`, {
            projectId: activeProject.id,
            workOrderId: newWOId,
            gstRate: +opts.gstRate, tdsSection: opts.tdsSection, tdsRate: +opts.tdsRate,
            retentionPct: +opts.retentionPct, gstTdsRate: +opts.gstTdsRate, labourCessRate: +opts.labourCessRate,
            advanceRecovery: +opts.advanceRecovery, otherDeductions: +opts.otherDeductions,
            deductionReason: opts.deductionReason || null,
        });
        setNewWOId('');
        toast.success('RA Bill generated');
        fetchData();
    } catch(err) {
        toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  const STATUS_LABEL = { submit: 'submitted', approve: 'approved', pay: 'paid', reject: 'rejected' };
  const handleStatusChange = async (id, action) => {
    try {
        await axios.patch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/bills/${id}/${action}`);
        toast.success(`Bill ${STATUS_LABEL[action] || action}`);
        fetchData();
    } catch(err) {
        toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this bill? This cannot be undone.')) return;
    try {
        await axios.delete(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/bills/${id}`);
        toast.success('Bill deleted');
        fetchData();
    } catch(err) {
        toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  const toggleExpand = (id) => {
      setExpandedId(expandedId === id ? null : id);
  };

  // Cumulative Metrics
  const totalGross = bills.reduce((sum, b) => sum + (b.grossAmount || 0), 0);
  const totalPaid = bills.filter(b => b.status === 'Paid').reduce((sum, b) => sum + (b.netAmount || 0), 0);
  const pendingReview = bills.filter(b => b.status === 'Draft' || b.status === 'Under Review').length;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Receipt className="text-red-400" />
          RA Bills Engine
        </h1>
        <p className="text-gray-500 mt-1">Generate deterministic RA Bills driven by certified cumulative MB quantities.</p>
      </div>

      {/* Financial Headers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#111113] border border-white/5 rounded-xl p-5 flex flex-col gap-2 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl"></div>
              <span className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <Banknote size={16} /> Cumulative Gross Billed
              </span>
              <span className="text-2xl font-bold text-white">₹{totalGross.toLocaleString()}</span>
          </div>
          <div className="bg-[#111113] border border-white/5 rounded-xl p-5 flex flex-col gap-2 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-500/10 rounded-full blur-2xl"></div>
              <span className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <CheckCircle size={16} /> Total Net Paid
              </span>
              <span className="text-2xl font-bold text-white">₹{totalPaid.toLocaleString()}</span>
          </div>
          <div className="bg-[#111113] border border-white/5 rounded-xl p-5 flex flex-col gap-2 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl"></div>
              <span className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <Clock size={16} /> Pending Actions
              </span>
              <span className="text-2xl font-bold text-white">{pendingReview} Invoices</span>
          </div>
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Execute Invoice Run</h2>
          <button type="button" onClick={() => setShowOpts(s => !s)}
            className="text-xs text-amber-400 hover:text-amber-300 font-medium">
            {showOpts ? 'Hide billing options ▲' : 'Billing options (GST / TDS / deductions) ▼'}
          </button>
        </div>
        <form onSubmit={handleGenerate} className="flex gap-4 items-end flex-wrap">
          <div className="flex-[2] min-w-[250px]">
             <label className="block text-xs font-medium text-gray-500 mb-1">Target Work Order</label>
             <select required className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newWOId} onChange={e => setNewWOId(e.target.value)}>
                <option value="">-- Select Executing Work Order --</option>
                {workOrders.map(wo => <option key={wo.id} value={wo.id}>WO-{wo.id}: {wo.name}</option>)}
             </select>
          </div>
          <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
            <Plus size={16} /> Compute Draft Bill
          </button>
        </form>

        {showOpts && (
          <div className="mt-5 pt-5 border-t border-white/5">
            <p className="text-xs text-gray-500 mb-3">All values are editable — leave a rate at 0 to skip that head. Optional heads (GST-TDS, Labour Cess) are off (0) by default.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { k: 'gstRate', label: 'GST Rate %', step: '0.01' },
                { k: 'tdsSection', label: 'TDS Section', text: true },
                { k: 'tdsRate', label: 'TDS Rate %', step: '0.01' },
                { k: 'retentionPct', label: 'Retention %', step: '0.01' },
                { k: 'gstTdsRate', label: 'TDS under GST % (optional)', step: '0.01' },
                { k: 'labourCessRate', label: 'Labour Cess % (optional)', step: '0.01' },
                { k: 'advanceRecovery', label: 'Advance Recovery ₹', step: '1' },
                { k: 'otherDeductions', label: 'Other Deductions ₹', step: '1' },
              ].map(f => (
                <div key={f.k}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
                  <input
                    type={f.text ? 'text' : 'number'} step={f.step}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                    value={opts[f.k]} onChange={e => setOpt(f.k, e.target.value)} />
                </div>
              ))}
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Other Deduction Reason</label>
                <input type="text" placeholder="e.g. quality penalty, debit note…"
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                  value={opts.deductionReason} onChange={e => setOpt('deductionReason', e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {bills.length === 0 ? (
           <div className="p-8 text-center border border-white/5 bg-[#111113] rounded-xl text-gray-500">
               No invoices generated yet. Compute your first Draft Bill above.
           </div>
        ) : bills.map((b) => (
          <div key={b.id} className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden transition-all duration-300">
              <div 
                  className="flex items-center justify-between p-5 cursor-pointer hover:bg-white/[0.02]"
                  onClick={() => toggleExpand(b.id)}
              >
                  <div className="flex items-center gap-6">
                      <div>
                          <p className="text-xs text-gray-500 mb-1">Invoice No.</p>
                          <p className="font-medium text-white">INV-{b.id.toString().padStart(5, '0')}</p>
                      </div>
                      <div>
                          <p className="text-xs text-gray-500 mb-1">Work Order</p>
                          <p className="font-medium text-gray-300">WO-{b.workOrderId}</p>
                      </div>
                      <div>
                          <p className="text-xs text-gray-500 mb-1">Status</p>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                                b.status === 'Paid' ? 'bg-green-500/20 text-green-400' : 
                                b.status === 'Approved' ? 'bg-blue-500/20 text-blue-400' :
                                b.status === 'Under Review' ? 'bg-amber-500/20 text-amber-400' :
                                'bg-gray-500/20 text-gray-400'
                            }`}>
                              {b.status}
                          </span>
                      </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                      <div className="text-right">
                          <p className="text-xs text-gray-500 mb-1">Net Payout</p>
                          <p className="font-bold text-red-400">₹{b.netAmount?.toLocaleString()}</p>
                      </div>
                      {(b.status === 'Draft' || b.status === 'Rejected') && (
                          <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }}
                              title="Delete bill"
                              className="text-gray-500 hover:text-red-400 transition-colors"
                          >
                              <Trash2 size={18} />
                          </button>
                      )}
                      <div className="text-gray-500">
                          {expandedId === b.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                  </div>
              </div>

              {expandedId === b.id && (
                  <div className="p-5 border-t border-white/5 bg-black/20 animate-in slide-in-from-top-2">
                      <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                          <Shield size={16} className="text-indigo-400" />
                          Mathematical Breakdown
                      </h3>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
                          <div className="p-3 rounded-lg bg-[#111113] border border-white/5">
                              <p className="text-xs text-gray-500 mb-1">Taxable Value</p>
                              <p className="font-semibold text-gray-200">₹{(b.sub_total ?? b.grossAmount)?.toLocaleString()}</p>
                              <p className="text-xs text-gray-600 mt-1">({b.billedQuantity} qty)</p>
                          </div>
                          <div className="p-3 rounded-lg bg-[#111113] border border-white/5">
                              <p className="text-xs text-gray-500 mb-1">GST ({b.gst_rate ?? 18}%)</p>
                              <p className="font-semibold text-gray-300">+ ₹{(b.gst_total ?? 0)?.toLocaleString()}</p>
                              <p className="text-xs text-gray-600 mt-1">{(b.cgst > 0) ? 'CGST+SGST' : 'IGST'}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-[#111113] border border-white/5">
                              <p className="text-xs text-gray-500 mb-1">TDS ({b.tds_rate ?? 2}%)</p>
                              <p className="font-semibold text-red-400">- ₹{b.tds?.toLocaleString()}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-[#111113] border border-white/5">
                              <p className="text-xs text-gray-500 mb-1">Retention ({b.retention_pct ?? 5}%)</p>
                              <p className="font-semibold text-red-400">- ₹{b.retention?.toLocaleString()}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-[#111113] border border-white/5">
                              <p className="text-xs text-gray-500 mb-1">Other Deductions</p>
                              <p className="font-semibold text-red-400">- ₹{((b.gst_tds ?? 0) + (b.labour_cess ?? 0) + (b.advance_recovery ?? 0) + (b.other_deductions ?? 0)).toLocaleString()}</p>
                              <p className="text-xs text-gray-600 mt-1">GST-TDS · cess · adv · other</p>
                          </div>
                          <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                              <p className="text-xs text-indigo-300 mb-1">Net Payable</p>
                              <p className="font-bold text-indigo-400 text-lg">₹{b.netAmount?.toLocaleString()}</p>
                          </div>
                      </div>

                      <div className="flex items-center gap-3 pt-4 border-t border-white/5 flex-wrap">
                          <button onClick={() => navigate(`/bills/${b.id}`)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
                              <FileText size={14} /> View Invoice
                          </button>
                          <span className="text-xs text-gray-500 mr-2">Workflow:</span>
                          {b.status === 'Draft' && (
                              <button onClick={() => handleStatusChange(b.id, 'submit')} className="btn-secondary text-xs px-3 py-1.5">
                                  Submit for Review
                              </button>
                          )}
                          {b.status === 'Under Review' && (
                              <button onClick={() => handleStatusChange(b.id, 'approve')} className="btn-primary text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700">
                                  Approve Invoice
                              </button>
                          )}
                          {b.status === 'Approved' && (
                              <button onClick={() => handleStatusChange(b.id, 'pay')} className="btn-primary text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700">
                                  Release Payment
                              </button>
                          )}
                          {b.status === 'Paid' && (
                              <span className="text-xs text-green-500 flex items-center gap-1">
                                  <CheckCircle size={14} /> Payment Settled
                              </span>
                          )}
                      </div>
                  </div>
              )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Bills;

