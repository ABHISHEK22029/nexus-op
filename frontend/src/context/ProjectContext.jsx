/* ══════════════════════════════════════════════════════════
   ProjectContext — which slice of the business you are looking at.

   "Project" came from the construction side of this product, where it is the
   contract you won and everything genuinely hangs off it: a BOQ, a
   measurement book, milestones, running-account bills.

   It does not belong on the fabrication side. A workshop selling brackets to
   a customer has an ORDER, not a project. Being forced to pick one before
   anything worked was the single biggest reason the product felt unreliable:
   eighteen screens went blank when the wrong project was selected, and the
   dashboard refused outright without one. Nothing was broken — you were
   looking at an empty project and had no way to tell.

   So the default is now ALL WORK: no project, everything the business has.
   A project becomes an optional lens for businesses that run long contracts,
   and the picker hides itself entirely for the ones that don't.

   activeProject === null means "all work". That is a real state, not a
   not-loaded-yet state — `ready` tells you which.
   ══════════════════════════════════════════════════════════ */
import React, { createContext, useContext, useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const ProjectContext = createContext();

const STORAGE_KEY = 'nexus_active_project';
const ALL_WORK = 'all';

export const ProjectProvider = ({ children }) => {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProjectState] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  /* Screens need to distinguish "all work" from "still finding out". Without
     this they fire their first fetch before the choice is restored, and a
     remembered project appears to be ignored for one render. */
  const [ready, setReady] = useState(false);

  /* Remember the choice — including the choice of All work, which is why
     this stores a sentinel rather than clearing the key. Clearing it would
     make "All work" indistinguishable from "never chose", and the next
     reload would restore a project the user had deliberately stepped out of. */
  const setActiveProject = (p) => {
    setActiveProjectState(p || null);
    try {
      localStorage.setItem(STORAGE_KEY, p?.id ? String(p.id) : ALL_WORK);
    } catch { /* private mode — losing the preference is survivable */ }
  };

  const fetchProjects = () => {
    // Skip before login — /projects requires auth; a pre-login call would 401.
    if (!localStorage.getItem('nexus_token')) { setReady(true); return; }
    fetch(`${API}/projects`)
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.items || []);
        setProjects(list);

        let stored = null;
        try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }

        /* Only a stored project id moves us off All work, and only if that
           project still exists — the id may belong to another account or to
           something since deleted. Anything else, including no preference at
           all, means All work. A new user should never land inside one
           arbitrary project wondering where their data went. */
        const remembered = stored && stored !== ALL_WORK
          ? list.find(p => String(p.id) === stored) || null
          : null;

        setActiveProjectState(remembered);
        setReady(true);
      })
      .catch(err => { console.error(err); setReady(true); });
  };

  useEffect(() => { fetchProjects(); }, []);

  useEffect(() => {
    if (activeProject) {
      fetch(`${API}/work-orders?projectId=${activeProject.id}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => setWorkOrders(Array.isArray(data) ? data : (data?.items || [])))
        .catch(() => setWorkOrders([]));
    } else {
      setWorkOrders([]);
    }
  }, [activeProject]);

  const getEnabledModules = () => {
    if (!activeProject) return [];
    if (activeProject.type === 'construction') {
      return ['BOQ', 'Indent', 'Measurement Book', 'Milestones', 'Chainage'];
    }
    return [];
  };

  /* The query fragment every screen should use, so none of them has to
     decide what "all work" means on its own. Returns '' for all work, so
     `${API}/production${projectQuery()}` composes cleanly. */
  const projectQuery = (prefix = '?') =>
    activeProject?.id ? `${prefix}projectId=${activeProject.id}` : '';

  return (
    <ProjectContext.Provider value={{
      projects, activeProject, setActiveProject, workOrders, fetchProjects,
      enabledModules: getEnabledModules(),
      ready,
      /* True when this business runs projects at all. The picker hides itself
         when it is false — an empty dropdown labelled "Context" is worse than
         no dropdown. */
      usesProjects: projects.length > 0,
      allWork: !activeProject,
      projectQuery,
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => useContext(ProjectContext);
