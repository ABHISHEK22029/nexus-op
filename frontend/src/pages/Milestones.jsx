/* ══════════════════════════════════════════════════════════
   Execution Milestones.

   This fetched EVERY milestone and filtered to the active project in the
   browser — which worked only because the server was returning every
   tenant's milestones too. Both halves are fixed: the endpoint is now scoped
   through the work order's owner, and the project filter is applied
   server-side so the browser is never sent rows it is going to discard.
   ══════════════════════════════════════════════════════════ */
import React, { useEffect } from 'react';
import { Flag, Activity, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';

const Milestones = () => {
  const { activeProject, workOrders } = useProject();
  const { can } = usePermissions();

  const q = useListQuery('milestones', {
    pageSize: 50,
    initialFilters: activeProject ? { project_id: String(activeProject.id) } : {},
  });

  useEffect(() => {
    q.setFilters(activeProject ? { project_id: String(activeProject.id) } : {});
  }, [activeProject?.id]);

  const activeMilestones = q.rows;
  const s = q.summary || {};

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Flag className="text-emerald-400" />
          Execution Milestones
        </h1>
        <p className="text-gray-500 mt-1">Track granular planned vs actual progress against operational Work Orders.</p>
      </div>

      {/* Planned and actual side by side rather than one "variance" figure —
          a single number hides whether four milestones are slightly late or
          one is badly late. behind_plan is the count that needs someone. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label={q.isFiltered ? 'Milestones (filtered)' : 'Milestones'} value={s.count ?? q.total} />
        <Kpi label="Completed" value={s.completed ?? 0} tone="text-emerald-400" />
        <Kpi label="Behind plan" value={s.behind_plan ?? 0}
          tone={Number(s.behind_plan) > 0 ? 'text-red-400' : 'text-gray-400'}
          icon={Number(s.behind_plan) > 0 ? AlertTriangle : null} />
        <Kpi label="Planned vs actual"
          value={`${Number(s.avg_planned_pct || 0).toFixed(0)}% / ${Number(s.avg_actual_pct || 0).toFixed(0)}%`} />
      </div>

      <ListToolbar
        q={q}
        placeholder="Search milestone, work order or project…"
        filters={[{
          key: 'status',
          label: 'Status',
          options: [
            { value: 'Pending', label: 'Pending' },
            { value: 'In Progress', label: 'In progress' },
            { value: 'Delayed', label: 'Delayed' },
            { value: 'Completed', label: 'Completed' },
          ],
        }]}
      />

      <div className="grid gap-6">
        {activeMilestones.length === 0 ? (
          <div className="border border-white/5 bg-[#111113] rounded-xl">
            <EmptyState q={q} icon={Flag} noun="milestones"
              hint="Milestones appear here once they are added to a work order." />
          </div>
        ) : workOrders.map(wo => {
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

      <Pagination q={q} />
    </div>
  );
};

const Kpi = ({ label, value, tone = 'text-white', icon: Icon }) => (
  <div className="bg-[#111113] border border-white/5 rounded-xl p-4">
    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
      {Icon && <Icon size={12} />} {label}
    </div>
    <div className={`text-2xl font-bold mt-1 tabular-nums ${tone}`}>{value}</div>
  </div>
);

export default Milestones;
