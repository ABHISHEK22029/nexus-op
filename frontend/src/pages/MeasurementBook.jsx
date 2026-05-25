import React, { useState, useEffect } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

const MeasurementBook = () => {
  const { activeProject, workOrders } = useProject();
  const [entries, setEntries] = useState([]);
  const [boqs, setBoqs] = useState([]);
  const [newItem, setNewItem] = useState({ workOrderId: '', boqId: '', chainage: '', length: '', width: '', depth: '' });

  const fetchData = async () => {
    if (!activeProject) return;
    const eRes = await fetch(`http://localhost:5000/mb?projectId=${activeProject.id}`).then(res => res.json());
    const bRes = await fetch(`http://localhost:5000/boq?projectId=${activeProject.id}`).then(res => res.json());
    setEntries(eRes);
    setBoqs(bRes);
  };

  useEffect(() => { fetchData() }, [activeProject]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!activeProject) return;
    const l = parseFloat(newItem.length) || 0;
    const w = parseFloat(newItem.width) || 0;
    const d = parseFloat(newItem.depth) || 0;
    const measuredQuantity = l * w * d;
    
    await fetch('http://localhost:5000/mb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newItem, projectId: activeProject.id, measuredQuantity })
    });
    setNewItem({ ...newItem, boqId: '', chainage: '', length: '', width: '', depth: '' });
    fetchData();
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <BookOpen className="text-pink-400" />
          Measurement Book (MB)
        </h1>
        <p className="text-gray-500 mt-1">Record structural volume measurements bound to Work Orders over active projects.</p>
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Record New MB Vector</h2>
        <form onSubmit={handleAdd} className="flex gap-4 items-end flex-wrap">
          <div className="flex-[2] min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Target Work Order</label>
            <select required className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.workOrderId} onChange={e => setNewItem({...newItem, workOrderId: e.target.value})}>
              <option value="">-- Choose WO --</option>
              {workOrders.map(w => <option key={w.id} value={w.id}>WO-{w.id}: {w.name}</option>)}
            </select>
          </div>
          <div className="flex-[2] min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">BOQ Material</label>
            <select required className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.boqId} onChange={e => setNewItem({...newItem, boqId: e.target.value})}>
              <option value="">-- Choose BOQ --</option>
              {boqs.map(b => <option key={b.id} value={b.id}>{b.itemCode} - {b.description}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[120px]">
             <label className="block text-xs font-medium text-gray-500 mb-1">Chainage</label>
             <input required type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.chainage} onChange={e => setNewItem({...newItem, chainage: e.target.value})} placeholder="CH 14+200" />
          </div>
          <div className="flex-1 min-w-[80px]">
             <label className="block text-xs font-medium text-gray-500 mb-1">Len(m)</label>
             <input required type="number" step="0.01" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.length} onChange={e => setNewItem({...newItem, length: e.target.value})} />
          </div>
          <div className="flex-1 min-w-[80px]">
             <label className="block text-xs font-medium text-gray-500 mb-1">Wid(m)</label>
             <input required type="number" step="0.01" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.width} onChange={e => setNewItem({...newItem, width: e.target.value})} />
          </div>
          <div className="flex-1 min-w-[80px]">
             <label className="block text-xs font-medium text-gray-500 mb-1">Dep(m)</label>
             <input required type="number" step="0.01" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.depth} onChange={e => setNewItem({...newItem, depth: e.target.value})} />
          </div>
          <button type="submit" className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Record Vector
          </button>
        </form>
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden mt-8">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 bg-black/40 uppercase">
            <tr>
              <th className="px-6 py-4 font-medium">Record ID</th>
              <th className="px-6 py-4 font-medium">Work Order</th>
              <th className="px-6 py-4 font-medium">BOQ Ref</th>
              <th className="px-6 py-4 font-medium">Chainage</th>
              <th className="px-6 py-4 font-medium">Dimensions (L×W×D)</th>
              <th className="px-6 py-4 font-medium text-pink-400">Yield Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {entries.map((req) => (
              <tr key={req.id} className="hover:bg-white/[0.02] transition-colors text-gray-300">
                <td className="px-6 py-4 font-medium text-gray-400">MB-{req.id.toString().padStart(5, '0')}</td>
                <td className="px-6 py-4 font-medium text-gray-400">WO-{req.workOrderId}</td>
                <td className="px-6 py-4">{req.itemCode}</td>
                <td className="px-6 py-4">{req.chainage}</td>
                <td className="px-6 py-4 text-gray-500">{req.length} × {req.width} × {req.depth}</td>
                <td className="px-6 py-4 font-bold text-pink-400">{req.measuredQuantity.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MeasurementBook;
