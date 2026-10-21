/* ══════════════════════════════════════════════════════════
   GRN — searchable and paginated, scoped to the active project, or to
   all of the company's work when none is chosen.

   No filter chips: the grn table has no status, and nothing else on it has
   a fixed set of values. Search covers what someone actually holds when
   they come looking for a receipt — the vehicle that brought the load, the
   batch stencilled on it, and the chainage it was tipped at.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackageCheck, AlertTriangle, ReceiptText } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const GRN = () => {
  const { activeProject, projectQuery, enabledModules } = useProject();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  /* No project chosen is "All work": every receipt the company has
     recorded, project or not. It used to ask for project 0, which matched
     nothing — so a business that doesn't use projects could never see a
     receipt, or record one. The list is owner-scoped on the server either
     way; "all" never means another company's. */
  const scope = activeProject?.id ? String(activeProject.id) : '';
  const q = useListQuery('grn', { pageSize: 25, initialFilters: scope ? { projectId: scope } : {} });
  const [pos, setPos] = useState([]);
  /* PO id → its number (PFW/FY2026-27/018), for the list: a receipt shown
     against "PO-12" meant nothing to anyone who had not seen the database. */
  const [poNo, setPoNo] = useState({});
  const [newItem, setNewItem] = useState({ poId: '', poLineItemId: '', vehicleNumber: '', batchNumber: '', chainage: '', receivedQuantity: '' });
  const [warning, setWarning] = useState('');
  /* The chosen PO's lines with what is still to come (GET /grn/outstanding).
     A PO with several lines could not be received here at all: the form
     sent no line, and the server asked "which one?" with database ids. */
  const [lines, setLines] = useState([]);
  const [poTick, setPoTick] = useState(0);

  const canWrite = can('grn', 'write');

  // Follow the global project switcher.
  useEffect(() => {
    q.setFilters(f => {
      const next = { ...f };
      if (scope) next.projectId = scope; else delete next.projectId;
      return next;
    });
  }, [scope]);

  // Only the PO pick-list loads here; the list itself is q's job.
  useEffect(() => {
    // No project means every dispatched PO is fair game, not none.
    fetch(`${API}/po${projectQuery()}`)
      .then(res => res.json())
      .then(d => {
        const rows = Array.isArray(d) ? d : (d.items || []);
        /* Only what can be received: dispatched, or part-received. A pending
           or approved PO was offered too, and the server then refused it. */
        setPos(rows.filter(p => ['Dispatched', 'Partially Received'].includes(p.status)));
        setPoNo(Object.fromEntries(rows.map(p => [p.id, p.poNumber])));
      })
      .catch(err => toast.error(err.message || 'Something went wrong'));
  }, [activeProject, poTick]);

  /* Choosing a PO loads its lines; one line still to come is chosen for you. */
  const choosePo = async (poId) => {
    setNewItem(n => ({ ...n, poId, poLineItemId: '', receivedQuantity: '' }));
    setWarning('');
    setLines([]);
    if (!poId) return;
    try {
      const d = await fetch(`${API}/grn/outstanding/${poId}`).then(r => r.json());
      const open = (d.lines || []).filter(l => !l.complete);
      setLines(d.lines || []);
      if (open.length === 1) setNewItem(n => ({ ...n, poLineItemId: open[0].id == null ? '' : String(open[0].id) }));
    } catch { /* the form still works; the server checks the quantity */ }
  };
  const openLines = lines.filter(l => !l.complete);
  const line = openLines.length === 1 ? openLines[0]
    : openLines.find(l => String(l.id) === String(newItem.poLineItemId));
  const unit = line?.uom ? ` ${line.uom}` : '';

  /* Measured against what is still to come on the line, not the whole order:
     receiving the last 20 of 50 used to warn "below PO expected (50)". */
  const handleQtyChange = (e) => {
    const val = e.target.value;
    setNewItem({...newItem, receivedQuantity: val});
    const due = Number(line?.outstanding);
    if (line && val !== '' && due > 0 && Number(val) < due * 0.98) {
      setWarning(`Less than the ${due.toLocaleString('en-IN')}${unit} still to come. The rest stays open on the purchase order.`);
    } else {
      setWarning('');
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newItem.poId || newItem.receivedQuantity === '') {
      toast.error('Please select a PO and enter the received quantity');
      return;
    }
    if (openLines.length > 1 && !newItem.poLineItemId) {
      toast.error('Choose which line of the purchase order arrived');
      return;
    }

    const selectedPo = pos.find(p => p.id === parseInt(newItem.poId));
    const workOrderId = selectedPo ? selectedPo.workOrderId : 0;

    try {
      /* The project is the one chosen, else the PO's own, else none — the
         server falls back the same way. */
      const res = await fetch(`${API}/grn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newItem, poLineItemId: newItem.poLineItemId || undefined, projectId: activeProject?.id ?? null, workOrderId })
      });
      /* The response was never read: a refused receipt (over-delivery, a PO
         not yet dispatched) still said "GRN generated". */
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'The receipt was not recorded'); return; }
      /* The order's balance is summed across its lines, so it is given as a
         figure only when the order has one line (one unit). */
      toast.success(!(body.outstanding > 0) ? 'GRN generated. The purchase order is fully received.'
        : lines.length === 1 ? `GRN generated. ${Number(body.outstanding).toLocaleString('en-IN')}${unit} still to come on this order.`
        : 'GRN generated. Part of the order is still to come.');
      setNewItem({ poId: '', poLineItemId: '', vehicleNumber: '', batchNumber: '', chainage: '', receivedQuantity: '' });
      setLines([]);
      setWarning('');
      setPoTick(t => t + 1);
      q.reload();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  /* No Delete here. A receipt adds the goods to stock and counts against
     its purchase order, and deleting it touched neither — so the shelf, the
     ledger and the PO disagreed. The server now refuses it ("record a
     correction with a stock count instead"), and a button that can only be
     refused is not offered. */

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <PackageCheck size={24} style={{ color: 'var(--brand-amber)' }} /> Goods received
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Book what arrived at the gate against its purchase order. Stock goes up as you save.</p>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Purchase order</label>
              <select className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" style={{ padding: '10px 14px' }} value={newItem.poId} onChange={e => choosePo(e.target.value)} aria-label="Purchase order">
                <option value="">{pos.length ? 'Choose a purchase order' : 'No purchase order is waiting to be received'}</option>
                {pos.map(p => <option key={p.id} value={p.id}>{p.poNumber || `PO-${p.id}`} · {p.itemName}{p.status === 'Partially Received' ? ' · part received' : ''}</option>)}
              </select>
            </div>
            {openLines.length > 1 && (
              <div className="flex-[2] min-w-[220px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">Which line arrived</label>
                <select className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" style={{ padding: '10px 14px' }} value={newItem.poLineItemId} onChange={e => { setNewItem({ ...newItem, poLineItemId: e.target.value, receivedQuantity: '' }); setWarning(''); }} aria-label="Line of the purchase order">
                  <option value="">Choose the line</option>
                  {openLines.map(l => <option key={l.id} value={l.id}>{l.description} · {Number(l.outstanding).toLocaleString('en-IN')}{l.uom ? ` ${l.uom}` : ''} to come</option>)}
                </select>
              </div>
            )}
            <div className="flex-1 min-w-[150px]">
               <label className="block text-xs font-medium text-gray-500 mb-1">Vehicle No.</label>
               <input type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.vehicleNumber} onChange={e => setNewItem({...newItem, vehicleNumber: e.target.value})} placeholder="TS 09 EU 1234" />
            </div>
            <div className="flex-1 min-w-[150px]">
               <label className="block text-xs font-medium text-gray-500 mb-1">Batch Number</label>
               <input type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.batchNumber} onChange={e => setNewItem({...newItem, batchNumber: e.target.value})} placeholder="B-2026" />
            </div>
            {enabledModules.includes('Chainage') && <div className="flex-1 min-w-[150px]">
               <label className="block text-xs font-medium text-gray-500 mb-1">Chainage</label>
               <input type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.chainage} onChange={e => setNewItem({...newItem, chainage: e.target.value})} placeholder="CH 12+500" />
            </div>}
            <div className="flex-1 min-w-[150px]">
               <label className="block text-xs font-medium text-gray-500 mb-1">Quantity received{unit && <span style={{ fontWeight: 400 }}> ({unit.trim()})</span>}</label>
               <input type="number" min="0" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.receivedQuantity} onChange={handleQtyChange}
                 placeholder={line ? `${Number(line.outstanding).toLocaleString('en-IN')} to come` : 'e.g. 180'} aria-label="Quantity received" />
            </div>

            <button type="submit" className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              Generate GRN
            </button>
          </form>
        </div>
      )}

      <div className="mt-8">
        <ListToolbar q={q} placeholder={enabledModules.includes('Chainage') ? 'Search vehicle no., batch number, chainage…' : 'Search vehicle no. or batch number…'} />
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden">
        {q.rows.length === 0 ? (
          <EmptyState q={q} icon={PackageCheck} noun="GRN records"
            hint="Receive a dispatched Purchase Order above to create the first one." />
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-400 bg-black/40 uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Receipt</th>
                <th className="px-6 py-4 font-medium">Purchase order</th>
                <th className="px-6 py-4 font-medium">Vehicle</th>
                <th className="px-6 py-4 font-medium text-right">Quantity</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {q.rows.map((req) => (
                <tr key={req.id} className="hover:bg-white/[0.02] transition-colors text-gray-300">
                  <td className="px-6 py-4 font-medium text-gray-400">GRN-{req.id.toString().padStart(5, '0')}</td>
                  <td className="px-6 py-4" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{poNo[req.poId] || `PO-${req.poId}`}</td>
                  <td className="px-6 py-4">{req.vehicleNumber || '—'}</td>
                  <td className="px-6 py-4 font-bold text-right" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{Number(req.receivedQuantity).toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {req.bill_id
                        ? <button type="button" onClick={() => navigate(`/grn-bills/${req.bill_id}`)} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', padding: '5px 11px' }}>
                            <ReceiptText size={14} /> {req.bill_number}
                          </button>
                        : <button type="button" onClick={() => navigate(`/grn/${req.id}/bill`)} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', padding: '5px 11px' }}>
                            <ReceiptText size={14} /> Generate Bill
                          </button>}
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
