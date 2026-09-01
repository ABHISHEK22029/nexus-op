/* ══════════════════════════════════════════════════════════
   Projects — searchable, filterable, paginated.

   The list is owned by useListQuery rather than by ProjectContext. The
   context still holds the *active* project for the rest of the app, so
   creating or deleting one refreshes both: q.reload() for this table and
   fetchProjects() for the global project switcher in the header.

   Filtered on `type`, not `status`. Every project in the database is
   'Active' — createProject hardcodes it and nothing ever writes another
   value — so a status chip would filter nothing while looking like it did.
   `type` is the dimension that actually varies, and it decides which
   modules a project gets (see ProjectContext.getEnabledModules).
   ══════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import axios from 'axios';
import { FolderGit2, Plus, Trash2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const Projects = () => {
  const { fetchProjects, setActiveProject } = useProject();
  const toast = useToast();
  const { can } = usePermissions();
  const q = useListQuery('projects', { pageSize: 25 });
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '', clientName: '', type: 'construction', startDate: '', endDate: ''
  });

  const canWrite = can('projects', 'write');
  const canDelete = can('projects', 'delete');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.clientName.trim()) {
      toast.error('Project Name and Client Authority are required.');
      return;
    }
    try {
      await axios.post(`${API}/projects`, formData);
      setShowForm(false);
      setFormData({ name: '', clientName: '', type: 'construction', startDate: '', endDate: '' });
      q.reload();      // this table
      fetchProjects(); // the global project switcher
      toast.success('Project created successfully.');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm('Delete this project?')) return;
    try {
      await axios.delete(`${API}/projects/${p.id}`);
      q.reload();
      fetchProjects();
      toast.success('Project deleted.');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Something went wrong');
    }
  };

  const jumpToProject = (proj) => {
      setActiveProject(proj);
      toast.success(`Switched Global Context to ${proj.name}`);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FolderGit2 className="text-indigo-400" />
            Project Horizons
          </h1>
          <p className="text-gray-500 mt-1">Create and manage top-level Enterprise contexts.</p>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} /> New Project
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-[#111113] border border-white/5 rounded-xl p-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Project Code Name</label>
              <input required type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Client Authority</label>
              <input required type="text" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white" value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Architecture Type</label>
              <select className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                <option value="construction">Civil Construction</option>
                <option value="generic">Generic SCM</option>
              </select>
            </div>
            <div>
               {/* Spacer */}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
              <input required type="date" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Expected End Date</label>
              <input required type="date" className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
            </div>

            <div className="col-span-full pt-4">
              <button type="submit" className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                Initialize Setup
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-8">
        <ListToolbar
          q={q}
          placeholder="Search project name, client, type…"
          filters={[{
            key: 'type',
            label: 'Type',
            /* The three values that exist in the data. The create form offers
               the first two; 'fabrication' predates it. */
            options: [
              { value: 'construction', label: 'Construction' },
              { value: 'generic', label: 'Generic SCM' },
              { value: 'fabrication', label: 'Fabrication' },
            ],
          }]}
        />
      </div>

      <div className="bg-[#111113] border border-white/5 rounded-xl overflow-hidden">
        {q.rows.length === 0 ? (
          <EmptyState q={q} icon={FolderGit2} noun="projects"
            hint="Create one to give the rest of the product a context to work in." />
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-400 bg-black/40 uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Context ID</th>
                <th className="px-6 py-4 font-medium">Project Name</th>
                <th className="px-6 py-4 font-medium">Client</th>
                <th className="px-6 py-4 font-medium">Timeline</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {q.rows.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.02] transition-colors text-gray-300">
                  <td className="px-6 py-4 font-medium text-indigo-400">PRJ-{p.id.toString().padStart(4, '0')}</td>
                  <td className="px-6 py-4 font-medium text-white">{p.name}</td>
                  <td className="px-6 py-4">{p.clientName}</td>
                  <td className="px-6 py-4 text-gray-500">{p.startDate} to {p.endDate}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400">{p.status}</span>
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex items-center gap-3">
                       <button onClick={() => jumpToProject(p)} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Jump &rarr;</button>
                       {/* Hidden when the API would refuse it anyway. */}
                       {canDelete && (
                         <button onClick={() => handleDelete(p)} title="Delete project" className="text-gray-500 hover:text-red-400 transition-colors">
                           <Trash2 size={15} />
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

export default Projects;
