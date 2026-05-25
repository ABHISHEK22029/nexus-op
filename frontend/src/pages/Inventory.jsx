import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Database, Package, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

const Inventory = () => {
  const { activeProject } = useProject();
  const [inventory, setInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!activeProject) return;
    axios.get(`http://localhost:5000/inventory?projectId=${activeProject.id}`)
      .then(res => setInventory(res.data))
      .catch(err => console.error("Failed to fetch inventory", err));
  }, [activeProject]);

  const filteredInventory = inventory.filter(item => item.itemName.toLowerCase().includes(searchTerm.toLowerCase()));

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
        {filteredInventory.length > 0 ? filteredInventory.map((item) => {
          const isLowStock = item.status === 'Near threshold';
          return (
          <div key={item.itemName} className={`bg-[#111113] border rounded-xl p-5 transition-colors group relative overflow-hidden \${isLowStock ? 'border-red-500/30 hover:border-red-500/50 hover:bg-red-500/[0.02]' : 'border-white/5 hover:border-amber-500/30 hover:bg-amber-500/[0.02]'}`}>
            {isLowStock && <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-bl-full pointer-events-none"></div>}
            
            <div className={`w-10 h-10 rounded flex items-center justify-center mb-4 group-hover:scale-110 transition-transform \${isLowStock ? 'bg-red-500/10' : 'bg-white/5'}`}>
              <Package size={20} className={isLowStock ? 'text-red-400' : 'text-amber-400/80'} />
            </div>
            
            <h3 className="text-lg font-medium text-white mb-1">{item.itemName}</h3>
            
            <div className="flex justify-between items-end mt-4">
                <div className="flex items-end gap-1.5">
                  <span className={`text-3xl font-bold bg-gradient-to-br bg-clip-text text-transparent \${isLowStock ? 'from-red-400 to-red-600' : 'from-white to-gray-400'}`}>
                    {item.totalQuantity || item.quantity || 0}
                  </span>
                  <span className="text-sm text-gray-500 mb-1">units</span>
                </div>
                
                {isLowStock ? (
                   <div className="flex flex-col items-end">
                       <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Reorder: {item.reorderLevel}</span>
                       <div className="flex items-center gap-1 text-red-400 bg-red-400/10 px-2 py-0.5 rounded text-xs font-medium">
                           <AlertTriangle size={12} />
                           Low Stock
                       </div>
                   </div>
                ) : (
                   <div className="flex flex-col items-end">
                       <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Reorder: {item.reorderLevel}</span>
                       <div className="flex items-center gap-1 text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-xs font-medium">
                           <CheckCircle2 size={12} />
                           Healthy
                       </div>
                   </div>
                )}
            </div>
          </div>
        )}) : (
          <div className="col-span-full py-12 text-center text-gray-500 bg-[#111113] border border-white/5 rounded-xl">
            No items in inventory. Receive a PO to add stock.
          </div>
        )}
      </div>
    </div>
  );
};

export default Inventory;
