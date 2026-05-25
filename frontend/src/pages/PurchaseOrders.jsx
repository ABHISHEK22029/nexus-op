import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FilePlus, PackageCheck, Send, CheckCircle2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

const PurchaseOrders = () => {
  const { activeProject } = useProject();
  const [pos, setPos] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ vendorId: '', itemName: '', quantity: '' });

  const fetchData = () => {
    if (!activeProject) return;
    axios.get(`http://localhost:5000/po?projectId=${activeProject.id}`)
      .then(res => setPos(res.data))
      .catch(err => console.error("Failed to fetch POs", err));
    
    axios.get(`http://localhost:5000/vendors?projectId=${activeProject.id}`)
      .then(res => setVendors(res.data))
      .catch(err => console.error("Failed to fetch vendors", err));
  };

  useEffect(() => {
    fetchData();
  }, [activeProject]);

  const handleSubmit = (e) => {
    e.preventDefault();
    axios.post('http://localhost:5000/po', {
      ...formData,
      quantity: parseInt(formData.quantity)
    })
      .then(() => {
        setFormData({ vendorId: '', itemName: '', quantity: '' });
        setShowForm(false);
        fetchData();
      })
      .catch(err => console.error(err));
  };

  const handleAction = (poId, action, extraPayload = {}) => {
    const endpoint = action === 'grn' ? 'grn' : `po/${poId}/${action}`;
    const payload = action === 'grn' ? { poId, selectedAction: action, ...extraPayload } : {};
    
    axios[action === 'grn' ? 'post' : 'patch'](`http://localhost:5000/${endpoint}`, payload)
      .then(() => fetchData())
      .catch(err => alert(`Failed to ${action} PO: ` + (err.response?.data?.error || err.message)));
  };

  const StatusBadge = ({ status }) => {
    switch(status) {
      case 'Pending':
        return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">Pending</span>;
      case 'Approved':
        return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Approved</span>;
      case 'Dispatched':
        return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Dispatched</span>;
      case 'Delivered':
        return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Delivered</span>;
      default:
        return null;
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white/90 tracking-tight">Purchase Orders</h1>
          <p className="text-gray-500 text-sm mt-1">Create orders and process deliveries (GRN).</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-white text-black px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-gray-100 transition-colors"
        >
          <FilePlus size={18} />
          Create PO
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#111113] border border-white/5 p-6 rounded-xl mb-8 animate-in slide-in-from-top-4 fade-in duration-300">
          <h2 className="text-lg font-medium mb-4">New Purchase Order</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Select Vendor</label>
              <select 
                required
                value={formData.vendorId}
                onChange={e => setFormData({...formData, vendorId: e.target.value})}
                className="w-full bg-[#1A1A1E] border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
              >
                <option value="" disabled>Choose...</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.type})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Item Name</label>
              <input 
                required
                type="text" 
                value={formData.itemName}
                onChange={e => setFormData({...formData, itemName: e.target.value})}
                className="w-full bg-[#1A1A1E] border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="e.g. Copper Wire"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Quantity</label>
              <input 
                required
                type="number" 
                min="1"
                value={formData.quantity}
                onChange={e => setFormData({...formData, quantity: e.target.value})}
                className="w-full bg-[#1A1A1E] border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="e.g. 500"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Raise Order
            </button>
          </div>
        </form>
      )}

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
            {pos.length > 0 ? pos.map((po) => (
              <tr key={po.id} className="table-row-animate hover:bg-white/[0.01]">
                <td className="px-6 py-4 text-sm text-gray-400 font-mono">PO-{po.id.toString().padStart(4, '0')}</td>
                <td className="px-6 py-4 text-sm font-medium text-white">{po.vendorName}</td>
                <td className="px-6 py-4 text-sm">
                  <span className="text-gray-300">{po.quantity}</span><span className="text-gray-500 mx-1">×</span><span>{po.itemName}</span>
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={po.status} />
                </td>
                <td className="px-6 py-4 text-right">
                  {po.status === 'Pending' && (
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
                  {po.status === 'Approved' && (
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
                  {po.status === 'Dispatched' && (
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
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-gray-500">No purchase orders found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PurchaseOrders;
