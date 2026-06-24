import React, { useState, useEffect } from 'react';
import { FileText, Plus, Pencil, Trash2, X } from 'lucide-react';

import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';

const BOQ = () => {
  const { activeProject } = useProject();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [mbData, setMbData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const emptyItem = { itemCode: '', description: '', unit: 'Cum', estimatedQuantity: '', rate: '' };
  const [newItem, setNewItem] = useState(emptyItem);
  const [editingId, setEditingId] = useState(null);

  const fetchData = async () => {
    if (!activeProject) return;
    setLoading(true);
    try {
      const boqResponse = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/boq?projectId=${activeProject.id}`).then(res => res.json());
      const mbResponse = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/mb?projectId=${activeProject.id}`).then(res => res.json());
      setItems(boqResponse);
      setMbData(mbResponse);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeProject]);

  const resetForm = () => {
    setNewItem(emptyItem);
    setEditingId(null);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setNewItem({
      itemCode: item.itemCode ?? '',
      description: item.description ?? '',
      unit: item.unit ?? '',
      estimatedQuantity: item.estimatedQuantity ?? '',
      rate: item.rate ?? '',
    });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!activeProject) return;

    // Validation
    if (!newItem.itemCode || !newItem.description || !newItem.unit ||
        newItem.estimatedQuantity === '' || newItem.rate === '') {
      toast.error('Please fill in Item Code, Description, Unit, Est. Qty and Rate.');
      return;
    }

    try {
      if (editingId) {
        await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/boq/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...newItem })
        });
        toast.success('BOQ item updated');
      } else {
        await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/boq`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...newItem, projectId: activeProject.id })
        });
        toast.success('BOQ item added');
      }
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this BOQ item?')) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/boq/${id}`, {
        method: 'DELETE'
      });
      toast.success('BOQ item deleted');
      if (editingId === id) resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  const getProgress = (boqId, estimated) => {
    const used = mbData.filter(mb => mb.boqId === boqId).reduce((sum, mb) => sum + mb.measuredQuantity, 0);
    const percent = estimated > 0 ? Math.min((used / estimated) * 100, 100) : 0;
    return { used, percent };
  };

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <FileText className="text-indigo-400" />
          Bill of Quantities (BOQ)
        </h1>
        <p className="text-gray-500 mt-1">Master schedule of rates and estimated vs measured quantities.</p>
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">{editingId ? 'Edit BOQ Item' : 'Add BOQ Item'}</h2>
        <form onSubmit={handleAdd} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Item Code</label>
            <input type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.itemCode} onChange={e => setNewItem({...newItem, itemCode: e.target.value})} placeholder="e.g. EW-01" />
          </div>
          <div className="flex-[2]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <input type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} placeholder="Item description" />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
            <input type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})} placeholder="Cum, Sqm, etc." />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Est. Qty</label>
            <input type="number" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.estimatedQuantity} onChange={e => setNewItem({...newItem, estimatedQuantity: e.target.value})} />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Rate (₹)</label>
            <input type="number" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.rate} onChange={e => setNewItem({...newItem, rate: e.target.value})} />
          </div>
          <button type="submit" className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {editingId ? <><Pencil size={16} /> Update</> : <><Plus size={16} /> Add Item</>}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', color: '#9ca3af' }}>
              <X size={16} /> Cancel
            </button>
          )}
        </form>
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 bg-black/40 uppercase">
            <tr>
              <th className="px-6 py-4 font-medium">Item Code</th>
              <th className="px-6 py-4 font-medium">Description</th>
              <th className="px-6 py-4 font-medium">Unit</th>
              <th className="px-6 py-4 font-medium">Est. Qty</th>
              <th className="px-6 py-4 font-medium">Rate (₹)</th>
              <th className="px-6 py-4 font-medium w-64">Progress (Used vs Est)</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-gray-500">No BOQ items yet</td>
              </tr>
            ) : items.map((item) => {
              const { used, percent } = getProgress(item.id, item.estimatedQuantity);
              return (
                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors text-gray-300">
                  <td className="px-6 py-4 font-medium text-indigo-400">{item.itemCode}</td>
                  <td className="px-6 py-4 truncate max-w-xs">{item.description}</td>
                  <td className="px-6 py-4">{item.unit}</td>
                  <td className="px-6 py-4">{item.estimatedQuantity.toLocaleString()}</td>
                  <td className="px-6 py-4">₹{item.rate.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: 'var(--brand-amber)' }}></div>
                      </div>
                      <span className="text-xs text-gray-500 whitespace-nowrap">{used.toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => startEdit(item)} className="text-indigo-400 hover:bg-indigo-400/10 p-1 rounded transition-colors" title="Edit"><Pencil size={16} /></button>
                      <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:bg-red-400/10 p-1 rounded transition-colors" title="Delete"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BOQ;
