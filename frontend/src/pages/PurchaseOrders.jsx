import React, { useState, useEffect } from 'react';
import VendorPicker from '../components/VendorPicker';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { FilePlus, PackageCheck, Send, CheckCircle2, FileText, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';
import { numberToWords } from '../utils/numberToWords';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rup = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const PurchaseOrders = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { activeProject } = useProject();
  const { can } = usePermissions();
  const [vendors, setVendors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [company, setCompany] = useState(null);

  /* The order list comes through the shared list hook — searched, filtered
     and paginated server-side. Project scoping stays a filter rather than a
     hand-built query string, so it composes with search instead of being
     overwritten by it. */
  const q = useListQuery('po', {
    pageSize: 25,
    initialFilters: activeProject ? { projectId: String(activeProject.id) } : {},
  });

  // Keep the project filter in step when the active project changes.
  useEffect(() => {
    q.setFilters(activeProject ? { projectId: String(activeProject.id) } : {});
  }, [activeProject?.id]);

  // Raising a PO and signing one off are deliberately different permissions.
  const canWrite = can('po', 'write');
  const canSignOff = can('po-approval', 'write');

  const initialForm = {
    vendorId: '',
    itemName: '',
    quoteRef: '',
    gstRate: 18,
    paymentTerms: '50% Advance, 50% before Delivery',
    priceBasis: 'Ex Works',
    pnfInsurance: 'Vendor Scope',
    loadingScope: 'Buyer Scope',
    warranty: '12 months from date of Installation'
  };
  const [formData, setFormData] = useState(initialForm);
  
  const [items, setItems] = useState([{ sno: 1, description: '', uom: "No's", hsn: '', quantity: 1, unitPrice: 0 }]);
  const [gstType, setGstType] = useState(null);

  /* Vendors and the company profile stay whole loads — they are form
     controls, not lists, and a dropdown that paginates is a dropdown nobody
     can use. */
  const fetchRefs = () => {
    /* Vendors are company-level master data, so this no longer waits for a
       project — and no longer filters by one. Scoping the vendor dropdown to
       a project meant a workshop whose vendors sat on other projects saw an
       empty list and could not raise a PO at all. */
    axios.get(`${API}/vendors`)
      .then(res => setVendors(Array.isArray(res.data) ? res.data : (res.data?.items || [])))
      .catch(err => console.error("Failed to fetch vendors", err));

    axios.get(`${API}/company-profile`)
      .then(res => setCompany(res.data))
      .catch(err => console.error("Failed to fetch company profile", err));
  };

  const fetchData = () => { fetchRefs(); q.reload(); };

  useEffect(() => {
    fetchRefs();
  }, [activeProject?.id]);

  useEffect(() => {
    // Check GST type when vendor changes
    if (formData.vendorId && company?.stateCode) {
      const vendor = vendors.find(v => v.id == formData.vendorId);
      if (vendor && vendor.gstin) {
        const vendorState = vendor.gstin.substring(0, 2);
        if (vendorState === company.stateCode) {
          setGstType('intra'); // SGST + CGST
        } else {
          setGstType('inter'); // IGST
        }
      } else {
        setGstType(null);
      }
    }
  }, [formData.vendorId, company, vendors]);

  const handleAddItem = () => {
    setItems([...items, { sno: items.length + 1, description: '', uom: "No's", hsn: '', quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveItem = (index) => {
    const newItems = items.filter((_, i) => i !== index).map((item, i) => ({ ...item, sno: i + 1 }));
    setItems(newItems);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const gstRatePct = Number(formData.gstRate) || 0;
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const tax = subtotal * gstRatePct / 100;
  const totalValue = subtotal + tax;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const vendor = vendors.find(v => v.id == formData.vendorId);
    if (!vendor?.gstin) {
      toast.error("Selected vendor must have a valid GSTIN. Please update vendor details first.");
      return;
    }
    if (items.some(i => !i.description || i.quantity <= 0 || i.unitPrice <= 0)) {
      toast.error("Please fill all line items correctly (Description, Qty > 0, Price > 0).");
      return;
    }

    try {
      const totalQty = items.reduce((sum, i) => sum + Number(i.quantity), 0);
      const amountInWords = numberToWords(totalValue);

      // Create PO
      const poRes = await axios.post(`${API}/po`, {
        ...formData,
        projectId: activeProject?.id ?? null,
        itemName: formData.itemName || items[0].description, // fallback to first item
        quantity: totalQty,
        amountInWords
      });

      // Insert Line Items
      await axios.post(`${API}/po/${poRes.data.id}/items`, items);

      setFormData(initialForm);
      setItems([{ sno: 1, description: '', uom: "No's", hsn: '', quantity: 1, unitPrice: 0 }]);
      setShowForm(false);
      fetchData();
      toast.success('Purchase Order created');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to create PO");
    }
  };

  const handleAction = (poId, action, extraPayload = {}) => {
    const endpoint = action === 'grn' ? 'grn' : `po/${poId}/${action}`;
    const payload = action === 'grn' ? { poId, selectedAction: action, ...extraPayload } : {};

    axios[action === 'grn' ? 'post' : 'patch'](`${API}/${endpoint}`, payload)
      .then(() => { fetchData(); toast.success(`PO ${action === 'grn' ? 'received' : action + 'd'}`); })
      .catch(err => toast.error(`Failed to ${action} PO: ` + (err.response?.data?.error || err.message)));
  };

  // Approval sign-off (Admin/Manager) for POs held above the threshold.
  const signOff = (poId, decision) => {
    const remark = decision === 'Rejected' ? (window.prompt('Reason for rejection (optional):') || '') : '';
    axios.patch(`${API}/po/${poId}/approval`, { decision, remark })
      .then(() => { fetchData(); toast.success(`PO ${decision.toLowerCase()}`); })
      .catch(err => toast.error(err.response?.data?.error || 'Failed to record decision'));
  };

  const StatusBadge = ({ status }) => {
    switch(status) {
      case 'Pending': return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">Pending</span>;
      case 'Approved': return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Approved</span>;
      case 'Dispatched': return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Dispatched</span>;
      case 'Delivered': return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Delivered</span>;
      default: return null;
    }
  };

  const s = q.summary || {};

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto pb-16">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white/90 tracking-tight">Purchase Orders</h1>
          <p className="text-gray-500 text-sm mt-1">Create orders with detailed line items and GST.</p>
        </div>
        {/* Hidden when the API would refuse it anyway. */}
        {canWrite && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-white text-black px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-gray-100 transition-colors"
          >
            <FilePlus size={18} />
            Create PO
          </button>
        )}
      </div>

      {/* Totals come from the server's aggregate over the WHOLE filtered set,
          not from summing the rows on screen — after pagination those are one
          page, and "Order Value" would quietly mean "value on page 1". */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Kpi label={q.isFiltered ? 'Orders (filtered)' : 'Purchase Orders'} value={s.count ?? q.total} />
        <Kpi label="Order Value" value={rup(s.value)} />
        <Kpi label="Awaiting sign-off" value={s.awaiting_approval ?? 0}
             tone={Number(s.awaiting_approval) > 0 ? 'text-amber-400' : 'text-white'} />
        <Kpi label="Delivered" value={s.delivered ?? 0} tone="text-emerald-400" />
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#111113] border border-white/5 p-6 rounded-xl mb-8 animate-in slide-in-from-top-4 fade-in duration-300">
          <h2 className="text-lg font-medium mb-4 text-white">New Purchase Order</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div>
              {/* Was a flat alphabetical list of every vendor, which tells a
                  buyer nothing about who actually stocks the item, their
                  minimum order, or lead time — the facts the decision turns
                  on. Those were already in vendor_items; they just weren't
                  shown where the choice is made. */}
              <VendorPicker
                vendors={vendors}
                value={formData.vendorId}
                onChange={id => setFormData({ ...formData, vendorId: id })}
              />
              {gstType && (
                <div className="mt-1 text-xs text-amber-500/80">
                  {gstType === 'intra'
                    ? `Intra-state (CGST ${(Number(formData.gstRate) || 0) / 2}% + SGST ${(Number(formData.gstRate) || 0) / 2}%)`
                    : `Inter-state (IGST ${Number(formData.gstRate) || 0}%)`}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">GST Rate %</label>
              <input
                type="number" min="0" step="0.01"
                value={formData.gstRate}
                onChange={e => setFormData({ ...formData, gstRate: e.target.value })}
                className="w-full bg-[#1A1A1E] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                placeholder="e.g. 18"
              />
              <div className="mt-1 text-xs text-gray-500">Used to compute GST on the PO invoice.</div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">PO Title / Summary <span className="text-red-400">*</span></label>
              <input 
                required type="text" 
                value={formData.itemName}
                onChange={e => setFormData({...formData, itemName: e.target.value})}
                className="w-full bg-[#1A1A1E] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                placeholder="e.g. Earth Pit equipment"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Quote Reference</label>
              <input 
                type="text" 
                value={formData.quoteRef}
                onChange={e => setFormData({...formData, quoteRef: e.target.value})}
                className="w-full bg-[#1A1A1E] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                placeholder="e.g. Quo 077428 18 May 2026"
              />
            </div>
          </div>

          <h3 className="text-sm font-medium mb-3 text-white">Line Items</h3>
          <div className="border border-white/10 rounded-lg overflow-hidden mb-4">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#1A1A1E] border-b border-white/10">
                <tr>
                  <th className="p-3 text-gray-400 font-medium w-12 text-center">#</th>
                  <th className="p-3 text-gray-400 font-medium">Description</th>
                  <th className="p-3 text-gray-400 font-medium w-24">UOM</th>
                  <th className="p-3 text-gray-400 font-medium w-24">HSN</th>
                  <th className="p-3 text-gray-400 font-medium w-24">Qty</th>
                  <th className="p-3 text-gray-400 font-medium w-32">Rate (₹)</th>
                  <th className="p-3 text-gray-400 font-medium w-32 text-right">Total (₹)</th>
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((item, idx) => (
                  <tr key={idx} className="bg-[#111113]">
                    <td className="p-3 text-center text-gray-500">{item.sno}</td>
                    <td className="p-2">
                      <input type="text" required value={item.description} onChange={e => handleItemChange(idx, 'description', e.target.value)} className="w-full bg-transparent border border-transparent hover:border-white/20 focus:border-amber-500 rounded px-2 py-1 text-white outline-none" placeholder="Item description" />
                    </td>
                    <td className="p-2">
                      <select value={item.uom} onChange={e => handleItemChange(idx, 'uom', e.target.value)} className="w-full bg-transparent border border-transparent hover:border-white/20 focus:border-amber-500 rounded px-1 py-1 text-white outline-none appearance-none">
                        <option>No's</option><option>Kgs</option><option>EA</option><option>SET</option><option>AU</option><option>Mtr</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input type="text" value={item.hsn} onChange={e => handleItemChange(idx, 'hsn', e.target.value)} className="w-full bg-transparent border border-transparent hover:border-white/20 focus:border-amber-500 rounded px-2 py-1 text-white outline-none" placeholder="HSN" />
                    </td>
                    <td className="p-2">
                      <input type="number" required min="0.01" step="0.01" value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', e.target.value)} className="w-full bg-transparent border border-transparent hover:border-white/20 focus:border-amber-500 rounded px-2 py-1 text-white outline-none" />
                    </td>
                    <td className="p-2">
                      <input type="number" required min="0" step="0.01" value={item.unitPrice} onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)} className="w-full bg-transparent border border-transparent hover:border-white/20 focus:border-amber-500 rounded px-2 py-1 text-white outline-none" />
                    </td>
                    <td className="p-3 text-right text-gray-300">
                      {(item.quantity * item.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-center">
                      {items.length > 1 && (
                        <button type="button" onClick={() => handleRemoveItem(idx)} className="text-gray-500 hover:text-red-400 p-1"><Trash2 size={14}/></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="flex justify-between items-start mb-8">
            <button type="button" onClick={handleAddItem} className="text-amber-500 hover:text-amber-400 text-sm font-medium flex items-center gap-1"><Plus size={16}/> Add Line Item</button>
            <div className="w-64">
              <div className="flex justify-between text-sm text-gray-400 mb-1"><span>Subtotal:</span><span>₹{subtotal.toLocaleString('en-IN')}</span></div>
              {gstType === 'intra' ? (
                <>
                  <div className="flex justify-between text-sm text-gray-400 mb-1"><span>CGST ({gstRatePct / 2}%):</span><span>₹{(subtotal * gstRatePct / 200).toLocaleString('en-IN')}</span></div>
                  <div className="flex justify-between text-sm text-gray-400 mb-2"><span>SGST ({gstRatePct / 2}%):</span><span>₹{(subtotal * gstRatePct / 200).toLocaleString('en-IN')}</span></div>
                </>
              ) : (
                <div className="flex justify-between text-sm text-gray-400 mb-2"><span>IGST ({gstRatePct}%):</span><span>₹{(subtotal * gstRatePct / 100).toLocaleString('en-IN')}</span></div>
              )}
              <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-white/10"><span>PO Value:</span><span>₹{totalValue.toLocaleString('en-IN')}</span></div>
            </div>
          </div>

          <h3 className="text-sm font-medium mb-3 text-white">Commercial Terms</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 bg-[#1A1A1E] p-4 rounded-lg border border-white/5">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Payment Terms</label>
              <select value={formData.paymentTerms} onChange={e => setFormData({...formData, paymentTerms: e.target.value})} className="w-full bg-[#111113] border border-white/10 rounded px-3 py-1.5 text-sm text-white outline-none">
                <option>100% Advance</option><option>50% Advance, 50% before Delivery</option><option>30% Advance, 70% Post Handover</option><option>Net 30 Days</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Price Basis</label>
              <select value={formData.priceBasis} onChange={e => setFormData({...formData, priceBasis: e.target.value})} className="w-full bg-[#111113] border border-white/10 rounded px-3 py-1.5 text-sm text-white outline-none">
                <option>Ex Works</option><option>FOB</option><option>FOR Site</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">P&F / Loading</label>
              <select value={formData.loadingScope} onChange={e => setFormData({...formData, loadingScope: e.target.value})} className="w-full bg-[#111113] border border-white/10 rounded px-3 py-1.5 text-sm text-white outline-none">
                <option>Buyer Scope</option><option>Vendor Scope</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Warranty</label>
              <input type="text" value={formData.warranty} onChange={e => setFormData({...formData, warranty: e.target.value})} className="w-full bg-[#111113] border border-white/10 rounded px-3 py-1.5 text-sm text-white outline-none" placeholder="e.g. NA" />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
            <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white font-medium px-6 py-2 rounded-lg transition-colors flex items-center gap-2">Raise Order</button>
          </div>
        </form>
      )}

      {/* Status values are the ones the column actually holds — the
          purchase_orders CHECK constraint, plus the separate approval flag. */}
      <ListToolbar
        q={q}
        placeholder="Search PO no., vendor, item, work order, quote ref…"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'Pending', label: 'Pending' },
              { value: 'Approved', label: 'Approved' },
              { value: 'Dispatched', label: 'Dispatched' },
              { value: 'Delivered', label: 'Delivered' },
            ],
          },
          {
            key: 'approval_status',
            label: 'Sign-off',
            options: [
              { value: 'Pending Approval', label: 'Needs sign-off' },
              { value: 'Rejected', label: 'Rejected' },
            ],
          },
        ]}
      />

      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">PO #</th>
              <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
              <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Item Details</th>
              <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {q.rows.length > 0 ? q.rows.map((po) => (
              <tr key={po.id} className="table-row-animate hover:bg-white/[0.01]">
                <td className="px-6 py-4 text-sm text-gray-400 font-mono">PO-{po.id.toString().padStart(4, '0')}</td>
                <td className="px-6 py-4 text-sm font-medium text-white">{po.vendorName}</td>
                <td className="px-6 py-4 text-sm">
                  <span className="text-gray-300">{po.quantity}</span><span className="text-gray-500 mx-1">×</span><span>{po.itemName}</span>
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={po.status} />
                  {po.approval_status === 'Pending Approval' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6, fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'hsl(28,100%,54%,0.12)', color: 'hsl(28,92%,45%)' }}><ShieldCheck size={11} /> Needs sign-off</span>}
                </td>
                <td className="px-6 py-4 text-right">
                  {canSignOff && po.status === 'Pending' && po.approval_status === 'Pending Approval' && (
                    <span style={{ display: 'inline-flex', gap: 6, marginRight: 8 }}>
                      <button onClick={() => signOff(po.id, 'Approved')} title="Sign off (above approval limit)"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1px solid hsl(158,64%,45%,0.4)', background: 'hsl(158,64%,45%,0.12)', color: 'hsl(158,64%,38%)' }}>
                        <ShieldCheck size={13} /> Sign off
                      </button>
                      <button onClick={() => signOff(po.id, 'Rejected')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1px solid hsl(0,80%,55%,0.4)', background: 'hsl(0,80%,55%,0.1)', color: 'hsl(0,72%,50%)' }}>
                        Reject
                      </button>
                    </span>
                  )}
                  {po.status === 'Pending' && po.approval_status === 'Rejected' && (
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'hsl(0,72%,50%)', marginRight: 8 }}>Rejected in sign-off</span>
                  )}
                  {canWrite && po.status === 'Pending' && po.approval_status !== 'Pending Approval' && po.approval_status !== 'Rejected' && (
                    <button
                      onClick={() => handleAction(po.id, 'approve')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1px solid hsl(158,64%,45%,0.4)', background: 'hsl(158,64%,45%,0.1)', color: 'hsl(158,64%,38%)', transition: 'all 180ms' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'hsl(158,64%,38%)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'hsl(158,64%,45%,0.1)'; e.currentTarget.style.color = 'hsl(158,64%,38%)'; }}
                    >
                      <CheckCircle2 size={13} />
                      Approve
                    </button>
                  )}
                  {canWrite && po.status === 'Approved' && (
                    <button
                      onClick={() => handleAction(po.id, 'dispatch')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1px solid hsl(22,92%,50%,0.4)', background: 'hsl(22,92%,50%,0.1)', color: 'hsl(22,92%,45%)', transition: 'all 180ms' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'hsl(22,92%,50%)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'hsl(22,92%,50%,0.1)'; e.currentTarget.style.color = 'hsl(22,92%,45%)'; }}
                    >
                      <Send size={13} />
                      Dispatch
                    </button>
                  )}
                  {canWrite && po.status === 'Dispatched' && (
                    <button
                      onClick={() => { if(window.confirm('Receive goods and update inventory?')) { handleAction(po.id, 'grn', { receivedQuantity: po.quantity }); } }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1px solid hsl(213,80%,55%,0.4)', background: 'hsl(213,80%,55%,0.1)', color: 'hsl(213,80%,45%)', transition: 'all 180ms' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'hsl(213,80%,50%)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'hsl(213,80%,55%,0.1)'; e.currentTarget.style.color = 'hsl(213,80%,45%)'; }}
                    >
                      <PackageCheck size={13} />
                      Receive GRN
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/po/${po.id}`)}
                    className="ml-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-white/20 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-all"
                  >
                    <FileText size={13} />
                    View PO
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="5">
                  {/* "None yet" and "none matched your search" are different
                      situations; showing the first when the second is true is
                      how people conclude their data is gone. */}
                  <EmptyState q={q} icon={FileText} noun="purchase orders"
                    hint="Raise one with “Create PO” above." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination q={q} />
    </div>
  );
};

const Kpi = ({ label, value, tone }) => (
  <div className="bg-[#111113] border border-white/5 rounded-xl p-4">
    <div className="text-[0.68rem] font-bold uppercase tracking-wider text-gray-500">{label}</div>
    <div className={`text-2xl font-bold mt-1 tabular-nums ${tone || 'text-white'}`}>{value}</div>
  </div>
);

export default PurchaseOrders;
