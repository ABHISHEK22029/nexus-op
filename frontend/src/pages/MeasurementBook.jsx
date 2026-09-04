import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';
import { getToken } from '../lib/apiAuth';

const MeasurementBook = () => {
  const { activeProject, workOrders } = useProject();
  const toast = useToast();
  const { can } = usePermissions();
  const [boqs, setBoqs] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [newItem, setNewItem] = useState({ workOrderId: '', boqId: '', chainage: '', length: '', width: '', depth: '' });

  /* Entries come through the shared list hook — searchable and paginated
     server-side. The project filter goes in as a filter rather than a hand
     built query string so it composes with search instead of being
     overwritten by it. */
  const q = useListQuery('mb', {
    pageSize: 25,
    initialFilters: activeProject ? { projectId: String(activeProject.id) } : {},
  });

  // Keep the project filter in step when the active project changes.
  useEffect(() => {
    q.setFilters(activeProject ? { projectId: String(activeProject.id) } : {});
  }, [activeProject?.id]);

  const entries = q.rows;

  // The BOQ dropdown still loads whole — it is a picker, not a list, and
  // a form control that paginates is a form control nobody can use.
  const fetchBoqs = async () => {
    /* Not gated on a project any more: with "All work" selected this left
       the picker empty, so no measurement could be recorded. */
    try {
      const token = getToken();
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/boq${activeProject ? `?projectId=${activeProject.id}` : ''}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const d = await res.json();
      setBoqs(Array.isArray(d) ? d : (d.items || []));
    } catch (err) {
      toast.error(err.message || 'Could not load BOQ items');
    }
  };

  const fetchData = () => { fetchBoqs(); q.reload(); };

  useEffect(() => { fetchBoqs(); }, [activeProject?.id]);

  const resetForm = () => {
    setEditingId(null);
    setNewItem({ workOrderId: '', boqId: '', chainage: '', length: '', width: '', depth: '' });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    /* Was a silent return — the Add button did nothing. */
    if (!activeProject) {
      toast.error('Choose a project first — a measurement is booked against one.');
      return;
    }

    // Work Order is OPTIONAL — SMEs may record measurements without one
    if (!newItem.boqId || !newItem.chainage || !newItem.length || !newItem.width || !newItem.depth) {
      toast.error('Please fill in BOQ and all dimension fields');
      return;
    }

    const l = parseFloat(newItem.length) || 0;
    const w = parseFloat(newItem.width) || 0;
    const d = parseFloat(newItem.depth) || 0;
    const measuredQuantity = l * w * d;

    try {
      if (editingId) {
        await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/mb/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workOrderId: newItem.workOrderId,
            boqId: newItem.boqId,
            chainage: newItem.chainage,
            length: newItem.length,
            width: newItem.width,
            depth: newItem.depth,
            measuredQuantity
          })
        });
        toast.success('Measurement updated');
      } else {
        await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/mb`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...newItem, projectId: activeProject.id, measuredQuantity })
        });
        toast.success('Measurement recorded');
      }
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  const handleEdit = (req) => {
    setEditingId(req.id);
    setNewItem({
      workOrderId: req.workOrderId ?? '',
      boqId: req.boqId ?? '',
      chainage: req.chainage ?? '',
      length: req.length ?? '',
      width: req.width ?? '',
      depth: req.depth ?? ''
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this measurement record?')) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/mb/${id}`, { method: 'DELETE' });
      toast.success('Measurement deleted');
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
          <BookOpen className="text-pink-400" />
          Measurement Book (MB)
        </h1>
        <p className="text-gray-500 mt-1">Record structural volume measurements bound to Work Orders over active projects.</p>
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">{editingId ? 'Edit MB Vector' : 'Record New MB Vector'}</h2>
        <form onSubmit={handleAdd} className="flex gap-4 items-end flex-wrap">
          <div className="flex-[2] min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Work Order <span className="text-gray-600">(optional)</span></label>
            <select className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.workOrderId} onChange={e => setNewItem({...newItem, workOrderId: e.target.value})}>
              <option value="">— No work order —</option>
              {workOrders.map(w => <option key={w.id} value={w.id}>WO-{w.id}: {w.name}</option>)}
            </select>
          </div>
          <div className="flex-[2] min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">BOQ Material</label>
            <select className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.boqId} onChange={e => setNewItem({...newItem, boqId: e.target.value})}>
              <option value="">-- Choose BOQ --</option>
              {boqs.map(b => <option key={b.id} value={b.id}>{b.itemCode} - {b.description}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[120px]">
             <label className="block text-xs font-medium text-gray-500 mb-1">Chainage</label>
             <input type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.chainage} onChange={e => setNewItem({...newItem, chainage: e.target.value})} placeholder="CH 14+200" />
          </div>
          <div className="flex-1 min-w-[80px]">
             <label className="block text-xs font-medium text-gray-500 mb-1">Len(m)</label>
             <input type="number" step="0.01" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.length} onChange={e => setNewItem({...newItem, length: e.target.value})} />
          </div>
          <div className="flex-1 min-w-[80px]">
             <label className="block text-xs font-medium text-gray-500 mb-1">Wid(m)</label>
             <input type="number" step="0.01" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.width} onChange={e => setNewItem({...newItem, width: e.target.value})} />
          </div>
          <div className="flex-1 min-w-[80px]">
             <label className="block text-xs font-medium text-gray-500 mb-1">Dep(m)</label>
             <input type="number" step="0.01" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.depth} onChange={e => setNewItem({...newItem, depth: e.target.value})} />
          </div>
          <button type="submit" className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            {editingId ? 'Update' : 'Record Vector'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="bg-white/5 hover:bg-white/10 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Cancel
            </button>
          )}
        </form>
      </div>

      <div className="mt-8">
        <ListToolbar
          q={q}
          placeholder="Search chainage, BOQ item or work order…"
        />
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 bg-black/40 uppercase">
            <tr>
              <th className="px-6 py-4 font-medium">Record ID</th>
              <th className="px-6 py-4 font-medium">Work Order</th>
              <th className="px-6 py-4 font-medium">BOQ Ref</th>
              <th className="px-6 py-4 font-medium">Chainage</th>
              <th className="px-6 py-4 font-medium">Dimensions (L×W×D)</th>
              <th className="px-6 py-4 font-medium text-pink-400">Yield Quantity</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {entries.length === 0 ? (
              <tr><td colSpan={7}>
                {/* Distinguishes "nothing recorded" from "nothing matched
                    your search" — showing the first when the second is true
                    is how people conclude their data is gone. */}
                <EmptyState q={q} icon={BookOpen} noun="measurements"
                  hint="Record one using the form above." />
              </td></tr>
            ) : (
              entries.map((req) => (
                <tr key={req.id} className="hover:bg-white/[0.02] transition-colors text-gray-300">
                  <td className="px-6 py-4 font-medium text-gray-400">MB-{req.id.toString().padStart(5, '0')}</td>
                  <td className="px-6 py-4 font-medium text-gray-400">WO-{req.workOrderId}</td>
                  <td className="px-6 py-4">{req.itemCode}</td>
                  <td className="px-6 py-4">{req.chainage}</td>
                  <td className="px-6 py-4 text-gray-500">{req.length} × {req.width} × {req.depth}</td>
                  <td className="px-6 py-4 font-bold text-pink-400">{req.measuredQuantity.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    {/* Hidden when the API would refuse them anyway. */}
                    <div className="flex items-center justify-end gap-2">
                      {can('mb', 'write') && (
                        <button type="button" onClick={() => handleEdit(req)} title="Edit" className="p-1.5 rounded-lg text-gray-400 hover:text-pink-400 hover:bg-white/5 transition-colors">
                          <Pencil size={16} />
                        </button>
                      )}
                      {can('mb', 'delete') && (
                        <button type="button" onClick={() => handleDelete(req.id)} title="Delete" className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-white/5 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination q={q} />
    </div>
  );
};

export default MeasurementBook;
