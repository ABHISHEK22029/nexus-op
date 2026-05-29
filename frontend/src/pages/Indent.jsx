import React, { useState, useEffect } from 'react';
import { ClipboardList, Plus, CheckCircle, XCircle } from 'lucide-react';

import { useProject } from '../context/ProjectContext';

const Indent = () => {
  const { activeProject, workOrders } = useProject();
  const [indents, setIndents] = useState([]);
  const [boqs, setBoqs] = useState([]);
  const [newItem, setNewItem] = useState({ workOrderId: '', boqId: '', requestedQuantity: '', requiredDate: '', chainage: '' });

  const fetchData = async () => {
    if (!activeProject) return;
    const iRes = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8080/api"}/indent?projectId=${activeProject.id}`).then(res => res.json());
    const bRes = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8080/api"}/boq?projectId=${activeProject.id}`).then(res => res.json());
    setIndents(iRes);
    setBoqs(bRes);
  };

  useEffect(() => { fetchData(); }, [activeProject]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!activeProject) return;
    await fetch('${import.meta.env.VITE_API_URL || "http://localhost:8080/api"}/indent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newItem, projectId: activeProject.id })
    });
    setNewItem({ workOrderId: '', boqId: '', requestedQuantity: '', requiredDate: '', chainage: '' });
    fetchData();
  };

  const handleStatus = async (id, status) => {
    await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8080/api"}/indent/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    fetchData();
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <ClipboardList className="text-amber-400" />
          Material Indent
        </h1>
        <p className="text-gray-500 mt-1">Request materials mapped against Bill of Quantities.</p>
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Raise New Indent</h2>
        <form onSubmit={handleAdd} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[150px]">
             <label className="block text-xs font-medium text-gray-500 mb-1">Target Work Order</label>
             <select required className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.workOrderId} onChange={e => setNewItem({...newItem, workOrderId: e.target.value})}>
                <option value="">-- Choose WO --</option>
                {workOrders.map(w => <option key={w.id} value={w.id}>WO-{w.id}</option>)}
             </select>
          </div>
          <div className="flex-[2] min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Select BOQ Material</label>
            <select required className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.boqId} onChange={e => setNewItem({...newItem, boqId: e.target.value})}>
              <option value="">-- Choose Material --</option>
              {boqs.map(b => (
                <option key={b.id} value={b.id}>{b.itemCode} - {b.description} (Est: {b.estimatedQuantity})</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Req. Qty</label>
            <input required type="number" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.requestedQuantity} onChange={e => setNewItem({...newItem, requestedQuantity: e.target.value})} />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Required By</label>
            <input required type="date" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.requiredDate} onChange={e => setNewItem({...newItem, requiredDate: e.target.value})} />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Chainage/Location</label>
            <input required type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.chainage} onChange={e => setNewItem({...newItem, chainage: e.target.value})} placeholder="CH 12+500" />
          </div>
          <button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <Plus size={16} /> Raise Indent
          </button>
        </form>
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 bg-black/40 uppercase">
            <tr>
              <th className="px-6 py-4 font-medium">ID</th>
              <th className="px-6 py-4 font-medium">Material</th>
              <th className="px-6 py-4 font-medium">Qty</th>
              <th className="px-6 py-4 font-medium">Chainage</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {indents.map((ind) => (
              <tr key={ind.id} className="hover:bg-white/[0.02] transition-colors text-gray-300">
                <td className="px-6 py-4 font-medium text-amber-400">IND-{ind.id.toString().padStart(4, '0')}</td>
                <td className="px-6 py-4">{ind.itemCode} - {ind.description}</td>
                <td className="px-6 py-4">{ind.requestedQuantity}</td>
                <td className="px-6 py-4">{ind.chainage}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs ${ind.status === 'Approved' ? 'bg-green-500/20 text-green-400' : ind.status === 'Rejected' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {ind.status}
                  </span>
                </td>
                <td className="px-6 py-4 flex gap-2 justify-end">
                  {ind.status === 'Pending' && (
                    <>
                      <button onClick={() => handleStatus(ind.id, 'Approved')} className="text-green-400 hover:bg-green-400/10 p-1 rounded transition-colors"><CheckCircle size={18} /></button>
                      <button onClick={() => handleStatus(ind.id, 'Rejected')} className="text-red-400 hover:bg-red-400/10 p-1 rounded transition-colors"><XCircle size={18} /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Indent;
