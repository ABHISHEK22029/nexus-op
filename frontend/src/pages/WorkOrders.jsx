/* ══════════════════════════════════════════════════════════
   Work Orders — searchable, filterable, paginated.

   The list stays scoped to the active project. That scope travels as a
   filter on the query rather than as a client-side .filter(), so it
   composes with search and paging instead of fighting them: page 2 of a
   search inside one project is one request, not every work order in the
   database narrowed down afterwards.

   The status chips are the two values that exist — 'In Progress' (what
   createWorkOrder defaults to) and 'Pending'. There is no CHECK constraint
   behind the column, so anything else here would be a guess offered to the
   user as a fact.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Briefcase, Plus, Trash2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const WorkOrders = () => {
  const { activeProject } = useProject();
  const toast = useToast();
  const { can } = usePermissions();
  /* No active project → ask for project 0, which matches nothing. Sending no
     projectId at all would quietly widen the list to every project. */
  const scope = activeProject?.id ? String(activeProject.id) : '0';
  const q = useListQuery('work-orders', { pageSize: 25, initialFilters: { projectId: scope } });
  const [vendors, setVendors] = useState([]);
  const [boqs, setBoqs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
     vendorId: '', name: '', boqId: '', startDate: '', endDate: '', contractValue: ''
  });

  const canWrite = can('work-orders', 'write');
  const canDelete = can('work-orders', 'delete');

  // Follow the global project switcher.
  useEffect(() => {
    q.setFilters(f => ({ ...f, projectId: scope }));
  }, [scope]);

  /* These are pickers, and both endpoints answer perfectly well with no
     project — /vendors returns 61, /boq returns 8. Bailing out when the
     scope is "All work" left the dropdowns empty on a screen that was
     otherwise ready to use. */
  useEffect(() => {
    const scoped = activeProject ? `?projectId=${activeProject.id}` : '';
    axios.get(`${API}/vendors${scoped}`).then(res => setVendors(Array.isArray(res.data) ? res.data : (res.data?.items || [])));
    axios.get(`${API}/boq${scoped}`).then(res => setBoqs(Array.isArray(res.data) ? res.data : (res.data?.items || [])));
  }, [activeProject]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    /* A work order belongs to a project, so one has to be chosen — but say
       so. This used to `return` in silence, so the button did nothing and
       gave no reason. */
    if (!activeProject) {
      toast.error('Choose a project first — a work order is raised against one.');
      return;
    }
    if (!formData.name.trim() || !formData.vendorId) {
      toast.error('Directive Name and an Authorized Subcontractor are required.');
      return;
    }
    try {
      await axios.post(`${API}/work-orders`, { ...formData, projectId: activeProject.id });
      setShowForm(false);
      setFormData({ vendorId: '', name: '', boqId: '', startDate: '', endDate: '', contractValue: '' });
      q.reload();
      toast.success('Work order assigned successfully.');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  const handleDelete = async (w) => {
    if (!window.confirm('Delete this work order?')) return;
    try {
      await axios.delete(`${API}/work-orders/${w.id}`);
      q.reload();
      toast.success('Work order deleted.');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  /* This used to return "Loading context..." whenever no project was
     selected. Since a project became optional, "All work" is the default
     scope — so the whole screen sat on that message forever, and nothing
     was in fact loading. The list works unscoped (12 work orders), so it
     is shown; only raising a new one needs a project chosen. */

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Briefcase className="text-amber-400" />
            Execution Work Orders
          </h1>
          <p className="text-gray-500 mt-1">
            {activeProject
              ? <>Vendors and BOQ allocations under <strong className="text-gray-300">{activeProject.name}</strong>.</>
              : <>Work orders across every project. Pick a project above to raise a new one.</>}
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus size={16} /> Assign Order
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-[#111113] border border-white/5 rounded-xl p-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Directive Name</label>
              <input required type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white inline flex-1" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="WO-007: Excavation Sector B" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Authorized Subcontractor</label>
              <select required className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={formData.vendorId} onChange={e => setFormData({...formData, vendorId: e.target.value})}>
                <option value="">-- Vendor Pool --</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Optional BOQ Cap</label>
              <select className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={formData.boqId} onChange={e => setFormData({...formData, boqId: e.target.value})}>
                <option value="">-- Standard Master --</option>
                {boqs.map(b => <option key={b.id} value={b.id}>{b.itemCode} - {b.description}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Contract Valuation (₹)</label>
              <input type="number" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white" value={formData.contractValue} onChange={e => setFormData({...formData, contractValue: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Execution Start</label>
              <input required type="date" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Final Handover Date</label>
              <input required type="date" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
            </div>

            <div className="col-span-full pt-4">
              <button type="submit" className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                Generate Tracker
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-8">
        <ListToolbar
          q={q}
          placeholder="Search directive name, vendor, status…"
          filters={[{
            key: 'status',
            label: 'Status',
            options: [
              { value: 'In Progress', label: 'In Progress' },
              { value: 'Pending', label: 'Pending' },
            ],
          }]}
        />
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden">
        {q.rows.length === 0 ? (
          <EmptyState q={q} icon={Briefcase} noun="work orders"
            hint="Assign one to bind a vendor to a slice of this project." />
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-400 bg-black/40 uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Order ID</th>
                <th className="px-6 py-4 font-medium">Directive</th>
                <th className="px-6 py-4 font-medium">Vendor Target</th>
                <th className="px-6 py-4 font-medium">Value Envelope</th>
                <th className="px-6 py-4 font-medium">Progress Control</th>
                <th className="px-6 py-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {q.rows.map((w) => (
                <tr key={w.id} className="hover:bg-white/[0.02] transition-colors text-gray-300">
                  <td className="px-6 py-4 font-bold text-amber-400">WO-{w.id.toString().padStart(4, '0')}</td>
                  <td className="px-6 py-4 font-medium text-white">{w.name}</td>
                  <td className="px-6 py-4">{w.vendorName}</td>
                  <td className="px-6 py-4 font-mono text-gray-400">₹{parseFloat(w.contractValue)?.toLocaleString() || 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs ${w.status === 'In Progress' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>{w.status}</span>
                  </td>
                  <td className="px-6 py-4">
                    {/* Hidden when the API would refuse it anyway. */}
                    {canDelete && (
                      <button onClick={() => handleDelete(w)} title="Delete work order" className="text-gray-500 hover:text-red-400 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination q={q} />
    </div>
  );
};

export default WorkOrders;
