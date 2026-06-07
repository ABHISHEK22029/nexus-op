import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Briefcase, Plus } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

const WorkOrders = () => {
  const { activeProject, workOrders } = useProject();
  const [vendors, setVendors] = useState([]);
  const [boqs, setBoqs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
     vendorId: '', name: '', boqId: '', startDate: '', endDate: '', contractValue: ''
  });

  useEffect(() => {
    if (!activeProject) return;
    axios.get(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/vendors?projectId=${activeProject.id}`).then(res => setVendors(res.data));
    axios.get(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/boq?projectId=${activeProject.id}`).then(res => setBoqs(res.data));
  }, [activeProject]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activeProject) return;
    try {
      await axios.post('${import.meta.env.VITE_API_URL || "http://localhost:5000"}/work-orders', { ...formData, projectId: activeProject.id });
      // Minor manual refresh hack by toggling activeProject or we simply reload the whole page to fetch Context wrapper again cleanly
      window.location.reload(); 
    } catch (err) {
      alert("Error allocating Work Order");
    }
  };

  if(!activeProject) return <div className="p-8 text-white">Loading context...</div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Briefcase className="text-amber-400" />
            Execution Work Orders
          </h1>
          <p className="text-gray-500 mt-1">Bind Vendors and BOQ allocations strictly under <strong className="text-gray-300">{activeProject.name}</strong>.</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus size={16} /> Assign Order
        </button>
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

      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden mt-8">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 bg-black/40 uppercase">
            <tr>
              <th className="px-6 py-4 font-medium">Order ID</th>
              <th className="px-6 py-4 font-medium">Directive</th>
              <th className="px-6 py-4 font-medium">Vendor Target</th>
              <th className="px-6 py-4 font-medium">Value Envelope</th>
              <th className="px-6 py-4 font-medium">Progress Control</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {workOrders.map((w) => (
              <tr key={w.id} className="hover:bg-white/[0.02] transition-colors text-gray-300">
                <td className="px-6 py-4 font-bold text-amber-400">WO-{w.id.toString().padStart(4, '0')}</td>
                <td className="px-6 py-4 font-medium text-white">{w.name}</td>
                <td className="px-6 py-4">{w.vendorName}</td>
                <td className="px-6 py-4 font-mono text-gray-400">₹{parseFloat(w.contractValue)?.toLocaleString() || 'N/A'}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs ${w.status === 'In Progress' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>{w.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WorkOrders;
