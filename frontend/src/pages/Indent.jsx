import React, { useState, useEffect } from 'react';
import { ClipboardList, Plus, CheckCircle, XCircle, Pencil, Trash2, X } from 'lucide-react';

import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';

const Indent = () => {
  const { activeProject, workOrders } = useProject();
  const toast = useToast();
  const [indents, setIndents] = useState([]);
  const [boqs, setBoqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const emptyItem = { workOrderId: '', boqId: '', requestedQuantity: '', requiredDate: '', chainage: '' };
  const [newItem, setNewItem] = useState(emptyItem);
  const [editingId, setEditingId] = useState(null);

  const fetchData = async () => {
    if (!activeProject) return;
    setLoading(true);
    try {
      const iRes = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/indent?projectId=${activeProject.id}`).then(res => res.json());
      const bRes = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/boq?projectId=${activeProject.id}`).then(res => res.json());
      setIndents(iRes);
      setBoqs(bRes);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeProject]);

  const resetForm = () => {
    setNewItem(emptyItem);
    setEditingId(null);
  };

  const startEdit = (ind) => {
    setEditingId(ind.id);
    setNewItem({
      workOrderId: ind.workOrderId ?? '',
      boqId: ind.boqId ?? '',
      requestedQuantity: ind.requestedQuantity ?? '',
      requiredDate: ind.requiredDate ? String(ind.requiredDate).slice(0, 10) : '',
      chainage: ind.chainage ?? '',
    });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!activeProject) return;

    // Validation
    if (!newItem.workOrderId || !newItem.boqId || newItem.requestedQuantity === '' || !newItem.requiredDate) {
      toast.error('Please choose a Work Order, BOQ material, Qty and Required date.');
      return;
    }

    try {
      if (editingId) {
        await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/indent/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...newItem })
        });
        toast.success('Indent updated');
      } else {
        await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/indent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...newItem, projectId: activeProject.id })
        });
        toast.success('Indent raised');
      }
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  const handleStatus = async (id, status) => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/indent/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      toast.success(`Indent ${status.toLowerCase()}`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this indent?')) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/indent/${id}`, {
        method: 'DELETE'
      });
      toast.success('Indent deleted');
      if (editingId === id) resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
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
        <h2 className="text-lg font-semibold text-white mb-4">{editingId ? 'Edit Indent' : 'Raise New Indent'}</h2>
        <form onSubmit={handleAdd} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[150px]">
             <label className="block text-xs font-medium text-gray-500 mb-1">Target Work Order</label>
             <select className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.workOrderId} onChange={e => setNewItem({...newItem, workOrderId: e.target.value})}>
                <option value="">-- Choose WO --</option>
                {workOrders.map(w => <option key={w.id} value={w.id}>WO-{w.id}</option>)}
             </select>
          </div>
          <div className="flex-[2] min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Select BOQ Material</label>
            <select className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.boqId} onChange={e => setNewItem({...newItem, boqId: e.target.value})}>
              <option value="">-- Choose Material --</option>
              {boqs.map(b => (
                <option key={b.id} value={b.id}>{b.itemCode} - {b.description} (Est: {b.estimatedQuantity})</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Req. Qty</label>
            <input type="number" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.requestedQuantity} onChange={e => setNewItem({...newItem, requestedQuantity: e.target.value})} />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Required By</label>
            <input type="date" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.requiredDate} onChange={e => setNewItem({...newItem, requiredDate: e.target.value})} />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Chainage/Location</label>
            <input type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.chainage} onChange={e => setNewItem({...newItem, chainage: e.target.value})} placeholder="CH 12+500" />
          </div>
          <button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            {editingId ? <><Pencil size={16} /> Update</> : <><Plus size={16} /> Raise Indent</>}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="border border-white/10 text-gray-400 hover:bg-white/5 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <X size={16} /> Cancel
            </button>
          )}
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
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-gray-500">Loading…</td>
              </tr>
            ) : indents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-gray-500">No indents yet</td>
              </tr>
            ) : indents.map((ind) => (
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
                      <button onClick={() => handleStatus(ind.id, 'Approved')} className="text-green-400 hover:bg-green-400/10 p-1 rounded transition-colors" title="Approve"><CheckCircle size={18} /></button>
                      <button onClick={() => handleStatus(ind.id, 'Rejected')} className="text-red-400 hover:bg-red-400/10 p-1 rounded transition-colors" title="Reject"><XCircle size={18} /></button>
                    </>
                  )}
                  <button onClick={() => startEdit(ind)} className="text-indigo-400 hover:bg-indigo-400/10 p-1 rounded transition-colors" title="Edit"><Pencil size={16} /></button>
                  <button onClick={() => handleDelete(ind.id)} className="text-red-400 hover:bg-red-400/10 p-1 rounded transition-colors" title="Delete"><Trash2 size={16} /></button>
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
