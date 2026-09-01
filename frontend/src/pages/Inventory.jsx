import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Database, Package, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';

const Inventory = () => {
  const toast = useToast();
  const { activeProject } = useProject();
  const [inventory, setInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProject) return;
    setLoading(true);
    axios.get(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/inventory?projectId=${activeProject.id}`)
      .then(res => setInventory(res.data))
      .catch(err => {
        console.error("Failed to fetch inventory", err);
        toast.error(err.response?.data?.error || err.message || 'Something went wrong');
      })
      .finally(() => setLoading(false));
  }, [activeProject]);

  const filteredInventory = inventory.filter(item => item.itemName.toLowerCase().includes(searchTerm.toLowerCase()));

  /* Reorder level is what makes the low-stock badge mean anything. Until now
     there was no write endpoint for inventory at all, so it could never be
     set and every item permanently read "Healthy". */
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  const saveReorder = async (item) => {
    const value = draft === '' ? 0 : Number(draft);
    if (Number.isNaN(value) || value < 0) { toast.error('Enter a valid reorder level'); return; }
    try {
      const res = await axios.patch(`${API_BASE}/inventory/${item.id}`, { min_stock_level: value });
      setInventory(list => list.map(i => (i.id === item.id ? { ...i, ...res.data, reorderLevel: value } : i)));
      // Re-fetch so the recomputed status badge reflects the new threshold.
      const fresh = await axios.get(`${API_BASE}/inventory?projectId=${activeProject.id}`);
      setInventory(fresh.data);
      toast.success(`Reorder level set for ${item.itemName}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the reorder level');
    } finally {
      setEditingId(null);
    }
  };

  const TONE = {
    'Out of Stock':   { border: 'border-red-500/40',    icon: 'text-red-400',     chip: 'text-red-400 bg-red-400/10',         num: 'from-red-400 to-red-600' },
    'Low Stock':      { border: 'border-red-500/30',    icon: 'text-red-400',     chip: 'text-red-400 bg-red-400/10',         num: 'from-red-400 to-red-600' },
    'Near threshold': { border: 'border-amber-500/30',  icon: 'text-amber-400',   chip: 'text-amber-400 bg-amber-400/10',     num: 'from-amber-300 to-amber-500' },
    'Healthy':        { border: 'border-white/5',       icon: 'text-amber-400/80', chip: 'text-emerald-400 bg-emerald-400/10', num: 'from-white to-gray-400' },
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white/90 tracking-tight">Inventory Intelligence</h1>
          <p className="text-gray-500 text-sm mt-1">Real-time stock tracking and predictive reorder limits.</p>
        </div>
        <div className="flex flex-col items-end gap-3">
            <div className="bg-[#111113] border border-white/5 px-4 py-2 rounded-lg flex items-center gap-3 w-fit">
              <Database size={18} className="text-amber-400" />
              <span className="text-sm font-medium text-gray-300">{inventory.length} Distinct Items</span>
            </div>
            <div className="relative w-full max-w-xs">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input 
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search stock..."
                    className="w-full bg-[#111113] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                />
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-gray-500 bg-[#111113] border border-white/5 rounded-xl">
            Loading…
          </div>
        ) : filteredInventory.length > 0 ? filteredInventory.map((item) => {
          const status = item.status || 'Healthy';
          const tone = TONE[status] || TONE.Healthy;
          const alert = status !== 'Healthy';
          const qty = item.totalQuantity ?? item.quantity ?? 0;
          const isEditing = editingId === item.id;
          return (
          <div key={item.id || item.itemName} className={`bg-[#111113] border rounded-xl p-5 transition-colors group relative overflow-hidden ${tone.border} hover:bg-white/[0.02]`}>
            {alert && <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-bl-full pointer-events-none"></div>}

            <div className={`w-10 h-10 rounded flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${alert ? 'bg-red-500/10' : 'bg-white/5'}`}>
              <Package size={20} className={tone.icon} />
            </div>

            <h3 className="text-lg font-medium text-white mb-1">{item.itemName}</h3>
            {Number(item.stock_value) > 0 && (
              <p className="text-xs text-gray-500">Stock value ₹{Number(item.stock_value).toLocaleString('en-IN')}</p>
            )}

            <div className="flex justify-between items-end mt-4">
                <div className="flex items-end gap-1.5">
                  <span className={`text-3xl font-bold bg-gradient-to-br bg-clip-text text-transparent ${tone.num}`}>
                    {qty}
                  </span>
                  <span className="text-sm text-gray-500 mb-1">{item.uom || 'units'}</span>
                </div>

                <div className="flex flex-col items-end">
                  {/* Click the reorder level to set it — this is what turns the
                      badge from decoration into a real signal. */}
                  {isEditing ? (
                    <input
                      autoFocus type="number" min="0" value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onBlur={() => saveReorder(item)}
                      onKeyDown={e => { if (e.key === 'Enter') saveReorder(item); if (e.key === 'Escape') setEditingId(null); }}
                      className="w-20 mb-1 bg-black/40 border border-amber-500/40 rounded px-1.5 py-0.5 text-xs text-white text-right focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingId(item.id); setDraft(String(item.reorderLevel ?? 0)); }}
                      title="Click to set the reorder level"
                      className="text-[10px] text-gray-500 hover:text-amber-400 uppercase tracking-wider mb-0.5 underline decoration-dotted underline-offset-2"
                    >
                      Reorder: {Number(item.reorderLevel) > 0 ? Number(item.reorderLevel) : 'not set'}
                    </button>
                  )}
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${tone.chip}`}>
                    {alert ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                    {status}
                  </div>
                </div>
            </div>
          </div>
        )}) : (
          <div className="col-span-full py-12 text-center text-gray-500 bg-[#111113] border border-white/5 rounded-xl">
            {inventory.length === 0 ? 'No inventory items yet.' : 'No items match your search.'}
          </div>
        )}
      </div>
    </div>
  );
};

export default Inventory;
