import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Plus, Sparkles, UploadCloud, Search, FileUp, Star, ExternalLink } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

const Vendors = () => {
  const navigate = useNavigate();
  const { activeProject } = useProject();
  const [vendors, setVendors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', type: '' });
  const [aiLoading, setAiLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchVendors = () => {
    if (!activeProject) return;
    axios.get(`${API}/vendors?projectId=${activeProject.id}`)
      .then(res => setVendors(res.data))
      .catch(err => console.error("Failed to fetch vendors", err));
  };

  useEffect(() => {
    fetchVendors();
  }, [activeProject]);

  const handleFakePdfUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setAiLoading(true);
    // Simulate AI extraction delay
    setTimeout(() => {
       setFormData({ ...formData, name: 'ABC Infra Pvt Ltd', type: 'Construction' });
       setAiLoading(false);
       e.target.value = null; // reset
    }, 2000);
  };

  const addVendor = (e) => {
    e.preventDefault();
    axios.post('${import.meta.env.VITE_API_URL || "http://localhost:8080/api"}/vendors', formData)
      .then(() => {
        setFormData({ name: '', type: '' });
        setShowForm(false);
        fetchVendors();
      })
      .catch(err => console.error(err));
  };

  const handleBulkUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkLoading(true);
    setTimeout(() => {
      axios.post('${import.meta.env.VITE_API_URL || "http://localhost:8080/api"}/vendors/bulk')
        .then(() => fetchVendors())
        .finally(() => setBulkLoading(false));
      e.target.value = null;
    }, 1500);
  };

  const filteredVendors = vendors.filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white/90 tracking-tight">Vendors</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your supplier network and performance ratings.</p>
        </div>
        <div className="flex flex-col items-end gap-3">
            <div className="flex gap-3">
                <div className="relative group overflow-hidden bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors">
                    <input type="file" accept=".xls,.xlsx,.csv" onChange={handleBulkUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                    <button className="px-4 py-2 text-sm font-medium flex items-center gap-2 text-gray-300 pointer-events-none">
                        {bulkLoading ? <Sparkles size={16} className="animate-spin-slow text-indigo-400" /> : <FileUp size={16} />}
                        Bulk Excel Import
                    </button>
                    {bulkLoading && <div className="absolute bottom-0 left-0 h-1 bg-indigo-500 animate-pulse w-full"></div>}
                </div>
                <button
                  onClick={() => setShowForm(!showForm)}
                  className="btn-primary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => navigate('/vendors/new')}
                >
                  <Plus size={16} /> Add Vendor
                </button>
            </div>
            <div className="relative w-full max-w-xs">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input 
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search vendors..."
                    className="w-full bg-[#111113] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                />
            </div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={addVendor} className="bg-[#111113] border border-white/5 p-6 rounded-xl mb-8 animate-in slide-in-from-top-4 fade-in duration-300">
          <h2 className="text-lg font-medium mb-4">New Vendor</h2>

          <div className="mb-6 relative overflow-hidden rounded-lg border border-dashed border-indigo-500/30 bg-indigo-500/5 p-6 text-center group hover:bg-indigo-500/10 transition-colors">
              {aiLoading ? (
                  <div className="flex flex-col items-center justify-center animate-pulse">
                      <Sparkles size={24} className="text-indigo-400 mb-2 animate-spin-slow" />
                      <p className="text-sm font-medium text-indigo-300">Extracting entity data with AI...</p>
                  </div>
              ) : (
                  <>
                      <input type="file" accept=".pdf" onChange={handleFakePdfUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <UploadCloud size={24} className="text-indigo-400 mx-auto mb-2 group-hover:-translate-y-1 transition-transform" />
                      <p className="text-sm font-medium text-indigo-300 mb-1">Smart PDF Import</p>
                      <p className="text-xs text-indigo-400/60">Drop vendor onboarding document to auto-fill</p>
                  </>
              )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Company Name</label>
              <input 
                required
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-[#1A1A1E] border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Sector / Type</label>
              <select 
                required
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value})}
                className="w-full bg-[#1A1A1E] border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none"
              >
                <option value="" disabled>Select a type...</option>
                <option value="Material Supply">Material Supply</option>
                <option value="Logistics">Logistics</option>
                <option value="Software">Software</option>
                <option value="Construction">Construction</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Save Vendor
            </button>
          </div>
        </form>
      )}

      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor Name</th>
              <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Sector / Type</th>
              <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Performance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredVendors.length > 0 ? filteredVendors.map((vendor) => (
              <tr key={vendor.id}
                className="table-row-animate group cursor-pointer"
                onClick={() => navigate(`/vendors/${vendor.id}/edit`)}
              >
                <td className="px-6 py-4 text-sm text-gray-500">#{vendor.id}</td>
                <td className="px-6 py-4 text-sm font-medium text-white group-hover:text-blue-400 transition-colors">{vendor.name}</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 text-gray-300 border border-white/10">
                    {vendor.type}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5">
                      <Star size={14} className={vendor.performanceScore > 90 ? 'text-amber-400 fill-amber-400' : 'text-gray-500'} />
                      <span className={`text-sm font-medium ${vendor.performanceScore > 90 ? 'text-amber-400' : 'text-gray-400'}`}>
                          {vendor.performanceScore}%
                      </span>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="3" className="px-6 py-8 text-center text-gray-500">No vendors found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Vendors;
