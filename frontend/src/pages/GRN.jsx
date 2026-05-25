import React, { useState, useEffect } from 'react';
import { PackageCheck, AlertTriangle } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

const GRN = () => {
  const { activeProject } = useProject();
  const [pos, setPos] = useState([]);
  const [grns, setGrns] = useState([]);
  const [newItem, setNewItem] = useState({ poId: '', vehicleNumber: '', batchNumber: '', chainage: '', receivedQuantity: '' });
  const [warning, setWarning] = useState('');

  const fetchData = async () => {
    if (!activeProject) return;
    const gRes = await fetch(`http://localhost:5000/grn?projectId=${activeProject.id}`).then(res => res.json());
    const pRes = await fetch(`http://localhost:5000/po?projectId=${activeProject.id}`).then(res => res.json());
    
    setGrns(gRes);
    setPos(pRes.filter(p => p.status !== 'Delivered'));
  };

  useEffect(() => { fetchData(); }, [activeProject]);

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

    const selectedPo = pos.find(p => p.id === parseInt(newItem.poId));
    const workOrderId = selectedPo ? selectedPo.workOrderId : 0;

    await fetch('http://localhost:5000/grn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newItem, projectId: activeProject.id, workOrderId })
    });
    
    setNewItem({ poId: '', vehicleNumber: '', batchNumber: '', chainage: '', receivedQuantity: '' });
    fetchData();
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
            <select required className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.poId} onChange={e => setNewItem({...newItem, poId: e.target.value})}>
              <option value="">-- Choose PO --</option>
              {pos.map(p => <option key={p.id} value={p.id}>PO-{p.id} ({p.itemName}) - Qty: {p.quantity}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
             <label className="block text-xs font-medium text-gray-500 mb-1">Vehicle No.</label>
             <input required type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newItem.vehicleNumber} onChange={e => setNewItem({...newItem, vehicleNumber: e.target.value})} placeholder="TS 09 EU 1234" />
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
             <input required type="number" className="w-full bg-black/50 border border-emerald-500/30 rounded-lg px-3 py-2 text-white text-sm" value={newItem.receivedQuantity} onChange={handleQtyChange} />
          </div>
          
          <button type="submit" className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Generate GRN
          </button>
        </form>
      </div>

      {grns.length > 0 && (
          <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden mt-8">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-400 bg-black/40 uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">Receipt ID</th>
                  <th className="px-6 py-4 font-medium">PO Ref</th>
                  <th className="px-6 py-4 font-medium">Vehicle</th>
                  <th className="px-6 py-4 font-medium text-emerald-400">Net Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {grns.map((req) => (
                  <tr key={req.id} className="hover:bg-white/[0.02] transition-colors text-gray-300">
                    <td className="px-6 py-4 font-medium text-gray-400">GRN-{req.id.toString().padStart(5, '0')}</td>
                    <td className="px-6 py-4">PO-{req.poId}</td>
                    <td className="px-6 py-4">{req.vehicleNumber}</td>
                    <td className="px-6 py-4 font-bold text-emerald-400">{req.receivedQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      )}
    </div>
  );
};

export default GRN;
