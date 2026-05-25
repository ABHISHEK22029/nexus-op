import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Receipt, Plus, Package } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

const Bills = () => {
  const { activeProject, workOrders } = useProject();
  const [bills, setBills] = useState([]);
  const [newWOId, setNewWOId] = useState('');

  const fetchData = async () => {
    if (!activeProject) return;
    try {
        const res = await axios.get(`http://localhost:5000/bills?projectId=${activeProject.id}`);
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
        await axios.post('http://localhost:5000/bills/generate', { 
            projectId: activeProject.id, 
            workOrderId: newWOId 
        });
        setNewWOId('');
        fetchData();
    } catch(err) {
        alert(err.response?.data?.error || "Error generating bill");
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Receipt className="text-red-400" />
          RA Bills Engine
        </h1>
        <p className="text-gray-500 mt-1">Generate deterministic RA Bills driven by certified cumulative MB quantities.</p>
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Execute Invoice Run</h2>
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
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 bg-black/40 uppercase">
            <tr>
              <th className="px-6 py-4 font-medium">Invoice No.</th>
              <th className="px-6 py-4 font-medium">Work Order</th>
              <th className="px-6 py-4 font-medium">Billed Qty</th>
              <th className="px-6 py-4 font-medium">Gross</th>
              <th className="px-6 py-4 font-medium">Net Payout</th>
              <th className="px-6 py-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {bills.map((b) => (
              <tr key={b.id} className="hover:bg-white/[0.02] transition-colors text-gray-300">
                <td className="px-6 py-4 font-medium text-gray-400">INV-{b.id.toString().padStart(5, '0')}</td>
                <td className="px-6 py-4 font-medium text-gray-400">WO-{b.workOrderId}</td>
                <td className="px-6 py-4 font-bold">{b.billedQuantity}</td>
                <td className="px-6 py-4">₹{b.grossAmount?.toLocaleString()}</td>
                <td className="px-6 py-4 font-bold text-red-400">₹{b.netAmount?.toLocaleString()}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs ${b.status === 'Paid' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {b.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Bills;
