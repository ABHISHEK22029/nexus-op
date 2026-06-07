import React, { useState, useEffect } from 'react';
import { Flag, Activity, CheckCircle2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

const Milestones = () => {
  const { activeProject, workOrders } = useProject();
  const [milestones, setMilestones] = useState([]);

  useEffect(() => {
    fetch('${import.meta.env.VITE_API_URL || "http://localhost:5000"}/milestones')
      .then(res => res.json())
      .then(data => setMilestones(data))
      .catch(err => console.error(err));
  }, []);

  // Map milestones to active project's work orders
  const activeWorkOrderIds = workOrders.map(w => w.id);
  const activeMilestones = milestones.filter(m => activeWorkOrderIds.includes(m.workOrderId));

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Flag className="text-emerald-400" />
          Execution Milestones
        </h1>
        <p className="text-gray-500 mt-1">Track granular planned vs actual progress against operational Work Orders.</p>
      </div>

      <div className="grid gap-6">
        {workOrders.map(wo => {
           const woMilestones = activeMilestones.filter(m => m.workOrderId === wo.id);
           if(woMilestones.length === 0) return null;
           return (
             <div key={wo.id} className="bg-[#111113] border border-white/5 rounded-xl p-6">
               <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                  <Activity className="text-blue-400" size={20} />
                  {wo.name} <span className="text-xs text-gray-500 ml-2">(WO-{wo.id})</span>
               </h2>
               <div className="space-y-6">
                 {woMilestones.map(m => (
                    <div key={m.id} className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium text-gray-300 flex items-center gap-2">
                           {m.status === 'Completed' && <CheckCircle2 size={14} className="text-emerald-500" />}
                           {m.name}
                        </span>
                        <div className="flex gap-4">
                           <span className="text-blue-400">Planned: {m.plannedPercent}%</span>
                           <span className={m.actualPercent >= m.plannedPercent ? 'text-emerald-400' : 'text-red-400'}>
                             Actual: {m.actualPercent}%
                           </span>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden relative">
                         {/* Planned Background Bar */}
                         <div className="absolute top-0 left-0 h-full bg-blue-500/20" style={{ width: `${m.plannedPercent}%`}}></div>
                         {/* Actual Fill Bar */}
                         <div className={`absolute top-0 left-0 h-full ${m.actualPercent >= m.plannedPercent ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${m.actualPercent}%`}}></div>
                      </div>
                    </div>
                 ))}
               </div>
             </div>
           )
        })}
      </div>
    </div>
  );
};

export default Milestones;
