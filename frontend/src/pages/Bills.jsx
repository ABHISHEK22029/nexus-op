/* ══════════════════════════════════════════════════════════
   RA Bills — searchable, filterable, paginated.

   The header figures read `q.summary`, which the API aggregates over the
   whole filtered set. They used to be reduced out of the rows on screen,
   which was right only while every row was on screen; with pagination
   "Cumulative Gross Billed" would quietly have meant "gross on page 1".
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Receipt, Plus, ChevronDown, ChevronUp, CheckCircle, Clock, Banknote, Shield, FileText, Trash2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';

// The state machine the server actually enforces (BILL_TRANSITIONS in index.js).
const BILL_STATUSES = ['Draft', 'Under Review', 'Approved', 'Paid', 'Rejected'];

const Bills = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { activeProject, workOrders } = useProject();
  const [newWOId, setNewWOId] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [showOpts, setShowOpts] = useState(false);
  const [opts, setOpts] = useState({
    gstRate: 18, tdsSection: '194C', tdsRate: 2, retentionPct: 5,
    gstTdsRate: 0, labourCessRate: 0, advanceRecovery: 0, otherDeductions: 0, deductionReason: '',
  });
  const setOpt = (k, v) => setOpts(o => ({ ...o, [k]: v }));

  /* The list comes through the shared hook — searched, filtered and paged
     server-side. The active project goes in as a baseline filter rather than
     a hand-built query string, so it composes with search instead of being
     overwritten by it, and "Clear filters" cannot widen the page to every
     project. */
  const q = useListQuery('bills', {
    pageSize: 25,
    initialFilters: activeProject ? { projectId: String(activeProject.id) } : {},
  });

  // Keep the project filter in step when the active project changes.
  useEffect(() => {
    q.setFilters(activeProject ? { projectId: String(activeProject.id) } : {});
  }, [activeProject?.id]);

  const bills = q.rows;
  const fetchData = () => q.reload();

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

  /* Cumulative metrics — from the server's aggregate over the whole filtered
     set, never from the rows on screen (those are one page).
     Note the middle card changed meaning honestly: the endpoint aggregates
     net payable and total deductions, not "net of the paid ones", so the card
     now says what the number is rather than keeping a label the figure no
     longer supports. Filter to Paid and it answers the old question exactly. */
  const s = q.summary || {};
  const money = (n) => Number(n || 0).toLocaleString();
  const canWrite = can('bills', 'write');
  const canDelete = can('bills', 'delete');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Receipt className="text-red-400" />
          RA Bills Engine
        </h1>
        <p className="txt-muted mt-1">Generate deterministic RA Bills driven by certified cumulative MB quantities.</p>
      </div>

      {/* Financial Headers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#111113] border border-white/5 rounded-xl p-5 flex flex-col gap-2 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl"></div>
              <span className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <Banknote size={16} /> Cumulative Gross Billed
              </span>
              <span className="text-2xl font-bold text-white">₹{money(s.gross)}</span>
              <span className="text-xs txt-muted">
                  {q.isFiltered ? `${s.count ?? q.total} matching bill(s)` : `${s.count ?? q.total} bill(s)`}
              </span>
          </div>
          <div className="bg-[#111113] border border-white/5 rounded-xl p-5 flex flex-col gap-2 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-500/10 rounded-full blur-2xl"></div>
              {/* Paid and still-owed as two figures rather than one "net".
                  A single net number cannot answer either question a finance
                  person is actually asking. */}
              <span className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <CheckCircle size={16} /> Net Paid
              </span>
              <span className="text-2xl font-bold text-white">₹{money(s.paid)}</span>
              <span className="text-xs txt-muted">
                  ₹{money(s.unpaid)} still owed · after ₹{money(s.deductions)} deductions
              </span>
          </div>
          <div className="bg-[#111113] border border-white/5 rounded-xl p-5 flex flex-col gap-2 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl"></div>
              <span className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <Clock size={16} /> Pending Actions
              </span>
              <span className="text-2xl font-bold text-white">{s.pending_approval ?? 0} Invoices</span>
              <span className="text-xs txt-muted">Draft or Under Review</span>
          </div>
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Execute Invoice Run</h2>
          <button type="button" onClick={() => setShowOpts(s => !s)}
            className="text-xs font-medium" style={{ color: 'var(--brand-amber)' }}>
            {showOpts ? 'Hide billing options ▲' : 'Billing options (GST / TDS / deductions) ▼'}
          </button>
        </div>
        <form onSubmit={handleGenerate} className="flex gap-4 items-end flex-wrap">
          <div className="flex-[2] min-w-[250px]">
             <label className="block text-xs font-medium txt-muted mb-1">Target Work Order</label>
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
            <p className="text-xs txt-muted mb-3">All values are editable — leave a rate at 0 to skip that head. Optional heads (GST-TDS, Labour Cess) are off (0) by default.</p>
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
                  <label className="block text-xs font-medium txt-muted mb-1">{f.label}</label>
                  <input
                    type={f.text ? 'text' : 'number'} step={f.step}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                    value={opts[f.k]} onChange={e => setOpt(f.k, e.target.value)} />
                </div>
              ))}
              <div className="md:col-span-2">
                <label className="block text-xs font-medium txt-muted mb-1">Other Deduction Reason</label>
                <input type="text" placeholder="e.g. quality penalty, debit note…"
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                  value={opts.deductionReason} onChange={e => setOpt('deductionReason', e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>

      <ListToolbar
        q={q}
        placeholder="Search bill no., vendor, work order…"
        filters={[{
          key: 'status',
          label: 'Status',
          options: BILL_STATUSES.map(st => ({ value: st, label: st })),
        }]}
      />

      <div className="space-y-4">
        {bills.length === 0 ? (
           <div className="border border-white/5 bg-[#111113] rounded-xl">
               {/* "Nothing generated yet" and "nothing matched your search" are
                   different situations; showing the first when the second is
                   true is how people conclude their data is gone. */}
               <EmptyState q={q} icon={Receipt} noun="RA bills"
                 hint="Compute your first Draft Bill above." />
           </div>
        ) : bills.map((b) => (
          <div key={b.id} className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden transition-all duration-300">
              <div 
                  className="flex items-center justify-between p-5 cursor-pointer hover:bg-white/[0.02]"
                  onClick={() => toggleExpand(b.id)}
              >
                  <div className="flex items-center gap-6">
                      <div>
                          <p className="text-xs txt-muted mb-1">Invoice No.</p>
                          <p className="font-medium text-white">INV-{b.id.toString().padStart(5, '0')}</p>
                      </div>
                      <div>
                          <p className="text-xs txt-muted mb-1">Work Order</p>
                          <p className="font-medium text-gray-300">WO-{b.workOrderId}</p>
                      </div>
                      <div>
                          <p className="text-xs txt-muted mb-1">Status</p>
                          {/* .pill reads in both themes. The Tailwind -400
                              shades this replaced were 1.4:1 on the light
                              theme — "Under Review" was invisible. */}
                          <span className={`pill ${
                                b.status === 'Paid' ? 'pill-good' :
                                b.status === 'Approved' ? 'pill-info' :
                                b.status === 'Under Review' ? 'pill-warn' :
                                'pill-neutral'
                            }`}>
                              {b.status}
                          </span>
                      </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                      <div className="text-right">
                          <p className="text-xs txt-muted mb-1">Net Payout</p>
                          <p className="font-bold text-red-400">₹{b.netAmount?.toLocaleString()}</p>
                      </div>
                      {/* Hidden when the API would refuse it anyway. */}
                      {canDelete && (b.status === 'Draft' || b.status === 'Rejected') && (
                          <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }}
                              title="Delete bill"
                              className="txt-muted hover:text-red-400 transition-colors"
                          >
                              <Trash2 size={18} />
                          </button>
                      )}
                      <div className="txt-muted">
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
                              <p className="text-xs txt-muted mb-1">Taxable Value</p>
                              <p className="font-semibold text-gray-200">₹{(b.sub_total ?? b.grossAmount)?.toLocaleString()}</p>
                              <p className="text-xs txt-muted mt-1">({b.billedQuantity} qty)</p>
                          </div>
                          <div className="p-3 rounded-lg bg-[#111113] border border-white/5">
                              <p className="text-xs txt-muted mb-1">GST ({b.gst_rate ?? 18}%)</p>
                              <p className="font-semibold text-gray-300">+ ₹{(b.gst_total ?? 0)?.toLocaleString()}</p>
                              <p className="text-xs txt-muted mt-1">{(b.cgst > 0) ? 'CGST+SGST' : 'IGST'}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-[#111113] border border-white/5">
                              <p className="text-xs txt-muted mb-1">TDS ({b.tds_rate ?? 2}%)</p>
                              <p className="font-semibold text-red-400">- ₹{b.tds?.toLocaleString()}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-[#111113] border border-white/5">
                              <p className="text-xs txt-muted mb-1">Retention ({b.retention_pct ?? 5}%)</p>
                              <p className="font-semibold text-red-400">- ₹{b.retention?.toLocaleString()}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-[#111113] border border-white/5">
                              <p className="text-xs txt-muted mb-1">Other Deductions</p>
                              <p className="font-semibold text-red-400">- ₹{((b.gst_tds ?? 0) + (b.labour_cess ?? 0) + (b.advance_recovery ?? 0) + (b.other_deductions ?? 0)).toLocaleString()}</p>
                              <p className="text-xs txt-muted mt-1">GST-TDS · cess · adv · other</p>
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
                          <span className="text-xs txt-muted mr-2">Workflow:</span>
                          {/* Approval steps are hidden without write rights —
                              the server refuses them anyway. */}
                          {canWrite && b.status === 'Draft' && (
                              <button onClick={() => handleStatusChange(b.id, 'submit')} className="btn-secondary text-xs px-3 py-1.5">
                                  Submit for Review
                              </button>
                          )}
                          {canWrite && b.status === 'Under Review' && (
                              <button onClick={() => handleStatusChange(b.id, 'approve')} className="btn-primary text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700">
                                  Approve Invoice
                              </button>
                          )}
                          {canWrite && b.status === 'Approved' && (
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

      <Pagination q={q} />
    </div>
  );
};

export default Bills;

