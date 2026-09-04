/* ══════════════════════════════════════════════════════════
   BOQ — searchable and paginated, scoped to the active project.

   The "Progress (Used vs Est)" column now reads `executedQuantity`, which
   /boq computes per item as a SUM over the whole measurement book. It used
   to be worked out here, in the browser, by fetching every MB row for the
   project and adding up the ones whose boqId matched. That was correct only
   while the page held every measurement — the moment either list is
   paginated or capped, the bar quietly starts under-reporting progress
   against an estimate that stays the same, which reads as "we are behind"
   rather than "we did not load all the data".

   No filter chips: boq_items has no status, category or any other column
   with a fixed set of values to offer. Search only, which is what the
   screen is actually used for — finding an item code or a description.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { FileText, Plus, Pencil, Trash2, X } from 'lucide-react';

import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const BOQ = () => {
  const { activeProject } = useProject();
  const toast = useToast();
  const { can } = usePermissions();
  /* No active project → ask for project 0, which matches nothing. Sending no
     projectId at all would quietly widen the list to every project. */
  const scope = activeProject?.id ? String(activeProject.id) : '0';
  const q = useListQuery('boq', { pageSize: 25, initialFilters: { projectId: scope } });

  // Form states
  const emptyItem = { itemCode: '', description: '', unit: 'Cum', estimatedQuantity: '', rate: '' };
  const [newItem, setNewItem] = useState(emptyItem);
  const [editingId, setEditingId] = useState(null);

  const canWrite = can('boq', 'write');
  const canDelete = can('boq', 'delete');

  // Follow the global project switcher.
  useEffect(() => {
    q.setFilters(f => ({ ...f, projectId: scope }));
  }, [scope]);

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
    /* Was a silent return — the Add button did nothing and said nothing. */
    if (!activeProject) {
      toast.error('Choose a project first — a bill of quantities belongs to one.');
      return;
    }

    // Validation
    if (!newItem.itemCode || !newItem.description || !newItem.unit ||
        newItem.estimatedQuantity === '' || newItem.rate === '') {
      toast.error('Please fill in Item Code, Description, Unit, Est. Qty and Rate.');
      return;
    }

    try {
      if (editingId) {
        await fetch(`${API}/boq/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...newItem })
        });
        toast.success('BOQ item updated');
      } else {
        await fetch(`${API}/boq`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...newItem, projectId: activeProject.id })
        });
        toast.success('BOQ item added');
      }
      resetForm();
      q.reload();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this BOQ item?')) return;
    try {
      await fetch(`${API}/boq/${id}`, {
        method: 'DELETE'
      });
      toast.success('BOQ item deleted');
      if (editingId === id) resetForm();
      q.reload();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  /* Executed quantity is summed by the database over every measurement
     against this item, not over whatever rows this page happens to hold. */
  const getProgress = (item) => {
    const used = Number(item.executedQuantity || 0);
    const estimated = Number(item.estimatedQuantity || 0);
    const percent = estimated > 0 ? Math.min((used / estimated) * 100, 100) : 0;
    return { used, percent };
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <FileText className="text-indigo-400" />
          Bill of Quantities (BOQ)
        </h1>
        <p className="text-gray-500 mt-1">Master schedule of rates and estimated vs measured quantities.</p>
      </div>

      {canWrite && (
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
      )}

      <ListToolbar q={q} placeholder="Search item code, description, unit…" />

      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden">
        {q.rows.length === 0 ? (
          <EmptyState q={q} icon={FileText} noun="BOQ items"
            hint="Add one above to set the schedule of rates for this project." />
        ) : (
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
              {q.rows.map((item) => {
                const { used, percent } = getProgress(item);
                return (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors text-gray-300">
                    <td className="px-6 py-4 font-medium text-indigo-400">{item.itemCode}</td>
                    <td className="px-6 py-4 truncate max-w-xs">{item.description}</td>
                    <td className="px-6 py-4">{item.unit}</td>
                    <td className="px-6 py-4">{Number(item.estimatedQuantity || 0).toLocaleString()}</td>
                    <td className="px-6 py-4">₹{Number(item.rate || 0).toLocaleString()}</td>
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
                        {/* Hidden when the API would refuse it anyway. */}
                        {canWrite && (
                          <button onClick={() => startEdit(item)} className="text-indigo-400 hover:bg-indigo-400/10 p-1 rounded transition-colors" title="Edit"><Pencil size={16} /></button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:bg-red-400/10 p-1 rounded transition-colors" title="Delete"><Trash2 size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pagination q={q} />
    </div>
  );
};

export default BOQ;
