/* ══════════════════════════════════════════════════════════
   GRN — searchable and paginated, scoped to the active project.

   No filter chips: the grn table has no status, and nothing else on it has
   a fixed set of values. Search covers what someone actually holds when
   they come looking for a receipt — the vehicle that brought the load, the
   batch stencilled on it, and the chainage it was tipped at.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackageCheck, AlertTriangle, Trash2, ReceiptText } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const GRN = () => {
  const { activeProject, projectQuery } = useProject();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  /* No active project → ask for project 0, which matches nothing. Sending no
     projectId at all would quietly widen the list to every project. */
  const scope = activeProject?.id ? String(activeProject.id) : '0';
  const q = useListQuery('grn', { pageSize: 25, initialFilters: { projectId: scope } });
  const [pos, setPos] = useState([]);
  const [newItem, setNewItem] = useState({ poId: '', vehicleNumber: '', batchNumber: '', chainage: '', receivedQuantity: '' });
  const [warning, setWarning] = useState('');

  const canWrite = can('grn', 'write');
  const canDelete = can('grn', 'delete');

  // Follow the global project switcher.
  useEffect(() => {
    q.setFilters(f => ({ ...f, projectId: scope }));
  }, [scope]);

  // Only the PO pick-list loads here; the list itself is q's job.
  useEffect(() => {
    // No project means every dispatched PO is fair game, not none.
    fetch(`${API}/po${projectQuery()}`)
      .then(res => res.json())
      .then(d => {
        const rows = Array.isArray(d) ? d : (d.items || []);
        setPos(rows.filter(p => p.status !== 'Delivered'));
      })
      .catch(err => toast.error(err.message || 'Something went wrong'));
  }, [activeProject]);

  const handleQtyChange = (e) => {
    const val = e.target.value;
    setNewItem({...newItem, receivedQuantity: val});

    const selectedPo = pos.find(p => p.id === parseInt(newItem.poId));
    if (selectedPo && val) {
      const allowedMinimum = selectedPo.quantity * 0.98; // 2% short delivery threshold
      if (val < allowedMinimum) {
         setWarning(`Short delivery alert: Quantity is >2% below PO expected (${selectedPo.quantity})`);
      } else {
         setWarning('');
      }
    } else {
       setWarning('');
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!activeProject) return;

    if (!newItem.poId || newItem.receivedQuantity === '') {
      toast.error('Please select a PO and enter the received quantity');
      return;
    }

    const selectedPo = pos.find(p => p.id === parseInt(newItem.poId));
    const workOrderId = selectedPo ? selectedPo.workOrderId : 0;

    try {
      await fetch(`${API}/grn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newItem, projectId: activeProject.id, workOrderId })
      });
      toast.success('GRN generated');
      setNewItem({ poId: '', vehicleNumber: '', batchNumber: '', chainage: '', receivedQuantity: '' });
      q.reload();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this GRN record?')) return;
    try {
      await fetch(`${API}/grn/${id}`, { method: 'DELETE' });
      toast.success('GRN deleted');
      q.reload();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <PackageCheck className="text-emerald-400" />
          Goods Receipt Note (GRN)
        </h1>
        <p className="text-gray-500 mt-1">Record inward material deliveries against Purchase Orders.</p>
      </div>

      {canWrite && (
        <div className="bg-[#111113] border border-white/5 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Inward New Material</h2>

          {warning && (
             <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                <AlertTriangle size={16} /> {warning}
             </div>
          )}

          <form onSubmit={handleAdd} className="flex gap-4 items-end flex-wrap">
            <div className="flex-[2] min-w-[200px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Select PO</label>
              <select className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.poId} onChange={e => setNewItem({...newItem, poId: e.target.value})}>
                <option value="">-- Choose PO --</option>
                {pos.map(p => <option key={p.id} value={p.id}>PO-{p.id} ({p.itemName}) - Qty: {p.quantity}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[150px]">
               <label className="block text-xs font-medium text-gray-500 mb-1">Vehicle No.</label>
               <input type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.vehicleNumber} onChange={e => setNewItem({...newItem, vehicleNumber: e.target.value})} placeholder="TS 09 EU 1234" />
            </div>
            <div className="flex-1 min-w-[150px]">
               <label className="block text-xs font-medium text-gray-500 mb-1">Batch Number</label>
               <input type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.batchNumber} onChange={e => setNewItem({...newItem, batchNumber: e.target.value})} placeholder="B-2026" />
            </div>
            <div className="flex-1 min-w-[150px]">
               <label className="block text-xs font-medium text-gray-500 mb-1">Chainage</label>
               <input type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.chainage} onChange={e => setNewItem({...newItem, chainage: e.target.value})} placeholder="CH 12+500" />
            </div>
            <div className="flex-1 min-w-[150px]">
               <label className="block text-xs font-medium text-emerald-400 mb-1">Weighbridge Weight</label>
               <input type="number" className="w-full bg-black/50 border border-emerald-500/30 rounded-lg px-3 py-2 text-white text-sm" value={newItem.receivedQuantity} onChange={handleQtyChange} />
            </div>

            <button type="submit" className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              Generate GRN
            </button>
          </form>
        </div>
      )}

      <div className="mt-8">
        <ListToolbar q={q} placeholder="Search vehicle no., batch number, chainage…" />
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden">
        {q.rows.length === 0 ? (
          <EmptyState q={q} icon={PackageCheck} noun="GRN records"
            hint="Receive a dispatched Purchase Order above to create the first one." />
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-400 bg-black/40 uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Receipt ID</th>
                <th className="px-6 py-4 font-medium">PO Ref</th>
                <th className="px-6 py-4 font-medium">Vehicle</th>
                <th className="px-6 py-4 font-medium text-emerald-400">Net Quantity</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {q.rows.map((req) => (
                <tr key={req.id} className="hover:bg-white/[0.02] transition-colors text-gray-300">
                  <td className="px-6 py-4 font-medium text-gray-400">GRN-{req.id.toString().padStart(5, '0')}</td>
                  <td className="px-6 py-4">PO-{req.poId}</td>
                  <td className="px-6 py-4">{req.vehicleNumber}</td>
                  <td className="px-6 py-4 font-bold text-emerald-400">{req.receivedQuantity}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => navigate(`/grn/${req.id}/bill`)} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', padding: '5px 11px' }}>
                        <ReceiptText size={14} /> Generate Bill
                      </button>
                      {/* Hidden when the API would refuse it anyway. */}
                      {canDelete && (
                        <button type="button" onClick={() => handleDelete(req.id)} title="Delete" className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-white/5 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
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

export default GRN;
